import {
  decodeErrorResult,
  decodeFunctionResult,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { normalize } from "viem/ens";
import {
  LIQUID_LOCKERS,
  STYFI,
  STYFIX,
  VEYFI,
  VEYFI_REWARD_DISTRIBUTOR,
  YETH_CLAIM,
  YETH_CLAIM_DEPLOY_BLOCK,
  YETH_RECOVERY_VAULT,
} from "./contracts";
import { ALERT_DOMAIN_GENESIS_BLOCKS } from "./domain-registry";
import type { ActiveAlertDomainId } from "./domain-registry";
import type { RpcCallRequest } from "./rpc";
import type { NormalizedAction } from "./types";

/**
 * A closed signal that an exact eth_call snapshot was unavailable even though
 * a subsequent canonical-header check proved the requested block unchanged.
 */
export class AlertAccountSnapshotUnavailableError extends Error {
  constructor() {
    super("alert_account_snapshot_unavailable");
    this.name = "AlertAccountSnapshotUnavailableError";
  }
}

const ACCOUNT_READ_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function streams(address account) view returns (uint256 start, uint256 total, uint256 claimed)",
  "function maxWithdraw(address owner) view returns (uint256)",
  "function locked(address account) view returns (int128 amount, uint256 end)",
  "function locks(address account) view returns ((uint256 amount, uint256 boost_epochs, uint256 unlock_time))",
  "function last_claimed(address account) view returns (uint256)",
  "function claimable(address account) view returns (uint256)",
  "function recovery_rate() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
] as const);

const MULTICALL3_ABI = parseAbi([
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)",
] as const);
const UNIVERSAL_RESOLVER_ABI = parseAbi([
  "function reverse(bytes reverseAddress,uint256 coinType) view returns (string,address,address)",
] as const);
const UNIVERSAL_RESOLVER_NULL_ERRORS_ABI = parseAbi([
  "error HttpError(uint16 status,string message)",
  "error ResolverError(bytes errorData)",
  "error ResolverNotContract(bytes name,address resolver)",
  "error ResolverNotFound(bytes name)",
  "error ReverseAddressMismatch(string primary,bytes primaryAddress)",
  "error UnsupportedResolverProfile(bytes4 selector)",
] as const);

/** Canonical Mainnet Multicall3; deployed at block 14,353,601. */
export const ALERT_MULTICALL3 =
  "0xca11bde05977b3631167028862be2a173976ca11" as const;
/** ENS Universal Resolver proxy; deployed at block 23,085,558. */
export const ALERT_ENS_UNIVERSAL_RESOLVER =
  "0xeeeeeeee14d718c2b47d9923deab1335e144eeee" as const;
