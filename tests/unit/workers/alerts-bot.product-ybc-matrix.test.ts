import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  pad,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";

import { ERC20_TRANSFER_TOPIC } from "@/workers/alerts-bot/src/abis";
import {
  createEmptyYbcState,
  loadYbcState,
  scanYbcBlocks,
} from "@/workers/alerts-bot/src/domains/ybc/scanner";
import {
  YBC_ELECTION_EVENTS_ABI,
  YBC_EVENTS_ABI,
  YBC_READ_ABI,
} from "@/workers/alerts-bot/src/product-abis";
import {
  STYFI,
  STYFIX,
  YBC,
  YBC_ELECTION,
  YBC_EPOCH_SECONDS,
  YBC_GENESIS,
  YBC_REWARD_DISTRIBUTOR,
  YBC_WEIGHT_AGGREGATOR,
} from "@/workers/alerts-bot/src/contracts";
import type {
  BlockTag,
  RpcBlock,
  RpcClient,
  RpcLog,
} from "@/workers/alerts-bot/src/rpc";

const BLOCK_NUMBER = 25_800_000;
const TIMESTAMP = YBC_GENESIS + 3 * YBC_EPOCH_SECONDS + 600;
const MEMBER = "0x1111111111111111111111111111111111111111";
const ACTOR = "0x2222222222222222222222222222222222222222";
const OPERATOR = "0x3333333333333333333333333333333333333333";
const TX = `0x${"a".repeat(64)}`;

function block(number: number): RpcBlock {
  return {
    number,
    hash: `0x${number.toString(16).padStart(64, "0")}`,
    parentHash: `0x${Math.max(0, number - 1).toString(16).padStart(64, "0")}`,
    timestamp: TIMESTAMP + number - BLOCK_NUMBER,
  };
}

function eventLog(params: {
  readonly address: string;
  readonly abi: typeof YBC_EVENTS_ABI | typeof YBC_ELECTION_EVENTS_ABI;
  readonly eventName: string;
  readonly indexedArgs?: Record<string, unknown>;
  readonly data?: `0x${string}`;
  readonly logIndex: number;
  readonly transactionHash?: string;
  readonly blockNumber?: number;
}): RpcLog {
  const blockNumber = params.blockNumber ?? BLOCK_NUMBER;
  return {
    address: params.address,
    topics: encodeEventTopics({
      abi: params.abi,
      eventName: params.eventName,
      args: params.indexedArgs ?? {},
    } as never) as string[],
    data: params.data ?? "0x",
    blockHash: block(blockNumber).hash,
    blockNumber,
    transactionHash: params.transactionHash ?? TX,
    logIndex: params.logIndex,
    removed: false,
  };
}

function transfer(params: {
  readonly from: string;
  readonly to: string;
  readonly token?: string;
  readonly logIndex: number;
  readonly transactionHash?: string;
}): RpcLog {
  return {
    address: params.token ?? STYFI,
    topics: [
      ERC20_TRANSFER_TOPIC,
      pad(params.from as `0x${string}`, { size: 32 }),
      pad(params.to as `0x${string}`, { size: 32 }),
    ],
    data: pad("0x01", { size: 32 }),
    blockHash: block(BLOCK_NUMBER).hash,
    blockNumber: BLOCK_NUMBER,
    transactionHash: params.transactionHash ?? TX,
    logIndex: params.logIndex,
    removed: false,
  };
}

function memberData(addition: boolean): `0x${string}` {
  const selector = toFunctionSelector(
    addition ? "add_member(address)" : "remove_member(address)",
  );
  return `${selector}${MEMBER.slice(2).padStart(64, "0")}`;
}

function membershipLogs(params: {
  readonly addition: boolean;
  readonly execution: boolean;
}): RpcLog[] {
  const logs = [
    eventLog({
      address: YBC,
      abi: YBC_EVENTS_ABI,
      eventName: "Call",
      indexedArgs: {
        operator: params.execution ? YBC_ELECTION : OPERATOR,
        target: YBC,
      },
      data: encodeAbiParameters(
        parseAbiParameters("bytes"),
        [memberData(params.addition)],
      ),
      logIndex: 0,
    }),
    eventLog({
      address: YBC,
      abi: YBC_EVENTS_ABI,
      eventName: params.addition ? "AddMember" : "RemoveMember",
      indexedArgs: { member: MEMBER },
      logIndex: 1,
    }),
  ];
  if (params.execution) {
    logs.push(eventLog({
      address: YBC_ELECTION,
      abi: YBC_ELECTION_EVENTS_ABI,
      eventName: "Execute",
      indexedArgs: { executor: ACTOR, idx: 7n },
      logIndex: 2,
    }));
  }
  return logs;
}

