import {
  decodeEventLog,
  encodeFunctionData,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import { ERC20_TRANSFER_TOPIC } from "../../abis";
import {
  BONUS_DISTRIBUTOR,
  LIQUID_LOCKER_TOKENS,
  STYFI,
  YBC,
  YBC_BONUS_RECIPIENT,
  YBC_DECAY_SECONDS,
  YBC_ELECTION,
  YBC_EPOCH_SECONDS,
  YBC_GENESIS,
  YBC_REWARD_CLAIMER,
  YBC_REWARD_DISTRIBUTOR,
  YBC_REWARD_TOKEN,
  YBC_VOTE_SECONDS,
  YBC_WEIGHT_AGGREGATOR,
} from "../../contracts";
import {
  BONUS_DISTRIBUTOR_EVENT_TOPICS,
  BONUS_DISTRIBUTOR_EVENTS_ABI,
  TEAMS_READ_ABI,
  TOKEN_METADATA_ABI,
  YBC_BONUS_RECIPIENT_EVENT_TOPICS,
  YBC_BONUS_RECIPIENT_EVENTS_ABI,
  YBC_ELECTION_EVENT_TOPICS,
  YBC_ELECTION_EVENTS_ABI,
  YBC_EVENT_TOPICS,
  YBC_EVENTS_ABI,
  YBC_READ_ABI,
  YBC_REWARD_DISTRIBUTOR_EVENT_TOPICS,
  YBC_REWARD_DISTRIBUTOR_EVENTS_ABI,
} from "../../product-abis";
import type {
  AlertTokenAmount,
  ProductAlertAction,
  ProposalType,
} from "../../product-types";
import {
  isRpcRangeTooLargeError,
  type RpcBlock,
  type RpcCallTraceFrame,
  type RpcCallTraceLog,
  type RpcClient,
} from "../../rpc";
import {
  asAddress,
  asBigint,
  asBoolean,
  asRecord,
  assertCanonicalProductLog,
  canonicalProductLog,
  exactlyOne,
  exactBlock,
  exactRead,
  normalizeAddress,
  onchainSource,
  productEventId,
  sortProductLogs,
  transactionActor,
  type CanonicalProductLog,
} from "../product-scanner-utils";

export interface StoredYbcState {
  readonly members: readonly string[];
  readonly votersByProposal: Readonly<Record<string, readonly string[]>>;
  readonly lastCollectivePower: string | null;
  readonly lastEpoch: number | null;
}

export interface YbcState {
  readonly members: ReadonlySet<Address>;
  readonly votersByProposal: ReadonlyMap<bigint, ReadonlySet<Address>>;
  readonly lastCollectivePower: bigint | null;
  readonly lastEpoch: number | null;
}

export interface YbcScanFailure {
  readonly code: "range_too_large" | "scan_failed";
  readonly reason: string;
  readonly contract: string | null;
  readonly blockNumber: number | null;
  readonly transactionHash: string | null;
  readonly eventName: string | null;
}

export interface YbcScanResult {
  readonly state: YbcState;
  readonly actions: readonly ProductAlertAction[];
  readonly failure: YbcScanFailure | null;
}

interface Proposal {
  readonly account: Address;
  readonly proposer: Address;
  readonly epoch: bigint;
  readonly addition: boolean;
  readonly threshold: bigint;
  readonly votes: bigint;
  readonly yea: bigint;
  readonly retracted: boolean;
  readonly executed: boolean;
}

const YBC_ADDRESS = normalizeAddress(YBC);
const ELECTION_ADDRESS = normalizeAddress(YBC_ELECTION);
const REWARD_DISTRIBUTOR_ADDRESS = normalizeAddress(YBC_REWARD_DISTRIBUTOR);
const BONUS_RECIPIENT_ADDRESS = normalizeAddress(YBC_BONUS_RECIPIENT);
const BONUS_DISTRIBUTOR_ADDRESS = normalizeAddress(BONUS_DISTRIBUTOR);
const WEIGHT_AGGREGATOR_ADDRESS = normalizeAddress(YBC_WEIGHT_AGGREGATOR);
const REWARD_CLAIMER_ADDRESS = normalizeAddress(YBC_REWARD_CLAIMER);
const REWARD_TOKEN_ADDRESS = normalizeAddress(YBC_REWARD_TOKEN);
const ZERO_ADDRESS = normalizeAddress("0x0000000000000000000000000000000000000000");
const ZERO_HASH = `0x${"0".repeat(64)}` as Hex;
const ADD_MEMBER_SELECTOR = toFunctionSelector("add_member(address)");
const REMOVE_MEMBER_SELECTOR = toFunctionSelector("remove_member(address)");
const CLAIM_SELECTOR = toFunctionSelector("claim(address)");
const WEIGHT_PACKING_SCALE = 1_000_000n;

const FIXED_ADDRESSES = [
  YBC_ADDRESS,
  ELECTION_ADDRESS,
  REWARD_DISTRIBUTOR_ADDRESS,
  BONUS_RECIPIENT_ADDRESS,
  BONUS_DISTRIBUTOR_ADDRESS,
  WEIGHT_AGGREGATOR_ADDRESS,
];

const FIXED_TOPICS = [
  ...Object.values(YBC_EVENT_TOPICS),
  ...Object.values(YBC_ELECTION_EVENT_TOPICS),
  ...Object.values(YBC_REWARD_DISTRIBUTOR_EVENT_TOPICS),
  ...Object.values(YBC_BONUS_RECIPIENT_EVENT_TOPICS),
  ...Object.values(BONUS_DISTRIBUTOR_EVENT_TOPICS),
];

const FIXED_TOPICS_BY_ADDRESS = new Map<Address, ReadonlySet<string>>([
  [YBC_ADDRESS, new Set(Object.values(YBC_EVENT_TOPICS))],
  [ELECTION_ADDRESS, new Set(Object.values(YBC_ELECTION_EVENT_TOPICS))],
  [REWARD_DISTRIBUTOR_ADDRESS, new Set(Object.values(YBC_REWARD_DISTRIBUTOR_EVENT_TOPICS))],
  [BONUS_RECIPIENT_ADDRESS, new Set(Object.values(YBC_BONUS_RECIPIENT_EVENT_TOPICS))],
  [BONUS_DISTRIBUTOR_ADDRESS, new Set(Object.values(BONUS_DISTRIBUTOR_EVENT_TOPICS))],
  [WEIGHT_AGGREGATOR_ADDRESS, new Set([YBC_ELECTION_EVENT_TOPICS.SetWeightAggregator])],
]);

function fixedTopicAllowed(log: CanonicalProductLog): boolean {
  const allowed = FIXED_TOPICS_BY_ADDRESS.get(log.address);
  const topic = log.topics[0];
  return allowed !== undefined && topic !== undefined && allowed.has(topic);
}

function fixedAbi(address: Address): Abi {
  switch (address) {
    case YBC_ADDRESS: return YBC_EVENTS_ABI;
    case ELECTION_ADDRESS: return YBC_ELECTION_EVENTS_ABI;
    case REWARD_DISTRIBUTOR_ADDRESS: return YBC_REWARD_DISTRIBUTOR_EVENTS_ABI;
    case BONUS_RECIPIENT_ADDRESS: return YBC_BONUS_RECIPIENT_EVENTS_ABI;
    case BONUS_DISTRIBUTOR_ADDRESS: return BONUS_DISTRIBUTOR_EVENTS_ABI;
    case WEIGHT_AGGREGATOR_ADDRESS: return YBC_ELECTION_EVENTS_ABI;
    default: throw new Error("ybc_fixed_emitter_invalid");
  }
}

function decoded(
  log: CanonicalProductLog,
  abi: Abi,
): { readonly eventName: string; readonly args: Record<string, unknown> } {
  const result = decodeEventLog({
    abi,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
    strict: true,
  });
  if (result.eventName === undefined) throw new Error("ybc_event_name_missing");
  return {
    eventName: result.eventName,
    args: result.args === undefined
      ? {}
      : asRecord(result.args, "ybc_event_args"),
  };
}

function action<K extends ProductAlertAction["kind"]>(
  log: CanonicalProductLog,
  kind: K,
  details: Extract<ProductAlertAction, { kind: K }>["details"],
): Extract<ProductAlertAction, { kind: K }> {
  return {
    domainId: "ybc",
    kind,
    details,
    eventId: productEventId(log, kind),
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    source: onchainSource(log),
  } as Extract<ProductAlertAction, { kind: K }>;
}

function syntheticPowerAction(params: {
  readonly block: RpcBlock;
  readonly logIndex: number;
  readonly causalLog: CanonicalProductLog | null;
  readonly previousPower: bigint;
  readonly currentPower: bigint;
  readonly cause: Extract<ProductAlertAction, { kind: "ybc_collective_power_changed" }>["details"]["cause"];
}): Extract<ProductAlertAction, { kind: "ybc_collective_power_changed" }> {
  const metricId = `ybc-power:${params.block.hash.toLowerCase()}`;
  const causalLog = params.causalLog;
  return {
    domainId: "ybc",
    kind: "ybc_collective_power_changed",
    details: {
      previousPower: params.previousPower,
      currentPower: params.currentPower,
      cause: params.cause,
    },
    eventId: causalLog === null
      ? metricId
      : productEventId(causalLog, "ybc_collective_power_changed"),
    txHash: causalLog?.transactionHash ?? ZERO_HASH,
    blockNumber: params.block.number,
    logIndex: params.logIndex,
    source: causalLog === null
      ? {
          kind: "synthetic",
          metricId,
          blockHash: params.block.hash.toLowerCase(),
          orderingIndex: params.logIndex,
        }
      : onchainSource(causalLog),
  };
}

function proposalType(proposal: Proposal): ProposalType {
  return proposal.addition ? "addition" : "expulsion";
}

async function readProposal(
  rpc: RpcClient,
  block: RpcBlock,
  proposalId: bigint,
): Promise<Proposal> {
  const value = await exactRead({
    rpc,
    block,
    address: ELECTION_ADDRESS,
    abi: YBC_READ_ABI,
    functionName: "proposals",
    args: [proposalId],
  });
  if (!Array.isArray(value) || value.length !== 9) throw new Error("ybc_proposal_invalid");
  return Object.freeze({
    account: asAddress(value[0], "ybc_proposal_account"),
    proposer: asAddress(value[1], "ybc_proposal_proposer"),
    epoch: asBigint(value[2], "ybc_proposal_epoch"),
    addition: asBoolean(value[3], "ybc_proposal_addition"),
    threshold: asBigint(value[4], "ybc_proposal_threshold"),
    votes: asBigint(value[5], "ybc_proposal_votes"),
    yea: asBigint(value[6], "ybc_proposal_yea"),
    retracted: asBoolean(value[7], "ybc_proposal_retracted"),
    executed: asBoolean(value[8], "ybc_proposal_executed"),
  });
}

async function readYbcAddress(
  rpc: RpcClient,
  block: RpcBlock,
  functionName: "hooks",
): Promise<Address> {
  return asAddress(await exactRead({
    rpc,
    block,
    address: YBC_ADDRESS,
    abi: YBC_READ_ABI,
    functionName,
  }), `ybc_${functionName}`);
}

async function readThreshold(
  rpc: RpcClient,
  block: RpcBlock,
  functionName: "addition_threshold" | "expulsion_threshold",
): Promise<bigint> {
  return asBigint(await exactRead({
    rpc,
    block,
    address: ELECTION_ADDRESS,
    abi: YBC_READ_ABI,
    functionName,
  }), `ybc_${functionName}`);
}

async function readElectionAggregator(
  rpc: RpcClient,
  block: RpcBlock,
): Promise<Address> {
  return asAddress(await exactRead({
    rpc,
    block,
    address: ELECTION_ADDRESS,
    abi: YBC_READ_ABI,
    functionName: "weight_aggregator",
  }), "ybc_vote_weight_aggregator");
}

async function readAggregatorWeight(
  rpc: RpcClient,
  block: RpcBlock,
  aggregator: Address,
  account: Address,
): Promise<bigint> {
  return asBigint(await exactRead({
    rpc,
    block,
    address: aggregator,
    abi: YBC_READ_ABI,
    functionName: "weight",
    args: [account],
  }), "ybc_member_weight");
}

async function memberWeight(
  rpc: RpcClient,
  block: RpcBlock,
  member: Address,
): Promise<bigint> {
  const aggregator = await readElectionAggregator(rpc, block);
  if (aggregator === ZERO_ADDRESS) return 0n;
  return readAggregatorWeight(rpc, block, aggregator, member);
}

async function collectivePower(
  rpc: RpcClient,
  block: RpcBlock,
  members: ReadonlySet<Address>,
): Promise<bigint> {
  const weights = await Promise.all([...members].sort().map((member) => memberWeight(rpc, block, member)));
  return weights.reduce((sum, weight) => sum + weight, 0n);
}

async function tokenAmount(
  rpc: RpcClient,
  block: RpcBlock,
  token: Address,
  value: bigint,
): Promise<AlertTokenAmount> {
  try {
    const [symbol, decimals] = await Promise.all([
      exactRead({ rpc, block, address: token, abi: TOKEN_METADATA_ABI, functionName: "symbol" }),
      exactRead({ rpc, block, address: token, abi: TOKEN_METADATA_ABI, functionName: "decimals" }),
    ]);
    if (typeof symbol !== "string" || typeof decimals !== "number" || decimals < 0 || decimals > 255) {
      throw new Error("ybc_token_metadata_invalid");
    }
    return Object.freeze({ token, symbol, decimals, value });
  } catch {
    return Object.freeze({ token, symbol: null, decimals: null, value });
  }
}

async function teamName(rpc: RpcClient, block: RpcBlock, team: Address): Promise<string> {
  const value = await exactRead({ rpc, block, address: team, abi: TEAMS_READ_ABI, functionName: "name" });
  if (typeof value !== "string" || value.length === 0) throw new Error("ybc_team_name_invalid");
  return value;
}

function copyMembers(members: ReadonlySet<Address>): Set<Address> {
  return new Set(members);
}

function decodeTransferAddress(topic: string): Address {
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(topic)) throw new Error("ybc_transfer_topic_invalid");
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function decodedMemberCall(
  args: Record<string, unknown>,
): {
  readonly operator: Address;
  readonly target: Address;
  readonly selector: string;
  readonly member: Address;
} | null {
  const operator = asAddress(args.operator, "ybc_membership_operator");
  const target = asAddress(args.target, "ybc_membership_target");
  const data = args.data;
  if (target !== YBC_ADDRESS) return null;
  if (typeof data !== "string" || !/^0x[0-9a-fA-F]{72}$/.test(data)) return null;
  const selector = data.slice(0, 10).toLowerCase();
  if (selector !== ADD_MEMBER_SELECTOR && selector !== REMOVE_MEMBER_SELECTOR) return null;
  return { operator, target, selector, member: normalizeAddress(`0x${data.slice(-40)}`) };
}

function uniqueMemberCall(
  transactionLogs: readonly CanonicalProductLog[],
  decodedByLog: ReadonlyMap<CanonicalProductLog, ReturnType<typeof decoded>>,
  addition: boolean,
  expectedMember: Address,
): { readonly operator: Address; readonly target: Address; readonly selector: string } {
  const related = transactionLogs.flatMap((candidate) => {
    if (candidate.address !== YBC_ADDRESS) return [];
    const event = decodedByLog.get(candidate)!;
    if (event.eventName !== "Call") return [];
    const call = decodedMemberCall(event.args);
    return call?.member === expectedMember ? [call] : [];
  });
  const call = exactlyOne(
    related,
    "ybc_membership_call_missing",
    "ybc_membership_call_ambiguous",
  );
  if (call.selector !== (addition ? ADD_MEMBER_SELECTOR : REMOVE_MEMBER_SELECTOR)) {
    throw new Error("ybc_membership_call_mismatch");
  }
  return call;
}

function epochAt(timestamp: number): number {
  if (timestamp < YBC_GENESIS) throw new Error("ybc_epoch_before_genesis");
  return Math.floor((timestamp - YBC_GENESIS) / YBC_EPOCH_SECONDS);
}

interface VoteDecay {
  readonly length: bigint;
  readonly remaining: bigint;
}

function voteDecay(countedWeight: bigint, timestamp: number): VoteDecay | null {
  if (countedWeight <= 0n) throw new Error("ybc_vote_weight_invalid");
  if (timestamp < YBC_GENESIS) throw new Error("ybc_vote_before_genesis");
  const epochProgress = (timestamp - YBC_GENESIS) % YBC_EPOCH_SECONDS;
  const decayStartsAt = YBC_EPOCH_SECONDS - YBC_DECAY_SECONDS;
  if (epochProgress <= decayStartsAt) return null;
  const remaining = BigInt(YBC_EPOCH_SECONDS - epochProgress);
  if (remaining <= 0n) throw new Error("ybc_vote_decay_time_invalid");
  return Object.freeze({ length: BigInt(YBC_DECAY_SECONDS), remaining });
}

function packedBaseVoteWeight(countedWeight: bigint, decay: VoteDecay): bigint {
  const lower = (countedWeight * decay.length + decay.remaining - 1n) /
    decay.remaining;
  const upper = ((countedWeight + 1n) * decay.length - 1n) /
    decay.remaining;
  const candidate = ((lower + WEIGHT_PACKING_SCALE - 1n) / WEIGHT_PACKING_SCALE) *
    WEIGHT_PACKING_SCALE;
  if (
    candidate > upper ||
    candidate * decay.remaining / decay.length !== countedWeight ||
    candidate + WEIGHT_PACKING_SCALE <= upper
  ) {
    throw new Error("ybc_vote_base_weight_unrecoverable");
  }
  return candidate;
}

async function baseVoteWeight(params: {
  readonly rpc: RpcClient;
  readonly block: RpcBlock;
  readonly log: CanonicalProductLog;
  readonly aggregator: Address;
  readonly voter: Address;
  readonly countedWeight: bigint;
  readonly traceCache: Map<string, Promise<RpcCallTraceFrame>>;
}): Promise<bigint> {
  const decay = voteDecay(params.countedWeight, params.block.timestamp!);
  if (decay === null) return params.countedWeight;
  if (params.aggregator === WEIGHT_AGGREGATOR_ADDRESS) {
    return packedBaseVoteWeight(params.countedWeight, decay);
  }
  const currentWeight = await tracedBaseVoteWeight(params);
  if (
    currentWeight <= 0n ||
    currentWeight * decay.remaining / decay.length !== params.countedWeight
  ) {
    throw new Error("ybc_vote_base_weight_mismatch");
  }
  return currentWeight;
}

function sameTraceLog(
  traceLog: RpcCallTraceLog,
  eventLog: CanonicalProductLog,
): boolean {
  return traceLog.index === eventLog.logIndex &&
    traceLog.address === eventLog.address &&
    traceLog.data === eventLog.data.toLowerCase() &&
    traceLog.topics.length === eventLog.topics.length &&
    traceLog.topics.every(
      (topic, index) => topic === eventLog.topics[index]!.toLowerCase(),
    );
}

function framesForTraceLog(
  root: RpcCallTraceFrame,
  eventLog: CanonicalProductLog,
): Array<{ readonly frame: RpcCallTraceFrame; readonly log: RpcCallTraceLog }> {
  const matches: Array<{
    readonly frame: RpcCallTraceFrame;
    readonly log: RpcCallTraceLog;
  }> = [];
  const visit = (frame: RpcCallTraceFrame) => {
    for (const log of frame.logs) {
      if (sameTraceLog(log, eventLog)) matches.push({ frame, log });
    }
    for (const call of frame.calls) visit(call);
  };
  visit(root);
  return matches;
}

async function tracedBaseVoteWeight(params: {
  readonly rpc: RpcClient;
  readonly log: CanonicalProductLog;
  readonly aggregator: Address;
  readonly voter: Address;
  readonly traceCache: Map<string, Promise<RpcCallTraceFrame>>;
}): Promise<bigint> {
  if (params.rpc.traceTransactionByHash === undefined) {
    throw new Error("ybc_vote_trace_unavailable");
  }
  let trace = params.traceCache.get(params.log.transactionHash);
  if (trace === undefined) {
    trace = params.rpc.traceTransactionByHash(params.log.transactionHash);
    params.traceCache.set(params.log.transactionHash, trace);
  }
  const tracedLog = exactlyOne(
    framesForTraceLog(await trace, params.log),
    "ybc_vote_trace_log_missing",
    "ybc_vote_trace_log_ambiguous",
  );
  if (
    tracedLog.frame.to !== ELECTION_ADDRESS ||
    tracedLog.frame.error !== null
  ) {
    throw new Error("ybc_vote_trace_frame_mismatch");
  }

  const expectedInput = encodeFunctionData({
    abi: YBC_READ_ABI,
    functionName: "weight",
    args: [params.voter],
  }).toLowerCase();
  const weightCall = exactlyOne(
    tracedLog.frame.calls.slice(0, tracedLog.log.position).filter((call) =>
      call.type === "STATICCALL" &&
      call.from === ELECTION_ADDRESS &&
      call.to === params.aggregator &&
      call.input === expectedInput &&
      call.error === null
    ),
    "ybc_vote_trace_weight_call_missing",
    "ybc_vote_trace_weight_call_ambiguous",
  );
  if (
    weightCall.output === null ||
    !/^0x[0-9a-f]{64}$/.test(weightCall.output)
  ) {
    throw new Error("ybc_vote_trace_weight_output_invalid");
  }
  return BigInt(weightCall.output);
}

async function firstBlockAtOrAfter(
  rpc: RpcClient,
  timestamp: number,
  low: number,
  high: number,
): Promise<number> {
  let left = low;
  let right = high;
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2);
    const block = await exactBlock(rpc, middle);
    if (block.timestamp! >= timestamp) right = middle;
    else left = middle + 1;
  }
  return left;
}