export const ALERT_ENS_CONTEXT_READY_BLOCK = 23_085_558;
const ENS_COIN_TYPE_ETH = 60n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const UINT256_MAX = (1n << 256n) - 1n;
const INT128_MAX = (1n << 127n) - 1n;
/** Canonical Ethereum creation evidence for every required related-position read. */
export const ALERT_YFI_RELATED_CONTEXT_DEPLOYMENTS = Object.freeze([
  Object.freeze({
    name: "legacy veYFI",
    address: VEYFI.toLowerCase(),
    blockNumber: 15_974_608,
    transactionHash:
      "0x2a07f47b7cdb39acb26ffa7c13c101e9942b9bd335c31204e388c0c8290c55ec",
  }),
  Object.freeze({
    name: "sdYFI",
    address: LIQUID_LOCKERS[0]!.token.toLowerCase(),
    blockNumber: 16_169_657,
    transactionHash:
      "0x645b4b90531a4fa06785563ede106f70e236dd683dc696984b33b91b31714d7b",
  }),
  Object.freeze({
    name: "coveYFI",
    address: LIQUID_LOCKERS[2]!.token.toLowerCase(),
    blockNumber: 19_594_493,
    transactionHash:
      "0x880ade9f91974054896b9baeff3ff39d8d6f5897b47e0f989b42279a8801e858",
  }),
  Object.freeze({
    name: "supYFI",
    address: LIQUID_LOCKERS[1]!.token.toLowerCase(),
    blockNumber: 19_640_276,
    transactionHash:
      "0xc71d41a1f7176e98da0bafa99c9df60aa397b04b961c1c0ddd14c439e9484da1",
  }),
  Object.freeze({
    name: "stYFI",
    address: STYFI.toLowerCase(),
    blockNumber: 24_377_403,
    transactionHash:
      "0x9a96931da8f24e8c06fd83a58ae661b96f8b214d04ef535a143c00e1a51f3a0f",
  }),
  Object.freeze({
    name: "stYFIx",
    address: STYFIX.toLowerCase(),
    blockNumber: 24_377_559,
    transactionHash:
      "0xeaa74bc30fa8a14b04069f12b5b4953a3b1655fead7124474ae5b1aa66524c2b",
  }),
  Object.freeze({
    name: "migrated veYFI distributor",
    address: VEYFI_REWARD_DISTRIBUTOR.toLowerCase(),
    blockNumber: 24_377_664,
    transactionHash:
      "0x930067371d512ee38ceea4188f042ed6b16249c9974ffa59874ac43890945002",
  }),
  Object.freeze({
    name: "sdYFI depositor",
    address: "0xa16f6fc7380300525c812ea2733ad62dda58143b",
    blockNumber: 24_377_742,
    transactionHash:
      "0x0d88903d0c86a9deb586171f5d44a8e59e96a2d87e54f2a555bba12ea7e6575c",
  }),
  Object.freeze({
    name: "supYFI depositor",
    address: "0x52aa16860e0d42b6a7b6ecc15688472eb20135c9",
    blockNumber: 24_377_749,
    transactionHash:
      "0x1c7b4af2f3625850fad7c209f01bcc05662cec816f7207fe600dcf155687d8c8",
  }),
  Object.freeze({
    name: "coveYFI depositor",
    address: "0x3d4ced97adb0ae3a53da95a47ffc749aad26bc8f",
    blockNumber: 24_377_754,
    transactionHash:
      "0x8b80102dabe724a52d7554e85b2c2be1cdf97ff549c22f5e0c8a1ed1d5702d0b",
  }),
]);

const relatedContextAddresses = new Set(
  ALERT_YFI_RELATED_CONTEXT_DEPLOYMENTS.map((deployment) => deployment.address),
);
if (
  [
    STYFI,
    STYFIX,
    VEYFI,
    VEYFI_REWARD_DISTRIBUTOR,
    ...LIQUID_LOCKERS.flatMap((locker) => [locker.token, locker.depositor]),
  ].some((address) => !relatedContextAddresses.has(address.toLowerCase()))
) {
  throw new Error("alert_account_block_context_deployment_provenance_invalid");
}

/** The canonical replay boundaries start after this complete contract set. */
export const ALERT_YFI_RELATED_CONTEXT_READY_BLOCK = Math.max(
  ...ALERT_YFI_RELATED_CONTEXT_DEPLOYMENTS.map(
    (deployment) => deployment.blockNumber,
  ),
);

if (
  ALERT_DOMAIN_GENESIS_BLOCKS.styfi < ALERT_YFI_RELATED_CONTEXT_READY_BLOCK ||
  ALERT_DOMAIN_GENESIS_BLOCKS.veyfi < ALERT_YFI_RELATED_CONTEXT_READY_BLOCK
) {
  throw new Error("alert_account_block_context_replay_boundary_invalid");
}
if (
  ALERT_DOMAIN_GENESIS_BLOCKS.styfi < ALERT_ENS_CONTEXT_READY_BLOCK ||
  ALERT_DOMAIN_GENESIS_BLOCKS.veyfi < ALERT_ENS_CONTEXT_READY_BLOCK ||
  ALERT_DOMAIN_GENESIS_BLOCKS.yeth < ALERT_ENS_CONTEXT_READY_BLOCK
) {
  throw new Error("alert_account_block_context_ens_boundary_invalid");
}

export interface AlertCooldownSnapshot {
  readonly start: bigint;
  readonly total: bigint;
  readonly claimed: bigint;
  readonly cooling: bigint;
  readonly withdrawable: bigint;
}

export interface AlertStakingPositionSnapshot {
  readonly symbol: "stYFI" | "stYFIx";
  readonly active: bigint;
  readonly cooldown: AlertCooldownSnapshot;
}

export interface AlertLiquidLockerPositionSnapshot {
  readonly symbol: "sdYFI" | "supYFI" | "coveYFI";
  readonly scale: bigint;
  readonly wallet: bigint;
  readonly activeShares: bigint;
  readonly activeToken: bigint;
  readonly cooldownShares: bigint;
  readonly cooldownToken: bigint;
  readonly withdrawableToken: bigint;
  readonly cooldown: AlertCooldownSnapshot;
  readonly yfiEquivalent: bigint;
}

