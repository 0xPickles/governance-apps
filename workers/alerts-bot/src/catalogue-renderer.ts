import deployment from "../../../lib/deployment.json";
import type {
  AlertAccountBlockSnapshot,
  AlertCooldownSnapshot,
  AlertLiquidLockerPositionSnapshot,
  AlertYethAccountBlockSnapshot,
  AlertYfiAccountBlockSnapshot,
} from "./account-block-context";
import { isSafeAlertEnsName } from "./account-block-context";
import { LIQUID_LOCKERS } from "./contracts";
import {
  isCoveFacilityAction,
  type AlertCoveFacilityEvidence,
  type AlertEventBlockPriceEvidence,
  type AlertEventTimeEvidence,
} from "./evidence";
import type { ActiveAlertDomainId } from "./domain-registry";
import type { NormalizedAction } from "./types";

const ETHERSCAN = "https://etherscan.io";
const ONE = 10n ** 18n;
const DAY_SECONDS = 86_400n;
const COOLDOWN_SECONDS = 14n * DAY_SECONDS;
const EPOCH_SECONDS = 14n * DAY_SECONDS;
const GENESIS_SECONDS = BigInt(deployment.GENESIS);
const MAX_HTML_LENGTH = 4_096;
const YFI_WHALE_THRESHOLD = 40n * ONE;

export const ALERT_CATALOGUE_INTRODUCTIONS = Object.freeze({
  styfi:
    "<b>stYFI activity</b>\n\n" +
    "This channel tracks stYFI and stYFIx staking, cooldowns, and withdrawals on Ethereum.\n\n" +
    "Account positions are shown at the end of each event's confirmed block. " +
    "Historical messages were replayed from the contracts' start block using the same rules as live alerts.",
  veyfi:
    "<b>veYFI and LLYFI activity</b>\n\n" +
    "This channel tracks legacy veYFI locks and withdrawals, veYFI migration, and sdYFI, supYFI, and coveYFI staking, cooldowns, buys, and redemptions on Ethereum.\n\n" +
    "Account positions are shown at the end of each event's confirmed block. " +
    "Historical messages were replayed from the contracts' start block using the same rules as live alerts.",
  yeth:
    "<b>yETH recovery activity</b>\n\n" +
    "This channel tracks yETH recovery claims, Recovery Vault withdrawals, and changes in recovery funding on Ethereum.\n\n" +
    "User positions are shown at the end of each event's confirmed block. " +
    "Protocol updates summarize state changes and may not have one causal transaction. " +
    "Historical messages were replayed from the recovery contracts' start block using the same rules as live alerts.",
} as const);

export interface AlertCatalogueRenderInput {
  readonly domainId: ActiveAlertDomainId;
  readonly action: NormalizedAction;
  readonly snapshot: AlertAccountBlockSnapshot | null;
  readonly eventTime: AlertEventTimeEvidence;
  readonly price: AlertEventBlockPriceEvidence;
  readonly positionUnavailable?: boolean;
  readonly coveFacility?: AlertCoveFacilityEvidence | null;
  /** Exact-block, forward-verified labels keyed by lowercase canonical address. */
  readonly ensNamesByAddress?: Readonly<Record<string, string>>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeAddress(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("alert_catalogue_address_invalid");
  }
  return normalized;
}

function sameAddress(left: string, right: string): boolean {
  return normalizeAddress(left) === normalizeAddress(right);
}

