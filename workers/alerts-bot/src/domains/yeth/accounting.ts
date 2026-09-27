import { ZERO_ADDRESS } from "../../abis";
import type { NormalizedAction, YethWithdrawalType } from "../../types";

export type YethSnapshotBucket = "unclaimed" | "stayed" | "exited";

export interface YethAccountSnapshot {
  snapshotEth: bigint;
  bucket: YethSnapshotBucket;
}

export interface YethState {
  accounts: Map<string, YethAccountSnapshot>;
  trackedStayedSharesByAddress: Map<string, bigint>;
  trackedStayedCostBasisByAddress: Map<string, bigint>;
  observedSharesByAddress: Map<string, bigint>;
  trackedStayedSharesTotal: bigint;
  totalSnapshotDebtEth: bigint;
  snapshotExitedEth: bigint;
  snapshotStayedEth: bigint;
  snapshotUnclaimedEth: bigint;
}

export interface StoredYethAccountSnapshot {
  snapshotEth: string;
  bucket: YethSnapshotBucket;
}

export interface StoredYethState {
  accounts: Record<string, StoredYethAccountSnapshot>;
  trackedStayedSharesByAddress: Record<string, string>;
  trackedStayedCostBasisByAddress: Record<string, string>;
  observedSharesByAddress: Record<string, string>;
  trackedStayedSharesTotal: string;
  totalSnapshotDebtEth: string;
  snapshotExitedEth: string;
  snapshotStayedEth: string;
  snapshotUnclaimedEth: string;
}

export interface YethWithdrawalAttribution {
  owner: string;
  sharesBurned: bigint;
  ownerSharesBefore: bigint;
  ownerSharesAfter: bigint;
  snapshotMovedEth: bigint;
  withdrawalType: YethWithdrawalType;
}

export interface YethRepaymentMetrics {
  totalSnapshotDebtEth: bigint;
  snapshotExitedEth: bigint;
  snapshotStayedEth: bigint;
  outstandingDebtEth: bigint;
  recoveryVaultAssetsEth: bigint | null;
  yieldVaultAssetsEth: bigint | null;
}

export interface StoredYethRepaymentMetrics {
  totalSnapshotDebtEth: string;
  snapshotExitedEth: string;
  snapshotStayedEth: string;
  outstandingDebtEth: string;
  recoveryVaultAssetsEth: string | null;
  yieldVaultAssetsEth: string | null;
}

export interface YethFlowSummary {
  recoveryNetFlowEth: bigint;
  yieldNetFlowEth: bigint;
}

export const YETH_PROGRESS_ALERT_MIN_DELTA_ETH = 500_000_000_000_000_000n;

export const YETH_SYNTHETIC_LOG_INDEX = Object.freeze({
  yeth_debt_paid_down: 910_001,
  yeth_recovery_progress: 910_002,
  yeth_recovery_setback: 910_003,
  yeth_yield_capacity_up: 910_004,
  yeth_yield_capacity_down: 910_005,
} as const);

export function normalizeYethAddress(address: string): string {
  const normalized = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new TypeError("invalid yETH address");
  }
  return normalized;
}

function parseDecimalBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(`${label} must be a canonical nonnegative decimal string`);
  }
  return BigInt(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new TypeError(`${label} has an invalid schema`);
  }
}

function subtractFloor(value: bigint, amount: bigint): bigint {
  if (amount <= 0n) {
    return value;
  }
  return amount >= value ? 0n : value - amount;
}

function mapTotal(values: ReadonlyMap<string, bigint>): bigint {
  let total = 0n;
  for (const value of values.values()) {
    total += value;
  }
  return total;
}

export function createEmptyYethState(): YethState {
  return {
    accounts: new Map(),
    trackedStayedSharesByAddress: new Map(),
    trackedStayedCostBasisByAddress: new Map(),
    observedSharesByAddress: new Map(),
    trackedStayedSharesTotal: 0n,
    totalSnapshotDebtEth: 0n,
    snapshotExitedEth: 0n,
    snapshotStayedEth: 0n,
    snapshotUnclaimedEth: 0n,
  };
}