export interface AlertLegacyVeyfiPositionSnapshot {
  readonly amount: bigint;
  readonly unlockTime: bigint;
}

export interface AlertMigratedVeyfiPositionSnapshot {
  readonly amount: bigint;
  readonly boostEpochs: bigint;
  readonly unlockTime: bigint;
  readonly lastClaimedEpoch: bigint;
  readonly migrationProven: boolean;
}

export interface AlertYfiAccountBlockSnapshot {
  readonly kind: "yfi";
  readonly principal: string;
  readonly styfi: AlertStakingPositionSnapshot;
  readonly styfix: AlertStakingPositionSnapshot;
  readonly liquidLockers: readonly AlertLiquidLockerPositionSnapshot[];
  readonly legacyVeyfi: AlertLegacyVeyfiPositionSnapshot;
  readonly migratedVeyfi: AlertMigratedVeyfiPositionSnapshot;
}

export interface AlertYethAccountBlockSnapshot {
  readonly kind: "yeth";
  readonly principal: string;
  readonly claimableSnapshot: bigint;
  readonly claimableRecovered: bigint;
  readonly recoveryRate: bigint;
  readonly recoveryVaultShares: bigint;
  readonly recoveryVaultAssets: bigint;
  readonly recoveryVaultTotalAssets: bigint;
  readonly recoveryVaultTotalSupply: bigint;
}

export type AlertAccountBlockSnapshot =
  | AlertYfiAccountBlockSnapshot
  | AlertYethAccountBlockSnapshot;

export interface AlertResolvedAccountBlockContext {
  readonly snapshotsByPrincipal: Readonly<Record<string, AlertAccountBlockSnapshot>>;
  readonly ensNamesByAddress: Readonly<Record<string, string>>;
  readonly eventIds: readonly string[];
  readonly requestCount: number;
}

export interface AlertAccountBlockReader {
  read(requests: readonly RpcCallRequest[]): Promise<readonly string[]>;
}

export interface AlertAccountBlockContextInput {
  readonly domainId: ActiveAlertDomainId;
  readonly actions: readonly NormalizedAction[];
  readonly block: {
    readonly blockNumber: number;
    readonly blockHash: string;
  };
  readonly reader: AlertAccountBlockReader;
}

export interface AlertEnsBlockContextInput {
  readonly addresses: readonly string[];
  readonly block: {
    readonly blockNumber: number;
    readonly blockHash: string;
  };
  readonly reader: AlertAccountBlockReader;
}

interface PlannedRead {
  readonly request: RpcCallRequest;
  readonly words: number;
}

interface YfiPrincipalPlan {
  readonly principal: string;
  readonly offset: number;
}

interface YethPrincipalPlan {
  readonly principal: string;
  readonly claimableOffset: number | null;
  readonly sharesOffset: number;
}

interface RequiredReadPlan {
  readonly reads: readonly PlannedRead[];
  readonly yfiPrincipals: readonly YfiPrincipalPlan[];
  readonly yethPrincipals: readonly YethPrincipalPlan[];
  readonly yethRecoveryRateOffset: number | null;
  readonly yethVaultGlobalsOffset: number | null;
}

function ensRequest(address: Address): RpcCallRequest {
  const reverseCall = encodeFunctionData({
    abi: UNIVERSAL_RESOLVER_ABI,
    functionName: "reverse",
    args: [address, ENS_COIN_TYPE_ETH],
  });
  if (!reverseCall.startsWith("0x5d78a217")) {
    throw new Error("alert_account_block_context_ens_selector_invalid");
  }
  return Object.freeze({
    to: ALERT_MULTICALL3,
    data: encodeFunctionData({
      abi: MULTICALL3_ABI,
      functionName: "aggregate3",
      args: [
        [
          {
            target: ALERT_ENS_UNIVERSAL_RESOLVER,
            allowFailure: true,
            callData: reverseCall,
          },
        ],
      ],
    }),
  });
}

