import {
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import {
  COOLDOWN_STREAMS_ABI,
  ERC20_TRANSFER_ABI,
  ERC20_TRANSFER_TOPIC,
  ERC4626_DEPOSIT_ABI,
  ERC4626_DEPOSIT_TOPIC,
  ERC4626_WITHDRAW_ABI,
  ERC4626_WITHDRAW_TOPIC,
  LEGACY_VEYFI_LOCKED_ABI,
  LEGACY_VEYFI_MODIFY_LOCK_ABI,
  LEGACY_VEYFI_MODIFY_LOCK_TOPIC,
  LEGACY_VEYFI_PENALTY_ABI,
  LEGACY_VEYFI_PENALTY_TOPIC,
  LEGACY_VEYFI_WITHDRAW_ABI,
  LEGACY_VEYFI_WITHDRAW_TOPIC,
  LIQUID_LOCKER_EXCHANGE_ABI,
  LIQUID_LOCKER_EXCHANGE_TOPIC,
  LIQUID_LOCKER_REDEEM_ABI,
  LIQUID_LOCKER_REDEEM_TOPIC,
  STYFI_EXIT_CALL_ABI,
  VEYFI_DISTRIBUTOR_MIGRATE_ABI,
  VEYFI_DISTRIBUTOR_MIGRATE_TOPIC,
  ZERO_ADDRESS,
} from "../../abis";
import {
  LIQUID_LOCKER_BY_DEPOSITOR,
  LIQUID_LOCKER_REDEMPTION,
  LIQUID_LOCKER_SYMBOL_BY_TOKEN,
  STYFI,
  STYFIX,
  VEYFI,
  VEYFI_REWARD_DISTRIBUTOR,
} from "../../contracts";
import type {
  RpcClient,
  RpcBlock,
  RpcLog,
  RpcTransaction,
} from "../../rpc";
import { isRpcRangeTooLargeError } from "../../rpc";
import {
  decodeAttributedProtocolCall,
  UnsupportedProtocolCallEnvelopeError,
} from "../../transaction-attribution";
import type { NormalizedAction } from "../../types";
import {
  STYFI_LOG_QUERY_PARTITIONS,
  VEYFI_LOG_QUERY_PARTITIONS,
} from "./log-partitions";
export {
  STYFI_LOG_QUERY_PARTITIONS,
  VEYFI_LOG_QUERY_PARTITIONS,
  type AlertLogQueryPartition,
} from "./log-partitions";

const MIN_BLOCK_NUMBER = 0;

interface LegacyLockSnapshot {
  readonly amount: bigint;
  readonly end: bigint;
}

function cooldownStreamKey(contract: string, owner: string): string {
  return `${normalizeAddress(contract)}:${normalizeAddress(owner)}`;
}

export type StyfiVeyfiScanFailureCode =
  | "decode_failed"
  | "lookup_failed"
  | "attribution_failed"
  | "unsupported_action"
  | "elapsed_time"
  | "range_too_large"
  | "budget_exhausted";

export type StyfiVeyfiIgnoredLogReason =
  | "removed"
  | "internal_styfi_deposit"
  | "internal_styfi_withdrawal"
  | "non_burn_transfer"
  | "paired_withdraw_burn"
  | "paired_legacy_penalty";

export interface StyfiVeyfiIgnoredLog {
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly reason: StyfiVeyfiIgnoredLogReason;
}

export interface StyfiVeyfiScanFailure {
  readonly code: StyfiVeyfiScanFailureCode;
  readonly blockNumber: number;
}

export interface ChunkScanResult {
  readonly actions: NormalizedAction[];
  readonly ignoredLogs: readonly StyfiVeyfiIgnoredLog[];
  /** Unique blocks whose complete nonempty log evidence passed canonical validation. */
  readonly eventBlocksInspected: number;
  readonly chunkComplete: boolean;
  readonly lastProcessedBlock: number;
  readonly budgetExhausted: boolean;
  readonly failure: StyfiVeyfiScanFailure | null;
}

export interface ChunkScanOptions {
  readonly domainId: "styfi" | "veyfi";
  /** Optional preloaded event-block headers. Missing event headers are loaded lazily. */
  readonly verifiedBlocks?: readonly RpcBlock[];
  readonly isBudgetExceeded?: (error: unknown) => boolean;
  readonly isElapsedTimeExceeded?: (error: unknown) => boolean;
}

export class YfiScanBlockError extends Error {
  constructor(readonly failure: StyfiVeyfiScanFailure) {
    super(`yfi_scan_${failure.code}:${failure.blockNumber}`);
    this.name = "YfiScanBlockError";
  }
}

class StyfiVeyfiScannerStageError extends Error {
  constructor(
    readonly code: Exclude<StyfiVeyfiScanFailureCode, "budget_exhausted">,
    readonly cause: unknown,
    readonly blockNumber?: number,
  ) {
    super(code);
    this.name = "StyfiVeyfiScannerStageError";
  }
}

type DecodeOutcome =
  | { readonly status: "action"; readonly action: NormalizedAction }
  | { readonly status: "ignored"; readonly reason: StyfiVeyfiIgnoredLogReason };

function actionOutcome(action: NormalizedAction): DecodeOutcome {
  return { status: "action", action };
}

function ignoredOutcome(reason: StyfiVeyfiIgnoredLogReason): DecodeOutcome {
  return { status: "ignored", reason };
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function requireNonZeroAddress(address: Address, label: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || isZeroAddress(address)) {
    throw new Error(`${label}_invalid`);
  }
  return address;
}

function isZeroAddress(address: string | null | undefined): boolean {
  return Boolean(address) && normalizeAddress(address as string) === normalizeAddress(ZERO_ADDRESS);
}

function toEventTopics(topics: string[]): [Hex, ...Hex[]] {
  if (topics.length === 0) {
    throw new Error("Cannot decode log without topics");
  }

  return topics as [Hex, ...Hex[]];
}

function getTokenSymbolByContract(address: string): string | null {
  if (address === normalizeAddress(STYFI)) {
    return "stYFI";
  }

  if (address === normalizeAddress(STYFIX)) {
    return "stYFIx";
  }

  const locker = LIQUID_LOCKER_BY_DEPOSITOR.get(address);
  if (locker) {
    return locker.symbol;
  }

  return null;
}

function assertProviderAssetShareRelation(
  contractAddress: string,
  assets: bigint,
  shares: bigint,
): void {
  const locker = LIQUID_LOCKER_BY_DEPOSITOR.get(contractAddress);
  const scale = locker?.scale ?? 1n;
  if (assets !== shares * scale) {
    throw new Error("styfi_veyfi_erc4626_amount_mismatch");
  }
}

function getRequiredLockerSymbolByTokenAddress(tokenAddress: string): string {
  const symbol = LIQUID_LOCKER_SYMBOL_BY_TOKEN.get(tokenAddress);
  if (symbol === undefined) {
    throw new Error("unknown_liquid_locker_token");
  }
  return symbol;
}

function isSupportedAddressTopicPair(
  contractAddress: string,
  topic0: string,
): boolean {
  if (
    topic0 === ERC4626_DEPOSIT_TOPIC.toLowerCase() ||
    topic0 === ERC4626_WITHDRAW_TOPIC.toLowerCase() ||
    topic0 === ERC20_TRANSFER_TOPIC.toLowerCase()
  ) {
    return getTokenSymbolByContract(contractAddress) !== null;
  }
  if (contractAddress === normalizeAddress(LIQUID_LOCKER_REDEMPTION)) {
    return (
      topic0 === LIQUID_LOCKER_REDEEM_TOPIC.toLowerCase() ||
      topic0 === LIQUID_LOCKER_EXCHANGE_TOPIC.toLowerCase()
    );
  }
  if (contractAddress === normalizeAddress(VEYFI_REWARD_DISTRIBUTOR)) {
    return topic0 === VEYFI_DISTRIBUTOR_MIGRATE_TOPIC.toLowerCase();
  }
  if (contractAddress === normalizeAddress(VEYFI)) {
    return (
      topic0 === LEGACY_VEYFI_MODIFY_LOCK_TOPIC.toLowerCase() ||
      topic0 === LEGACY_VEYFI_WITHDRAW_TOPIC.toLowerCase() ||
      topic0 === LEGACY_VEYFI_PENALTY_TOPIC.toLowerCase()
    );
  }
  return false;
}

function getRequiredSupportedLogPair(log: RpcLog): {
  readonly contractAddress: string;
  readonly topic0: string;
} {
  const topic0 = log.topics[0]?.toLowerCase();
  if (!topic0) {
    throw new Error("missing_event_topic");
  }
  const contractAddress = normalizeAddress(log.address);
  if (!isSupportedAddressTopicPair(contractAddress, topic0)) {
    throw new Error("unexpected_monitored_address_topic_pair");
  }
  return { contractAddress, topic0 };
}

function requireCanonicalIndexedAddressTopic(topic: string): void {
  const payload = topic.toLowerCase().replace(/^0x/, "");
  if (
    payload.length !== 64 ||
    !/^[0-9a-f]+$/.test(payload) ||
    payload.slice(0, 24) !== "0".repeat(24)
  ) {
    throw new Error("indexed_address_topic_noncanonical");
  }
}

function validateCanonicalLogShape(log: RpcLog): void {
  const { topic0 } = getRequiredSupportedLogPair(log);
  const shape =
    topic0 === ERC20_TRANSFER_TOPIC.toLowerCase()
      ? { topics: 3, addressTopics: [1, 2], dataWords: 1 }
      : topic0 === ERC4626_DEPOSIT_TOPIC.toLowerCase()
        ? { topics: 3, addressTopics: [1, 2], dataWords: 2 }
        : topic0 === ERC4626_WITHDRAW_TOPIC.toLowerCase()
          ? { topics: 4, addressTopics: [1, 2, 3], dataWords: 2 }
          : topic0 === LIQUID_LOCKER_REDEEM_TOPIC.toLowerCase()
            ? { topics: 2, addressTopics: [1], dataWords: 2 }
            : topic0 === LIQUID_LOCKER_EXCHANGE_TOPIC.toLowerCase()
              ? { topics: 2, addressTopics: [1], dataWords: 1 }
              : topic0 === VEYFI_DISTRIBUTOR_MIGRATE_TOPIC.toLowerCase()
                ? { topics: 2, addressTopics: [1], dataWords: 2 }
                : topic0 === LEGACY_VEYFI_MODIFY_LOCK_TOPIC.toLowerCase()
                  ? { topics: 3, addressTopics: [1, 2], dataWords: 3 }
                  : topic0 === LEGACY_VEYFI_WITHDRAW_TOPIC.toLowerCase() ||
                      topic0 === LEGACY_VEYFI_PENALTY_TOPIC.toLowerCase()
                    ? { topics: 2, addressTopics: [1], dataWords: 2 }
                    : null;
  if (
    shape === null ||
    log.topics.length !== shape.topics ||
    log.data.length !== 2 + shape.dataWords * 64 ||
    !/^0x[0-9a-fA-F]*$/.test(log.data)
  ) {
    throw new Error("event_abi_shape_noncanonical");
  }
  for (const index of shape.addressTopics) {
    requireCanonicalIndexedAddressTopic(log.topics[index]!);
  }
}

function validateSupportedLogSemantics(log: RpcLog): void {
  const { contractAddress, topic0 } = getRequiredSupportedLogPair(log);
  if (topic0 === ERC4626_DEPOSIT_TOPIC.toLowerCase()) {
    const decoded = decodeEventLog({
      abi: ERC4626_DEPOSIT_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });
    const args = decoded.args as {
      sender: Address;
      owner: Address;
      assets: bigint;
      shares: bigint;
    };
    assertProviderAssetShareRelation(contractAddress, args.assets, args.shares);
    requireNonZeroAddress(args.sender, "deposit_sender");
    requireNonZeroAddress(args.owner, "deposit_owner");
    return;
  }
  if (topic0 === ERC4626_WITHDRAW_TOPIC.toLowerCase()) {
    const decoded = decodeEventLog({
      abi: ERC4626_WITHDRAW_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });
    const args = decoded.args as {
      sender: Address;
      receiver: Address;
      owner: Address;
      assets: bigint;
      shares: bigint;
    };
    assertProviderAssetShareRelation(contractAddress, args.assets, args.shares);
    requireNonZeroAddress(args.sender, "withdraw_sender");
    requireNonZeroAddress(args.receiver, "withdraw_receiver");
    requireNonZeroAddress(args.owner, "withdraw_owner");
    return;
  }
  if (topic0 === ERC20_TRANSFER_TOPIC.toLowerCase()) {
    const decoded = decodeEventLog({
      abi: ERC20_TRANSFER_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });
    const args = decoded.args as { sender: Address; receiver: Address };
    if (isZeroAddress(args.sender) && isZeroAddress(args.receiver)) {
      throw new Error("transfer_zero_to_zero");
    }
    if (!isZeroAddress(args.sender)) {
      requireNonZeroAddress(args.sender, "transfer_sender");
    }
    if (!isZeroAddress(args.receiver)) {
      requireNonZeroAddress(args.receiver, "transfer_receiver");
    }
    return;
  }
  if (
    topic0 === LIQUID_LOCKER_REDEEM_TOPIC.toLowerCase() ||
    topic0 === LIQUID_LOCKER_EXCHANGE_TOPIC.toLowerCase()
  ) {
    const decoded = decodeEventLog({
      abi:
        topic0 === LIQUID_LOCKER_REDEEM_TOPIC.toLowerCase()
          ? LIQUID_LOCKER_REDEEM_ABI
          : LIQUID_LOCKER_EXCHANGE_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });
    const token = (decoded.args as { token: Address }).token;
    requireNonZeroAddress(token, "liquid_locker_token");
    try {
      getRequiredLockerSymbolByTokenAddress(normalizeAddress(token));
    } catch (error) {
      throw new StyfiVeyfiScannerStageError(
        "unsupported_action",
        error,
        log.blockNumber ?? undefined,
      );
    }
    return;
  }
  if (topic0 === VEYFI_DISTRIBUTOR_MIGRATE_TOPIC.toLowerCase()) {
    const decoded = decodeEventLog({
      abi: VEYFI_DISTRIBUTOR_MIGRATE_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });
    requireNonZeroAddress(
      (decoded.args as { account: Address }).account,
      "migration_account",
    );
    return;
  }
  if (topic0 === LEGACY_VEYFI_MODIFY_LOCK_TOPIC.toLowerCase()) {
    const decoded = decodeEventLog({
      abi: LEGACY_VEYFI_MODIFY_LOCK_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });
    const args = decoded.args as { sender: Address; user: Address };
    requireNonZeroAddress(args.sender, "legacy_lock_sender");
    requireNonZeroAddress(args.user, "legacy_lock_user");
    return;
  }
  const decoded = decodeEventLog({
    abi:
      topic0 === LEGACY_VEYFI_WITHDRAW_TOPIC.toLowerCase()
        ? LEGACY_VEYFI_WITHDRAW_ABI
        : LEGACY_VEYFI_PENALTY_ABI,
    topics: toEventTopics(log.topics),
    data: log.data as Hex,
  });
  requireNonZeroAddress(
    (decoded.args as { user: Address }).user,
    contractAddress === normalizeAddress(VEYFI)
      ? "legacy_withdraw_user"
      : "legacy_user",
  );
}

function getRequiredLogMetadata(
  log: RpcLog,
): Pick<NormalizedAction, "txHash" | "blockNumber" | "logIndex" | "source"> {
  if (
    log.transactionHash === null ||
    log.blockNumber === null ||
    log.logIndex === null
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

function buildAction(
  log: RpcLog,
  action: Omit<
    NormalizedAction,
    "txHash" | "blockNumber" | "logIndex" | "source"
  >,
): NormalizedAction {
  const metadata = getRequiredLogMetadata(log);

  if (action.principal === undefined) {
    if (action.user === null) {
      throw new Error("action_principal_missing");
    }
    return {
      ...action,
      principal: { kind: "proven", address: action.user },
      ...metadata,
    };
  }

  return {
    ...action,
    ...metadata,
  };
}

function classifyModifyLockAction(
  previous: LegacyLockSnapshot,
  amount: bigint,
  locktime: bigint,
): "lock" | "extension" | "update" {
  const previousAmount = previous.amount > 0n ? previous.amount : 0n;

  if (previousAmount === 0n && amount > 0n) {
    return "lock";
  }

  if (previous.end < locktime && previousAmount === amount) {
    return "extension";
  }

  return "update";
}

function getLegacyLockSnapshotAtPreviousBlock(
  cache: Map<string, LegacyLockSnapshot>,
  user: Address,
  eventBlockNumber: number,
): LegacyLockSnapshot {
  const previousBlock = Math.max(MIN_BLOCK_NUMBER, eventBlockNumber - 1);
  const key = `${normalizeAddress(user)}:${previousBlock}`;
  const snapshot = cache.get(key);
  if (snapshot === undefined) {
    throw new StyfiVeyfiScannerStageError(
      "lookup_failed",
      new Error("legacy_lock_snapshot_not_seeded"),
      eventBlockNumber,
    );
  }
  return snapshot;
}

async function seedParentSnapshotsForBlock(params: {
  readonly rpc: RpcClient;
  readonly logs: readonly RpcLog[];
  readonly legacyLockCache: Map<string, LegacyLockSnapshot>;
  readonly cooldownRemainingByAccount: Map<string, bigint>;
  readonly blockNumber: number;
  readonly parentBlockHash: string;
}): Promise<void> {
  const lockUsers = new Map<string, Address>();
  const streamAccounts = new Map<
    string,
    { readonly contract: Address; readonly owner: Address }
  >();
  for (const log of params.logs) {
    if (log.removed) continue;
    const topic0 = log.topics[0]?.toLowerCase();
    if (
      normalizeAddress(log.address) === normalizeAddress(VEYFI) &&
      topic0 === LEGACY_VEYFI_MODIFY_LOCK_TOPIC.toLowerCase()
    ) {
      const decoded = decodeEventLog({
        abi: LEGACY_VEYFI_MODIFY_LOCK_ABI,
        topics: toEventTopics(log.topics),
        data: log.data as Hex,
      });
      const user = (decoded.args as { user: Address }).user;
      lockUsers.set(normalizeAddress(user), user);
    }
    if (topic0 === ERC20_TRANSFER_TOPIC.toLowerCase()) {
      const decoded = decodeEventLog({
        abi: ERC20_TRANSFER_ABI,
        topics: toEventTopics(log.topics),
        data: log.data as Hex,
      });
      const args = decoded.args as {
        sender: Address;
        receiver: Address;
      };
      if (normalizeAddress(args.receiver) === normalizeAddress(ZERO_ADDRESS)) {
        const key = cooldownStreamKey(log.address, args.sender);
        streamAccounts.set(key, {
          contract: log.address as Address,
          owner: args.sender,
        });
      }
    } else if (topic0 === ERC4626_WITHDRAW_TOPIC.toLowerCase()) {
      const decoded = decodeEventLog({
        abi: ERC4626_WITHDRAW_ABI,
        topics: toEventTopics(log.topics),
        data: log.data as Hex,
      });
      const owner = (decoded.args as { owner: Address }).owner;
      const key = cooldownStreamKey(log.address, owner);
      streamAccounts.set(key, { contract: log.address as Address, owner });
    }
  }
  const reads = [
    ...[...lockUsers.values()].map((user) => ({
      kind: "legacy_lock" as const,
      user,
      request: {
        to: VEYFI,
        data: encodeFunctionData({
          abi: LEGACY_VEYFI_LOCKED_ABI,
          functionName: "locked",
          args: [user],
        }),
      },
    })),
    ...[...streamAccounts.values()].map(({ contract, owner }) => ({
      kind: "cooldown_stream" as const,
      contract,
      owner,
      request: {
        to: contract,
        data: encodeFunctionData({
          abi: COOLDOWN_STREAMS_ABI,
          functionName: "streams",
          args: [owner],
        }),
      },
    })),
  ];
  if (reads.length === 0) return;

  let responses: string[];
  try {
    responses = await params.rpc.call(
      reads.map((read) => read.request),
      {
        blockHash: params.parentBlockHash,
        requireCanonical: true,
      },
    );
  } catch (error) {
    throw new StyfiVeyfiScannerStageError(
      "lookup_failed",
      error,
      params.blockNumber,
    );
  }
  if (responses.length !== reads.length) {
    throw new StyfiVeyfiScannerStageError(
      "lookup_failed",
      new Error("parent_snapshot_batch_cardinality_mismatch"),
      params.blockNumber,
    );
  }
  for (let index = 0; index < reads.length; index += 1) {
    const read = reads[index]!;
    try {
      if (read.kind === "legacy_lock") {
        if (!/^0x[0-9a-fA-F]{128}$/.test(responses[index] ?? "")) {
          throw new Error("legacy_lock_result_noncanonical");
        }
        const [amount, end] = decodeFunctionResult({
          abi: LEGACY_VEYFI_LOCKED_ABI,
          functionName: "locked",
          data: responses[index] as Hex,
        }) as readonly [bigint, bigint];
        const previousBlock = Math.max(MIN_BLOCK_NUMBER, params.blockNumber - 1);
        params.legacyLockCache.set(
          `${normalizeAddress(read.user)}:${previousBlock}`,
          { amount, end },
        );
        continue;
      }
      if (!/^0x[0-9a-fA-F]{192}$/.test(responses[index] ?? "")) {
        throw new Error("cooldown_stream_result_noncanonical");
      }
      const [, total, claimed] = decodeFunctionResult({
        abi: COOLDOWN_STREAMS_ABI,
        functionName: "streams",
        data: responses[index] as Hex,
      }) as readonly [bigint, bigint, bigint];
      if (claimed > total) {
        throw new Error("cooldown_stream_result_invalid");
      }
      params.cooldownRemainingByAccount.set(
        cooldownStreamKey(read.contract, read.owner),
        total - claimed,
      );
    } catch (error) {
      throw new StyfiVeyfiScannerStageError(
        "lookup_failed",
        error,
        params.blockNumber,
      );
    }
  }
}

function decodeLogToAction(
  log: RpcLog,
  legacyLockCache: Map<string, LegacyLockSnapshot>,
  cooldownRemainingByAccount: Map<string, bigint>,
  internalStyfiDepositLogIndices: ReadonlySet<number>,
  internalStyfiBurnLogIndices: ReadonlySet<number>,
  internalStyfiWithdrawalLogIndices: ReadonlySet<number>,
  legacyPenaltyByWithdrawLogIndex: ReadonlyMap<number, bigint>,
  pairedLegacyPenaltyLogIndices: ReadonlySet<number>,
): DecodeOutcome {
  const { contractAddress, topic0 } = getRequiredSupportedLogPair(log);
  if (log.removed) {
    return ignoredOutcome("removed");
  }

  if (topic0 === ERC4626_DEPOSIT_TOPIC.toLowerCase()) {
    const tokenSymbol = getTokenSymbolByContract(contractAddress);
    if (tokenSymbol === null) {
      throw new Error("unsupported_erc4626_deposit_provider");
    }

    const decoded = decodeEventLog({
      abi: ERC4626_DEPOSIT_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });

    const args = decoded.args as {
      sender: Address;
      owner: Address;
      assets: bigint;
      shares: bigint;
    };
    assertProviderAssetShareRelation(contractAddress, args.assets, args.shares);
    const owner = requireNonZeroAddress(args.owner, "deposit_owner");
    const sender = requireNonZeroAddress(args.sender, "deposit_sender");

    // stYFIx deposits also emit an internal stYFI deposit in the same tx.
    // Decode it first so malformed provider data cannot use the intentional
    // ignore path to advance the block.
    if (
      tokenSymbol === "stYFI" &&
      log.logIndex !== null &&
      internalStyfiDepositLogIndices.has(log.logIndex)
    ) {
      return ignoredOutcome("internal_styfi_deposit");
    }

    return actionOutcome(buildAction(log, {
      kind: "staked",
      tokenSymbol,
      user: owner,
      owner,
      receiver: owner,
      caller: sender,
      amounts: {
        assets: args.assets,
        shares: args.shares,
      },
    }));
  }

  if (topic0 === ERC4626_WITHDRAW_TOPIC.toLowerCase()) {
    const tokenSymbol = getTokenSymbolByContract(contractAddress);
    if (tokenSymbol === null) {
      throw new Error("unsupported_erc4626_withdraw_provider");
    }

    const decoded = decodeEventLog({
      abi: ERC4626_WITHDRAW_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });

    const args = decoded.args as {
      sender: Address;
      receiver: Address;
      owner: Address;
      assets: bigint;
      shares: bigint;
    };
    assertProviderAssetShareRelation(contractAddress, args.assets, args.shares);
    const owner = requireNonZeroAddress(args.owner, "withdraw_owner");
    const receiver = requireNonZeroAddress(args.receiver, "withdraw_receiver");
    const sender = requireNonZeroAddress(args.sender, "withdraw_sender");
    const streamKey = cooldownStreamKey(log.address, owner);
    const priorRemaining = cooldownRemainingByAccount.get(streamKey);
    if (priorRemaining === undefined || args.shares > priorRemaining) {
      throw new Error("cooldown_stream_withdrawal_mismatch");
    }
    cooldownRemainingByAccount.set(streamKey, priorRemaining - args.shares);
    if (
      tokenSymbol === "stYFI" &&
      log.logIndex !== null &&
      internalStyfiWithdrawalLogIndices.has(log.logIndex)
    ) {
      return ignoredOutcome("internal_styfi_withdrawal");
    }

    return actionOutcome(buildAction(log, {
      kind: "withdrew_from_cooldown",
      tokenSymbol,
      user: owner,
      owner,
      receiver,
      caller: sender,
      amounts: {
        assets: args.assets,
        shares: args.shares,
      },
    }));
  }

  if (topic0 === ERC20_TRANSFER_TOPIC.toLowerCase()) {
    const tokenSymbol = getTokenSymbolByContract(contractAddress);
    if (tokenSymbol === null) {
      throw new Error("unsupported_transfer_provider");
    }

    const decoded = decodeEventLog({
      abi: ERC20_TRANSFER_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });

    const args = decoded.args as {
      sender: Address;
      receiver: Address;
      value: bigint;
    };

    if (normalizeAddress(args.receiver) !== normalizeAddress(ZERO_ADDRESS)) {
      return ignoredOutcome("non_burn_transfer");
    }
    const burnOwner = requireNonZeroAddress(args.sender, "burn_owner");
    const streamKey = cooldownStreamKey(log.address, burnOwner);
    const priorRemaining = cooldownRemainingByAccount.get(streamKey);
    if (priorRemaining === undefined) {
      throw new Error("cooldown_stream_snapshot_missing");
    }
    cooldownRemainingByAccount.set(streamKey, priorRemaining + args.value);
    if (
      log.logIndex !== null &&
      internalStyfiBurnLogIndices.has(log.logIndex)
    ) {
      return ignoredOutcome("paired_withdraw_burn");
    }

    if (
      contractAddress === normalizeAddress(STYFI) &&
      normalizeAddress(burnOwner) === normalizeAddress(STYFIX)
    ) {
      throw new Error("unmatched_internal_styfi_burn");
    }

    let assets = args.value;
    const locker = LIQUID_LOCKER_BY_DEPOSITOR.get(contractAddress);
    if (locker) {
      // Unstake emits burned shares; convert to asset units for LLYFI alerts.
      assets = args.value * locker.scale;
    }

    return actionOutcome(buildAction(log, {
      kind: "initiated_cooldown",
      tokenSymbol,
      user: burnOwner,
      cooldownRestarted: priorRemaining > 0n,
      amounts: {
        shares: args.value,
        assets,
      },
    }));
  }

  if (
    topic0 === LIQUID_LOCKER_REDEEM_TOPIC.toLowerCase() &&
    contractAddress === normalizeAddress(LIQUID_LOCKER_REDEMPTION)
  ) {
    const decoded = decodeEventLog({
      abi: LIQUID_LOCKER_REDEEM_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });

    const args = decoded.args as {
      token: Address;
      amount: bigint;
      fee: bigint;
    };
    return actionOutcome(buildAction(log, {
      kind: "redeem",
      tokenSymbol: getRequiredLockerSymbolByTokenAddress(normalizeAddress(args.token)),
      user: null,
      principal: {
        kind: "unavailable",
        reason: "canonical_sender_unavailable",
      },
      amounts: {
        amount: args.amount,
        // The redeem event encodes fee as a 1e18-scaled rate, not a YFI amount.
        fee: args.fee,
      },
    }));
  }

  if (
    topic0 === LIQUID_LOCKER_EXCHANGE_TOPIC.toLowerCase() &&
    contractAddress === normalizeAddress(LIQUID_LOCKER_REDEMPTION)
  ) {
    const decoded = decodeEventLog({
      abi: LIQUID_LOCKER_EXCHANGE_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });

    const args = decoded.args as {
      token: Address;
      amount: bigint;
    };

    return actionOutcome(buildAction(log, {
      kind: "exchange",
      tokenSymbol: getRequiredLockerSymbolByTokenAddress(normalizeAddress(args.token)),
      user: null,
      principal: {
        kind: "unavailable",
        reason: "canonical_sender_unavailable",
      },
      amounts: {
        amount: args.amount,
      },
    }));
  }

  if (
    topic0 === VEYFI_DISTRIBUTOR_MIGRATE_TOPIC.toLowerCase() &&
    contractAddress === normalizeAddress(VEYFI_REWARD_DISTRIBUTOR)
  ) {
    const decoded = decodeEventLog({
      abi: VEYFI_DISTRIBUTOR_MIGRATE_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });

    const args = decoded.args as {
      account: Address;
      unlock_epoch: bigint;
      amount: bigint;
    };
    const account = requireNonZeroAddress(args.account, "migration_account");

    return actionOutcome(buildAction(log, {
      kind: "migrate",
      tokenSymbol: "veYFI",
      user: account,
      amounts: {
        amount: args.amount,
        unlockEpoch: args.unlock_epoch,
      },
    }));
  }

  if (
    topic0 === LEGACY_VEYFI_MODIFY_LOCK_TOPIC.toLowerCase() &&
    contractAddress === normalizeAddress(VEYFI)
  ) {
    const decoded = decodeEventLog({
      abi: LEGACY_VEYFI_MODIFY_LOCK_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });

    const args = decoded.args as {
      sender: Address;
      user: Address;
      amount: bigint;
      locktime: bigint;
    };
    const user = requireNonZeroAddress(args.user, "legacy_lock_user");
    const sender = requireNonZeroAddress(args.sender, "legacy_lock_sender");

    if (log.blockNumber === null) {
      throw new Error("missing_block_number");
    }

    const previousLock = getLegacyLockSnapshotAtPreviousBlock(
      legacyLockCache,
      user,
      log.blockNumber,
    );
    const cacheKey = `${normalizeAddress(user)}:${Math.max(
      MIN_BLOCK_NUMBER,
      log.blockNumber - 1,
    )}`;
    legacyLockCache.set(cacheKey, { amount: args.amount, end: args.locktime });
    return actionOutcome(buildAction(log, {
      kind: classifyModifyLockAction(previousLock, args.amount, args.locktime),
      tokenSymbol: "veYFI",
      user,
      caller: sender,
      amounts: {
        amount: args.amount,
        locktime: args.locktime,
        previousAmount: previousLock.amount,
        previousLocktime: previousLock.end,
      },
    }));
  }

  if (
    topic0 === LEGACY_VEYFI_WITHDRAW_TOPIC.toLowerCase() &&
    contractAddress === normalizeAddress(VEYFI)
  ) {
    const decoded = decodeEventLog({
      abi: LEGACY_VEYFI_WITHDRAW_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });

    const args = decoded.args as {
      user: Address;
      amount: bigint;
      ts: bigint;
    };
    const user = requireNonZeroAddress(args.user, "legacy_withdraw_user");
    const penalty =
      log.logIndex === null
        ? 0n
        : (legacyPenaltyByWithdrawLogIndex.get(log.logIndex) ?? 0n);

    return actionOutcome(buildAction(log, {
      kind: "legacy_withdraw",
      tokenSymbol: "veYFI",
      user,
      amounts: {
        amount: args.amount,
        penalty,
      },
    }));
  }

  if (
    topic0 === LEGACY_VEYFI_PENALTY_TOPIC.toLowerCase() &&
    contractAddress === normalizeAddress(VEYFI)
  ) {
    if (log.logIndex === null || !pairedLegacyPenaltyLogIndices.has(log.logIndex)) {
      throw new Error("unpaired_legacy_penalty");
    }
    return ignoredOutcome("paired_legacy_penalty");
  }

  throw new Error("unhandled_supported_address_topic_pair");
}

function buildLegacyPenaltyPairs(logs: readonly RpcLog[]): {
  readonly penaltyByWithdrawLogIndex: ReadonlyMap<number, bigint>;
  readonly pairedPenaltyLogIndices: ReadonlySet<number>;
} {
  const pending = new Map<
    string,
    Array<{ readonly amount: bigint; readonly logIndex: number }>
  >();
  const penaltyByWithdrawLogIndex = new Map<number, bigint>();
  const pairedPenaltyLogIndices = new Set<number>();
  const pairKey = (txHash: string, user: string, ts: bigint) =>
    `${txHash.toLowerCase()}:${normalizeAddress(user)}:${ts.toString()}`;

  for (const log of logs) {
    if (
      log.removed ||
      log.transactionHash === null ||
      log.logIndex === null ||
      normalizeAddress(log.address) !== normalizeAddress(VEYFI)
    ) {
      continue;
    }
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 === LEGACY_VEYFI_PENALTY_TOPIC.toLowerCase()) {
      const decoded = decodeEventLog({
        abi: LEGACY_VEYFI_PENALTY_ABI,
        topics: toEventTopics(log.topics),
        data: log.data as Hex,
      });
      const args = decoded.args as { user: Address; amount: bigint; ts: bigint };
      const key = pairKey(log.transactionHash, args.user, args.ts);
      const queue = pending.get(key) ?? [];
      queue.push({ amount: args.amount, logIndex: log.logIndex });
      pending.set(key, queue);
      continue;
    }
    if (topic0 !== LEGACY_VEYFI_WITHDRAW_TOPIC.toLowerCase()) continue;
    const decoded = decodeEventLog({
      abi: LEGACY_VEYFI_WITHDRAW_ABI,
      topics: toEventTopics(log.topics),
      data: log.data as Hex,
    });
    const args = decoded.args as { user: Address; amount: bigint; ts: bigint };
    const key = pairKey(log.transactionHash, args.user, args.ts);
    const queue = pending.get(key) ?? [];
    const penalty = queue.shift();
    if (queue.length === 0) pending.delete(key);
    if (penalty !== undefined) {
      penaltyByWithdrawLogIndex.set(log.logIndex, penalty.amount);
      pairedPenaltyLogIndices.add(penalty.logIndex);
    }
  }

  if ([...pending.values()].some((queue) => queue.length > 0)) {
    throw new Error("unpaired_legacy_penalty");
  }
  return { penaltyByWithdrawLogIndex, pairedPenaltyLogIndices };
}

interface InternalStyfiCompanion {
  readonly txHash: string;
  readonly amount: bigint;
  readonly logIndex: number;
}

function consumeOrderedCompanions(
  inner: readonly InternalStyfiCompanion[],
  outer: readonly InternalStyfiCompanion[],
  label: string,
): Set<number> {
  const pairedInnerIndices = new Set<number>();
  const ordered = [
    ...inner.map((companion) => ({ role: "inner" as const, companion })),
    ...outer.map((companion) => ({ role: "outer" as const, companion })),
  ].sort((left, right) => left.companion.logIndex - right.companion.logIndex);
  if (ordered.length % 2 !== 0) throw new Error(`${label}_count_mismatch`);
  for (let index = 0; index < ordered.length; index += 2) {
    const first = ordered[index];
    const second = ordered[index + 1];
    if (
      first?.role !== "inner" ||
      second?.role !== "outer" ||
      first.companion.txHash !== second.companion.txHash ||
      first.companion.amount !== second.companion.amount
    ) {
      throw new Error(`${label}_sequence_mismatch`);
    }
    pairedInnerIndices.add(first.companion.logIndex);
  }
  return pairedInnerIndices;
}

function consumeOrderedWithdrawalTriples(
  innerBurns: readonly InternalStyfiCompanion[],
  innerWithdrawals: readonly InternalStyfiCompanion[],
  outerBurns: readonly InternalStyfiCompanion[],
): {
  readonly burnLogIndices: ReadonlySet<number>;
  readonly withdrawalLogIndices: ReadonlySet<number>;
} {
  const burnLogIndices = new Set<number>();
  const withdrawalLogIndices = new Set<number>();
  const ordered = [
    ...innerBurns.map((companion) => ({ role: "inner_burn" as const, companion })),
    ...innerWithdrawals.map((companion) => ({
      role: "inner_withdrawal" as const,
      companion,
    })),
    ...outerBurns.map((companion) => ({ role: "outer_burn" as const, companion })),
  ].sort((left, right) => left.companion.logIndex - right.companion.logIndex);
  if (ordered.length % 3 !== 0) {
    throw new Error("styfix_withdrawal_companion_count_mismatch");
  }
  for (let index = 0; index < ordered.length; index += 3) {
    const innerBurn = ordered[index];
    const withdrawal = ordered[index + 1];
    const outerBurn = ordered[index + 2];
    if (
      innerBurn?.role !== "inner_burn" ||
      withdrawal?.role !== "inner_withdrawal" ||
      outerBurn?.role !== "outer_burn" ||
      innerBurn.companion.txHash !== withdrawal.companion.txHash ||
      innerBurn.companion.txHash !== outerBurn.companion.txHash ||
      innerBurn.companion.amount !== withdrawal.companion.amount ||
      innerBurn.companion.amount !== outerBurn.companion.amount
    ) {
      throw new Error("styfix_withdrawal_companion_sequence_mismatch");
    }
    burnLogIndices.add(innerBurn.companion.logIndex);
    withdrawalLogIndices.add(withdrawal.companion.logIndex);
  }
  return { burnLogIndices, withdrawalLogIndices };
}

function buildStyfixInternalCompanions(logs: readonly RpcLog[]): {
  readonly depositLogIndices: ReadonlySet<number>;
  readonly burnLogIndices: ReadonlySet<number>;
  readonly withdrawalLogIndices: ReadonlySet<number>;
} {
  const innerDeposits: InternalStyfiCompanion[] = [];
  const outerDeposits: InternalStyfiCompanion[] = [];
  const innerWithdrawals: InternalStyfiCompanion[] = [];
  const innerBurns: InternalStyfiCompanion[] = [];
  const outerBurns: InternalStyfiCompanion[] = [];

  for (const log of logs) {
    if (
      log.removed ||
      log.transactionHash === null ||
      log.logIndex === null
    ) {
      continue;
    }
    const address = normalizeAddress(log.address);
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 === ERC4626_DEPOSIT_TOPIC.toLowerCase()) {
      const decoded = decodeEventLog({
        abi: ERC4626_DEPOSIT_ABI,
        topics: toEventTopics(log.topics),
        data: log.data as Hex,
      });
      const args = decoded.args as {
        sender: Address;
        owner: Address;
        assets: bigint;
        shares: bigint;
      };
      const companion = {
        txHash: log.transactionHash.toLowerCase(),
        amount: args.assets,
        logIndex: log.logIndex,
      };
      if (address === normalizeAddress(STYFIX)) {
        if (args.assets !== args.shares) {
          throw new Error("styfix_deposit_companion_amount_mismatch");
        }
        outerDeposits.push(companion);
      } else if (
        address === normalizeAddress(STYFI) &&
        normalizeAddress(args.sender) === normalizeAddress(STYFIX) &&
        normalizeAddress(args.owner) === normalizeAddress(STYFIX)
      ) {
        if (args.assets !== args.shares) {
          throw new Error("internal_styfi_deposit_amount_mismatch");
        }
        innerDeposits.push(companion);
      }
      continue;
    }
    if (
      address === normalizeAddress(STYFI) &&
      topic0 === ERC4626_WITHDRAW_TOPIC.toLowerCase()
    ) {
      const decoded = decodeEventLog({
        abi: ERC4626_WITHDRAW_ABI,
        topics: toEventTopics(log.topics),
        data: log.data as Hex,
      });
      const args = decoded.args as {
        sender: Address;
        receiver: Address;
        owner: Address;
        assets: bigint;
        shares: bigint;
      };
      if (
        normalizeAddress(args.sender) === normalizeAddress(STYFIX) &&
        normalizeAddress(args.receiver) === normalizeAddress(STYFIX) &&
        normalizeAddress(args.owner) === normalizeAddress(STYFIX)
      ) {
        if (args.assets !== args.shares) {
          throw new Error("internal_styfi_withdrawal_amount_mismatch");
        }
        innerWithdrawals.push({
          txHash: log.transactionHash.toLowerCase(),
          amount: args.assets,
          logIndex: log.logIndex,
        });
      }
      continue;
    }
    if (topic0 === ERC20_TRANSFER_TOPIC.toLowerCase()) {
      const decoded = decodeEventLog({
        abi: ERC20_TRANSFER_ABI,
        topics: toEventTopics(log.topics),
        data: log.data as Hex,
      });
      const args = decoded.args as {
        sender: Address;
        receiver: Address;
        value: bigint;
      };
      if (
        normalizeAddress(args.receiver) === normalizeAddress(ZERO_ADDRESS) &&
        address === normalizeAddress(STYFI) &&
        normalizeAddress(args.sender) === normalizeAddress(STYFIX)
      ) {
        innerBurns.push({
          txHash: log.transactionHash.toLowerCase(),
          amount: args.value,
          logIndex: log.logIndex,
        });
      } else if (
        normalizeAddress(args.receiver) === normalizeAddress(ZERO_ADDRESS) &&
        address === normalizeAddress(STYFIX)
      ) {
        outerBurns.push({
          txHash: log.transactionHash.toLowerCase(),
          amount: args.value,
          logIndex: log.logIndex,
        });
      }
    }
  }

  const withdrawals = consumeOrderedWithdrawalTriples(
    innerBurns,
    innerWithdrawals,
    outerBurns,
  );
  return {
    depositLogIndices: consumeOrderedCompanions(
      innerDeposits,
      outerDeposits,
      "styfix_deposit_companion",
    ),
    burnLogIndices: withdrawals.burnLogIndices,
    withdrawalLogIndices: withdrawals.withdrawalLogIndices,
  };
}

function asNonZeroAddress(value: unknown): Address | null {
  return typeof value === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(value) &&
    !isZeroAddress(value)
    ? (value as Address)
    : null;
}

interface ProvisionalBlockGroup {
  readonly blockNumber: number;
  readonly actions: NormalizedAction[];
  readonly ignoredLogs: StyfiVeyfiIgnoredLog[];
  readonly directStyfiExitProofs: readonly DirectStyfiExitProof[];
}

interface DirectStyfiExitProof {
  readonly txHash: string;
  readonly burn: NormalizedAction;
  readonly withdrawal: NormalizedAction;
}

function buildDirectStyfiExitProofs(
  blockNumber: number,
  actions: readonly NormalizedAction[],
): readonly DirectStyfiExitProof[] {
  const byTransaction = new Map<string, NormalizedAction[]>();
  for (const action of actions) {
    if (action.tokenSymbol !== "stYFI") continue;
    const relevant = byTransaction.get(action.txHash.toLowerCase()) ?? [];
    relevant.push(action);
    byTransaction.set(action.txHash.toLowerCase(), relevant);
  }

  const proofs: DirectStyfiExitProof[] = [];
  for (const [txHash, relevant] of byTransaction) {
    const burns = relevant.filter((action) => action.kind === "initiated_cooldown");
    const withdrawals = relevant.filter(
      (action) => action.kind === "withdrew_from_cooldown",
    );
    if (burns.length === 0 || withdrawals.length === 0) continue;
    if (burns.length !== 1 || withdrawals.length !== 1 || relevant.length !== 2) {
      throw new StyfiVeyfiScannerStageError(
        "attribution_failed",
        new Error("direct_styfi_exit_ambiguous"),
        blockNumber,
      );
    }
    proofs.push({ txHash, burn: burns[0]!, withdrawal: withdrawals[0]! });
  }
  return proofs;
}

interface BatchRequirement {
  readonly blockNumber: number;
  readonly code: "lookup_failed" | "attribution_failed";
  readonly missingAllowed: boolean;
}

function addBatchRequirement(
  requirements: Map<string, BatchRequirement>,
  action: NormalizedAction,
  code: BatchRequirement["code"],
): void {
  const hash = action.txHash.toLowerCase();
  const existing = requirements.get(hash);
  const missingAllowed = code === "lookup_failed";
  if (
    existing === undefined ||
    action.blockNumber < existing.blockNumber ||
    (action.blockNumber === existing.blockNumber && !missingAllowed && existing.missingAllowed)
  ) {
    requirements.set(hash, {
      blockNumber: action.blockNumber,
      code,
      missingAllowed,
    });
  }
}

function earliestRequirement(
  requirements: ReadonlyMap<string, BatchRequirement>,
): BatchRequirement | null {
  let earliest: BatchRequirement | null = null;
  for (const requirement of requirements.values()) {
    if (
      earliest === null ||
      requirement.blockNumber < earliest.blockNumber ||
      (requirement.blockNumber === earliest.blockNumber &&
        !requirement.missingAllowed &&
        earliest.missingAllowed)
    ) {
      earliest = requirement;
    }
  }
  return earliest;
}

interface BatchResponseFailure {
  readonly requirement: BatchRequirement;
  readonly cause: Error;
}

interface ValidatedBatchResponse<T> {
  readonly values: Map<string, T | null>;
  readonly failure: BatchResponseFailure | null;
}

function validateBatchResponse<T>(params: {
  readonly response: readonly (T | null)[];
  readonly hashes: readonly string[];
  readonly requirements: ReadonlyMap<string, BatchRequirement>;
  readonly responseHash: (value: T) => string | null;
  readonly label: string;
}): ValidatedBatchResponse<T> {
  const fallback = earliestRequirement(params.requirements);
  if (params.response.length > params.hashes.length) {
    return {
      values: new Map(),
      failure: fallback
        ? {
            requirement: fallback,
            cause: new Error(`${params.label}_batch_cardinality_mismatch`),
          }
        : null,
    };
  }

  const result = new Map<string, T | null>();
  for (let index = 0; index < params.hashes.length; index += 1) {
    const requestedHash = params.hashes[index];
    if (requestedHash === undefined) {
      break;
    }
    const normalizedRequestedHash = requestedHash.toLowerCase();
    const requirement = params.requirements.get(normalizedRequestedHash);
    const responseMissing = index >= params.response.length;
    if (responseMissing) {
      return {
        values: result,
        failure: requirement
          ? {
              requirement,
              cause: new Error(`${params.label}_batch_cardinality_mismatch`),
            }
          : fallback
            ? {
                requirement: fallback,
                cause: new Error(`${params.label}_batch_cardinality_mismatch`),
              }
            : null,
      };
    }
    const value = params.response[index] ?? null;
    if (value === null && requirement !== undefined && !requirement.missingAllowed) {
      return {
        values: result,
        failure: {
          requirement,
          cause: new Error(`${params.label}_required_value_missing`),
        },
      };
    }
    if (value !== null) {
      const returnedHash = params.responseHash(value)?.toLowerCase() ?? null;
      if (returnedHash !== normalizedRequestedHash) {
        return {
          values: result,
          failure: requirement
            ? {
                requirement: {
                  ...requirement,
                  code: "attribution_failed",
                  missingAllowed: false,
                },
                cause: new Error(`${params.label}_batch_hash_mismatch`),
              }
            : null,
        };
      }
    }
    result.set(normalizedRequestedHash, value);
  }

  return { values: result, failure: null };
}

function decodeStyfiExitCall(transaction: RpcTransaction): {
  readonly functionName: "withdraw" | "redeem";
  readonly sender: Address;
  readonly receiver: Address;
  readonly owner: Address;
  readonly amount: bigint;
} {
  const attributed = decodeAttributedProtocolCall(transaction, STYFI);
  const sender = attributed.principal;

  const decoded = decodeFunctionData({
    abi: STYFI_EXIT_CALL_ABI,
    data: attributed.input,
  });
  if (decoded.functionName !== "withdraw" && decoded.functionName !== "redeem") {
    throw new Error("direct_styfi_exit_selector_invalid");
  }
  const args = decoded.args as readonly unknown[];
  if (
    args.length < 1 ||
    args.length > 3 ||
    attributed.input.length !== 10 + args.length * 64 ||
    typeof args[0] !== "bigint" ||
    args[0] <= 0n
  ) {
    throw new Error("direct_styfi_exit_calldata_invalid");
  }
  const receiver =
    args.length >= 2 ? asNonZeroAddress(args[1]) : sender;
  const owner = args.length >= 3 ? asNonZeroAddress(args[2]) : sender;
  if (receiver === null || owner === null) {
    throw new Error("direct_styfi_exit_actor_invalid");
  }
  const canonicalInput = encodeFunctionData({
    abi: STYFI_EXIT_CALL_ABI,
    functionName: decoded.functionName,
    args: decoded.args,
  });
  if (canonicalInput.toLowerCase() !== attributed.input.toLowerCase()) {
    throw new Error("direct_styfi_exit_calldata_noncanonical");
  }
  return {
    functionName: decoded.functionName,
    sender,
    receiver,
    owner,
    amount: args[0],
  };
}

function applyDirectStyfiExitProofs(
  groups: readonly ProvisionalBlockGroup[],
  txByHash: ReadonlyMap<string, RpcTransaction | null>,
): void {
  for (const group of groups) {
    for (const proof of group.directStyfiExitProofs) {
      const transaction = txByHash.get(proof.txHash) ?? null;
      try {
        if (transaction === null) {
          throw new Error("direct_styfi_exit_transaction_missing");
        }
        const call = decodeStyfiExitCall(transaction);
        const shares = proof.withdrawal.amounts.shares;
        const assets = proof.withdrawal.amounts.assets;
        const burnedShares = proof.burn.amounts.shares;
        if (
          typeof shares !== "bigint" ||
          typeof assets !== "bigint" ||
          typeof burnedShares !== "bigint" ||
          shares <= 0n ||
          assets !== shares ||
          (call.functionName === "withdraw"
            ? call.amount !== assets
            : call.amount !== shares) ||
          burnedShares <= 0n ||
          burnedShares > shares ||
          proof.burn.logIndex >= proof.withdrawal.logIndex ||
          proof.burn.user === null ||
          proof.withdrawal.user === null ||
          normalizeAddress(proof.burn.user) !== normalizeAddress(call.owner) ||
          normalizeAddress(proof.withdrawal.user) !== normalizeAddress(call.owner) ||
          normalizeAddress(proof.withdrawal.owner ?? "") !==
            normalizeAddress(call.owner) ||
          normalizeAddress(proof.withdrawal.receiver ?? "") !==
            normalizeAddress(call.receiver) ||
          normalizeAddress(proof.withdrawal.caller ?? "") !==
            normalizeAddress(call.sender)
        ) {
          throw new Error("direct_styfi_exit_evidence_mismatch");
        }
      } catch (error) {
        throw new StyfiVeyfiScannerStageError(
          "attribution_failed",
          error,
          group.blockNumber,
        );
      }

      const burnIndex = group.actions.indexOf(proof.burn);
      if (burnIndex < 0) {
        throw new StyfiVeyfiScannerStageError(
          "attribution_failed",
          new Error("direct_styfi_exit_burn_missing"),
          group.blockNumber,
        );
      }
      group.actions.splice(burnIndex, 1);
      group.ignoredLogs.push({
        blockNumber: group.blockNumber,
        logIndex: proof.burn.logIndex,
        reason: "paired_withdraw_burn",
      });
      group.ignoredLogs.sort((left, right) => left.logIndex - right.logIndex);
    }
  }
}

function applyRequiredActorData(
  groups: readonly ProvisionalBlockGroup[],
  txByHash: ReadonlyMap<string, RpcTransaction | null>,
): void {
  for (const group of groups) {
    for (const action of group.actions) {
      const normalizedHash = action.txHash.toLowerCase();
      if (action.principal?.kind === "unavailable") {
        const tx = txByHash.get(normalizedHash) ?? null;
        if (tx === null) {
          continue;
        }
        let principal: Address;
        try {
          principal = decodeAttributedProtocolCall(
            tx,
            LIQUID_LOCKER_REDEMPTION,
          ).principal;
        } catch (error) {
          if (
            (action.kind === "redeem" || action.kind === "exchange") &&
            error instanceof UnsupportedProtocolCallEnvelopeError
          ) {
            // The facility event proves the trade even when the router's user is unknown.
            continue;
          }
          throw new StyfiVeyfiScannerStageError(
            "attribution_failed",
            new Error("required_transaction_sender_invalid"),
            group.blockNumber,
          );
        }
        action.user = principal;
        action.principal = { kind: "proven", address: principal };
        action.caller = principal;
      }
    }
  }
}

async function resolveChunkActorData(
  rpc: RpcClient,
  groups: readonly ProvisionalBlockGroup[],
  verifiedByNumber: ReadonlyMap<number, RpcBlock>,
): Promise<void> {
  const transactionRequirements = new Map<string, BatchRequirement>();
  for (const group of groups) {
    for (const action of group.actions) {
      if (action.principal?.kind === "unavailable") {
        addBatchRequirement(
          transactionRequirements,
          action,
          action.kind === "redeem" || action.kind === "exchange"
            ? "lookup_failed"
            : "attribution_failed",
        );
      }
    }
    for (const proof of group.directStyfiExitProofs) {
      addBatchRequirement(
        transactionRequirements,
        proof.withdrawal,
        "attribution_failed",
      );
    }
  }

  const transactionHashes = [...transactionRequirements.keys()];
  const transactionResult = await Promise.allSettled([
    transactionHashes.length === 0
      ? Promise.resolve([] as Array<RpcTransaction | null>)
      : rpc.getTransactionByHash(transactionHashes),
  ]).then(([result]) => result!);

  const failedLookups: Array<{
    readonly requirement: BatchRequirement;
    readonly cause: unknown;
  }> = [];
  if (transactionResult.status === "rejected") {
    const requirement = earliestRequirement(transactionRequirements);
    if (requirement !== null) {
      failedLookups.push({ requirement, cause: transactionResult.reason });
    }
  }
  const validatedTransactions = validateBatchResponse({
    response:
      transactionResult.status === "fulfilled" ? transactionResult.value : [],
    hashes: transactionHashes,
    requirements: transactionRequirements,
    responseHash: (transaction) => transaction.hash,
    label: "transaction",
  });
  if (validatedTransactions.failure) {
    failedLookups.push(validatedTransactions.failure);
  }
  const validateCanonicalResponse = (
    values: ReadonlyMap<
      string,
      RpcTransaction | null
    >,
    requirements: ReadonlyMap<string, BatchRequirement>,
    label: string,
  ) => {
    for (const [hash, requirement] of requirements) {
      const value = values.get(hash);
      const expectedBlock = verifiedByNumber.get(requirement.blockNumber);
      if (value === null && requirement.missingAllowed) {
        continue;
      }
      if (
        expectedBlock === undefined ||
        value === null ||
        value === undefined ||
        value.blockNumber !== expectedBlock.number ||
            value.blockHash === null ||
        value.blockHash.toLowerCase() !== expectedBlock.hash.toLowerCase()
      ) {
        failedLookups.push({
          requirement: {
            ...requirement,
            code: "attribution_failed",
            missingAllowed: false,
          },
          cause: new Error(`${label}_batch_block_identity_mismatch`),
        });
      }
    }
  };
  validateCanonicalResponse(
    validatedTransactions.values,
    transactionRequirements,
    "transaction",
  );
  failedLookups.sort((left, right) =>
    left.requirement.blockNumber - right.requirement.blockNumber,
  );
  const failedLookup = failedLookups[0];
  const attributableGroups = failedLookup
    ? groups.filter(
        (group) => group.blockNumber < failedLookup.requirement.blockNumber,
      )
    : groups;
  applyRequiredActorData(
    attributableGroups,
    validatedTransactions.values,
  );
  applyDirectStyfiExitProofs(
    attributableGroups,
    validatedTransactions.values,
  );
  if (failedLookup) {
    throw new StyfiVeyfiScannerStageError(
      failedLookup.requirement.code,
      failedLookup.cause,
      failedLookup.requirement.blockNumber,
    );
  }
}

export async function scanChunkForActionsWithProgress(
  rpc: RpcClient,
  fromBlock: number,
  toBlock: number,
  options: ChunkScanOptions,
): Promise<ChunkScanResult> {
  if (
    !Number.isSafeInteger(fromBlock) ||
    !Number.isSafeInteger(toBlock) ||
    fromBlock < 0 ||
    toBlock < fromBlock
  ) {
    throw new RangeError("invalid YFI scan range");
  }
  const isBudgetExceeded = options.isBudgetExceeded ?? (() => false);
  const isElapsedTimeExceeded =
    options.isElapsedTimeExceeded ?? (() => false);
  const logs: RpcLog[] = [];
  const validatedEventBlockNumbers = new Set<number>();
  const countValidatedEventBlocksThrough = (terminalBlock: number): number => {
    let count = 0;
    for (const blockNumber of validatedEventBlockNumbers) {
      if (blockNumber <= terminalBlock) count += 1;
    }
    return count;
  };
  const partitions =
    options.domainId === "styfi"
      ? STYFI_LOG_QUERY_PARTITIONS
      : VEYFI_LOG_QUERY_PARTITIONS;
  for (const partition of partitions) {
    let response: RpcLog[];
    try {
      response = await rpc.getLogs({
        address: Array.from(partition.address),
        topics: [Array.from(partition.topics)],
        fromBlock,
        toBlock,
      });
    } catch (error) {
      const budgetExhausted = isBudgetExceeded(error);
      const elapsedTimeExceeded = isElapsedTimeExceeded(error);
      return {
        actions: [],
        ignoredLogs: [],
        eventBlocksInspected: 0,
        chunkComplete: false,
        lastProcessedBlock: fromBlock - 1,
        budgetExhausted,
        failure: {
          code: budgetExhausted
            ? "budget_exhausted"
            : elapsedTimeExceeded
              ? "elapsed_time"
              : isRpcRangeTooLargeError(error)
                ? "range_too_large"
              : "lookup_failed",
          blockNumber: fromBlock,
        },
      };
    }
    try {
      if (!Array.isArray(response)) throw new Error("invalid_logs_response");
      const allowedAddresses = new Set(
        partition.address.map((address) => normalizeAddress(address)),
      );
      const allowedTopics = new Set(
        partition.topics.map((topic) => topic.toLowerCase()),
      );
      for (const log of response) {
        if (
          !allowedAddresses.has(normalizeAddress(log.address)) ||
          !allowedTopics.has(log.topics[0]?.toLowerCase() ?? "")
        ) {
          throw new Error("partition_response_pair_mismatch");
        }
      }
      logs.push(...response);
    } catch {
      return {
        actions: [],
        ignoredLogs: [],
        eventBlocksInspected: 0,
        chunkComplete: false,
        lastProcessedBlock: fromBlock - 1,
        budgetExhausted: false,
        failure: { code: "decode_failed", blockNumber: fromBlock },
      };
    }
  }

  logs.sort((left, right) => {
    const leftBlock = left.blockNumber ?? Number.MAX_SAFE_INTEGER;
    const rightBlock = right.blockNumber ?? Number.MAX_SAFE_INTEGER;
    if (leftBlock !== rightBlock) {
      return leftBlock - rightBlock;
    }

    const leftIndex = left.logIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.logIndex ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });

  const logsByBlock = new Map<number, RpcLog[]>();
  const seenLogIdentities = new Set<string>();
  for (const log of logs) {
    const blockNumber = log.blockNumber;
    if (
      blockNumber === null ||
      log.logIndex === null ||
      !Number.isSafeInteger(blockNumber) ||
      !Number.isSafeInteger(log.logIndex) ||
      log.logIndex < 0 ||
      blockNumber < fromBlock ||
      blockNumber > toBlock ||
      log.transactionHash === null ||
      !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash) ||
      log.blockHash === null ||
      !/^0x[0-9a-fA-F]{64}$/.test(log.blockHash) ||
      !/^0x[0-9a-fA-F]{40}$/.test(log.address) ||
      !Array.isArray(log.topics) ||
      !log.topics.every((topic) => /^0x[0-9a-fA-F]{64}$/.test(topic)) ||
      typeof log.data !== "string" ||
      !/^0x(?:[0-9a-fA-F]{2})*$/.test(log.data) ||
      typeof log.removed !== "boolean"
    ) {
      return {
        actions: [],
        ignoredLogs: [],
        eventBlocksInspected: 0,
        chunkComplete: false,
        lastProcessedBlock: fromBlock - 1,
        budgetExhausted: false,
        failure: { code: "decode_failed", blockNumber: fromBlock },
      };
    }
    const identity = `${blockNumber}:${log.logIndex}`;
    if (seenLogIdentities.has(identity)) {
      return {
        actions: [],
        ignoredLogs: [],
        eventBlocksInspected: 0,
        chunkComplete: false,
        lastProcessedBlock: fromBlock - 1,
        budgetExhausted: false,
        failure: { code: "decode_failed", blockNumber },
      };
    }
    seenLogIdentities.add(identity);
    const blockLogs = logsByBlock.get(blockNumber) ?? [];
    blockLogs.push(log);
    logsByBlock.set(blockNumber, blockLogs);
  }

  const legacyLockCache = new Map<string, LegacyLockSnapshot>();
  const cooldownRemainingByAccount = new Map<string, bigint>();
  const verifiedByNumber = new Map<number, RpcBlock>();
  for (const block of options.verifiedBlocks ?? []) {
    if (
      verifiedByNumber.has(block.number) ||
      !Number.isSafeInteger(block.number) ||
      block.number < fromBlock ||
      block.number > toBlock ||
      !/^0x[0-9a-fA-F]{64}$/.test(block.hash) ||
      !/^0x[0-9a-fA-F]{64}$/.test(block.parentHash)
    ) {
      return {
        actions: [],
        ignoredLogs: [],
        eventBlocksInspected: 0,
        chunkComplete: false,
        lastProcessedBlock: fromBlock - 1,
        budgetExhausted: false,
        failure: { code: "lookup_failed", blockNumber: fromBlock },
      };
    }
    verifiedByNumber.set(block.number, block);
  }
  for (const blockNumber of logsByBlock.keys()) {
    if (verifiedByNumber.has(blockNumber)) continue;
    try {
      const block = await rpc.getBlockByNumber(blockNumber);
      if (
        block.number !== blockNumber ||
        !/^0x[0-9a-fA-F]{64}$/.test(block.hash) ||
        !/^0x[0-9a-fA-F]{64}$/.test(block.parentHash)
      ) {
        throw new Error("event_block_header_invalid");
      }
      verifiedByNumber.set(blockNumber, block);
    } catch (error) {
      return {
        actions: [],
        ignoredLogs: [],
        eventBlocksInspected: 0,
        chunkComplete: false,
        lastProcessedBlock: fromBlock - 1,
        budgetExhausted: isBudgetExceeded(error),
        failure: {
          code: isBudgetExceeded(error)
            ? "budget_exhausted"
            : isElapsedTimeExceeded(error)
              ? "elapsed_time"
              : "lookup_failed",
          blockNumber,
        },
      };
    }
  }
  const provisionalGroups: ProvisionalBlockGroup[] = [];
  let decodeFailure: {
    readonly error: unknown;
    readonly blockNumber: number;
  } | null = null;

  for (const [blockNumber, blockLogs] of logsByBlock) {
    const blockActions: NormalizedAction[] = [];
    const blockIgnoredLogs: StyfiVeyfiIgnoredLog[] = [];
    try {
      const verifiedBlock = verifiedByNumber.get(blockNumber);
      if (verifiedBlock === undefined) {
        throw new StyfiVeyfiScannerStageError(
          "lookup_failed",
          new Error("verified_block_missing"),
          blockNumber,
        );
      }
      if (
        verifiedBlock !== undefined &&
        blockLogs.some(
          (log) =>
            log.blockHash === null ||
            log.blockHash.toLowerCase() !== verifiedBlock.hash.toLowerCase(),
        )
      ) {
        throw new Error("log_block_hash_mismatch");
      }
      for (const log of blockLogs) {
        validateCanonicalLogShape(log);
      }
      validatedEventBlockNumbers.add(blockNumber);
      for (const log of blockLogs) {
        validateSupportedLogSemantics(log);
      }
      const styfixInternalCompanions = buildStyfixInternalCompanions(blockLogs);
      const legacyPenaltyPairs = buildLegacyPenaltyPairs(blockLogs);
      await seedParentSnapshotsForBlock({
        rpc,
        logs: blockLogs,
        legacyLockCache,
        cooldownRemainingByAccount,
        blockNumber,
        parentBlockHash: verifiedBlock.parentHash,
      });

      for (const log of blockLogs) {
        getRequiredSupportedLogPair(log);
        const outcome = decodeLogToAction(
          log,
          legacyLockCache,
          cooldownRemainingByAccount,
          styfixInternalCompanions.depositLogIndices,
          styfixInternalCompanions.burnLogIndices,
          styfixInternalCompanions.withdrawalLogIndices,
          legacyPenaltyPairs.penaltyByWithdrawLogIndex,
          legacyPenaltyPairs.pairedPenaltyLogIndices,
        );
        if (outcome.status === "action") {
          blockActions.push(outcome.action);
        } else {
          blockIgnoredLogs.push({
            blockNumber,
            logIndex: log.logIndex as number,
            reason: outcome.reason,
          });
        }
      }

      provisionalGroups.push({
        blockNumber,
        actions: blockActions,
        ignoredLogs: blockIgnoredLogs,
        directStyfiExitProofs: buildDirectStyfiExitProofs(
          blockNumber,
          blockActions,
        ),
      });
    } catch (error) {
      decodeFailure = { error, blockNumber };
      break;
    }
  }

  try {
    await resolveChunkActorData(rpc, provisionalGroups, verifiedByNumber);
  } catch (error) {
    const stageError =
      error instanceof StyfiVeyfiScannerStageError ? error : null;
    const underlyingError = stageError?.cause ?? error;
    const budgetExhausted = isBudgetExceeded(underlyingError);
    const elapsedTimeExceeded = isElapsedTimeExceeded(underlyingError);
    const failureBlock =
      stageError?.blockNumber ?? provisionalGroups[0]?.blockNumber ?? fromBlock;
    const completePrefix = provisionalGroups.filter(
      (group) => group.blockNumber < failureBlock,
    );
    return {
      actions: completePrefix.flatMap((group) => group.actions),
      ignoredLogs: completePrefix.flatMap((group) => group.ignoredLogs),
      eventBlocksInspected: countValidatedEventBlocksThrough(failureBlock),
      chunkComplete: false,
      lastProcessedBlock: failureBlock - 1,
      budgetExhausted,
      failure: {
        code: budgetExhausted
          ? "budget_exhausted"
          : elapsedTimeExceeded
            ? "elapsed_time"
            : (stageError?.code ?? "attribution_failed"),
        blockNumber: failureBlock,
      },
    };
  }

  const actions = provisionalGroups.flatMap((group) => group.actions);
  const ignoredLogs = provisionalGroups.flatMap((group) => group.ignoredLogs);
  if (decodeFailure !== null) {
    const stageError =
      decodeFailure.error instanceof StyfiVeyfiScannerStageError
        ? decodeFailure.error
        : null;
    const underlyingError = stageError?.cause ?? decodeFailure.error;
    const budgetExhausted = isBudgetExceeded(underlyingError);
    const elapsedTimeExceeded = isElapsedTimeExceeded(underlyingError);
    return {
      actions,
      ignoredLogs,
      eventBlocksInspected: countValidatedEventBlocksThrough(
        decodeFailure.blockNumber,
      ),
      chunkComplete: false,
      lastProcessedBlock: decodeFailure.blockNumber - 1,
      budgetExhausted,
      failure: {
        code: budgetExhausted
          ? "budget_exhausted"
          : elapsedTimeExceeded
            ? "elapsed_time"
            : (stageError?.code ?? "decode_failed"),
        blockNumber: decodeFailure.blockNumber,
      },
    };
  }

  return {
    actions,
    ignoredLogs,
    eventBlocksInspected: validatedEventBlockNumbers.size,
    chunkComplete: true,
    lastProcessedBlock: toBlock,
    budgetExhausted: false,
    failure: null,
  };
}