export function cloneYethState(state: YethState): YethState {
  return {
    accounts: new Map(
      [...state.accounts].map(([address, account]) => [
        address,
        { snapshotEth: account.snapshotEth, bucket: account.bucket },
      ]),
    ),
    trackedStayedSharesByAddress: new Map(state.trackedStayedSharesByAddress),
    trackedStayedCostBasisByAddress: new Map(
      state.trackedStayedCostBasisByAddress,
    ),
    observedSharesByAddress: new Map(state.observedSharesByAddress),
    trackedStayedSharesTotal: state.trackedStayedSharesTotal,
    totalSnapshotDebtEth: state.totalSnapshotDebtEth,
    snapshotExitedEth: state.snapshotExitedEth,
    snapshotStayedEth: state.snapshotStayedEth,
    snapshotUnclaimedEth: state.snapshotUnclaimedEth,
  };
}

export function replaceYethState(target: YethState, source: YethState): void {
  target.accounts = new Map(
    [...source.accounts].map(([address, account]) => [
      address,
      { snapshotEth: account.snapshotEth, bucket: account.bucket },
    ]),
  );
  target.trackedStayedSharesByAddress = new Map(
    source.trackedStayedSharesByAddress,
  );
  target.trackedStayedCostBasisByAddress = new Map(
    source.trackedStayedCostBasisByAddress,
  );
  target.observedSharesByAddress = new Map(source.observedSharesByAddress);
  target.trackedStayedSharesTotal = source.trackedStayedSharesTotal;
  target.totalSnapshotDebtEth = source.totalSnapshotDebtEth;
  target.snapshotExitedEth = source.snapshotExitedEth;
  target.snapshotStayedEth = source.snapshotStayedEth;
  target.snapshotUnclaimedEth = source.snapshotUnclaimedEth;
}

export function assertYethAccountingInvariants(
  state: YethState,
  context = "state",
): void {
  const scalarValues = [
    state.trackedStayedSharesTotal,
    state.totalSnapshotDebtEth,
    state.snapshotExitedEth,
    state.snapshotStayedEth,
    state.snapshotUnclaimedEth,
  ];
  if (scalarValues.some((value) => value < 0n)) {
    throw new Error(`yeth_invariant_negative:${context}`);
  }

  const bucketTotal =
    state.snapshotExitedEth +
    state.snapshotStayedEth +
    state.snapshotUnclaimedEth;
  if (bucketTotal !== state.totalSnapshotDebtEth) {
    throw new Error(`yeth_invariant_snapshot_total:${context}`);
  }

  for (const [address, account] of state.accounts) {
    if (
      address !== normalizeYethAddress(address) ||
      !/^0x[0-9a-f]{40}$/.test(address) ||
      (address === ZERO_ADDRESS.toLowerCase() && account.snapshotEth > 0n) ||
      account.snapshotEth < 0n ||
      account.bucket !== "unclaimed"
    ) {
      throw new Error(`yeth_invariant_account:${context}`);
    }
  }
  const unclaimedAccountTotal = [...state.accounts.values()].reduce(
    (total, account) => total + account.snapshotEth,
    0n,
  );
  if (unclaimedAccountTotal !== state.snapshotUnclaimedEth) {
    throw new Error(`yeth_invariant_unclaimed_accounts_total:${context}`);
  }

  for (const [address, value] of state.observedSharesByAddress) {
    if (
      address !== normalizeYethAddress(address) ||
      !/^0x[0-9a-f]{40}$/.test(address) ||
      address === ZERO_ADDRESS.toLowerCase() ||
      value <= 0n
    ) {
      throw new Error(`yeth_invariant_observed_shares:${context}`);
    }
  }

  for (const [address, tracked] of state.trackedStayedSharesByAddress) {
    const observed = state.observedSharesByAddress.get(address) ?? 0n;
    if (
      address !== normalizeYethAddress(address) ||
      !/^0x[0-9a-f]{40}$/.test(address) ||
      address === ZERO_ADDRESS.toLowerCase() ||
      tracked <= 0n ||
      tracked > observed
    ) {
      throw new Error(`yeth_invariant_tracked_shares:${context}`);
    }
  }

  for (const [address, costBasis] of state.trackedStayedCostBasisByAddress) {
    if (
      address !== normalizeYethAddress(address) ||
      !/^0x[0-9a-f]{40}$/.test(address) ||
      address === ZERO_ADDRESS.toLowerCase() ||
      costBasis <= 0n ||
      !state.trackedStayedSharesByAddress.has(address)
    ) {
      throw new Error(`yeth_invariant_tracked_cost_basis:${context}`);
    }
  }

  if (mapTotal(state.trackedStayedSharesByAddress) !== state.trackedStayedSharesTotal) {
    throw new Error(`yeth_invariant_tracked_total:${context}`);
  }
  if (mapTotal(state.trackedStayedCostBasisByAddress) !== state.snapshotStayedEth) {
    throw new Error(`yeth_invariant_tracked_cost_basis_total:${context}`);
  }
}

