import { decodeEventLog, type Abi, type Address, type Hex } from "viem";

import {
  TEAMS_ACCOUNTING_CORRECTION_ADJUSTMENT_COUNT,
  TEAMS_ACCOUNTING_CORRECTION_TRANSACTION,
  TEAMS_ACCOUNTING_LEGACY_SCALE,
  TEAMS_ACCOUNTING_MAINTAINER,
  TEAMS_ACCOUNTING_SEED_ADJUSTMENT_COUNT,
  TEAMS_ACCOUNTING_SEED_BLOCK,
  TEAMS_ACCOUNTING_SEED_TRANSACTION,
  TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK,
} from "../../../../../lib/clients/teams/accounting-history";

import {
  BONUS_DISTRIBUTOR,
  FUNDING_DISTRIBUTOR,
  REVENUE_RECIPIENT,
  TEAM_ACCOUNTANT,
  TEAM_REGISTRY,
  TEAMS_BUDGET_GENESIS,
  TEAMS_PERIOD_SECONDS,
  YBC_BONUS_RECIPIENT,
} from "../../contracts";
import {
  BONUS_DISTRIBUTOR_EVENT_TOPICS,
  BONUS_DISTRIBUTOR_EVENTS_ABI,
  FUNDING_DISTRIBUTOR_EVENT_TOPICS,
  FUNDING_DISTRIBUTOR_EVENTS_ABI,
  REVENUE_RECIPIENT_EVENT_TOPICS,
  REVENUE_RECIPIENT_EVENTS_ABI,
  TEAM_ACCOUNTANT_EVENT_TOPICS,
  TEAM_ACCOUNTANT_EVENTS_ABI,
  TEAM_EVENT_TOPICS,
  TEAM_EVENTS_ABI,
  TEAM_REGISTRY_EVENT_TOPICS,
  TEAM_REGISTRY_EVENTS_ABI,
  TEAMS_READ_ABI,
  TOKEN_METADATA_ABI,
  YBC_BONUS_RECIPIENT_EVENT_TOPICS,
  YBC_BONUS_RECIPIENT_EVENTS_ABI,
} from "../../product-abis";
import type {
  AlertTokenAmount,
  ProductAlertAction,
  TeamPeriodFinancials,
} from "../../product-types";
import {
  isRpcRangeTooLargeError,
  type RpcBlock,
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
  type CanonicalProductLog,
} from "../product-scanner-utils";

interface StoredTeamReference {
  readonly address: string;
  readonly index: string;
}

interface StoredTeamPeriodFinancials {
  readonly team: string;
  readonly period: string;
  readonly revenue: string;
  readonly cost: string;
}

export interface StoredTeamsState {
  readonly teams: readonly StoredTeamReference[];
  readonly financials?: readonly StoredTeamPeriodFinancials[];
}

export interface TeamsState {
  readonly teams: ReadonlyMap<Address, bigint>;
  readonly financials: ReadonlyMap<string, TeamPeriodFinancials>;
}

export interface TeamsScanFailure {
  readonly code: "range_too_large" | "scan_failed";
  readonly reason: string;
  readonly contract: string | null;
  readonly blockNumber: number | null;
  readonly transactionHash: string | null;
  readonly eventName: string | null;
}

export interface TeamsScanResult {
  readonly state: TeamsState;
  readonly actions: readonly ProductAlertAction[];
  readonly failure: TeamsScanFailure | null;
}

const TEAM_REGISTRY_ADDRESS = normalizeAddress(TEAM_REGISTRY);
const TEAM_ACCOUNTANT_ADDRESS = normalizeAddress(TEAM_ACCOUNTANT);
const REVENUE_RECIPIENT_ADDRESS = normalizeAddress(REVENUE_RECIPIENT);
const FUNDING_DISTRIBUTOR_ADDRESS = normalizeAddress(FUNDING_DISTRIBUTOR);
const BONUS_DISTRIBUTOR_ADDRESS = normalizeAddress(BONUS_DISTRIBUTOR);
const YBC_BONUS_RECIPIENT_ADDRESS = normalizeAddress(YBC_BONUS_RECIPIENT);

const FIXED_ADDRESSES = [
  TEAM_REGISTRY_ADDRESS,
  TEAM_ACCOUNTANT_ADDRESS,
  REVENUE_RECIPIENT_ADDRESS,
  FUNDING_DISTRIBUTOR_ADDRESS,
  BONUS_DISTRIBUTOR_ADDRESS,
  YBC_BONUS_RECIPIENT_ADDRESS,
];

const FIXED_TOPICS = [
  ...Object.values(TEAM_REGISTRY_EVENT_TOPICS),
  ...Object.values(TEAM_ACCOUNTANT_EVENT_TOPICS),
  ...Object.values(REVENUE_RECIPIENT_EVENT_TOPICS),
  ...Object.values(FUNDING_DISTRIBUTOR_EVENT_TOPICS),
  ...Object.values(BONUS_DISTRIBUTOR_EVENT_TOPICS),
  ...Object.values(YBC_BONUS_RECIPIENT_EVENT_TOPICS),
];

const FIXED_TOPICS_BY_ADDRESS = new Map<Address, ReadonlySet<string>>([
  [TEAM_REGISTRY_ADDRESS, new Set(Object.values(TEAM_REGISTRY_EVENT_TOPICS))],
  [TEAM_ACCOUNTANT_ADDRESS, new Set(Object.values(TEAM_ACCOUNTANT_EVENT_TOPICS))],
  [REVENUE_RECIPIENT_ADDRESS, new Set(Object.values(REVENUE_RECIPIENT_EVENT_TOPICS))],
  [FUNDING_DISTRIBUTOR_ADDRESS, new Set(Object.values(FUNDING_DISTRIBUTOR_EVENT_TOPICS))],
  [BONUS_DISTRIBUTOR_ADDRESS, new Set(Object.values(BONUS_DISTRIBUTOR_EVENT_TOPICS))],
  [YBC_BONUS_RECIPIENT_ADDRESS, new Set(Object.values(YBC_BONUS_RECIPIENT_EVENT_TOPICS))],
]);

function fixedTopicAllowed(log: CanonicalProductLog): boolean {
  const allowed = FIXED_TOPICS_BY_ADDRESS.get(log.address);
  const topic = log.topics[0];
  return allowed !== undefined && topic !== undefined && allowed.has(topic);
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
  if (result.eventName === undefined) throw new Error("teams_event_name_missing");
  return {
    eventName: result.eventName,
    args: result.args === undefined
      ? {}
      : asRecord(result.args, "teams_event_args"),
  };
}