function canonicalResult(params: {
  readonly value: string;
  readonly functionName: "aggregate3" | "reverse";
}): unknown {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(params.value)) {
    throw new Error("alert_account_block_context_ens_result_invalid");
  }
  try {
    if (params.functionName === "aggregate3") {
      const decoded = decodeFunctionResult({
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        data: params.value as Hex,
      });
      if (
        encodeFunctionResult({
          abi: MULTICALL3_ABI,
          functionName: "aggregate3",
          result: decoded,
        }).toLowerCase() !== params.value.toLowerCase()
      ) {
        throw new Error("noncanonical");
      }
      return decoded;
    }
    const decoded = decodeFunctionResult({
      abi: UNIVERSAL_RESOLVER_ABI,
      functionName: "reverse",
      data: params.value as Hex,
    });
    if (
      encodeFunctionResult({
        abi: UNIVERSAL_RESOLVER_ABI,
        functionName: "reverse",
        result: decoded,
      }).toLowerCase() !== params.value.toLowerCase()
    ) {
      throw new Error("noncanonical");
    }
    return decoded;
  } catch {
    throw new Error("alert_account_block_context_ens_result_invalid");
  }
}

function isCanonicalUnavailableEnsError(value: Hex): boolean {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) return false;
  try {
    const decoded = decodeErrorResult({
      abi: UNIVERSAL_RESOLVER_NULL_ERRORS_ABI,
      data: value,
    });
    const canonical = encodeErrorResult({
      abi: UNIVERSAL_RESOLVER_NULL_ERRORS_ABI,
      errorName: decoded.errorName,
      args: decoded.args,
    });
    return canonical.toLowerCase() === value.toLowerCase();
  } catch {
    return false;
  }
}

export function isSafeAlertEnsName(value: string): boolean {
  let normalized: string;
  try {
    normalized = normalize(value);
  } catch {
    return false;
  }
  const bytes = new TextEncoder().encode(value).length;
  return !(
    normalized !== value ||
    value.length === 0 ||
    bytes > 255 ||
    [...value].length > 255 ||
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u.test(
      value,
    )
  );
}

function decodeEnsResult(value: string): string | null {
  const outer = canonicalResult({
    value,
    functionName: "aggregate3",
  }) as readonly { readonly success: boolean; readonly returnData: Hex }[];
  if (outer.length !== 1 || outer[0] === undefined) {
    throw new Error("alert_account_block_context_ens_result_invalid");
  }
  if (!outer[0].success) {
    if (isCanonicalUnavailableEnsError(outer[0].returnData)) return null;
    throw new Error("alert_account_block_context_ens_result_invalid");
  }
  const inner = canonicalResult({
    value: outer[0].returnData,
    functionName: "reverse",
  }) as readonly [string, Address, Address];
  const [name, resolver, reverseResolver] = inner;
  if (name === "") return null;
  if (
    resolver.toLowerCase() === ZERO_ADDRESS ||
    reverseResolver.toLowerCase() === ZERO_ADDRESS
  ) {
    throw new Error("alert_account_block_context_ens_result_invalid");
  }
  return isSafeAlertEnsName(name) ? name : null;
}

/** Resolves safely verified ENS primary names using the existing exact-block plan. */
export async function resolveAlertEnsNamesAtBlock(
  input: AlertEnsBlockContextInput,
): Promise<Readonly<Record<string, string>>> {
  if (
    !Number.isSafeInteger(input.block.blockNumber) ||
    input.block.blockNumber < ALERT_ENS_CONTEXT_READY_BLOCK ||
    !/^0x[0-9a-fA-F]{64}$/.test(input.block.blockHash)
  ) {
    throw new Error("alert_account_block_context_ens_block_invalid");
  }
  const addresses = [...new Set(input.addresses.map((value) => {
    const normalized = value.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
      throw new Error("alert_account_block_context_ens_address_invalid");
    }
    return normalized;
  }))].sort();
  if (addresses.length === 0) return Object.freeze({});
  const values = await input.reader.read(
    Object.freeze(addresses.map((value) => ensRequest(value as Address))),
  );
  if (values.length !== addresses.length) {
    throw new Error("alert_account_block_context_ens_cardinality_invalid");
  }
  const names: Record<string, string> = {};
  for (let index = 0; index < addresses.length; index += 1) {
    const name = decodeEnsResult(values[index]!);
    if (name !== null) names[addresses[index]!] = name;
  }
  return Object.freeze(names);
}

const contextPromisesByReader = new WeakMap<
  AlertAccountBlockReader,
  Map<string, Promise<AlertResolvedAccountBlockContext>>
>();