export function createEmptyYbcState(): YbcState {
  return Object.freeze({
    members: new Set<Address>(),
    votersByProposal: new Map<bigint, ReadonlySet<Address>>(),
    lastCollectivePower: null,
    lastEpoch: null,
  });
}

export function serializeYbcState(state: YbcState): StoredYbcState {
  return Object.freeze({
    members: Object.freeze([...state.members].sort()),
    votersByProposal: Object.freeze(Object.fromEntries(
      [...state.votersByProposal.entries()]
        .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)
        .map(([proposalId, voters]) => [proposalId.toString(), Object.freeze([...voters].sort())]),
    )),
    lastCollectivePower: state.lastCollectivePower?.toString() ?? null,
    lastEpoch: state.lastEpoch,
  });
}

export function loadYbcState(value: StoredYbcState): YbcState {
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray(value.members) ||
    typeof value.votersByProposal !== "object" ||
    value.votersByProposal === null ||
    (value.lastCollectivePower !== null && !/^\d+$/.test(value.lastCollectivePower)) ||
    (value.lastEpoch !== null && (!Number.isSafeInteger(value.lastEpoch) || value.lastEpoch < 0))
  ) throw new Error("ybc_state_invalid");
  const members = new Set(value.members.map(normalizeAddress));
  if (members.size !== value.members.length) throw new Error("ybc_state_duplicate_member");
  const voters = new Map<bigint, ReadonlySet<Address>>();
  for (const [proposalId, addresses] of Object.entries(value.votersByProposal)) {
    if (!/^\d+$/.test(proposalId) || !Array.isArray(addresses)) throw new Error("ybc_state_voters_invalid");
    const normalized = new Set(addresses.map(normalizeAddress));
    if (normalized.size !== addresses.length) throw new Error("ybc_state_duplicate_voter");
    voters.set(BigInt(proposalId), normalized);
  }
  return Object.freeze({
    members,
    votersByProposal: voters,
    lastCollectivePower: value.lastCollectivePower === null ? null : BigInt(value.lastCollectivePower),
    lastEpoch: value.lastEpoch,
  });
}

