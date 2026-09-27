import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  parseAbiParameters,
  pad,
  toFunctionSelector,
} from "viem";
import { ERC20_TRANSFER_TOPIC } from "@/workers/alerts-bot/src/abis";

import {
  createEmptyTeamsState,
  loadTeamsState,
  scanTeamsBlocks,
  serializeTeamsState,
} from "@/workers/alerts-bot/src/domains/teams/scanner";
import {
  createEmptyYbcState,
  loadYbcState,
  scanYbcBlocks,
  serializeYbcState,
  YBC_FINAL_DAY_DECAY_SECONDS,
} from "@/workers/alerts-bot/src/domains/ybc/scanner";
import type { BlockTag, RpcBlock, RpcClient, RpcLog } from "@/workers/alerts-bot/src/rpc";
import {
  BONUS_DISTRIBUTOR_EVENTS_ABI,
  REVENUE_RECIPIENT_EVENTS_ABI,
  TEAM_ACCOUNTANT_EVENTS_ABI,
  TEAM_EVENTS_ABI,
  TEAM_REGISTRY_EVENTS_ABI,
  TEAMS_READ_ABI,
  YBC_BONUS_RECIPIENT_EVENTS_ABI,
  YBC_ELECTION_EVENTS_ABI,
  YBC_EVENTS_ABI,
  YBC_READ_ABI,
  YBC_REWARD_DISTRIBUTOR_EVENTS_ABI,
} from "@/workers/alerts-bot/src/product-abis";
import {
  BONUS_DISTRIBUTOR,
  REVENUE_RECIPIENT,
  STYFI,
  TEAM_ACCOUNTANT,
  TEAM_REGISTRY,
  YBC,
  YBC_BONUS_RECIPIENT,
  YBC_ELECTION,
  YBC_EPOCH_SECONDS,
  YBC_GENESIS,
  YBC_WEIGHT_AGGREGATOR,
  YBC_REWARD_DISTRIBUTOR,
} from "@/workers/alerts-bot/src/contracts";
import { renderProductAlertAction } from "@/workers/alerts-bot/src/product-renderer";

function block(number: number): RpcBlock {
  return {
    number,
    hash: `0x${number.toString(16).padStart(64, "0")}`,
    parentHash: `0x${Math.max(0, number - 1).toString(16).padStart(64, "0")}`,
    timestamp: 1_780_000_000 + number,
  };
}

function emptyRpc(): RpcClient {
  return {
    getBlockNumber: async () => 20,
    getBlockByNumber: async (number: BlockTag) => block(number === "latest" ? 20 : number),
    getLogs: async (): Promise<RpcLog[]> => [],
    getTransactionByHash: async () => null,
    getTransactionReceipt: async () => null,
    call: async () => { throw new Error("unexpected call"); },
  } as unknown as RpcClient;
}

function eventLog(params: {
  address: string;
  topics: readonly (string | readonly string[] | null)[];
  data?: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  blockHash?: string;
}): RpcLog {
  return {
    address: params.address,
    topics: params.topics.map((topic) => {
      if (typeof topic !== "string") throw new Error("test_event_topic_invalid");
      return topic;
    }),
    data: params.data ?? "0x",
    blockHash: params.blockHash ?? block(params.blockNumber).hash,
    blockNumber: params.blockNumber,
    transactionHash: params.transactionHash,
    logIndex: params.logIndex,
    removed: false,
  };
}

function epochFor(timestamp: number): number {
  return Math.floor((timestamp - YBC_GENESIS) / YBC_EPOCH_SECONDS);
}