function fixedAbi(address: Address): Abi {
  switch (address) {
    case TEAM_REGISTRY_ADDRESS: return TEAM_REGISTRY_EVENTS_ABI;
    case TEAM_ACCOUNTANT_ADDRESS: return TEAM_ACCOUNTANT_EVENTS_ABI;
    case REVENUE_RECIPIENT_ADDRESS: return REVENUE_RECIPIENT_EVENTS_ABI;
    case FUNDING_DISTRIBUTOR_ADDRESS: return FUNDING_DISTRIBUTOR_EVENTS_ABI;
    case BONUS_DISTRIBUTOR_ADDRESS: return BONUS_DISTRIBUTOR_EVENTS_ABI;
    case YBC_BONUS_RECIPIENT_ADDRESS: return YBC_BONUS_RECIPIENT_EVENTS_ABI;
    default: throw new Error("teams_fixed_emitter_invalid");
  }
}

function blockPeriod(timestamp: number): bigint {
  if (timestamp < TEAMS_BUDGET_GENESIS) throw new Error("teams_period_before_genesis");
  return BigInt(Math.floor((timestamp - TEAMS_BUDGET_GENESIS) / TEAMS_PERIOD_SECONDS));
}

function periodStart(period: bigint): bigint {
  return BigInt(TEAMS_BUDGET_GENESIS) + period * BigInt(TEAMS_PERIOD_SECONDS);
}

async function teamName(rpc: RpcClient, block: RpcBlock, team: Address): Promise<string> {
  const value = await exactRead({ rpc, block, address: team, abi: TEAMS_READ_ABI, functionName: "name" });
  if (typeof value !== "string" || value.length === 0 || value.length > 100) {
    throw new Error("teams_name_invalid");
  }
  return value;
}

async function readAddress(
  rpc: RpcClient,
  block: RpcBlock,
  contract: Address,
  functionName: "owner" | "registry" | "treasury" | "recovery_auction" | "token",
): Promise<Address> {
  return asAddress(
    await exactRead({ rpc, block, address: contract, abi: TEAMS_READ_ABI, functionName }),
    `teams_${functionName}`,
  );
}

async function readUint(
  rpc: RpcClient,
  block: RpcBlock,
  contract: Address,
  functionName: "num_teams" | "used",
  args: readonly unknown[] = [],
): Promise<bigint> {
  return asBigint(
    await exactRead({ rpc, block, address: contract, abi: TEAMS_READ_ABI, functionName, args }),
    `teams_${functionName}`,
  );
}

async function assertRegisteredTeam(
  rpc: RpcClient,
  block: RpcBlock,
  team: Address,
  index: bigint,
): Promise<void> {
  const registry = normalizeAddress(TEAM_REGISTRY);
  const [teamRegistry, indexedTeam, registered] = await Promise.all([
    exactRead({ rpc, block, address: team, abi: TEAMS_READ_ABI, functionName: "registry" }),
    exactRead({ rpc, block, address: registry, abi: TEAMS_READ_ABI, functionName: "teams", args: [index] }),
    exactRead({ rpc, block, address: registry, abi: TEAMS_READ_ABI, functionName: "is_team", args: [team] }),
  ]);
  if (
    asAddress(teamRegistry, "teams_team_registry") !== registry ||
    asAddress(indexedTeam, "teams_indexed_team") !== team ||
    !asBoolean(registered, "teams_registered_team")
  ) {
    throw new Error("teams_registry_membership_mismatch");
  }
}

async function financials(
  rpc: RpcClient,
  block: RpcBlock,
  team: Address,
  period: bigint,
): Promise<TeamPeriodFinancials> {
  const [revenue, cost] = await Promise.all([
    exactRead({ rpc, block, address: normalizeAddress(TEAM_ACCOUNTANT), abi: TEAMS_READ_ABI, functionName: "team_revenues", args: [team, period] }),
    exactRead({ rpc, block, address: normalizeAddress(TEAM_ACCOUNTANT), abi: TEAMS_READ_ABI, functionName: "team_costs", args: [team, period] }),
  ]);
  return Object.freeze({
    revenue: asBigint(revenue, "teams_revenue"),
    cost: asBigint(cost, "teams_cost"),
  });
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
      throw new Error("teams_token_metadata_invalid");
    }
    return Object.freeze({ token, symbol, decimals, value });
  } catch {
    return Object.freeze({ token, symbol: null, decimals: null, value });
  }
}

async function approval(
  rpc: RpcClient,
  block: RpcBlock,
  index: bigint,
): Promise<readonly [Address, bigint, Address, bigint, bigint, bigint]> {
  const value = await exactRead({
    rpc,
    block,
    address: normalizeAddress(FUNDING_DISTRIBUTOR),
    abi: TEAMS_READ_ABI,
    functionName: "approvals",
    args: [index],
  });
  if (!Array.isArray(value) || value.length !== 6) throw new Error("teams_approval_invalid");
  return [
    asAddress(value[0], "teams_approval_team"),
    asBigint(value[1], "teams_approval_period"),
    asAddress(value[2], "teams_approval_token"),
    asBigint(value[3], "teams_approval_amount"),
    asBigint(value[4], "teams_approval_duration"),
    asBigint(value[5], "teams_approval_used"),
  ];
}

function action<K extends ProductAlertAction["kind"]>(
  log: CanonicalProductLog,
  kind: K,
  details: Extract<ProductAlertAction, { kind: K }>["details"],
): Extract<ProductAlertAction, { kind: K }> {
  return {
    domainId: "teams",
    kind,
    details,
    eventId: productEventId(log, kind),
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    source: onchainSource(log),
  } as Extract<ProductAlertAction, { kind: K }>;
}

function teamPeriodKey(team: Address, period: bigint): string {
  return `${team}:${period}`;
}

function frozenFinancials(revenue: bigint, cost: bigint): TeamPeriodFinancials {
  return Object.freeze({ revenue, cost });
}

export function createEmptyTeamsState(): TeamsState {
  return Object.freeze({
    teams: new Map<Address, bigint>(),
    financials: new Map<string, TeamPeriodFinancials>(),
  });
}

export function serializeTeamsState(state: TeamsState): StoredTeamsState {
  return Object.freeze({
    teams: Object.freeze([...state.teams.entries()]
      .sort((left, right) => left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0)
      .map(([address, index]) => Object.freeze({ address, index: index.toString() }))),
    financials: Object.freeze([...state.financials.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        const separator = key.lastIndexOf(":");
        if (separator < 0) throw new Error("teams_state_financial_key_invalid");
        return Object.freeze({
          team: key.slice(0, separator),
          period: key.slice(separator + 1),
          revenue: value.revenue.toString(),
          cost: value.cost.toString(),
        });
      })),
  });
}

