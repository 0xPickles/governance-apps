import { describe, expect, it } from "vitest";

import { ZERO_ADDRESS } from "@/workers/alerts-bot/src/abis";
import {
  applyYethClaim,
  applyYethSetClaim,
  applyYethShareMintFromClaimStay,
  applyYethTransferLedger,
  assertYethAccountingInvariants,
  buildYethRepaymentAlertActions,
  buildYethRepaymentMetrics,
  createEmptyYethState,
  loadYethState,
  serializeYethState,
  YETH_PROGRESS_ALERT_MIN_DELTA_ETH,
  YETH_SYNTHETIC_LOG_INDEX,
  type YethRepaymentMetrics,
} from "@/workers/alerts-bot/src/domains/yeth/accounting";

const ALICE = "0x00000000000000000000000000000000000000a1";
const BOB = "0x00000000000000000000000000000000000000b2";
const ETH = 10n ** 18n;

function metrics(
  values: Partial<YethRepaymentMetrics>,
): YethRepaymentMetrics {
  return {
    totalSnapshotDebtEth: 10n * ETH,
    snapshotExitedEth: 0n,
    snapshotStayedEth: 10n * ETH,
    outstandingDebtEth: 10n * ETH,
    recoveryVaultAssetsEth: 0n,
    yieldVaultAssetsEth: 10n * ETH,
    ...values,
  };
}

