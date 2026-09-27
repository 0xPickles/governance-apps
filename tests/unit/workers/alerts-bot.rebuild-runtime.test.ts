import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeEventTopics } from "viem";

import worker from "@/workers/alerts-bot/src/index";
import { domainConfigs, runtimeConfig, type AlertsEnv } from "@/workers/alerts-bot/src/config";
import {
  ALERT_DOMAIN_GENESIS_BLOCKS,
  ALERT_DOMAIN_OBJECT_NAMES,
  ALERT_DOMAIN_REGISTRATIONS,
} from "@/workers/alerts-bot/src/domain-registry";
import { AlertState } from "@/workers/alerts-bot/src/runtime";
import { YBC_REWARD_DISTRIBUTOR } from "@/workers/alerts-bot/src/contracts";
import { YBC_REWARD_DISTRIBUTOR_EVENTS_ABI } from "@/workers/alerts-bot/src/product-abis";
import {
  sendMessage,
  TelegramSendError,
} from "@/workers/alerts-bot/src/telegram";
import {
  applyYethClaim,
  applyYethSetClaim,
  applyYethShareMintFromClaimStay,
  applyYethTransferLedger,
  buildYethRepaymentMetrics,
  createEmptyYethState,
  serializeYethRepaymentMetrics,
  serializeYethState,
} from "@/workers/alerts-bot/src/domains/yeth/accounting";

class MemoryStorage {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
}

function durableState(storage = new MemoryStorage()): {
  readonly state: DurableObjectState;
  readonly storage: MemoryStorage;
} {
  return {
    state: { storage } as unknown as DurableObjectState,
    storage,
  };
}

function baseEnv(overrides: Partial<AlertsEnv> = {}): AlertsEnv {
  return {
    ALERT_STATE: {} as DurableObjectNamespace,
    RPC_URL: "https://rpc.invalid",
    TELEGRAM_BOT_TOKEN: "bot-token",
    STYFI_TELEGRAM_CHAT_ID: "styfi-chat",
    VEYFI_TELEGRAM_CHAT_ID: "veyfi-chat",
    YETH_TELEGRAM_CHAT_ID: "yeth-chat",
    TEAMS_TELEGRAM_CHAT_ID: "teams-chat",
    YBC_TELEGRAM_CHAT_ID: "ybc-chat",
    ADMIN_TOKEN: "admin-token",
    ...overrides,
  };
}

function hashOf(blockNumber: number): string {
  return `0x${blockNumber.toString(16).padStart(64, "0")}`;
}