function canonicalBigIntMap(
  values: ReadonlyMap<string, bigint>,
): Record<string, string> {
  return Object.fromEntries(
    [...values]
      .filter(([, value]) => value > 0n)
      .map(([address, value]) => [normalizeYethAddress(address), value] as const)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([address, value]) => [address, value.toString()]),
  );
}

export function serializeYethState(state: YethState): StoredYethState {
  assertYethAccountingInvariants(state, "serialize");
  const accounts = Object.fromEntries(
    [...state.accounts]
      .filter(([, account]) => account.snapshotEth > 0n)
      .map(([address, account]) => [normalizeYethAddress(address), account] as const)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([address, account]) => [
        address,
        {
          snapshotEth: account.snapshotEth.toString(),
          bucket: account.bucket,
        },
      ]),
  );

  return {
    accounts,
    trackedStayedSharesByAddress: canonicalBigIntMap(
      state.trackedStayedSharesByAddress,
    ),
    trackedStayedCostBasisByAddress: canonicalBigIntMap(
      state.trackedStayedCostBasisByAddress,
    ),
    observedSharesByAddress: canonicalBigIntMap(state.observedSharesByAddress),
    trackedStayedSharesTotal: state.trackedStayedSharesTotal.toString(),
    totalSnapshotDebtEth: state.totalSnapshotDebtEth.toString(),
    snapshotExitedEth: state.snapshotExitedEth.toString(),
    snapshotStayedEth: state.snapshotStayedEth.toString(),
    snapshotUnclaimedEth: state.snapshotUnclaimedEth.toString(),
  };
}

function loadBigIntMap(
  record: unknown,
  label: string,
): Map<string, bigint> {
  if (!isPlainRecord(record)) {
    throw new TypeError(`${label} must be an object`);
  }
  const output = new Map<string, bigint>();
  for (const [rawAddress, rawValue] of Object.entries(record)) {
    const address = normalizeYethAddress(rawAddress);
    if (address !== rawAddress || output.has(address)) {
      throw new Error(`${label} contains a noncanonical address`);
    }
    const value = parseDecimalBigInt(rawValue, label);
    if (value > 0n) {
      if (address === ZERO_ADDRESS.toLowerCase()) {
        throw new Error(`${label} contains the zero address`);
      }
      output.set(address, value);
    }
  }
  return output;
}

