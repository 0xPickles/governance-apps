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
  TEAMS_ACCOUNTING_CORRECTION_TRANSACTION,
  TEAMS_ACCOUNTING_LEGACY_SCALE,
  TEAMS_ACCOUNTING_MAINTAINER,
  TEAMS_ACCOUNTING_SEED_BLOCK,
  TEAMS_ACCOUNTING_SEED_TRANSACTION,
  TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK,
} from "@/lib/clients/teams/accounting-history";
import {
  loadTeamsState,
  scanTeamsBlocks,
  serializeTeamsState,
} from "@/workers/alerts-bot/src/domains/teams/scanner";
import {
  REVENUE_RECIPIENT_EVENTS_ABI,
  TEAM_ACCOUNTANT_EVENTS_ABI,
  TEAM_EVENTS_ABI,
  TEAMS_READ_ABI,
  TOKEN_METADATA_ABI,
} from "@/workers/alerts-bot/src/product-abis";
import {
  REVENUE_RECIPIENT,
  TEAM_ACCOUNTANT,
  TEAM_REGISTRY,
  TEAMS_BUDGET_GENESIS,
} from "@/workers/alerts-bot/src/contracts";
import { renderProductAlertAction } from "@/workers/alerts-bot/src/product-renderer";
import type {
  BlockTag,
  RpcBlock,
  RpcClient,
  RpcLog,
} from "@/workers/alerts-bot/src/rpc";

const DAO_OPS = "0x462aa97c4670602f63133e2b08327031c132e5b0";
const YAUDIT = "0x4e32b4efab7f02aba6cbd5f7e328ad9d37fb0f8e";
const CURATION = "0x1ccac40c3e027569598ae600109437cf79e79d02";
const YLOCKERS = "0x901e4ee013b842e30f3220c7c2794a80d4baf19a";
const VAULTS = "0xd7517990fa00e33c14ac75337c1f78d624edf2b1";
const TOKEN = "0x1111111111111111111111111111111111111111";
const DEPOSITOR = "0x2222222222222222222222222222222222222222";

interface SeedAdjustment {
  readonly type: "revenue" | "cost";
  readonly team: `0x${string}`;
  readonly period: bigint;
  readonly amount: bigint;
}

const SEED_ADJUSTMENTS: readonly SeedAdjustment[] = [
  { type: "cost", team: DAO_OPS, period: 0n, amount: 267_000_000_000n },
  { type: "cost", team: DAO_OPS, period: 1n, amount: 212_146_530_000n },
  { type: "cost", team: DAO_OPS, period: 2n, amount: 153_000_000_000n },
  { type: "cost", team: YAUDIT, period: 0n, amount: 5_000_000_000n },
  { type: "revenue", team: YAUDIT, period: 0n, amount: 10_921_840_000n },
  { type: "cost", team: YAUDIT, period: 1n, amount: 5_000_000_000n },
  { type: "revenue", team: YAUDIT, period: 1n, amount: 10_975_000_000n },
  { type: "cost", team: YAUDIT, period: 2n, amount: 21_000_000_000n },
  { type: "cost", team: CURATION, period: 0n, amount: 100_250_000_000n },
  { type: "revenue", team: CURATION, period: 0n, amount: 66_207_950_000n },
  { type: "cost", team: CURATION, period: 1n, amount: 86_600_000_000n },
  { type: "revenue", team: CURATION, period: 1n, amount: 38_530_790_000n },
  { type: "cost", team: CURATION, period: 2n, amount: 97_300_000_000n },
  { type: "cost", team: YLOCKERS, period: 0n, amount: 263_629_000_000n },
  { type: "revenue", team: YLOCKERS, period: 0n, amount: 397_758_190_000n },
  { type: "cost", team: YLOCKERS, period: 1n, amount: 313_011_000_000n },
  { type: "revenue", team: YLOCKERS, period: 1n, amount: 264_424_010_000n },
  { type: "cost", team: YLOCKERS, period: 2n, amount: 211_128_000_000n },
  { type: "cost", team: VAULTS, period: 0n, amount: 358_539_000_000n },
  { type: "revenue", team: VAULTS, period: 0n, amount: 501_213_450_000n },
  { type: "cost", team: VAULTS, period: 1n, amount: 359_811_000_000n },
  { type: "revenue", team: VAULTS, period: 1n, amount: 271_227_230_000n },
  { type: "cost", team: VAULTS, period: 2n, amount: 456_483_000_000n },
];

function block(number: number): RpcBlock {
  return {
    number,
    hash: `0x${number.toString(16).padStart(64, "0")}`,
    parentHash: `0x${Math.max(0, number - 1).toString(16).padStart(64, "0")}`,
    timestamp: TEAMS_BUDGET_GENESIS + 1_000,
  };
}