function shortAddress(value: string): string {
  const address = normalizeAddress(value);
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function accountLink(
  address: string,
  ensNamesByAddress: Readonly<Record<string, string>> | undefined,
): string {
  const normalized = normalizeAddress(address);
  const resolved = ensNamesByAddress?.[normalized];
  const label =
    resolved !== undefined && isSafeAlertEnsName(resolved)
      ? resolved
      : shortAddress(normalized);
  return `<a href="${ETHERSCAN}/address/${normalized}">${escapeHtml(label)}</a>`;
}

function commaInteger(value: bigint | number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fixedFromScaled(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const rounded = (absolute * scale + ONE / 2n) / ONE;
  const whole = rounded / scale;
  const fraction = (rounded % scale).toString().padStart(decimals, "0");
  return `${negative ? "-" : ""}${commaInteger(whole)}.${fraction}`;
}

function formatAmount(value: bigint): string {
  if (value === 0n) return "0.00";
  if (value > 0n && value < ONE / 10_000n) return "&lt;0.0001";
  if (value < 0n && -value < ONE / 10_000n) return "-&lt;0.0001";
  return fixedFromScaled(value, value < ONE / 100n && value > -ONE / 100n ? 4 : 2);
}

function formatCompactAmount(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  const suffixes = [
    { threshold: 1_000_000_000n * ONE, divisor: 1_000_000_000n, suffix: "B" },
    { threshold: 1_000_000n * ONE, divisor: 1_000_000n, suffix: "M" },
    { threshold: 1_000n * ONE, divisor: 1_000n, suffix: "K" },
  ] as const;
  const selected = suffixes.find((entry) => absolute >= entry.threshold);
  if (selected === undefined) return formatAmount(value);
  return `${fixedFromScaled(value / selected.divisor, 2)}${selected.suffix}`;
}

function formatPair(left: bigint, right: bigint): readonly [string, string] {
  if (
    (left === 0n && right !== 0n && right < ONE / 10_000n && right > -ONE / 10_000n) ||
    (right === 0n && left !== 0n && left < ONE / 10_000n && left > -ONE / 10_000n)
  ) {
    return [formatAmount(left), formatAmount(right)];
  }
  for (let decimals = 2; decimals <= 18; decimals += 1) {
    const leftValue =
      left === 0n
        ? "0.00"
        : fixedFromScaled(
            left,
            left < ONE / 100n && left > -ONE / 100n
              ? Math.max(4, decimals)
              : decimals,
          );
    const rightValue =
      right === 0n
        ? "0.00"
        : fixedFromScaled(
            right,
            right < ONE / 100n && right > -ONE / 100n
              ? Math.max(4, decimals)
              : decimals,
          );
    if (left === right || leftValue !== rightValue || decimals === 18) {
      return [leftValue, rightValue];
    }
  }
  throw new Error("alert_catalogue_amount_pair_invalid");
}

function formatUsd(amount: bigint, price: AlertEventBlockPriceEvidence): string {
  if (price.kind !== "available") return "";
  const cents = (amount * price.yfiUsdCents + ONE / 2n) / ONE;
  const dollars = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return ` ($${commaInteger(dollars)}.${fraction})`;
}

function percentHundredths(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) return 0n;
  return (numerator * 10_000n + denominator / 2n) / denominator;
}

function formatHundredths(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${commaInteger(absolute / 100n)}.${(
    absolute % 100n
  )
    .toString()
    .padStart(2, "0")}`;
}

function coverageLine(
  label: string,
  previous: bigint,
  current: bigint,
): string {
  if (previous === current) {
    return `${label}: ${formatHundredths(current)}%`;
  }
  const delta = current - previous;
  return `${label}: ${formatHundredths(previous)}% → ${formatHundredths(
    current,
  )}% · ${delta > 0n ? "+" : ""}${formatHundredths(delta)} pts`;
}

function formatDate(seconds: bigint, includeTime: boolean): string {
  if (seconds < 0n || seconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("alert_catalogue_time_invalid");
  }
  const date = new Date(Number(seconds) * 1_000);
  if (Number.isNaN(date.getTime())) {
    throw new Error("alert_catalogue_time_invalid");
  }
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][date.getUTCMonth()]!;
  const datePart = `${day} ${month} ${date.getUTCFullYear()}`;
  return includeTime
    ? `${datePart} ${date.getUTCHours().toString().padStart(2, "0")}:${date
        .getUTCMinutes()
        .toString()
        .padStart(2, "0")} UTC`
    : datePart;
}

function footer(
  action: NormalizedAction,
  eventTime: AlertEventTimeEvidence,
): string {
  const block = commaInteger(action.blockNumber);
  const blockLink = `<a href="${ETHERSCAN}/block/${action.blockNumber}">Block ${block}</a>`;
  const time =
    eventTime.kind === "resolved"
      ? formatDate(BigInt(eventTime.seconds), true)
      : "UTC time unavailable";
  if (action.source.kind === "synthetic") return `${blockLink} · ${time}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(action.txHash)) {
    throw new Error("alert_catalogue_transaction_invalid");
  }
  const txHash = action.txHash.toLowerCase();
  return `<a href="${ETHERSCAN}/tx/${txHash}">Tx</a> · ${blockLink} · ${time}`;
}

function validateEvidence(input: AlertCatalogueRenderInput): void {
  const { action, eventTime, price } = input;
  if (
    eventTime.blockNumber !== action.blockNumber ||
    price.blockNumber !== action.blockNumber ||
    eventTime.blockHash.toLowerCase() !== price.blockHash.toLowerCase() ||
    (action.source.kind === "synthetic" &&
      action.source.blockHash.toLowerCase() !== eventTime.blockHash.toLowerCase())
  ) {
    throw new Error("alert_catalogue_evidence_identity_invalid");
  }
}

function validateTelegramHtml(html: string): string {
  if (html.length < 1 || html.length > MAX_HTML_LENGTH) {
    throw new Error("alert_catalogue_html_length_invalid");
  }
  const tags = html.match(/<[^>]*>/g) ?? [];
  for (const tag of tags) {
    if (
      tag !== "<b>" &&
      tag !== "</b>" &&
      tag !== "</a>" &&
      !/^<a href="https:\/\/etherscan\.io\/(?:address\/0x[0-9a-f]{40}|tx\/0x[0-9a-f]{64}|block\/[0-9]+)">$/.test(
        tag,
      )
    ) {
      throw new Error("alert_catalogue_html_tag_invalid");
    }
  }
  const withoutTags = html.replace(/<[^>]*>/g, "");
  if (/[<>]/.test(withoutTags)) {
    throw new Error("alert_catalogue_html_escape_invalid");
  }
  return html;
}

function yfiSnapshot(value: AlertAccountBlockSnapshot | null): AlertYfiAccountBlockSnapshot {
  if (value?.kind !== "yfi") throw new Error("alert_catalogue_snapshot_invalid");
  return value;
}

function yethSnapshot(
  value: AlertAccountBlockSnapshot | null,
): AlertYethAccountBlockSnapshot {
  if (value?.kind !== "yeth") throw new Error("alert_catalogue_snapshot_invalid");
  return value;
}

