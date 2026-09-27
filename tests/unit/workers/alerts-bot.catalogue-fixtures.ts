import type {
  AlertLiquidLockerPositionSnapshot,
  AlertYethAccountBlockSnapshot,
  AlertYfiAccountBlockSnapshot,
} from "@/workers/alerts-bot/src/account-block-context";
import {
  ALERT_CATALOGUE_INTRODUCTIONS,
  renderAlertCatalogueAction,
  type AlertCatalogueRenderInput,
} from "@/workers/alerts-bot/src/catalogue-renderer";
import { PRODUCT_ALERT_INTRODUCTIONS } from "@/workers/alerts-bot/src/product-renderer";
import type { ActiveAlertDomainId } from "@/workers/alerts-bot/src/domain-registry";
import {
  buildYethRepaymentAlertActions,
  type YethFlowSummary,
  type YethRepaymentMetrics,
} from "@/workers/alerts-bot/src/domains/yeth/accounting";
import type { AlertEventBlockPriceEvidence } from "@/workers/alerts-bot/src/evidence";
import type { NormalizedAction } from "@/workers/alerts-bot/src/types";

export const CATALOGUE_BLOCK_NUMBER = 25_123_456;
export const CATALOGUE_BLOCK_HASH =
  `0x${CATALOGUE_BLOCK_NUMBER.toString(16).padStart(64, "0")}` as const;
export const CATALOGUE_PARENT_HASH =
  `0x${(CATALOGUE_BLOCK_NUMBER - 1).toString(16).padStart(64, "0")}` as const;
export const CATALOGUE_TX_HASH = `0x${"a".repeat(64)}` as const;
export const CATALOGUE_ACCOUNT = "0x1111111111111111111111111111111111111111";
export const CATALOGUE_CALLER = "0x2222222222222222222222222222222222222222";
export const CATALOGUE_RECEIVER = "0x3333333333333333333333333333333333333333";
export const CATALOGUE_ONE = 10n ** 18n;
export const CATALOGUE_YETH_RECOVERY_RATE = 319_607_900_000_000_000n;

const EVENT_SECONDS = 1_787_840_400;
const UNLOCK = 1_812_585_600n;
const PREVIOUS_UNLOCK = 1_797_033_600n;
const MIGRATED_LAST_CLAIMED = 1_788_393_600n;
const PRICE: AlertEventBlockPriceEvidence = Object.freeze({
  kind: "available",
  blockNumber: CATALOGUE_BLOCK_NUMBER,
  blockHash: CATALOGUE_BLOCK_HASH,
  yfiUsdCents: 1_000_000n,
});
const EVENT_TIME = Object.freeze({
  kind: "resolved" as const,
  blockNumber: CATALOGUE_BLOCK_NUMBER,
  blockHash: CATALOGUE_BLOCK_HASH,
  seconds: EVENT_SECONDS,
});

function units(value: string): bigint {
  const match = /^([0-9]+)(?:\.([0-9]{1,18}))?$/.exec(value);
  if (match === null) throw new Error("catalogue_fixture_units_invalid");
  return (
    BigInt(match[1]!) * CATALOGUE_ONE +
    BigInt((match[2] ?? "").padEnd(18, "0") || "0")
  );
}