export function loadTeamsState(value: StoredTeamsState): TeamsState {
  if (typeof value !== "object" || value === null || !Array.isArray(value.teams)) {
    throw new Error("teams_state_invalid");
  }
  const teams = new Map<Address, bigint>();
  const indexes = new Set<string>();
  for (const item of value.teams) {
    if (typeof item !== "object" || item === null || !/^\d+$/.test(item.index)) {
      throw new Error("teams_state_invalid");
    }
    const address = normalizeAddress(item.address);
    if (teams.has(address) || indexes.has(item.index)) throw new Error("teams_state_duplicate");
    teams.set(address, BigInt(item.index));
    indexes.add(item.index);
  }
  const storedFinancials = value.financials ?? [];
  if (!Array.isArray(storedFinancials)) throw new Error("teams_state_invalid");
  const financials = new Map<string, TeamPeriodFinancials>();
  for (const item of storedFinancials) {
    if (
      typeof item !== "object" ||
      item === null ||
      !/^\d+$/.test(item.period) ||
      !/^\d+$/.test(item.revenue) ||
      !/^\d+$/.test(item.cost)
    ) {
      throw new Error("teams_state_invalid");
    }
    const team = normalizeAddress(item.team);
    const key = teamPeriodKey(team, BigInt(item.period));
    if (financials.has(key)) throw new Error("teams_state_financial_duplicate");
    financials.set(key, frozenFinancials(BigInt(item.revenue), BigInt(item.cost)));
  }
  return Object.freeze({ teams, financials });
}

function companionKey(
  args: Record<string, unknown>,
  type: "revenue" | "cost",
): string {
  return [
    type,
    asAddress(args.team, "teams_adjust_team"),
    asBigint(args.period, "teams_adjust_period"),
    asBigint(args.amount, "teams_adjust_amount"),
    asBoolean(args.increment, "teams_adjust_increment") ? "1" : "0",
  ].join(":");
}

function consumeCompanion(
  transactionLogs: readonly CanonicalProductLog[],
  consumed: Set<CanonicalProductLog>,
  matches: (candidate: CanonicalProductLog) => boolean,
  missingReason: string,
): CanonicalProductLog {
  for (const candidate of transactionLogs) {
    if (!consumed.has(candidate) && matches(candidate)) {
      consumed.add(candidate);
      return candidate;
    }
  }
  throw new Error(missingReason);
}

interface TeamBonusBundle {
  readonly claims: readonly CanonicalProductLog[];
  readonly deposit: CanonicalProductLog | null;
}

function buildTeamBonusBundles(
  byTransaction: ReadonlyMap<string, readonly CanonicalProductLog[]>,
  decodedByLog: ReadonlyMap<CanonicalProductLog, ReturnType<typeof decoded>>,
  recordEvidence: (log: CanonicalProductLog, eventName: string) => void,
): ReadonlyMap<CanonicalProductLog, TeamBonusBundle> {
  const bundles = new Map<CanonicalProductLog, TeamBonusBundle>();
  for (const transactionLogs of byTransaction.values()) {
    let pending: CanonicalProductLog[] = [];
    const finish = (deposit: CanonicalProductLog | null) => {
      const evidence = deposit ?? pending[0] ?? null;
      if (evidence !== null) {
        recordEvidence(evidence, decodedByLog.get(evidence)!.eventName);
      }
      if (pending.length === 0) {
        if (deposit !== null) throw new Error("teams_bonus_deposit_without_claim");
        return;
      }
      const values = pending.map((claim) => decodedByLog.get(claim)!.args);
      const team = asAddress(values[0]!.team, "teams_bonus_team");
      if (values.some((value) => asAddress(value.team, "teams_bonus_team") !== team)) {
        throw new Error("teams_bonus_claim_run_ambiguous");
      }
      const ybcAmount = values.reduce(
        (sum, value) => sum + asBigint(value.ybc_amount, "teams_bonus_ybc"),
        0n,
      );
      if (ybcAmount === 0n) {
        if (deposit !== null) throw new Error("teams_bonus_zero_deposit_unexpected");
      } else {
        if (deposit === null) throw new Error("teams_bonus_deposit_missing");
        const args = decodedByLog.get(deposit)!.args;
        if (
          asAddress(args.depositor, "teams_bonus_depositor") !== normalizeAddress(BONUS_DISTRIBUTOR) ||
          asBigint(args.amount, "teams_bonus_deposit") !== ybcAmount
        ) {
          throw new Error("teams_bonus_deposit_mismatch");
        }
      }
      bundles.set(pending[0]!, Object.freeze({
        claims: Object.freeze(pending),
        deposit,
      }));
      pending = [];
    };

    for (const candidate of transactionLogs) {
      const event = decodedByLog.get(candidate)!;
      if (candidate.address === normalizeAddress(BONUS_DISTRIBUTOR) && event.eventName === "ClaimBonus") {
        recordEvidence(candidate, event.eventName);
        if (
          pending.length > 0 &&
          asAddress(decodedByLog.get(pending[0]!)!.args.team, "teams_bonus_team") !==
            asAddress(event.args.team, "teams_bonus_team")
        ) {
          finish(null);
        }
        pending.push(candidate);
      } else if (
        candidate.address === normalizeAddress(YBC_BONUS_RECIPIENT) &&
        event.eventName === "Deposit"
      ) {
        if (
          asAddress(event.args.depositor, "teams_bonus_depositor") ===
          normalizeAddress(BONUS_DISTRIBUTOR)
        ) {
          recordEvidence(candidate, event.eventName);
          finish(candidate);
        }
      }
    }
    finish(null);
  }
  return bundles;
}

interface AccountingCorrectionPair {
  readonly legacy: CanonicalProductLog;
  readonly replacement: CanonicalProductLog;
  readonly team: Address;
  readonly period: bigint;
}

interface AccountingReplay {
  readonly terminal: ReadonlyMap<string, TeamPeriodFinancials>;
  readonly amountByLog: ReadonlyMap<CanonicalProductLog, bigint>;
  readonly afterByLog: ReadonlyMap<CanonicalProductLog, TeamPeriodFinancials>;
  readonly suppressed: ReadonlySet<CanonicalProductLog>;
}

function adjustmentIdentity(
  event: ReturnType<typeof decoded>,
): { readonly team: Address; readonly period: bigint; readonly type: "revenue" | "cost" } {
  if (event.eventName !== "AdjustRevenue" && event.eventName !== "AdjustCost") {
    throw new Error("teams_accounting_event_invalid");
  }
  return {
    team: asAddress(event.args.team, "teams_adjust_team"),
    period: asBigint(event.args.period, "teams_adjust_period"),
    type: event.eventName === "AdjustRevenue" ? "revenue" : "cost",
  };
}