function stakingExposure(
  position: AlertYfiAccountBlockSnapshot["styfi"],
): bigint {
  return position.active + position.cooldown.cooling;
}

function stakingRow(
  position: AlertYfiAccountBlockSnapshot["styfi"],
  affected: boolean,
  actionKind?: NormalizedAction["kind"],
): string {
  const { active, cooldown } = position;
  if (active === 0n && cooldown.cooling === 0n && cooldown.withdrawable === 0n) {
    return affected
      ? `${position.symbol}: 0.00 active · 0.00 cooling · position closed`
      : "";
  }
  const parts = [`${formatAmount(active)} active`];
  if (
    cooldown.cooling > 0n ||
    (affected && actionKind !== "staked")
  ) {
    parts.push(`${formatAmount(cooldown.cooling)} cooling`);
  }
  if (
    cooldown.withdrawable > 0n ||
    (affected && actionKind === "withdrew_from_cooldown")
  ) {
    parts.push(`${formatAmount(cooldown.withdrawable)} withdrawable`);
  }
  return `${position.symbol}: ${parts.join(" · ")}`;
}

function lockerRow(position: AlertLiquidLockerPositionSnapshot, affected: boolean): string {
  if (
    position.wallet === 0n &&
    position.activeToken === 0n &&
    position.cooldownToken === 0n &&
    position.withdrawableToken === 0n
  ) {
    return affected ? `${position.symbol}: position closed` : "";
  }
  const parts: string[] = [];
  if (position.wallet > 0n) parts.push(`${formatCompactAmount(position.wallet)} wallet`);
  if (position.activeToken > 0n) {
    parts.push(`${formatCompactAmount(position.activeToken)} active`);
  }
  if (position.cooldownToken > 0n) {
    parts.push(`${formatCompactAmount(position.cooldownToken)} cooling`);
  }
  if (position.withdrawableToken > 0n) {
    parts.push(`${formatCompactAmount(position.withdrawableToken)} withdrawable`);
  }
  return `${position.symbol}: ${parts.join(" · ")}`;
}

function vePositionSummary(snapshot: AlertYfiAccountBlockSnapshot): string {
  const legacy = snapshot.legacyVeyfi;
  const migrated = snapshot.migratedVeyfi;
  if (legacy.amount > 0n && migrated.migrationProven && migrated.amount > 0n) {
    return `veYFI: Legacy ${formatAmount(legacy.amount)} YFI until ${formatDate(
      legacy.unlockTime,
      false,
    )} · Migrated ${formatAmount(migrated.amount)} YFI until ${formatDate(
      migrated.unlockTime,
      false,
    )}`;
  }
  if (legacy.amount > 0n) {
    return `Legacy veYFI: ${formatAmount(legacy.amount)} YFI locked until ${formatDate(
      legacy.unlockTime,
      false,
    )}`;
  }
  if (migrated.migrationProven && migrated.amount > 0n) {
    return `Migrated veYFI: ${formatAmount(migrated.amount)} YFI until ${formatDate(
      migrated.unlockTime,
      false,
    )}`;
  }
  return "";
}

function positionLines(
  action: NormalizedAction,
  snapshot: AlertYfiAccountBlockSnapshot,
): string[] {
  const rows: string[] = [];
  const isStaking = action.tokenSymbol === "stYFI" || action.tokenSymbol === "stYFIx";
  if (isStaking) {
    const affected = action.tokenSymbol === "stYFI" ? snapshot.styfi : snapshot.styfix;
    const other = action.tokenSymbol === "stYFI" ? snapshot.styfix : snapshot.styfi;
    rows.push(stakingRow(affected, true, action.kind));
    const otherRow = stakingRow(other, false);
    if (otherRow !== "") rows.push(otherRow);
    const llyfi = snapshot.liquidLockers.reduce(
      (total, position) => total + position.yfiEquivalent,
      0n,
    );
    if (llyfi > 0n) rows.push(`LLYFI: ${formatAmount(llyfi)} YFI eq.`);
    return rows;
  }

  const locker = snapshot.liquidLockers.find(
    (candidate) => candidate.symbol === action.tokenSymbol,
  );
  if (locker !== undefined) {
    rows.push(lockerRow(locker, true));
    const otherLlyfi = snapshot.liquidLockers
      .filter((candidate) => candidate.symbol !== locker.symbol)
      .reduce((total, position) => total + position.yfiEquivalent, 0n);
    if (otherLlyfi > 0n) {
      rows.push(`Other LLYFI: ${formatAmount(otherLlyfi)} YFI eq.`);
    }
  } else if (action.kind === "migrate") {
    const migrated = snapshot.migratedVeyfi;
    rows.push(
      migrated.migrationProven && migrated.amount > 0n
        ? `Migrated veYFI: ${formatAmount(migrated.amount)} YFI until ${formatDate(
            migrated.unlockTime,
            false,
          )}`
        : "Migrated veYFI: position unavailable",
    );
  } else {
    const legacy = snapshot.legacyVeyfi;
    const migrated = snapshot.migratedVeyfi;
    if (
      action.kind !== "legacy_withdraw" &&
      legacy.amount > 0n &&
      migrated.migrationProven &&
      migrated.amount > 0n
    ) {
      rows.push(vePositionSummary(snapshot));
    } else {
      rows.push(
        legacy.amount === 0n
          ? "Legacy veYFI: position closed"
          : `Legacy veYFI: ${formatAmount(legacy.amount)} YFI locked until ${formatDate(
              legacy.unlockTime,
              false,
            )}`,
      );
      if (
        migrated.migrationProven &&
        migrated.amount > 0n &&
        (action.kind === "legacy_withdraw" || legacy.amount === 0n)
      ) {
        rows.push(
          `Migrated veYFI: ${formatAmount(migrated.amount)} YFI until ${formatDate(
            migrated.unlockTime,
            false,
          )}`,
        );
      }
    }
  }

  if (locker !== undefined) {
    const ve = vePositionSummary(snapshot);
    if (ve !== "") rows.push(ve);
  } else {
    const llyfi = snapshot.liquidLockers.reduce(
      (total, position) => total + position.yfiEquivalent,
      0n,
    );
    if (llyfi > 0n) rows.push(`LLYFI: ${formatAmount(llyfi)} YFI eq.`);
  }
  const stTotal = stakingExposure(snapshot.styfi) + stakingExposure(snapshot.styfix);
  if (stTotal > 0n) rows.push(`stYFI/stYFIx: ${formatAmount(stTotal)} YFI`);
  if (rows.length > 4) throw new Error("alert_catalogue_position_rows_invalid");
  return rows;
}