export function loadYethState(
  stored: unknown,
): YethState {
  if (stored === null || stored === undefined) {
    throw new TypeError("yETH state is required");
  }

  if (!isPlainRecord(stored)) {
    throw new TypeError("yETH state must be an object");
  }
  requireExactKeys(
    stored,
    [
      "accounts",
      "trackedStayedSharesByAddress",
      "trackedStayedCostBasisByAddress",
      "observedSharesByAddress",
      "trackedStayedSharesTotal",
      "totalSnapshotDebtEth",
      "snapshotExitedEth",
      "snapshotStayedEth",
      "snapshotUnclaimedEth",
    ],
    "yETH state",
  );
  if (!isPlainRecord(stored.accounts)) {
    throw new TypeError("yETH accounts must be an object");
  }

  const accounts = new Map<string, YethAccountSnapshot>();
  for (const [rawAddress, rawAccount] of Object.entries(stored.accounts)) {
    if (!isPlainRecord(rawAccount)) {
      throw new TypeError("yETH account must be an object");
    }
    requireExactKeys(rawAccount, ["snapshotEth", "bucket"], "yETH account");
    const bucket = rawAccount.bucket;
    if (
      bucket !== "unclaimed" &&
      bucket !== "stayed" &&
      bucket !== "exited"
    ) {
      throw new TypeError("yETH account has an invalid bucket");
    }
    const address = normalizeYethAddress(rawAddress);
    if (address !== rawAddress || accounts.has(address)) {
      throw new Error("yETH accounts contain a noncanonical address");
    }
    const snapshotEth = parseDecimalBigInt(rawAccount.snapshotEth, "snapshotEth");
    if (snapshotEth > 0n) {
      if (address === ZERO_ADDRESS.toLowerCase()) {
        throw new TypeError("positive yETH accounts cannot use the zero address");
      }
      if (bucket !== "unclaimed") {
        throw new TypeError("positive yETH accounts must be unclaimed");
      }
      accounts.set(address, {
        snapshotEth,
        bucket,
      });
    }
  }

  const state: YethState = {
    accounts,
    trackedStayedSharesByAddress: loadBigIntMap(
      stored.trackedStayedSharesByAddress,
      "trackedStayedSharesByAddress",
    ),
    trackedStayedCostBasisByAddress: loadBigIntMap(
      stored.trackedStayedCostBasisByAddress,
      "trackedStayedCostBasisByAddress",
    ),
    observedSharesByAddress: loadBigIntMap(
      stored.observedSharesByAddress,
      "observedSharesByAddress",
    ),
    trackedStayedSharesTotal: parseDecimalBigInt(
      stored.trackedStayedSharesTotal,
      "trackedStayedSharesTotal",
    ),
    totalSnapshotDebtEth: parseDecimalBigInt(
      stored.totalSnapshotDebtEth,
      "totalSnapshotDebtEth",
    ),
    snapshotExitedEth: parseDecimalBigInt(
      stored.snapshotExitedEth,
      "snapshotExitedEth",
    ),
    snapshotStayedEth: parseDecimalBigInt(
      stored.snapshotStayedEth,
      "snapshotStayedEth",
    ),
    snapshotUnclaimedEth: parseDecimalBigInt(
      stored.snapshotUnclaimedEth,
      "snapshotUnclaimedEth",
    ),
  };
  assertYethAccountingInvariants(state, "load");
  return state;
}

function recomputeSnapshotTotal(state: YethState): void {
  state.totalSnapshotDebtEth =
    state.snapshotExitedEth + state.snapshotStayedEth + state.snapshotUnclaimedEth;
}

function getAccount(state: YethState, rawAddress: string): YethAccountSnapshot {
  const address = normalizeYethAddress(rawAddress);
  const existing = state.accounts.get(address);
  if (existing !== undefined) {
    return existing;
  }
  const created: YethAccountSnapshot = { snapshotEth: 0n, bucket: "unclaimed" };
  state.accounts.set(address, created);
  return created;
}

function applyBucketDelta(
  state: YethState,
  bucket: YethSnapshotBucket,
  delta: bigint,
): void {
  const update = (value: bigint): bigint => {
    if (delta >= 0n) return value + delta;
    if (-delta > value) throw new Error("yeth_bucket_underflow");
    return value + delta;
  };
  if (bucket === "unclaimed") {
    state.snapshotUnclaimedEth = update(state.snapshotUnclaimedEth);
  } else if (bucket === "stayed") {
    state.snapshotStayedEth = update(state.snapshotStayedEth);
  } else {
    state.snapshotExitedEth = update(state.snapshotExitedEth);
  }
}