function call(
  to: Address,
  functionName:
    | "balanceOf"
    | "streams"
    | "maxWithdraw"
    | "locked"
    | "locks"
    | "last_claimed"
    | "claimable",
  principal: Address,
  words: number,
): PlannedRead {
  return Object.freeze({
    request: Object.freeze({
      to: to.toLowerCase(),
      data: encodeFunctionData({
        abi: ACCOUNT_READ_ABI,
        functionName,
        args: [principal],
      }),
    }),
    words,
  });
}

function globalCall(
  to: Address,
  functionName: "recovery_rate" | "totalAssets" | "totalSupply",
): PlannedRead {
  return Object.freeze({
    request: Object.freeze({
      to: to.toLowerCase(),
      data: encodeFunctionData({
        abi: ACCOUNT_READ_ABI,
        functionName,
      }),
    }),
    words: 1,
  });
}

function convertToAssetsCall(shares: bigint): PlannedRead {
  return Object.freeze({
    request: Object.freeze({
      to: YETH_RECOVERY_VAULT.toLowerCase(),
      data: encodeFunctionData({
        abi: ACCOUNT_READ_ABI,
        functionName: "convertToAssets",
        args: [shares],
      }),
    }),
    words: 1,
  });
}

function yfiPrincipalReads(principal: Address): readonly PlannedRead[] {
  const reads: PlannedRead[] = [
    call(STYFI, "balanceOf", principal, 1),
    call(STYFI, "streams", principal, 3),
    call(STYFI, "maxWithdraw", principal, 1),
    call(STYFIX, "balanceOf", principal, 1),
    call(STYFIX, "streams", principal, 3),
    call(STYFIX, "maxWithdraw", principal, 1),
  ];
  for (const locker of LIQUID_LOCKERS) {
    reads.push(
      call(locker.token, "balanceOf", principal, 1),
      call(locker.depositor, "balanceOf", principal, 1),
      call(locker.depositor, "streams", principal, 3),
      call(locker.depositor, "maxWithdraw", principal, 1),
    );
  }
  reads.push(
    call(VEYFI, "locked", principal, 2),
    call(VEYFI_REWARD_DISTRIBUTOR, "locks", principal, 3),
    call(VEYFI_REWARD_DISTRIBUTOR, "last_claimed", principal, 1),
  );
  return Object.freeze(reads);
}

function buildRequiredReadPlan(
  domainId: ActiveAlertDomainId,
  principals: readonly string[],
  blockNumber: number,
): RequiredReadPlan {
  const reads: PlannedRead[] = [];
  const yfiPrincipals: YfiPrincipalPlan[] = [];
  const yethPrincipals: YethPrincipalPlan[] = [];
  let yethRecoveryRateOffset: number | null = null;
  let yethVaultGlobalsOffset: number | null = null;
  if (domainId === "yeth") {
    const claimAvailable = blockNumber >= YETH_CLAIM_DEPLOY_BLOCK;
    if (claimAvailable) {
      yethRecoveryRateOffset = reads.length;
      reads.push(globalCall(YETH_CLAIM, "recovery_rate"));
    }
    yethVaultGlobalsOffset = reads.length;
    reads.push(
      globalCall(YETH_RECOVERY_VAULT, "totalAssets"),
      globalCall(YETH_RECOVERY_VAULT, "totalSupply"),
    );
    for (const principal of principals) {
      const address = principal as Address;
      const claimableOffset = claimAvailable ? reads.length : null;
      if (claimAvailable) {
        reads.push(call(YETH_CLAIM, "claimable", address, 1));
      }
      const sharesOffset = reads.length;
      reads.push(call(YETH_RECOVERY_VAULT, "balanceOf", address, 1));
      yethPrincipals.push(
        Object.freeze({ principal, claimableOffset, sharesOffset }),
      );
    }
  } else {
    for (const principal of principals) {
      yfiPrincipals.push(Object.freeze({ principal, offset: reads.length }));
      reads.push(...yfiPrincipalReads(principal as Address));
    }
  }
  return Object.freeze({
    reads: Object.freeze(reads),
    yfiPrincipals: Object.freeze(yfiPrincipals),
    yethPrincipals: Object.freeze(yethPrincipals),
    yethRecoveryRateOffset,
    yethVaultGlobalsOffset,
  });
}

