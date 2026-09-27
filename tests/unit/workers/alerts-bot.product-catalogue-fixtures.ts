import type { AlertEventTimeEvidence } from "@/workers/alerts-bot/src/evidence";
import { renderProductAlertAction } from "@/workers/alerts-bot/src/product-renderer";
import type {
  ProductAlertAction,
  ProductAlertDetailsFor,
  ProductAlertKind,
} from "@/workers/alerts-bot/src/product-types";

export const PRODUCT_CATALOGUE_BLOCK_NUMBER = 25_500_000;
export const PRODUCT_CATALOGUE_BLOCK_HASH = `0x${"b".repeat(64)}`;
export const PRODUCT_CATALOGUE_TX_HASH = `0x${"a".repeat(64)}`;
export const PRODUCT_CATALOGUE_EVENT_TIME: AlertEventTimeEvidence = Object.freeze({
  kind: "resolved",
  blockNumber: PRODUCT_CATALOGUE_BLOCK_NUMBER,
  blockHash: PRODUCT_CATALOGUE_BLOCK_HASH,
  seconds: 1_790_100_000,
});

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const WAD = 10n ** 18n;
const token = (value = WAD) => ({ token: A, symbol: "YFI", decimals: 18, value });
const financialsAfter = { revenue: 12n * WAD, cost: 5n * WAD };

export const PRODUCT_ALERT_DETAILS = {
  team_added: { team: A, teamName: "Frontend & Tools", teamIndex: 2n, owner: B, currentPeriod: 4n },
  team_retirement_scheduled: { team: A, teamName: "Frontend & Tools", currentPeriod: 4n, retirementPeriod: 5n, retirementTime: 1_800_000_000n },
  teams_registry_deprecated: { registry: A, successor: B, teamCount: 7n },
  team_migrated: { team: A, teamName: "Frontend & Tools", previousRegistry: B, currentRegistry: C },
  team_owner_pending: { team: A, teamName: "Frontend & Tools", currentOwner: B, pendingOwner: C },
  team_owner_set: { team: A, teamName: "Frontend & Tools", previousOwner: B, currentOwner: C },
  team_revenue_deposited: { team: A, teamName: "Frontend & Tools", deposited: token(3n * WAD), revenueUsd: 9n * WAD, depositor: B, period: 4n, financialsAfter },
  team_funding_approved: { approvalId: 3n, team: A, teamName: "Frontend & Tools", funding: token(10n * WAD), period: 4n, vestingDurationSeconds: 604_800n, claimStartsAt: 1_790_000_000n, claimEndsAt: 1_790_604_800n },
  team_funding_claimed: { approvalId: 3n, team: A, teamName: "Frontend & Tools", claimed: token(2n * WAD), costUsd: 4n * WAD, recipient: B, vest: C, remaining: token(8n * WAD) },
  team_funding_returned: { approvalId: 3n, team: A, teamName: "Frontend & Tools", returned: token(2n * WAD), refundUsd: 4n * WAD, sender: B, usedAfter: token(3n * WAD) },
  team_bonus_claimed: { team: A, teamName: "Frontend & Tools", periods: [2n, 3n], gross: 50n * WAD, teamAmount: 45n * WAD, ybcAmount: 5n * WAD, recipient: B },
  team_revenue_adjusted: { team: A, teamName: "Frontend & Tools", operator: B, period: 4n, amountUsd: WAD, increment: true, financialsAfter },
  team_cost_adjusted: { team: A, teamName: "Frontend & Tools", operator: B, period: 4n, amountUsd: WAD, increment: false, financialsAfter },
  team_revenue_to_rewards: { amount: token(2n * WAD), rewardEpoch: 8n, usedAfter: token(12n * WAD) },
  team_revenue_to_treasury: { amount: token(2n * WAD), treasury: B, usedAfter: token(12n * WAD) },
  team_revenue_to_recovery: { amount: token(2n * WAD), recoveryAuction: B, usedAfter: token(12n * WAD) },
  ybc_proposal_opened: { proposalId: 12n, proposalType: "addition", target: A, proposer: B, votingStartsAt: 1_790_000_000n, votingEndsAt: 1_790_604_800n, thresholdBps: 6_000n },
  ybc_proposal_retracted: { proposalId: 12n, proposalType: "addition", target: A, retractor: B },
  ybc_vote_cast: { proposalId: 12n, proposalType: "addition", yea: true, voter: B, countedWeight: 8n * WAD, baseWeight: 10n * WAD, yeaWeight: 8n * WAD, totalWeight: 10n * WAD, thresholdBps: 6_000n, uniqueVoters: 2, eligibleMembers: 5 },
  ybc_proposal_executed: { proposalId: 12n, proposalType: "addition", member: A, executor: B, yeaWeight: 8n * WAD, totalWeight: 10n * WAD, collectivePowerAfter: 100n * WAD, activeMembers: 6 },
  ybc_member_added: { member: A, operator: B, collectivePowerBefore: 90n * WAD, collectivePowerAfter: 100n * WAD, activeMembers: 6 },
  ybc_member_removed: { member: A, operator: B, collectivePowerBefore: 100n * WAD, collectivePowerAfter: 90n * WAD, activeMembers: 5 },
  ybc_rewards_claimed: { account: A, rewards: token(2n * WAD), claimRoute: "YBC reward claimer" },
  ybc_team_bonus_received: { amount: 5n * WAD, sourceTeam: A, sourceTeamName: "Frontend & Tools", periods: [2n, 3n] },
  ybc_thresholds_changed: { previousAdditionBps: 5_000n, currentAdditionBps: 6_000n, previousExpulsionBps: 6_000n, currentExpulsionBps: 7_000n, actor: B },
  ybc_operator_changed: { operator: A, enabled: true, actor: B },
  ybc_hooks_changed: { previousHooks: A, currentHooks: B, actor: C },
  ybc_rewards_stopped: { actor: A, accruedClaimsRemainClaimable: true },
  ybc_unrecognized_call: { operator: A, target: B, selector: "0x12345678" },
  ybc_collective_power_changed: { previousPower: 90n * WAD, currentPower: 100n * WAD, cause: "member stake changed" },
} as const satisfies { readonly [K in ProductAlertKind]: ProductAlertDetailsFor<K> };