export function applyYethSetClaim(
  state: YethState,
  account: string,
  snapshotEth: bigint,
): void {
  const current = getAccount(state, account);
  if (current.snapshotEth > 0n) {
    applyBucketDelta(state, "unclaimed", -current.snapshotEth);
  }
  current.snapshotEth = snapshotEth > 0n ? snapshotEth : 0n;
  current.bucket = "unclaimed";
  if (current.snapshotEth > 0n) {
    applyBucketDelta(state, "unclaimed", current.snapshotEth);
  } else {
    state.accounts.delete(normalizeYethAddress(account));
  }
  recomputeSnapshotTotal(state);
}

export function applyYethClaim(
  state: YethState,
  account: string,
  exit: boolean,
  eventSnapshotEth: bigint,
): bigint {
  const normalizedAccount = normalizeYethAddress(account);
  const current = state.accounts.get(normalizedAccount);
  if (
    current === undefined ||
    current.bucket !== "unclaimed" ||
    current.snapshotEth <= 0n ||
    current.snapshotEth !== eventSnapshotEth
  ) {
    throw new Error("yeth_claim_entitlement_mismatch");
  }
  const snapshotAmount = current.snapshotEth;
  const target: YethSnapshotBucket = exit ? "exited" : "stayed";
  applyBucketDelta(state, "unclaimed", -snapshotAmount);
  applyBucketDelta(state, target, snapshotAmount);
  state.accounts.delete(normalizedAccount);
  recomputeSnapshotTotal(state);
  return snapshotAmount;
}

function getMapAmount(values: ReadonlyMap<string, bigint>, address: string): bigint {
  return values.get(normalizeYethAddress(address)) ?? 0n;
}

function setMapAmount(
  values: Map<string, bigint>,
  address: string,
  value: bigint,
): void {
  const normalized = normalizeYethAddress(address);
  if (value <= 0n) {
    values.delete(normalized);
  } else {
    values.set(normalized, value);
  }
}

export function applyYethShareMintFromClaimStay(
  state: YethState,
  owner: string,
  shares: bigint,
  snapshotCostBasisEth: bigint,
): void {
  if (shares <= 0n || snapshotCostBasisEth <= 0n) {
    throw new Error("yeth_claim_stay_mint_invalid");
  }
  setMapAmount(
    state.trackedStayedSharesByAddress,
    owner,
    getMapAmount(state.trackedStayedSharesByAddress, owner) + shares,
  );
  setMapAmount(
    state.trackedStayedCostBasisByAddress,
    owner,
    getMapAmount(state.trackedStayedCostBasisByAddress, owner) +
      snapshotCostBasisEth,
  );
  state.trackedStayedSharesTotal += shares;
}

