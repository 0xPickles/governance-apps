import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  pad,
  parseAbiParameters,
  toFunctionSelector,
  type Abi,
} from "viem";
import { ERC20_TRANSFER_TOPIC } from "@/workers/alerts-bot/src/abis";

import {
  loadYbcState,
  scanYbcBlocks,
} from "@/workers/alerts-bot/src/domains/ybc/scanner";
import {
  loadTeamsState,
  scanTeamsBlocks,
} from "@/workers/alerts-bot/src/domains/teams/scanner";
import type { BlockTag, RpcBlock, RpcClient, RpcLog } from "@/workers/alerts-bot/src/rpc";
import {
  BONUS_DISTRIBUTOR_EVENTS_ABI,
  FUNDING_DISTRIBUTOR_EVENTS_ABI,
  REVENUE_RECIPIENT_EVENTS_ABI,
  TEAM_ACCOUNTANT_EVENTS_ABI,
  TEAM_EVENTS_ABI,
  TEAM_REGISTRY_EVENTS_ABI,
  TEAMS_READ_ABI,
  TOKEN_METADATA_ABI,
  YBC_BONUS_RECIPIENT_EVENTS_ABI,
  YBC_ELECTION_EVENTS_ABI,
  YBC_EVENTS_ABI,
  YBC_READ_ABI,
  YBC_REWARD_DISTRIBUTOR_EVENTS_ABI,
} from "@/workers/alerts-bot/src/product-abis";
import {
  BONUS_DISTRIBUTOR,
  FUNDING_DISTRIBUTOR,
  REVENUE_RECIPIENT,
  STYFI,
  TEAM_ACCOUNTANT,
  TEAM_REGISTRY,
  TEAMS_BUDGET_GENESIS,
  TEAMS_PERIOD_SECONDS,
  YBC,
  YBC_BONUS_RECIPIENT,
  YBC_ELECTION,
  YBC_EPOCH_SECONDS,
  YBC_GENESIS,
  YBC_REWARD_DISTRIBUTOR,
  YBC_WEIGHT_AGGREGATOR,
} from "@/workers/alerts-bot/src/contracts";

const EXISTING_TEAM = "0x1111111111111111111111111111111111111111";
const ADDED_TEAM = "0x2222222222222222222222222222222222222222";
const ACTOR = "0x3333333333333333333333333333333333333333";
const OWNER = "0x4444444444444444444444444444444444444444";
const NEXT_OWNER = "0x5555555555555555555555555555555555555555";
const TOKEN = "0x6666666666666666666666666666666666666666";
const VEST = "0x7777777777777777777777777777777777777777";
const NEXT_REGISTRY = "0x8888888888888888888888888888888888888888";
const TREASURY = "0x9999999999999999999999999999999999999999";
const RECOVERY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function hashOf(value: number): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function tx(value: number): `0x${string}` {
  return hashOf(10_000 + value);
}

function block(number: number): RpcBlock {
  return {
    number,
    hash: hashOf(number),
    parentHash: hashOf(number - 1),
    timestamp: TEAMS_BUDGET_GENESIS + 2 * TEAMS_PERIOD_SECONDS + number % 1_000,
  };
}

function log(params: {
  readonly abi: Abi;
  readonly eventName: string;
  readonly indexedArgs?: Record<string, unknown>;
  readonly data?: `0x${string}`;
  readonly address: string;
  readonly blockNumber: number;
  readonly transactionHash: string;
  readonly logIndex: number;
}): RpcLog {
  const topics = encodeEventTopics({
    abi: params.abi,
    eventName: params.eventName,
    args: params.indexedArgs,
  } as never).map((topic) => {
    if (typeof topic !== "string") throw new Error("test_topic_invalid");
    return topic;
  });
  return {
    address: params.address,
    topics,
    data: params.data ?? "0x",
    blockHash: hashOf(params.blockNumber),
    blockNumber: params.blockNumber,
    transactionHash: params.transactionHash,
    logIndex: params.logIndex,
    removed: false,
  };
}

function word(data: string): bigint {
  return BigInt(`0x${data.slice(-64)}`);
}

function transaction(hash: string, from = ACTOR) {
  return {
    hash,
    from,
    to: null,
    blockHash: null,
    blockNumber: null,
    nonce: 0,
    transactionIndex: 0,
    value: "0x0",
    input: "0x",
  };
}