function cooldownCompletes(
  cooldown: AlertCooldownSnapshot,
): string {
  return cooldown.start > 0n
    ? formatDate(cooldown.start + COOLDOWN_SECONDS, true)
    : "UTC time unavailable";
}

function principalAddress(action: NormalizedAction): string | null {
  return action.principal?.kind === "proven" ? action.principal.address : null;
}

function actorLines(
  action: NormalizedAction,
  ensNames: Readonly<Record<string, string>> | undefined,
): { readonly before: readonly string[]; readonly after: readonly string[] } {
  const principal = principalAddress(action);
  if (principal === null) return { before: [], after: [] };
  const before: string[] = [];
  const after: string[] = [];
  const seen = new Set<string>();
  const add = (target: string[], label: string, address: string): void => {
    const normalized = normalizeAddress(address);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    target.push(`${label}: ${accountLink(normalized, ensNames)}`);
  };
  const caller = action.caller;
  const delegated = caller !== undefined && !sameAddress(caller, principal);
  if (delegated) {
    add(before, "For", principal);
  }
  const withdrawal =
    action.kind === "withdrew_from_cooldown" ||
    action.kind === "yeth_recovery_vault_withdraw";
  if (withdrawal && action.receiver && !sameAddress(action.receiver, principal)) {
    const line = `Received by: ${accountLink(action.receiver, ensNames)}`;
    seen.add(normalizeAddress(action.receiver));
    if (
      action.kind === "withdrew_from_cooldown" &&
      !["stYFI", "stYFIx"].includes(action.tokenSymbol)
    ) {
      after.push(line);
    } else {
      before.push(line);
    }
  }
  if (delegated) {
    add(before, "Sent by", caller);
  }
  return { before, after };
}

function positionSection(
  action: NormalizedAction,
  snapshot: AlertAccountBlockSnapshot | null,
  unavailable: boolean,
  ensNames: Readonly<Record<string, string>> | undefined,
): string[] {
  const principal = principalAddress(action);
  if (unavailable) {
    return principal === null
      ? ["Position after: unavailable"]
      : [
          `Position after · ${accountLink(principal, ensNames)}`,
          "Position data: unavailable",
        ];
  }
  if (principal === null) return ["Position after: unavailable"];
  const lines = [`Position after · ${accountLink(principal, ensNames)}`];
  if (snapshot?.kind === "yfi") return [...lines, ...positionLines(action, snapshot)];
  const yeth = yethSnapshot(snapshot);
  if (action.kind === "yeth_recovery_vault_withdraw" && yeth.recoveryVaultShares === 0n) {
    return [...lines, "Recovery Vault: position closed"];
  }
  const recovery =
    yeth.recoveryVaultShares === 0n && action.kind === "yeth_claimed_exited"
      ? "Recovery Vault: 0.00 yswETH"
      : `Recovery Vault: ${formatAmount(
          yeth.recoveryVaultShares,
        )} yswETH · worth ${formatAmount(yeth.recoveryVaultAssets)} ETH`;
  const unclaimed = `Unclaimed recovery: ${formatAmount(yeth.claimableRecovered)} ETH`;
  return action.kind === "yeth_claimed_exited"
    ? [...lines, unclaimed, recovery]
    : [
        ...lines,
        recovery,
        ...(action.kind === "yeth_claimed_stayed" ? [unclaimed] : []),
      ];
}

function protocolChoices(action: NormalizedAction): string {
  const total = action.amounts.yethTotalSnapshotDebtEth!;
  return `Protocol choices: ${formatHundredths(
    percentHundredths(action.amounts.yethSnapshotStayedEth!, total),
  )}% stayed · ${formatHundredths(
    percentHundredths(action.amounts.yethSnapshotExitedEth!, total),
  )}% exited · ${formatHundredths(
    percentHundredths(action.amounts.yethSnapshotUnclaimedEth!, total),
  )}% unclaimed`;
}