export function applyYethTransferLedger(
  state: YethState,
  sender: string,
  receiver: string,
  value: bigint,
): YethWithdrawalAttribution | null {
  if (value <= 0n) {
    return null;
  }

  const normalizedSender = normalizeYethAddress(sender);
  const normalizedReceiver = normalizeYethAddress(receiver);
  const isMint = normalizedSender === normalizeYethAddress(ZERO_ADDRESS);
  const isBurn = normalizedReceiver === normalizeYethAddress(ZERO_ADDRESS);

  if (isMint) {
    setMapAmount(
      state.observedSharesByAddress,
      normalizedReceiver,
      getMapAmount(state.observedSharesByAddress, normalizedReceiver) + value,
    );
    return null;
  }

  const ownerSharesBefore = getMapAmount(
    state.observedSharesByAddress,
    normalizedSender,
  );
  if (ownerSharesBefore < value) {
    throw new Error("yeth_transfer_exceeds_observed_balance");
  }
  const ownerTrackedBefore = getMapAmount(
    state.trackedStayedSharesByAddress,
    normalizedSender,
  );
  const ownerCostBasisBefore = getMapAmount(
    state.trackedStayedCostBasisByAddress,
    normalizedSender,
  );
  const movedShares = value;
  const trackedMoved =
    ownerSharesBefore > 0n
      ? (movedShares * ownerTrackedBefore) / ownerSharesBefore
      : 0n;
  const costBasisMoved =
    ownerTrackedBefore > 0n
      ? (ownerCostBasisBefore * trackedMoved) / ownerTrackedBefore
      : 0n;
  const ownerSharesAfter = subtractFloor(ownerSharesBefore, movedShares);
  setMapAmount(state.observedSharesByAddress, normalizedSender, ownerSharesAfter);
  setMapAmount(
    state.trackedStayedSharesByAddress,
    normalizedSender,
    subtractFloor(ownerTrackedBefore, trackedMoved),
  );
  setMapAmount(
    state.trackedStayedCostBasisByAddress,
    normalizedSender,
    ownerCostBasisBefore - costBasisMoved,
  );

  if (!isBurn) {
    setMapAmount(
      state.observedSharesByAddress,
      normalizedReceiver,
      getMapAmount(state.observedSharesByAddress, normalizedReceiver) + movedShares,
    );
    setMapAmount(
      state.trackedStayedSharesByAddress,
      normalizedReceiver,
      getMapAmount(state.trackedStayedSharesByAddress, normalizedReceiver) +
        trackedMoved,
    );
    setMapAmount(
      state.trackedStayedCostBasisByAddress,
      normalizedReceiver,
      getMapAmount(state.trackedStayedCostBasisByAddress, normalizedReceiver) +
        costBasisMoved,
    );
    return null;
  }

  const snapshotMovedEth = costBasisMoved;
  state.trackedStayedSharesTotal = subtractFloor(
    state.trackedStayedSharesTotal,
    trackedMoved,
  );
  state.snapshotStayedEth = subtractFloor(state.snapshotStayedEth, snapshotMovedEth);
  state.snapshotExitedEth += snapshotMovedEth;
  recomputeSnapshotTotal(state);

  return {
    owner: normalizedSender,
    sharesBurned: movedShares,
    ownerSharesBefore,
    ownerSharesAfter,
    snapshotMovedEth,
    withdrawalType: ownerSharesAfter <= 0n ? "full" : "partial",
  };
}

export function buildYethRepaymentMetrics(
  state: YethState,
  recoveryVaultAssetsEth: bigint | null,
  yieldVaultAssetsEth: bigint | null,
): YethRepaymentMetrics {
  return {
    totalSnapshotDebtEth: state.totalSnapshotDebtEth,
    snapshotExitedEth: state.snapshotExitedEth,
    snapshotStayedEth: state.snapshotStayedEth,
    outstandingDebtEth: state.snapshotStayedEth + state.snapshotUnclaimedEth,
    recoveryVaultAssetsEth,
    yieldVaultAssetsEth,
  };
}

export function assertYethStateAndMetricsInvariants(
  state: YethState,
  metrics: YethRepaymentMetrics,
  context = "checkpoint",
): void {
  assertYethAccountingInvariants(state, context);
  if (
    metrics.totalSnapshotDebtEth < 0n ||
    metrics.snapshotExitedEth < 0n ||
    metrics.snapshotStayedEth < 0n ||
    metrics.outstandingDebtEth < 0n ||
    (metrics.recoveryVaultAssetsEth !== null &&
      metrics.recoveryVaultAssetsEth < 0n) ||
    (metrics.yieldVaultAssetsEth !== null && metrics.yieldVaultAssetsEth < 0n)
  ) {
    throw new Error(`yeth_metrics_negative:${context}`);
  }
  if (
    metrics.totalSnapshotDebtEth !== state.totalSnapshotDebtEth ||
    metrics.snapshotExitedEth !== state.snapshotExitedEth ||
    metrics.snapshotStayedEth !== state.snapshotStayedEth ||
    metrics.outstandingDebtEth !==
      state.snapshotStayedEth + state.snapshotUnclaimedEth
  ) {
    throw new Error(`yeth_metrics_state_mismatch:${context}`);
  }
}

export function serializeYethRepaymentMetrics(
  metrics: YethRepaymentMetrics,
): StoredYethRepaymentMetrics {
  return {
    totalSnapshotDebtEth: metrics.totalSnapshotDebtEth.toString(),
    snapshotExitedEth: metrics.snapshotExitedEth.toString(),
    snapshotStayedEth: metrics.snapshotStayedEth.toString(),
    outstandingDebtEth: metrics.outstandingDebtEth.toString(),
    recoveryVaultAssetsEth: metrics.recoveryVaultAssetsEth?.toString() ?? null,
    yieldVaultAssetsEth: metrics.yieldVaultAssetsEth?.toString() ?? null,
  };
}

