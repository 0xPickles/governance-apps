import { encodeFunctionData, parseAbi } from "viem";
import {
  actionEventId,
  actionPrincipal,
  actionUsesYfiUsdPrice,
  isSuppressedCatalogueAction,
  validateDomainActions,
} from "./actions";
import {
  resolveAlertAccountBlockContext,
  resolveAlertEnsNamesAtBlock,
} from "./account-block-context";
import { renderAlertCatalogueAction } from "./catalogue-renderer";
import { renderProductAlertAction } from "./product-renderer";
import {
  isProductAlertAction,
  productAlertAddresses,
  type AlertAction,
  type ProductAlertAction,
} from "./product-types";
import {
  LIQUID_LOCKERS,
  LIQUID_LOCKER_REDEMPTION,
  YFI,
} from "./contracts";
import type { ActiveAlertDomainId } from "./domain-registry";
import type {
  AlertCoveFacilityEvidence,
  AlertEventBlockPriceEvidence,
} from "./evidence";
import {
  createChainlinkYfiUsdPriceSource,
  type AlertEventBlockPriceSource,
} from "./event-block-chainlink-price";
import {
  ALERT_RPC_MAX_BATCH_SIZE,
  type RpcBlock,
  type RpcCallRequest,
  type RpcClient,
} from "./rpc";
import type { NormalizedAction } from "./types";

const BALANCE_OF_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
] as const);
const COVE_YFI = LIQUID_LOCKERS.find((locker) => locker.symbol === "coveYFI");
if (COVE_YFI === undefined) throw new Error("alert_cove_contract_missing");
const COVE_YFI_TOKEN = COVE_YFI.token;

export interface RenderedAlertMessage {
  readonly eventId: string;
  readonly blockNumber: number;
  readonly html: string;
}

function exactBlockReference(block: RpcBlock) {
  if (!/^0x[0-9a-f]{64}$/.test(block.hash)) {
    throw new Error("alert_block_hash_invalid");
  }
  return { blockHash: block.hash, requireCanonical: true as const };
}

async function readAtBlock(
  rpc: RpcClient,
  block: RpcBlock,
  requests: readonly RpcCallRequest[],
): Promise<readonly string[]> {
  const values: string[] = [];
  for (let offset = 0; offset < requests.length; offset += ALERT_RPC_MAX_BATCH_SIZE) {
    const batch = requests.slice(offset, offset + ALERT_RPC_MAX_BATCH_SIZE);
    const result = await rpc.call(batch, exactBlockReference(block));
    values.push(...result);
  }
  return Object.freeze(values);
}

function unavailablePrice(block: RpcBlock): AlertEventBlockPriceEvidence {
  return Object.freeze({
    kind: "unavailable",
    blockNumber: block.number,
    blockHash: block.hash,
    reason: "not_found",
  });
}

async function priceAtBlock(
  source: AlertEventBlockPriceSource,
  block: RpcBlock,
): Promise<AlertEventBlockPriceEvidence> {
  if (block.timestamp === null) return unavailablePrice(block);
  try {
    return await source.readYfiUsdPrice({
      blockNumber: block.number,
      blockHash: block.hash as `0x${string}`,
      timestamp: block.timestamp,
    });
  } catch {
    console.warn(JSON.stringify({ event: "alert_price_unavailable", block: block.number }));
    return unavailablePrice(block);
  }
}

function balanceOf(token: `0x${string}`): RpcCallRequest {
  return {
    to: token.toLowerCase(),
    data: encodeFunctionData({
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [LIQUID_LOCKER_REDEMPTION],
    }),
  };
}

function decodeWord(value: string): bigint {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("alert_exact_word_invalid");
  }
  return BigInt(value);
}

async function coveFacilityAtBlock(
  rpc: RpcClient,
  block: RpcBlock,
): Promise<AlertCoveFacilityEvidence> {
  const values = await readAtBlock(
    rpc,
    block,
    [balanceOf(YFI), balanceOf(COVE_YFI_TOKEN)],
  );
  if (values.length !== 2) throw new Error("alert_cove_context_invalid");
  return Object.freeze({
    kind: "available",
    blockNumber: block.number,
    blockHash: block.hash,
    yfiBalance: decodeWord(values[0]!),
    coveYfiBalance: decodeWord(values[1]!),
  });
}

async function optionalCoveFacilityAtBlock(
  rpc: RpcClient,
  block: RpcBlock,
): Promise<AlertCoveFacilityEvidence> {
  try {
    return await coveFacilityAtBlock(rpc, block);
  } catch {
    console.warn(JSON.stringify({
      event: "alert_cove_context_unavailable",
      block: block.number,
    }));
    return Object.freeze({
      kind: "unavailable",
      blockNumber: block.number,
      blockHash: block.hash,
    });
  }
}

