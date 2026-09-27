import { parseAbi, toEventSelector, type AbiEvent } from "viem";

/**
 * Minimal read/event ABI used by the Teams and YBC alert replay.
 *
 * These signatures are pinned to yearn/stYFI commit
 * 054e3e391f0fe4cd41c68b1a97263cb3234faee1. The review contract records the
 * source path for each contract. Keeping the replay-only surface here avoids a
 * second ABI authority inside the Worker bundle.
 */
export const TEAM_REGISTRY_EVENTS_ABI = parseAbi([
  "event AddTeam(uint256 indexed idx, address indexed team)",
  "event RetireTeam(address indexed team, uint256 period)",
  "event Deprecate(address indexed successor)",
  "event MigrateTeam(address indexed team)",
] as const);

export const TEAM_EVENTS_ABI = parseAbi([
  "event DepositRevenue(uint256 indexed period, address token, uint256 amount, uint256 revenue, address depositor)",
  "event ClaimFunding(uint256 indexed idx, uint256 indexed period, address token, uint256 amount, uint256 cost, address vest, address recipient)",
  "event ReturnFunding(uint256 indexed idx, uint256 indexed period, address token, uint256 amount, uint256 refund, address sender)",
  "event PendingOwner(address indexed owner)",
  "event SetOwner(address indexed owner)",
  "event Migrate(address indexed registry)",
] as const);

export const TEAM_ACCOUNTANT_EVENTS_ABI = parseAbi([
  "event AdjustRevenue(address indexed operator, address indexed team, uint256 indexed period, uint256 amount, bool increment)",
  "event AdjustCost(address indexed operator, address indexed team, uint256 indexed period, uint256 amount, bool increment)",
] as const);

export const REVENUE_RECIPIENT_EVENTS_ABI = parseAbi([
  "event DepositRevenue(address indexed team, uint256 indexed period, address token, uint256 amount, uint256 revenue)",
  "event ToTreasury(uint256 amount)",
  "event ToRewards(uint256 indexed epoch, uint256 amount)",
  "event ToRecovery(uint256 amount)",
] as const);

export const FUNDING_DISTRIBUTOR_EVENTS_ABI = parseAbi([
  "event ApproveFunding(uint256 indexed idx, address indexed team, uint256 indexed period, address token, uint256 amount, uint256 duration)",
  "event ClaimFunding(uint256 indexed idx, address indexed team, uint256 indexed period, address token, uint256 amount, uint256 cost, address vest, address recipient)",
  "event ReturnFunding(uint256 indexed idx, address indexed team, uint256 indexed period, address token, uint256 amount, uint256 refund, address sender)",
] as const);

export const BONUS_DISTRIBUTOR_EVENTS_ABI = parseAbi([
  "event ClaimBonus(address indexed team, uint256 indexed period, uint256 amount, uint256 ybc_amount, address recipient)",
] as const);

export const YBC_BONUS_RECIPIENT_EVENTS_ABI = parseAbi([
  "event Deposit(address indexed depositor, uint256 amount)",
] as const);

export const YBC_EVENTS_ABI = parseAbi([
  "event AddMember(address indexed member)",
  "event RemoveMember(address indexed member)",
  "event Call(address indexed operator, address indexed target, bytes data)",
  "event SetHooks(address indexed hooks)",
  "event SetOperator(address indexed operator, bool flag)",
] as const);

export const YBC_ELECTION_EVENTS_ABI = parseAbi([
  "event Propose(uint256 indexed idx, address indexed account, address indexed proposer, uint256 epoch, bool addition)",
  "event Retract(uint256 indexed idx)",
  "event Vote(address indexed account, uint256 indexed idx, uint256 weight, bool yea)",
  "event Execute(address indexed executor, uint256 indexed idx)",
  "event SetWeightAggregator(address indexed aggregator)",
  "event SetThresholds(uint256 addition, uint256 expulsion)",
] as const);

export const YBC_REWARD_DISTRIBUTOR_EVENTS_ABI = parseAbi([
  "event Claim(address indexed account, uint256 rewards)",
  "event Kill()",
] as const);

export const TEAMS_READ_ABI = parseAbi([
  "function period() view returns (uint256)",
  "function num_teams() view returns (uint256)",
  "function teams(uint256 idx) view returns (address)",
  "function is_team(address team) view returns (bool)",
  "function name() view returns (string)",
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function team_revenues(address team, uint256 period) view returns (uint256)",
  "function team_costs(address team, uint256 period) view returns (uint256)",
  "function approvals(uint256 idx) view returns (address team, uint256 period, address token, uint256 amount, uint256 duration, uint256 used)",
  "function token() view returns (address)",
  "function used(uint256 idx) view returns (uint256)",
  "function treasury() view returns (address)",
  "function recovery_auction() view returns (address)",
] as const);

/** ERC-20 metadata is the only non-protocol ABI in this module. */
export const TOKEN_METADATA_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
] as const);

export const YBC_READ_ABI = parseAbi([
  "function num_members() view returns (uint256)",
  "function hooks() view returns (address)",
  "function addition_threshold() view returns (uint256)",
  "function expulsion_threshold() view returns (uint256)",
  "function weight_aggregator() view returns (address)",
  "function proposals(uint256 idx) view returns (address account, address proposer, uint256 epoch, bool addition, uint256 threshold, uint256 votes, uint256 yea, bool retracted, bool executed)",
  "function weight(address account) view returns (uint256)",
] as const);

function topics(abi: readonly { readonly type: string; readonly name?: string }[]) {
  const result: Record<string, `0x${string}`> = {};
  for (const item of abi) {
    if (item.type === "event" && item.name !== undefined) {
      result[item.name] = toEventSelector(item as AbiEvent);
    }
  }
  return Object.freeze(result);
}

export const TEAM_REGISTRY_EVENT_TOPICS = topics(TEAM_REGISTRY_EVENTS_ABI);
export const TEAM_EVENT_TOPICS = topics(TEAM_EVENTS_ABI);
export const TEAM_ACCOUNTANT_EVENT_TOPICS = topics(TEAM_ACCOUNTANT_EVENTS_ABI);
export const REVENUE_RECIPIENT_EVENT_TOPICS = topics(REVENUE_RECIPIENT_EVENTS_ABI);
export const FUNDING_DISTRIBUTOR_EVENT_TOPICS = topics(FUNDING_DISTRIBUTOR_EVENTS_ABI);
export const BONUS_DISTRIBUTOR_EVENT_TOPICS = topics(BONUS_DISTRIBUTOR_EVENTS_ABI);
export const YBC_BONUS_RECIPIENT_EVENT_TOPICS = topics(YBC_BONUS_RECIPIENT_EVENTS_ABI);
export const YBC_EVENT_TOPICS = topics(YBC_EVENTS_ABI);
export const YBC_ELECTION_EVENT_TOPICS = topics(YBC_ELECTION_EVENTS_ABI);
export const YBC_REWARD_DISTRIBUTOR_EVENT_TOPICS = topics(YBC_REWARD_DISTRIBUTOR_EVENTS_ABI);