function yfiWhaleImpact(action: NormalizedAction): bigint {
  switch (action.kind) {
    case "staked":
    case "initiated_cooldown":
    case "withdrew_from_cooldown":
      return action.tokenSymbol === "stYFI" || action.tokenSymbol === "stYFIx"
        ? action.amounts.assets!
        : action.amounts.shares!;
    case "exchange":
      return action.amounts.amount!;
    case "redeem": {
      return action.amounts.amount! / lockerScale(action.tokenSymbol);
    }
    case "update":
      return action.amounts.amount! >= action.amounts.previousAmount!
        ? action.amounts.amount! - action.amounts.previousAmount!
        : action.amounts.previousAmount! - action.amounts.amount!;
    case "legacy_withdraw":
      return action.amounts.amount! + action.amounts.penalty!;
    case "migrate":
    case "lock":
      return action.amounts.amount!;
    case "extension":
    case "penalty":
    case "yeth_claimed_stayed":
    case "yeth_claimed_exited":
    case "yeth_recovery_vault_withdraw":
    case "yeth_debt_paid_down":
    case "yeth_recovery_progress":
    case "yeth_recovery_setback":
    case "yeth_yield_capacity_up":
    case "yeth_yield_capacity_down":
      return 0n;
  }
}

function lockerScale(symbol: string): bigint {
  const locker = LIQUID_LOCKERS.find((candidate) => candidate.symbol === symbol);
  if (locker === undefined || locker.scale <= 0n) {
    throw new Error("alert_catalogue_locker_invalid");
  }
  return locker.scale;
}

function isWhale(action: NormalizedAction): boolean {
  if (action.kind === "yeth_claimed_stayed" || action.kind === "yeth_claimed_exited") {
    const total = action.amounts.yethTotalSnapshotDebtEth!;
    return total > 0n && action.amounts.yethSnapshotAmount! * 10n >= total;
  }
  if (action.kind === "yeth_recovery_vault_withdraw") {
    const total = action.amounts.yethTotalSnapshotDebtEth!;
    return total > 0n && action.amounts.yethSnapshotMoved! * 10n >= total;
  }
  return yfiWhaleImpact(action) >= YFI_WHALE_THRESHOLD;
}

function pushDrivers(
  lines: string[],
  drivers: readonly { readonly label: string; readonly value: bigint }[],
): void {
  const nonzero = drivers.filter((driver) => driver.value !== 0n);
  if (nonzero.length === 0) return;
  lines.push("", "Since the previous checkpoint:");
  for (const driver of nonzero) {
    lines.push(`${driver.label}: ${driver.value > 0n ? "+" : ""}${formatAmount(driver.value)} ETH`);
  }
}

