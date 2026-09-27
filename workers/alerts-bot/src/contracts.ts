import deployment from "../../../lib/deployment.json";
import yethDeployment from "../../../lib/clients/yeth/deployment.json";
import { TEAMS_MAINNET_DEPLOYMENT } from "../../../lib/clients/teams/deployment";
import { YBC_MAINNET_DEPLOYMENT } from "../../../lib/clients/ybc/deployment";
import type { Address } from "viem";

export interface LiquidLockerContract {
  readonly index: number;
  readonly name: string;
  readonly symbol: string;
  readonly token: Address;
  readonly depositor: Address;
  readonly scale: bigint;
}

function assertLiquidLockerColumns(): void {
  const columns = deployment.LIQUID_LOCKERS;
  const expectedLength = columns.NAME.length;
  const actualLengths = [
    columns.SYMBOL.length,
    columns.TOKEN.length,
    columns.DEPOSITOR.length,
    columns.SCALE.length,
  ];

  if (actualLengths.some((length) => length !== expectedLength)) {
    throw new Error("deployment.json LIQUID_LOCKERS columns have mismatched lengths");
  }
}

function toSymbol(prefix: string): string {
  if (prefix.toLowerCase() === "up") return "supYFI";
  return `${prefix}YFI`;
}

assertLiquidLockerColumns();

export const YFI = deployment.YFI as Address;
export const STYFI = deployment.STYFI as Address;
export const STYFIX = deployment.STYFIX as Address;
export const VEYFI = deployment.VEYFI as Address;
export const VEYFI_REWARD_DISTRIBUTOR =
  deployment.VEYFI_REWARD_DISTRIBUTOR as Address;
export const LIQUID_LOCKER_REDEMPTION =
  deployment.LIQUID_LOCKER_REDEMPTION as Address;
export const YETH_CLAIM = yethDeployment.YETH_CLAIM as Address;
export const YETH_YIELD_VAULT = yethDeployment.YETH_YIELD_VAULT as Address;
export const YETH_RECOVERY_VAULT = yethDeployment.YETH_RECOVERY_VAULT as Address;
export const YETH_CLAIM_DEPLOY_BLOCK = yethDeployment.YETH_CLAIM_DEPLOY_BLOCK;
export const YETH_RECOVERY_VAULT_DEPLOY_BLOCK =
  yethDeployment.YETH_RECOVERY_VAULT_DEPLOY_BLOCK;
/** Verified proxy creation is in the same block as the recovery vault. */
export const YETH_YIELD_VAULT_DEPLOY_BLOCK =
  yethDeployment.YETH_RECOVERY_VAULT_DEPLOY_BLOCK;

export const TEAM_REGISTRY = TEAMS_MAINNET_DEPLOYMENT.teamRegistry;
export const TEAM_ACCOUNTANT = TEAMS_MAINNET_DEPLOYMENT.teamAccountant;
export const REVENUE_RECIPIENT = TEAMS_MAINNET_DEPLOYMENT.revenueRecipient;
export const FUNDING_DISTRIBUTOR = TEAMS_MAINNET_DEPLOYMENT.fundingDistributor;
export const BONUS_DISTRIBUTOR = TEAMS_MAINNET_DEPLOYMENT.bonusDistributor;
export const YBC_BONUS_RECIPIENT = TEAMS_MAINNET_DEPLOYMENT.ybcBonusRecipient;
export const TEAMS_BUDGET_GENESIS = TEAMS_MAINNET_DEPLOYMENT.budgetGenesis;
export const TEAMS_PERIOD_SECONDS =
  TEAMS_MAINNET_DEPLOYMENT.budgetPeriodLengthSeconds;

export const YBC = YBC_MAINNET_DEPLOYMENT.ybc;
export const YBC_ELECTION = YBC_MAINNET_DEPLOYMENT.ybcElection;
export const YBC_WEIGHT_AGGREGATOR =
  YBC_MAINNET_DEPLOYMENT.ybcWeightAggregator;
export const YBC_REWARD_DISTRIBUTOR =
  YBC_MAINNET_DEPLOYMENT.ybcRewardDistributor;
export const YBC_REWARD_TOKEN = YBC_MAINNET_DEPLOYMENT.rewardToken;
export const YBC_REWARD_CLAIMER = YBC_MAINNET_DEPLOYMENT.rewardClaimer;
export const YBC_GENESIS = YBC_MAINNET_DEPLOYMENT.genesis;
export const YBC_EPOCH_SECONDS = YBC_MAINNET_DEPLOYMENT.epochLengthSeconds;
export const YBC_VOTE_SECONDS = YBC_MAINNET_DEPLOYMENT.voteLengthSeconds;
export const YBC_DECAY_SECONDS = YBC_MAINNET_DEPLOYMENT.decayLengthSeconds;

export const LIQUID_LOCKERS: readonly LiquidLockerContract[] =
  deployment.LIQUID_LOCKERS.NAME.map((name, index) => ({
    index,
    name,
    symbol: toSymbol(deployment.LIQUID_LOCKERS.SYMBOL[index]),
    token: deployment.LIQUID_LOCKERS.TOKEN[index] as Address,
    depositor: deployment.LIQUID_LOCKERS.DEPOSITOR[index] as Address,
    scale: BigInt(deployment.LIQUID_LOCKERS.SCALE[index]),
  }));

export const LIQUID_LOCKER_TOKENS = LIQUID_LOCKERS.map((locker) => locker.token);
export const LIQUID_LOCKER_DEPOSITORS = LIQUID_LOCKERS.map(
  (locker) => locker.depositor,
);

export const LIQUID_LOCKER_BY_DEPOSITOR = new Map<string, LiquidLockerContract>(
  LIQUID_LOCKERS.map((locker) => [locker.depositor.toLowerCase(), locker]),
);

export const LIQUID_LOCKER_SYMBOL_BY_TOKEN = new Map<string, string>(
  LIQUID_LOCKERS.map((locker) => [locker.token.toLowerCase(), locker.symbol]),
);