function groupsByBlock(
  actions: readonly AlertAction[],
): readonly (readonly AlertAction[])[] {
  const groups: AlertAction[][] = [];
  for (const action of actions) {
    const previous = groups.at(-1);
    if (previous?.[0]?.blockNumber === action.blockNumber) {
      previous.push(action);
    } else {
      groups.push([action]);
    }
  }
  return groups;
}

export async function renderCatalogueMessages(params: {
  readonly domainId: ActiveAlertDomainId;
  readonly actions: readonly AlertAction[];
  readonly rpc: RpcClient;
}): Promise<readonly RenderedAlertMessage[]> {
  const visible = params.actions.filter((action) => !isSuppressedCatalogueAction(action));
  validateDomainActions(params.domainId, visible);
  const output: RenderedAlertMessage[] = [];
  const priceSource = createChainlinkYfiUsdPriceSource(params.rpc);

  for (const actions of groupsByBlock(visible)) {
    const blockNumber = actions[0]!.blockNumber;
    const block = await params.rpc.getBlockByNumber(blockNumber);
    if (block.number !== blockNumber || block.timestamp === null) {
      throw new Error("alert_event_block_invalid");
    }
    const reader = Object.freeze({
      read: (requests: readonly RpcCallRequest[]) =>
        readAtBlock(params.rpc, block, requests),
    });
    if (actions.every(isProductAlertAction)) {
      const productActions = actions as readonly ProductAlertAction[];
      const ensNamesByAddress = await resolveAlertEnsNamesAtBlock({
        addresses: productAlertAddresses(productActions),
        block: { blockNumber: block.number, blockHash: block.hash },
        reader,
      });
      for (const action of actions) {
        output.push(Object.freeze({
          eventId: actionEventId(action),
          blockNumber,
          html: renderProductAlertAction(action, {
            kind: "resolved",
            blockNumber: block.number,
            blockHash: block.hash,
            seconds: block.timestamp,
          }, ensNamesByAddress),
        }));
      }
      continue;
    }
    if (actions.some(isProductAlertAction)) {
      throw new Error("alert_action_family_mixed");
    }
    const legacyActions = actions as readonly NormalizedAction[];
    const accountContext = await resolveAlertAccountBlockContext({
      domainId: params.domainId,
      actions: legacyActions,
      block: { blockNumber: block.number, blockHash: block.hash },
      reader,
    });
    const price = legacyActions.some(actionUsesYfiUsdPrice)
      ? await priceAtBlock(priceSource, block)
      : unavailablePrice(block);
    const coveFacility = legacyActions.some(
      (action) =>
        action.tokenSymbol === "coveYFI" &&
        (action.kind === "exchange" || action.kind === "redeem"),
    )
      ? await optionalCoveFacilityAtBlock(params.rpc, block)
      : null;

    for (const action of legacyActions) {
      const principal = actionPrincipal(action);
      if (
        ((action.kind === "redeem" || action.kind === "exchange") && principal === null) ||
        (action.kind === "update" &&
          action.amounts.previousLocktime !== undefined &&
          action.amounts.locktime !== undefined &&
          action.amounts.locktime < action.amounts.previousLocktime)
      ) {
        console.warn(JSON.stringify({
          event: "alert_action_anomaly",
          domain: params.domainId,
          block: action.blockNumber,
          kind:
            action.kind === "redeem" || action.kind === "exchange"
              ? "principal_unavailable"
              : "unlock_shortened",
        }));
      }
      const snapshot =
        principal === null
          ? null
          : (accountContext.snapshotsByPrincipal[principal] ?? null);
      if (principal !== null && snapshot === null) {
        throw new Error("alert_account_context_missing");
      }
      const html = renderAlertCatalogueAction({
        domainId: params.domainId,
        action,
        snapshot,
        eventTime: {
          kind: "resolved",
          blockNumber: block.number,
          blockHash: block.hash,
          seconds: block.timestamp,
        },
        price,
        positionUnavailable: principal === null,
        coveFacility:
          coveFacility !== null && action.tokenSymbol === "coveYFI"
            ? coveFacility
            : null,
        ensNamesByAddress: accountContext.ensNamesByAddress,
      });
      output.push(Object.freeze({
        eventId: actionEventId(action),
        blockNumber,
        html,
      }));
    }
  }
  return Object.freeze(output);
}