function decodeWords(value: string, count: number): readonly bigint[] {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    !new RegExp(`^0x[0-9a-fA-F]{${count * 64}}$`).test(value)
  ) {
    throw new Error("alert_account_block_context_result_invalid");
  }
  const words: bigint[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = 2 + index * 64;
    const word = BigInt(`0x${value.slice(start, start + 64)}`);
    if (word < 0n || word > UINT256_MAX) {
      throw new Error("alert_account_block_context_result_invalid");
    }
    words.push(word);
  }
  return Object.freeze(words);
}

function decodeResults(
  plan: RequiredReadPlan,
  values: readonly string[],
): readonly (readonly bigint[])[] {
  if (values.length !== plan.reads.length) {
    throw new Error("alert_account_block_context_cardinality_invalid");
  }
  return Object.freeze(
    values.map((value, index) => decodeWords(value, plan.reads[index]!.words)),
  );
}

function cooldownSnapshot(
  stream: readonly bigint[],
  withdrawable: bigint,
): AlertCooldownSnapshot {
  const [start, total, claimed] = stream;
  const empty = start === 0n && total === 0n && claimed === 0n;
  const active =
    start !== undefined &&
    total !== undefined &&
    claimed !== undefined &&
    start > 0n &&
    total > claimed;
  if (
    start === undefined ||
    total === undefined ||
    claimed === undefined ||
    (!empty && !active)
  ) {
    throw new Error("alert_account_block_context_stream_invalid");
  }
  return Object.freeze({
    start,
    total,
    claimed,
    cooling: total - claimed,
    withdrawable,
  });
}

function valueAt(
  decoded: readonly (readonly bigint[])[],
  index: number,
): readonly bigint[] {
  const value = decoded[index];
  if (value === undefined) {
    throw new Error("alert_account_block_context_cardinality_invalid");
  }
  return value;
}

function singletonAt(
  decoded: readonly (readonly bigint[])[],
  index: number,
): bigint {
  const values = valueAt(decoded, index);
  if (values.length !== 1 || values[0] === undefined) {
    throw new Error("alert_account_block_context_cardinality_invalid");
  }
  return values[0];
}

function decodeYfiSnapshot(
  decoded: readonly (readonly bigint[])[],
  principal: YfiPrincipalPlan,
): AlertYfiAccountBlockSnapshot {
  let index = principal.offset;
  const styfiActive = singletonAt(decoded, index++);
  const styfiStream = valueAt(decoded, index++);
  const styfiWithdrawable = singletonAt(decoded, index++);
  const styfixActive = singletonAt(decoded, index++);
  const styfixStream = valueAt(decoded, index++);
  const styfixWithdrawable = singletonAt(decoded, index++);
  const styfiCooldown = cooldownSnapshot(styfiStream, styfiWithdrawable);
  const styfixCooldown = cooldownSnapshot(styfixStream, styfixWithdrawable);
  if (
    styfiWithdrawable > styfiActive + styfiCooldown.cooling ||
    styfixWithdrawable > styfixCooldown.cooling
  ) {
    throw new Error("alert_account_block_context_withdrawable_invalid");
  }
  const liquidLockers: AlertLiquidLockerPositionSnapshot[] = [];
  for (const locker of LIQUID_LOCKERS) {
    const wallet = singletonAt(decoded, index++);
    const activeShares = singletonAt(decoded, index++);
    const stream = valueAt(decoded, index++);
    const withdrawableToken = singletonAt(decoded, index++);
    if (
      stream.length !== 3 ||
      stream[0] === undefined ||
      stream[1] === undefined ||
      stream[2] === undefined ||
      stream[2] > stream[1]
    ) {
      throw new Error("alert_account_block_context_stream_invalid");
    }
    const cooldownShares = stream[1] - stream[2];
    const cooldown = cooldownSnapshot(
      Object.freeze([
        stream[0],
        stream[1] * locker.scale,
        stream[2] * locker.scale,
      ]),
      withdrawableToken,
    );
    const activeToken = activeShares * locker.scale;
    const cooldownToken = cooldown.cooling;
    if (withdrawableToken > cooldownToken) {
      throw new Error("alert_account_block_context_withdrawable_invalid");
    }
    const yfiEquivalent =
      wallet / locker.scale + activeShares + cooldownShares;
    if (!new Set(["sdYFI", "supYFI", "coveYFI"]).has(locker.symbol)) {
      throw new Error("alert_account_block_context_locker_invalid");
    }
    liquidLockers.push(
      Object.freeze({
        symbol: locker.symbol as "sdYFI" | "supYFI" | "coveYFI",
        scale: locker.scale,
        wallet,
        activeShares,
        activeToken,
        cooldownShares,
        cooldownToken,
        withdrawableToken,
        cooldown,
        yfiEquivalent,
      }),
    );
  }
  const legacy = valueAt(decoded, index++);
  const migrated = valueAt(decoded, index++);
  const lastClaimedEpoch = singletonAt(decoded, index++);
  if (
    legacy.length !== 2 ||
    legacy[0] === undefined ||
    legacy[1] === undefined ||
    legacy[0] > INT128_MAX ||
    migrated.length !== 3 ||
    migrated[0] === undefined ||
    migrated[1] === undefined ||
    migrated[2] === undefined
  ) {
    throw new Error("alert_account_block_context_lock_invalid");
  }
  return Object.freeze({
    kind: "yfi",
    principal: principal.principal,
    styfi: Object.freeze({
      symbol: "stYFI",
      active: styfiActive,
      cooldown: styfiCooldown,
    }),
    styfix: Object.freeze({
      symbol: "stYFIx",
      active: styfixActive,
      cooldown: styfixCooldown,
    }),
    liquidLockers: Object.freeze(liquidLockers),
    legacyVeyfi: Object.freeze({
      amount: legacy[0],
      unlockTime: legacy[1],
    }),
    migratedVeyfi: Object.freeze({
      amount: migrated[0],
      boostEpochs: migrated[1],
      unlockTime: migrated[2],
      lastClaimedEpoch,
      migrationProven: lastClaimedEpoch > 0n,
    }),
  });
}