function eventLog(params: {
  readonly abi: Abi;
  readonly eventName: string;
  readonly indexedArgs: Record<string, unknown>;
  readonly data: `0x${string}`;
  readonly address: string;
  readonly blockNumber: number;
  readonly transactionHash: string;
  readonly logIndex: number;
}): RpcLog {
  return {
    address: params.address,
    topics: encodeEventTopics({
      abi: params.abi,
      eventName: params.eventName,
      args: params.indexedArgs,
    } as never) as string[],
    data: params.data,
    blockHash: block(params.blockNumber).hash,
    blockNumber: params.blockNumber,
    transactionHash: params.transactionHash,
    logIndex: params.logIndex,
    removed: false,
  };
}

function accountantLog(
  adjustment: SeedAdjustment,
  amount: bigint,
  increment: boolean,
  blockNumber: number,
  transactionHash: string,
  logIndex: number,
): RpcLog {
  return eventLog({
    abi: TEAM_ACCOUNTANT_EVENTS_ABI,
    eventName: adjustment.type === "revenue" ? "AdjustRevenue" : "AdjustCost",
    indexedArgs: {
      operator: TEAMS_ACCOUNTING_MAINTAINER,
      team: adjustment.team,
      period: adjustment.period,
    },
    data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [amount, increment]),
    address: TEAM_ACCOUNTANT,
    blockNumber,
    transactionHash,
    logIndex,
  });
}

function seedLogs(): RpcLog[] {
  return SEED_ADJUSTMENTS.map((adjustment, index) => accountantLog(
    adjustment,
    adjustment.amount,
    true,
    TEAMS_ACCOUNTING_SEED_BLOCK,
    TEAMS_ACCOUNTING_SEED_TRANSACTION,
    index,
  ));
}

function correctionLogs(): RpcLog[] {
  return SEED_ADJUSTMENTS.flatMap((adjustment, index) => [
    accountantLog(
      adjustment,
      adjustment.amount,
      false,
      TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK,
      TEAMS_ACCOUNTING_CORRECTION_TRANSACTION,
      index * 2,
    ),
    accountantLog(
      adjustment,
      adjustment.amount * TEAMS_ACCOUNTING_LEGACY_SCALE,
      true,
      TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK,
      TEAMS_ACCOUNTING_CORRECTION_TRANSACTION,
      index * 2 + 1,
    ),
  ]);
}

function state() {
  return loadTeamsState({
    teams: [DAO_OPS, YAUDIT, CURATION, YLOCKERS, VAULTS]
      .map((address, index) => ({ address, index: index.toString() })),
  });
}

function teamPeriodFromCall(data: string): string {
  const team = `0x${data.slice(34, 74)}`.toLowerCase();
  const period = BigInt(`0x${data.slice(74, 138)}`);
  return `${team}:${period}`;
}

function teamsRpc(params: {
  readonly fixed: readonly RpcLog[];
  readonly dynamic?: readonly RpcLog[];
  readonly financials?: ReadonlyMap<string, { readonly revenue: bigint; readonly cost: bigint }>;
}): RpcClient {
  const dynamic = params.dynamic ?? [];
  return {
    getBlockNumber: async () => params.fixed[0]?.blockNumber ?? dynamic[0]?.blockNumber ?? 0,
    getBlockByNumber: async (number: BlockTag) => block(number === "latest" ? 0 : number),
    getLogs: async (filter: { address?: readonly string[] }) =>
      filter.address?.some((address) => address.toLowerCase() === TEAM_REGISTRY.toLowerCase())
        ? [...params.fixed]
        : [...dynamic],
    getTransactionByHash: async () => null,
    getTransactionReceipt: async () => null,
    call: async (request: { to: string; data: string }) => {
      if (request.data.startsWith(toFunctionSelector("name()"))) {
        const names: Readonly<Record<string, string>> = {
          [DAO_OPS]: "DAO-ops",
          [YAUDIT]: "yAudit",
          [CURATION]: "Curation",
          [YLOCKERS]: "yLockers",
          [VAULTS]: "Vaults",
        };
        return encodeFunctionResult({
          abi: TEAMS_READ_ABI,
          functionName: "name",
          result: names[request.to.toLowerCase()] ?? "Team",
        });
      }
      if (request.data.startsWith(toFunctionSelector("team_revenues(address,uint256)"))) {
        return encodeFunctionResult({
          abi: TEAMS_READ_ABI,
          functionName: "team_revenues",
          result: params.financials?.get(teamPeriodFromCall(request.data))?.revenue ?? 0n,
        });
      }
      if (request.data.startsWith(toFunctionSelector("team_costs(address,uint256)"))) {
        return encodeFunctionResult({
          abi: TEAMS_READ_ABI,
          functionName: "team_costs",
          result: params.financials?.get(teamPeriodFromCall(request.data))?.cost ?? 0n,
        });
      }
      if (request.data.startsWith(toFunctionSelector("symbol()"))) {
        return encodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "symbol", result: "USDC" });
      }
      if (request.data.startsWith(toFunctionSelector("decimals()"))) {
        return encodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "decimals", result: 6 });
      }
      throw new Error(`unexpected exact read ${request.data.slice(0, 10)}`);
    },
  } as unknown as RpcClient;
}