function validateAccountingSeed(
  logs: readonly CanonicalProductLog[],
  decodedByLog: ReadonlyMap<CanonicalProductLog, ReturnType<typeof decoded>>,
): void {
  if (logs.length !== TEAMS_ACCOUNTING_SEED_ADJUSTMENT_COUNT) {
    throw new Error("teams_accounting_seed_incomplete");
  }
  const identities = new Set<string>();
  for (const log of logs) {
    const event = decodedByLog.get(log)!;
    const identity = adjustmentIdentity(event);
    const amount = asBigint(event.args.amount, "teams_seed_amount");
    if (
      log.blockNumber !== TEAMS_ACCOUNTING_SEED_BLOCK ||
      log.transactionHash !== TEAMS_ACCOUNTING_SEED_TRANSACTION ||
      asAddress(event.args.operator, "teams_seed_operator") !== TEAMS_ACCOUNTING_MAINTAINER ||
      !asBoolean(event.args.increment, "teams_seed_increment") ||
      amount === 0n
    ) {
      throw new Error("teams_accounting_seed_invalid");
    }
    const key = `${identity.type}:${teamPeriodKey(identity.team, identity.period)}`;
    if (identities.has(key)) throw new Error("teams_accounting_seed_duplicate");
    identities.add(key);
  }
}

function validateAccountingCorrection(
  logs: readonly CanonicalProductLog[],
  decodedByLog: ReadonlyMap<CanonicalProductLog, ReturnType<typeof decoded>>,
): readonly AccountingCorrectionPair[] {
  if (logs.length !== TEAMS_ACCOUNTING_CORRECTION_ADJUSTMENT_COUNT) {
    throw new Error("teams_accounting_correction_incomplete");
  }
  const pairs: AccountingCorrectionPair[] = [];
  const identities = new Set<string>();
  for (let index = 0; index < logs.length; index += 2) {
    const legacy = logs[index]!;
    const replacement = logs[index + 1]!;
    const legacyEvent = decodedByLog.get(legacy)!;
    const replacementEvent = decodedByLog.get(replacement)!;
    const legacyIdentity = adjustmentIdentity(legacyEvent);
    const replacementIdentity = adjustmentIdentity(replacementEvent);
    const legacyAmount = asBigint(legacyEvent.args.amount, "teams_correction_legacy_amount");
    const replacementAmount = asBigint(replacementEvent.args.amount, "teams_correction_replacement_amount");
    if (
      legacy.blockNumber !== TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK ||
      replacement.blockNumber !== TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK ||
      legacy.transactionHash !== TEAMS_ACCOUNTING_CORRECTION_TRANSACTION ||
      replacement.transactionHash !== TEAMS_ACCOUNTING_CORRECTION_TRANSACTION ||
      legacyEvent.eventName !== replacementEvent.eventName ||
      legacyIdentity.team !== replacementIdentity.team ||
      legacyIdentity.period !== replacementIdentity.period ||
      asAddress(legacyEvent.args.operator, "teams_correction_operator") !== TEAMS_ACCOUNTING_MAINTAINER ||
      asAddress(replacementEvent.args.operator, "teams_correction_operator") !== TEAMS_ACCOUNTING_MAINTAINER ||
      asBoolean(legacyEvent.args.increment, "teams_correction_legacy_increment") ||
      !asBoolean(replacementEvent.args.increment, "teams_correction_replacement_increment") ||
      legacyAmount === 0n ||
      replacementAmount !== legacyAmount * TEAMS_ACCOUNTING_LEGACY_SCALE
    ) {
      throw new Error("teams_accounting_correction_invalid");
    }
    const key = `${legacyIdentity.type}:${teamPeriodKey(legacyIdentity.team, legacyIdentity.period)}`;
    if (identities.has(key)) throw new Error("teams_accounting_correction_duplicate");
    identities.add(key);
    pairs.push({
      legacy,
      replacement,
      team: legacyIdentity.team,
      period: legacyIdentity.period,
    });
  }
  return Object.freeze(pairs);
}

async function buildAccountingReplay(params: {
  readonly rpc: RpcClient;
  readonly logs: readonly CanonicalProductLog[];
  readonly initial: ReadonlyMap<string, TeamPeriodFinancials>;
  readonly decodedByLog: ReadonlyMap<CanonicalProductLog, ReturnType<typeof decoded>>;
  readonly getBlock: (number: number) => Promise<RpcBlock>;
  readonly recordEvidence: (log: CanonicalProductLog, eventName: string | null) => void;
}): Promise<AccountingReplay> {
  const ledger = new Map(params.initial);
  const amountByLog = new Map<CanonicalProductLog, bigint>();
  const afterByLog = new Map<CanonicalProductLog, TeamPeriodFinancials>();
  const suppressed = new Set<CanonicalProductLog>();
  const accountingLogs = params.logs.filter((log) => {
    if (log.address !== TEAM_ACCOUNTANT_ADDRESS) return false;
    const eventName = params.decodedByLog.get(log)!.eventName;
    return eventName === "AdjustRevenue" || eventName === "AdjustCost";
  });
  const accountingByTransaction = new Map<string, CanonicalProductLog[]>();
  for (const log of accountingLogs) {
    const transactionLogs = accountingByTransaction.get(log.transactionHash) ?? [];
    transactionLogs.push(log);
    accountingByTransaction.set(log.transactionHash, transactionLogs);
  }
  const seedLogs = accountingByTransaction.get(TEAMS_ACCOUNTING_SEED_TRANSACTION);
  if (seedLogs !== undefined) validateAccountingSeed(seedLogs, params.decodedByLog);
  const correctionLogs = accountingByTransaction.get(TEAMS_ACCOUNTING_CORRECTION_TRANSACTION);
  const correctionPairs = correctionLogs === undefined
    ? null
    : validateAccountingCorrection(correctionLogs, params.decodedByLog);
  let correctionValidated = false;

  for (const log of accountingLogs) {
    const event = params.decodedByLog.get(log)!;
    params.recordEvidence(log, event.eventName);
    if (log.transactionHash === TEAMS_ACCOUNTING_CORRECTION_TRANSACTION) {
      if (!correctionValidated) {
        correctionValidated = true;
        const block = await params.getBlock(TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK);
        for (const pair of correctionPairs!) {
          const key = teamPeriodKey(pair.team, pair.period);
          const expected = ledger.get(key);
          if (expected === undefined) throw new Error("teams_accounting_correction_history_missing");
          const actual = await financials(params.rpc, block, pair.team, pair.period);
          if (actual.revenue !== expected.revenue || actual.cost !== expected.cost) {
            throw new Error("teams_accounting_correction_state_mismatch");
          }
          suppressed.add(pair.legacy);
          suppressed.add(pair.replacement);
        }
      }
      continue;
    }

    const identity = adjustmentIdentity(event);
    const key = teamPeriodKey(identity.team, identity.period);
    const rawAmount = asBigint(event.args.amount, "teams_adjust_amount");
    const amount = log.transactionHash === TEAMS_ACCOUNTING_SEED_TRANSACTION
      ? rawAmount * TEAMS_ACCOUNTING_LEGACY_SCALE
      : rawAmount;
    if (amount === 0n) {
      amountByLog.set(log, 0n);
      const unchanged = ledger.get(key);
      if (unchanged !== undefined) afterByLog.set(log, unchanged);
      continue;
    }
    let before = ledger.get(key);
    if (before === undefined) {
      if (log.transactionHash === TEAMS_ACCOUNTING_SEED_TRANSACTION) {
        before = frozenFinancials(0n, 0n);
      } else {
        if (log.blockNumber === 0) throw new Error("teams_accounting_prior_block_missing");
        const priorBlock = await params.getBlock(log.blockNumber - 1);
        before = await financials(params.rpc, priorBlock, identity.team, identity.period);
        if (
          log.blockNumber <= TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK &&
          (before.revenue !== 0n || before.cost !== 0n)
        ) {
          throw new Error("teams_accounting_history_incomplete");
        }
      }
    }
    const increment = asBoolean(event.args.increment, "teams_adjust_increment");
    const previous = identity.type === "revenue" ? before.revenue : before.cost;
    if (!increment && amount > previous) throw new Error("teams_accounting_underflow");
    const nextValue = increment ? previous + amount : previous - amount;
    const after = identity.type === "revenue"
      ? frozenFinancials(nextValue, before.cost)
      : frozenFinancials(before.revenue, nextValue);
    amountByLog.set(log, amount);
    afterByLog.set(log, after);
    ledger.set(key, after);
  }

  return Object.freeze({ terminal: ledger, amountByLog, afterByLog, suppressed });
}