function decodeYethSnapshot(
  decoded: readonly (readonly bigint[])[],
  recoveryRateOffset: number | null,
  vaultGlobalsOffset: number,
  principal: YethPrincipalPlan,
  recoveryVaultAssets: bigint,
): AlertYethAccountBlockSnapshot {
  const recoveryRate =
    recoveryRateOffset === null ? 0n : singletonAt(decoded, recoveryRateOffset);
  const recoveryVaultTotalAssets = singletonAt(decoded, vaultGlobalsOffset);
  const recoveryVaultTotalSupply = singletonAt(decoded, vaultGlobalsOffset + 1);
  const claimableSnapshot =
    principal.claimableOffset === null
      ? 0n
      : singletonAt(decoded, principal.claimableOffset);
  const recoveryVaultShares = singletonAt(decoded, principal.sharesOffset);
  if (recoveryVaultTotalSupply === 0n && recoveryVaultShares !== 0n) {
    throw new Error("alert_account_block_context_vault_invalid");
  }
  return Object.freeze({
    kind: "yeth",
    principal: principal.principal,
    claimableSnapshot,
    claimableRecovered: (claimableSnapshot * recoveryRate) / 10n ** 18n,
    recoveryRate,
    recoveryVaultShares,
    recoveryVaultAssets,
    recoveryVaultTotalAssets,
    recoveryVaultTotalSupply,
  });
}

function collectRequiredIdentity(input: AlertAccountBlockContextInput): {
  readonly eventIds: readonly string[];
  readonly principals: readonly string[];
  readonly ensActors: readonly string[];
} {
  const eventIds: string[] = [];
  const principals = new Set<string>();
  const ensActors = new Set<string>();
  for (const action of input.actions) {
    if (
      action.source.kind !== "onchain" ||
      action.principal?.kind !== "proven"
    ) {
      continue;
    }
    eventIds.push(`${action.txHash.toLowerCase()}:${action.logIndex}`);
    const principal = action.principal.address.toLowerCase();
    principals.add(principal);
    ensActors.add(principal);
    if (action.caller !== undefined) {
      ensActors.add(action.caller.toLowerCase());
    }
    if (action.receiver !== undefined) {
      ensActors.add(action.receiver.toLowerCase());
    }
  }
  return Object.freeze({
    eventIds: Object.freeze(eventIds),
    principals: Object.freeze([...principals].sort()),
    ensActors: Object.freeze([...ensActors].sort()),
  });
}

function cacheKey(
  input: AlertAccountBlockContextInput,
  eventIds: readonly string[],
  principals: readonly string[],
  ensActors: readonly string[],
): string {
  return [
    input.domainId,
    input.block.blockNumber,
    input.block.blockHash.toLowerCase(),
    eventIds.join("|"),
    principals.join("|"),
    ensActors.join("|"),
  ].join(":");
}

