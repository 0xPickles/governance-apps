import { describe, expect, it } from "vitest";

import type {
  AlertLiquidLockerPositionSnapshot,
  AlertYethAccountBlockSnapshot,
  AlertYfiAccountBlockSnapshot,
} from "@/workers/alerts-bot/src/account-block-context";
import { isSafeAlertEnsName } from "@/workers/alerts-bot/src/account-block-context";
import { validateDomainActions } from "@/workers/alerts-bot/src/actions";
import {
  renderAlertCatalogueAction,
} from "@/workers/alerts-bot/src/catalogue-renderer";
import type { AlertEventBlockPriceEvidence } from "@/workers/alerts-bot/src/evidence";
import type { NormalizedAction } from "@/workers/alerts-bot/src/types";

const BLOCK_NUMBER = 25_123_456;
const BLOCK_HASH = `0x${BLOCK_NUMBER.toString(16).padStart(64, "0")}` as const;
const TX_HASH = `0x${"a".repeat(64)}`;
const ACCOUNT = "0x1111111111111111111111111111111111111111";
const CALLER = "0x2222222222222222222222222222222222222222";
const RECEIVER = "0x3333333333333333333333333333333333333333";
const ONE = 10n ** 18n;
const UINT256_MAX = (1n << 256n) - 1n;
const UINT108_MAX = (1n << 108n) - 1n;
const INT128_MAX = (1n << 127n) - 1n;
const MIGRATED_LAST_CLAIMED = 1_799_280_000n;
const EVENT_TIME = Object.freeze({
  kind: "resolved" as const,
  blockNumber: BLOCK_NUMBER,
  blockHash: BLOCK_HASH,
  seconds: 1_800_000_000,
});
const PRICE: AlertEventBlockPriceEvidence = Object.freeze({
  kind: "available",
  blockNumber: BLOCK_NUMBER,
  blockHash: BLOCK_HASH,
  yfiUsdCents: 425_000n,
});

function locker(
  symbol: "sdYFI" | "supYFI" | "coveYFI",
  overrides: Partial<AlertLiquidLockerPositionSnapshot> = {},
): AlertLiquidLockerPositionSnapshot {
  const scale = symbol === "supYFI" ? 69_420n : 1n;
  return Object.freeze({
    symbol,
    scale,
    wallet: 0n,
    activeShares: 0n,
    activeToken: 0n,
    cooldownShares: 0n,
    cooldownToken: 0n,
    withdrawableToken: 0n,
    yfiEquivalent: 0n,
    cooldown: Object.freeze({
      start: 0n,
      total: 0n,
      claimed: 0n,
      cooling: 0n,
      withdrawable: 0n,
    }),
    ...overrides,
  });
}

function yfiSnapshot(
  overrides: Partial<AlertYfiAccountBlockSnapshot> = {},
): AlertYfiAccountBlockSnapshot {
  return Object.freeze({
    kind: "yfi",
    principal: ACCOUNT,
    styfi: Object.freeze({
      symbol: "stYFI",
      active: ONE,
      cooldown: Object.freeze({
        start: 0n,
        total: 0n,
        claimed: 0n,
        cooling: 0n,
        withdrawable: 0n,
      }),
    }),
    styfix: Object.freeze({
      symbol: "stYFIx",
      active: 0n,
      cooldown: Object.freeze({
        start: 0n,
        total: 0n,
        claimed: 0n,
        cooling: 0n,
        withdrawable: 0n,
      }),
    }),
    liquidLockers: Object.freeze([
      locker("sdYFI"),
      locker("supYFI"),
      locker("coveYFI"),
    ]),
    legacyVeyfi: Object.freeze({ amount: 0n, unlockTime: 0n }),
    migratedVeyfi: Object.freeze({
      amount: 0n,
      boostEpochs: 0n,
      unlockTime: 0n,
      lastClaimedEpoch: 0n,
      migrationProven: false,
    }),
    ...overrides,
  });
}

