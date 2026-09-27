import {
  decodeAbiParameters,
  decodeEventLog,
  type Address,
  type Hex,
} from "viem";

import {
  ERC20_TRANSFER_ABI,
  ERC20_TRANSFER_TOPIC,
  ZERO_ADDRESS,
  ERC4626_DEPOSIT_ABI,
  ERC4626_DEPOSIT_TOPIC,
  ERC4626_WITHDRAW_ABI,
  ERC4626_WITHDRAW_TOPIC,
  YETH_CLAIM_TOPIC,
  YETH_SET_CLAIM_TOPIC,
} from "../../abis";
import {
  YETH_CLAIM,
  YETH_CLAIM_DEPLOY_BLOCK,
  YETH_RECOVERY_VAULT,
  YETH_RECOVERY_VAULT_DEPLOY_BLOCK,
} from "../../contracts";
import type { RpcBlock, RpcClient, RpcLog } from "../../rpc";
import { isRpcRangeTooLargeError } from "../../rpc";
import type { NormalizedAction } from "../../types";
import {
  applyYethClaim,
  applyYethSetClaim,
  applyYethShareMintFromClaimStay,
  applyYethTransferLedger,
  assertYethAccountingInvariants,
  cloneYethState,
  normalizeYethAddress,
  replaceYethState,
  type YethState,
  type YethFlowSummary,
  type YethWithdrawalAttribution,
} from "./accounting";

export interface YethLogQueryPartition {
  readonly address: readonly Address[];
  readonly topics: readonly Hex[];
  readonly startBlock: number;
}

export const YETH_LOG_QUERY_PARTITIONS: readonly YethLogQueryPartition[] =
  Object.freeze([
    Object.freeze({
      address: Object.freeze([YETH_CLAIM]),
      topics: Object.freeze([YETH_SET_CLAIM_TOPIC, YETH_CLAIM_TOPIC]),
      startBlock: YETH_CLAIM_DEPLOY_BLOCK,
    }),
    Object.freeze({
      address: Object.freeze([YETH_RECOVERY_VAULT]),
      topics: Object.freeze([
        ERC4626_DEPOSIT_TOPIC,
        ERC4626_WITHDRAW_TOPIC,
        ERC20_TRANSFER_TOPIC,
      ]),
      startBlock: YETH_RECOVERY_VAULT_DEPLOY_BLOCK,
    }),
  ]);

type YethDecodedEvent =
  | {
      readonly kind: "set_claim";
      readonly account: Address;
      readonly amount: bigint;
      readonly log: RpcLog;
    }
  | {
      readonly kind: "claim";
      readonly account: Address;
      readonly amount: bigint;
      readonly underlying: bigint;
      readonly shares: bigint;
      readonly log: RpcLog;
    }
  | {
      readonly kind: "deposit";
      readonly sender: Address;
      readonly owner: Address;
      readonly assets: bigint;
      readonly shares: bigint;
      readonly log: RpcLog;
    }
  | {
      readonly kind: "withdraw";
      readonly sender: Address;
      readonly receiver: Address;
      readonly owner: Address;
      readonly assets: bigint;
      readonly shares: bigint;
      readonly log: RpcLog;
    }
  | {
      readonly kind: "transfer";
      readonly sender: Address;
      readonly receiver: Address;
      readonly value: bigint;
      readonly log: RpcLog;
    };

export type YethScanFailureCode =
  | "lookup_failed"
  | "decode_failed"
  | "attribution_failed"
  | "accounting_failed"
  | "range_too_large"
  | "budget_exhausted"
  | "elapsed_time";

export interface YethScanFailure {
  readonly code: YethScanFailureCode;
  readonly blockNumber: number;
  readonly blockHash: string | null;
  readonly txHash: string | null;
  readonly logIndex: number | null;
  readonly reason: string;
}

export interface YethIntentionalIgnore {
  readonly reason: "removed_log";
  readonly blockNumber: number;
  readonly txHash: string;
  readonly logIndex: number;
}

export interface YethScanResult {
  readonly state: YethState;
  readonly actions: readonly NormalizedAction[];
  readonly ignored: readonly YethIntentionalIgnore[];
  /** Unique blocks whose complete nonempty log evidence passed canonical validation. */
  readonly eventBlocksInspected: number;
  readonly flow: YethFlowSummary;
  readonly lastProcessedBlock: number;
  readonly failure: YethScanFailure | null;
}

export class YethScanBlockError extends Error {
  constructor(readonly failure: YethScanFailure) {
    super(`yeth_scan_${failure.code}:${failure.blockNumber}`);
    this.name = "YethScanBlockError";
  }
}

function decodeAddressTopic(topic: string): Address {
  const value = topic.toLowerCase().replace(/^0x/, "");
  if (
    value.length !== 64 ||
    !/^[0-9a-f]+$/.test(value) ||
    value.slice(0, 24) !== "0".repeat(24)
  ) {
    throw new Error("invalid_address_topic");
  }
  return `0x${value.slice(-40)}` as Address;
}