export async function scanChunkForActions(
  rpc: RpcClient,
  fromBlock: number,
  toBlock: number,
  domainId: "styfi" | "veyfi",
  verifiedBlocks: readonly RpcBlock[] = [],
): Promise<NormalizedAction[]> {
  const result = await scanChunkForActionsWithProgress(rpc, fromBlock, toBlock, {
    domainId,
    verifiedBlocks,
  });
  if (result.failure !== null || !result.chunkComplete) {
    throw new YfiScanBlockError(
      result.failure ?? { code: "decode_failed", blockNumber: fromBlock },
    );
  }
  return result.actions;
}

export async function scanYfiBlock(params: {
  readonly rpc: RpcClient;
  readonly domainId: "styfi" | "veyfi";
  readonly block: RpcBlock;
  readonly isBudgetExceeded?: (error: unknown) => boolean;
  readonly isElapsedTimeExceeded?: (error: unknown) => boolean;
}): Promise<ChunkScanResult> {
  return scanChunkForActionsWithProgress(
    params.rpc,
    params.block.number,
    params.block.number,
    {
      domainId: params.domainId,
      verifiedBlocks: [params.block],
      ...(params.isBudgetExceeded === undefined
        ? {}
        : { isBudgetExceeded: params.isBudgetExceeded }),
      ...(params.isElapsedTimeExceeded === undefined
        ? {}
        : { isElapsedTimeExceeded: params.isElapsedTimeExceeded }),
    },
  );
}