function yethSnapshot(
  overrides: Partial<AlertYethAccountBlockSnapshot> = {},
): AlertYethAccountBlockSnapshot {
  return Object.freeze({
    kind: "yeth",
    principal: ACCOUNT,
    claimableSnapshot: 0n,
    claimableRecovered: 0n,
    recoveryRate: 319_607_900_000_000_000n,
    recoveryVaultShares: 0n,
    recoveryVaultAssets: 0n,
    recoveryVaultTotalAssets: 100n * ONE,
    recoveryVaultTotalSupply: 100n * ONE,
    ...overrides,
  });
}

function onchainAction(
  action: Omit<NormalizedAction, "blockNumber" | "logIndex" | "source" | "txHash">,
): NormalizedAction {
  return Object.freeze({
    ...action,
    blockNumber: BLOCK_NUMBER,
    logIndex: 0,
    txHash: TX_HASH,
    source: Object.freeze({ kind: "onchain" as const, txHash: TX_HASH, logIndex: 0 }),
  });
}

function stake(
  tokenSymbol = "stYFI",
  assets = ONE,
  shares = ONE,
): NormalizedAction {
  return onchainAction({
    kind: "staked",
    tokenSymbol,
    user: ACCOUNT,
    principal: { kind: "proven", address: ACCOUNT },
    owner: ACCOUNT,
    receiver: ACCOUNT,
    caller: ACCOUNT,
    amounts: { assets, shares },
  });
}

function withdrawal(
  tokenSymbol = "stYFI",
  assets = ONE,
  shares = ONE,
): NormalizedAction {
  return onchainAction({
    kind: "withdrew_from_cooldown",
    tokenSymbol,
    user: ACCOUNT,
    principal: { kind: "proven", address: ACCOUNT },
    owner: ACCOUNT,
    receiver: RECEIVER,
    caller: CALLER,
    amounts: { assets, shares },
  });
}

function update(previousAmount: bigint, amount: bigint): NormalizedAction {
  return onchainAction({
    kind: "update",
    tokenSymbol: "veYFI",
    user: ACCOUNT,
    principal: { kind: "proven", address: ACCOUNT },
    caller: CALLER,
    amounts: {
      previousAmount,
      amount,
      previousLocktime: 1_900_000_000n,
      locktime: 1_900_000_000n,
    },
  });
}

function render(
  domainId: "styfi" | "veyfi" | "yeth",
  action: NormalizedAction,
  snapshot: AlertYfiAccountBlockSnapshot | AlertYethAccountBlockSnapshot | null,
  options: {
    readonly positionUnavailable?: boolean;
    readonly ensNamesByAddress?: Readonly<Record<string, string>>;
    readonly price?: AlertEventBlockPriceEvidence;
  } = {},
): string {
  return renderAlertCatalogueAction({
    domainId,
    action,
    snapshot,
    eventTime: EVENT_TIME,
    price: options.price ?? PRICE,
    ...(options.positionUnavailable === undefined
      ? {}
      : { positionUnavailable: options.positionUnavailable }),
    ...(options.ensNamesByAddress === undefined
      ? {}
      : { ensNamesByAddress: options.ensNamesByAddress }),
  });
}

function synthetic(
  kind:
    | "yeth_debt_paid_down"
    | "yeth_recovery_progress"
    | "yeth_yield_capacity_up"
    | "yeth_yield_capacity_down",
  amounts: NormalizedAction["amounts"],
): NormalizedAction {
  return Object.freeze({
    kind,
    tokenSymbol: "yETH",
    user: null,
    amounts,
    txHash: TX_HASH,
    blockNumber: BLOCK_NUMBER,
    logIndex: 10,
    source: Object.freeze({
      kind: "synthetic" as const,
      metricId: kind,
      blockHash: BLOCK_HASH,
      orderingIndex: 10,
    }),
  });
}

