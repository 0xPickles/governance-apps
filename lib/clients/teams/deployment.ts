import type { Address } from "viem";
import type { TeamsFeed } from "@/lib/schemas/teams-feed";
import { MAINNET_CHAIN_ID } from "@/lib/tx/network";
import deployment from "@/lib/deployment.json";

export const TEAMS_MAINNET_DEPLOYMENT = {
  budgetGenesis: deployment.TEAMS.BUDGET_GENESIS,
  budgetPeriodLengthSeconds: deployment.TEAMS.PERIOD_LENGTH_SECONDS,
  deployBlock: deployment.TEAMS.DEPLOY_BLOCK,
  teamRegistry: deployment.TEAMS.TEAM_REGISTRY as Address,
  teamImplementation: deployment.TEAMS.TEAM_IMPLEMENTATION as Address,
  teamAccountant: deployment.TEAMS.TEAM_ACCOUNTANT as Address,
  revenueRecipient: deployment.TEAMS.REVENUE_RECIPIENT as Address,
  revenuePriceOracle: deployment.TEAMS.REVENUE_PRICE_ORACLE as Address,
  fundingDistributor: deployment.TEAMS.FUNDING_DISTRIBUTOR as Address,
  // Mainnet getters at block 25,612,604; provenance is recorded in the Teams README.
  fundingVestingFactory: deployment.TEAMS.FUNDING_VESTING_FACTORY as Address,
  fundingVestingOwner: deployment.TEAMS.FUNDING_VESTING_OWNER as Address,
  bonusDistributor: deployment.TEAMS.BONUS_DISTRIBUTOR as Address,
  bonusPriceOracle: deployment.TEAMS.BONUS_PRICE_ORACLE as Address,
  ybcBonusRecipient: deployment.TEAMS.YBC_BONUS_RECIPIENT as Address,
  yfi: deployment.YFI as Address,
  multicall3: deployment.MULTICALL3 as Address,
} as const satisfies {
  budgetGenesis: number;
  budgetPeriodLengthSeconds: number;
  deployBlock: number;
  teamRegistry: Address;
  teamImplementation: Address;
  teamAccountant: Address;
  revenueRecipient: Address;
  revenuePriceOracle: Address;
  fundingDistributor: Address;
  fundingVestingFactory: Address;
  fundingVestingOwner: Address;
  bonusDistributor: Address;
  bonusPriceOracle: Address;
  ybcBonusRecipient: Address;
  yfi: Address;
  multicall3: Address;
};

const ADDRESS_FIELDS = [
  "teamRegistry",
  "teamImplementation",
  "teamAccountant",
  "revenueRecipient",
  "revenuePriceOracle",
  "fundingDistributor",
  "bonusDistributor",
  "bonusPriceOracle",
  "ybcBonusRecipient",
  "yfi",
  "multicall3",
] as const;

export function assertTeamsMainnetDeployment(feed: TeamsFeed): void {
  if (feed.chainId !== MAINNET_CHAIN_ID) {
    throw new Error("Teams feed must target Ethereum Mainnet.");
  }

  if (
    feed.deployment.budgetGenesis !==
    TEAMS_MAINNET_DEPLOYMENT.budgetGenesis
  ) {
    throw new Error("Teams feed deployment mismatch: budgetGenesis.");
  }

  if (
    feed.deployment.deployBlock !== TEAMS_MAINNET_DEPLOYMENT.deployBlock
  ) {
    throw new Error("Teams feed deployment mismatch: deployBlock.");
  }

  if (
    feed.periods.lengthSeconds !==
    TEAMS_MAINNET_DEPLOYMENT.budgetPeriodLengthSeconds
  ) {
    throw new Error("Teams feed deployment mismatch: periods.lengthSeconds.");
  }

  for (const field of ADDRESS_FIELDS) {
    assertSameTeamsAddress(
      feed.deployment[field],
      TEAMS_MAINNET_DEPLOYMENT[field],
      `deployment.${field}`
    );
  }

  assertSameTeamsAddress(
    feed.revenueRecipient.address,
    TEAMS_MAINNET_DEPLOYMENT.revenueRecipient,
    "revenueRecipient.address"
  );
  assertSameTeamsAddress(
    feed.bonus.token,
    TEAMS_MAINNET_DEPLOYMENT.yfi,
    "bonus.token"
  );
}

export function assertSameTeamsAddress(
  actual: string,
  expected: string,
  label: string
): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Teams feed deployment mismatch: ${label}.`);
  }
}