interface VoteReplaySnapshot {
  readonly proposal: Proposal;
  readonly totalWeight: bigint;
  readonly yeaWeight: bigint;
}

async function buildElectionAggregatorReplay(params: {
  readonly rpc: RpcClient;
  readonly logs: readonly CanonicalProductLog[];
  readonly decodedByLog: ReadonlyMap<CanonicalProductLog, ReturnType<typeof decoded>>;
  readonly getBlock: (number: number) => Promise<RpcBlock>;
  readonly recordEvidence: (log: CanonicalProductLog, eventName: string) => void;
}): Promise<ReadonlyMap<CanonicalProductLog, Address>> {
  const aggregatorsByVote = new Map<CanonicalProductLog, Address>();
  let activeAggregator: Address | null = null;
  let configuredBlock: number | null = null;

  const verifyConfiguredBlock = async () => {
    if (configuredBlock === null || activeAggregator === null) return;
    const configured = await readElectionAggregator(
      params.rpc,
      await params.getBlock(configuredBlock),
    );
    if (configured !== activeAggregator) {
      throw new Error("ybc_vote_weight_aggregator_replay_mismatch");
    }
  };

  for (const log of params.logs) {
    if (log.address !== ELECTION_ADDRESS) continue;
    const event = params.decodedByLog.get(log)!;
    if (event.eventName !== "SetWeightAggregator" && event.eventName !== "Vote") {
      continue;
    }
    if (configuredBlock !== null && configuredBlock !== log.blockNumber) {
      await verifyConfiguredBlock();
      configuredBlock = null;
    }
    params.recordEvidence(log, event.eventName);
    if (event.eventName === "SetWeightAggregator") {
      activeAggregator = asAddress(
        event.args.aggregator,
        "ybc_vote_weight_aggregator",
      );
      configuredBlock = log.blockNumber;
      continue;
    }
    if (activeAggregator === null) {
      if (log.blockNumber === 0) {
        throw new Error("ybc_vote_weight_aggregator_unavailable");
      }
      activeAggregator = await readElectionAggregator(
        params.rpc,
        await params.getBlock(log.blockNumber - 1),
      );
    }
    if (activeAggregator === ZERO_ADDRESS) {
      throw new Error("ybc_vote_weight_aggregator_unavailable");
    }
    aggregatorsByVote.set(log, activeAggregator);
  }
  await verifyConfiguredBlock();
  return aggregatorsByVote;
}