function requireYethPrincipal(address: Address, label: string): Address {
  if (normalizeYethAddress(address) === normalizeYethAddress(ZERO_ADDRESS)) {
    throw new Error(`${label}_zero_address`);
  }
  return address;
}

function eventTopics(topics: readonly string[]): [Hex, ...Hex[]] {
  if (topics.length === 0) {
    throw new Error("missing_topic0");
  }
  return topics as [Hex, ...Hex[]];
}

function assertCanonicalAddressTopics(
  topics: readonly string[],
  expectedCount: number,
  addressIndices: readonly number[],
): void {
  if (topics.length !== expectedCount) {
    throw new Error("invalid_event_topic_count");
  }
  for (const index of addressIndices) {
    decodeAddressTopic(topics[index]);
  }
}

function assertCanonicalDataWords(
  data: string,
  wordCount: number,
  addressWordIndex: number | null,
): void {
  const value = data.toLowerCase().replace(/^0x/, "");
  if (value.length !== wordCount * 64 || !/^[0-9a-f]*$/.test(value)) {
    throw new Error("invalid_event_data_length");
  }
  if (addressWordIndex !== null) {
    const word = value.slice(addressWordIndex * 64, (addressWordIndex + 1) * 64);
    if (word.slice(0, 24) !== "0".repeat(24)) {
      throw new Error("invalid_address_word_padding");
    }
  }
}

function decodeSetClaim(log: RpcLog): { account: Address; amount: bigint } {
  assertCanonicalAddressTopics(log.topics, 2, [1]);
  assertCanonicalDataWords(log.data, 1, null);
  const [amount] = decodeAbiParameters(
    [{ type: "uint256" }],
    log.data as Hex,
  ) as readonly [bigint];
  return {
    account: requireYethPrincipal(
      decodeAddressTopic(log.topics[1]),
      "set_claim_account",
    ),
    amount,
  };
}

function decodeClaim(log: RpcLog): {
  account: Address;
  amount: bigint;
  underlying: bigint;
  shares: bigint;
} {
  assertCanonicalAddressTopics(log.topics, 2, [1]);
  assertCanonicalDataWords(log.data, 3, null);
  const [amount, underlying, shares] = decodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    log.data as Hex,
  ) as readonly [bigint, bigint, bigint];
  return {
    account: requireYethPrincipal(
      decodeAddressTopic(log.topics[1]),
      "claim_account",
    ),
    amount,
    underlying,
    shares,
  };
}

function decodeYethLog(log: RpcLog): YethDecodedEvent {
  const address = normalizeYethAddress(log.address);
  const topic0 = log.topics[0]?.toLowerCase();
  if (topic0 === undefined) {
    throw new Error("missing_topic0");
  }

  if (
    address === normalizeYethAddress(YETH_CLAIM) &&
    topic0 === YETH_SET_CLAIM_TOPIC.toLowerCase()
  ) {
    return { kind: "set_claim", ...decodeSetClaim(log), log };
  }
  if (
    address === normalizeYethAddress(YETH_CLAIM) &&
    topic0 === YETH_CLAIM_TOPIC.toLowerCase()
  ) {
    return { kind: "claim", ...decodeClaim(log), log };
  }
  if (
    address === normalizeYethAddress(YETH_RECOVERY_VAULT) &&
    topic0 === ERC4626_DEPOSIT_TOPIC.toLowerCase()
  ) {
    assertCanonicalAddressTopics(log.topics, 3, [1, 2]);
    assertCanonicalDataWords(log.data, 2, null);
    const decoded = decodeEventLog({
      abi: ERC4626_DEPOSIT_ABI,
      topics: eventTopics(log.topics),
      data: log.data as Hex,
    });
    const args = decoded.args as {
      sender: Address;
      owner: Address;
      assets: bigint;
      shares: bigint;
    };
    return {
      kind: "deposit",
      ...args,
      sender: requireYethPrincipal(args.sender, "deposit_sender"),
      owner: requireYethPrincipal(args.owner, "deposit_owner"),
      log,
    };
  }
  if (
    address === normalizeYethAddress(YETH_RECOVERY_VAULT) &&
    topic0 === ERC4626_WITHDRAW_TOPIC.toLowerCase()
  ) {
    assertCanonicalAddressTopics(log.topics, 4, [1, 2, 3]);
    assertCanonicalDataWords(log.data, 2, null);
    const decoded = decodeEventLog({
      abi: ERC4626_WITHDRAW_ABI,
      topics: eventTopics(log.topics),
      data: log.data as Hex,
    });
    const args = decoded.args as {
      sender: Address;
      receiver: Address;
      owner: Address;
      assets: bigint;
      shares: bigint;
    };
    return {
      kind: "withdraw",
      ...args,
      sender: requireYethPrincipal(args.sender, "withdraw_sender"),
      receiver: requireYethPrincipal(args.receiver, "withdraw_receiver"),
      owner: requireYethPrincipal(args.owner, "withdraw_owner"),
      log,
    };
  }
  if (
    address === normalizeYethAddress(YETH_RECOVERY_VAULT) &&
    topic0 === ERC20_TRANSFER_TOPIC.toLowerCase()
  ) {
    assertCanonicalAddressTopics(log.topics, 3, [1, 2]);
    assertCanonicalDataWords(log.data, 1, null);
    const decoded = decodeEventLog({
      abi: ERC20_TRANSFER_ABI,
      topics: eventTopics(log.topics),
      data: log.data as Hex,
    });
    const args = decoded.args as {
      sender: Address;
      receiver: Address;
      value: bigint;
    };
    if (
      normalizeYethAddress(args.sender) === normalizeYethAddress(ZERO_ADDRESS) &&
      normalizeYethAddress(args.receiver) === normalizeYethAddress(ZERO_ADDRESS)
    ) {
      throw new Error("transfer_zero_to_zero");
    }
    return { kind: "transfer", ...args, log };
  }
  throw new Error("unknown_address_topic_pair");
}