function renderActionBody(
  input: AlertCatalogueRenderInput,
): { readonly title: string; readonly lines: readonly string[]; readonly includePosition: boolean } {
  const { action, eventTime, price } = input;
  const amount = action.amounts;
  const symbol = escapeHtml(action.tokenSymbol);
  const lines: string[] = [];
  switch (action.kind) {
    case "staked": {
      if (action.tokenSymbol === "stYFI" || action.tokenSymbol === "stYFIx") {
        lines.push(`Staked: ${formatAmount(amount.assets!)} YFI${formatUsd(amount.assets!, price)}`);
        if (formatAmount(amount.shares!) !== formatAmount(amount.assets!)) {
          lines.push(`Received: ${formatAmount(amount.shares!)} ${symbol}`);
        }
      } else {
        const displayEqual =
          formatAmount(amount.shares!) === formatAmount(amount.assets!);
        lines.push(
          `Staked: ${formatCompactAmount(amount.assets!)} ${symbol}${
            displayEqual ? formatUsd(amount.shares!, price) : ""
          }`,
        );
        if (!displayEqual) {
          lines.push(
            `YFI equivalent: ${formatAmount(amount.shares!)} YFI${formatUsd(amount.shares!, price)}`,
          );
        }
      }
      return { title: `🟢 ${symbol} staked`, lines, includePosition: true };
    }
    case "initiated_cooldown": {
      const isStaking = action.tokenSymbol === "stYFI" || action.tokenSymbol === "stYFIx";
      lines.push(
        `Entered cooldown: ${formatAmount(isStaking ? amount.shares! : amount.assets!)} ${symbol}`,
      );
      if (!isStaking) {
        lines.push(
          `YFI equivalent: ${formatAmount(amount.shares!)} YFI${formatUsd(amount.shares!, price)}`,
        );
      }
      if (input.positionUnavailable === true) {
        if (action.cooldownRestarted) {
          lines.push("Existing cooldown restarted with the new total.");
        }
        return { title: `🧊 ${symbol} cooldown started`, lines, includePosition: true };
      }
      const snapshot = yfiSnapshot(input.snapshot);
      const affected = isStaking
        ? action.tokenSymbol === "stYFI"
          ? snapshot.styfi
          : snapshot.styfix
        : snapshot.liquidLockers.find((candidate) => candidate.symbol === action.tokenSymbol);
      if (affected === undefined) throw new Error("alert_catalogue_snapshot_invalid");
      lines.push(`Total cooling: ${formatAmount(affected.cooldown.cooling)} ${symbol}`);
      lines.push(
        `Withdrawable now: ${formatAmount(affected.cooldown.withdrawable)} ${
          isStaking ? "YFI" : symbol
        }`,
      );
      lines.push(`Stream completes: ${cooldownCompletes(affected.cooldown)}`);
      if (action.cooldownRestarted) {
        lines.push("Existing cooldown restarted with the new total.");
      }
      return { title: `🧊 ${symbol} cooldown started`, lines, includePosition: true };
    }
    case "withdrew_from_cooldown": {
      const isStaking = action.tokenSymbol === "stYFI" || action.tokenSymbol === "stYFIx";
      const displayEqual =
        formatAmount(amount.shares!) === formatAmount(amount.assets!);
      lines.push(
        `Received: ${formatAmount(amount.assets!)} ${isStaking ? "YFI" : symbol}${
          isStaking
            ? formatUsd(amount.assets!, price)
            : displayEqual
              ? formatUsd(amount.shares!, price)
              : ""
        }`,
      );
      if (isStaking) {
        if (formatAmount(amount.shares!) !== formatAmount(amount.assets!)) {
          lines.push(`Burned: ${formatAmount(amount.shares!)} ${symbol}`);
        }
      } else if (!displayEqual) {
        lines.push(
          `YFI equivalent: ${formatAmount(amount.shares!)} YFI${formatUsd(amount.shares!, price)}`,
        );
      }
      return { title: `🏁 ${symbol} cooldown withdrawal`, lines, includePosition: true };
    }
    case "exchange": {
      const scale = lockerScale(action.tokenSymbol);
      const tokenOut = amount.amount! * scale;
      lines.push(`${formatAmount(amount.amount!)} YFI → ${formatCompactAmount(tokenOut)} ${symbol}`);
      if (price.kind === "available") {
        lines.push(`Value: ${formatUsd(amount.amount!, price).slice(2, -1)}`);
      }
      return { title: `🛒 ${symbol} bought`, lines, includePosition: true };
    }
    case "redeem": {
      const scale = lockerScale(action.tokenSymbol);
      const gross = amount.amount! / scale;
      const feeAmount = (gross * amount.fee!) / ONE;
      const net = gross - feeAmount;
      lines.push(
        `${formatCompactAmount(amount.amount!)} ${symbol} → ${formatAmount(net)} YFI${formatUsd(
          net,
          price,
        )}`,
      );
      if (feeAmount > 0n) {
        lines.push(
          `Exit fee: ${formatAmount(feeAmount)} YFI · ${formatHundredths(
            percentHundredths(amount.fee!, ONE),
          )}%`,
        );
      }
      return { title: `💸 ${symbol} redeemed`, lines, includePosition: true };
    }
    case "migrate": {
      const unlock = GENESIS_SECONDS + amount.unlockEpoch! * EPOCH_SECONDS;
      lines.push(`Opted into the new veYFI boost system: ${formatAmount(amount.amount!)} YFI`);
      lines.push(`Unlock: ${formatDate(unlock, true)}`);
      return { title: "🚚 Legacy veYFI migrated", lines, includePosition: true };
    }
    case "lock": {
      lines.push(`Locked: ${formatAmount(amount.amount!)} YFI${formatUsd(amount.amount!, price)}`);
      const duration =
        eventTime.kind === "resolved"
          ? amount.locktime! <= BigInt(eventTime.seconds)
            ? "expired"
            : (() => {
                const days =
                  (amount.locktime! - BigInt(eventTime.seconds) + DAY_SECONDS - 1n) /
                  DAY_SECONDS;
                return `${commaInteger(days)} ${days === 1n ? "day" : "days"}`;
              })()
          : "duration unavailable";
      lines.push(`Unlock: ${formatDate(amount.locktime!, true)} · ${duration}`);
      return { title: "🔐 Legacy veYFI lock created", lines, includePosition: true };
    }
    case "extension": {
      lines.push(`Locked: ${formatAmount(amount.amount!)} YFI`);
      lines.push(
        `Unlock: ${formatDate(amount.previousLocktime!, false)} → ${formatDate(
          amount.locktime!,
          false,
        )}`,
      );
      lines.push(
        `Extension: ${commaInteger((amount.locktime! - amount.previousLocktime!) / DAY_SECONDS)} days`,
      );
      return { title: "🗓️ Legacy veYFI lock extended", lines, includePosition: true };
    }
    case "update": {
      const [before, after] = formatPair(amount.previousAmount!, amount.amount!);
      const amountDelta = amount.amount! - amount.previousAmount!;
      const timeDelta = amount.locktime! - amount.previousLocktime!;
      if (timeDelta < 0n) {
        lines.push(
          amountDelta === 0n
            ? `Locked: ${after} YFI`
            : `Locked: ${before} → ${after} YFI`,
        );
        lines.push(
          `Unlock: ${formatDate(amount.previousLocktime!, false)} → ${formatDate(
            amount.locktime!,
            false,
          )}`,
        );
        return { title: "⚠️ Legacy veYFI unlock shortened", lines, includePosition: true };
      }
      if (amountDelta > 0n && timeDelta === 0n) {
        lines.push(`Locked: ${before} → ${after} YFI`);
        lines.push(`Added: ${formatAmount(amountDelta)} YFI${formatUsd(amountDelta, price)}`);
        lines.push(`Unlock: ${formatDate(amount.locktime!, false)}`);
        return { title: "🔒 Legacy veYFI lock increased", lines, includePosition: true };
      }
      if (amountDelta > 0n && timeDelta > 0n) {
        lines.push(`Locked: ${before} → ${after} YFI · +${formatAmount(amountDelta)}`);
        lines.push(
          `Unlock: ${formatDate(amount.previousLocktime!, false)} → ${formatDate(
            amount.locktime!,
            false,
          )} · +${commaInteger(timeDelta / DAY_SECONDS)} days`,
        );
        return {
          title: "🗓️ Legacy veYFI lock increased and extended",
          lines,
          includePosition: true,
        };
      }
      lines.push(`Locked: ${before} → ${after} YFI`);
      if (timeDelta > 0n) {
        lines.push(
          `Unlock: ${formatDate(amount.previousLocktime!, false)} → ${formatDate(
            amount.locktime!,
            false,
          )}`,
        );
      }
      return { title: "⚠️ Legacy veYFI lock updated", lines, includePosition: true };
    }
    case "legacy_withdraw": {
      lines.push(`Received: ${formatAmount(amount.amount!)} YFI${formatUsd(amount.amount!, price)}`);
      if (amount.penalty! > 0n) {
        const original = amount.amount! + amount.penalty!;
        lines.push(
          `Penalty: ${formatAmount(amount.penalty!)} YFI${formatUsd(
            amount.penalty!,
            price,
          )} · ${formatHundredths(percentHundredths(amount.penalty!, original))}%`,
        );
        lines.push(`Original locked value: ${formatAmount(original)} YFI`);
        return { title: "🏃 Legacy veYFI early exit", lines, includePosition: true };
      }
      return { title: "🏦 Legacy veYFI withdrawn", lines, includePosition: true };
    }
    case "penalty":
      throw new Error("alert_catalogue_suppressed_action_rendered");
    case "yeth_claimed_stayed": {
      lines.push(`Original snapshot claim: ${formatAmount(amount.yethSnapshotAmount!)} ETH`);
      lines.push(
        `Recovered: ${formatAmount(amount.yethUnderlyingAmount!)} ETH · ${formatHundredths(
          percentHundredths(amount.yethUnderlyingAmount!, amount.yethSnapshotAmount!),
        )}%`,
      );
      lines.push("Deposited into the Recovery Vault");
      lines.push(`Received: ${formatAmount(amount.yethClaimShares!)} yswETH`);
      return { title: "🟢 yETH recovery claimed · stayed", lines, includePosition: true };
    }
    case "yeth_claimed_exited": {
      lines.push(`Original snapshot claim: ${formatAmount(amount.yethSnapshotAmount!)} ETH`);
      lines.push(
        `Received now: ${formatAmount(amount.yethUnderlyingAmount!)} ETH · ${formatHundredths(
          percentHundredths(amount.yethUnderlyingAmount!, amount.yethSnapshotAmount!),
        )}%`,
      );
      return { title: "🏁 yETH recovery claimed · exited", lines, includePosition: true };
    }
    case "yeth_recovery_vault_withdraw": {
      lines.push(`Received: ${formatAmount(amount.assets!)} ETH`);
      const burnedSuffix =
        action.yethWithdrawalType === "partial"
          ? ` of ${formatAmount(amount.yethOwnerSharesBefore!)} yswETH`
          : " yswETH";
      lines.push(
        `Burned: ${formatAmount(amount.yethSharesBurned!)}${burnedSuffix} · ${formatHundredths(
          percentHundredths(amount.yethSharesBurned!, amount.yethOwnerSharesBefore!),
        )}%`,
      );
      if (action.yethWithdrawalType === "partial") {
        lines.push(
          `Shares after withdrawal: ${formatAmount(
            amount.yethOwnerSharesAfter!,
          )} yswETH`,
        );
      }
      lines.push(
        `Original snapshot moved to exited: ${formatAmount(amount.yethSnapshotMoved!)} ETH`,
      );
      return {
        title: `💸 yETH Recovery Vault withdrawal · ${action.yethWithdrawalType}`,
        lines,
        includePosition: true,
      };
    }
    case "yeth_debt_paid_down": {
      const delta = amount.yethPreviousOutstandingDebtEth! - amount.yethCurrentOutstandingDebtEth!;
      const recoveredDelta =
        amount.yethCurrentRepaidPercentHundredths! -
        amount.yethPreviousRepaidPercentHundredths!;
      lines.push(`Outstanding recovery debt fell by ${formatAmount(delta)} ETH`);
      lines.push(`Remaining debt: ${formatAmount(amount.yethCurrentOutstandingDebtEth!)} ETH`);
      lines.push(
        `Recovered since snapshot: ${formatHundredths(
          amount.yethCurrentRepaidPercentHundredths!,
        )}%${
          recoveredDelta === 0n
            ? ""
            : ` · ${recoveredDelta > 0n ? "+" : ""}${formatHundredths(
                recoveredDelta,
              )} pts`
        }`,
      );
      return { title: "🟢 yETH recovery debt paid down", lines, includePosition: false };
    }
    case "yeth_recovery_progress":
    case "yeth_recovery_setback": {
      const progress = action.kind === "yeth_recovery_progress";
      const delta = progress
        ? amount.yethPreviousRecoveryShortfallEth! - amount.yethCurrentRecoveryShortfallEth!
        : amount.yethCurrentRecoveryShortfallEth! - amount.yethPreviousRecoveryShortfallEth!;
      lines.push(`Recovery shortfall ${progress ? "narrowed" : "widened"} by ${formatAmount(delta)} ETH`);
      lines.push(
        `${progress ? "Remaining" : "Current"} shortfall: ${formatAmount(
          amount.yethCurrentRecoveryShortfallEth!,
        )} ETH`,
      );
      lines.push(
        coverageLine(
          "Coverage",
          amount.yethPreviousRecoveryCoverageHundredths!,
          amount.yethCurrentRecoveryCoverageHundredths!,
        ),
      );
      const flow = amount.yethRecoveryNetFlowEth!;
      const organic = amount.yethRecoveryOrganicDeltaEth!;
      pushDrivers(lines, [
        { label: flow >= 0n ? "User deposits" : "User withdrawals", value: flow },
        {
          label:
            organic >= 0n
              ? "Yield, fees and donations"
              : "Yield, fees and losses",
          value: organic,
        },
      ]);
      return {
        title: `${progress ? "📈" : "📉"} yETH recovery ${progress ? "progress" : "setback"}`,
        lines,
        includePosition: false,
      };
    }
    case "yeth_yield_capacity_up":
    case "yeth_yield_capacity_down": {
      const up = action.kind === "yeth_yield_capacity_up";
      const delta = up
        ? amount.yethCurrentYieldVaultAssetsEth! - amount.yethPreviousYieldVaultAssetsEth!
        : amount.yethPreviousYieldVaultAssetsEth! - amount.yethCurrentYieldVaultAssetsEth!;
      lines.push(`Yield Vault assets ${up ? "rose" : "fell"} by ${formatAmount(delta)} ETH`);
      lines.push(`Current assets: ${formatAmount(amount.yethCurrentYieldVaultAssetsEth!)} ETH`);
      lines.push(
        coverageLine(
          "Coverage of outstanding recovery debt",
          amount.yethPreviousYieldCoverageHundredths!,
          amount.yethCurrentYieldCoverageHundredths!,
        ),
      );
      lines.push(`Outstanding recovery debt: ${formatAmount(amount.yethOutstandingDebtEth!)} ETH`);
      pushDrivers(lines, [
        { label: "Net claim flow", value: amount.yethYieldNetFlowEth! },
        {
          label:
            amount.yethYieldOrganicDeltaEth! >= 0n
              ? "Yield and other gains"
              : "Yield and other losses",
          value: amount.yethYieldOrganicDeltaEth!,
        },
      ]);
      return {
        title: `${up ? "📈" : "📉"} yETH yield capacity ${up ? "increased" : "decreased"}`,
        lines,
        includePosition: false,
      };
    }
  }
}