function ybcRpc(params: {
  readonly fixed?: readonly RpcLog[];
  readonly transfers?: readonly RpcLog[];
  readonly currentWeight?: bigint;
  readonly proposal?: boolean;
  readonly observeAddresses?: (addresses: readonly string[]) => void;
  readonly observeWeightAccount?: (account: string) => void;
}): RpcClient {
  const fixed = params.fixed ?? [];
  const transfers = params.transfers ?? [];
  return {
    getBlockNumber: async () => BLOCK_NUMBER,
    getBlockByNumber: async (number: BlockTag) =>
      block(number === "latest" ? BLOCK_NUMBER : number),
    getLogs: async (filter: { address?: readonly string[] }) => {
      const addresses = filter.address ?? [];
      params.observeAddresses?.(addresses);
      return addresses.some((address) => address.toLowerCase() === STYFI.toLowerCase())
        ? [...transfers]
        : [...fixed];
    },
    getTransactionByHash: async () => null,
    getTransactionReceipt: async () => null,
    call: async (request: { data: string }) => {
      if (request.data.startsWith(toFunctionSelector("proposals(uint256)"))) {
        if (params.proposal !== true) throw new Error("unexpected proposal read");
        return encodeFunctionResult({
          abi: YBC_READ_ABI,
          functionName: "proposals",
          result: [MEMBER, ACTOR, 3n, true, 6_000n, 10n, 10n, false, true],
        });
      }
      if (request.data.startsWith(toFunctionSelector("weight_aggregator()"))) {
        return encodeFunctionResult({
          abi: YBC_READ_ABI,
          functionName: "weight_aggregator",
          result: YBC_WEIGHT_AGGREGATOR,
        });
      }
      if (request.data.startsWith(toFunctionSelector("weight(address)"))) {
        params.observeWeightAccount?.(`0x${request.data.slice(-40)}`.toLowerCase());
        return encodeFunctionResult({
          abi: YBC_READ_ABI,
          functionName: "weight",
          result: params.currentWeight ?? 10n,
        });
      }
      throw new Error(`unexpected exact read ${request.data.slice(0, 10)}`);
    },
  } as unknown as RpcClient;
}

function epochForTimestamp(timestamp: number) {
  return Math.floor((timestamp - YBC_GENESIS) / YBC_EPOCH_SECONDS);
}

function epoch() {
  return epochForTimestamp(TIMESTAMP);
}

