import type { Address } from "viem";
import type { YbcFeed } from "@/lib/schemas/ybc-feed";
import deployment from "@/lib/deployment.json";

export const YBC_MAINNET_DEPLOYMENT = {
  genesis: deployment.YBC.GENESIS,
  epochLengthSeconds: deployment.YBC.EPOCH_LENGTH_SECONDS,
  voteLengthSeconds: deployment.YBC.VOTE_LENGTH_SECONDS,
  decayLengthSeconds: deployment.YBC.DECAY_LENGTH_SECONDS,
  deployBlock: deployment.YBC.DEPLOY_BLOCK,
  ybc: deployment.YBC.YBC as Address,
  ybcElection: deployment.YBC.ELECTION as Address,
  ybcWeightAggregator: deployment.YBC.WEIGHT_AGGREGATOR as Address,
  ybcRewardDistributor: deployment.YBC.REWARD_DISTRIBUTOR as Address,
  ybcBonusRecipient: deployment.TEAMS.YBC_BONUS_RECIPIENT as Address,
  upstreamWeightAggregator: deployment.YBC.UPSTREAM_WEIGHT_AGGREGATOR as Address,
  rewardToken: deployment.REWARD as Address,
  rewardClaimer: deployment.REWARD_CLAIMER as Address,
  multicall3: deployment.MULTICALL3 as Address,
} as const satisfies {
  genesis: number;
  epochLengthSeconds: number;
  voteLengthSeconds: number;
  decayLengthSeconds: number;
  deployBlock: number;
  ybc: Address;
  ybcElection: Address;
  ybcWeightAggregator: Address;
  ybcRewardDistributor: Address;
  ybcBonusRecipient: Address;
  upstreamWeightAggregator: Address;
  rewardToken: Address;
  rewardClaimer: Address;
  multicall3: Address;
};

const ADDRESS_FIELDS = [
  "ybc",
  "ybcElection",
  "ybcWeightAggregator",
  "ybcRewardDistributor",
  "ybcBonusRecipient",
  "upstreamWeightAggregator",
  "rewardToken",
  "rewardClaimer",
  "multicall3",
] as const;

export function assertYbcMainnetDeployment(feed: YbcFeed): void {
  if (feed.deployment.genesis !== YBC_MAINNET_DEPLOYMENT.genesis) {
    throw new Error("YBC feed deployment mismatch: genesis.");
  }

  if (feed.deployment.deployBlock !== YBC_MAINNET_DEPLOYMENT.deployBlock) {
    throw new Error("YBC feed deployment mismatch: deployBlock.");
  }

  if (
    feed.epoch.lengthSeconds !==
      YBC_MAINNET_DEPLOYMENT.epochLengthSeconds ||
    feed.epoch.voteLengthSeconds !==
      YBC_MAINNET_DEPLOYMENT.voteLengthSeconds ||
    feed.epoch.decayLengthSeconds !==
      YBC_MAINNET_DEPLOYMENT.decayLengthSeconds
  ) {
    throw new Error("YBC feed deployment mismatch: epoch constants.");
  }

  for (const field of ADDRESS_FIELDS) {
    if (
      feed.deployment[field].toLowerCase() !==
      YBC_MAINNET_DEPLOYMENT[field].toLowerCase()
    ) {
      throw new Error(`YBC feed deployment mismatch: ${field}.`);
    }
  }

  if (
    feed.rewards.token.toLowerCase() !==
    YBC_MAINNET_DEPLOYMENT.rewardToken.toLowerCase()
  ) {
    throw new Error("YBC feed deployment mismatch: rewards.token.");
  }

  if (
    feed.rewards.distributor.toLowerCase() !==
    YBC_MAINNET_DEPLOYMENT.ybcRewardDistributor.toLowerCase()
  ) {
    throw new Error("YBC feed deployment mismatch: rewards.distributor.");
  }
}