function isKnownYethAddressTopicPair(log: RpcLog): boolean {
  const address = log.address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return false;
  }
  const topic0 = log.topics[0]?.toLowerCase();
  return (
    (address === normalizeYethAddress(YETH_CLAIM) &&
      (topic0 === YETH_SET_CLAIM_TOPIC.toLowerCase() ||
        topic0 === YETH_CLAIM_TOPIC.toLowerCase())) ||
    (address === normalizeYethAddress(YETH_RECOVERY_VAULT) &&
      (topic0 === ERC4626_DEPOSIT_TOPIC.toLowerCase() ||
        topic0 === ERC4626_WITHDRAW_TOPIC.toLowerCase() ||
        topic0 === ERC20_TRANSFER_TOPIC.toLowerCase()))
  );
}

function metadata(log: RpcLog): {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  source: Extract<NormalizedAction["source"], { readonly kind: "onchain" }>;
} {
  if (
    log.transactionHash === null ||
    log.blockNumber === null ||
    log.logIndex === null ||
    !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash) ||
    !Number.isSafeInteger(log.blockNumber) ||
    log.blockNumber < 0 ||
    !Number.isSafeInteger(log.logIndex) ||
    log.logIndex < 0
  ) {
    throw new Error("incomplete_log_metadata");
  }
  return {
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    source: {
      kind: "onchain",
      txHash: log.transactionHash,
      logIndex: log.logIndex,
    },
  };
}

function stateAmounts(state: YethState): NormalizedAction["amounts"] {
  return {
    yethTotalSnapshotDebtEth: state.totalSnapshotDebtEth,
    yethSnapshotExitedEth: state.snapshotExitedEth,
    yethSnapshotStayedEth: state.snapshotStayedEth,
    yethSnapshotUnclaimedEth: state.snapshotUnclaimedEth,
    yethOutstandingDebtEth: state.snapshotStayedEth + state.snapshotUnclaimedEth,
  };
}

function claimAction(
  event: Extract<YethDecodedEvent, { kind: "claim" }>,
  exit: boolean,
  state: YethState,
): NormalizedAction {
  return {
    kind: exit ? "yeth_claimed_exited" : "yeth_claimed_stayed",
    tokenSymbol: "yETH",
    user: event.account,
    principal: { kind: "proven", address: event.account },
    owner: event.account,
    receiver: event.account,
    amounts: {
      yethSnapshotAmount: event.amount,
      yethUnderlyingAmount: event.underlying,
      yethClaimShares: event.shares,
      ...stateAmounts(state),
    },
    ...metadata(event.log),
  };
}

function withdrawalAction(
  event: Extract<YethDecodedEvent, { kind: "withdraw" }>,
  attribution: YethWithdrawalAttribution,
  state: YethState,
): NormalizedAction {
  return {
    kind: "yeth_recovery_vault_withdraw",
    tokenSymbol: "yETH",
    user: attribution.owner,
    principal: { kind: "proven", address: attribution.owner },
    owner: event.owner,
    receiver: event.receiver,
    caller: event.sender,
    yethWithdrawalType: attribution.withdrawalType,
    amounts: {
      assets: event.assets,
      shares: event.shares,
      yethSnapshotMoved: attribution.snapshotMovedEth,
      yethSharesBurned: attribution.sharesBurned,
      yethOwnerSharesBefore: attribution.ownerSharesBefore,
      yethOwnerSharesAfter: attribution.ownerSharesAfter,
      ...stateAmounts(state),
    },
    ...metadata(event.log),
  };
}

function attributionKey(owner: string, shares: bigint): string {
  return `${normalizeYethAddress(owner)}:${shares.toString()}`;
}