describe("YBC mandatory regression matrix", () => {
  it("ignores the production RewardDistributor topic collision at block 25,228,860", async () => {
    const blockNumber = 25_228_860;
    const transactionHash = "0x1fec1f37922a2e672d1711162d7b8e386711dc2d7fba6ffaf5d59c847cc2b63b";
    const collision = eventLog({
      address: YBC_REWARD_DISTRIBUTOR,
      abi: YBC_ELECTION_EVENTS_ABI,
      eventName: "SetWeightAggregator",
      indexedArgs: { aggregator: YBC_WEIGHT_AGGREGATOR },
      blockNumber,
      transactionHash,
      logIndex: 1,
    });
    const initial = loadYbcState({
      members: [],
      votersByProposal: {},
      lastCollectivePower: "0",
      lastEpoch: epochForTimestamp(block(blockNumber).timestamp!),
    });

    const result = await scanYbcBlocks({
      rpc: ybcRpc({ fixed: [collision], currentWeight: 0n }),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: initial,
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toEqual([]);
    expect(result.state.lastCollectivePower).toBe(0n);
  });

  it("fails closed for missing, malformed, duplicated, and contradictory B4 companions", async () => {
    const valid = membershipLogs({ addition: true, execution: true });
    const call = valid[0]!;
    const member = valid[1]!;
    const execute = valid[2]!;
    const contradictoryCall = {
      ...call,
      data: encodeAbiParameters(parseAbiParameters("bytes"), [memberData(false)]),
    };
    const cases = [
      { label: "missing", fixed: [member, execute] },
      { label: "malformed", fixed: [{ ...call, data: encodeAbiParameters(parseAbiParameters("bytes"), ["0x12"]) }, member, execute] },
      { label: "duplicated", fixed: [call, { ...call, logIndex: 3 }, member, execute] },
      { label: "contradictory", fixed: [contradictoryCall, member, execute] },
    ];

    for (const value of cases) {
      const initial = createEmptyYbcState();
      const result = await scanYbcBlocks({
        rpc: ybcRpc({ fixed: value.fixed, proposal: true }),
        fromBlock: BLOCK_NUMBER,
        toBlock: BLOCK_NUMBER,
        state: initial,
      });
      expect(result.failure, value.label).not.toBeNull();
      expect(result.actions, value.label).toEqual([]);
      expect(result.state, value.label).toBe(initial);
    }
  });

  it("excludes YBC-held stYFI and all stYFIx delegation transfers", async () => {
    const queries: string[][] = [];
    const weightAccounts: string[] = [];
    const ybcHeld = transfer({ from: YBC, to: ACTOR, logIndex: 0 });
    const delegation = transfer({
      from: ACTOR,
      to: MEMBER,
      token: STYFIX,
      logIndex: 1,
    });
    const rpc = ybcRpc({
      transfers: [ybcHeld],
      currentWeight: 10n,
      observeAddresses: (addresses) => queries.push([...addresses]),
      observeWeightAccount: (account) => weightAccounts.push(account),
    });
    const initial = loadYbcState({
      members: [MEMBER],
      votersByProposal: {},
      lastCollectivePower: "10",
      lastEpoch: epoch(),
    });

    const result = await scanYbcBlocks({
      rpc,
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: initial,
    });

    expect(delegation.address.toLowerCase()).toBe(STYFIX.toLowerCase());
    expect(queries.some((addresses) =>
      addresses.some((address) => address.toLowerCase() === STYFIX.toLowerCase())
    )).toBe(false);
    expect(result.failure).toBeNull();
    expect(result.actions).toEqual([]);
    expect(weightAccounts).toEqual([MEMBER]);
    expect(result.state.lastCollectivePower).toBe(10n);
  });

  it("suppresses a target-weight configuration change with no effective change", async () => {
    const configured = eventLog({
      address: YBC_WEIGHT_AGGREGATOR,
      abi: YBC_ELECTION_EVENTS_ABI,
      eventName: "SetWeightAggregator",
      indexedArgs: { aggregator: YBC_WEIGHT_AGGREGATOR },
      logIndex: 0,
    });
    const initial = loadYbcState({
      members: [MEMBER],
      votersByProposal: {},
      lastCollectivePower: "10",
      lastEpoch: epoch(),
    });

    const result = await scanYbcBlocks({
      rpc: ybcRpc({ fixed: [configured], currentWeight: 10n }),
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: initial,
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toEqual([]);
    expect(result.state.lastCollectivePower).toBe(10n);
  });

  it("aggregates same-block member stake changes into one B14 with the last cause", async () => {
    const firstTx = `0x${"b".repeat(64)}`;
    const lastTx = `0x${"c".repeat(64)}`;
    const changes = [
      transfer({ from: MEMBER, to: ACTOR, logIndex: 2, transactionHash: firstTx }),
      transfer({ from: ACTOR, to: MEMBER, logIndex: 7, transactionHash: lastTx }),
    ];
    const initial = loadYbcState({
      members: [MEMBER],
      votersByProposal: {},
      lastCollectivePower: "10",
      lastEpoch: epoch(),
    });

    const result = await scanYbcBlocks({
      rpc: ybcRpc({ transfers: changes, currentWeight: 20n }),
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: initial,
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toMatchObject([{
      kind: "ybc_collective_power_changed",
      txHash: lastTx,
      logIndex: 7,
      details: { previousPower: 10n, currentPower: 20n },
    }]);
  });

  it.each([
    { alert: "ybc_proposal_executed", addition: true, execution: true },
    { alert: "ybc_member_added", addition: true, execution: false },
    { alert: "ybc_member_removed", addition: false, execution: false },
  ] as const)("suppresses B14 when $alert already reports the membership change", async ({
    alert,
    addition,
    execution,
  }) => {
    const initial = loadYbcState({
      members: addition ? [] : [MEMBER],
      votersByProposal: {},
      lastCollectivePower: addition ? "0" : "20",
      lastEpoch: epoch(),
    });
    const result = await scanYbcBlocks({
      rpc: ybcRpc({
        fixed: membershipLogs({ addition, execution }),
        currentWeight: 20n,
        proposal: execution,
      }),
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: initial,
    });

    expect(result.failure).toBeNull();
    expect(result.actions.map((action) => action.kind)).toEqual([alert]);
    expect(result.actions.some((action) =>
      action.kind === "ybc_collective_power_changed"
    )).toBe(false);
  });
});