export function loadYethRepaymentMetrics(
  stored: unknown,
): YethRepaymentMetrics | null {
  if (stored === null || stored === undefined) {
    return null;
  }
  if (!isPlainRecord(stored)) {
    throw new TypeError("yETH metrics must be an object");
  }
  requireExactKeys(
    stored,
    [
      "totalSnapshotDebtEth",
      "snapshotExitedEth",
      "snapshotStayedEth",
      "outstandingDebtEth",
      "recoveryVaultAssetsEth",
      "yieldVaultAssetsEth",
    ],
    "yETH metrics",
  );
  const metrics = {
    totalSnapshotDebtEth: parseDecimalBigInt(
      stored.totalSnapshotDebtEth,
      "metrics.totalSnapshotDebtEth",
    ),
    snapshotExitedEth: parseDecimalBigInt(
      stored.snapshotExitedEth,
      "metrics.snapshotExitedEth",
    ),
    snapshotStayedEth: parseDecimalBigInt(
      stored.snapshotStayedEth,
      "metrics.snapshotStayedEth",
    ),
    outstandingDebtEth: parseDecimalBigInt(
      stored.outstandingDebtEth,
      "metrics.outstandingDebtEth",
    ),
    recoveryVaultAssetsEth:
      stored.recoveryVaultAssetsEth === null
        ? null
        : parseDecimalBigInt(
            stored.recoveryVaultAssetsEth,
            "metrics.recoveryVaultAssetsEth",
          ),
    yieldVaultAssetsEth:
      stored.yieldVaultAssetsEth === null
        ? null
        : parseDecimalBigInt(
            stored.yieldVaultAssetsEth,
            "metrics.yieldVaultAssetsEth",
          ),
  } satisfies YethRepaymentMetrics;
  if (
    metrics.outstandingDebtEth !==
    metrics.snapshotStayedEth +
      (metrics.totalSnapshotDebtEth -
        metrics.snapshotExitedEth -
        metrics.snapshotStayedEth)
  ) {
    throw new Error("yeth_metrics_outstanding_mismatch");
  }
  return metrics;
}