function applyTransactionEvents(
  state: YethState,
  events: readonly YethDecodedEvent[],
): { readonly actions: NormalizedAction[]; readonly flow: YethFlowSummary } {
  const actions: NormalizedAction[] = [];
  let recoveryNetFlowEth = 0n;
  let yieldNetFlowEth = 0n;
  const deposits = events.filter(
    (event): event is Extract<YethDecodedEvent, { kind: "deposit" }> =>
      event.kind === "deposit",
  );
  const mints = events.filter(
    (event): event is Extract<YethDecodedEvent, { kind: "transfer" }> =>
      event.kind === "transfer" &&
      normalizeYethAddress(event.sender) === normalizeYethAddress(ZERO_ADDRESS),
  );
  const unmatchedMints = [...mints].sort(
    (left, right) => left.log.logIndex! - right.log.logIndex!,
  );
  for (const deposit of [...deposits].sort(
    (left, right) => left.log.logIndex! - right.log.logIndex!,
  )) {
    const mintIndex = unmatchedMints.findLastIndex(
      (mint) =>
        mint.log.logIndex! < deposit.log.logIndex! &&
        normalizeYethAddress(mint.receiver) ===
          normalizeYethAddress(deposit.owner) &&
        mint.value === deposit.shares,
    );
    if (mintIndex < 0) {
      throw new Error("deposit_mint_companion_mismatch");
    }
    unmatchedMints.splice(mintIndex, 1);
  }

  const withdrawals = events.filter(
    (event): event is Extract<YethDecodedEvent, { kind: "withdraw" }> =>
      event.kind === "withdraw",
  );
  const burns = events.filter(
    (event): event is Extract<YethDecodedEvent, { kind: "transfer" }> =>
      event.kind === "transfer" &&
      normalizeYethAddress(event.receiver) === normalizeYethAddress(ZERO_ADDRESS),
  );
  const burnsByAttribution = new Map<
    string,
    Array<Extract<YethDecodedEvent, { kind: "transfer" }>>
  >();
  for (const burn of burns) {
    const key = attributionKey(burn.sender, burn.value);
    const queue = burnsByAttribution.get(key) ?? [];
    queue.push(burn);
    burnsByAttribution.set(key, queue);
  }
  const withdrawalBurnLogIndices = new Set<number>();
  for (const withdrawal of withdrawals) {
    const key = attributionKey(withdrawal.owner, withdrawal.shares);
    const queue = burnsByAttribution.get(key) ?? [];
    const burn = queue.shift();
    if (burn === undefined || burn.log.logIndex === null) {
      throw new Error("withdraw_burn_companion_mismatch");
    }
    withdrawalBurnLogIndices.add(burn.log.logIndex);
    if (queue.length === 0) burnsByAttribution.delete(key);
  }
  for (const queue of burnsByAttribution.values()) {
    if (
      queue.some(
        (burn) =>
          normalizeYethAddress(burn.sender) !==
          normalizeYethAddress(YETH_RECOVERY_VAULT),
      )
    ) {
      throw new Error("unexpected_standalone_share_burn");
    }
  }

  const claims = events.filter(
    (event): event is Extract<YethDecodedEvent, { kind: "claim" }> =>
      event.kind === "claim",
  );
  for (const claim of claims) {
    const claimExit = claim.shares === 0n;
    const account = normalizeYethAddress(claim.account);
    const companionDeposits = events.filter(
      (event): event is Extract<YethDecodedEvent, { kind: "deposit" }> =>
        event.kind === "deposit" &&
        normalizeYethAddress(event.owner) === account,
    );
    const companionMints = events.filter(
      (event): event is Extract<YethDecodedEvent, { kind: "transfer" }> =>
        event.kind === "transfer" &&
        normalizeYethAddress(event.sender) === normalizeYethAddress(ZERO_ADDRESS) &&
        normalizeYethAddress(event.receiver) === account,
    );
    if (claimExit) {
      if (
        claim.shares !== 0n ||
        companionDeposits.length !== 0 ||
        companionMints.length !== 0
      ) {
        throw new Error("claim_exit_companion_mismatch");
      }
    } else {
      const deposit = companionDeposits[0];
      const mint = companionMints[0];
      if (
        claim.shares <= 0n ||
        companionDeposits.length !== 1 ||
        companionMints.length !== 1 ||
        deposit === undefined ||
        mint === undefined ||
        normalizeYethAddress(deposit.sender) !== normalizeYethAddress(YETH_CLAIM) ||
        deposit.assets !== claim.underlying ||
        deposit.shares !== claim.shares ||
        mint.value !== claim.shares ||
        mint.log.logIndex! >= deposit.log.logIndex! ||
        deposit.log.logIndex! >= claim.log.logIndex!
      ) {
        throw new Error("claim_stay_companion_mismatch");
      }
    }
  }
  const pendingWithdraws = new Map<
    string,
    Array<Extract<YethDecodedEvent, { kind: "withdraw" }>>
  >();
  const pendingAttributions = new Map<string, YethWithdrawalAttribution[]>();

  for (const event of events) {
    if (event.kind === "set_claim") {
      applyYethSetClaim(state, event.account, event.amount);
    } else if (event.kind === "claim") {
      const claimExit = event.shares === 0n;
      applyYethClaim(
        state,
        event.account,
        claimExit,
        event.amount,
      );
      if (!claimExit) {
        applyYethShareMintFromClaimStay(
          state,
          event.account,
          event.shares,
          event.amount,
        );
      }
      yieldNetFlowEth -= event.underlying;
      actions.push(claimAction(event, claimExit, state));
    } else if (event.kind === "deposit") {
      recoveryNetFlowEth += event.assets;
    } else if (event.kind === "withdraw") {
      recoveryNetFlowEth -= event.assets;
      const key = attributionKey(event.owner, event.shares);
      const attributions = pendingAttributions.get(key) ?? [];
      const attribution = attributions.shift();
      if (attributions.length === 0) {
        pendingAttributions.delete(key);
      }
      if (attribution === undefined) {
        const queue = pendingWithdraws.get(key) ?? [];
        queue.push(event);
        pendingWithdraws.set(key, queue);
      } else {
        actions.push(withdrawalAction(event, attribution, state));
      }
    } else {
      const attribution = applyYethTransferLedger(
        state,
        event.sender,
        event.receiver,
        event.value,
      );
      if (attribution === null) {
        continue;
      }
      if (!withdrawalBurnLogIndices.has(event.log.logIndex!)) {
        continue;
      }
      const key = attributionKey(attribution.owner, attribution.sharesBurned);
      const withdraws = pendingWithdraws.get(key) ?? [];
      const withdraw = withdraws.shift();
      if (withdraws.length === 0) {
        pendingWithdraws.delete(key);
      }
      if (withdraw === undefined) {
        const queue = pendingAttributions.get(key) ?? [];
        queue.push(attribution);
        pendingAttributions.set(key, queue);
      } else {
        actions.push(withdrawalAction(withdraw, attribution, state));
      }
    }
  }

  if (pendingWithdraws.size > 0 || pendingAttributions.size > 0) {
    throw new Error("withdraw_burn_attribution_unmatched");
  }
  actions.sort((left, right) => left.logIndex - right.logIndex);
  return { actions, flow: { recoveryNetFlowEth, yieldNetFlowEth } };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runtimeLogBlockNumber(value: unknown): number | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const blockNumber = value.blockNumber;
  return Number.isSafeInteger(blockNumber) && (blockNumber as number) >= 0
    ? (blockNumber as number)
    : null;
}