describe("product alert scanner state", () => {
  it("round-trips empty Teams and YBC state", () => {
    expect(loadTeamsState(serializeTeamsState(createEmptyTeamsState())).teams.size).toBe(0);
    const ybc = loadYbcState(serializeYbcState(createEmptyYbcState()));
    expect(ybc.members.size).toBe(0);
    expect(ybc.lastCollectivePower).toBeNull();
  });

  it("advances empty ranges deterministically without fabricating alerts", async () => {
    const teams = await scanTeamsBlocks({ rpc: emptyRpc(), fromBlock: 10, toBlock: 20, state: createEmptyTeamsState() });
    const ybc = await scanYbcBlocks({ rpc: emptyRpc(), fromBlock: 10, toBlock: 20, state: createEmptyYbcState() });
    expect(teams.failure).toBeNull();
    expect(teams.actions).toEqual([]);
    expect(ybc.failure).toBeNull();
    expect(ybc.actions).toEqual([]);
    expect(ybc.state.lastCollectivePower).toBe(0n);
  });

  it("rejects duplicate or malformed persisted identities", () => {
    expect(() => loadTeamsState({ teams: [
      { address: "0x1111111111111111111111111111111111111111", index: "0" },
      { address: "0x1111111111111111111111111111111111111111", index: "1" },
    ] })).toThrow("teams_state_duplicate");
    expect(() => loadYbcState({
      members: ["not-an-address"], votersByProposal: {}, lastCollectivePower: null, lastEpoch: null,
    })).toThrow("product_scan_address_invalid");
  });

  it("discovers a Team from the registry and renders its exact-block identity", async () => {
    const blockNumber = 25_244_861;
    const team = "0x4444444444444444444444444444444444444444";
    const transactionHash = `0x${"c".repeat(64)}`;
    const addTeam: RpcLog = {
      address: TEAM_REGISTRY,
      topics: encodeEventTopics({
        abi: TEAM_REGISTRY_EVENTS_ABI,
        eventName: "AddTeam",
        args: { idx: 0n, team },
      }) as string[],
      data: "0x",
      blockHash: block(blockNumber).hash,
      blockNumber,
      transactionHash,
      logIndex: 0,
      removed: false,
    };
    const rpc = {
      ...emptyRpc(),
      getBlockByNumber: async () => ({ ...block(blockNumber), timestamp: 1_762_992_010 }),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === team)
          ? []
          : [addTeam],
      call: async (request: { data: string }) => {
        if (request.data.startsWith(toFunctionSelector("registry()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "registry", result: TEAM_REGISTRY });
        }
        if (request.data.startsWith(toFunctionSelector("teams(uint256)"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "teams", result: team });
        }
        if (request.data.startsWith(toFunctionSelector("is_team(address)"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "is_team", result: true });
        }
        if (request.data.startsWith(toFunctionSelector("name()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "name", result: "Frontend & Tools" });
        }
        if (request.data.startsWith(toFunctionSelector("owner()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "owner", result: "0x5555555555555555555555555555555555555555" });
        }
        throw new Error("unexpected exact read");
      },
    } as unknown as RpcClient;

    const result = await scanTeamsBlocks({ rpc, fromBlock: blockNumber, toBlock: blockNumber, state: createEmptyTeamsState() });
    expect(result.failure).toBeNull();
    expect(result.state.teams.get(team)).toBe(0n);
    expect(result.actions).toMatchObject([{
      domainId: "teams",
      kind: "team_added",
      details: { teamName: "Frontend & Tools", currentPeriod: 0n },
    }]);
  });

  it("decodes a no-argument YBC reward shutdown and records its actor", async () => {
    const blockNumber = 25_228_044;
    const transactionHash = `0x${"d".repeat(64)}`;
    const kill: RpcLog = {
      address: YBC_REWARD_DISTRIBUTOR,
      topics: encodeEventTopics({
        abi: YBC_REWARD_DISTRIBUTOR_EVENTS_ABI,
        eventName: "Kill",
      }) as string[],
      data: "0x",
      blockHash: block(blockNumber).hash,
      blockNumber,
      transactionHash,
      logIndex: 4,
      removed: false,
    };
    const actor = "0x6666666666666666666666666666666666666666";
    const rpc = {
      ...emptyRpc(),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === YBC.toLowerCase())
          ? [kill]
          : [],
      getTransactionByHash: async () => ({
        hash: transactionHash,
        from: actor,
        to: YBC_REWARD_DISTRIBUTOR,
        blockHash: block(blockNumber).hash,
        blockNumber,
        nonce: 1,
        transactionIndex: 0,
        value: "0x0",
        input: "0x",
      }),
    } as unknown as RpcClient;

    const result = await scanYbcBlocks({ rpc, fromBlock: blockNumber, toBlock: blockNumber, state: createEmptyYbcState() });
    expect(result.failure).toBeNull();
    expect(result.actions).toMatchObject([{
      domainId: "ybc",
      kind: "ybc_rewards_stopped",
      details: { actor, accruedClaimsRemainClaimable: true },
    }]);
  });

  it("replays same-block YBC votes in log order and excludes an expulsion target from eligibility", async () => {
    const blockNumber = 25_500_100;
    const timestamp = YBC_GENESIS + (YBC_EPOCH_SECONDS * 2) - 43_200;
    const transactionHash = `0x${"e".repeat(64)}`;
    const proposalId = 7n;
    const target = "0x7777777777777777777777777777777777777777";
    const proposer = "0x8888888888888888888888888888888888888888";
    const voters = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    ] as const;
    const votes = [
      eventLog({
        address: YBC_ELECTION,
        topics: encodeEventTopics({ abi: YBC_ELECTION_EVENTS_ABI, eventName: "Vote", args: { account: voters[0], idx: proposalId } }),
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [10_000_000n, true]),
        blockNumber,
        transactionHash,
        logIndex: 3,
      }),
      eventLog({
        address: YBC_ELECTION,
        topics: encodeEventTopics({ abi: YBC_ELECTION_EVENTS_ABI, eventName: "Vote", args: { account: voters[1], idx: proposalId } }),
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [20_000_000n, false]),
        blockNumber,
        transactionHash,
        logIndex: 7,
      }),
    ];
    const proposal = (total: bigint, yea: bigint) => encodeFunctionResult({
      abi: YBC_READ_ABI,
      functionName: "proposals",
      result: [target, proposer, 1n, false, 6_000n, total, yea, false, false],
    });
    const rpc = {
      ...emptyRpc(),
      getBlockByNumber: async (number: BlockTag) => ({
        ...block(number === "latest" ? blockNumber : number),
        timestamp: timestamp + (number === blockNumber ? 0 : -1),
      }),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === YBC_ELECTION.toLowerCase()) ? votes : [],
      call: async (request: { data: string }, reference?: { blockHash: string }) => {
        if (request.data.startsWith(toFunctionSelector("proposals(uint256)"))) {
          return reference?.blockHash === block(blockNumber - 1).hash
            ? proposal(0n, 0n)
            : proposal(30_000_000n, 10_000_000n);
        }
        if (request.data.startsWith(toFunctionSelector("weight_aggregator()"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight_aggregator", result: YBC_WEIGHT_AGGREGATOR });
        }
        if (request.data.startsWith(toFunctionSelector("weight(address)"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight", result: 15n });
        }
        throw new Error("unexpected exact read");
      },
    } as unknown as RpcClient;
    const state = loadYbcState({
      members: [...voters, target],
      votersByProposal: {},
      lastCollectivePower: "45",
      lastEpoch: epochFor(timestamp),
    });

    const result = await scanYbcBlocks({ rpc, fromBlock: blockNumber, toBlock: blockNumber, state });

    expect(result.failure).toBeNull();
    expect(result.actions.filter((action) => action.kind === "ybc_vote_cast")).toMatchObject([
      { details: { proposalType: "expulsion", countedWeight: 10_000_000n, baseWeight: 20_000_000n, yeaWeight: 10_000_000n, totalWeight: 10_000_000n, uniqueVoters: 1, eligibleMembers: 2 } },
      { details: { proposalType: "expulsion", countedWeight: 20_000_000n, baseWeight: 40_000_000n, yeaWeight: 10_000_000n, totalWeight: 30_000_000n, uniqueVoters: 2, eligibleMembers: 2 } },
    ]);
  });

  it("uses the exact traced generic weight when it changes later in the vote block", async () => {
    const blockNumber = 25_500_110;
    const timestamp = YBC_GENESIS + (YBC_EPOCH_SECONDS * 2) - 43_200;
    const transactionHash = `0x${"f".repeat(64)}`;
    const proposalId = 9n;
    const target = "0x3030303030303030303030303030303030303030";
    const voters = [
      "0x4040404040404040404040404040404040404040",
      "0x5050505050505050505050505050505050505050",
    ] as const;
    const genericAggregator = "0x6060606060606060606060606060606060606060";
    const batcher = "0x7070707070707070707070707070707070707070";
    const logs = [
      eventLog({
        address: YBC_ELECTION,
        topics: encodeEventTopics({
          abi: YBC_ELECTION_EVENTS_ABI,
          eventName: "Vote",
          args: { account: voters[0], idx: proposalId },
        }),
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [500_000n, true]),
        blockNumber,
        transactionHash,
        logIndex: 1,
      }),
      eventLog({
        address: YBC_ELECTION,
        topics: encodeEventTopics({
          abi: YBC_ELECTION_EVENTS_ABI,
          eventName: "SetWeightAggregator",
          args: { aggregator: genericAggregator },
        }),
        blockNumber,
        transactionHash,
        logIndex: 2,
      }),
      eventLog({
        address: YBC_ELECTION,
        topics: encodeEventTopics({
          abi: YBC_ELECTION_EVENTS_ABI,
          eventName: "Vote",
          args: { account: voters[1], idx: proposalId },
        }),
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [617_283n, true]),
        blockNumber,
        transactionHash,
        logIndex: 3,
      }),
    ];
    const proposal = (votes: bigint) => encodeFunctionResult({
      abi: YBC_READ_ABI,
      functionName: "proposals",
      result: [target, voters[0], 1n, true, 6_000n, votes, votes, false, false],
    });
    const weightReads: Array<{ readonly aggregator: string; readonly account: string }> = [];
    const tracedTransactions: string[] = [];
    const tracedWeight = 1_234_567n;
    const endOfBlockWeight = 1_234_566n;
    const weightInput = (voter: `0x${string}`) => encodeFunctionData({
      abi: YBC_READ_ABI,
      functionName: "weight",
      args: [voter],
    });
    const electionFrame = (
      event: RpcLog,
      voter: `0x${string}`,
      aggregator: `0x${string}`,
      weight: bigint,
    ) => ({
      type: "CALL",
      from: batcher,
      to: YBC_ELECTION.toLowerCase(),
      input: "0x",
      output: "0x",
      error: null,
      calls: [{
        type: "STATICCALL",
        from: YBC_ELECTION.toLowerCase(),
        to: aggregator.toLowerCase(),
        input: weightInput(voter).toLowerCase(),
        output: encodeFunctionResult({
          abi: YBC_READ_ABI,
          functionName: "weight",
          result: weight,
        }).toLowerCase(),
        error: null,
        calls: [],
        logs: [],
      }],
      logs: [{
        address: event.address.toLowerCase(),
        topics: event.topics.map((topic) => topic.toLowerCase()),
        data: event.data.toLowerCase(),
        index: event.logIndex!,
        position: 1,
      }],
    });
    const rpc = {
      ...emptyRpc(),
      getBlockByNumber: async (number: BlockTag) => ({
        ...block(number === "latest" ? blockNumber : number),
        timestamp: timestamp + (number === blockNumber ? 0 : -1),
      }),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === YBC_ELECTION.toLowerCase())
          ? logs
          : [],
      call: async (
        request: { to: string; data: string },
        reference?: { blockHash: string },
      ) => {
        if (request.data.startsWith(toFunctionSelector("proposals(uint256)"))) {
          return reference?.blockHash === block(blockNumber - 1).hash
            ? proposal(0n)
            : proposal(1_117_283n);
        }
        if (request.data.startsWith(toFunctionSelector("weight_aggregator()"))) {
          return encodeFunctionResult({
            abi: YBC_READ_ABI,
            functionName: "weight_aggregator",
            result: reference?.blockHash === block(blockNumber - 1).hash
              ? YBC_WEIGHT_AGGREGATOR
              : genericAggregator,
          });
        }
        if (request.data.startsWith(toFunctionSelector("weight(address)"))) {
          weightReads.push({
            aggregator: request.to.toLowerCase(),
            account: `0x${request.data.slice(-40)}`.toLowerCase(),
          });
          return encodeFunctionResult({
            abi: YBC_READ_ABI,
            functionName: "weight",
            result: endOfBlockWeight,
          });
        }
        throw new Error("unexpected exact read");
      },
      traceTransactionByHash: async (hash: string) => {
        tracedTransactions.push(hash);
        return {
          type: "CALL",
          from: voters[0],
          to: batcher,
          input: "0x",
          output: "0x",
          error: null,
          calls: [
            electionFrame(logs[0]!, voters[0], YBC_WEIGHT_AGGREGATOR, 1_000_000n),
            {
              type: "CALL",
              from: batcher,
              to: YBC_ELECTION.toLowerCase(),
              input: "0x",
              output: "0x",
              error: null,
              calls: [],
              logs: [{
                address: logs[1]!.address.toLowerCase(),
                topics: logs[1]!.topics.map((topic) => topic.toLowerCase()),
                data: logs[1]!.data.toLowerCase(),
                index: logs[1]!.logIndex!,
                position: 0,
              }],
            },
            electionFrame(logs[2]!, voters[1], genericAggregator, tracedWeight),
          ],
          logs: [],
        };
      },
    } as unknown as RpcClient;
    const state = loadYbcState({
      members: voters,
      votersByProposal: {},
      lastCollectivePower: (endOfBlockWeight * 2n).toString(),
      lastEpoch: epochFor(timestamp),
    });

    const result = await scanYbcBlocks({
      rpc,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state,
    });
    const votes = result.actions.filter((candidate) => candidate.kind === "ybc_vote_cast");

    expect(result.failure).toBeNull();
    expect(votes).toMatchObject([
      { details: { countedWeight: 500_000n, baseWeight: 1_000_000n } },
      { details: { countedWeight: 617_283n, baseWeight: tracedWeight } },
    ]);
    expect(tracedTransactions).toEqual([transactionHash]);
    expect(weightReads.length).toBeGreaterThan(0);
    expect(weightReads.every(({ aggregator }) => aggregator === genericAggregator)).toBe(true);
    expect(endOfBlockWeight).not.toBe(tracedWeight);
    expect(endOfBlockWeight * 43_200n / 86_400n).toBe(617_283n);

    const unavailable = await scanYbcBlocks({
      rpc: { ...rpc, traceTransactionByHash: undefined } as unknown as RpcClient,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state,
    });
    expect(unavailable.failure?.reason).toBe("ybc_vote_trace_unavailable");
    expect(unavailable.actions).toEqual([]);

    const wrongPosition = await scanYbcBlocks({
      rpc: {
        ...rpc,
        traceTransactionByHash: async (hash: string) => {
          const trace = await rpc.traceTransactionByHash!(hash);
          return {
            ...trace,
            calls: trace.calls.map((frame, index) => index === 2
              ? {
                  ...frame,
                  logs: frame.logs.map((candidate) => ({
                    ...candidate,
                    position: 0,
                  })),
                }
              : frame),
          };
        },
      } as unknown as RpcClient,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state,
    });
    expect(wrongPosition.failure?.reason).toBe("ybc_vote_trace_weight_call_missing");
    expect(wrongPosition.actions).toEqual([]);
  });

  it("reconstructs the unique packed base weight strictly inside final-day decay", async () => {
    const proposalId = 8n;
    const voter = "0x1010101010101010101010101010101010101010";
    const target = "0x2020202020202020202020202020202020202020";
    const scanAt = async (timestamp: number, countedWeight: bigint) => {
      const blockNumber = 25_500_120;
      const transactionHash = `0x${countedWeight.toString(16).padStart(64, "0")}`;
      const vote = eventLog({
        address: YBC_ELECTION,
        topics: encodeEventTopics({
          abi: YBC_ELECTION_EVENTS_ABI,
          eventName: "Vote",
          args: { account: voter, idx: proposalId },
        }),
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [countedWeight, true]),
        blockNumber,
        transactionHash,
        logIndex: 0,
      });
      const proposal = (weight: bigint) => encodeFunctionResult({
        abi: YBC_READ_ABI,
        functionName: "proposals",
        result: [target, voter, 1n, true, 6_000n, weight, weight, false, false],
      });
      const rpc = {
        ...emptyRpc(),
        getBlockByNumber: async (number: BlockTag) => ({
          ...block(number === "latest" ? blockNumber : number),
          timestamp: timestamp + (number === blockNumber ? 0 : -1),
        }),
        getLogs: async (filter: { address?: string[] }) =>
          filter.address?.some((address) => address.toLowerCase() === YBC_ELECTION.toLowerCase())
            ? [vote]
            : [],
        call: async (request: { data: string }, reference?: { blockHash: string }) => {
          if (request.data.startsWith(toFunctionSelector("proposals(uint256)"))) {
            return reference?.blockHash === block(blockNumber - 1).hash
              ? proposal(0n)
              : proposal(countedWeight);
          }
          if (request.data.startsWith(toFunctionSelector("weight_aggregator()"))) {
            return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight_aggregator", result: YBC_WEIGHT_AGGREGATOR });
          }
          if (request.data.startsWith(toFunctionSelector("weight(address)"))) {
            return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight", result: 1_000_000n });
          }
          throw new Error("unexpected exact read");
        },
      } as unknown as RpcClient;
      return scanYbcBlocks({
        rpc,
        fromBlock: blockNumber,
        toBlock: blockNumber,
        state: loadYbcState({
          members: [voter],
          votersByProposal: {},
          lastCollectivePower: "1000000",
          lastEpoch: epochFor(timestamp),
        }),
      });
    };
    const epochEnd = YBC_GENESIS + YBC_EPOCH_SECONDS;
    const atBoundary = await scanAt(
      epochEnd - YBC_FINAL_DAY_DECAY_SECONDS,
      1_000_000n,
    );
    const lastSecond = await scanAt(epochEnd - 1, 11n);
    const impossible = await scanAt(epochEnd - 1, 10n);

    expect(atBoundary.failure).toBeNull();
    expect(lastSecond.failure).toBeNull();
    expect(atBoundary.actions).toMatchObject([
      { kind: "ybc_vote_cast", details: { countedWeight: 1_000_000n, baseWeight: 1_000_000n } },
    ]);
    expect(lastSecond.actions).toMatchObject([
      { kind: "ybc_vote_cast", details: { countedWeight: 11n, baseWeight: 1_000_000n } },
    ]);
    expect(impossible.failure?.reason).toBe("ybc_vote_base_weight_unrecoverable");
    expect(impossible.actions).toEqual([]);
  });

  it("accepts unrelated YBC calls but rejects missing, malformed, or contradictory membership evidence", async () => {
    const blockNumber = 25_500_150;
    const timestamp = YBC_GENESIS + YBC_EPOCH_SECONDS + 150;
    const member = "0x1212121212121212121212121212121212121212" as const;
    const operator = "0x3434343434343434343434343434343434343434" as const;
    const unrelatedTarget = "0x5656565656565656565656565656565656565656" as const;
    const transactionHash = `0x${"7".repeat(64)}`;
    const memberCalldata = `${toFunctionSelector("add_member(address)")}${member.slice(2).padStart(64, "0")}`;
    const call = (target: `0x${string}`, data: `0x${string}`, logIndex: number) => eventLog({
      address: YBC,
      topics: encodeEventTopics({
        abi: YBC_EVENTS_ABI,
        eventName: "Call",
        args: { operator, target },
      }),
      data: encodeAbiParameters(parseAbiParameters("bytes"), [data]),
      blockNumber,
      transactionHash,
      logIndex,
    });
    const memberAdded = eventLog({
      address: YBC,
      topics: encodeEventTopics({
        abi: YBC_EVENTS_ABI,
        eventName: "AddMember",
        args: { member },
      }),
      blockNumber,
      transactionHash,
      logIndex: 2,
    });
    const unrelated = call(unrelatedTarget, "0x12345678", 0);
    const matching = call(YBC, memberCalldata as `0x${string}`, 1);
    const rpcFor = (fixed: readonly RpcLog[]) => ({
      ...emptyRpc(),
      getBlockByNumber: async (number: BlockTag) => ({
        ...block(number === "latest" ? blockNumber : number),
        timestamp: timestamp + (number === blockNumber ? 0 : -1),
      }),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === YBC.toLowerCase()) ? fixed : [],
      call: async (request: { data: string }) => {
        if (request.data.startsWith(toFunctionSelector("weight_aggregator()"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight_aggregator", result: YBC_WEIGHT_AGGREGATOR });
        }
        if (request.data.startsWith(toFunctionSelector("weight(address)"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight", result: 12n });
        }
        throw new Error("unexpected exact read");
      },
    }) as unknown as RpcClient;

    const accepted = await scanYbcBlocks({
      rpc: rpcFor([unrelated, matching, memberAdded]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYbcState(),
    });
    expect(accepted.failure).toBeNull();
    expect(accepted.actions.map((action) => action.kind)).toEqual([
      "ybc_unrecognized_call",
      "ybc_member_added",
    ]);

    const duplicate = await scanYbcBlocks({
      rpc: rpcFor([matching, { ...matching, logIndex: 3 }, memberAdded]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYbcState(),
    });
    expect(duplicate.failure).toMatchObject({
      reason: "ybc_membership_call_ambiguous",
      contract: YBC.toLowerCase(),
      blockNumber,
      transactionHash,
      eventName: "AddMember",
    });
    expect(duplicate.actions).toEqual([]);

    const missing = await scanYbcBlocks({
      rpc: rpcFor([unrelated, memberAdded]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYbcState(),
    });
    expect(missing.failure?.reason).toBe("ybc_membership_call_missing");
    expect(missing.actions).toEqual([]);

    const removeCalldata = `${toFunctionSelector("remove_member(address)")}${member.slice(2).padStart(64, "0")}`;
    const malformed = await scanYbcBlocks({
      rpc: rpcFor([call(YBC, removeCalldata as `0x${string}`, 1), memberAdded]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYbcState(),
    });
    expect(malformed.failure?.reason).toBe("ybc_membership_call_mismatch");
    expect(malformed.actions).toEqual([]);
  });

  it("rejects a syntactically valid log from a noncanonical block", async () => {
    const blockNumber = 25_228_044;
    const log = eventLog({
      address: YBC_REWARD_DISTRIBUTOR,
      topics: encodeEventTopics({ abi: YBC_REWARD_DISTRIBUTOR_EVENTS_ABI, eventName: "Kill" }),
      blockNumber,
      blockHash: `0x${"f".repeat(64)}`,
      transactionHash: `0x${"1".repeat(64)}`,
      logIndex: 0,
    });
    const rpc = {
      ...emptyRpc(),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === YBC.toLowerCase()) ? [log] : [],
    } as unknown as RpcClient;

    const result = await scanYbcBlocks({ rpc, fromBlock: blockNumber, toBlock: blockNumber, state: createEmptyYbcState() });

    expect(result.failure).toMatchObject({
      reason: "product_scan_log_not_canonical",
      contract: YBC_REWARD_DISTRIBUTOR.toLowerCase(),
      blockNumber,
      transactionHash: log.transactionHash,
    });
  });

  it("keeps transaction evidence on stake-driven B14 alerts", async () => {
    const blockNumber = 25_500_200;
    const timestamp = YBC_GENESIS + YBC_EPOCH_SECONDS + 200;
    const member = "0x3333333333333333333333333333333333333333";
    const receiver = "0x4444444444444444444444444444444444444444";
    const transactionHash = `0x${"2".repeat(64)}`;
    const transfer = eventLog({
      address: STYFI,
      topics: [ERC20_TRANSFER_TOPIC, pad(member, { size: 32 }), pad(receiver, { size: 32 })],
      data: pad("0x01", { size: 32 }),
      blockNumber,
      transactionHash,
      logIndex: 9,
    });
    const rpc = {
      ...emptyRpc(),
      getBlockByNumber: async (number: BlockTag) => ({
        ...block(number === "latest" ? blockNumber : number),
        timestamp,
      }),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === STYFI.toLowerCase()) ? [transfer] : [],
      call: async (request: { data: string }) => {
        if (request.data.startsWith(toFunctionSelector("weight_aggregator()"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight_aggregator", result: YBC_WEIGHT_AGGREGATOR });
        }
        if (request.data.startsWith(toFunctionSelector("weight(address)"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight", result: 20n });
        }
        throw new Error("unexpected exact read");
      },
    } as unknown as RpcClient;
    const state = loadYbcState({
      members: [member],
      votersByProposal: {},
      lastCollectivePower: "10",
      lastEpoch: epochFor(timestamp),
    });

    const result = await scanYbcBlocks({ rpc, fromBlock: blockNumber, toBlock: blockNumber, state });
    const power = result.actions.find((action) => action.kind === "ybc_collective_power_changed");

    expect(result.failure).toBeNull();
    expect(power).toMatchObject({
      txHash: transactionHash,
      logIndex: 9,
      source: { kind: "onchain", txHash: transactionHash, logIndex: 9 },
    });
    expect(renderProductAlertAction(power!, {
      kind: "resolved",
      blockNumber,
      blockHash: block(blockNumber).hash,
      seconds: timestamp,
    })).toContain(`/tx/${transactionHash}`);
  });

  it("emits each changed B14 epoch ramp and suppresses the unchanged checkpoint", async () => {
    const fromBlock = 100;
    const toBlock = 105;
    const member = "0x4545454545454545454545454545454545454545";
    const rpc = {
      ...emptyRpc(),
      getBlockByNumber: async (number: BlockTag) => {
        const resolved = number === "latest" ? toBlock : number;
        return {
          ...block(resolved),
          timestamp: YBC_GENESIS + (resolved - fromBlock) * YBC_EPOCH_SECONDS,
        };
      },
      getLogs: async () => [],
      call: async (request: { data: string }, reference?: { blockHash: string }) => {
        if (request.data.startsWith(toFunctionSelector("weight_aggregator()"))) {
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight_aggregator", result: YBC_WEIGHT_AGGREGATOR });
        }
        if (request.data.startsWith(toFunctionSelector("weight(address)"))) {
          const atBlock = reference === undefined ? fromBlock : Number(BigInt(reference.blockHash));
          const ramp = BigInt(Math.min(100, Math.max(0, atBlock - fromBlock) * 25));
          return encodeFunctionResult({ abi: YBC_READ_ABI, functionName: "weight", result: ramp });
        }
        throw new Error("unexpected exact read");
      },
    } as unknown as RpcClient;
    const state = loadYbcState({
      members: [member],
      votersByProposal: {},
      lastCollectivePower: "0",
      lastEpoch: 0,
    });

    const result = await scanYbcBlocks({ rpc, fromBlock, toBlock, state });
    const ramps = result.actions.filter((candidate) => candidate.kind === "ybc_collective_power_changed");

    expect(result.failure).toBeNull();
    expect(ramps.map((candidate) => candidate.blockNumber)).toEqual([101, 102, 103, 104]);
    expect(ramps).toMatchObject([
      { details: { previousPower: 0n, currentPower: 25n, cause: "epoch weight ramp" } },
      { details: { previousPower: 25n, currentPower: 50n, cause: "epoch weight ramp" } },
      { details: { previousPower: 50n, currentPower: 75n, cause: "epoch weight ramp" } },
      { details: { previousPower: 75n, currentPower: 100n, cause: "epoch weight ramp" } },
    ]);
    expect(result.state.lastCollectivePower).toBe(100n);
    expect(result.state.lastEpoch).toBe(5);
  });

  it("pairs multiple team bonus calls independently for Teams and YBC", async () => {
    const blockNumber = 25_500_300;
    const timestamp = YBC_GENESIS + YBC_EPOCH_SECONDS + 300;
    const transactionHash = `0x${"3".repeat(64)}`;
    const teams = [
      "0x5555555555555555555555555555555555555555",
      "0x6666666666666666666666666666666666666666",
    ] as const;
    const recipient = "0x7777777777777777777777777777777777777777";
    const claimsAndDeposits = teams.flatMap((team, index) => {
      const amount = BigInt(index + 2);
      return [
        eventLog({
          address: BONUS_DISTRIBUTOR,
          topics: encodeEventTopics({ abi: BONUS_DISTRIBUTOR_EVENTS_ABI, eventName: "ClaimBonus", args: { team, period: BigInt(index + 1) } }),
          data: encodeAbiParameters(parseAbiParameters("uint256, uint256, address"), [amount * 10n, amount, recipient]),
          blockNumber,
          transactionHash,
          logIndex: index * 2,
        }),
        eventLog({
          address: YBC_BONUS_RECIPIENT,
          topics: encodeEventTopics({ abi: YBC_BONUS_RECIPIENT_EVENTS_ABI, eventName: "Deposit", args: { depositor: BONUS_DISTRIBUTOR } }),
          data: encodeAbiParameters(parseAbiParameters("uint256"), [amount]),
          blockNumber,
          transactionHash,
          logIndex: index * 2 + 1,
        }),
      ];
    });
    const rpc = {
      ...emptyRpc(),
      getBlockByNumber: async (number: BlockTag) => ({
        ...block(number === "latest" ? blockNumber : number),
        timestamp,
      }),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.some((address) => address.toLowerCase() === BONUS_DISTRIBUTOR.toLowerCase())
          ? claimsAndDeposits
          : [],
      call: async (request: { to: string; data: string }) => {
        if (request.data.startsWith(toFunctionSelector("name()"))) {
          return encodeFunctionResult({
            abi: TEAMS_READ_ABI,
            functionName: "name",
            result: request.to.toLowerCase() === teams[0] ? "Team A" : "Team B",
          });
        }
        throw new Error("unexpected exact read");
      },
    } as unknown as RpcClient;
    const teamsState = loadTeamsState({ teams: teams.map((address, index) => ({ address, index: index.toString() })) });
    const ybcState = loadYbcState({
      members: [],
      votersByProposal: {},
      lastCollectivePower: "0",
      lastEpoch: epochFor(timestamp),
    });

    const [teamsResult, ybcResult] = await Promise.all([
      scanTeamsBlocks({ rpc, fromBlock: blockNumber, toBlock: blockNumber, state: teamsState }),
      scanYbcBlocks({ rpc, fromBlock: blockNumber, toBlock: blockNumber, state: ybcState }),
    ]);

    expect(teamsResult.failure).toBeNull();
    expect(ybcResult.failure).toBeNull();
    expect(teamsResult.actions.map((action) => action.kind)).toEqual([
      "team_bonus_claimed",
      "team_bonus_claimed",
    ]);
    expect(ybcResult.actions.map((action) => action.kind)).toEqual([
      "ybc_team_bonus_received",
      "ybc_team_bonus_received",
    ]);
    expect(ybcResult.actions.map((action) =>
      action.kind === "ybc_team_bonus_received" ? action.details.sourceTeam : null
    )).toEqual([...teams]);
  });

  it("suppresses zero revenue, bonus, revenue-adjustment, and cost-adjustment no-ops", async () => {
    const blockNumber = 25_500_400;
    const team = "0x8888888888888888888888888888888888888888";
    const token = "0x9999999999999999999999999999999999999999";
    const actor = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const revenueTx = `0x${"4".repeat(64)}`;
    const adjustmentTx = `0x${"5".repeat(64)}`;
    const bonusTx = `0x${"6".repeat(64)}`;
    const teamDeposit = eventLog({
      address: team,
      topics: encodeEventTopics({ abi: TEAM_EVENTS_ABI, eventName: "DepositRevenue", args: { period: 2n } }),
      data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [token, 0n, 0n, actor]),
      blockNumber,
      transactionHash: revenueTx,
      logIndex: 2,
    });
    const fixed = [
      eventLog({
        address: TEAM_ACCOUNTANT,
        topics: encodeEventTopics({ abi: TEAM_ACCOUNTANT_EVENTS_ABI, eventName: "AdjustRevenue", args: { operator: REVENUE_RECIPIENT, team, period: 2n } }),
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [0n, true]),
        blockNumber,
        transactionHash: revenueTx,
        logIndex: 0,
      }),
      eventLog({
        address: REVENUE_RECIPIENT,
        topics: encodeEventTopics({ abi: REVENUE_RECIPIENT_EVENTS_ABI, eventName: "DepositRevenue", args: { team, period: 2n } }),
        data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256"), [token, 0n, 0n]),
        blockNumber,
        transactionHash: revenueTx,
        logIndex: 1,
      }),
      eventLog({
        address: TEAM_ACCOUNTANT,
        topics: encodeEventTopics({ abi: TEAM_ACCOUNTANT_EVENTS_ABI, eventName: "AdjustRevenue", args: { operator: actor, team, period: 2n } }),
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [0n, true]),
        blockNumber,
        transactionHash: adjustmentTx,
        logIndex: 3,
      }),
      eventLog({
        address: TEAM_ACCOUNTANT,
        topics: encodeEventTopics({ abi: TEAM_ACCOUNTANT_EVENTS_ABI, eventName: "AdjustCost", args: { operator: actor, team, period: 2n } }),
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [0n, false]),
        blockNumber,
        transactionHash: adjustmentTx,
        logIndex: 4,
      }),
      eventLog({
        address: BONUS_DISTRIBUTOR,
        topics: encodeEventTopics({ abi: BONUS_DISTRIBUTOR_EVENTS_ABI, eventName: "ClaimBonus", args: { team, period: 2n } }),
        data: encodeAbiParameters(parseAbiParameters("uint256, uint256, address"), [0n, 0n, actor]),
        blockNumber,
        transactionHash: bonusTx,
        logIndex: 5,
      }),
    ];
    const rpc = {
      ...emptyRpc(),
      getLogs: async (filter: { address?: string[] }) =>
        filter.address?.length === 1 && filter.address[0]?.toLowerCase() === team
          ? [teamDeposit]
          : fixed,
      call: async (request: { data: string }) => {
        if (request.data.startsWith(toFunctionSelector("name()"))) {
          return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "name", result: "No-op Team" });
        }
        throw new Error("unexpected exact read");
      },
    } as unknown as RpcClient;
    const state = loadTeamsState({ teams: [{ address: team, index: "0" }] });

    const result = await scanTeamsBlocks({ rpc, fromBlock: blockNumber, toBlock: blockNumber, state });

    expect(result.failure).toBeNull();
    expect(result.actions).toEqual([]);
  });
});
