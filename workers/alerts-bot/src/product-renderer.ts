import type { AlertEventTimeEvidence } from "./evidence";
import { isSafeAlertEnsName } from "./account-block-context";
import type {
  AlertTokenAmount,
  ProductAlertAction,
  ProposalType,
  TeamPeriodFinancials,
} from "./product-types";

const ETHERSCAN = "https://etherscan.io";
const TEAMS_UI = "https://teams.yearn.fi/";
const YBC_UI = "https://ybc.yearn.fi/";
const YFI_SCALE = 10n ** 18n;
const MAX_HTML_LENGTH = 4_096;
const YFI_WHALE_THRESHOLD = 40n * YFI_SCALE;

export const PRODUCT_ALERT_INTRODUCTIONS = Object.freeze({
  teams:
    "<b>Yearn Teams activity</b>\n\n" +
    "This channel tracks team lifecycle, revenue, funding, bonus claims, accounting corrections, and revenue allocation on Ethereum.\n\n" +
    "Financial and team state is shown at the end of each event's confirmed block. " +
    "Historical messages were replayed from the Teams deployment block using the same rules as live alerts.",
  ybc:
    "<b>YBC governance activity</b>\n\n" +
    "This channel tracks membership proposals, votes, executions, member changes, rewards, bonus receipts, configuration changes, and collective voting power on Ethereum.\n\n" +
    "Proposal results use only the voting weight cast on that proposal. " +
    "Collective voting power is context, not quorum. " +
    "Historical messages were replayed from the YBC deployment block using the same rules as live alerts.",
} as const);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function address(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("product_alert_address_invalid");
  }
  return normalized;
}