type ValidatedRpcLog = RpcLog & {
  readonly blockHash: string;
  readonly blockNumber: number;
  readonly transactionHash: string;
  readonly logIndex: number;
};

function parseRuntimeLog(
  value: unknown,
  blockNumber: number,
): ValidatedRpcLog | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const topics = value.topics;
  if (
    typeof value.address !== "string" ||
    !Array.isArray(topics) ||
    !topics.every((topic) => typeof topic === "string") ||
    typeof value.data !== "string" ||
    typeof value.blockHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value.blockHash) ||
    value.blockNumber !== blockNumber ||
    typeof value.transactionHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value.transactionHash) ||
    !Number.isSafeInteger(value.logIndex) ||
    (value.logIndex as number) < 0 ||
    typeof value.removed !== "boolean"
  ) {
    return null;
  }
  return {
    address: value.address,
    topics: topics as string[],
    data: value.data,
    blockHash: value.blockHash,
    blockNumber,
    transactionHash: value.transactionHash,
    logIndex: value.logIndex as number,
    removed: value.removed,
  };
}

function normalizedHashOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.toLowerCase();
  return /^0x[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function normalizeRuntimeBlockIdentity(
  value: unknown,
  expectedNumber: number,
): { readonly block: RpcBlock | null; readonly observedHash: string | null } {
  const record = isPlainRecord(value) ? value : null;
  const observedHash = normalizedHashOrNull(record?.hash);
  const parentHash = normalizedHashOrNull(record?.parentHash);
  if (
    record === null ||
    record.number !== expectedNumber ||
    !Number.isSafeInteger(record.number) ||
    (record.number as number) < 0 ||
    observedHash === null ||
    parentHash === null
  ) {
    return { block: null, observedHash };
  }
  return {
    block: {
      number: expectedNumber,
      hash: observedHash,
      parentHash,
      timestamp:
        Number.isSafeInteger(record.timestamp) &&
        (record.timestamp as number) >= 0
          ? (record.timestamp as number)
          : null,
    },
    observedHash,
  };
}

function failure(
  code: YethScanFailureCode,
  blockNumber: number,
  log: unknown,
  reason: string,
  blockHash: string | null = null,
): YethScanFailure {
  const record = isPlainRecord(log) ? log : null;
  const txHash = record?.transactionHash;
  const logIndex = record?.logIndex;
  return {
    code,
    blockNumber,
    blockHash: normalizedHashOrNull(blockHash),
    txHash:
      typeof txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(txHash)
        ? txHash.toLowerCase()
        : null,
    logIndex:
      Number.isSafeInteger(logIndex) && (logIndex as number) >= 0
        ? (logIndex as number)
        : null,
    reason,
  };
}

export async function scanYethBlocks(params: {
  readonly rpc: RpcClient;
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly state: YethState;
  /** Optional preloaded event-block headers. Missing event headers are loaded lazily. */
  readonly verifiedBlocks?: readonly RpcBlock[];
  readonly isBudgetExceeded?: (error: unknown) => boolean;
  readonly isElapsedTimeExceeded?: (error: unknown) => boolean;
}): Promise<YethScanResult> {
  if (
    !Number.isSafeInteger(params.fromBlock) ||
    !Number.isSafeInteger(params.toBlock) ||
    params.fromBlock < 0 ||
    params.toBlock < params.fromBlock
  ) {
    throw new RangeError("invalid yETH scan range");
  }

  const logs: unknown[] = [];
  const validatedEventBlockNumbers = new Set<number>();
  const countValidatedEventBlocksThrough = (terminalBlock: number): number => {
    let count = 0;
    for (const blockNumber of validatedEventBlockNumbers) {
      if (blockNumber <= terminalBlock) count += 1;
    }
    return count;
  };
  for (const partition of YETH_LOG_QUERY_PARTITIONS) {
    const partitionFromBlock = Math.max(
      params.fromBlock,
      partition.startBlock,
    );
    if (partitionFromBlock > params.toBlock) continue;
    let response: RpcLog[];
    try {
      response = await params.rpc.getLogs({
        address: Array.from(partition.address),
        topics: [Array.from(partition.topics)],
        fromBlock: partitionFromBlock,
        toBlock: params.toBlock,
      });
    } catch (error) {
      return {
        state: cloneYethState(params.state),
        actions: [],
        ignored: [],
        eventBlocksInspected: 0,
        flow: { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n },
        lastProcessedBlock: params.fromBlock - 1,
        failure: failure(
          params.isElapsedTimeExceeded?.(error) === true
            ? "elapsed_time"
            : params.isBudgetExceeded?.(error) === true
              ? "budget_exhausted"
              : isRpcRangeTooLargeError(error)
                ? "range_too_large"
              : "lookup_failed",
          params.fromBlock,
          null,
          "get_logs_failed",
        ),
      };
    }
    try {
      if (!Array.isArray(response)) throw new Error("invalid_logs_response");
      const allowedAddresses = new Set(
        partition.address.map((address) => normalizeYethAddress(address)),
      );
      const allowedTopics = new Set(
        partition.topics.map((topic) => topic.toLowerCase()),
      );
      if (
        response.some(
          (log) =>
            !allowedAddresses.has(normalizeYethAddress(log.address)) ||
            !allowedTopics.has(log.topics[0]?.toLowerCase() ?? ""),
        )
      ) {
        throw new Error("partition_response_pair_mismatch");
      }
      logs.push(...response);
    } catch {
      return {
        state: cloneYethState(params.state),
        actions: [],
        ignored: [],
        eventBlocksInspected: 0,
        flow: { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n },
        lastProcessedBlock: params.fromBlock - 1,
        failure: failure(
          "decode_failed",
          params.fromBlock,
          null,
          "invalid_logs_response",
        ),
      };
    }
  }

  logs.sort((left, right) => {
    const leftBlock = runtimeLogBlockNumber(left) ?? Number.MAX_SAFE_INTEGER;
    const rightBlock = runtimeLogBlockNumber(right) ?? Number.MAX_SAFE_INTEGER;
    const leftIndex = isPlainRecord(left) && Number.isSafeInteger(left.logIndex)
      ? (left.logIndex as number)
      : Number.MAX_SAFE_INTEGER;
    const rightIndex = isPlainRecord(right) && Number.isSafeInteger(right.logIndex)
      ? (right.logIndex as number)
      : Number.MAX_SAFE_INTEGER;
    return leftBlock - rightBlock || leftIndex - rightIndex;
  });

  const logsByBlock = new Map<number, unknown[]>();
  for (const rawLog of logs) {
    const blockNumber = runtimeLogBlockNumber(rawLog);
    if (
      blockNumber === null ||
      blockNumber < params.fromBlock ||
      blockNumber > params.toBlock
    ) {
      return {
        state: cloneYethState(params.state),
        actions: [],
        ignored: [],
        eventBlocksInspected: 0,
        flow: { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n },
        lastProcessedBlock: params.fromBlock - 1,
        failure: failure(
          "decode_failed",
          blockNumber ?? params.fromBlock,
          rawLog,
          "invalid_log_metadata",
        ),
      };
    }
    const blockLogs = logsByBlock.get(blockNumber) ?? [];
    blockLogs.push(rawLog);
    logsByBlock.set(blockNumber, blockLogs);
  }

  const verifiedByNumber = new Map<number, RpcBlock>();
  for (const candidate of params.verifiedBlocks ?? []) {
    const normalized = normalizeRuntimeBlockIdentity(candidate, candidate.number);
    const block = normalized.block;
    if (
      block === null ||
      block.number < params.fromBlock ||
      block.number > params.toBlock ||
      verifiedByNumber.has(block.number)
    ) {
      return {
        state: cloneYethState(params.state),
        actions: [],
        ignored: [],
        eventBlocksInspected: 0,
        flow: { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n },
        lastProcessedBlock: params.fromBlock - 1,
        failure: failure(
          "lookup_failed",
          params.fromBlock,
          null,
          "verified_block_range_invalid",
          normalized.observedHash,
        ),
      };
    }
    verifiedByNumber.set(block.number, block);
  }
  for (const requiredBlock of logsByBlock.keys()) {
    if (verifiedByNumber.has(requiredBlock)) continue;
    try {
      const candidate = await params.rpc.getBlockByNumber(requiredBlock);
      const normalized = normalizeRuntimeBlockIdentity(candidate, requiredBlock);
      if (normalized.block === null) throw new Error("event_block_header_invalid");
      verifiedByNumber.set(requiredBlock, normalized.block);
    } catch (error) {
      return {
        state: cloneYethState(params.state),
        actions: [],
        ignored: [],
        eventBlocksInspected: 0,
        flow: { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n },
        lastProcessedBlock: params.fromBlock - 1,
        failure: failure(
          "lookup_failed",
          requiredBlock,
          null,
          params.isElapsedTimeExceeded?.(error) === true
            ? "event_block_header_timeout"
            : "event_block_header_unavailable",
        ),
      };
    }
  }

  let committedState = cloneYethState(params.state);
  const committedActions: NormalizedAction[] = [];
  const committedIgnores: YethIntentionalIgnore[] = [];
  const committedFlow = { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n };
  for (const blockNumber of [...logsByBlock.keys()].sort((a, b) => a - b)) {
    const blockLogs = logsByBlock.get(blockNumber)!;
    const identity = verifiedByNumber.get(blockNumber)!;
    const canonicalBlockHash = identity.hash;
    const provisionalState = cloneYethState(committedState);
    const decodedByTx = new Map<string, YethDecodedEvent[]>();
    const blockIgnores: YethIntentionalIgnore[] = [];
    const seenLogIndices = new Set<number>();
    const validatedLogs: ValidatedRpcLog[] = [];

    for (const rawLog of blockLogs) {
      const log = parseRuntimeLog(rawLog, blockNumber);
      if (
        log === null ||
        log.blockHash!.toLowerCase() !== canonicalBlockHash ||
        seenLogIndices.has(log.logIndex)
      ) {
        return {
          state: committedState,
          actions: committedActions,
          ignored: committedIgnores,
          eventBlocksInspected: countValidatedEventBlocksThrough(
            blockNumber - 1,
          ),
          flow: { ...committedFlow },
          lastProcessedBlock: blockNumber - 1,
          failure: failure(
            "decode_failed",
            blockNumber,
            rawLog,
            log === null
              ? "invalid_log_metadata"
              : "log_block_hash_mismatch",
            canonicalBlockHash,
          ),
        };
      }
      seenLogIndices.add(log.logIndex);
      if (!isKnownYethAddressTopicPair(log)) {
        return {
          state: committedState,
          actions: committedActions,
          ignored: committedIgnores,
          eventBlocksInspected: countValidatedEventBlocksThrough(
            blockNumber - 1,
          ),
          flow: { ...committedFlow },
          lastProcessedBlock: blockNumber - 1,
          failure: failure(
            "decode_failed",
            blockNumber,
            log,
            "unknown_address_topic_pair",
            canonicalBlockHash,
          ),
        };
      }
      validatedLogs.push(log);
    }
    if (validatedLogs.length > 0) {
      validatedEventBlockNumbers.add(blockNumber);
    }

    for (const log of validatedLogs) {
      let decoded: YethDecodedEvent;
      try {
        decoded = decodeYethLog(log);
      } catch {
        return {
          state: committedState,
          actions: committedActions,
          ignored: committedIgnores,
          eventBlocksInspected: countValidatedEventBlocksThrough(
            blockNumber,
          ),
          flow: { ...committedFlow },
          lastProcessedBlock: blockNumber - 1,
          failure: failure(
            "decode_failed",
            blockNumber,
            log,
            "monitored_log_undecodable",
            canonicalBlockHash,
          ),
        };
      }
      if (log.removed) {
        blockIgnores.push({
          reason: "removed_log",
          blockNumber,
          txHash: log.transactionHash.toLowerCase(),
          logIndex: log.logIndex,
        });
        continue;
      }
      const txHash = log.transactionHash.toLowerCase();
      const events = decodedByTx.get(txHash) ?? [];
      events.push(decoded);
      decodedByTx.set(txHash, events);
    }

    const blockActions: NormalizedAction[] = [];
    const blockFlow = { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n };
    try {
      for (const events of decodedByTx.values()) {
        const applied = applyTransactionEvents(
          provisionalState,
          events,
        );
        blockActions.push(...applied.actions);
        blockFlow.recoveryNetFlowEth += applied.flow.recoveryNetFlowEth;
        blockFlow.yieldNetFlowEth += applied.flow.yieldNetFlowEth;
      }
      blockActions.sort((left, right) => left.logIndex - right.logIndex);
      assertYethAccountingInvariants(provisionalState, `block:${blockNumber}`);
      const finalStateAmounts = stateAmounts(provisionalState);
      for (const action of blockActions) {
        action.amounts = { ...action.amounts, ...finalStateAmounts };
      }
    } catch {
      return {
        state: committedState,
        actions: committedActions,
        ignored: committedIgnores,
        eventBlocksInspected: countValidatedEventBlocksThrough(blockNumber),
        flow: { ...committedFlow },
        lastProcessedBlock: blockNumber - 1,
        failure: failure(
          "accounting_failed",
          blockNumber,
          blockLogs[0] ?? null,
          "block_accounting_failed",
          canonicalBlockHash,
        ),
      };
    }
    committedState = provisionalState;
    committedFlow.recoveryNetFlowEth += blockFlow.recoveryNetFlowEth;
    committedFlow.yieldNetFlowEth += blockFlow.yieldNetFlowEth;
    committedActions.push(...blockActions);
    committedIgnores.push(...blockIgnores);
  }

  return {
    state: committedState,
    actions: committedActions,
    ignored: committedIgnores,
    eventBlocksInspected: validatedEventBlockNumbers.size,
    flow: { ...committedFlow },
    lastProcessedBlock: params.toBlock,
    failure: null,
  };
}

export interface YethBlockIdentityRangeResult {
  readonly blocks: readonly RpcBlock[];
  readonly lastValidatedBlock: number;
  readonly failure: YethScanFailure | null;
}

/** Loads every owned block and proves number/hash/parent adjacency before scanning it. */
export async function loadYethBlockIdentityRange(params: {
  readonly rpc: Pick<RpcClient, "getBlockByNumber">;
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly expectedParentHash: string;
  readonly expectedTerminal?: {
    readonly blockNumber: number;
    readonly blockHash: string;
  };
  readonly isBudgetExceeded?: (error: unknown) => boolean;
}): Promise<YethBlockIdentityRangeResult> {
  if (
    !Number.isSafeInteger(params.fromBlock) ||
    !Number.isSafeInteger(params.toBlock) ||
    params.fromBlock < 0 ||
    params.toBlock < params.fromBlock ||
    !/^0x[0-9a-fA-F]{64}$/.test(params.expectedParentHash) ||
    (params.expectedTerminal !== undefined &&
      (!Number.isSafeInteger(params.expectedTerminal.blockNumber) ||
        params.expectedTerminal.blockNumber < params.fromBlock ||
        params.expectedTerminal.blockNumber > params.toBlock ||
        !/^0x[0-9a-fA-F]{64}$/.test(params.expectedTerminal.blockHash)))
  ) {
    throw new RangeError("invalid yETH block identity range");
  }
  const blocks: RpcBlock[] = [];
  let expectedParentHash = params.expectedParentHash.toLowerCase();
  for (
    let blockNumber = params.fromBlock;
    blockNumber <= params.toBlock;
    blockNumber += 1
  ) {
    let rawBlock: unknown;
    try {
      rawBlock = await params.rpc.getBlockByNumber(blockNumber);
    } catch (error) {
      return {
        blocks,
        lastValidatedBlock: blockNumber - 1,
        failure: failure(
          params.isBudgetExceeded?.(error) === true
            ? "budget_exhausted"
            : "lookup_failed",
          blockNumber,
          null,
          "block_identity_lookup_failed",
        ),
      };
    }
    const normalized = normalizeRuntimeBlockIdentity(rawBlock, blockNumber);
    if (normalized.block === null) {
      return {
        blocks,
        lastValidatedBlock: blockNumber - 1,
        failure: failure(
          "lookup_failed",
          blockNumber,
          null,
          "block_identity_malformed",
          normalized.observedHash,
        ),
      };
    }
    const block = normalized.block;
    const hash = block.hash;
    const parentHash = block.parentHash;
    const terminalMismatch =
      params.expectedTerminal?.blockNumber === blockNumber &&
      hash !== params.expectedTerminal.blockHash.toLowerCase();
    if (parentHash !== expectedParentHash || terminalMismatch) {
      return {
        blocks,
        lastValidatedBlock: blockNumber - 1,
        failure: failure(
          "lookup_failed",
          blockNumber,
          null,
          terminalMismatch
            ? "block_identity_terminal_mismatch"
            : "block_identity_non_adjacent",
          hash,
        ),
      };
    }
    blocks.push(block);
    expectedParentHash = hash;
  }
  return {
    blocks,
    lastValidatedBlock: params.toBlock,
    failure: null,
  };
}

/** Mutable-state adapter retained for deterministic scanner fixtures. */
export async function scanChunkForYethActions(
  rpc: RpcClient,
  fromBlock: number,
  toBlock: number,
  state: YethState,
  verifiedBlocks: readonly RpcBlock[] = [],
): Promise<NormalizedAction[]> {
  const result = await scanYethBlocks({
    rpc,
    fromBlock,
    toBlock,
    state,
    verifiedBlocks,
  });
  if (result.failure !== null) {
    throw new YethScanBlockError(result.failure);
  }
  replaceYethState(state, result.state);
  return [...result.actions];
}