describe("Teams alert scanner acceptance catalogue", () => {
  it("derives T1 through T16 from canonical contract evidence", async () => {
    const first = 25_700_000;
    const at = (offset: number) => first + offset;
    const fixed: RpcLog[] = [
      log({ abi: TEAM_REGISTRY_EVENTS_ABI, eventName: "AddTeam", indexedArgs: { idx: 1n, team: ADDED_TEAM }, address: TEAM_REGISTRY, blockNumber: at(0), transactionHash: tx(1), logIndex: 0 }),
      log({ abi: TEAM_REGISTRY_EVENTS_ABI, eventName: "RetireTeam", indexedArgs: { team: EXISTING_TEAM }, data: encodeAbiParameters(parseAbiParameters("uint256"), [3n]), address: TEAM_REGISTRY, blockNumber: at(1), transactionHash: tx(2), logIndex: 0 }),
      log({ abi: TEAM_REGISTRY_EVENTS_ABI, eventName: "Deprecate", indexedArgs: { successor: NEXT_REGISTRY }, address: TEAM_REGISTRY, blockNumber: at(2), transactionHash: tx(3), logIndex: 0 }),
      log({ abi: TEAM_REGISTRY_EVENTS_ABI, eventName: "MigrateTeam", indexedArgs: { team: EXISTING_TEAM }, address: TEAM_REGISTRY, blockNumber: at(3), transactionHash: tx(4), logIndex: 0 }),
      log({ abi: TEAM_ACCOUNTANT_EVENTS_ABI, eventName: "AdjustRevenue", indexedArgs: { operator: REVENUE_RECIPIENT, team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [9n, true]), address: TEAM_ACCOUNTANT, blockNumber: at(6), transactionHash: tx(7), logIndex: 0 }),
      log({ abi: REVENUE_RECIPIENT_EVENTS_ABI, eventName: "DepositRevenue", indexedArgs: { team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256"), [TOKEN, 3n, 9n]), address: REVENUE_RECIPIENT, blockNumber: at(6), transactionHash: tx(7), logIndex: 1 }),
      log({ abi: FUNDING_DISTRIBUTOR_EVENTS_ABI, eventName: "ApproveFunding", indexedArgs: { idx: 1n, team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256"), [TOKEN, 10n, 100n]), address: FUNDING_DISTRIBUTOR, blockNumber: at(7), transactionHash: tx(8), logIndex: 0 }),
      log({ abi: TEAM_ACCOUNTANT_EVENTS_ABI, eventName: "AdjustCost", indexedArgs: { operator: FUNDING_DISTRIBUTOR, team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [4n, true]), address: TEAM_ACCOUNTANT, blockNumber: at(8), transactionHash: tx(9), logIndex: 0 }),
      log({ abi: FUNDING_DISTRIBUTOR_EVENTS_ABI, eventName: "ClaimFunding", indexedArgs: { idx: 2n, team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address, address"), [TOKEN, 2n, 4n, VEST, ACTOR]), address: FUNDING_DISTRIBUTOR, blockNumber: at(8), transactionHash: tx(9), logIndex: 1 }),
      log({ abi: TEAM_ACCOUNTANT_EVENTS_ABI, eventName: "AdjustCost", indexedArgs: { operator: FUNDING_DISTRIBUTOR, team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [2n, false]), address: TEAM_ACCOUNTANT, blockNumber: at(9), transactionHash: tx(10), logIndex: 0 }),
      log({ abi: FUNDING_DISTRIBUTOR_EVENTS_ABI, eventName: "ReturnFunding", indexedArgs: { idx: 3n, team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [TOKEN, 2n, 2n, ACTOR]), address: FUNDING_DISTRIBUTOR, blockNumber: at(9), transactionHash: tx(10), logIndex: 1 }),
      log({ abi: BONUS_DISTRIBUTOR_EVENTS_ABI, eventName: "ClaimBonus", indexedArgs: { team: EXISTING_TEAM, period: 1n }, data: encodeAbiParameters(parseAbiParameters("uint256, uint256, address"), [50n, 5n, ACTOR]), address: BONUS_DISTRIBUTOR, blockNumber: at(10), transactionHash: tx(11), logIndex: 0 }),
      log({ abi: YBC_BONUS_RECIPIENT_EVENTS_ABI, eventName: "Deposit", indexedArgs: { depositor: BONUS_DISTRIBUTOR }, data: encodeAbiParameters(parseAbiParameters("uint256"), [5n]), address: YBC_BONUS_RECIPIENT, blockNumber: at(10), transactionHash: tx(11), logIndex: 1 }),
      log({ abi: TEAM_ACCOUNTANT_EVENTS_ABI, eventName: "AdjustRevenue", indexedArgs: { operator: ACTOR, team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [1n, true]), address: TEAM_ACCOUNTANT, blockNumber: at(11), transactionHash: tx(12), logIndex: 0 }),
      log({ abi: TEAM_ACCOUNTANT_EVENTS_ABI, eventName: "AdjustCost", indexedArgs: { operator: ACTOR, team: EXISTING_TEAM, period: 2n }, data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [1n, false]), address: TEAM_ACCOUNTANT, blockNumber: at(12), transactionHash: tx(13), logIndex: 0 }),
      log({ abi: REVENUE_RECIPIENT_EVENTS_ABI, eventName: "ToRewards", indexedArgs: { epoch: 9n }, data: encodeAbiParameters(parseAbiParameters("uint256"), [2n]), address: REVENUE_RECIPIENT, blockNumber: at(13), transactionHash: tx(14), logIndex: 0 }),
      log({ abi: REVENUE_RECIPIENT_EVENTS_ABI, eventName: "ToTreasury", data: encodeAbiParameters(parseAbiParameters("uint256"), [2n]), address: REVENUE_RECIPIENT, blockNumber: at(14), transactionHash: tx(15), logIndex: 0 }),
      log({ abi: REVENUE_RECIPIENT_EVENTS_ABI, eventName: "ToRecovery", data: encodeAbiParameters(parseAbiParameters("uint256"), [2n]), address: REVENUE_RECIPIENT, blockNumber: at(15), transactionHash: tx(16), logIndex: 0 }),
    ];
    const dynamic: RpcLog[] = [
      log({ abi: TEAM_EVENTS_ABI, eventName: "Migrate", indexedArgs: { registry: NEXT_REGISTRY }, address: EXISTING_TEAM, blockNumber: at(3), transactionHash: tx(4), logIndex: 1 }),
      log({ abi: TEAM_EVENTS_ABI, eventName: "PendingOwner", indexedArgs: { owner: NEXT_OWNER }, address: EXISTING_TEAM, blockNumber: at(4), transactionHash: tx(5), logIndex: 0 }),
      log({ abi: TEAM_EVENTS_ABI, eventName: "SetOwner", indexedArgs: { owner: NEXT_OWNER }, address: EXISTING_TEAM, blockNumber: at(5), transactionHash: tx(6), logIndex: 0 }),
      log({ abi: TEAM_EVENTS_ABI, eventName: "DepositRevenue", indexedArgs: { period: 2n }, data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [TOKEN, 3n, 9n, ACTOR]), address: EXISTING_TEAM, blockNumber: at(6), transactionHash: tx(7), logIndex: 2 }),
      log({ abi: TEAM_EVENTS_ABI, eventName: "ClaimFunding", indexedArgs: { idx: 2n, period: 2n }, data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address, address"), [TOKEN, 2n, 4n, VEST, ACTOR]), address: EXISTING_TEAM, blockNumber: at(8), transactionHash: tx(9), logIndex: 2 }),
      log({ abi: TEAM_EVENTS_ABI, eventName: "ReturnFunding", indexedArgs: { idx: 3n, period: 2n }, data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [TOKEN, 2n, 2n, ACTOR]), address: EXISTING_TEAM, blockNumber: at(9), transactionHash: tx(10), logIndex: 2 }),
    ];
    const rpc = {
      getBlockNumber: async () => at(15),
      getBlockByNumber: async (value: BlockTag) => block(value === "latest" ? at(15) : value),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === TEAM_REGISTRY.toLowerCase())
          ? fixed
          : dynamic,
      getTransactionByHash: async (hash: string) => transaction(hash),
      getTransactionReceipt: async () => null,
      call: async (request: { to: string; data: string }, reference?: { blockHash: string }) => {
        const data = request.data;
        if (data.startsWith(toFunctionSelector("registry()"))) {
          const eventBlock = reference === undefined ? 0 : Number(BigInt(reference.blockHash));
          const registry = request.to.toLowerCase() === EXISTING_TEAM && eventBlock >= at(3)
            ? NEXT_REGISTRY
            : TEAM_REGISTRY;
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "registry", result: registry });
        }
        if (data.startsWith(toFunctionSelector("teams(uint256)"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "teams", result: ADDED_TEAM });
        }
        if (data.startsWith(toFunctionSelector("is_team(address)"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "is_team", result: true });
        }
        if (data.startsWith(toFunctionSelector("name()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "name", result: request.to.toLowerCase() === ADDED_TEAM ? "Added Team" : "Existing Team" });
        }
        if (data.startsWith(toFunctionSelector("owner()"))) {
          const eventBlock = reference === undefined ? 0 : Number(BigInt(reference.blockHash));
          const owner = request.to.toLowerCase() === ADDED_TEAM || eventBlock >= at(5) ? NEXT_OWNER : OWNER;
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "owner", result: owner });
        }
        if (data.startsWith(toFunctionSelector("num_teams()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "num_teams", result: 2n });
        }
        if (data.startsWith(toFunctionSelector("team_revenues(address,uint256)"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "team_revenues", result: 12n });
        }
        if (data.startsWith(toFunctionSelector("team_costs(address,uint256)"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "team_costs", result: 5n });
        }
        if (data.startsWith(toFunctionSelector("approvals(uint256)"))) {
          const index = word(data);
          const used = index === 1n ? 0n : index === 2n ? 2n : 3n;
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "approvals", result: [EXISTING_TEAM, 2n, TOKEN, 10n, 100n, used] });
        }
        if (data.startsWith(toFunctionSelector("symbol()"))) {
          return encodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "symbol", result: "TOK" });
        }
        if (data.startsWith(toFunctionSelector("decimals()"))) {
          return encodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "decimals", result: 18 });
        }
        if (data.startsWith(toFunctionSelector("token()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "token", result: TOKEN });
        }
        if (data.startsWith(toFunctionSelector("used(uint256)"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "used", result: 12n });
        }
        if (data.startsWith(toFunctionSelector("treasury()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "treasury", result: TREASURY });
        }
        if (data.startsWith(toFunctionSelector("recovery_auction()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "recovery_auction", result: RECOVERY });
        }
        throw new Error(`unexpected exact read ${data.slice(0, 10)}`);
      },
    } as unknown as RpcClient;
    const state = loadTeamsState({ teams: [{ address: EXISTING_TEAM, index: "0" }] });

    const result = await scanTeamsBlocks({ rpc, fromBlock: first, toBlock: at(15), state });

    expect(result.failure).toBeNull();
    expect(result.actions.map((action) => action.kind)).toEqual([
      "team_added",
      "team_retirement_scheduled",
      "teams_registry_deprecated",
      "team_migrated",
      "team_owner_pending",
      "team_owner_set",
      "team_revenue_deposited",
      "team_funding_approved",
      "team_funding_claimed",
      "team_funding_returned",
      "team_bonus_claimed",
      "team_revenue_adjusted",
      "team_cost_adjusted",
      "team_revenue_to_rewards",
      "team_revenue_to_treasury",
      "team_revenue_to_recovery",
    ]);
  });
});

describe("YBC alert scanner acceptance catalogue", () => {
  it("derives B1 through B14 from canonical contract evidence", async () => {
    const first = 25_700_000;
    const powerBlock = first + 1;
    const timestamp = YBC_GENESIS + 2 * YBC_EPOCH_SECONDS + 100;
    const memberA = EXISTING_TEAM;
    const memberB = ADDED_TEAM;
    const proposalTarget = ACTOR;
    const retractedTarget = OWNER;
    const voteTarget = NEXT_OWNER;
    const executedMember = TOKEN;
    const externalMember = VEST;
    const operator = NEXT_REGISTRY;
    const membershipData = (selector: string, member: string) =>
      `${selector}${member.slice(2).padStart(64, "0")}` as `0x${string}`;
    const fixed: RpcLog[] = [
      log({ abi: YBC_ELECTION_EVENTS_ABI, eventName: "Propose", indexedArgs: { idx: 0n, account: proposalTarget, proposer: memberA }, data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [3n, true]), address: YBC_ELECTION, blockNumber: first, transactionHash: tx(101), logIndex: 0 }),
      log({ abi: YBC_ELECTION_EVENTS_ABI, eventName: "Retract", indexedArgs: { idx: 1n }, address: YBC_ELECTION, blockNumber: first, transactionHash: tx(102), logIndex: 1 }),
      log({ abi: YBC_ELECTION_EVENTS_ABI, eventName: "Vote", indexedArgs: { account: memberA, idx: 2n }, data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [5n, true]), address: YBC_ELECTION, blockNumber: first, transactionHash: tx(103), logIndex: 2 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "Call", indexedArgs: { operator: YBC_ELECTION, target: YBC }, data: encodeAbiParameters(parseAbiParameters("bytes"), [membershipData(toFunctionSelector("add_member(address)"), executedMember)]), address: YBC, blockNumber: first, transactionHash: tx(104), logIndex: 3 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "AddMember", indexedArgs: { member: executedMember }, address: YBC, blockNumber: first, transactionHash: tx(104), logIndex: 4 }),
      log({ abi: YBC_ELECTION_EVENTS_ABI, eventName: "Execute", indexedArgs: { executor: ACTOR, idx: 3n }, address: YBC_ELECTION, blockNumber: first, transactionHash: tx(104), logIndex: 5 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "Call", indexedArgs: { operator, target: YBC }, data: encodeAbiParameters(parseAbiParameters("bytes"), [membershipData(toFunctionSelector("add_member(address)"), externalMember)]), address: YBC, blockNumber: first, transactionHash: tx(105), logIndex: 6 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "AddMember", indexedArgs: { member: externalMember }, address: YBC, blockNumber: first, transactionHash: tx(105), logIndex: 7 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "Call", indexedArgs: { operator, target: YBC }, data: encodeAbiParameters(parseAbiParameters("bytes"), [membershipData(toFunctionSelector("remove_member(address)"), memberB)]), address: YBC, blockNumber: first, transactionHash: tx(106), logIndex: 8 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "RemoveMember", indexedArgs: { member: memberB }, address: YBC, blockNumber: first, transactionHash: tx(106), logIndex: 9 }),
      log({ abi: YBC_REWARD_DISTRIBUTOR_EVENTS_ABI, eventName: "Claim", indexedArgs: { account: memberA }, data: encodeAbiParameters(parseAbiParameters("uint256"), [2n]), address: YBC_REWARD_DISTRIBUTOR, blockNumber: first, transactionHash: tx(107), logIndex: 10 }),
      log({ abi: BONUS_DISTRIBUTOR_EVENTS_ABI, eventName: "ClaimBonus", indexedArgs: { team: EXISTING_TEAM, period: 1n }, data: encodeAbiParameters(parseAbiParameters("uint256, uint256, address"), [20n, 2n, ACTOR]), address: BONUS_DISTRIBUTOR, blockNumber: first, transactionHash: tx(108), logIndex: 11 }),
      log({ abi: YBC_BONUS_RECIPIENT_EVENTS_ABI, eventName: "Deposit", indexedArgs: { depositor: BONUS_DISTRIBUTOR }, data: encodeAbiParameters(parseAbiParameters("uint256"), [2n]), address: YBC_BONUS_RECIPIENT, blockNumber: first, transactionHash: tx(108), logIndex: 12 }),
      log({ abi: YBC_ELECTION_EVENTS_ABI, eventName: "SetThresholds", data: encodeAbiParameters(parseAbiParameters("uint256, uint256"), [6_000n, 7_000n]), address: YBC_ELECTION, blockNumber: first, transactionHash: tx(109), logIndex: 13 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "SetOperator", indexedArgs: { operator }, data: encodeAbiParameters(parseAbiParameters("bool"), [true]), address: YBC, blockNumber: first, transactionHash: tx(110), logIndex: 14 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "SetHooks", indexedArgs: { hooks: operator }, address: YBC, blockNumber: first, transactionHash: tx(111), logIndex: 15 }),
      log({ abi: YBC_REWARD_DISTRIBUTOR_EVENTS_ABI, eventName: "Kill", address: YBC_REWARD_DISTRIBUTOR, blockNumber: first, transactionHash: tx(112), logIndex: 16 }),
      log({ abi: YBC_EVENTS_ABI, eventName: "Call", indexedArgs: { operator, target: ACTOR }, data: encodeAbiParameters(parseAbiParameters("bytes"), ["0x12345678"]), address: YBC, blockNumber: first, transactionHash: tx(113), logIndex: 17 }),
    ];
    const transfer: RpcLog = {
      address: STYFI,
      topics: [ERC20_TRANSFER_TOPIC, pad(memberA, { size: 32 }), pad(ACTOR, { size: 32 })],
      data: pad("0x01", { size: 32 }),
      blockHash: hashOf(powerBlock),
      blockNumber: powerBlock,
      transactionHash: tx(114),
      logIndex: 0,
      removed: false,
    };
    const rpc = {
      getBlockNumber: async () => powerBlock,
      getBlockByNumber: async (value: BlockTag) => {
        const number = value === "latest" ? powerBlock : value;
        return { ...block(number), timestamp: timestamp + (number - first) };
      },
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === STYFI.toLowerCase())
          ? [transfer]
          : fixed,
      getTransactionByHash: async (hash: string) => transaction(hash),
      getTransactionReceipt: async () => null,
      call: async (request: { to: string; data: string }, reference?: { blockHash: string }) => {
        const data = request.data;
        const atBlock = reference === undefined ? first : Number(BigInt(reference.blockHash));
        if (data.startsWith(toFunctionSelector("proposals(uint256)"))) {
          const proposalId = word(data);
          const beforeVoteBlock = atBlock === first - 1;
          const values = proposalId === 0n
            ? [proposalTarget, memberA, 3n, true, 6_000n, 0n, 0n, false, false]
            : proposalId === 1n
              ? [retractedTarget, memberA, 3n, true, 6_000n, 0n, 0n, true, false]
              : proposalId === 2n
                ? [voteTarget, memberA, 3n, true, 6_000n, beforeVoteBlock ? 0n : 5n, beforeVoteBlock ? 0n : 5n, false, false]
                : [executedMember, memberA, 3n, true, 6_000n, 10n, 10n, false, true];
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "proposals", result: values as never });
        }
        if (data.startsWith(toFunctionSelector("weight_aggregator()"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight_aggregator", result: YBC_WEIGHT_AGGREGATOR });
        }
        if (data.startsWith(toFunctionSelector("weight(address)"))) {
          const account = `0x${data.slice(-40)}`.toLowerCase();
          const value = atBlock === powerBlock && account === memberA ? 20n : 10n;
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight", result: value });
        }
        if (data.startsWith(toFunctionSelector("addition_threshold()"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "addition_threshold", result: 5_000n });
        }
        if (data.startsWith(toFunctionSelector("expulsion_threshold()"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "expulsion_threshold", result: 6_000n });
        }
        if (data.startsWith(toFunctionSelector("hooks()"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "hooks", result: ACTOR });
        }
        if (data.startsWith(toFunctionSelector("name()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "name", result: "Existing Team" });
        }
        if (data.startsWith(toFunctionSelector("symbol()"))) {
          return encodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "symbol", result: "YFI" });
        }
        if (data.startsWith(toFunctionSelector("decimals()"))) {
          return encodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "decimals", result: 18 });
        }
        throw new Error(`unexpected exact read ${request.to}:${data.slice(0, 10)}`);
      },
    } as unknown as RpcClient;
    const state = loadYbcState({
      members: [memberA, memberB],
      votersByProposal: {},
      lastCollectivePower: "20",
      lastEpoch: 2,
    });

    const result = await scanYbcBlocks({ rpc, fromBlock: first, toBlock: powerBlock, state });

    expect(result.failure).toBeNull();
    expect(result.actions.map((action) => action.kind)).toEqual([
      "ybc_proposal_opened",
      "ybc_proposal_retracted",
      "ybc_vote_cast",
      "ybc_proposal_executed",
      "ybc_member_added",
      "ybc_member_removed",
      "ybc_rewards_claimed",
      "ybc_team_bonus_received",
      "ybc_thresholds_changed",
      "ybc_operator_changed",
      "ybc_hooks_changed",
      "ybc_rewards_stopped",
      "ybc_unrecognized_call",
      "ybc_collective_power_changed",
    ]);
    expect(result.state.members).toEqual(new Set([memberA, executedMember, externalMember]));
    expect(result.state.lastCollectivePower).toBe(40n);
  });
});