function shortAddress(value: string): string {
  const normalized = address(value);
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

function resolvedAddressLink(
  value: string,
  ensNamesByAddress: Readonly<Record<string, string>> | undefined,
): string {
  const normalized = address(value);
  const resolved = ensNamesByAddress?.[normalized];
  const label = resolved !== undefined && isSafeAlertEnsName(resolved)
    ? escapeHtml(resolved)
    : shortAddress(normalized);
  return `<a href="${ETHERSCAN}/address/${normalized}">${label}</a>`;
}

function commaInteger(value: bigint | number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function scaled(value: bigint, decimals: number, requestedDecimals?: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const displayDecimals = requestedDecimals ?? (absolute > 0n && absolute < unit / 100n ? 4 : 2);
  const displayScale = 10n ** BigInt(displayDecimals);
  const rounded = (absolute * displayScale + unit / 2n) / unit;
  const whole = rounded / displayScale;
  const fraction = (rounded % displayScale)
    .toString()
    .padStart(displayDecimals, "0");
  if (absolute > 0n && rounded === 0n) {
    return `${negative ? "-" : ""}&lt;${`0.${"0".repeat(displayDecimals - 1)}1`}`;
  }
  return `${negative ? "-" : ""}${commaInteger(whole)}.${fraction}`;
}

function amount(value: bigint): string {
  return scaled(value, 18);
}

function amountPair(left: bigint, right: bigint): readonly [string, string] {
  for (let decimals = 2; decimals <= 18; decimals += 1) {
    const before = scaled(left, 18, decimals);
    const after = scaled(right, 18, decimals);
    if (left === right || before !== after) return [before, after];
  }
  return [scaled(left, 18, 18), scaled(right, 18, 18)];
}

function tokenAmount(value: AlertTokenAmount): string {
  if (value.symbol === null || value.decimals === null) {
    return `${commaInteger(value.value)} base units · token ${resolvedAddressLink(value.token, undefined)}`;
  }
  return `${scaled(value.value, value.decimals)} ${escapeHtml(value.symbol)}`;
}

function usd(value: bigint): string {
  return `$${scaled(value, 18)}`;
}

function percentageBps(value: bigint): string {
  return `${scaled(value, 2, 2)}%`;
}

function ratioBps(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  return (numerator * 10_000n + denominator / 2n) / denominator;
}

function timingRatio(numerator: bigint, denominator: bigint): string {
  const basisPoints = ratioBps(numerator, denominator);
  return numerator > 0n && denominator > 0n && basisPoints === 0n
    ? "&lt;0.01%"
    : percentageBps(basisPoints);
}

function formatDate(seconds: bigint, includeTime: boolean): string {
  if (seconds < 0n || seconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("product_alert_time_invalid");
  }
  const date = new Date(Number(seconds) * 1_000);
  if (Number.isNaN(date.getTime())) throw new Error("product_alert_time_invalid");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][date.getUTCMonth()]!;
  const datePart = `${day} ${month} ${date.getUTCFullYear()}`;
  if (!includeTime) return datePart;
  const hour = date.getUTCHours().toString().padStart(2, "0");
  const minute = date.getUTCMinutes().toString().padStart(2, "0");
  return `${datePart}, ${hour}:${minute} UTC`;
}

function teamLink(team: string, section: string, label: string): string {
  const url = `${TEAMS_UI}?section=${encodeURIComponent(section)}&team=${address(team)}`;
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

function teamsDirectoryLink(): string {
  return `<a href="${TEAMS_UI}">View current Teams directory</a>`;
}

function ybcLink(hash: "overview" | "members" | "rewards", label: string): string {
  return `<a href="${YBC_UI}#${hash}">${escapeHtml(label)}</a>`;
}

function proposalLink(proposalId: bigint): string {
  const url = `${YBC_UI}?proposal=${proposalId.toString()}#proposals`;
  return `<a href="${escapeHtml(url)}">View current proposal status</a>`;
}

function proposalLabel(proposalId: bigint, proposalType: ProposalType): string {
  return `YBC-${proposalId.toString()} · ${proposalType === "addition" ? "Add member" : "Remove member"}`;
}

function periods(values: readonly bigint[]): string {
  if (values.length === 0) throw new Error("product_alert_periods_empty");
  const sorted = [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const contiguous = sorted.every((value, index) => index === 0 || value === sorted[index - 1]! + 1n);
  return contiguous && sorted.length > 1
    ? `#${sorted[0]}–#${sorted.at(-1)}`
    : sorted.map((value) => `#${value}`).join(", ");
}

function financialResult(financials: TeamPeriodFinancials): string {
  const delta = financials.revenue - financials.cost;
  return delta >= 0n ? `${usd(delta)} profit` : `${usd(-delta)} loss`;
}

function footer(action: ProductAlertAction, eventTime: AlertEventTimeEvidence): string {
  if (
    eventTime.kind !== "resolved" ||
    eventTime.blockNumber !== action.blockNumber ||
    (action.source.kind === "synthetic" &&
      action.source.blockHash.toLowerCase() !== eventTime.blockHash.toLowerCase())
  ) {
    throw new Error("product_alert_evidence_invalid");
  }
  const blockLink = `<a href="${ETHERSCAN}/block/${action.blockNumber}">Block ${commaInteger(action.blockNumber)}</a>`;
  const time = formatDate(BigInt(eventTime.seconds), true);
  if (action.source.kind === "synthetic") return `${blockLink} · ${time}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(action.txHash)) {
    throw new Error("product_alert_transaction_invalid");
  }
  return `<a href="${ETHERSCAN}/tx/${action.txHash.toLowerCase()}">Tx</a> · ${blockLink} · ${time}`;
}

interface Body {
  readonly title: string;
  readonly lines: readonly string[];
  readonly link?: string;
  readonly whale?: boolean;
}

function renderBody(
  action: ProductAlertAction,
  ensNamesByAddress: Readonly<Record<string, string>> | undefined,
): Body {
  const addressLink = (value: string) =>
    resolvedAddressLink(value, ensNamesByAddress);
  switch (action.kind) {
    case "team_added": {
      const d = action.details;
      return { title: "🏢 Team added", lines: [
        `Team: ${escapeHtml(d.teamName)}`,
        `Team contract: ${addressLink(d.team)}`,
        `Team index: #${d.teamIndex}`,
        `Owner: ${addressLink(d.owner)}`,
        `Current period: #${d.currentPeriod}`,
      ], link: teamLink(d.team, "overview", "View current team overview") };
    }
    case "team_retirement_scheduled": {
      const d = action.details;
      return { title: "🕰️ Team retirement scheduled", lines: [
        `Team: ${escapeHtml(d.teamName)}`,
        `Current period: #${d.currentPeriod}`,
        `Effective retirement: Period #${d.retirementPeriod} · ${formatDate(d.retirementTime, false)}`,
        `Current status: Active through period #${d.retirementPeriod - 1n}`,
      ], link: teamLink(d.team, "lifecycle", "View current team lifecycle") };
    }
    case "teams_registry_deprecated": {
      const d = action.details;
      return { title: "🔁 Teams registry deprecated", lines: [
        `Registry: ${addressLink(d.registry)}`,
        `Successor: ${addressLink(d.successor)}`,
        `Registered teams: ${commaInteger(d.teamCount)}`,
      ], link: teamsDirectoryLink() };
    }
    case "team_migrated": {
      const d = action.details;
      return { title: "🔁 Team migrated", lines: [
        `Team: ${escapeHtml(d.teamName)}`,
        `Registry: ${addressLink(d.previousRegistry)} → ${addressLink(d.currentRegistry)}`,
      ], link: teamLink(d.team, "lifecycle", "View current team lifecycle") };
    }
    case "team_owner_pending": {
      const d = action.details;
      return { title: "🔐 Team ownership transfer started", lines: [
        `Team: ${escapeHtml(d.teamName)}`,
        `Current owner: ${addressLink(d.currentOwner)}`,
        `Pending owner: ${addressLink(d.pendingOwner)}`,
      ], link: teamLink(d.team, "lifecycle", "View current team lifecycle") };
    }
    case "team_owner_set": {
      const d = action.details;
      return { title: "🔐 Team ownership transferred", lines: [
        `Team: ${escapeHtml(d.teamName)}`,
        `Owner: ${addressLink(d.previousOwner)} → ${addressLink(d.currentOwner)}`,
      ], link: teamLink(d.team, "lifecycle", "View current team lifecycle") };
    }
    case "team_revenue_deposited": {
      const d = action.details;
      return { title: "💵 Team revenue deposited", lines: [
        `Team: ${escapeHtml(d.teamName)}`,
        `Deposited: ${tokenAmount(d.deposited)}`,
        `Credited revenue: ${usd(d.revenueUsd)}`,
        `Deposited by: ${addressLink(d.depositor)}`,
        `Period: #${d.period}`,
        `Period #${d.period} after: ${usd(d.financialsAfter.revenue)} revenue · ${usd(d.financialsAfter.cost)} cost · ${financialResult(d.financialsAfter)}`,
      ], link: teamLink(d.team, "revenue", "View current team revenue") };
    }
    case "team_funding_approved": {
      const d = action.details;
      const days = (d.vestingDurationSeconds + 86_399n) / 86_400n;
      return { title: "📋 Team funding approved", lines: [
        `Approval: #${d.approvalId}`,
        `Team: ${escapeHtml(d.teamName)}`,
        `Funding: ${tokenAmount(d.funding)}`,
        `Period: #${d.period}`,
        `Vesting: ${commaInteger(days)} ${days === 1n ? "day" : "days"} from period start`,
        `Claim window: ${formatDate(d.claimStartsAt, false)} → ${formatDate(d.claimEndsAt, false)}`,
      ], link: teamLink(d.team, "funding", "View current team funding") };
    }
    case "team_funding_claimed": {
      const d = action.details;
      return { title: "💸 Team funding claimed", lines: [
        `Approval: #${d.approvalId}`,
        `Team: ${escapeHtml(d.teamName)}`,
        `Claimed: ${tokenAmount(d.claimed)}`,
        `Recorded cost: ${usd(d.costUsd)}`,
        `Recipient: ${addressLink(d.recipient)}`,
        `Delivery: ${/^0x0{40}$/i.test(d.vest) ? "Direct transfer" : `Vesting contract ${addressLink(d.vest)}`}`,
        `Remaining approval: ${tokenAmount(d.remaining)}`,
      ], link: teamLink(d.team, "funding", "View current team funding") };
    }
    case "team_funding_returned": {
      const d = action.details;
      return { title: "↩️ Team funding returned", lines: [
        `Approval: #${d.approvalId}`,
        `Team: ${escapeHtml(d.teamName)}`,
        `Returned: ${tokenAmount(d.returned)}`,
        `Recorded cost reduced: ${usd(d.refundUsd)}`,
        `Returned by: ${addressLink(d.sender)}`,
        `Used after: ${tokenAmount(d.usedAfter)}`,
      ], link: teamLink(d.team, "funding", "View current team funding") };
    }
    case "team_bonus_claimed": {
      const d = action.details;
      return { title: "🎁 Team bonus claimed", whale: d.gross >= YFI_WHALE_THRESHOLD, lines: [
        `Team: ${escapeHtml(d.teamName)}`,
        `Periods: ${periods(d.periods)}`,
        `Gross bonus: ${amount(d.gross)} YFI`,
        `Team received: ${amount(d.teamAmount)} YFI`,
        `YBC share: ${amount(d.ybcAmount)} YFI`,
        `Recipient: ${addressLink(d.recipient)}`,
      ], link: teamLink(d.team, "bonus", "View current team bonus history") };
    }
    case "team_revenue_adjusted":
    case "team_cost_adjusted": {
      const d = action.details;
      const revenue = action.kind === "team_revenue_adjusted";
      return { title: `🧾 Team ${revenue ? "revenue" : "cost"} accounting adjusted`, lines: [
        `Team: ${escapeHtml(d.teamName)}`,
        `Adjustment: ${d.increment ? "+" : "-"}${usd(d.amountUsd)}`,
        `Adjusted by: ${addressLink(d.operator)}`,
        `Period: #${d.period}`,
        `${revenue ? "Revenue" : "Cost"} after: ${usd(revenue ? d.financialsAfter.revenue : d.financialsAfter.cost)}`,
        `Period result after: ${financialResult(d.financialsAfter)}`,
      ], link: teamLink(d.team, "overview", "View current team overview") };
    }
    case "team_revenue_to_rewards": {
      const d = action.details;
      return { title: "💰 Revenue sent to stYFI rewards", lines: [
        `Allocated: ${tokenAmount(d.amount)}`,
        `Reward epoch: #${d.rewardEpoch}`,
        `Rewards bucket used after: ${tokenAmount(d.usedAfter)}`,
      ] };
    }
    case "team_revenue_to_treasury": {
      const d = action.details;
      return { title: "🏛️ Revenue sent to treasury", lines: [
        `Sent: ${tokenAmount(d.amount)}`,
        `Treasury: ${addressLink(d.treasury)}`,
        `Treasury bucket used after: ${tokenAmount(d.usedAfter)}`,
      ] };
    }
    case "team_revenue_to_recovery": {
      const d = action.details;
      return { title: "🛟 Revenue sent to yETH recovery", lines: [
        `Sent: ${tokenAmount(d.amount)}`,
        `Recovery auction: ${addressLink(d.recoveryAuction)}`,
        "Auction: Started",
        `Recovery bucket used after: ${tokenAmount(d.usedAfter)}`,
      ] };
    }
    case "ybc_proposal_opened": {
      const d = action.details;
      return { title: "🗳️ YBC proposal opened", lines: [
        proposalLabel(d.proposalId, d.proposalType),
        `${d.proposalType === "addition" ? "Candidate" : "Member"}: ${addressLink(d.target)}`,
        `Proposed by: ${addressLink(d.proposer)}`,
        `Voting: ${formatDate(d.votingStartsAt, true)} → ${formatDate(d.votingEndsAt, true)}`,
        `Pass threshold: ${percentageBps(d.thresholdBps)} of weight cast`,
      ], link: proposalLink(d.proposalId) };
    }
    case "ybc_proposal_retracted": {
      const d = action.details;
      return { title: "↩️ YBC proposal retracted", lines: [
        proposalLabel(d.proposalId, d.proposalType),
        `${d.proposalType === "addition" ? "Candidate" : "Member"}: ${addressLink(d.target)}`,
        `Retracted by: ${addressLink(d.retractor)}`,
      ], link: proposalLink(d.proposalId) };
    }
    case "ybc_vote_cast": {
      const d = action.details;
      const support = ratioBps(d.yeaWeight, d.totalWeight);
      const passing = d.totalWeight > 0n &&
        d.yeaWeight * 10_000n >= d.totalWeight * d.thresholdBps;
      const lines = [
        proposalLabel(d.proposalId, d.proposalType),
        `Vote: ${d.yea ? "Yea" : "Nay"}`,
        `Voter: ${addressLink(d.voter)}`,
        `Counted weight: ${amount(d.countedWeight)} YFI`,
        `Result now: ${amount(d.yeaWeight)} / ${amount(d.totalWeight)} YFI cast · ${percentageBps(support)} yea`,
        `Threshold: ${percentageBps(d.thresholdBps)} · Currently ${passing ? "passing" : "failing"}`,
        `Participation: ${commaInteger(d.uniqueVoters)} unique voters · ${commaInteger(d.eligibleMembers)} eligible members`,
      ];
      if (d.baseWeight !== d.countedWeight) {
        lines.push(
          "",
          `Timing adjustment: ${timingRatio(d.countedWeight, d.baseWeight)} of current weight counted due to final-day decay`,
        );
      }
      return { title: "🗳️ YBC vote cast", lines, link: proposalLink(d.proposalId) };
    }
    case "ybc_proposal_executed": {
      const d = action.details;
      return { title: "✅ YBC proposal executed", lines: [
        proposalLabel(d.proposalId, d.proposalType),
        `Member ${d.proposalType === "addition" ? "added" : "removed"}: ${addressLink(d.member)}`,
        `Executed by: ${addressLink(d.executor)}`,
        `Final result: ${amount(d.yeaWeight)} / ${amount(d.totalWeight)} YFI cast · ${percentageBps(ratioBps(d.yeaWeight, d.totalWeight))} yea`,
        `Collective voting power after: ${amount(d.collectivePowerAfter)} YFI`,
        `Active members: ${commaInteger(d.activeMembers)}`,
      ], link: proposalLink(d.proposalId) };
    }
    case "ybc_member_added":
    case "ybc_member_removed": {
      const d = action.details;
      const added = action.kind === "ybc_member_added";
      const [before, after] = amountPair(d.collectivePowerBefore, d.collectivePowerAfter);
      return { title: `👤 YBC member ${added ? "added" : "removed"}`, lines: [
        `Member: ${addressLink(d.member)}`,
        `Changed by: ${addressLink(d.operator)}`,
        `Collective voting power: ${before} → ${after} YFI`,
        `Active members: ${commaInteger(d.activeMembers)}`,
      ], link: ybcLink("members", "View current YBC members") };
    }
    case "ybc_rewards_claimed": {
      const d = action.details;
      return { title: "💰 YBC rewards claimed", lines: [
        `Rewards attributed: ${tokenAmount(d.rewards)}`,
        `For: ${addressLink(d.account)}`,
        `Claim route: ${escapeHtml(d.claimRoute)}`,
      ], link: ybcLink("rewards", "View current YBC rewards") };
    }
    case "ybc_team_bonus_received": {
      const d = action.details;
      return { title: "🎁 YBC team bonus received", lines: [
        `Staked for YBC: ${amount(d.amount)} YFI`,
        `Source team: ${escapeHtml(d.sourceTeamName)} · ${addressLink(d.sourceTeam)}`,
        `Periods: ${periods(d.periods)}`,
      ], link: ybcLink("rewards", "View current YBC rewards") };
    }
    case "ybc_thresholds_changed": {
      const d = action.details;
      return { title: "⚙️ YBC vote thresholds changed", lines: [
        `Addition threshold: ${percentageBps(d.previousAdditionBps)} → ${percentageBps(d.currentAdditionBps)}`,
        `Expulsion threshold: ${percentageBps(d.previousExpulsionBps)} → ${percentageBps(d.currentExpulsionBps)}`,
        `Changed by: ${addressLink(d.actor)}`,
      ] };
    }
    case "ybc_operator_changed": {
      const d = action.details;
      return { title: `🔐 YBC operator ${d.enabled ? "added" : "removed"}`, lines: [
        `Operator: ${addressLink(d.operator)}`,
        `Status: ${d.enabled ? "Authorized" : "Removed"}`,
        `Changed by: ${addressLink(d.actor)}`,
      ] };
    }
    case "ybc_hooks_changed": {
      const d = action.details;
      return { title: "⚙️ YBC membership hooks changed", lines: [
        `Membership hook: ${addressLink(d.previousHooks)} → ${addressLink(d.currentHooks)}`,
        `Changed by: ${addressLink(d.actor)}`,
      ] };
    }
    case "ybc_rewards_stopped": {
      const d = action.details;
      return { title: "🚨 YBC reward distribution stopped", lines: [
        `Stopped by: ${addressLink(d.actor)}`,
        "New reward accrual: Disabled",
        `Accrued claims: ${d.accruedClaimsRemainClaimable ? "Still claimable" : "Unavailable"}`,
      ] };
    }
    case "ybc_unrecognized_call": {
      const d = action.details;
      return { title: "🚨 Unrecognized YBC operator call", lines: [
        `Operator: ${addressLink(d.operator)}`,
        `Target: ${addressLink(d.target)}`,
        `Function selector: ${escapeHtml(d.selector)}`,
      ] };
    }
    case "ybc_collective_power_changed": {
      const d = action.details;
      const [before, after] = amountPair(d.previousPower, d.currentPower);
      const delta = d.currentPower - d.previousPower;
      return { title: "⚖️ YBC collective voting power changed", lines: [
        `Total: ${before} → ${after} YFI`,
        `Change: ${delta >= 0n ? "+" : "-"}${amount(delta >= 0n ? delta : -delta)} YFI`,
        `Cause: ${d.cause === "epoch weight ramp" ? "Epoch weight ramp" : d.cause === "weight configuration changed" ? "Weight configuration changed" : "Member stake changed"}`,
      ], link: ybcLink("overview", "View current YBC overview") };
    }
  }
}

function validateHtml(html: string): string {
  if (html.length > MAX_HTML_LENGTH) throw new Error("product_alert_too_long");
  if (/<(?!\/?(?:a|b)(?:\s|>|\/))/i.test(html)) {
    throw new Error("product_alert_html_tag_invalid");
  }
  return html;
}

export function renderProductAlertAction(
  action: ProductAlertAction,
  eventTime: AlertEventTimeEvidence,
  ensNamesByAddress?: Readonly<Record<string, string>>,
): string {
  const body = renderBody(action, ensNamesByAddress);
  const lines: string[] = [];
  if (body.whale === true) lines.push("🚨 <b>WHALE MOVE</b>");
  lines.push(`<b>${body.title}</b>`, "", ...body.lines);
  if (body.link !== undefined) lines.push("", body.link);
  lines.push("", footer(action, eventTime));
  return validateHtml(lines.join("\n"));
}

export function assertProductAlertIntroductionHtml(): void {
  Object.values(PRODUCT_ALERT_INTRODUCTIONS).forEach(validateHtml);
}