async function buildVoteReplay(params: {
  readonly rpc: RpcClient;
  readonly logs: readonly CanonicalProductLog[];
  readonly decodedByLog: ReadonlyMap<CanonicalProductLog, ReturnType<typeof decoded>>;
  readonly getBlock: (number: number) => Promise<RpcBlock>;
  readonly recordEvidence: (log: CanonicalProductLog, eventName: string) => void;
}): Promise<ReadonlyMap<CanonicalProductLog, VoteReplaySnapshot>> {
  const groups = new Map<string, CanonicalProductLog[]>();
  for (const log of params.logs) {
    const event = params.decodedByLog.get(log)!;
    if (log.address !== ELECTION_ADDRESS || event.eventName !== "Vote") continue;
    const proposalId = asBigint(event.args.idx, "ybc_proposal_id");
    const key = `${log.blockNumber}:${proposalId}`;
    const group = groups.get(key) ?? [];
    group.push(log);
    groups.set(key, group);
  }

  const snapshots = new Map<CanonicalProductLog, VoteReplaySnapshot>();
  for (const group of groups.values()) {
    const first = group[0]!;
    params.recordEvidence(first, "Vote");
    const proposalId = asBigint(
      params.decodedByLog.get(first)!.args.idx,
      "ybc_proposal_id",
    );
    const eventBlock = await params.getBlock(first.blockNumber);
    const proposal = await readProposal(params.rpc, eventBlock, proposalId);
    const proposedInBlock = params.logs.some((candidate) => {
      const event = params.decodedByLog.get(candidate)!;
      return candidate.address === ELECTION_ADDRESS &&
        candidate.blockNumber === first.blockNumber &&
        candidate.logIndex < first.logIndex &&
        event.eventName === "Propose" &&
        asBigint(event.args.idx, "ybc_proposal_id") === proposalId;
    });
    const before = proposedInBlock
      ? { ...proposal, votes: 0n, yea: 0n }
      : await readProposal(
          params.rpc,
          await params.getBlock(first.blockNumber - 1),
          proposalId,
        );
    let totalWeight = before.votes;
    let yeaWeight = before.yea;
    for (const vote of group) {
      params.recordEvidence(vote, "Vote");
      const event = params.decodedByLog.get(vote)!;
      const weight = asBigint(event.args.weight, "ybc_vote_weight");
      if (weight <= 0n) throw new Error("ybc_vote_weight_invalid");
      totalWeight += weight;
      if (asBoolean(event.args.yea, "ybc_vote_yea")) yeaWeight += weight;
      snapshots.set(vote, Object.freeze({ proposal, totalWeight, yeaWeight }));
    }
    if (totalWeight !== proposal.votes || yeaWeight !== proposal.yea) {
      throw new Error("ybc_vote_replay_mismatch");
    }
  }
  return snapshots;
}