function rpcFetch(params: {
  readonly latest: number;
  readonly blockHash?: (block: number) => string;
  readonly onMethod?: (method: string) => void;
}): typeof fetch {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as {
      readonly id: number;
      readonly method: string;
      readonly params: readonly unknown[];
    };
    params.onMethod?.(payload.method);
    let result: unknown;
    if (payload.method === "eth_blockNumber") {
      result = `0x${params.latest.toString(16)}`;
    } else if (payload.method === "eth_getLogs") {
      result = [];
    } else if (payload.method === "eth_getBlockByNumber") {
      const block = Number.parseInt(String(payload.params[0]).slice(2), 16);
      result = {
        number: `0x${block.toString(16)}`,
        hash: params.blockHash?.(block) ?? hashOf(block),
        parentHash: hashOf(block - 1),
        timestamp: "0x6b49d200",
      };
    } else {
      throw new Error(`unexpected RPC method: ${payload.method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: payload.id, result });
  }) as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("alerts rebuild registry and configuration", () => {
  it("uses five independent active objects and keeps the DAO seam disabled", () => {
    expect(ALERT_DOMAIN_OBJECT_NAMES).toEqual({
      styfi: "alerts:styfi:v1",
      veyfi: "alerts:veyfi:v1",
      yeth: "alerts:yeth:v1",
      teams: "alerts:teams:v2",
      ybc: "alerts:ybc:v2",
    });
    expect(ALERT_DOMAIN_GENESIS_BLOCKS).toEqual({
      styfi: 24_386_915,
      veyfi: 24_386_915,
      yeth: 24_522_098,
      teams: 25_244_861,
      ybc: 25_228_044,
    });
    expect(
      ALERT_DOMAIN_REGISTRATIONS.filter(({ status }) => status === "disabled")
        .map(({ id }) => id),
    ).toEqual(["dao"]);
  });

  it("defaults all domains off and does not couple one missing chat to another", () => {
    expect(domainConfigs(baseEnv()).map(({ enabled }) => enabled)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    const configured = domainConfigs(baseEnv({
      ALERTS_STYFI_ENABLED: "true",
      ALERTS_YETH_ENABLED: "true",
      YETH_TELEGRAM_CHAT_ID: undefined,
    }));
    expect(configured).toMatchObject([
      { domainId: "styfi", enabled: true, chatId: "styfi-chat" },
      { domainId: "veyfi", enabled: false },
      { domainId: "yeth", enabled: true, chatId: null },
      { domainId: "teams", enabled: false },
      { domainId: "ybc", enabled: false },
    ]);
  });

  it("uses paid-plan defaults without a general subrequest governor", () => {
    expect(runtimeConfig(baseEnv())).toMatchObject({
      confirmations: 6,
      maxMessagesPerRun: 5,
      maxRangesPerRun: 6,
      logRangeSize: 10_000,
      yethDailyCheckpointBlocks: 7_200,
      yethDailyMinDeltaWei: 5n * 10n ** 17n,
    });
  });

  it.each([
    ["zero confirmations", { CONFIRMATIONS: "0" }, "alert_config_confirmations_invalid"],
    ["confirmations below six", { CONFIRMATIONS: "5" }, "alert_config_confirmations_invalid"],
    ["confirmations above six", { CONFIRMATIONS: "7" }, "alert_config_confirmations_invalid"],
    ["more than five messages", { MAX_MESSAGES_PER_RUN: "6" }, "alert_config_message_cap_invalid"],
    ["more than six ranges", { MAX_RANGES_PER_RUN: "7" }, "alert_config_range_cap_invalid"],
    ["more than 10,000 blocks", { LOG_RANGE_SIZE: "10001" }, "alert_config_range_size_invalid"],
  ])("rejects unsafe runtime override: %s", (_label, overrides, reason) => {
    expect(() => runtimeConfig(baseEnv(overrides))).toThrow(reason);
  });
});

describe("minimal durable runtime", () => {
  it("does no external work for a disabled domain", async () => {
    const { state } = durableState();
    const external = vi.fn();
    vi.stubGlobal("fetch", external);
    const object = new AlertState(state, baseEnv());
    const response = await object.fetch(
      new Request("https://alerts.internal/run?domain=styfi", { method: "POST" }),
    );
    expect(await response.json()).toEqual({ domain: "styfi", outcome: "disabled" });
    expect(external).not.toHaveBeenCalled();
  });

  it("reports caught up only without a saved run error", async () => {
    const { state, storage } = durableState();
    const initialCursor = ALERT_DOMAIN_GENESIS_BLOCKS.styfi - 1;
    vi.stubGlobal("fetch", rpcFetch({ latest: initialCursor + 6 }));
    const object = new AlertState(
      state,
      baseEnv({ ALERTS_STYFI_ENABLED: "true" }),
    );
    const response = await object.fetch(
      new Request("https://alerts.internal/run?domain=styfi", { method: "POST" }),
    );
    expect(await response.json()).toMatchObject({
      domain: "styfi",
      outcome: "caught_up",
      cursorBlock: initialCursor,
    });
    expect(storage.values.get("state:v1")).toMatchObject({
      cursorBlock: initialCursor,
      lastObservedHead: initialCursor,
      lastErrorCode: null,
    });
    const statusRequest = () => new Request("https://alerts.internal/status?domain=styfi");
    expect(await (await object.fetch(statusRequest())).json()).toMatchObject({ caughtUp: true });
    storage.values.set("state:v1", {
      ...storage.values.get("state:v1") as Record<string, unknown>,
      lastErrorCode: "scan_attribution_failed",
    });
    expect(await (await object.fetch(statusRequest())).json()).toMatchObject({ caughtUp: false });
  });

  it("advances an empty range without loading every block header", async () => {
    const { state, storage } = durableState();
    const genesis = ALERT_DOMAIN_GENESIS_BLOCKS.styfi;
    const methods: string[] = [];
    vi.stubGlobal("fetch", rpcFetch({
      latest: genesis + 14,
      onMethod: (method) => methods.push(method),
    }));
    const object = new AlertState(
      state,
      baseEnv({
        ALERTS_STYFI_ENABLED: "true",
        MAX_RANGES_PER_RUN: "1",
        LOG_RANGE_SIZE: "100",
      }),
    );
    const response = await object.fetch(
      new Request("https://alerts.internal/run?domain=styfi", { method: "POST" }),
    );
    expect(await response.json()).toMatchObject({
      outcome: "caught_up",
      cursorBlock: genesis + 8,
      ranges: 1,
      messagesSent: 0,
    });
    expect(methods.filter((method) => method === "eth_getBlockByNumber")).toHaveLength(1);
    expect(storage.values.get("state:v1")).toMatchObject({
      cursorBlock: genesis + 8,
      cursorHash: hashOf(genesis + 8),
    });
  });

  it("retries the same range after a scanner failure before advancing the cursor", async () => {
    const { state, storage } = durableState();
    const genesis = ALERT_DOMAIN_GENESIS_BLOCKS.styfi;
    const scannedRanges: Array<readonly [string, string]> = [];
    let failNextLogRequest = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        readonly id: number;
        readonly method: string;
        readonly params: readonly unknown[];
      };
      if (payload.method === "eth_blockNumber") {
        return Response.json({ jsonrpc: "2.0", id: payload.id, result: `0x${(genesis + 6).toString(16)}` });
      }
      if (payload.method === "eth_getLogs") {
        const filter = payload.params[0] as { readonly fromBlock: string; readonly toBlock: string };
        scannedRanges.push([filter.fromBlock, filter.toBlock]);
        if (failNextLogRequest) {
          failNextLogRequest = false;
          return Response.json({
            jsonrpc: "2.0",
            id: payload.id,
            error: { code: -32_000, message: "temporary provider failure" },
          });
        }
        return Response.json({ jsonrpc: "2.0", id: payload.id, result: [] });
      }
      if (payload.method === "eth_getBlockByNumber") {
        const number = Number.parseInt(String(payload.params[0]).slice(2), 16);
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            number: `0x${number.toString(16)}`,
            hash: hashOf(number),
            parentHash: hashOf(number - 1),
            timestamp: "0x6b49d200",
          },
        });
      }
      throw new Error(`unexpected RPC method: ${payload.method}`);
    }));
    const object = new AlertState(
      state,
      baseEnv({ ALERTS_STYFI_ENABLED: "true", MAX_RANGES_PER_RUN: "1" }),
    );

    const failed = await object.fetch(
      new Request("https://alerts.internal/run?domain=styfi", { method: "POST" }),
    );
    expect(failed.status).toBe(500);
    expect(storage.values.get("state:v1")).toMatchObject({
      cursorBlock: genesis - 1,
      lastObservedHead: genesis,
    });

    const recovered = await object.fetch(
      new Request("https://alerts.internal/run?domain=styfi", { method: "POST" }),
    );
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({
      outcome: "caught_up",
      cursorBlock: genesis,
    });
    expect(scannedRanges[0]).toEqual(scannedRanges[1]);
    expect(storage.values.get("state:v1")).toMatchObject({
      cursorBlock: genesis,
      cursorHash: hashOf(genesis),
      lastErrorCode: null,
    });
  });

  it("keeps Teams and YBC progress independent through a Teams failure and recovery", async () => {
    const teams = durableState();
    const ybc = durableState();
    const teamsGenesis = ALERT_DOMAIN_GENESIS_BLOCKS.teams;
    const ybcGenesis = ALERT_DOMAIN_GENESIS_BLOCKS.ybc;
    const latest = teamsGenesis + 6;
    let failTeams = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        readonly id: number;
        readonly method: string;
        readonly params: readonly unknown[];
      };
      if (payload.method === "eth_blockNumber") {
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          result: `0x${latest.toString(16)}`,
        });
      }
      if (payload.method === "eth_getLogs") {
        if (failTeams) {
          return Response.json({
            jsonrpc: "2.0",
            id: payload.id,
            error: { code: -32_000, message: "temporary Teams provider failure" },
          });
        }
        return Response.json({ jsonrpc: "2.0", id: payload.id, result: [] });
      }
      if (payload.method === "eth_getBlockByNumber") {
        const number = Number.parseInt(String(payload.params[0]).slice(2), 16);
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            number: `0x${number.toString(16)}`,
            hash: hashOf(number),
            parentHash: hashOf(number - 1),
            timestamp: "0x6b49d200",
          },
        });
      }
      throw new Error(`unexpected RPC method: ${payload.method}`);
    }));
    const env = baseEnv({
      ALERTS_TEAMS_ENABLED: "true",
      ALERTS_YBC_ENABLED: "true",
      MAX_RANGES_PER_RUN: "1",
    });
    const teamsObject = new AlertState(teams.state, env);
    const ybcObject = new AlertState(ybc.state, env);

    const failedTeams = await teamsObject.fetch(
      new Request("https://alerts.internal/run?domain=teams", { method: "POST" }),
    );
    expect(failedTeams.status).toBe(500);
    expect(teams.storage.values.get("state:v1")).toMatchObject({
      domainId: "teams",
      cursorBlock: teamsGenesis - 1,
    });

    failTeams = false;
    const progressedYbc = await ybcObject.fetch(
      new Request("https://alerts.internal/run?domain=ybc", { method: "POST" }),
    );
    expect(progressedYbc.status).toBe(200);
    expect(ybc.storage.values.get("state:v1")).toMatchObject({
      domainId: "ybc",
      cursorBlock: ybcGenesis + 9_999,
      lastErrorCode: null,
    });
    expect(teams.storage.values.get("state:v1")).toMatchObject({
      cursorBlock: teamsGenesis - 1,
    });

    const recoveredTeams = await teamsObject.fetch(
      new Request("https://alerts.internal/run?domain=teams", { method: "POST" }),
    );
    expect(recoveredTeams.status).toBe(200);
    expect(teams.storage.values.get("state:v1")).toMatchObject({
      cursorBlock: teamsGenesis,
      lastErrorCode: null,
    });
    expect(ybc.storage.values.get("state:v1")).toMatchObject({
      cursorBlock: ybcGenesis + 9_999,
    });
  });

  it("stops when the saved cursor hash is no longer canonical", async () => {
    const { state, storage } = durableState();
    const cursor = ALERT_DOMAIN_GENESIS_BLOCKS.styfi;
    storage.values.set("state:v1", {
      version: 1,
      domainId: "styfi",
      cursorBlock: cursor,
      cursorHash: hashOf(cursor),
      lastObservedHead: cursor,
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorCode: null,
      telegramRetryAfterUntil: null,
      yethState: null,
      yethMetrics: null,
      yethDailyFlow: null,
    });
    vi.stubGlobal("fetch", rpcFetch({
      latest: cursor + 10,
      blockHash: (block) =>
        block === cursor ? `0x${"f".repeat(64)}` : hashOf(block),
    }));
    const object = new AlertState(
      state,
      baseEnv({ ALERTS_STYFI_ENABLED: "true" }),
    );
    const response = await object.fetch(
      new Request("https://alerts.internal/run?domain=styfi", { method: "POST" }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      outcome: "failed",
      code: "cursor_reorg_detected",
    });
    expect(storage.values.get("state:v1")).toMatchObject({
      cursorBlock: cursor,
      lastErrorCode: "cursor_reorg_detected",
    });
  });

  it("logs a redacted stage when the head request throws unexpectedly", async () => {
    const { state, storage } = durableState();
    const secretMarker = "must-not-appear-in-alert-logs";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError(`network failure: ${secretMarker}`);
    }));
    const object = new AlertState(
      state,
      baseEnv({ ALERTS_STYFI_ENABLED: "true" }),
    );

    const response = await object.fetch(
      new Request("https://alerts.internal/run?domain=styfi", { method: "POST" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      outcome: "failed",
      code: "processing_failed",
    });
    expect(storage.values.get("state:v1")).toMatchObject({
      lastErrorCode: "processing_failed",
    });
    const log = JSON.parse(String(errorLog.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
    expect(log).toMatchObject({
      event: "alert_run_failed",
      domain: "styfi",
      code: "processing_failed",
      stage: "head",
      failureKind: "unexpected",
      exceptionName: "TypeError",
      errorStateRecorded: true,
    });
    expect(JSON.stringify(log)).not.toContain(secretMarker);
  });

  it("logs safe RPC metadata without including provider response bodies", async () => {
    const { state } = durableState();
    const secretMarker = "provider-body-must-stay-redacted";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(secretMarker, { status: 503 }),
    ));
    const object = new AlertState(
      state,
      baseEnv({ ALERTS_STYFI_ENABLED: "true" }),
    );

    await object.fetch(
      new Request("https://alerts.internal/run?domain=styfi", { method: "POST" }),
    );

    const log = JSON.parse(String(errorLog.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
    expect(log).toMatchObject({
      stage: "head",
      failureKind: "rpc",
      rpcMethod: "eth_blockNumber",
      rpcKind: "http",
      rpcCode: null,
      httpStatus: 503,
    });
    expect(JSON.stringify(log)).not.toContain(secretMarker);
  });

  it("retains safe scanner evidence in controlled failure diagnostics", async () => {
    const { state } = durableState();
    const genesis = ALERT_DOMAIN_GENESIS_BLOCKS.ybc;
    const transactionHash = `0x${"d".repeat(64)}`;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        readonly id: number;
        readonly method: string;
        readonly params: readonly unknown[];
      };
      let result: unknown;
      if (payload.method === "eth_blockNumber") {
        result = `0x${(genesis + 6).toString(16)}`;
      } else if (payload.method === "eth_getLogs") {
        const filter = payload.params[0] as { readonly address?: string | readonly string[] };
        const addresses = Array.isArray(filter.address) ? filter.address : [filter.address];
        result = addresses.some((address) =>
          address?.toLowerCase() === YBC_REWARD_DISTRIBUTOR.toLowerCase()
        ) ? [{
          address: YBC_REWARD_DISTRIBUTOR,
          topics: encodeEventTopics({
            abi: YBC_REWARD_DISTRIBUTOR_EVENTS_ABI,
            eventName: "Kill",
          }),
          data: "0x",
          blockHash: hashOf(genesis),
          blockNumber: `0x${genesis.toString(16)}`,
          transactionHash,
          logIndex: "0x4",
          removed: false,
        }] : [];
      } else if (payload.method === "eth_getBlockByNumber") {
        const blockNumber = Number.parseInt(String(payload.params[0]).slice(2), 16);
        result = {
          number: `0x${blockNumber.toString(16)}`,
          hash: hashOf(blockNumber),
          parentHash: hashOf(blockNumber - 1),
          timestamp: "0x6b49d200",
        };
      } else if (payload.method === "eth_getTransactionByHash") {
        result = null;
      } else {
        throw new Error(`unexpected RPC method: ${payload.method}`);
      }
      return Response.json({ jsonrpc: "2.0", id: payload.id, result });
    }));
    const object = new AlertState(
      state,
      baseEnv({ ALERTS_YBC_ENABLED: "true", MAX_RANGES_PER_RUN: "1" }),
    );

    const response = await object.fetch(
      new Request("https://alerts.internal/run?domain=ybc", { method: "POST" }),
    );

    expect(response.status).toBe(500);
    const log = JSON.parse(String(errorLog.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
    expect(log).toMatchObject({
      event: "alert_run_failed",
      domain: "ybc",
      code: "scan_ybc_scan_failed",
      stage: "scan",
      failureKind: "controlled",
      failureReason: "product_scan_transaction_missing",
      contract: YBC_REWARD_DISTRIBUTOR.toLowerCase(),
      blockNumber: genesis,
      transactionHash,
      eventName: "Kill",
    });
  });

  it("resumes a capped yETH checkpoint from event receipts without advancing early", async () => {
    const { state, storage } = durableState();
    const account = "0x1111111111111111111111111111111111111111";
    const zero = "0x0000000000000000000000000000000000000000";
    const one = 10n ** 18n;
    const yeth = createEmptyYethState();
    applyYethSetClaim(yeth, account, 100n * one);
    applyYethClaim(yeth, account, false, 100n * one);
    applyYethTransferLedger(yeth, zero, account, 100n * one);
    applyYethShareMintFromClaimStay(yeth, account, 100n * one, 100n * one);
    const firstCheckpoint = ALERT_DOMAIN_GENESIS_BLOCKS.yeth - 1 + 7_200;
    const secondCheckpoint = firstCheckpoint + 7_200;
    const previousMetrics = buildYethRepaymentMetrics(
      yeth,
      50n * one,
      50n * one,
    );
    storage.values.set("state:v1", {
      version: 1,
      domainId: "yeth",
      cursorBlock: firstCheckpoint,
      cursorHash: hashOf(firstCheckpoint),
      lastObservedHead: firstCheckpoint,
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorCode: null,
      telegramRetryAfterUntil: null,
      yethState: serializeYethState(yeth),
      yethMetrics: serializeYethRepaymentMetrics(previousMetrics),
      yethDailyFlow: { recoveryNetFlowEth: "0", yieldNetFlowEth: "0" },
    });
    const rpcMethods: string[] = [];
    const telegramMessages: Array<{ text: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("https://api.telegram.org/")) {
        telegramMessages.push(JSON.parse(String(init?.body)) as { text: string });
        return Response.json({ ok: true });
      }
      const payload = JSON.parse(String(init?.body)) as
        | Array<{ id: number; method: string }>
        | { id: number; method: string; params: readonly unknown[] };
      if (Array.isArray(payload)) {
        payload.forEach(({ method }) => rpcMethods.push(method));
        return Response.json(payload.map(({ id }) => ({
          jsonrpc: "2.0",
          id,
          result: `0x${(60n * one)
            .toString(16)
            .padStart(64, "0")}`,
        })));
      }
      rpcMethods.push(payload.method);
      if (payload.method === "eth_blockNumber") {
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          result: `0x${(secondCheckpoint + 6).toString(16)}`,
        });
      }
      if (payload.method === "eth_getLogs") {
        return Response.json({ jsonrpc: "2.0", id: payload.id, result: [] });
      }
      if (payload.method === "eth_getBlockByNumber") {
        const block = Number.parseInt(String(payload.params[0]).slice(2), 16);
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            number: `0x${block.toString(16)}`,
            hash: hashOf(block),
            parentHash: hashOf(block - 1),
            timestamp: "0x6b49d200",
          },
        });
      }
      throw new Error(`unexpected RPC method: ${payload.method}`);
    }));
    const object = new AlertState(
      state,
      baseEnv({
        ALERTS_YETH_ENABLED: "true",
        MAX_RANGES_PER_RUN: "1",
        MAX_MESSAGES_PER_RUN: "1",
        LOG_RANGE_SIZE: "10000",
        YETH_DAILY_MIN_DELTA_ETH: "0.5",
      }),
    );
    const response = await object.fetch(
      new Request("https://alerts.internal/run?domain=yeth", { method: "POST" }),
    );
    expect(await response.json()).toMatchObject({
      outcome: "message_cap",
      cursorBlock: firstCheckpoint,
      messagesSent: 1,
    });
    expect(telegramMessages).toHaveLength(1);
    expect(telegramMessages[0]!.text).toContain("yETH recovery progress");
    expect(telegramMessages[0]!.text).toContain("narrowed by 10.00 ETH");
    expect(storage.values.get("state:v1")).toMatchObject({
      cursorBlock: firstCheckpoint,
      lastErrorCode: "message_cap_reached",
    });

    const resumed = await object.fetch(
      new Request("https://alerts.internal/run?domain=yeth", { method: "POST" }),
    );
    expect(await resumed.json()).toMatchObject({
      outcome: "caught_up",
      cursorBlock: secondCheckpoint,
      messagesSent: 1,
    });
    expect(telegramMessages).toHaveLength(2);
    expect(telegramMessages[1]!.text).toContain("yETH yield capacity increased");
    expect(rpcMethods.filter((method) => method === "eth_getBlockByNumber").length)
      .toBeLessThan(20);
    expect(storage.values.get("state:v1")).toMatchObject({
      cursorBlock: secondCheckpoint,
      yethDailyFlow: { recoveryNetFlowEth: "0", yieldNetFlowEth: "0" },
    });
  });
});

describe("worker routing and Telegram backoff", () => {
  it("fans the cron out to exactly the five configured object names", async () => {
    const names: string[] = [];
    const namespace = {
      idFromName(name: string) {
        names.push(name);
        return name;
      },
      get() {
        return { fetch: async () => Response.json({ outcome: "caught_up" }) };
      },
    } as unknown as DurableObjectNamespace;
    let pending: Promise<unknown> | null = null;
    worker.scheduled(
      {} as ScheduledController,
      baseEnv({
        ALERT_STATE: namespace,
        ALERTS_STYFI_ENABLED: "true",
        ALERTS_VEYFI_ENABLED: "true",
        ALERTS_YETH_ENABLED: "true",
        ALERTS_TEAMS_ENABLED: "true",
        ALERTS_YBC_ENABLED: "true",
      }),
      { waitUntil(value) { pending = value; } },
    );
    await pending;
    expect(names).toEqual([
      "alerts:styfi:v1",
      "alerts:veyfi:v1",
      "alerts:yeth:v1",
      "alerts:teams:v2",
      "alerts:ybc:v2",
    ]);
  });

  it("continues independent cron dispatch while Teams and YBC fail and recover", async () => {
    const attempts = new Map<string, number>();
    let failingDomain: "teams" | "ybc" | null = "teams";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const namespace = {
      idFromName(name: string) {
        return name;
      },
      get(name: string) {
        return {
          fetch: async () => {
            attempts.set(name, (attempts.get(name) ?? 0) + 1);
            const domain = name === ALERT_DOMAIN_OBJECT_NAMES.teams ? "teams" : "ybc";
            return domain === failingDomain
              ? Response.json({ outcome: "failed" }, { status: 500 })
              : Response.json({ outcome: "caught_up" });
          },
        };
      },
    } as unknown as DurableObjectNamespace;
    const env = baseEnv({
      ALERT_STATE: namespace,
      ALERTS_TEAMS_ENABLED: "true",
      ALERTS_YBC_ENABLED: "true",
    });
    const runScheduled = async () => {
      let pending: Promise<unknown> | null = null;
      worker.scheduled(
        {} as ScheduledController,
        env,
        { waitUntil(value) { pending = value; } },
      );
      await pending;
    };

    await runScheduled();
    failingDomain = "ybc";
    await runScheduled();
    failingDomain = null;
    await runScheduled();

    expect(attempts).toEqual(new Map([
      [ALERT_DOMAIN_OBJECT_NAMES.teams, 3],
      [ALERT_DOMAIN_OBJECT_NAMES.ybc, 3],
    ]));
    expect(errorLog).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenNthCalledWith(1, JSON.stringify({
      event: "alert_dispatch_failed",
      domain: "teams",
    }));
    expect(errorLog).toHaveBeenNthCalledWith(2, JSON.stringify({
      event: "alert_dispatch_failed",
      domain: "ybc",
    }));
  });

  it("requires the bearer token before reading status objects", async () => {
    const response = await worker.fetch(
      new Request("https://alerts.example/status"),
      baseEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("surfaces Telegram retry_after as a typed backoff", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json(
        { ok: false, parameters: { retry_after: 42 } },
        { status: 429 },
      ),
    ));
    await expect(sendMessage("chat", "<b>test</b>", "token")).rejects.toEqual(
      expect.objectContaining({ retryAfterSeconds: 42 }),
    );
  });

  it("surfaces redacted Telegram failure metadata without retaining descriptions", async () => {
    const secretMarker = "telegram-description-must-stay-redacted";
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json(
        {
          ok: false,
          error_code: 400,
          description: secretMarker,
        },
        { status: 400 },
      ),
    ));

    const error = await sendMessage("chat", "<b>test</b>", "token").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(TelegramSendError);
    expect(error).toMatchObject({
      message: "telegram_send_failed",
      httpStatus: 400,
      telegramErrorCode: 400,
      kind: "http_error",
    });
    expect(JSON.stringify(error)).not.toContain(secretMarker);
  });
});