async function resolveUncached(
  input: AlertAccountBlockContextInput,
  eventIds: readonly string[],
  principals: readonly string[],
  ensActors: readonly string[],
): Promise<AlertResolvedAccountBlockContext> {
  if (eventIds.length === 0) {
    return Object.freeze({
      snapshotsByPrincipal: Object.freeze({}),
      ensNamesByAddress: Object.freeze({}),
      eventIds,
      requestCount: 0,
    });
  }
  const plan = buildRequiredReadPlan(
    input.domainId,
    principals,
    input.block.blockNumber,
  );
  const ensRequests = ensActors.map((actor) => ensRequest(actor as Address));
  const values = await input.reader.read(Object.freeze([
    ...plan.reads.map((read) => read.request),
    ...ensRequests,
  ]));
  const decoded = decodeResults(plan, values.slice(0, plan.reads.length));
  const ensValues = values.slice(plan.reads.length);
  if (ensValues.length !== ensActors.length) {
    throw new Error("alert_account_block_context_ens_cardinality_invalid");
  }
  const ensNames: Record<string, string> = {};
  for (let index = 0; index < ensActors.length; index += 1) {
    const name = decodeEnsResult(ensValues[index]!);
    if (name !== null) ensNames[ensActors[index]!] = name;
  }
  let yethAssetsByPrincipal: Readonly<Record<string, bigint>> = Object.freeze({});
  let requestCount = plan.reads.length + ensRequests.length;
  if (plan.yethPrincipals.length > 0) {
    const conversionReads = plan.yethPrincipals.map((principal) =>
      convertToAssetsCall(singletonAt(decoded, principal.sharesOffset)),
    );
    const conversions = await input.reader.read(
      Object.freeze(conversionReads.map((read) => read.request)),
    );
    const conversionPlan: RequiredReadPlan = Object.freeze({
      reads: Object.freeze(conversionReads),
      yfiPrincipals: Object.freeze([]),
      yethPrincipals: Object.freeze([]),
      yethRecoveryRateOffset: null,
      yethVaultGlobalsOffset: null,
    });
    const decodedConversions = decodeResults(conversionPlan, conversions);
    const assets: Record<string, bigint> = {};
    for (let index = 0; index < plan.yethPrincipals.length; index += 1) {
      assets[plan.yethPrincipals[index]!.principal] = singletonAt(
        decodedConversions,
        index,
      );
    }
    yethAssetsByPrincipal = Object.freeze(assets);
    requestCount += conversionReads.length;
  }
  const snapshots: Record<string, AlertAccountBlockSnapshot> = {};
  for (const principal of plan.yfiPrincipals) {
    snapshots[principal.principal] = decodeYfiSnapshot(decoded, principal);
  }
  if (plan.yethVaultGlobalsOffset !== null) {
    for (const principal of plan.yethPrincipals) {
      snapshots[principal.principal] = decodeYethSnapshot(
        decoded,
        plan.yethRecoveryRateOffset,
        plan.yethVaultGlobalsOffset,
        principal,
        yethAssetsByPrincipal[principal.principal]!,
      );
    }
  }
  return Object.freeze({
    snapshotsByPrincipal: Object.freeze(snapshots),
    ensNamesByAddress: Object.freeze(ensNames),
    eventIds,
    requestCount,
  });
}

/**
 * Resolves the fixed bounded exact-hash account snapshot plan for a block.
 * yETH uses two aggregate stages because convertToAssets depends on the first
 * stage's exact share balances. The combined promise (including a rejection)
 * is reader-scoped and retained for the invocation, so the same plan cannot
 * perform duplicate external work.
 */
export function resolveAlertAccountBlockContext(
  input: AlertAccountBlockContextInput,
): Promise<AlertResolvedAccountBlockContext> {
  const { eventIds, principals, ensActors } = collectRequiredIdentity(input);
  const key = cacheKey(input, eventIds, principals, ensActors);
  let cache = contextPromisesByReader.get(input.reader);
  if (cache === undefined) {
    cache = new Map();
    contextPromisesByReader.set(input.reader, cache);
  }
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const pending = resolveUncached(input, eventIds, principals, ensActors);
  cache.set(key, pending);
  return pending;
}