function locker(
  symbol: "sdYFI" | "supYFI" | "coveYFI",
  overrides: Partial<AlertLiquidLockerPositionSnapshot> = {},
): AlertLiquidLockerPositionSnapshot {
  const scale = symbol === "supYFI" ? 69_420n : 1n;
  const value: AlertLiquidLockerPositionSnapshot = Object.freeze({
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
  if (
    value.activeToken !== value.activeShares * value.scale ||
    value.cooldownToken !== value.cooldownShares * value.scale ||
    value.cooldown.cooling !== value.cooldownToken ||
    value.cooldown.withdrawable !== value.withdrawableToken ||
    value.yfiEquivalent !==
      value.wallet / value.scale + value.activeShares + value.cooldownShares
  ) {
    throw new Error("catalogue_fixture_locker_derivation_invalid");
  }
  return value;
}

function yfiSnapshot(
  overrides: Partial<AlertYfiAccountBlockSnapshot> = {},
): AlertYfiAccountBlockSnapshot {
  return Object.freeze({
    kind: "yfi",
    principal: CATALOGUE_ACCOUNT,
    styfi: Object.freeze({
      symbol: "stYFI",
      active: 0n,
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


function canonicalVeyfiSnapshot(
  affected: AlertLiquidLockerPositionSnapshot,
  related: Readonly<{
    sdYfi: bigint;
    supYfi: bigint;
    coveYfi: bigint;
    styfi: bigint;
    styfix: bigint;
    legacy: bigint;
  }>,
): AlertYfiAccountBlockSnapshot {
  const liquidLockers = [
    locker("sdYFI", {
      wallet: related.sdYfi,
      yfiEquivalent: related.sdYfi,
    }),
    locker("supYFI", {
      wallet: related.supYfi * 69_420n,
      yfiEquivalent: related.supYfi,
    }),
    locker("coveYFI", {
      wallet: related.coveYfi,
      yfiEquivalent: related.coveYfi,
    }),
  ];
  liquidLockers[liquidLockers.findIndex(({ symbol }) => symbol === affected.symbol)] =
    affected;
  return yfiSnapshot({
    styfi: Object.freeze({
      symbol: "stYFI",
      active: related.styfi,
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
      active: related.styfix,
      cooldown: Object.freeze({
        start: 0n,
        total: 0n,
        claimed: 0n,
        cooling: 0n,
        withdrawable: 0n,
      }),
    }),
    liquidLockers: Object.freeze(liquidLockers),
    legacyVeyfi: Object.freeze({
      amount: related.legacy,
      unlockTime: related.legacy === 0n ? 0n : UNLOCK,
    }),
  });
}

function legacySnapshot(
  amount: bigint,
  options: { readonly migrated?: bigint } = {},
): AlertYfiAccountBlockSnapshot {
  return yfiSnapshot({
    styfi: Object.freeze({
      symbol: "stYFI",
      active: units("4.2"),
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
      active: units("2"),
      cooldown: Object.freeze({
        start: 0n,
        total: 0n,
        claimed: 0n,
        cooling: 0n,
        withdrawable: 0n,
      }),
    }),
    liquidLockers: Object.freeze([
      locker("sdYFI", {
        wallet: units("4.4"),
        yfiEquivalent: units("4.4"),
      }),
      locker("supYFI", {
        activeShares: units("3"),
        activeToken: units("3") * 69_420n,
        yfiEquivalent: units("3"),
      }),
      locker("coveYFI", {
        wallet: units("5"),
        yfiEquivalent: units("5"),
      }),
    ]),
    legacyVeyfi: Object.freeze({ amount, unlockTime: amount === 0n ? 0n : UNLOCK }),
    migratedVeyfi: Object.freeze({
      amount: options.migrated ?? 0n,
      boostEpochs: options.migrated === undefined ? 0n : 35n,
      unlockTime: options.migrated === undefined ? 0n : UNLOCK,
      lastClaimedEpoch:
        options.migrated === undefined ? 0n : MIGRATED_LAST_CLAIMED,
      migrationProven: options.migrated !== undefined,
    }),
  });
}

function yethSnapshot(
  overrides: Partial<AlertYethAccountBlockSnapshot> = {},
): AlertYethAccountBlockSnapshot {
  const value: AlertYethAccountBlockSnapshot = Object.freeze({
    kind: "yeth",
    principal: CATALOGUE_ACCOUNT,
    claimableSnapshot: 0n,
    claimableRecovered: 0n,
    recoveryRate: CATALOGUE_YETH_RECOVERY_RATE,
    recoveryVaultShares: 0n,
    recoveryVaultAssets: 0n,
    recoveryVaultTotalAssets: units("1000"),
    recoveryVaultTotalSupply: units("1000"),
    ...overrides,
  });
  if (
    value.recoveryRate >= CATALOGUE_ONE ||
    (value.claimableSnapshot * value.recoveryRate) / CATALOGUE_ONE !==
      value.claimableRecovered ||
    value.recoveryVaultTotalSupply <= 0n ||
    (value.recoveryVaultShares * value.recoveryVaultTotalAssets) /
      value.recoveryVaultTotalSupply !==
      value.recoveryVaultAssets
  ) {
    throw new Error("catalogue_fixture_yeth_conversion_invalid");
  }
  return value;
}

function onchain(
  value: Omit<NormalizedAction, "blockNumber" | "logIndex" | "source" | "txHash">,
  logIndex = 0,
): NormalizedAction {
  const txHash =
    `0x${(10_000 + logIndex).toString(16).padStart(64, "0")}` as const;
  return Object.freeze({
    ...value,
    blockNumber: CATALOGUE_BLOCK_NUMBER,
    logIndex,
    txHash,
    source: Object.freeze({ kind: "onchain" as const, txHash, logIndex }),
  });
}

function principal() {
  return Object.freeze({ kind: "proven" as const, address: CATALOGUE_ACCOUNT });
}

function stake(
  tokenSymbol: string,
  assets: bigint,
  shares: bigint,
): NormalizedAction {
  return onchain({
    kind: "staked",
    tokenSymbol,
    user: CATALOGUE_ACCOUNT,
    principal: principal(),
    owner: CATALOGUE_ACCOUNT,
    receiver: CATALOGUE_ACCOUNT,
    caller: CATALOGUE_ACCOUNT,
    amounts: Object.freeze({ assets, shares }),
  });
}

function cooldown(
  tokenSymbol: string,
  assets: bigint,
  shares: bigint,
  restarted = false,
): NormalizedAction {
  return onchain({
    kind: "initiated_cooldown",
    tokenSymbol,
    user: CATALOGUE_ACCOUNT,
    principal: principal(),
    cooldownRestarted: restarted,
    amounts: Object.freeze({ assets, shares }),
  });
}

function cooldownWithdraw(
  tokenSymbol: string,
  assets: bigint,
  shares: bigint,
  receiver = CATALOGUE_ACCOUNT,
): NormalizedAction {
  return onchain({
    kind: "withdrew_from_cooldown",
    tokenSymbol,
    user: CATALOGUE_ACCOUNT,
    principal: principal(),
    owner: CATALOGUE_ACCOUNT,
    receiver,
    caller: CATALOGUE_ACCOUNT,
    amounts: Object.freeze({ assets, shares }),
  });
}

function lockerTrade(
  kind: "exchange" | "redeem",
  tokenSymbol: "sdYFI" | "supYFI" | "coveYFI",
  amount: bigint,
  fee = 0n,
): NormalizedAction {
  return onchain({
    kind,
    tokenSymbol,
    user: CATALOGUE_ACCOUNT,
    principal: principal(),
    caller: CATALOGUE_ACCOUNT,
    amounts: Object.freeze(kind === "redeem" ? { amount, fee } : { amount }),
  });
}

function legacy(
  kind: "lock" | "extension" | "update",
  amounts: {
    readonly amount: bigint;
    readonly previousAmount: bigint;
    readonly locktime: bigint;
    readonly previousLocktime: bigint;
  },
): NormalizedAction {
  return onchain({
    kind,
    tokenSymbol: "veYFI",
    user: CATALOGUE_ACCOUNT,
    principal: principal(),
    caller: CATALOGUE_ACCOUNT,
    amounts: Object.freeze(amounts),
  });
}

const YETH_CHOICES = Object.freeze({
  yethTotalSnapshotDebtEth: units("1000"),
  yethSnapshotExitedEth: units("300"),
  yethSnapshotStayedEth: units("562"),
  yethSnapshotUnclaimedEth: units("138"),
  yethOutstandingDebtEth: units("700"),
});
const CANONICAL_YETH_UNDERLYING =
  (units("20") * CATALOGUE_YETH_RECOVERY_RATE) / CATALOGUE_ONE;
const CANONICAL_YETH_VAULT_TOTAL_ASSETS = CANONICAL_YETH_UNDERLYING * 100n;
const CANONICAL_YETH_VAULT_TOTAL_SUPPLY = units("612");

function yethClaim(
  kind: "yeth_claimed_stayed" | "yeth_claimed_exited",
  state: typeof YETH_CHOICES,
): NormalizedAction {
  return onchain({
    kind,
    tokenSymbol: "yETH",
    user: CATALOGUE_ACCOUNT,
    principal: principal(),
    owner: CATALOGUE_ACCOUNT,
    receiver: CATALOGUE_ACCOUNT,
    amounts: Object.freeze({
      yethSnapshotAmount: units("20"),
      yethUnderlyingAmount: CANONICAL_YETH_UNDERLYING,
      yethClaimShares: kind === "yeth_claimed_stayed" ? units("6.12") : 0n,
      ...state,
    }),
  });
}


function yethWithdraw(
  type: "partial" | "full",
  state: typeof YETH_CHOICES,
  receiver = CATALOGUE_ACCOUNT,
): NormalizedAction {
  const full = type === "full";
  const burned = full ? units("6.12") : units("3.06");
  const before = units("6.12");
  return onchain({
    kind: "yeth_recovery_vault_withdraw",
    tokenSymbol: "yETH",
    user: CATALOGUE_ACCOUNT,
    principal: principal(),
    owner: CATALOGUE_ACCOUNT,
    receiver,
    caller: CATALOGUE_ACCOUNT,
    yethWithdrawalType: type,
    amounts: Object.freeze({
      assets: full ? units("6.4") : units("3.2"),
      shares: burned,
      yethSharesBurned: burned,
      yethOwnerSharesBefore: before,
      yethOwnerSharesAfter: full ? 0n : before - burned,
      yethSnapshotMoved: full ? units("20") : units("10"),
      ...state,
    }),
  });
}

type SyntheticKind =
  | "yeth_debt_paid_down"
  | "yeth_recovery_progress"
  | "yeth_recovery_setback"
  | "yeth_yield_capacity_up"
  | "yeth_yield_capacity_down";


function repaymentMetrics(
  overrides: Partial<YethRepaymentMetrics>,
): YethRepaymentMetrics {
  const value = Object.freeze({
    totalSnapshotDebtEth: units("3765.44"),
    snapshotExitedEth: units("855.72"),
    snapshotStayedEth: units("2620.66"),
    outstandingDebtEth: units("2909.72"),
    recoveryVaultAssetsEth: units("1452.56"),
    yieldVaultAssetsEth: units("1660"),
    ...overrides,
  });
  if (
    value.totalSnapshotDebtEth < 0n ||
    value.snapshotExitedEth < 0n ||
    value.snapshotStayedEth < 0n ||
    value.totalSnapshotDebtEth <
      value.snapshotExitedEth + value.snapshotStayedEth ||
    value.outstandingDebtEth !==
      value.totalSnapshotDebtEth - value.snapshotExitedEth ||
    value.recoveryVaultAssetsEth === null ||
    value.yieldVaultAssetsEth === null
  ) {
    throw new Error("catalogue_fixture_repayment_metrics_invalid");
  }
  return value;
}

function producerSynthetic(
  kind: SyntheticKind,
  previous: YethRepaymentMetrics,
  current: YethRepaymentMetrics,
  flow: YethFlowSummary,
  coemittedKinds: readonly SyntheticKind[] = [],
): NormalizedAction {
  const actions = buildYethRepaymentAlertActions({
    previous,
    current,
    flow,
    blockNumber: CATALOGUE_BLOCK_NUMBER,
    blockHash: CATALOGUE_BLOCK_HASH,
  });
  const expectedKinds = [...coemittedKinds, kind];
  const selected = actions.find((action) => action.kind === kind);
  if (
    selected === undefined ||
    actions.map((action) => action.kind).join(",") !== expectedKinds.join(",")
  ) {
    throw new Error(`catalogue_fixture_synthetic_${kind}_invalid`);
  }
  return Object.freeze(selected);
}

function actionInput(
  domainId: ActiveAlertDomainId,
  action: NormalizedAction,
  snapshot: AlertYfiAccountBlockSnapshot | AlertYethAccountBlockSnapshot | null,
  options: Pick<
    AlertCatalogueRenderInput,
    "coveFacility" | "ensNamesByAddress" | "positionUnavailable"
  > = {},
): AlertCatalogueRenderInput {
  return Object.freeze({
    domainId,
    action,
    snapshot,
    eventTime: EVENT_TIME,
    price: PRICE,
    ...options,
  });
}


const ALICE = Object.freeze({ [CATALOGUE_ACCOUNT]: "alice.eth" });

export type AlertCatalogueTemplateId =
  | "S1" | "S2" | "S3"
  | "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9" | "V10" | "V11" | "V12"
  | "Y1" | "Y2" | "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8" | "Y9"
  | "I-styfi" | "I-veyfi" | "I-yeth";

interface BaseFixture {
  readonly id: string;
  readonly template: AlertCatalogueTemplateId;
  readonly variantTags: readonly string[];
  /** Literal reviewed output. Never compute this from the renderer. */
  readonly expectedHtml: string;
}

export type AlertCatalogueGoldenFixture =
  | (BaseFixture & {
      readonly kind: "action";
      readonly domainId: ActiveAlertDomainId;
      readonly input: AlertCatalogueRenderInput;
    })
  | (BaseFixture & {
      readonly kind: "introduction";
      readonly domainId: ActiveAlertDomainId;
    });

const styfiRelated = Object.freeze({
  styfi: Object.freeze({
    symbol: "stYFI" as const,
    active: units("44.2"),
    cooldown: Object.freeze({
      start: BigInt(EVENT_SECONDS),
      total: units("6"),
      claimed: 0n,
      cooling: units("6"),
      withdrawable: 0n,
    }),
  }),
  styfix: Object.freeze({
    symbol: "stYFIx" as const,
    active: units("3.1"),
    cooldown: Object.freeze({
      start: 0n,
      total: 0n,
      claimed: 0n,
      cooling: 0n,
      withdrawable: 0n,
    }),
  }),
  liquidLockers: Object.freeze([
    locker("sdYFI", {
      wallet: units("3"),
      yfiEquivalent: units("3"),
    }),
    locker("supYFI", {
      wallet: units("2.4") * 69_420n,
      yfiEquivalent: units("2.4"),
    }),
    locker("coveYFI", {
      wallet: units("3"),
      yfiEquivalent: units("3"),
    }),
  ]),
});


const canonical = [
  {
    id: "canonical-S1",
    template: "S1",
    variantTags: ["stYFI", "resolved-ens", "one-to-one"],
    kind: "action",
    domainId: "styfi",
    input: actionInput(
      "styfi",
      stake("stYFI", units("12.5"), units("12.5")),
      yfiSnapshot(styfiRelated),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🟢 stYFI staked</b>

Staked: 12.50 YFI ($125,000.00)

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
stYFI: 44.20 active · 6.00 cooling
stYFIx: 3.10 active
LLYFI: 8.40 YFI eq.

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-S2",
    template: "S2",
    variantTags: ["stYFI", "cooldown", "withdrawable"],
    kind: "action",
    domainId: "styfi",
    input: actionInput(
      "styfi",
      cooldown("stYFI", units("12.5"), units("12.5")),
      yfiSnapshot({
        ...styfiRelated,
        styfi: Object.freeze({
          symbol: "stYFI",
          active: units("38.2"),
          cooldown: Object.freeze({
            start: BigInt(EVENT_SECONDS),
            total: units("20"),
            claimed: 0n,
            cooling: units("20"),
            withdrawable: 0n,
          }),
        }),
        styfix: Object.freeze({
          symbol: "stYFIx",
          active: units("4.1"),
          cooldown: Object.freeze({
            start: 0n,
            total: 0n,
            claimed: 0n,
            cooling: 0n,
            withdrawable: 0n,
          }),
        }),
        liquidLockers: Object.freeze([
          locker("sdYFI", { wallet: units("3"), yfiEquivalent: units("3") }),
          locker("supYFI", {
            wallet: units("2.3") * 69_420n,
            yfiEquivalent: units("2.3"),
          }),
          locker("coveYFI", { wallet: units("3"), yfiEquivalent: units("3") }),
        ]),
      }),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🧊 stYFI cooldown started</b>

Entered cooldown: 12.50 stYFI
Total cooling: 20.00 stYFI
Withdrawable now: 0.00 YFI
Stream completes: 10 Sep 2026 14:20 UTC

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
stYFI: 38.20 active · 20.00 cooling
stYFIx: 4.10 active
LLYFI: 8.30 YFI eq.

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-S3",
    template: "S3",
    variantTags: ["stYFI", "partial", "one-to-one"],
    kind: "action",
    domainId: "styfi",
    input: actionInput(
      "styfi",
      cooldownWithdraw("stYFI", units("4.2"), units("4.2")),
      yfiSnapshot({
        ...styfiRelated,
        styfi: Object.freeze({
          symbol: "stYFI",
          active: units("38.2"),
          cooldown: Object.freeze({
            start: BigInt(EVENT_SECONDS - 423_360),
            total: units("12"),
            claimed: units("4.2"),
            cooling: units("7.8"),
            withdrawable: 0n,
          }),
        }),
      }),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🏁 stYFI cooldown withdrawal</b>

Received: 4.20 YFI ($42,000.00)

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
stYFI: 38.20 active · 7.80 cooling · 0.00 withdrawable
stYFIx: 3.10 active
LLYFI: 8.40 YFI eq.

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V1",
    template: "V1",
    variantTags: ["supYFI", "non-one-to-one"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      stake("supYFI", units("69420"), units("1")),
      canonicalVeyfiSnapshot(
        locker("supYFI", {
          wallet: units("21300"),
          activeShares: units("2"),
          activeToken: units("138840"),
          yfiEquivalent: units("21300") / 69_420n + units("2"),
        }),
        {
          sdYfi: units("2.4"),
          supYfi: 0n,
          coveYfi: units("3"),
          styfi: units("8.2"),
          styfix: units("6"),
          legacy: units("8"),
        },
      ),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🟢 supYFI staked</b>

Staked: 69.42K supYFI
YFI equivalent: 1.00 YFI ($10,000.00)

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
supYFI: 21.30K wallet · 138.84K active
Other LLYFI: 5.40 YFI eq.
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
stYFI/stYFIx: 14.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V2",
    template: "V2",
    variantTags: ["sdYFI", "cooldown", "withdrawable"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      cooldown("sdYFI", units("5"), units("5")),
      canonicalVeyfiSnapshot(
        locker("sdYFI", {
          wallet: units("7"),
          activeShares: units("12"),
          activeToken: units("12"),
          cooldownShares: units("8"),
          cooldownToken: units("8"),
          withdrawableToken: 0n,
          yfiEquivalent: units("27"),
          cooldown: Object.freeze({
            start: BigInt(EVENT_SECONDS),
            total: units("8"),
            claimed: 0n,
            cooling: units("8"),
            withdrawable: 0n,
          }),
        }),
        {
          sdYfi: 0n,
          supYfi: units("1.3"),
          coveYfi: units("2"),
          styfi: 0n,
          styfix: 0n,
          legacy: units("8"),
        },
      ),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🧊 sdYFI cooldown started</b>

Entered cooldown: 5.00 sdYFI
YFI equivalent: 5.00 YFI ($50,000.00)
Total cooling: 8.00 sdYFI
Withdrawable now: 0.00 sdYFI
Stream completes: 10 Sep 2026 14:20 UTC

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
sdYFI: 7.00 wallet · 12.00 active · 8.00 cooling
Other LLYFI: 3.30 YFI eq.
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V3",
    template: "V3",
    variantTags: ["coveYFI", "receiver-different", "one-to-one"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      cooldownWithdraw("coveYFI", units("2"), units("2"), CATALOGUE_RECEIVER),
      canonicalVeyfiSnapshot(
        locker("coveYFI", {
          wallet: units("4"),
          activeShares: units("3"),
          activeToken: units("3"),
          cooldownShares: units("1"),
          cooldownToken: units("1"),
          yfiEquivalent: units("8"),
          cooldown: Object.freeze({
            start: BigInt(EVENT_SECONDS - 806_400),
            total: units("3"),
            claimed: units("2"),
            cooling: units("1"),
            withdrawable: 0n,
          }),
        }),
        {
          sdYfi: units("2.1"),
          supYfi: units("3"),
          coveYfi: 0n,
          styfi: 0n,
          styfix: 0n,
          legacy: units("8"),
        },
      ),
      {
        ensNamesByAddress: Object.freeze({
          [CATALOGUE_ACCOUNT]: "alice.eth",
          [CATALOGUE_RECEIVER]: "yearn-treasury.eth",
        }),
      },
    ),
    expectedHtml: `<b>🏁 coveYFI cooldown withdrawal</b>

Received: 2.00 coveYFI ($20,000.00)

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
coveYFI: 4.00 wallet · 3.00 active · 1.00 cooling
Other LLYFI: 5.10 YFI eq.
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027

Received by: <a href="https://etherscan.io/address/0x3333333333333333333333333333333333333333">yearn-treasury.eth</a>

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V4",
    template: "V4",
    variantTags: ["supYFI", "buy"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      lockerTrade("exchange", "supYFI", units("2")),
      canonicalVeyfiSnapshot(
        locker("supYFI", {
          wallet: units("160140"),
          activeShares: units("0.5"),
          activeToken: units("34710"),
          yfiEquivalent: units("160140") / 69_420n + units("0.5"),
        }),
        {
          sdYfi: units("2.4"),
          supYfi: 0n,
          coveYfi: units("3"),
          styfi: units("8.2"),
          styfix: units("6"),
          legacy: 0n,
        },
      ),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🛒 supYFI bought</b>

2.00 YFI → 138.84K supYFI
Value: $20,000.00

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
supYFI: 160.14K wallet · 34.71K active
Other LLYFI: 5.40 YFI eq.
stYFI/stYFIx: 14.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V5",
    template: "V5",
    variantTags: ["supYFI", "normal-fee"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      lockerTrade("redeem", "supYFI", units("69420"), units("0.05")),
      canonicalVeyfiSnapshot(
        locker("supYFI", {
          wallet: units("21300"),
          activeShares: units("0.5"),
          activeToken: units("34710"),
          yfiEquivalent: units("21300") / 69_420n + units("0.5"),
        }),
        {
          sdYfi: units("2.4"),
          supYfi: 0n,
          coveYfi: units("3"),
          styfi: units("8.2"),
          styfix: units("6"),
          legacy: 0n,
        },
      ),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>💸 supYFI redeemed</b>

69.42K supYFI → 0.95 YFI ($9,500.00)
Exit fee: 0.05 YFI · 5.00%

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
supYFI: 21.30K wallet · 34.71K active
Other LLYFI: 5.40 YFI eq.
stYFI/stYFIx: 14.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V6",
    template: "V6",
    variantTags: ["migration"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      onchain({
        kind: "migrate",
        tokenSymbol: "veYFI",
        user: CATALOGUE_ACCOUNT,
        principal: principal(),
        amounts: Object.freeze({ amount: units("8"), unlockEpoch: 35n }),
      }),
      legacySnapshot(units("8"), { migrated: units("8") }),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🚚 Legacy veYFI migrated</b>

Opted into the new veYFI boost system: 8.00 YFI
Unlock: 10 Jun 2027 00:00 UTC

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Migrated veYFI: 8.00 YFI until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V7",
    template: "V7",
    variantTags: ["lock-created"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      legacy("lock", {
        amount: units("8"),
        previousAmount: 0n,
        locktime: UNLOCK,
        previousLocktime: 0n,
      }),
      legacySnapshot(units("8")),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🔐 Legacy veYFI lock created</b>

Locked: 8.00 YFI ($80,000.00)
Unlock: 10 Jun 2027 00:00 UTC · 287 days

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V8",
    template: "V8",
    variantTags: ["extension-only"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      legacy("extension", {
        amount: units("8"),
        previousAmount: units("8"),
        locktime: UNLOCK,
        previousLocktime: PREVIOUS_UNLOCK,
      }),
      legacySnapshot(units("8")),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🗓️ Legacy veYFI lock extended</b>

Locked: 8.00 YFI
Unlock: 12 Dec 2026 → 10 Jun 2027
Extension: 180 days

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V9",
    template: "V9",
    variantTags: ["amount-increase"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      legacy("update", {
        amount: units("8"),
        previousAmount: units("5"),
        locktime: UNLOCK,
        previousLocktime: UNLOCK,
      }),
      legacySnapshot(units("8")),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🔒 Legacy veYFI lock increased</b>

Locked: 5.00 → 8.00 YFI
Added: 3.00 YFI ($30,000.00)
Unlock: 10 Jun 2027

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V10",
    template: "V10",
    variantTags: ["amount-and-time-increase"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      legacy("update", {
        amount: units("8"),
        previousAmount: units("5"),
        locktime: UNLOCK,
        previousLocktime: PREVIOUS_UNLOCK,
      }),
      legacySnapshot(units("8")),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🗓️ Legacy veYFI lock increased and extended</b>

Locked: 5.00 → 8.00 YFI · +3.00
Unlock: 12 Dec 2026 → 10 Jun 2027 · +180 days

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V11",
    template: "V11",
    variantTags: ["normal-withdraw", "closed"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      onchain({
        kind: "legacy_withdraw",
        tokenSymbol: "veYFI",
        user: CATALOGUE_ACCOUNT,
        principal: principal(),
        amounts: Object.freeze({ amount: units("8"), penalty: 0n }),
      }),
      legacySnapshot(0n),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🏦 Legacy veYFI withdrawn</b>

Received: 8.00 YFI ($80,000.00)

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Legacy veYFI: position closed
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-V12",
    template: "V12",
    variantTags: ["early-exit", "penalty", "closed"],
    kind: "action",
    domainId: "veyfi",
    input: actionInput(
      "veyfi",
      onchain({
        kind: "legacy_withdraw",
        tokenSymbol: "veYFI",
        user: CATALOGUE_ACCOUNT,
        principal: principal(),
        amounts: Object.freeze({ amount: units("6"), penalty: units("2") }),
      }),
      legacySnapshot(0n),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🏃 Legacy veYFI early exit</b>

Received: 6.00 YFI ($60,000.00)
Penalty: 2.00 YFI ($20,000.00) · 25.00%
Original locked value: 8.00 YFI

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Legacy veYFI: position closed
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y1",
    template: "Y1",
    variantTags: ["claim-stay", "distinct-fields"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      yethClaim("yeth_claimed_stayed", YETH_CHOICES),
      yethSnapshot({
        recoveryRate: CATALOGUE_YETH_RECOVERY_RATE,
        recoveryVaultShares: units("6.12"),
        recoveryVaultAssets: CANONICAL_YETH_UNDERLYING,
        recoveryVaultTotalAssets: CANONICAL_YETH_VAULT_TOTAL_ASSETS,
        recoveryVaultTotalSupply: CANONICAL_YETH_VAULT_TOTAL_SUPPLY,
      }),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🟢 yETH recovery claimed · stayed</b>

Original snapshot claim: 20.00 ETH
Recovered: 6.39 ETH · 31.96%
Deposited into the Recovery Vault
Received: 6.12 yswETH

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Recovery Vault: 6.12 yswETH · worth 6.39 ETH
Unclaimed recovery: 0.00 ETH

Protocol choices: 56.20% stayed · 30.00% exited · 13.80% unclaimed

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y2",
    template: "Y2",
    variantTags: ["claim-exit", "zero-vault"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      yethClaim(
        "yeth_claimed_exited",
        Object.freeze({
          ...YETH_CHOICES,
          yethSnapshotExitedEth: units("302"),
          yethSnapshotUnclaimedEth: units("136"),
          yethOutstandingDebtEth: units("698"),
        }),
      ),
      yethSnapshot({
        recoveryVaultTotalAssets: units("6.4"),
        recoveryVaultTotalSupply: units("6.12"),
      }),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>🏁 yETH recovery claimed · exited</b>

Original snapshot claim: 20.00 ETH
Received now: 6.39 ETH · 31.96%

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Unclaimed recovery: 0.00 ETH
Recovery Vault: 0.00 yswETH

Protocol choices: 56.20% stayed · 30.20% exited · 13.60% unclaimed

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y3",
    template: "Y3",
    variantTags: ["partial", "event-local-shares"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      yethWithdraw(
        "partial",
        Object.freeze({
          ...YETH_CHOICES,
          yethSnapshotStayedEth: units("462"),
          yethSnapshotExitedEth: units("400"),
          yethOutstandingDebtEth: units("600"),
        }),
      ),
      yethSnapshot({
        recoveryVaultShares: units("3.06"),
        recoveryVaultAssets: units("3.2"),
        recoveryVaultTotalAssets: units("320"),
        recoveryVaultTotalSupply: units("306"),
      }),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>💸 yETH Recovery Vault withdrawal · partial</b>

Received: 3.20 ETH
Burned: 3.06 of 6.12 yswETH · 50.00%
Shares after withdrawal: 3.06 yswETH
Original snapshot moved to exited: 10.00 ETH

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Recovery Vault: 3.06 yswETH · worth 3.20 ETH

Protocol choices: 46.20% stayed · 40.00% exited · 13.80% unclaimed

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y4",
    template: "Y4",
    variantTags: ["full", "closed"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      yethWithdraw(
        "full",
        Object.freeze({
          ...YETH_CHOICES,
          yethSnapshotStayedEth: units("362"),
          yethSnapshotExitedEth: units("500"),
          yethOutstandingDebtEth: units("500"),
        }),
      ),
      yethSnapshot({
        recoveryVaultTotalAssets: units("6.4"),
        recoveryVaultTotalSupply: units("6.12"),
      }),
      { ensNamesByAddress: ALICE },
    ),
    expectedHtml: `<b>💸 yETH Recovery Vault withdrawal · full</b>

Received: 6.40 ETH
Burned: 6.12 yswETH · 100.00%
Original snapshot moved to exited: 20.00 ETH

Position after · <a href="https://etherscan.io/address/0x1111111111111111111111111111111111111111">alice.eth</a>
Recovery Vault: position closed

Protocol choices: 36.20% stayed · 50.00% exited · 13.80% unclaimed

<a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000002710">Tx</a> · <a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y5",
    template: "Y5",
    variantTags: ["debt-paid-down", "synthetic"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      producerSynthetic(
        "yeth_debt_paid_down",
        repaymentMetrics({
          snapshotExitedEth: units("855"),
          outstandingDebtEth: units("2910.44"),
        }),
        repaymentMetrics({}),
        Object.freeze({ recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n }),
      ),
      null,
    ),
    expectedHtml: `<b>🟢 yETH recovery debt paid down</b>

Outstanding recovery debt fell by 0.72 ETH
Remaining debt: 2,909.72 ETH
Recovered since snapshot: 22.73% · +0.02 pts

<a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y6",
    template: "Y6",
    variantTags: ["progress", "both-drivers"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      producerSynthetic(
        "yeth_recovery_progress",
        repaymentMetrics({ recoveryVaultAssetsEth: units("1416.06") }),
        repaymentMetrics({ recoveryVaultAssetsEth: units("1452.56") }),
        Object.freeze({
          recoveryNetFlowEth: units("10"),
          yieldNetFlowEth: 0n,
        }),
      ),
      null,
    ),
    expectedHtml: `<b>📈 yETH recovery progress</b>

Recovery shortfall narrowed by 36.50 ETH
Remaining shortfall: 1,168.10 ETH
Coverage: 54.03% → 55.43% · +1.40 pts

Since the previous checkpoint:
User deposits: +10.00 ETH
Yield, fees and donations: +26.50 ETH

<a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y7",
    template: "Y7",
    variantTags: ["setback", "both-drivers"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      producerSynthetic(
        "yeth_recovery_setback",
        repaymentMetrics({ recoveryVaultAssetsEth: units("1452.56") }),
        repaymentMetrics({ recoveryVaultAssetsEth: units("1434.16") }),
        Object.freeze({
          recoveryNetFlowEth: -units("5"),
          yieldNetFlowEth: 0n,
        }),
      ),
      null,
    ),
    expectedHtml: `<b>📉 yETH recovery setback</b>

Recovery shortfall widened by 18.40 ETH
Current shortfall: 1,186.50 ETH
Coverage: 55.43% → 54.73% · -0.70 pts

Since the previous checkpoint:
User withdrawals: -5.00 ETH
Yield, fees and losses: -13.40 ETH

<a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y8",
    template: "Y8",
    variantTags: ["capacity-up", "both-drivers"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      producerSynthetic(
        "yeth_yield_capacity_up",
        repaymentMetrics({
          snapshotExitedEth: units("855"),
          outstandingDebtEth: units("2910.44"),
          yieldVaultAssetsEth: units("1660"),
        }),
        repaymentMetrics({
          yieldVaultAssetsEth: units("1740"),
        }),
        Object.freeze({
          recoveryNetFlowEth: 0n,
          yieldNetFlowEth: units("50"),
        }),
        ["yeth_debt_paid_down"],
      ),
      null,
    ),
    expectedHtml: `<b>📈 yETH yield capacity increased</b>

Yield Vault assets rose by 80.00 ETH
Current assets: 1,740.00 ETH
Coverage of outstanding recovery debt: 57.04% → 59.80% · +2.76 pts
Outstanding recovery debt: 2,909.72 ETH

Since the previous checkpoint:
Net claim flow: +50.00 ETH
Yield and other gains: +30.00 ETH

<a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },
  {
    id: "canonical-Y9",
    template: "Y9",
    variantTags: ["capacity-down", "both-drivers"],
    kind: "action",
    domainId: "yeth",
    input: actionInput(
      "yeth",
      producerSynthetic(
        "yeth_yield_capacity_down",
        repaymentMetrics({
          yieldVaultAssetsEth: units("1740"),
        }),
        repaymentMetrics({
          snapshotExitedEth: units("855"),
          outstandingDebtEth: units("2910.44"),
          yieldVaultAssetsEth: units("1660"),
        }),
        Object.freeze({
          recoveryNetFlowEth: 0n,
          yieldNetFlowEth: -units("50"),
        }),
      ),
      null,
    ),
    expectedHtml: `<b>📉 yETH yield capacity decreased</b>

Yield Vault assets fell by 80.00 ETH
Current assets: 1,660.00 ETH
Coverage of outstanding recovery debt: 59.80% → 57.04% · -2.76 pts
Outstanding recovery debt: 2,910.44 ETH

Since the previous checkpoint:
Net claim flow: -50.00 ETH
Yield and other losses: -30.00 ETH

<a href="https://etherscan.io/block/25123456">Block 25,123,456</a> · 27 Aug 2026 14:20 UTC`,
  },

  {
    id: "canonical-I-styfi",
    template: "I-styfi",
    variantTags: ["introduction", "styfi", "registry-only"],
    kind: "introduction",
    domainId: "styfi",
    expectedHtml: `<b>stYFI activity</b>

This channel tracks stYFI and stYFIx staking, cooldowns, and withdrawals on Ethereum.

Account positions are shown at the end of each event's confirmed block. Historical messages were replayed from the contracts' start block using the same rules as live alerts.`,
  },
  {
    id: "canonical-I-veyfi",
    template: "I-veyfi",
    variantTags: ["introduction", "veyfi", "registry-only"],
    kind: "introduction",
    domainId: "veyfi",
    expectedHtml: `<b>veYFI and LLYFI activity</b>

This channel tracks legacy veYFI locks and withdrawals, veYFI migration, and sdYFI, supYFI, and coveYFI staking, cooldowns, buys, and redemptions on Ethereum.

Account positions are shown at the end of each event's confirmed block. Historical messages were replayed from the contracts' start block using the same rules as live alerts.`,
  },
  {
    id: "canonical-I-yeth",
    template: "I-yeth",
    variantTags: ["introduction", "yeth", "registry-only"],
    kind: "introduction",
    domainId: "yeth",
    expectedHtml: `<b>yETH recovery activity</b>

This channel tracks yETH recovery claims, Recovery Vault withdrawals, and changes in recovery funding on Ethereum.

User positions are shown at the end of each event's confirmed block. Protocol updates summarize state changes and may not have one causal transaction. Historical messages were replayed from the recovery contracts' start block using the same rules as live alerts.`,
  },
] as const satisfies readonly AlertCatalogueGoldenFixture[];

export const ALERT_CATALOGUE_CANONICAL_FIXTURES = Object.freeze(canonical);


export function renderAlertCatalogueFixture(
  fixture: AlertCatalogueGoldenFixture,
): string {
  return fixture.kind === "action"
    ? renderAlertCatalogueAction(fixture.input)
    : fixture.domainId === "teams" || fixture.domainId === "ybc"
      ? PRODUCT_ALERT_INTRODUCTIONS[fixture.domainId]
      : ALERT_CATALOGUE_INTRODUCTIONS[fixture.domainId];
}