function percentHundredths(numerator: bigint, denominator: bigint): bigint {
  if (numerator <= 0n || denominator <= 0n) {
    return 0n;
  }
  return (numerator * 10_000n + denominator / 2n) / denominator;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function syntheticProgressAction(
  kind: keyof typeof YETH_SYNTHETIC_LOG_INDEX,
  blockNumber: number,
  blockHash: string,
  amounts: NormalizedAction["amounts"],
): NormalizedAction {
  if (!/^0x[0-9a-fA-F]{64}$/.test(blockHash)) {
    throw new TypeError("yeth_synthetic_block_hash_invalid");
  }
  const normalizedBlockHash = blockHash.toLowerCase();
  const metricId = `meta:yeth:${kind}:${blockNumber}:${normalizedBlockHash}`;
  return {
    kind,
    tokenSymbol: "yETH",
    user: "yeth-system",
    amounts,
    txHash: metricId,
    blockNumber,
    logIndex: YETH_SYNTHETIC_LOG_INDEX[kind],
    source: {
      kind: "synthetic",
      metricId,
      blockHash: normalizedBlockHash,
      orderingIndex: YETH_SYNTHETIC_LOG_INDEX[kind],
    },
  };
}

export function buildYethRepaymentAlertActions(params: {
  previous: YethRepaymentMetrics | null;
  current: YethRepaymentMetrics;
  flow: YethFlowSummary;
  blockNumber: number;
  blockHash: string;
}): NormalizedAction[] {
  if (params.previous === null) {
    return [];
  }
  const { previous, current, flow, blockNumber } = params;
  const alerts: NormalizedAction[] = [];
  const debtPaidDownEth = previous.outstandingDebtEth - current.outstandingDebtEth;
  if (debtPaidDownEth >= YETH_PROGRESS_ALERT_MIN_DELTA_ETH) {
    alerts.push(
      syntheticProgressAction("yeth_debt_paid_down", blockNumber, params.blockHash, {
        yethPreviousOutstandingDebtEth: previous.outstandingDebtEth,
        yethCurrentOutstandingDebtEth: current.outstandingDebtEth,
        yethPreviousRepaidPercentHundredths: percentHundredths(
          previous.snapshotExitedEth,
          previous.totalSnapshotDebtEth,
        ),
        yethCurrentRepaidPercentHundredths: percentHundredths(
          current.snapshotExitedEth,
          current.totalSnapshotDebtEth,
        ),
      }),
    );
  }

  if (
    previous.recoveryVaultAssetsEth !== null &&
    current.recoveryVaultAssetsEth !== null
  ) {
    const before =
      previous.snapshotStayedEth > previous.recoveryVaultAssetsEth
        ? previous.snapshotStayedEth - previous.recoveryVaultAssetsEth
        : 0n;
    const after =
      current.snapshotStayedEth > current.recoveryVaultAssetsEth
        ? current.snapshotStayedEth - current.recoveryVaultAssetsEth
        : 0n;
    const delta = before - after;
    if (absolute(delta) >= YETH_PROGRESS_ALERT_MIN_DELTA_ETH) {
      alerts.push(
        syntheticProgressAction(
          delta >= 0n ? "yeth_recovery_progress" : "yeth_recovery_setback",
          blockNumber,
          params.blockHash,
          {
            yethSnapshotStayedEth: current.snapshotStayedEth,
            yethPreviousRecoveryShortfallEth: before,
            yethCurrentRecoveryShortfallEth: after,
            yethPreviousRecoveryCoverageHundredths: percentHundredths(
              previous.recoveryVaultAssetsEth,
              previous.snapshotStayedEth,
            ),
            yethCurrentRecoveryCoverageHundredths: percentHundredths(
              current.recoveryVaultAssetsEth,
              current.snapshotStayedEth,
            ),
            yethPreviousRecoveryVaultAssetsEth: previous.recoveryVaultAssetsEth,
            yethCurrentRecoveryVaultAssetsEth: current.recoveryVaultAssetsEth,
            yethRecoveryNetFlowEth: flow.recoveryNetFlowEth,
            yethRecoveryOrganicDeltaEth:
              current.recoveryVaultAssetsEth -
              previous.recoveryVaultAssetsEth -
              flow.recoveryNetFlowEth,
          },
        ),
      );
    }
  }

  if (
    previous.yieldVaultAssetsEth !== null &&
    current.yieldVaultAssetsEth !== null
  ) {
    const delta = current.yieldVaultAssetsEth - previous.yieldVaultAssetsEth;
    if (absolute(delta) >= YETH_PROGRESS_ALERT_MIN_DELTA_ETH) {
      alerts.push(
        syntheticProgressAction(
          delta >= 0n
            ? "yeth_yield_capacity_up"
            : "yeth_yield_capacity_down",
          blockNumber,
          params.blockHash,
          {
            yethOutstandingDebtEth: current.outstandingDebtEth,
            yethCurrentOutstandingDebtEth: current.outstandingDebtEth,
            yethPreviousYieldVaultAssetsEth: previous.yieldVaultAssetsEth,
            yethCurrentYieldVaultAssetsEth: current.yieldVaultAssetsEth,
            yethPreviousYieldCoverageHundredths: percentHundredths(
              previous.yieldVaultAssetsEth,
              previous.outstandingDebtEth,
            ),
            yethCurrentYieldCoverageHundredths: percentHundredths(
              current.yieldVaultAssetsEth,
              current.outstandingDebtEth,
            ),
            yethYieldNetFlowEth: flow.yieldNetFlowEth,
            yethYieldOrganicDeltaEth:
              current.yieldVaultAssetsEth -
              previous.yieldVaultAssetsEth -
              flow.yieldNetFlowEth,
          },
        ),
      );
    }
  }
  return alerts;
}