export function renderAlertCatalogueAction(input: AlertCatalogueRenderInput): string {
  validateEvidence(input);
  const rendered = renderActionBody(input);
  const actors = actorLines(input.action, input.ensNamesByAddress);
  const lines: string[] = [];
  if (isWhale(input.action)) lines.push("🚨 <b>WHALE MOVE</b>");
  lines.push(`<b>${rendered.title}</b>`, "", ...rendered.lines);
  if (actors.before.length > 0) lines.push("", ...actors.before);
  if (rendered.includePosition) {
    lines.push(
      "",
      ...positionSection(
        input.action,
        input.snapshot,
        input.positionUnavailable === true,
        input.ensNamesByAddress,
      ),
    );
    if (
      input.action.kind === "yeth_claimed_stayed" ||
      input.action.kind === "yeth_claimed_exited" ||
      input.action.kind === "yeth_recovery_vault_withdraw"
    ) {
      lines.push("", protocolChoices(input.action));
    }
  }
  if (actors.after.length > 0) lines.push("", ...actors.after);
  if (input.coveFacility !== undefined && input.coveFacility !== null) {
    if (
      !isCoveFacilityAction(input.action) ||
      input.coveFacility.blockNumber !== input.action.blockNumber ||
      input.coveFacility.blockHash.toLowerCase() !==
        input.eventTime.blockHash.toLowerCase()
    ) {
      throw new Error("alert_catalogue_facility_identity_invalid");
    }
    if (input.coveFacility.kind === "available") {
      lines.push(
        "",
        `Facility after: ${formatAmount(input.coveFacility.yfiBalance)} YFI · ${formatAmount(
          input.coveFacility.coveYfiBalance,
        )} coveYFI`,
      );
    }
  }
  lines.push("", footer(input.action, input.eventTime));
  return validateTelegramHtml(lines.join("\n"));
}

export function assertAlertCatalogueIntroductionHtml(): void {
  for (const html of Object.values(ALERT_CATALOGUE_INTRODUCTIONS)) {
    validateTelegramHtml(html);
  }
}