interface YbcBonusBundle {
  readonly claims: readonly CanonicalProductLog[];
  readonly sourceTeam: Address;
  readonly amount: bigint;
}

function buildYbcBonusBundles(
  byTransaction: ReadonlyMap<string, readonly CanonicalProductLog[]>,
  decodedByLog: ReadonlyMap<CanonicalProductLog, ReturnType<typeof decoded>>,
  recordEvidence: (log: CanonicalProductLog, eventName: string) => void,
): ReadonlyMap<CanonicalProductLog, YbcBonusBundle> {
  const bundles = new Map<CanonicalProductLog, YbcBonusBundle>();
  for (const transactionLogs of byTransaction.values()) {
    let pending: CanonicalProductLog[] = [];
    const finish = (deposit: CanonicalProductLog | null) => {
      const evidence = deposit ?? pending[0] ?? null;
      if (evidence !== null) {
        recordEvidence(evidence, decodedByLog.get(evidence)!.eventName);
      }
      if (pending.length === 0) {
        if (deposit !== null) throw new Error("ybc_bonus_deposit_without_claim");
        return;
      }
      const values = pending.map((claim) => decodedByLog.get(claim)!.args);
      const sourceTeam = asAddress(values[0]!.team, "ybc_bonus_team");
      if (values.some((value) => asAddress(value.team, "ybc_bonus_team") !== sourceTeam)) {
        throw new Error("ybc_bonus_claim_run_ambiguous");
      }
      const amount = values.reduce(
        (sum, value) => sum + asBigint(value.ybc_amount, "ybc_bonus_share"),
        0n,
      );
      if (amount === 0n) {
        if (deposit !== null) throw new Error("ybc_bonus_zero_deposit_unexpected");
      } else {
        if (deposit === null) throw new Error("ybc_bonus_deposit_missing");
        const args = decodedByLog.get(deposit)!.args;
        if (
          asAddress(args.depositor, "ybc_bonus_depositor") !== BONUS_DISTRIBUTOR_ADDRESS ||
          asBigint(args.amount, "ybc_bonus_amount") !== amount
        ) {
          throw new Error("ybc_bonus_companion_mismatch");
        }
        bundles.set(deposit, Object.freeze({
          claims: Object.freeze(pending.filter((claim) =>
            asBigint(decodedByLog.get(claim)!.args.ybc_amount, "ybc_bonus_share") > 0n
          )),
          sourceTeam,
          amount,
        }));
      }
      pending = [];
    };

    for (const candidate of transactionLogs) {
      const event = decodedByLog.get(candidate)!;
      if (candidate.address === BONUS_DISTRIBUTOR_ADDRESS && event.eventName === "ClaimBonus") {
        recordEvidence(candidate, event.eventName);
        if (
          pending.length > 0 &&
          asAddress(decodedByLog.get(pending[0]!)!.args.team, "ybc_bonus_team") !==
            asAddress(event.args.team, "ybc_bonus_team")
        ) {
          finish(null);
        }
        pending.push(candidate);
      } else if (candidate.address === BONUS_RECIPIENT_ADDRESS && event.eventName === "Deposit") {
        if (asAddress(event.args.depositor, "ybc_bonus_depositor") === BONUS_DISTRIBUTOR_ADDRESS) {
          recordEvidence(candidate, event.eventName);
          finish(candidate);
        }
      }
    }
    finish(null);
  }
  return bundles;
}

