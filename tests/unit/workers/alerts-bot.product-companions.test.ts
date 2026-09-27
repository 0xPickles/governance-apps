import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  parseAbiParameters,
  toFunctionSelector,
  type Abi,
} from "viem";

import {
  loadTeamsState,
  scanTeamsBlocks,
} from "@/workers/alerts-bot/src/domains/teams/scanner";
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
} from "@/workers/alerts-bot/src/product-abis";
import {
  BONUS_DISTRIBUTOR,
  FUNDING_DISTRIBUTOR,
  REVENUE_RECIPIENT,
  TEAM_ACCOUNTANT,
  TEAM_REGISTRY,
  TEAMS_BUDGET_GENESIS,
  TEAMS_PERIOD_SECONDS,
  YBC_BONUS_RECIPIENT,
} from "@/workers/alerts-bot/src/contracts";
import type {
  BlockTag,
  RpcBlock,
  RpcClient,
  RpcLog,
} from "@/workers/alerts-bot/src/rpc";

const BLOCK_NUMBER = 25_700_500;
const TEAM = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const ACTOR = "0x3333333333333333333333333333333333333333";
const VEST = "0x4444444444444444444444444444444444444444";
const TRANSACTION_HASH = `0x${"a".repeat(64)}`;

function block(number: number): RpcBlock {
  return {
    number,
    hash: `0x${number.toString(16).padStart(64, "0")}`,
    parentHash: `0x${Math.max(0, number - 1).toString(16).padStart(64, "0")}`,
    timestamp: TEAMS_BUDGET_GENESIS + 2 * TEAMS_PERIOD_SECONDS + 500,
  };
}

function eventLog(params: {
  readonly abi: Abi;
  readonly eventName: string;
  readonly indexedArgs: Record<string, unknown>;
  readonly data?: `0x${string}`;
  readonly address: string;
  readonly logIndex: number;
}): RpcLog {
  return {
    address: params.address,
    topics: encodeEventTopics({
      abi: params.abi,
      eventName: params.eventName,
      args: params.indexedArgs,
    } as never) as string[],
    data: params.data ?? "0x",
    blockHash: block(BLOCK_NUMBER).hash,
    blockNumber: BLOCK_NUMBER,
    transactionHash: TRANSACTION_HASH,
    logIndex: params.logIndex,
    removed: false,
  };
}

function teamsRpc(
  fixed: readonly RpcLog[],
  dynamic: readonly RpcLog[],
  migrationRegistry: `0x${string}` = TOKEN,
): RpcClient {
  return {
    getBlockNumber: async () => BLOCK_NUMBER,
    getBlockByNumber: async (number: BlockTag) =>
      block(number === "latest" ? BLOCK_NUMBER : number),
    getLogs: async (filter: { address?: readonly string[] }) =>
      filter.address?.some((address) => address.toLowerCase() === TEAM_REGISTRY.toLowerCase())
        ? [...fixed]
        : [...dynamic],
    getTransactionByHash: async () => null,
    getTransactionReceipt: async () => null,
    call: async (request: { data: string }) => {
      if (request.data.startsWith(toFunctionSelector("name()"))) {
        return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "name", result: "Batched Team" });
      }
      if (request.data.startsWith(toFunctionSelector("registry()"))) {
        return encodeFunctionResult({
          abi: TEAMS_READ_ABI,
          functionName: "registry",
          result: migrationRegistry,
        });
      }
      if (request.data.startsWith(toFunctionSelector("team_revenues(address,uint256)"))) {
        return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "team_revenues", result: 30n });
      }
      if (request.data.startsWith(toFunctionSelector("team_costs(address,uint256)"))) {
        return encodeFunctionResult({ abi: TEAMS_READ_ABI, functionName: "team_costs", result: 12n });
      }
      if (request.data.startsWith(toFunctionSelector("approvals(uint256)"))) {
        const index = BigInt(`0x${request.data.slice(-64)}`);
        return encodeFunctionResult({
          abi: TEAMS_READ_ABI,
          functionName: "approvals",
          result: [TEAM, 2n, TOKEN, 10n, 86_400n, index === 1n ? 2n : 3n],
        });
      }
      if (request.data.startsWith(toFunctionSelector("symbol()"))) {
        return encodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "symbol", result: "TOK" });
      }
      if (request.data.startsWith(toFunctionSelector("decimals()"))) {
        return encodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "decimals", result: 18 });
      }
      throw new Error(`unexpected exact read ${request.data.slice(0, 10)}`);
    },
  } as unknown as RpcClient;
}

function state() {
  return loadTeamsState({ teams: [{ address: TEAM, index: "0" }] });
}