describe("catalogue renderer discriminators", () => {
  it("preserves one-wei values and distinct one-wei lock updates", () => {
    const tinyStake = render("styfi", stake("stYFI", 1n, 1n), yfiSnapshot());
    expect(tinyStake).toContain("Staked: &lt;0.0001 YFI");

    const lockUpdate = render(
      "veyfi",
      update(ONE, ONE + 1n),
      yfiSnapshot({
        legacyVeyfi: Object.freeze({
          amount: ONE + 1n,
          unlockTime: 1_900_000_000n,
        }),
      }),
    );
    expect(lockUpdate).toContain(
      "Locked: 1.000000000000000000 → 1.000000000000000001 YFI",
    );

    const lockClosedFromOneWei = render(
      "veyfi",
      update(1n, 0n),
      yfiSnapshot(),
    );
    expect(lockClosedFromOneWei).toContain(
      "Locked: &lt;0.0001 → 0.00 YFI",
    );
  });

  it("keeps 1:1 LLYFI USD on the primary line and unequal YFI equivalent separate", () => {
    const equalStake = render(
      "veyfi",
      stake("sdYFI", ONE, ONE),
      yfiSnapshot({
        liquidLockers: Object.freeze([
          locker("sdYFI", { wallet: ONE, yfiEquivalent: ONE }),
          locker("supYFI"),
          locker("coveYFI"),
        ]),
      }),
    );
    expect(equalStake).toContain("Staked: 1.00 sdYFI ($4,250.00)");
    expect(equalStake).not.toContain("YFI equivalent:");

    const unequalWithdrawal = render(
      "veyfi",
      withdrawal("sdYFI", 2n * ONE, ONE),
      yfiSnapshot(),
    );
    expect(unequalWithdrawal).toContain("Received: 2.00 sdYFI");
    expect(unequalWithdrawal).toContain(
      "YFI equivalent: 1.00 YFI ($4,250.00)",
    );
  });

  it("deduplicates delegated actors and preserves proven fallback identity", () => {
    const sameCallerReceiver = onchainAction({
      ...withdrawal(),
      caller: RECEIVER,
    });
    const delegated = render("styfi", sameCallerReceiver, yfiSnapshot());
    expect(delegated).toContain(`For: <a href="https://etherscan.io/address/${ACCOUNT}">`);
    expect(delegated).toContain(
      `Received by: <a href="https://etherscan.io/address/${RECEIVER}">`,
    );
    expect(delegated).not.toContain("Sent by:");

    const fallback = render("styfi", stake(), null, {
      positionUnavailable: true,
      ensNamesByAddress: Object.freeze({ [ACCOUNT]: "alice.eth" }),
    });
    expect(fallback).toContain(
      `Position after · <a href="https://etherscan.io/address/${ACCOUNT}">alice.eth</a>`,
    );
    expect(fallback).toContain("Position data: unavailable");

    const claim = onchainAction({
      kind: "yeth_claimed_stayed",
      tokenSymbol: "yETH",
      user: ACCOUNT,
      principal: { kind: "proven", address: ACCOUNT },
      owner: ACCOUNT,
      receiver: ACCOUNT,
      amounts: {
        yethSnapshotAmount: 20n * ONE,
        yethUnderlyingAmount: 7n * ONE,
        yethClaimShares: 6n * ONE,
        yethTotalSnapshotDebtEth: 100n * ONE,
        yethSnapshotExitedEth: 20n * ONE,
        yethSnapshotStayedEth: 30n * ONE,
        yethSnapshotUnclaimedEth: 50n * ONE,
        yethOutstandingDebtEth: 80n * ONE,
      },
    });
    const claimFallback = render("yeth", claim, null, {
      positionUnavailable: true,
    });
    expect(claimFallback).toContain(
      `Position after · <a href="https://etherscan.io/address/${ACCOUNT}">0x1111…1111</a>`,
    );
    expect(claimFallback).toContain("Position data: unavailable");

    for (const kind of ["exchange", "redeem"] as const) {
      const unattributed = onchainAction({
        kind,
        tokenSymbol: "sdYFI",
        user: null,
        principal: {
          kind: "unavailable",
          reason: "canonical_sender_unavailable",
        },
        amounts: { amount: ONE, fee: 0n },
      });
      const tradeFallback = render("veyfi", unattributed, null, {
        positionUnavailable: true,
      });
      expect(tradeFallback).toContain(kind === "exchange" ? "sdYFI bought" : "sdYFI redeemed");
      expect(tradeFallback).toContain(kind === "exchange" ? "1.00 YFI → 1.00 sdYFI" : "1.00 sdYFI → 1.00 YFI");
      expect(tradeFallback).toContain("Position after: unavailable");
      expect(tradeFallback).not.toContain("Position after ·");
    }
  });

  it("falls back from hostile injected ENS labels and escapes hostile symbols", () => {
    for (const hostile of [
      "ALICE.eth",
      "alice\u202e.eth",
      `${"é".repeat(128)}.eth`,
      "alice<&.eth",
    ]) {
      const html = render("styfi", stake(), yfiSnapshot(), {
        ensNamesByAddress: Object.freeze({ [ACCOUNT]: hostile }),
      });
      expect(html).toContain(
        `href="https://etherscan.io/address/${ACCOUNT}">0x1111…1111</a>`,
      );
      expect(html).not.toContain(hostile);
    }
    const escaped = render("veyfi", stake("bad<&", ONE, ONE), yfiSnapshot());
    expect(escaped).toContain("bad&lt;&amp;");
    expect(escaped).not.toContain("bad<&");
  });

  it("keeps S positions action-aware and excludes unrelated veYFI rows", () => {
    const snapshot = yfiSnapshot({
      legacyVeyfi: Object.freeze({ amount: 4n * ONE, unlockTime: 1_812_585_600n }),
      migratedVeyfi: Object.freeze({
        amount: 4n * ONE,
        boostEpochs: 35n,
        unlockTime: 1_812_585_600n,
        lastClaimedEpoch: MIGRATED_LAST_CLAIMED,
        migrationProven: true,
      }),
    });
    const staked = render("styfi", stake(), snapshot);
    expect(staked).toContain("stYFI: 1.00 active");
    expect(staked).not.toContain("0.00 cooling");
    expect(staked).not.toContain("veYFI:");

    const withdrawn = render("styfi", withdrawal(), snapshot);
    expect(withdrawn).toContain(
      "stYFI: 1.00 active · 0.00 cooling · 0.00 withdrawable",
    );
  });

  it("shows withdrawable detail without double-counting combined exposure", () => {
    const snapshot = yfiSnapshot({
      styfi: Object.freeze({
        symbol: "stYFI",
        active: ONE,
        cooldown: Object.freeze({
          start: 1_798_790_400n,
          total: 2n * ONE,
          claimed: 0n,
          cooling: 2n * ONE,
          withdrawable: 2n * ONE,
        }),
      }),
      liquidLockers: Object.freeze([
        locker("sdYFI", {
          activeShares: 2n * ONE,
          activeToken: 2n * ONE,
          cooldownShares: 3n * ONE,
          cooldownToken: 3n * ONE,
          withdrawableToken: 3n * ONE,
          yfiEquivalent: 5n * ONE,
          cooldown: Object.freeze({
            start: 1_798_790_400n,
            total: 3n * ONE,
            claimed: 0n,
            cooling: 3n * ONE,
            withdrawable: 3n * ONE,
          }),
        }),
        locker("supYFI"),
        locker("coveYFI"),
      ]),
    });
    const html = render("veyfi", withdrawal("sdYFI"), snapshot);
    expect(html).toContain(
      "sdYFI: 2.00 active · 3.00 cooling · 3.00 withdrawable",
    );
    expect(html).toContain("stYFI/stYFIx: 3.00 YFI");
    expect(html).not.toContain("stYFI/stYFIx: 4.00 YFI");

    const stakingHtml = render("styfi", stake(), snapshot);
    expect(stakingHtml).toContain("LLYFI: 5.00 YFI eq.");
    expect(stakingHtml).not.toContain("LLYFI: 6.00 YFI eq.");
  });

  it("retains migrated veYFI when a legacy update closes the affected lock", () => {
    const html = render(
      "veyfi",
      update(50n * ONE, 0n),
      yfiSnapshot({
        legacyVeyfi: Object.freeze({ amount: 0n, unlockTime: 1_900_000_000n }),
        migratedVeyfi: Object.freeze({
          amount: 7n * ONE,
          boostEpochs: 35n,
          unlockTime: 1_812_585_600n,
          lastClaimedEpoch: MIGRATED_LAST_CLAIMED,
          migrationProven: true,
        }),
      }),
    );
    expect(html).toContain("Legacy veYFI: position closed");
    expect(html).toContain("Migrated veYFI: 7.00 YFI until");
  });

  it("does not repeat an unchanged amount on an unlock-shortened anomaly", () => {
    const action = onchainAction({
      kind: "update",
      tokenSymbol: "veYFI",
      user: ACCOUNT,
      principal: { kind: "proven", address: ACCOUNT },
      caller: ACCOUNT,
      amounts: {
        previousAmount: 8n * ONE,
        amount: 8n * ONE,
        previousLocktime: 1_900_000_000n,
        locktime: 1_890_000_000n,
      },
    });
    const html = render(
      "veyfi",
      action,
      yfiSnapshot({
        legacyVeyfi: Object.freeze({
          amount: 8n * ONE,
          unlockTime: 1_890_000_000n,
        }),
      }),
    );
    expect(html).toContain("Locked: 8.00 YFI");
    expect(html).not.toContain("8.00 → 8.00");
  });

  it("ceil-rounds future lock duration and marks equality or past as expired", () => {
    const lockAt = (locktime: bigint) =>
      onchainAction({
        kind: "lock",
        tokenSymbol: "veYFI",
        user: ACCOUNT,
        principal: { kind: "proven", address: ACCOUNT },
        caller: ACCOUNT,
        amounts: {
          amount: ONE,
          previousAmount: 0n,
          locktime,
          previousLocktime: 0n,
        },
      });
    const snapshot = yfiSnapshot({
      legacyVeyfi: Object.freeze({ amount: ONE, unlockTime: 1_800_000_001n }),
    });

    expect(render("veyfi", lockAt(1_800_000_001n), snapshot)).toContain(
      "· 1 day",
    );
    expect(render("veyfi", lockAt(1_800_000_000n), snapshot)).toContain(
      "· expired",
    );
    expect(render("veyfi", lockAt(1_799_999_999n), snapshot)).toContain(
      "· expired",
    );
  });

  it("classifies absolute legacy decreases at the exact whale boundary", () => {
    const renders = [
      update(100n * ONE, 60n * ONE + 1n),
      update(100n * ONE, 60n * ONE),
      update(100n * ONE, 59n * ONE),
    ].map((action) =>
      render(
        "veyfi",
        action,
        yfiSnapshot({
          legacyVeyfi: Object.freeze({
            amount: action.amounts.amount!,
            unlockTime: action.amounts.locktime!,
          }),
        }),
      ),
    );
    expect(renders[0]).not.toContain("WHALE MOVE");
    expect(renders[1]).toContain("WHALE MOVE");
    expect(renders[2]).toContain("WHALE MOVE");
  });

  it("renders tiny V5 fee amount without USD and keeps the rate at two decimals", () => {
    const feeRate = 10n ** 13n;
    const action = onchainAction({
      kind: "redeem",
      tokenSymbol: "sdYFI",
      user: ACCOUNT,
      principal: { kind: "proven", address: ACCOUNT },
      caller: ACCOUNT,
      amounts: { amount: ONE, fee: feeRate },
    });
    const html = render("veyfi", action, yfiSnapshot());
    const feeLine = html.split("\n").find((line) => line.startsWith("Exit fee:"));
    expect(feeLine).toBe("Exit fee: &lt;0.0001 YFI · 0.00%");
    expect(feeLine).not.toContain("$");
  });

  it("separates Y3 event-local shares-after from the block-final position", () => {
    const action = onchainAction({
      kind: "yeth_recovery_vault_withdraw",
      tokenSymbol: "yETH",
      user: ACCOUNT,
      principal: { kind: "proven", address: ACCOUNT },
      owner: ACCOUNT,
      receiver: RECEIVER,
      caller: ACCOUNT,
      yethWithdrawalType: "partial",
      amounts: {
        assets: 4n * ONE,
        shares: 5n * ONE,
        yethSharesBurned: 5n * ONE,
        yethOwnerSharesBefore: 10n * ONE,
        yethOwnerSharesAfter: 5n * ONE,
        yethSnapshotMoved: 3n * ONE,
        yethTotalSnapshotDebtEth: 100n * ONE,
        yethSnapshotExitedEth: 20n * ONE,
        yethSnapshotStayedEth: 30n * ONE,
        yethSnapshotUnclaimedEth: 50n * ONE,
        yethOutstandingDebtEth: 80n * ONE,
      },
    });
    const html = render(
      "yeth",
      action,
      yethSnapshot({
        recoveryVaultShares: 9n * ONE,
        recoveryVaultAssets: 8n * ONE,
        recoveryVaultTotalAssets: 80n * ONE,
        recoveryVaultTotalSupply: 90n * ONE,
      }),
    );
    expect(html).toContain("Shares after withdrawal: 5.00 yswETH");
    expect(html).toContain("Recovery Vault: 9.00 yswETH · worth 8.00 ETH");
  });

  it("omits rounded-zero coverage changes and labels organic cross-directions", () => {
    const debt = render(
      "yeth",
      synthetic("yeth_debt_paid_down", {
        yethPreviousOutstandingDebtEth: 100n * ONE,
        yethCurrentOutstandingDebtEth: 99n * ONE,
        yethPreviousRepaidPercentHundredths: 1_000n,
        yethCurrentRepaidPercentHundredths: 1_000n,
      }),
      null,
    );
    expect(debt).toContain("Recovered since snapshot: 10.00%");
    expect(debt).not.toContain("+0.00 pts");

    const recovery = render(
      "yeth",
      synthetic("yeth_recovery_progress", {
        yethPreviousRecoveryShortfallEth: 10n * ONE,
        yethCurrentRecoveryShortfallEth: 9n * ONE,
        yethPreviousRecoveryCoverageHundredths: 5_000n,
        yethCurrentRecoveryCoverageHundredths: 5_000n,
        yethRecoveryNetFlowEth: ONE,
        yethRecoveryOrganicDeltaEth: -1n,
      }),
      null,
    );
    expect(recovery).toContain("Coverage: 50.00%");
    expect(recovery).not.toContain("50.00% → 50.00%");

    const up = render(
      "yeth",
      synthetic("yeth_yield_capacity_up", {
        yethPreviousYieldVaultAssetsEth: 10n * ONE,
        yethCurrentYieldVaultAssetsEth: 11n * ONE,
        yethPreviousYieldCoverageHundredths: 5_000n,
        yethCurrentYieldCoverageHundredths: 5_000n,
        yethOutstandingDebtEth: 20n * ONE,
        yethYieldNetFlowEth: 2n * ONE,
        yethYieldOrganicDeltaEth: -1n,
      }),
      null,
    );
    expect(up).toContain("Coverage of outstanding recovery debt: 50.00%");
    expect(up).toContain("Yield and other losses: -&lt;0.0001 ETH");

    const down = render(
      "yeth",
      synthetic("yeth_yield_capacity_down", {
        yethPreviousYieldVaultAssetsEth: 11n * ONE,
        yethCurrentYieldVaultAssetsEth: 10n * ONE,
        yethPreviousYieldCoverageHundredths: 5_100n,
        yethCurrentYieldCoverageHundredths: 5_000n,
        yethOutstandingDebtEth: 20n * ONE,
        yethYieldNetFlowEth: -2n * ONE,
        yethYieldOrganicDeltaEth: 1n,
      }),
      null,
    );
    expect(down).toContain("Yield and other gains: +&lt;0.0001 ETH");
  });

  it("keeps the most verbose closed action within 4,096 units", () => {
    const longName = (offset: number): string =>
      [0, 1, 2, 3]
        .map((index) =>
          String.fromCharCode(97 + ((offset + index) % 26)).repeat(62),
        )
        .concat("eth")
        .join(".");
    const names = [longName(0), longName(4), longName(8)];
    expect(names.map(isSafeAlertEnsName)).toEqual([true, true, true]);
    expect(names.map((name) => new TextEncoder().encode(name).length)).toEqual([
      255, 255, 255,
    ]);
    expect(names.map((name) => Array.from(name).length)).toEqual([255, 255, 255]);
    const supScale = 69_420n;
    const supCapacityShares = UINT256_MAX / supScale;
    const supWalletShares = supCapacityShares / 3n;
    const supActiveShares = supCapacityShares / 3n;
    const withdrawnShares = UINT108_MAX / 2n;
    const remainingShares = UINT108_MAX - withdrawnShares;
    const matureStreamStart = BigInt(EVENT_TIME.seconds) - 14n * 86_400n;
    const action = withdrawal(
      "supYFI",
      withdrawnShares * supScale,
      withdrawnShares,
    );
    expect(() =>
      validateDomainActions("veyfi", [action]),
    ).not.toThrow();
    const snapshot = yfiSnapshot({
      styfi: Object.freeze({
        symbol: "stYFI",
        active: UINT108_MAX,
        cooldown: Object.freeze({
          start: matureStreamStart,
          total: UINT108_MAX,
          claimed: 0n,
          cooling: UINT108_MAX,
          withdrawable: UINT108_MAX,
        }),
      }),
      styfix: Object.freeze({
        symbol: "stYFIx",
        active: UINT108_MAX,
        cooldown: Object.freeze({
          start: matureStreamStart,
          total: UINT108_MAX,
          claimed: 0n,
          cooling: UINT108_MAX,
          withdrawable: UINT108_MAX,
        }),
      }),
      liquidLockers: Object.freeze([
        locker("sdYFI", {
          wallet: UINT108_MAX,
          activeShares: UINT108_MAX,
          activeToken: UINT108_MAX,
          cooldownShares: UINT108_MAX,
          cooldownToken: UINT108_MAX,
          withdrawableToken: UINT108_MAX,
          yfiEquivalent: UINT108_MAX * 3n,
          cooldown: Object.freeze({
            start: matureStreamStart,
            total: UINT108_MAX,
            claimed: 0n,
            cooling: UINT108_MAX,
            withdrawable: UINT108_MAX,
          }),
        }),
        locker("supYFI", {
          wallet: supWalletShares * supScale,
          activeShares: supActiveShares,
          activeToken: supActiveShares * supScale,
          cooldownShares: remainingShares,
          cooldownToken: remainingShares * supScale,
          withdrawableToken: remainingShares * supScale,
          yfiEquivalent:
            supWalletShares + supActiveShares + remainingShares,
          cooldown: Object.freeze({
            start: matureStreamStart,
            total: UINT108_MAX * supScale,
            claimed: withdrawnShares * supScale,
            cooling: remainingShares * supScale,
            withdrawable: remainingShares * supScale,
          }),
        }),
        locker("coveYFI", {
          wallet: UINT108_MAX,
          activeShares: UINT108_MAX,
          activeToken: UINT108_MAX,
          cooldownShares: UINT108_MAX,
          cooldownToken: UINT108_MAX,
          withdrawableToken: UINT108_MAX,
          yfiEquivalent: UINT108_MAX * 3n,
          cooldown: Object.freeze({
            start: matureStreamStart,
            total: UINT108_MAX,
            claimed: 0n,
            cooling: UINT108_MAX,
            withdrawable: UINT108_MAX,
          }),
        }),
      ]),
      legacyVeyfi: Object.freeze({
        amount: INT128_MAX,
        unlockTime: 1_812_585_600n,
      }),
      migratedVeyfi: Object.freeze({
        amount: INT128_MAX,
        boostEpochs: 35n,
        unlockTime: 1_812_585_600n,
        lastClaimedEpoch: MIGRATED_LAST_CLAIMED,
        migrationProven: true,
      }),
    });
    const html = render("veyfi", action, snapshot, {
      price: Object.freeze({
        ...PRICE,
        yfiUsdCents: BigInt(Number.MAX_SAFE_INTEGER),
      }),
      ensNamesByAddress: Object.freeze({
        [ACCOUNT]: names[0]!,
        [CALLER]: names[1]!,
        [RECEIVER]: names[2]!,
      }),
    });
    expect(html.length).toBeLessThanOrEqual(4_096);
    expect(html).toContain(names[0]);
    expect(html).toContain(names[1]);
    expect(html).toContain(names[2]);
  });

  it("rejects a direct out-of-contract oversize renderer input", () => {
    expect(() =>
      render("veyfi", stake("x".repeat(5_000)), yfiSnapshot()),
    ).toThrow("alert_catalogue_html_length_invalid");
  });
});