async function scanSeed() {
  return scanTeamsBlocks({
    rpc: teamsRpc({ fixed: seedLogs() }),
    fromBlock: TEAMS_ACCOUNTING_SEED_BLOCK,
    toBlock: TEAMS_ACCOUNTING_SEED_BLOCK,
    state: state(),
  });
}

describe("Teams historical accounting replay", () => {
  it("normalizes the canonical six-decimal seed and snapshots same-block changes in order", async () => {
    const result = await scanSeed();

    expect(result.failure).toBeNull();
    expect(result.actions).toHaveLength(23);
    expect(result.state.financials).toHaveLength(15);
    const yAuditCost = result.actions.find((candidate) =>
      candidate.kind === "team_cost_adjusted" &&
      candidate.details.team === YAUDIT &&
      candidate.details.period === 1n
    );
    const yAuditRevenue = result.actions.find((candidate) =>
      candidate.kind === "team_revenue_adjusted" &&
      candidate.details.team === YAUDIT &&
      candidate.details.period === 1n
    );
    const curationRevenue = result.actions.find((candidate) =>
      candidate.kind === "team_revenue_adjusted" &&
      candidate.details.team === CURATION &&
      candidate.details.period === 0n
    );
    expect(yAuditCost?.details).toMatchObject({
      amountUsd: 5_000n * 10n ** 18n,
      financialsAfter: { revenue: 0n, cost: 5_000n * 10n ** 18n },
    });
    expect(yAuditRevenue?.details).toMatchObject({
      amountUsd: 10_975n * 10n ** 18n,
      financialsAfter: {
        revenue: 10_975n * 10n ** 18n,
        cost: 5_000n * 10n ** 18n,
      },
    });
    expect(curationRevenue?.details).toMatchObject({
      amountUsd: 66_207_950_000n * TEAMS_ACCOUNTING_LEGACY_SCALE,
      financialsAfter: {
        revenue: 66_207_950_000n * TEAMS_ACCOUNTING_LEGACY_SCALE,
        cost: 100_250n * 10n ** 18n,
      },
    });
    expect(renderProductAlertAction(yAuditCost!, {
      kind: "resolved",
      blockNumber: TEAMS_ACCOUNTING_SEED_BLOCK,
      blockHash: block(TEAMS_ACCOUNTING_SEED_BLOCK).hash,
      seconds: block(TEAMS_ACCOUNTING_SEED_BLOCK).timestamp!,
    })).toContain("Period result after: $5,000.00 loss");
  });

  it("does not rescale a legitimate pre-correction revenue deposit", async () => {
    const seeded = await scanSeed();
    expect(seeded.failure).toBeNull();
    const persisted = loadTeamsState(serializeTeamsState(seeded.state));
    const blockNumber = 25_580_096;
    const transactionHash = "0xd5f586e8f47efda95d364f4e143f7becc1ae0e4e885475a10e1f0b53ed5afe6b";
    const revenue = 19_824_883_544_000_000_000_000n;
    const period = 2n;
    const fixed = [
      eventLog({
        abi: TEAM_ACCOUNTANT_EVENTS_ABI,
        eventName: "AdjustRevenue",
        indexedArgs: { operator: REVENUE_RECIPIENT, team: CURATION, period },
        data: encodeAbiParameters(parseAbiParameters("uint256, bool"), [revenue, true]),
        address: TEAM_ACCOUNTANT,
        blockNumber,
        transactionHash,
        logIndex: 412,
      }),
      eventLog({
        abi: REVENUE_RECIPIENT_EVENTS_ABI,
        eventName: "DepositRevenue",
        indexedArgs: { team: CURATION, period },
        data: encodeAbiParameters(parseAbiParameters("address, uint256, uint256"), [TOKEN, 1_000_000n, revenue]),
        address: REVENUE_RECIPIENT,
        blockNumber,
        transactionHash,
        logIndex: 413,
      }),
    ];
    const dynamic = [eventLog({
      abi: TEAM_EVENTS_ABI,
      eventName: "DepositRevenue",
      indexedArgs: { period },
      data: encodeAbiParameters(
        parseAbiParameters("address, uint256, uint256, address"),
        [TOKEN, 1_000_000n, revenue, DEPOSITOR],
      ),
      address: CURATION,
      blockNumber,
      transactionHash,
      logIndex: 414,
    })];

    const result = await scanTeamsBlocks({
      rpc: teamsRpc({ fixed, dynamic }),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: persisted,
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toMatchObject([{
      kind: "team_revenue_deposited",
      details: {
        revenueUsd: revenue,
        financialsAfter: {
          revenue,
          cost: 97_300n * 10n ** 18n,
        },
      },
    }]);
  });

  it("validates and suppresses the canonical 46-log unit correction", async () => {
    const seeded = await scanSeed();
    expect(seeded.failure).toBeNull();
    const persisted = loadTeamsState(serializeTeamsState(seeded.state));

    const result = await scanTeamsBlocks({
      rpc: teamsRpc({ fixed: correctionLogs(), financials: persisted.financials }),
      fromBlock: TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK,
      toBlock: TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK,
      state: persisted,
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toEqual([]);
    expect(result.state.financials).toEqual(persisted.financials);
  });
});