function revenueLogs(params: {
  readonly amount: bigint;
  readonly revenue: bigint;
  readonly primaryIndex: number;
  readonly accountantIndex: number;
  readonly recipientIndex: number;
}) {
  return {
    primary: eventLog({
      abi: TEAM_EVENTS_ABI,
      eventName: "DepositRevenue",
      indexedArgs: { period: 2n },
      data: encodeAbiParameters(
        parseAbiParameters("address, uint256, uint256, address"),
        [TOKEN, params.amount, params.revenue, ACTOR],
      ),
      address: TEAM,
      logIndex: params.primaryIndex,
    }),
    accountant: eventLog({
      abi: TEAM_ACCOUNTANT_EVENTS_ABI,
      eventName: "AdjustRevenue",
      indexedArgs: { operator: REVENUE_RECIPIENT, team: TEAM, period: 2n },
      data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [params.revenue, true]),
      address: TEAM_ACCOUNTANT,
      logIndex: params.accountantIndex,
    }),
    recipient: eventLog({
      abi: REVENUE_RECIPIENT_EVENTS_ABI,
      eventName: "DepositRevenue",
      indexedArgs: { team: TEAM, period: 2n },
      data: encodeAbiParameters(
        parseAbiParameters("address, uint256, uint256"),
        [TOKEN, params.amount, params.revenue],
      ),
      address: REVENUE_RECIPIENT,
      logIndex: params.recipientIndex,
    }),
  };
}

function fundingLogs(kind: "ClaimFunding" | "ReturnFunding") {
  const claim = kind === "ClaimFunding";
  const primary = eventLog({
    abi: TEAM_EVENTS_ABI,
    eventName: kind,
    indexedArgs: { idx: claim ? 1n : 2n, period: 2n },
    data: claim
      ? encodeAbiParameters(
          parseAbiParameters("address, uint256, uint256, address, address"),
          [TOKEN, 2n, 4n, VEST, ACTOR],
        )
      : encodeAbiParameters(
          parseAbiParameters("address, uint256, uint256, address"),
          [TOKEN, 3n, 2n, ACTOR],
        ),
    address: TEAM,
    logIndex: 0,
  });
  const distributor = eventLog({
    abi: FUNDING_DISTRIBUTOR_EVENTS_ABI,
    eventName: kind,
    indexedArgs: { idx: claim ? 1n : 2n, team: TEAM, period: 2n },
    data: claim
      ? encodeAbiParameters(
          parseAbiParameters("address, uint256, uint256, address, address"),
          [TOKEN, 2n, 4n, VEST, ACTOR],
        )
      : encodeAbiParameters(
          parseAbiParameters("address, uint256, uint256, address"),
          [TOKEN, 3n, 2n, ACTOR],
        ),
    address: FUNDING_DISTRIBUTOR,
    logIndex: 1,
  });
  const accounting = eventLog({
    abi: TEAM_ACCOUNTANT_EVENTS_ABI,
    eventName: "AdjustCost",
    indexedArgs: { operator: FUNDING_DISTRIBUTOR, team: TEAM, period: 2n },
    data: encodeAbiParameters(
      parseAbiParameters("uint256, bool"),
      [claim ? 4n : 2n, claim],
    ),
    address: TEAM_ACCOUNTANT,
    logIndex: 2,
  });
  const contradictory = {
    ...distributor,
    data: claim
      ? encodeAbiParameters(
          parseAbiParameters("address, uint256, uint256, address, address"),
          [TOKEN, 9n, 4n, VEST, ACTOR],
        )
      : encodeAbiParameters(
          parseAbiParameters("address, uint256, uint256, address"),
          [TOKEN, 9n, 2n, ACTOR],
        ),
  };
  return { primary, distributor, accounting, contradictory };
}