export async function scanYbcBlocks(params: {
  readonly rpc: RpcClient;
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly state: YbcState;
}): Promise<YbcScanResult> {
  let failureEvidence: Omit<YbcScanFailure, "code" | "reason"> = {
    contract: null,
    blockNumber: null,
    transactionHash: null,
    eventName: null,
  };
  const recordEvidence = (log: CanonicalProductLog, eventName: string | null) => {
    failureEvidence = {
      contract: log.address,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      eventName,
    };
  };
  try {
    const [fixedRaw, transferRaw] = await Promise.all([
      params.rpc.getLogs({
        address: FIXED_ADDRESSES,
        topics: [FIXED_TOPICS],
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
      }),
      params.rpc.getLogs({
        address: [normalizeAddress(STYFI), ...LIQUID_LOCKER_TOKENS.map(normalizeAddress)],
        topics: [ERC20_TRANSFER_TOPIC],
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
      }),
    ]);
    const logs = sortProductLogs(
      fixedRaw
        .map(canonicalProductLog)
        .filter((log): log is CanonicalProductLog => log !== null)
        .filter(fixedTopicAllowed),
    );
    const transfers = sortProductLogs(transferRaw.map(canonicalProductLog).filter((log): log is CanonicalProductLog => log !== null));
    const blockCache = new Map<number, Promise<RpcBlock>>();
    const getBlock = (number: number) => {
      const cached = blockCache.get(number);
      if (cached !== undefined) return cached;
      const pending = exactBlock(params.rpc, number);
      blockCache.set(number, pending);
      return pending;
    };
    for (const log of [...logs, ...transfers]) {
      recordEvidence(log, null);
      assertCanonicalProductLog(log, await getBlock(log.blockNumber));
    }
    const decodedByLog = new Map<CanonicalProductLog, ReturnType<typeof decoded>>();
    for (const log of logs) {
      recordEvidence(log, null);
      const event = decoded(log, fixedAbi(log.address));
      recordEvidence(log, event.eventName);
      decodedByLog.set(log, event);
    }
    const byTransaction = new Map<string, CanonicalProductLog[]>();
    for (const log of logs) {
      const group = byTransaction.get(log.transactionHash) ?? [];
      group.push(log);
      byTransaction.set(log.transactionHash, group);
    }
    const electionAggregatorsByVote = await buildElectionAggregatorReplay({
      rpc: params.rpc,
      logs,
      decodedByLog,
      getBlock,
      recordEvidence,
    });
    const voteReplay = await buildVoteReplay({
      rpc: params.rpc,
      logs,
      decodedByLog,
      getBlock,
      recordEvidence,
    });
    const bonusBundles = buildYbcBonusBundles(byTransaction, decodedByLog, recordEvidence);
    const members = copyMembers(params.state.members);
    const initialMembers = copyMembers(params.state.members);
    const voters = new Map<bigint, Set<Address>>(
      [...params.state.votersByProposal].map(([id, set]) => [id, new Set(set)]),
    );
    const membershipEvents: Array<{ block: number; member: Address; addition: boolean }> = [];
    const membershipBlocks = new Set<number>();
    const transactionTraceCache = new Map<string, Promise<RpcCallTraceFrame>>();
    const actions: ProductAlertAction[] = [];

    for (const log of logs) {
      const event = decodedByLog.get(log)!;
      recordEvidence(log, event.eventName);
      const block = await getBlock(log.blockNumber);

      if (log.address === YBC_ADDRESS && (event.eventName === "AddMember" || event.eventName === "RemoveMember")) {
        const addition = event.eventName === "AddMember";
        const member = asAddress(event.args.member, "ybc_member");
        const beforeMembers = copyMembers(members);
        if (addition ? members.has(member) : !members.has(member)) throw new Error("ybc_membership_transition_invalid");
        if (addition) members.add(member); else members.delete(member);
        membershipEvents.push({ block: log.blockNumber, member, addition });
        membershipBlocks.add(log.blockNumber);
        const transactionLogs = byTransaction.get(log.transactionHash)!;
        const matchingExecutions: CanonicalProductLog[] = [];
        for (const candidate of transactionLogs) {
          const candidateEvent = decodedByLog.get(candidate)!;
          if (candidate.address !== ELECTION_ADDRESS || candidateEvent.eventName !== "Execute") continue;
          const proposal = await readProposal(
            params.rpc,
            block,
            asBigint(candidateEvent.args.idx, "ybc_proposal_id"),
          );
          if (proposal.account === member && proposal.addition === addition) {
            matchingExecutions.push(candidate);
          }
        }
        if (matchingExecutions.length > 1) throw new Error("ybc_membership_execution_ambiguous");
        if (matchingExecutions.length === 0) {
          const callEvidence = uniqueMemberCall(transactionLogs, decodedByLog, addition, member);
          const prior = await getBlock(log.blockNumber - 1);
          const before = await collectivePower(params.rpc, prior, beforeMembers);
          const after = await collectivePower(params.rpc, block, members);
          const details = {
            member,
            operator: callEvidence.operator,
            collectivePowerBefore: before,
            collectivePowerAfter: after,
            activeMembers: members.size,
          };
          actions.push(addition
            ? action(log, "ybc_member_added", details)
            : action(log, "ybc_member_removed", details));
        }
        continue;
      }

      if (log.address === ELECTION_ADDRESS) {
        if (event.eventName === "Propose") {
          const proposalId = asBigint(event.args.idx, "ybc_proposal_id");
          const proposal = await readProposal(params.rpc, block, proposalId);
          if (
            proposal.account !== asAddress(event.args.account, "ybc_proposal_account") ||
            proposal.proposer !== asAddress(event.args.proposer, "ybc_proposal_proposer") ||
            proposal.epoch !== asBigint(event.args.epoch, "ybc_proposal_epoch") ||
            proposal.addition !== asBoolean(event.args.addition, "ybc_proposal_addition")
          ) {
            throw new Error("ybc_proposal_evidence_mismatch");
          }
          const votingStartsAt = BigInt(YBC_GENESIS) + (proposal.epoch + 1n) * BigInt(YBC_EPOCH_SECONDS) - BigInt(YBC_VOTE_SECONDS);
          actions.push(action(log, "ybc_proposal_opened", {
            proposalId,
            proposalType: proposalType(proposal),
            target: proposal.account,
            proposer: proposal.proposer,
            votingStartsAt,
            votingEndsAt: votingStartsAt + BigInt(YBC_VOTE_SECONDS),
            thresholdBps: proposal.threshold,
          }));
        } else if (event.eventName === "Retract") {
          const proposalId = asBigint(event.args.idx, "ybc_proposal_id");
          const proposal = await readProposal(params.rpc, block, proposalId);
          if (!proposal.retracted) throw new Error("ybc_retraction_evidence_mismatch");
          actions.push(action(log, "ybc_proposal_retracted", {
            proposalId,
            proposalType: proposalType(proposal),
            target: proposal.account,
            retractor: proposal.proposer,
          }));
        } else if (event.eventName === "Vote") {
          const proposalId = asBigint(event.args.idx, "ybc_proposal_id");
          const voter = asAddress(event.args.account, "ybc_voter");
          const aggregator = electionAggregatorsByVote.get(log);
          if (aggregator === undefined) {
            throw new Error("ybc_vote_weight_aggregator_replay_missing");
          }
          const replay = voteReplay.get(log);
          if (replay === undefined) throw new Error("ybc_vote_replay_missing");
          const proposal = replay.proposal;
          const proposalVoters = voters.get(proposalId) ?? new Set<Address>();
          if (proposalVoters.has(voter)) throw new Error("ybc_duplicate_vote");
          proposalVoters.add(voter);
          voters.set(proposalId, proposalVoters);
          const eligibleMembers = proposal.addition || !members.has(proposal.account)
            ? members.size
            : Math.max(0, members.size - 1);
          const countedWeight = asBigint(event.args.weight, "ybc_vote_weight");
          actions.push(action(log, "ybc_vote_cast", {
            proposalId,
            proposalType: proposalType(proposal),
            yea: asBoolean(event.args.yea, "ybc_vote_yea"),
            voter,
            countedWeight,
            baseWeight: await baseVoteWeight({
              rpc: params.rpc,
              block,
              log,
              aggregator,
              voter,
              countedWeight,
              traceCache: transactionTraceCache,
            }),
            yeaWeight: replay.yeaWeight,
            totalWeight: replay.totalWeight,
            thresholdBps: proposal.threshold,
            uniqueVoters: proposalVoters.size,
            eligibleMembers,
          }));
        } else if (event.eventName === "Execute") {
          const proposalId = asBigint(event.args.idx, "ybc_proposal_id");
          const proposal = await readProposal(params.rpc, block, proposalId);
          if (!proposal.executed) throw new Error("ybc_execution_evidence_mismatch");
          const transactionLogs = byTransaction.get(log.transactionHash)!;
          exactlyOne(
            transactionLogs.filter((candidate) => {
              const candidateEvent = decodedByLog.get(candidate)!;
              return candidate.address === YBC_ADDRESS &&
                candidateEvent.eventName === (proposal.addition ? "AddMember" : "RemoveMember") &&
                asAddress(candidateEvent.args.member, "ybc_execute_member") === proposal.account;
            }),
            "ybc_execute_membership_missing",
            "ybc_execute_membership_ambiguous",
          );
          const callEvidence = uniqueMemberCall(
            transactionLogs,
            decodedByLog,
            proposal.addition,
            proposal.account,
          );
          if (callEvidence.operator !== ELECTION_ADDRESS) throw new Error("ybc_execute_operator_mismatch");
          actions.push(action(log, "ybc_proposal_executed", {
            proposalId,
            proposalType: proposalType(proposal),
            member: proposal.account,
            executor: asAddress(event.args.executor, "ybc_executor"),
            yeaWeight: proposal.yea,
            totalWeight: proposal.votes,
            collectivePowerAfter: await collectivePower(params.rpc, block, members),
            activeMembers: members.size,
          }));
        } else if (event.eventName === "SetThresholds") {
          const prior = await getBlock(log.blockNumber - 1);
          actions.push(action(log, "ybc_thresholds_changed", {
            previousAdditionBps: await readThreshold(params.rpc, prior, "addition_threshold"),
            currentAdditionBps: asBigint(event.args.addition, "ybc_addition_threshold"),
            previousExpulsionBps: await readThreshold(params.rpc, prior, "expulsion_threshold"),
            currentExpulsionBps: asBigint(event.args.expulsion, "ybc_expulsion_threshold"),
            actor: await transactionActor(params.rpc, log.transactionHash),
          }));
        }
        continue;
      }

      if (log.address === REWARD_DISTRIBUTOR_ADDRESS) {
        if (event.eventName === "Claim") {
          actions.push(action(log, "ybc_rewards_claimed", {
            account: asAddress(event.args.account, "ybc_reward_account"),
            rewards: await tokenAmount(params.rpc, block, REWARD_TOKEN_ADDRESS, asBigint(event.args.rewards, "ybc_rewards")),
            claimRoute: "YBC reward claimer",
          }));
        } else if (event.eventName === "Kill") {
          actions.push(action(log, "ybc_rewards_stopped", {
            actor: await transactionActor(params.rpc, log.transactionHash),
            accruedClaimsRemainClaimable: true,
          }));
        }
        continue;
      }

      if (log.address === BONUS_RECIPIENT_ADDRESS && event.eventName === "Deposit") {
        const bundle = bonusBundles.get(log);
        if (bundle === undefined) throw new Error("ybc_bonus_bundle_missing");
        actions.push(action(log, "ybc_team_bonus_received", {
          amount: bundle.amount,
          sourceTeam: bundle.sourceTeam,
          sourceTeamName: await teamName(params.rpc, block, bundle.sourceTeam),
          periods: bundle.claims.map((candidate) =>
            asBigint(decodedByLog.get(candidate)!.args.period, "ybc_bonus_period")
          ),
        }));
        continue;
      }

      if (log.address === YBC_ADDRESS) {
        if (event.eventName === "SetOperator") {
          actions.push(action(log, "ybc_operator_changed", {
            operator: asAddress(event.args.operator, "ybc_operator"),
            enabled: asBoolean(event.args.flag, "ybc_operator_flag"),
            actor: await transactionActor(params.rpc, log.transactionHash),
          }));
        } else if (event.eventName === "SetHooks") {
          const prior = await getBlock(log.blockNumber - 1);
          actions.push(action(log, "ybc_hooks_changed", {
            previousHooks: await readYbcAddress(params.rpc, prior, "hooks"),
            currentHooks: asAddress(event.args.hooks, "ybc_hooks"),
            actor: await transactionActor(params.rpc, log.transactionHash),
          }));
        } else if (event.eventName === "Call") {
          const callData = event.args.data;
          if (typeof callData !== "string" || !/^0x[0-9a-fA-F]{8}/.test(callData)) throw new Error("ybc_call_data_invalid");
          const selector = callData.slice(0, 10).toLowerCase();
          const operator = asAddress(event.args.operator, "ybc_call_operator");
          const target = asAddress(event.args.target, "ybc_call_target");
          const membershipCall = target === YBC_ADDRESS && (selector === ADD_MEMBER_SELECTOR || selector === REMOVE_MEMBER_SELECTOR);
          const rewardCall = operator === REWARD_DISTRIBUTOR_ADDRESS && target === REWARD_CLAIMER_ADDRESS && selector === CLAIM_SELECTOR;
          if (!membershipCall && !rewardCall) {
            actions.push(action(log, "ybc_unrecognized_call", { operator, target, selector }));
          }
        }
      }
    }

    const memberUniverse = new Set<Address>([...initialMembers, ...members, ...membershipEvents.map((entry) => entry.member)]);
    const stakeCauses = new Map<number, CanonicalProductLog>();
    for (const transfer of transfers) {
      if (transfer.topics.length !== 3) throw new Error("ybc_transfer_topics_invalid");
      const from = decodeTransferAddress(transfer.topics[1]!);
      const to = decodeTransferAddress(transfer.topics[2]!);
      if (memberUniverse.has(from) || memberUniverse.has(to)) {
        const current = stakeCauses.get(transfer.blockNumber);
        if (current === undefined || current.logIndex < transfer.logIndex) {
          stakeCauses.set(transfer.blockNumber, transfer);
        }
      }
    }
    const configurationCauses = new Map<number, CanonicalProductLog>();
    for (const log of logs) {
      if (
        (log.address === ELECTION_ADDRESS || log.address === WEIGHT_AGGREGATOR_ADDRESS) &&
        decodedByLog.get(log)!.eventName === "SetWeightAggregator"
      ) {
        configurationCauses.set(log.blockNumber, log);
      }
    }
    const stakeBlocks = new Set(stakeCauses.keys());
    const configurationBlocks = new Set(configurationCauses.keys());
    const firstBlock = await getBlock(params.fromBlock);
    const lastBlock = await getBlock(params.toBlock);
    const firstEpoch = epochAt(firstBlock.timestamp!);
    const lastEpoch = epochAt(lastBlock.timestamp!);
    const epochBlocks = new Set<number>();
    if (params.state.lastEpoch !== null && params.state.lastEpoch < firstEpoch) {
      epochBlocks.add(params.fromBlock);
    }
    for (let epoch = firstEpoch + 1; epoch <= lastEpoch; epoch += 1) {
      const timestamp = YBC_GENESIS + epoch * YBC_EPOCH_SECONDS;
      epochBlocks.add(await firstBlockAtOrAfter(params.rpc, timestamp, params.fromBlock, params.toBlock));
    }

    const checkpoints = [...new Set([
      ...stakeBlocks,
      ...configurationBlocks,
      ...epochBlocks,
      ...membershipBlocks,
    ])].sort((left, right) => left - right);
    const rosterAt = (blockNumber: number): Set<Address> => {
      const roster = copyMembers(initialMembers);
      for (const event of membershipEvents) {
        if (event.block > blockNumber) break;
        if (event.addition) roster.add(event.member); else roster.delete(event.member);
      }
      return roster;
    };
    let previousPower = params.state.lastCollectivePower;
    if (previousPower === null) {
      const baselineBlockNumber = Math.max(0, params.fromBlock - 1);
      previousPower = await collectivePower(params.rpc, await getBlock(baselineBlockNumber), initialMembers);
    }
    for (const blockNumber of checkpoints) {
      const block = await getBlock(blockNumber);
      const currentPower = await collectivePower(params.rpc, block, rosterAt(blockNumber));
      if (!membershipBlocks.has(blockNumber) && currentPower !== previousPower) {
        const highestLog = logs.filter((log) => log.blockNumber === blockNumber).reduce((highest, log) => Math.max(highest, log.logIndex), -1);
        const causalLog = configurationCauses.get(blockNumber) ?? stakeCauses.get(blockNumber) ?? null;
        actions.push(syntheticPowerAction({
          block,
          logIndex: causalLog?.logIndex ?? highestLog + 1,
          causalLog,
          previousPower,
          currentPower,
          cause: configurationBlocks.has(blockNumber)
            ? "weight configuration changed"
            : epochBlocks.has(blockNumber)
              ? "epoch weight ramp"
              : "member stake changed",
        }));
      }
      previousPower = currentPower;
    }
    const terminalPower = await collectivePower(params.rpc, lastBlock, members);
    actions.sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex);
    for (let index = 1; index < actions.length; index += 1) {
      if (actions[index - 1]!.blockNumber === actions[index]!.blockNumber && actions[index - 1]!.logIndex === actions[index]!.logIndex) {
        throw new Error("ybc_action_order_collision");
      }
    }
    return {
      state: Object.freeze({
        members,
        votersByProposal: voters,
        lastCollectivePower: terminalPower,
        lastEpoch,
      }),
      actions: Object.freeze(actions),
      failure: null,
    };
  } catch (error) {
    return {
      state: params.state,
      actions: Object.freeze([]),
      failure: {
        code: isRpcRangeTooLargeError(error) ? "range_too_large" : "scan_failed",
        reason: error instanceof Error ? error.message : "unknown",
        ...failureEvidence,
      },
    };
  }
}

export const YBC_FINAL_DAY_DECAY_SECONDS = YBC_DECAY_SECONDS;