describe("yETH accounting", () => {
  it("preserves claim and proportional partial/full repayment math", () => {
    const state = createEmptyYethState();
    applyYethSetClaim(state, ALICE, 10n * ETH);
    expect(applyYethClaim(state, ALICE, false, 10n * ETH)).toBe(10n * ETH);
    applyYethShareMintFromClaimStay(state, ALICE, 100n, 10n * ETH);
    applyYethTransferLedger(state, ZERO_ADDRESS, ALICE, 100n);
    assertYethAccountingInvariants(state, "minted");

    const partial = applyYethTransferLedger(state, ALICE, ZERO_ADDRESS, 40n);
    expect(partial).toMatchObject({
      sharesBurned: 40n,
      ownerSharesBefore: 100n,
      ownerSharesAfter: 60n,
      snapshotMovedEth: 4n * ETH,
      withdrawalType: "partial",
    });
    expect(state.snapshotStayedEth).toBe(6n * ETH);
    expect(state.snapshotExitedEth).toBe(4n * ETH);

    const full = applyYethTransferLedger(state, ALICE, ZERO_ADDRESS, 60n);
    expect(full).toMatchObject({
      snapshotMovedEth: 6n * ETH,
      withdrawalType: "full",
    });
    expect(state.snapshotStayedEth).toBe(0n);
    expect(state.snapshotExitedEth).toBe(10n * ETH);
    assertYethAccountingInvariants(state, "repaid");
  });

  it("checks aggregate/share invariants without inventing per-account equality", () => {
    const state = createEmptyYethState();
    state.accounts.set(ALICE, { snapshotEth: 1n, bucket: "unclaimed" });
    state.snapshotUnclaimedEth = 1n;
    state.snapshotStayedEth = 8n;
    state.totalSnapshotDebtEth = 9n;
    state.observedSharesByAddress.set(BOB, 7n);
    state.trackedStayedSharesByAddress.set(BOB, 5n);
    state.trackedStayedCostBasisByAddress.set(BOB, 8n);
    state.trackedStayedSharesTotal = 5n;

    expect(() => assertYethAccountingInvariants(state)).not.toThrow();
    state.trackedStayedSharesTotal = 4n;
    expect(() => assertYethAccountingInvariants(state)).toThrow(
      "yeth_invariant_tracked_total",
    );
    state.trackedStayedSharesTotal = 5n;
    state.trackedStayedSharesByAddress.set(BOB, 8n);
    expect(() => assertYethAccountingInvariants(state)).toThrow(
      "yeth_invariant_tracked_shares",
    );
  });

  it("round-trips repeated entitlements, claims, and a zero cancellation", () => {
    const state = createEmptyYethState();
    applyYethSetClaim(state, ALICE, 10n * ETH);
    expect(applyYethClaim(state, ALICE, false, 10n * ETH)).toBe(10n * ETH);
    applyYethShareMintFromClaimStay(state, ALICE, 100n, 10n * ETH);
    applyYethTransferLedger(state, ZERO_ADDRESS, ALICE, 100n);

    applyYethSetClaim(state, ALICE, 12n * ETH);
    expect(applyYethClaim(state, ALICE, true, 12n * ETH)).toBe(12n * ETH);
    applyYethSetClaim(state, ALICE, 5n * ETH);
    applyYethSetClaim(state, ALICE, 0n);
    assertYethAccountingInvariants(state, "repeated-claims");

    expect(state.accounts.has(ALICE)).toBe(false);
    expect(state.snapshotStayedEth).toBe(10n * ETH);
    expect(state.snapshotExitedEth).toBe(12n * ETH);
    expect(state.snapshotUnclaimedEth).toBe(0n);
    expect(state.totalSnapshotDebtEth).toBe(22n * ETH);
    const stored = serializeYethState(state);
    expect(serializeYethState(loadYethState(stored))).toEqual(stored);
  });

  it("moves only proportional tracked basis from mixed observed shares", () => {
    const state = createEmptyYethState();
    applyYethSetClaim(state, ALICE, 10n * ETH);
    applyYethClaim(state, ALICE, false, 10n * ETH);
    applyYethShareMintFromClaimStay(state, ALICE, 100n, 10n * ETH);
    applyYethTransferLedger(state, ZERO_ADDRESS, ALICE, 100n);
    applyYethTransferLedger(state, ZERO_ADDRESS, ALICE, 100n);

    const withdrawal = applyYethTransferLedger(
      state,
      ALICE,
      ZERO_ADDRESS,
      100n,
    );
    expect(withdrawal).toEqual({
      owner: ALICE,
      sharesBurned: 100n,
      ownerSharesBefore: 200n,
      ownerSharesAfter: 100n,
      snapshotMovedEth: 5n * ETH,
      withdrawalType: "partial",
    });
    expect(state.observedSharesByAddress.get(ALICE)).toBe(100n);
    expect(state.trackedStayedSharesByAddress.get(ALICE)).toBe(50n);
    expect(state.trackedStayedCostBasisByAddress.get(ALICE)).toBe(5n * ETH);
    expect(state.snapshotStayedEth).toBe(5n * ETH);
    expect(state.snapshotExitedEth).toBe(5n * ETH);
    assertYethAccountingInvariants(state, "mixed-provenance-burn");
  });

  it("pins the 0.5 ETH threshold and synthetic repayment IDs", () => {
    const previous = metrics({});
    const current = metrics({
      snapshotExitedEth: YETH_PROGRESS_ALERT_MIN_DELTA_ETH,
      snapshotStayedEth: 9n * ETH,
      outstandingDebtEth: 9n * ETH,
      recoveryVaultAssetsEth: 1n * ETH,
      yieldVaultAssetsEth: 9n * ETH,
    });
    const alerts = buildYethRepaymentAlertActions({
      previous,
      current,
      flow: { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n },
      blockNumber: 123,
      blockHash: `0x${"1".repeat(64)}`,
    });
    expect(alerts.map(({ logIndex }) => logIndex)).toEqual([
      YETH_SYNTHETIC_LOG_INDEX.yeth_debt_paid_down,
      YETH_SYNTHETIC_LOG_INDEX.yeth_recovery_progress,
      YETH_SYNTHETIC_LOG_INDEX.yeth_yield_capacity_down,
    ]);
    expect(alerts.every(({ source }) => source.kind === "synthetic")).toBe(true);
    expect(alerts.map(({ txHash }) => txHash)).toEqual(
      alerts.map(
        ({ kind }) =>
          `meta:yeth:${kind}:123:0x${"1".repeat(64)}`,
      ),
    );
    const competingBlock = buildYethRepaymentAlertActions({
      previous,
      current,
      flow: { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n },
      blockNumber: 123,
      blockHash: `0x${"3".repeat(64)}`,
    });
    expect(competingBlock.map(({ txHash }) => txHash)).not.toEqual(
      alerts.map(({ txHash }) => txHash),
    );
    expect(Object.values(YETH_SYNTHETIC_LOG_INDEX)).toEqual([
      910_001,
      910_002,
      910_003,
      910_004,
      910_005,
    ]);

    const below = buildYethRepaymentAlertActions({
      previous,
      current: metrics({
        snapshotExitedEth: YETH_PROGRESS_ALERT_MIN_DELTA_ETH - 1n,
        snapshotStayedEth: 10n * ETH,
        outstandingDebtEth:
          previous.outstandingDebtEth - YETH_PROGRESS_ALERT_MIN_DELTA_ETH + 1n,
      }),
      flow: { recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n },
      blockNumber: 124,
      blockHash: `0x${"2".repeat(64)}`,
    });
    expect(below.some(({ kind }) => kind === "yeth_debt_paid_down")).toBe(false);
  });

  it("builds state-consistent repayment metrics", () => {
    const state = createEmptyYethState();
    applyYethSetClaim(state, ALICE, 3n * ETH);
    applyYethClaim(state, ALICE, true, 3n * ETH);
    expect(buildYethRepaymentMetrics(state, 2n, 4n)).toEqual({
      totalSnapshotDebtEth: 3n * ETH,
      snapshotExitedEth: 3n * ETH,
      snapshotStayedEth: 0n,
      outstandingDebtEth: 0n,
      recoveryVaultAssetsEth: 2n,
      yieldVaultAssetsEth: 4n,
    });
  });

  it("rejects malformed accounting addresses before mutating state", () => {
    const state = createEmptyYethState();
    expect(() => applyYethSetClaim(state, "0x1234", 1n)).toThrow(
      "invalid yETH address",
    );
    expect(state).toEqual(createEmptyYethState());
  });

  it("rejects absent and positive zero-address checkpoint rows", () => {
    expect(() => loadYethState(null)).toThrow("yETH state is required");
    expect(() => loadYethState(undefined)).toThrow("yETH state is required");

    const empty = serializeYethState(createEmptyYethState());
    const zeroAccount = structuredClone(empty);
    zeroAccount.accounts[ZERO_ADDRESS] = {
      snapshotEth: "1",
      bucket: "unclaimed",
    };
    zeroAccount.totalSnapshotDebtEth = "1";
    zeroAccount.snapshotUnclaimedEth = "1";
    expect(() => loadYethState(zeroAccount)).toThrow("zero address");

    for (const field of [
      "trackedStayedSharesByAddress",
      "trackedStayedCostBasisByAddress",
      "observedSharesByAddress",
    ] as const) {
      const stored = structuredClone(empty);
      stored[field][ZERO_ADDRESS] = "1";
      expect(() => loadYethState(stored)).toThrow("zero address");
    }

    const harmlessLegacyZero = structuredClone(empty);
    harmlessLegacyZero.accounts[ZERO_ADDRESS] = {
      snapshotEth: "0",
      bucket: "stayed",
    };
    expect(serializeYethState(loadYethState(harmlessLegacyZero))).toEqual(empty);

    for (const bucket of ["stayed", "exited"] as const) {
      const impossiblePersistedAccount = structuredClone(empty);
      impossiblePersistedAccount.accounts[ALICE] = {
        snapshotEth: "1",
        bucket,
      };
      expect(() => loadYethState(impossiblePersistedAccount)).toThrow(
        "positive yETH accounts must be unclaimed",
      );
    }
  });
});