const TEMPLATE_BY_KIND = {
  team_added: "T1",
  team_retirement_scheduled: "T2",
  teams_registry_deprecated: "T3",
  team_migrated: "T4",
  team_owner_pending: "T5",
  team_owner_set: "T6",
  team_revenue_deposited: "T7",
  team_funding_approved: "T8",
  team_funding_claimed: "T9",
  team_funding_returned: "T10",
  team_bonus_claimed: "T11",
  team_revenue_adjusted: "T12",
  team_cost_adjusted: "T13",
  team_revenue_to_rewards: "T14",
  team_revenue_to_treasury: "T15",
  team_revenue_to_recovery: "T16",
  ybc_proposal_opened: "B1",
  ybc_proposal_retracted: "B2",
  ybc_vote_cast: "B3",
  ybc_proposal_executed: "B4",
  ybc_member_added: "B5",
  ybc_member_removed: "B6",
  ybc_rewards_claimed: "B7",
  ybc_team_bonus_received: "B8",
  ybc_thresholds_changed: "B9",
  ybc_operator_changed: "B10",
  ybc_hooks_changed: "B11",
  ybc_rewards_stopped: "B12",
  ybc_unrecognized_call: "B13",
  ybc_collective_power_changed: "B14",
} as const satisfies Record<ProductAlertKind, string>;

export interface ProductAlertCatalogueFixture {
  readonly template: string;
  readonly kind: ProductAlertKind;
  readonly action: ProductAlertAction;
}

export const PRODUCT_ALERT_CATALOGUE_FIXTURES: readonly ProductAlertCatalogueFixture[] =
  Object.freeze((Object.keys(PRODUCT_ALERT_DETAILS) as ProductAlertKind[]).map((kind, index) => ({
    template: TEMPLATE_BY_KIND[kind],
    kind,
    action: {
      domainId: kind.startsWith("team") ? "teams" : "ybc",
      kind,
      details: PRODUCT_ALERT_DETAILS[kind],
      eventId: `${PRODUCT_CATALOGUE_TX_HASH}:${index}:${kind}`,
      txHash: PRODUCT_CATALOGUE_TX_HASH,
      blockNumber: PRODUCT_CATALOGUE_BLOCK_NUMBER,
      logIndex: index,
      source: { kind: "onchain", txHash: PRODUCT_CATALOGUE_TX_HASH, logIndex: index },
    } as ProductAlertAction,
  })));

export function renderProductAlertFixture(fixture: ProductAlertCatalogueFixture): string {
  return renderProductAlertAction(fixture.action, PRODUCT_CATALOGUE_EVENT_TIME);
}