describe("Teams companion reconciliation", () => {
  it.each([
    { label: "missing", companions: () => [] },
    { label: "malformed", companions: (valid: RpcLog) => [{ ...valid, topics: [valid.topics[0]!, "0x12"] }] },
    { label: "duplicated", companions: (valid: RpcLog) => [valid, { ...valid, logIndex: 2 }] },
    { label: "contradictory", companions: (valid: RpcLog) => [valid] },
  ])("fails closed for a $label T4 migration companion", async ({ label, companions }) => {
    const migration = eventLog({
      abi: TEAM_REGISTRY_EVENTS_ABI,
      eventName: "MigrateTeam",
      indexedArgs: { team: TEAM },
      address: TEAM_REGISTRY,
      logIndex: 0,
    });
    const teamMigration = eventLog({
      abi: TEAM_EVENTS_ABI,
      eventName: "Migrate",
      indexedArgs: { registry: TOKEN },
      address: TEAM,
      logIndex: 1,
    });
    const result = await scanTeamsBlocks({
      rpc: teamsRpc(
        [migration],
        companions(teamMigration),
        label === "contradictory" ? ACTOR : TOKEN,
      ),
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: state(),
    });

    expect(result.failure, label).not.toBeNull();
    expect(result.actions).toEqual([]);
    expect(result.state).toEqual(state());
  });

  it("pairs same-team revenue deposits by complete payload in either log order", async () => {
    const first = revenueLogs({
      amount: 3n,
      revenue: 9n,
      primaryIndex: 0,
      accountantIndex: 5,
      recipientIndex: 4,
    });
    const second = revenueLogs({
      amount: 4n,
      revenue: 10n,
      primaryIndex: 3,
      accountantIndex: 2,
      recipientIndex: 1,
    });

    const result = await scanTeamsBlocks({
      rpc: teamsRpc(
        [first.accountant, first.recipient, second.accountant, second.recipient],
        [first.primary, second.primary],
      ),
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: state(),
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toMatchObject([
      { kind: "team_revenue_deposited", details: { deposited: { value: 3n }, revenueUsd: 9n } },
      { kind: "team_revenue_deposited", details: { deposited: { value: 4n }, revenueUsd: 10n } },
    ]);
  });

  it("consumes identical revenue companions by canonical occurrence order", async () => {
    const first = revenueLogs({
      amount: 3n,
      revenue: 9n,
      primaryIndex: 0,
      accountantIndex: 1,
      recipientIndex: 2,
    });
    const second = revenueLogs({
      amount: 3n,
      revenue: 9n,
      primaryIndex: 3,
      accountantIndex: 4,
      recipientIndex: 5,
    });

    const result = await scanTeamsBlocks({
      rpc: teamsRpc(
        [first.accountant, first.recipient, second.accountant, second.recipient],
        [first.primary, second.primary],
      ),
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: state(),
    });

    expect(result.failure).toBeNull();
    expect(result.actions.map((action) => action.kind)).toEqual([
      "team_revenue_deposited",
      "team_revenue_deposited",
    ]);
    expect(result.actions.map((action) => action.logIndex)).toEqual([0, 3]);
  });

  it("pairs a same-team funding claim and return one-to-one in one transaction", async () => {
    const claimPrimary = eventLog({
      abi: TEAM_EVENTS_ABI,
      eventName: "ClaimFunding",
      indexedArgs: { idx: 1n, period: 2n },
      data: encodeAbiParameters(
        parseAbiParameters("address, uint256, uint256, address, address"),
        [TOKEN, 2n, 4n, VEST, ACTOR],
      ),
      address: TEAM,
      logIndex: 0,
    });
    const claimDistributor = eventLog({
      abi: FUNDING_DISTRIBUTOR_EVENTS_ABI,
      eventName: "ClaimFunding",
      indexedArgs: { idx: 1n, team: TEAM, period: 2n },
      data: encodeAbiParameters(
        parseAbiParameters("address, uint256, uint256, address, address"),
        [TOKEN, 2n, 4n, VEST, ACTOR],
      ),
      address: FUNDING_DISTRIBUTOR,
      logIndex: 1,
    });
    const claimAccounting = eventLog({
      abi: TEAM_ACCOUNTANT_EVENTS_ABI,
      eventName: "AdjustCost",
      indexedArgs: { operator: FUNDING_DISTRIBUTOR, team: TEAM, period: 2n },
      data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [4n, true]),
      address: TEAM_ACCOUNTANT,
      logIndex: 2,
    });
    const returnPrimary = eventLog({
      abi: TEAM_EVENTS_ABI,
      eventName: "ReturnFunding",
      indexedArgs: { idx: 2n, period: 2n },
      data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [TOKEN, 3n, 2n, ACTOR]),
      address: TEAM,
      logIndex: 3,
    });
    const returnDistributor = eventLog({
      abi: FUNDING_DISTRIBUTOR_EVENTS_ABI,
      eventName: "ReturnFunding",
      indexedArgs: { idx: 2n, team: TEAM, period: 2n },
      data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [TOKEN, 3n, 2n, ACTOR]),
      address: FUNDING_DISTRIBUTOR,
      logIndex: 4,
    });
    const returnAccounting = eventLog({
      abi: TEAM_ACCOUNTANT_EVENTS_ABI,
      eventName: "AdjustCost",
      indexedArgs: { operator: FUNDING_DISTRIBUTOR, team: TEAM, period: 2n },
      data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [2n, false]),
      address: TEAM_ACCOUNTANT,
      logIndex: 5,
    });

    const result = await scanTeamsBlocks({
      rpc: teamsRpc(
        [claimDistributor, claimAccounting, returnDistributor, returnAccounting],
        [claimPrimary, returnPrimary],
      ),
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: state(),
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toMatchObject([
      { kind: "team_funding_claimed", details: { approvalId: 1n, costUsd: 4n } },
      { kind: "team_funding_returned", details: { approvalId: 2n, refundUsd: 2n } },
    ]);
  });

  it.each(["ClaimFunding", "ReturnFunding"] as const)(
    "fails closed for missing, malformed, duplicated, and contradictory %s companions",
    async (kind) => {
      const logs = fundingLogs(kind);
      const cases = [
        { label: "missing", fixed: [logs.accounting] },
        { label: "malformed", fixed: [{ ...logs.distributor, data: "0x12" }, logs.accounting] },
        { label: "duplicated", fixed: [logs.distributor, { ...logs.distributor, logIndex: 3 }, logs.accounting] },
        { label: "contradictory", fixed: [logs.contradictory, logs.accounting] },
      ];

      for (const value of cases) {
        const result = await scanTeamsBlocks({
          rpc: teamsRpc(value.fixed, [logs.primary]),
          fromBlock: BLOCK_NUMBER,
          toBlock: BLOCK_NUMBER,
          state: state(),
        });
        expect(result.failure, `${kind}:${value.label}`).not.toBeNull();
        expect(result.actions, `${kind}:${value.label}`).toEqual([]);
        expect(result.state, `${kind}:${value.label}`).toEqual(state());
      }
    },
  );

  it("fails closed for missing, malformed, duplicated, and contradictory T11 deposits", async () => {
    const claim = eventLog({
      abi: BONUS_DISTRIBUTOR_EVENTS_ABI,
      eventName: "ClaimBonus",
      indexedArgs: { team: TEAM, period: 2n },
      data: encodeAbiParameters(
        parseAbiParameters("uint256, uint256, address"),
        [50n, 5n, ACTOR],
      ),
      address: BONUS_DISTRIBUTOR,
      logIndex: 0,
    });
    const deposit = eventLog({
      abi: YBC_BONUS_RECIPIENT_EVENTS_ABI,
      eventName: "Deposit",
      indexedArgs: { depositor: BONUS_DISTRIBUTOR },
      data: encodeAbiParameters(parseAbiParameters("uint256"), [5n]),
      address: YBC_BONUS_RECIPIENT,
      logIndex: 1,
    });
    const cases = [
      { label: "missing", fixed: [claim] },
      { label: "malformed", fixed: [claim, { ...deposit, data: "0x12" }] },
      { label: "duplicated", fixed: [claim, deposit, { ...deposit, logIndex: 2 }] },
      {
        label: "contradictory",
        fixed: [
          claim,
          {
            ...deposit,
            data: encodeAbiParameters(parseAbiParameters("uint256"), [6n]),
          },
        ],
      },
    ];

    for (const value of cases) {
      const result = await scanTeamsBlocks({
        rpc: teamsRpc(value.fixed, []),
        fromBlock: BLOCK_NUMBER,
        toBlock: BLOCK_NUMBER,
        state: state(),
      });
      expect(result.failure, value.label).not.toBeNull();
      expect(result.actions, value.label).toEqual([]);
      expect(result.state, value.label).toEqual(state());
    }
  });

  it.each([
    { label: "missing", fixed: (valid: ReturnType<typeof revenueLogs>) => [valid.recipient] },
    {
      label: "malformed",
      fixed: (valid: ReturnType<typeof revenueLogs>) => [
        { ...valid.accountant, data: "0x12" },
        valid.recipient,
      ],
    },
    {
      label: "contradictory",
      fixed: (valid: ReturnType<typeof revenueLogs>) => [
        valid.accountant,
        { ...valid.accountant, data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [10n, true]), logIndex: 3 },
        valid.recipient,
      ],
    },
  ])("fails closed for a $label revenue companion", async ({ label, fixed }) => {
    const valid = revenueLogs({
      amount: 3n,
      revenue: 9n,
      primaryIndex: 4,
      accountantIndex: 0,
      recipientIndex: 1,
    });

    const result = await scanTeamsBlocks({
      rpc: teamsRpc(fixed(valid), [valid.primary]),
      fromBlock: BLOCK_NUMBER,
      toBlock: BLOCK_NUMBER,
      state: state(),
    });

    expect(result.failure, label).not.toBeNull();
    expect(result.actions).toEqual([]);
    expect(result.state).toEqual(state());
    if (label === "missing") {
      expect(result.failure?.reason).toBe("teams_revenue_companion_missing");
    }
    if (label === "contradictory") {
      expect(result.failure?.reason).toBe("teams_accounting_companion_unconsumed");
    }
  });
});