function replayAmount(replay: AccountingReplay, log: CanonicalProductLog): bigint {
  const amount = replay.amountByLog.get(log);
  if (amount === undefined) throw new Error("teams_accounting_replay_amount_missing");
  return amount;
}

function replayAfter(
  replay: AccountingReplay,
  log: CanonicalProductLog,
): TeamPeriodFinancials {
  const value = replay.afterByLog.get(log);
  if (value === undefined) throw new Error("teams_accounting_replay_state_missing");
  return value;
}

export async function scanTeamsBlocks(params: {
  readonly rpc: RpcClient;
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly state: TeamsState;
}): Promise<TeamsScanResult> {
  const teams = new Map(params.state.teams);
  let failureEvidence: Omit<TeamsScanFailure, "code" | "reason"> = {
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
    const fixedRaw = await params.rpc.getLogs({
      address: FIXED_ADDRESSES,
      topics: [FIXED_TOPICS],
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
    });
    const fixed = sortProductLogs(
      fixedRaw
        .map(canonicalProductLog)
        .filter((log): log is CanonicalProductLog => log !== null)
        .filter(fixedTopicAllowed),
    );
    const blockCache = new Map<number, Promise<RpcBlock>>();
    const getBlock = (number: number) => {
      const cached = blockCache.get(number);
      if (cached !== undefined) return cached;
      const pending = exactBlock(params.rpc, number);
      blockCache.set(number, pending);
      return pending;
    };

    for (const log of fixed) {
      recordEvidence(log, null);
      assertCanonicalProductLog(log, await getBlock(log.blockNumber));
      if (log.address !== TEAM_REGISTRY_ADDRESS) continue;
      const event = decoded(log, TEAM_REGISTRY_EVENTS_ABI);
      recordEvidence(log, event.eventName);
      if (event.eventName !== "AddTeam") continue;
      const team = asAddress(event.args.team, "teams_add_team");
      const index = asBigint(event.args.idx, "teams_add_index");
      if (teams.has(team)) throw new Error("teams_duplicate_team");
      await assertRegisteredTeam(params.rpc, await getBlock(log.blockNumber), team, index);
      teams.set(team, index);
    }

    const dynamicRaw = teams.size === 0
      ? []
      : await params.rpc.getLogs({
          address: [...teams.keys()],
          topics: [Object.values(TEAM_EVENT_TOPICS)],
          fromBlock: params.fromBlock,
          toBlock: params.toBlock,
        });
    const dynamic = sortProductLogs(dynamicRaw.map(canonicalProductLog).filter((log): log is CanonicalProductLog => log !== null));
    const logs = sortProductLogs([...fixed, ...dynamic]);
    for (const log of dynamic) {
      recordEvidence(log, null);
      assertCanonicalProductLog(log, await getBlock(log.blockNumber));
    }
    const nameCache = new Map<string, Promise<string>>();
    const getName = (block: RpcBlock, team: Address) => {
      const key = `${block.hash}:${team}`;
      const cached = nameCache.get(key);
      if (cached !== undefined) return cached;
      const pending = teamName(params.rpc, block, team);
      nameCache.set(key, pending);
      return pending;
    };

    const decodedByLog = new Map<CanonicalProductLog, ReturnType<typeof decoded>>();
    for (const log of logs) {
      recordEvidence(log, null);
      const event = decoded(log, teams.has(log.address) ? TEAM_EVENTS_ABI : fixedAbi(log.address));
      recordEvidence(log, event.eventName);
      decodedByLog.set(log, event);
    }
    const byTransaction = new Map<string, CanonicalProductLog[]>();
    for (const log of logs) {
      const group = byTransaction.get(log.transactionHash) ?? [];
      group.push(log);
      byTransaction.set(log.transactionHash, group);
    }
    const accountingReplay = await buildAccountingReplay({
      rpc: params.rpc,
      logs,
      initial: params.state.financials,
      decodedByLog,
      getBlock,
      recordEvidence,
    });
    const bonusBundles = buildTeamBonusBundles(byTransaction, decodedByLog, recordEvidence);
    const consumedAccountingCompanions = new Set<CanonicalProductLog>();
    const consumedRevenueCompanions = new Set<CanonicalProductLog>();
    const consumedFundingCompanions = new Set<CanonicalProductLog>();
    const actions: ProductAlertAction[] = [];

    for (const log of logs) {
      const event = decodedByLog.get(log)!;
      recordEvidence(log, event.eventName);
      const block = await getBlock(log.blockNumber);

      if (log.address === TEAM_REGISTRY_ADDRESS) {
        if (event.eventName === "AddTeam") {
          const team = asAddress(event.args.team, "teams_add_team");
          const index = asBigint(event.args.idx, "teams_add_index");
          actions.push(action(log, "team_added", {
            team,
            teamName: await getName(block, team),
            teamIndex: index,
            owner: await readAddress(params.rpc, block, team, "owner"),
            currentPeriod: blockPeriod(block.timestamp!),
          }));
        } else if (event.eventName === "RetireTeam") {
          const team = asAddress(event.args.team, "teams_retire_team");
          const retirementPeriod = asBigint(event.args.period, "teams_retire_period");
          actions.push(action(log, "team_retirement_scheduled", {
            team,
            teamName: await getName(block, team),
            currentPeriod: blockPeriod(block.timestamp!),
            retirementPeriod,
            retirementTime: periodStart(retirementPeriod),
          }));
        } else if (event.eventName === "Deprecate") {
          actions.push(action(log, "teams_registry_deprecated", {
            registry: normalizeAddress(TEAM_REGISTRY),
            successor: asAddress(event.args.successor, "teams_successor"),
            teamCount: await readUint(params.rpc, block, normalizeAddress(TEAM_REGISTRY), "num_teams"),
          }));
        } else if (event.eventName === "MigrateTeam") {
          const team = asAddress(event.args.team, "teams_migrate_team");
          const companions = (byTransaction.get(log.transactionHash) ?? []).filter((candidate) => {
            const value = decodedByLog.get(candidate)!;
            return candidate.address === team && value.eventName === "Migrate";
          });
          const companion = exactlyOne(
            companions,
            "teams_migration_companion_missing",
            "teams_migration_companion_ambiguous",
          );
          const migrated = decodedByLog.get(companion)!;
          const currentRegistry = asAddress(
            migrated.args.registry,
            "teams_migration_registry",
          );
          if (await readAddress(params.rpc, block, team, "registry") !== currentRegistry) {
            throw new Error("teams_migration_registry_mismatch");
          }
          actions.push(action(log, "team_migrated", {
            team,
            teamName: await getName(block, team),
            previousRegistry: normalizeAddress(TEAM_REGISTRY),
            currentRegistry,
          }));
        }
        continue;
      }

      if (teams.has(log.address)) {
        const team = log.address;
        const teamLabel = await getName(block, team);
        if (event.eventName === "PendingOwner") {
          actions.push(action(log, "team_owner_pending", {
            team,
            teamName: teamLabel,
            currentOwner: await readAddress(params.rpc, block, team, "owner"),
            pendingOwner: asAddress(event.args.owner, "teams_pending_owner"),
          }));
        } else if (event.eventName === "SetOwner") {
          if (log.blockNumber === 0) throw new Error("teams_owner_prior_block_missing");
          const prior = await getBlock(log.blockNumber - 1);
          actions.push(action(log, "team_owner_set", {
            team,
            teamName: teamLabel,
            previousOwner: await readAddress(params.rpc, prior, team, "owner"),
            currentOwner: asAddress(event.args.owner, "teams_owner"),
          }));
        } else if (event.eventName === "DepositRevenue") {
          const period = asBigint(event.args.period, "teams_revenue_period");
          const revenue = asBigint(event.args.revenue, "teams_revenue_value");
          const amountValue = asBigint(event.args.amount, "teams_revenue_amount");
          const token = asAddress(event.args.token, "teams_revenue_token");
          const transactionLogs = byTransaction.get(log.transactionHash) ?? [];
          const accountingCompanion = consumeCompanion(
            transactionLogs,
            consumedAccountingCompanions,
            (candidate) => {
              if (candidate.address !== TEAM_ACCOUNTANT_ADDRESS) return false;
              const value = decodedByLog.get(candidate)!;
              return value.eventName === "AdjustRevenue" &&
                asAddress(value.args.operator, "teams_revenue_operator") === REVENUE_RECIPIENT_ADDRESS &&
                companionKey(value.args, "revenue") ===
                  ["revenue", team, period, revenue, "1"].join(":");
            },
            "teams_revenue_companion_missing",
          );
          consumeCompanion(
            transactionLogs,
            consumedRevenueCompanions,
            (candidate) => {
              if (candidate.address !== REVENUE_RECIPIENT_ADDRESS) return false;
              const value = decodedByLog.get(candidate)!;
              return value.eventName === "DepositRevenue" &&
                asAddress(value.args.team, "teams_recipient_team") === team &&
                asBigint(value.args.period, "teams_recipient_period") === period &&
                asAddress(value.args.token, "teams_recipient_token") === token &&
                asBigint(value.args.amount, "teams_recipient_amount") === amountValue &&
                asBigint(value.args.revenue, "teams_recipient_revenue") === revenue;
            },
            "teams_revenue_recipient_missing",
          );
          if (amountValue === 0n && revenue === 0n) continue;
          actions.push(action(log, "team_revenue_deposited", {
            team,
            teamName: teamLabel,
            deposited: await tokenAmount(params.rpc, block, token, amountValue),
            revenueUsd: replayAmount(accountingReplay, accountingCompanion),
            depositor: asAddress(event.args.depositor, "teams_revenue_depositor"),
            period,
            financialsAfter: replayAfter(accountingReplay, accountingCompanion),
          }));
        } else if (event.eventName === "ClaimFunding" || event.eventName === "ReturnFunding") {
          const index = asBigint(event.args.idx, "teams_funding_index");
          const period = asBigint(event.args.period, "teams_funding_period");
          const amountValue = asBigint(event.args.amount, "teams_funding_amount");
          const token = asAddress(event.args.token, "teams_funding_token");
          const distributorName = event.eventName;
          const adjustment = event.eventName === "ClaimFunding"
            ? asBigint(event.args.cost, "teams_funding_cost")
            : asBigint(event.args.refund, "teams_funding_refund");
          const increment = event.eventName === "ClaimFunding";
          const transactionLogs = byTransaction.get(log.transactionHash) ?? [];
          consumeCompanion(
            transactionLogs,
            consumedFundingCompanions,
            (candidate) => {
              if (candidate.address !== FUNDING_DISTRIBUTOR_ADDRESS) return false;
              const value = decodedByLog.get(candidate)!;
              if (
                value.eventName !== distributorName ||
                asBigint(value.args.idx, "teams_distributor_index") !== index ||
                asAddress(value.args.team, "teams_distributor_team") !== team ||
                asBigint(value.args.period, "teams_distributor_period") !== period ||
                asAddress(value.args.token, "teams_distributor_token") !== token ||
                asBigint(value.args.amount, "teams_distributor_amount") !== amountValue
              ) return false;
              return event.eventName === "ClaimFunding"
                ? asBigint(value.args.cost, "teams_distributor_cost") === adjustment &&
                  asAddress(value.args.vest, "teams_distributor_vest") === asAddress(event.args.vest, "teams_funding_vest") &&
                  asAddress(value.args.recipient, "teams_distributor_recipient") === asAddress(event.args.recipient, "teams_funding_recipient")
                : asBigint(value.args.refund, "teams_distributor_refund") === adjustment &&
                  asAddress(value.args.sender, "teams_distributor_sender") === asAddress(event.args.sender, "teams_funding_sender");
            },
            "teams_funding_companion_missing",
          );
          const adjustType = "cost" as const;
          consumeCompanion(
            transactionLogs,
            consumedAccountingCompanions,
            (candidate) => {
              if (candidate.address !== TEAM_ACCOUNTANT_ADDRESS) return false;
              const value = decodedByLog.get(candidate)!;
              return value.eventName === "AdjustCost" &&
                asAddress(value.args.operator, "teams_funding_operator") === FUNDING_DISTRIBUTOR_ADDRESS &&
                companionKey(value.args, adjustType) ===
                  [adjustType, team, period, adjustment, increment ? "1" : "0"].join(":");
            },
            "teams_funding_accounting_missing",
          );
          const [approvalTeam, , approvalToken, approvedAmount, , used] = await approval(params.rpc, block, index);
          if (approvalTeam !== team || approvalToken !== token || used > approvedAmount) throw new Error("teams_funding_approval_mismatch");
          if (event.eventName === "ClaimFunding") {
            actions.push(action(log, "team_funding_claimed", {
              approvalId: index,
              team,
              teamName: teamLabel,
              claimed: await tokenAmount(params.rpc, block, token, amountValue),
              costUsd: adjustment,
              recipient: asAddress(event.args.recipient, "teams_funding_recipient"),
              vest: asAddress(event.args.vest, "teams_funding_vest"),
              remaining: await tokenAmount(params.rpc, block, token, approvedAmount - used),
            }));
          } else {
            actions.push(action(log, "team_funding_returned", {
              approvalId: index,
              team,
              teamName: teamLabel,
              returned: await tokenAmount(params.rpc, block, token, amountValue),
              refundUsd: adjustment,
              sender: asAddress(event.args.sender, "teams_funding_sender"),
              usedAfter: await tokenAmount(params.rpc, block, token, used),
            }));
          }
        }
        continue;
      }

      if (log.address === FUNDING_DISTRIBUTOR_ADDRESS && event.eventName === "ApproveFunding") {
        const team = asAddress(event.args.team, "teams_approval_team");
        const period = asBigint(event.args.period, "teams_approval_period");
        const duration = asBigint(event.args.duration, "teams_approval_duration");
        const token = asAddress(event.args.token, "teams_approval_token");
        const approvalId = asBigint(event.args.idx, "teams_approval_index");
        const [storedTeam, storedPeriod, storedToken, storedAmount, storedDuration, storedUsed] = await approval(params.rpc, block, approvalId);
        if (
          storedTeam !== team ||
          storedPeriod !== period ||
          storedToken !== token ||
          storedAmount !== asBigint(event.args.amount, "teams_approval_amount") ||
          storedDuration !== duration ||
          storedUsed !== 0n
        ) throw new Error("teams_approval_evidence_mismatch");
        actions.push(action(log, "team_funding_approved", {
          approvalId,
          team,
          teamName: await getName(block, team),
          funding: await tokenAmount(params.rpc, block, token, asBigint(event.args.amount, "teams_approval_amount")),
          period,
          vestingDurationSeconds: duration,
          claimStartsAt: periodStart(period),
          claimEndsAt: periodStart(period) + BigInt(TEAMS_PERIOD_SECONDS),
        }));
        continue;
      }

      if (log.address === BONUS_DISTRIBUTOR_ADDRESS && event.eventName === "ClaimBonus") {
        const bundle = bonusBundles.get(log);
        if (bundle === undefined) continue;
        const claims = bundle.claims;
        const values = claims.map((claim) => decodedByLog.get(claim)!.args);
        const team = asAddress(values[0]!.team, "teams_bonus_team");
        const gross = values.reduce((sum, value) => sum + asBigint(value.amount, "teams_bonus_amount"), 0n);
        const ybcAmount = values.reduce((sum, value) => sum + asBigint(value.ybc_amount, "teams_bonus_ybc"), 0n);
        const recipient = asAddress(values[0]!.recipient, "teams_bonus_recipient");
        if (
          gross < ybcAmount ||
          values.some((value) => asAddress(value.recipient, "teams_bonus_recipient") !== recipient)
        ) throw new Error("teams_bonus_values_invalid");
        if (gross === 0n && ybcAmount === 0n) continue;
        actions.push(action(log, "team_bonus_claimed", {
          team,
          teamName: await getName(block, team),
          periods: values.map((value) => asBigint(value.period, "teams_bonus_period")),
          gross,
          teamAmount: gross - ybcAmount,
          ybcAmount,
          recipient,
        }));
        continue;
      }

      if (log.address === TEAM_ACCOUNTANT_ADDRESS && (event.eventName === "AdjustRevenue" || event.eventName === "AdjustCost")) {
        if (accountingReplay.suppressed.has(log)) continue;
        const transactionLogs = byTransaction.get(log.transactionHash)!;
        const adjustmentTeam = asAddress(event.args.team, "teams_adjust_team");
        const adjustmentPeriod = asBigint(event.args.period, "teams_adjust_period");
        const adjustmentAmount = asBigint(event.args.amount, "teams_adjust_amount");
        const adjustmentIncrement = asBoolean(event.args.increment, "teams_adjust_increment");
        const adjustmentOperator = asAddress(event.args.operator, "teams_adjust_operator");
        const isCausalCompanion = transactionLogs.some((candidate) => {
          if (!teams.has(candidate.address)) return false;
          const value = decodedByLog.get(candidate)!;
          if (event.eventName === "AdjustRevenue" && value.eventName === "DepositRevenue") {
            return candidate.address === adjustmentTeam &&
              asBigint(value.args.period, "teams_deposit_period") === adjustmentPeriod &&
              asBigint(value.args.revenue, "teams_deposit_revenue") === adjustmentAmount &&
              adjustmentIncrement &&
              adjustmentOperator === REVENUE_RECIPIENT_ADDRESS;
          }
          if (event.eventName === "AdjustCost" && (value.eventName === "ClaimFunding" || value.eventName === "ReturnFunding")) {
            const reported = value.eventName === "ClaimFunding"
              ? asBigint(value.args.cost, "teams_claim_cost")
              : asBigint(value.args.refund, "teams_return_refund");
            return candidate.address === adjustmentTeam &&
              asBigint(value.args.period, "teams_funding_period") === adjustmentPeriod &&
              reported === adjustmentAmount &&
              adjustmentIncrement === (value.eventName === "ClaimFunding") &&
              adjustmentOperator === FUNDING_DISTRIBUTOR_ADDRESS;
          }
          return false;
        });
        if (isCausalCompanion) continue;
        if (adjustmentAmount === 0n) continue;
        const kind = event.eventName === "AdjustRevenue" ? "team_revenue_adjusted" : "team_cost_adjusted";
        const team = asAddress(event.args.team, "teams_adjust_team");
        const period = asBigint(event.args.period, "teams_adjust_period");
        actions.push(action(log, kind, {
          team,
          teamName: await getName(block, team),
          operator: asAddress(event.args.operator, "teams_adjust_operator"),
          period,
          amountUsd: replayAmount(accountingReplay, log),
          increment: asBoolean(event.args.increment, "teams_adjust_increment"),
          financialsAfter: replayAfter(accountingReplay, log),
        }));
        continue;
      }

      if (log.address === REVENUE_RECIPIENT_ADDRESS) {
        if (event.eventName === "ToRewards" || event.eventName === "ToTreasury" || event.eventName === "ToRecovery") {
          const token = await readAddress(params.rpc, block, normalizeAddress(REVENUE_RECIPIENT), "token");
          const amountValue = asBigint(event.args.amount, "teams_route_amount");
          const bucket = event.eventName === "ToRewards" ? 0n : event.eventName === "ToTreasury" ? 1n : 2n;
          const shared = {
            amount: await tokenAmount(params.rpc, block, token, amountValue),
            usedAfter: await tokenAmount(params.rpc, block, token, await readUint(params.rpc, block, normalizeAddress(REVENUE_RECIPIENT), "used", [bucket])),
          };
          if (event.eventName === "ToRewards") {
            actions.push(action(log, "team_revenue_to_rewards", { ...shared, rewardEpoch: asBigint(event.args.epoch, "teams_reward_epoch") }));
          } else if (event.eventName === "ToTreasury") {
            actions.push(action(log, "team_revenue_to_treasury", { ...shared, treasury: await readAddress(params.rpc, block, normalizeAddress(REVENUE_RECIPIENT), "treasury") }));
          } else {
            actions.push(action(log, "team_revenue_to_recovery", { ...shared, recoveryAuction: await readAddress(params.rpc, block, normalizeAddress(REVENUE_RECIPIENT), "recovery_auction") }));
          }
        }
      }
    }

    for (const transactionLogs of byTransaction.values()) {
      const teamEvents = transactionLogs.filter((candidate) => teams.has(candidate.address));
      for (const candidate of transactionLogs) {
        const candidateEvent = decodedByLog.get(candidate)!;
        if (
          candidate.address === TEAM_ACCOUNTANT_ADDRESS &&
          !accountingReplay.suppressed.has(candidate) &&
          !consumedAccountingCompanions.has(candidate) &&
          (candidateEvent.eventName === "AdjustRevenue" || candidateEvent.eventName === "AdjustCost")
        ) {
          const team = asAddress(candidateEvent.args.team, "teams_unconsumed_adjust_team");
          const period = asBigint(candidateEvent.args.period, "teams_unconsumed_adjust_period");
          const operator = asAddress(candidateEvent.args.operator, "teams_unconsumed_adjust_operator");
          const related = teamEvents.some((teamLog) => {
            const teamEvent = decodedByLog.get(teamLog)!;
            if (teamLog.address !== team) return false;
            if (
              candidateEvent.eventName === "AdjustRevenue" &&
              operator === REVENUE_RECIPIENT_ADDRESS &&
              teamEvent.eventName === "DepositRevenue"
            ) {
              return asBigint(teamEvent.args.period, "teams_unconsumed_revenue_period") === period;
            }
            if (
              candidateEvent.eventName === "AdjustCost" &&
              operator === FUNDING_DISTRIBUTOR_ADDRESS &&
              (teamEvent.eventName === "ClaimFunding" || teamEvent.eventName === "ReturnFunding")
            ) {
              return asBigint(teamEvent.args.period, "teams_unconsumed_funding_period") === period;
            }
            return false;
          });
          if (related) {
            recordEvidence(candidate, candidateEvent.eventName);
            throw new Error("teams_accounting_companion_unconsumed");
          }
        }
        if (
          candidate.address === REVENUE_RECIPIENT_ADDRESS &&
          candidateEvent.eventName === "DepositRevenue" &&
          !consumedRevenueCompanions.has(candidate)
        ) {
          const team = asAddress(candidateEvent.args.team, "teams_unconsumed_recipient_team");
          const period = asBigint(candidateEvent.args.period, "teams_unconsumed_recipient_period");
          const related = teamEvents.some((teamLog) => {
            const teamEvent = decodedByLog.get(teamLog)!;
            return teamLog.address === team &&
              teamEvent.eventName === "DepositRevenue" &&
              asBigint(teamEvent.args.period, "teams_unconsumed_revenue_period") === period;
          });
          if (related) {
            recordEvidence(candidate, candidateEvent.eventName);
            throw new Error("teams_revenue_recipient_unconsumed");
          }
        }
        if (
          candidate.address === FUNDING_DISTRIBUTOR_ADDRESS &&
          (candidateEvent.eventName === "ClaimFunding" || candidateEvent.eventName === "ReturnFunding") &&
          !consumedFundingCompanions.has(candidate)
        ) {
          const index = asBigint(candidateEvent.args.idx, "teams_unconsumed_funding_index");
          const related = teamEvents.some((teamLog) => {
            const teamEvent = decodedByLog.get(teamLog)!;
            return teamEvent.eventName === candidateEvent.eventName &&
              asBigint(teamEvent.args.idx, "teams_unconsumed_team_funding_index") === index;
          });
          if (related) {
            recordEvidence(candidate, candidateEvent.eventName);
            throw new Error("teams_funding_companion_unconsumed");
          }
        }
      }
    }

    actions.sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex);
    return {
      state: Object.freeze({ teams, financials: accountingReplay.terminal }),
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
