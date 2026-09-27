import { describe, expect, it, vi } from "vitest";

import {
  CHAINLINK_YFI_USD_DECIMALS,
  CHAINLINK_YFI_USD_DEVIATION_THRESHOLD_PERCENT,
  CHAINLINK_YFI_USD_HEARTBEAT_SECONDS,
  CHAINLINK_YFI_USD_PROXY,
  createChainlinkYfiUsdPriceSource,
  selectProductionYfiUsdPriceSource,
} from "@/workers/alerts-bot/src/event-block-chainlink-price";
import type {
  RpcBlockReference,
  RpcClient,
} from "@/workers/alerts-bot/src/rpc";

const BLOCK_NUMBER = 25_123_456;
const BLOCK_HASH = `0x${"a".repeat(64)}` as const;
const EVENT_TIMESTAMP = 1_800_000_000;
const UINT256_MODULUS = 1n << 256n;

function word(value: bigint): string {
  const normalized = value < 0n ? UINT256_MODULUS + value : value;
  return normalized.toString(16).padStart(64, "0");
}

function roundData(params: {
  readonly roundId?: bigint;
  readonly answer?: bigint;
  readonly startedAt?: bigint;
  readonly updatedAt?: bigint;
  readonly answeredInRound?: bigint;
} = {}): `0x${string}` {
  const roundId = params.roundId ?? 100n;
  const answer = params.answer ?? 12_345_500_000n;
  const startedAt = params.startedAt ?? BigInt(EVENT_TIMESTAMP - 60);
  const updatedAt = params.updatedAt ?? BigInt(EVENT_TIMESTAMP - 30);
  const answeredInRound = params.answeredInRound ?? roundId;
  return `0x${[
    roundId,
    answer,
    startedAt,
    updatedAt,
    answeredInRound,
  ]
    .map(word)
    .join("")}`;
}

function decimalResult(value = 8n): `0x${string}` {
  return `0x${word(value)}`;
}

function sourceWith(
  response:
    | readonly string[]
    | ((requests: readonly { to: string; data: string }[]) => readonly string[]),
) {
  const call = vi.fn(
    async (
      requests: readonly { to: string; data: string }[],
      blockReference?: RpcBlockReference,
    ) => {
      void blockReference;
      return typeof response === "function" ? response(requests) : response;
    },
  );
  const rpc = { call } as unknown as RpcClient;
  return { source: createChainlinkYfiUsdPriceSource(rpc), call };
}

function read(source: ReturnType<typeof createChainlinkYfiUsdPriceSource>) {
  return source.readYfiUsdPrice(
    Object.freeze({
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      timestamp: EVENT_TIMESTAMP,
    }),
  );
}

describe("exact-block Chainlink YFI/USD price source", () => {
  it("reads the fixed proxy round and decimals in one canonical hash batch", async () => {
    const { source, call } = sourceWith((requests) => {
      expect(requests).toEqual([
        {
          to: CHAINLINK_YFI_USD_PROXY.toLowerCase(),
          data: "0xfeaf968c",
        },
        {
          to: CHAINLINK_YFI_USD_PROXY.toLowerCase(),
          data: "0x313ce567",
        },
      ]);
      return Object.freeze([roundData(), decimalResult()]);
    });

    await expect(read(source)).resolves.toEqual({
      kind: "available",
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      yfiUsdCents: 12_346n,
    });
    expect(call).toHaveBeenCalledOnce();
    expect(call.mock.calls[0]?.[1]).toEqual({
      blockHash: BLOCK_HASH,
      requireCanonical: true,
    });
    expect(CHAINLINK_YFI_USD_DECIMALS).toBe(8);
    expect(CHAINLINK_YFI_USD_HEARTBEAT_SECONDS).toBe(86_400);
    expect(CHAINLINK_YFI_USD_DEVIATION_THRESHOLD_PERCENT).toBe(1);
  });

  it.each([
    { answer: 1_234_499_999n, cents: 1_234n },
    { answer: 1_234_500_000n, cents: 1_235n },
    { answer: 1_234_500_001n, cents: 1_235n },
  ])("rounds the 8-decimal answer half-up at $answer", async ({ answer, cents }) => {
    const { source } = sourceWith(
      Object.freeze([roundData({ answer }), decimalResult()]),
    );

    await expect(read(source)).resolves.toMatchObject({
      kind: "available",
      yfiUsdCents: cents,
    });
  });

  it("pins a usable exact round and scale at the canonical YFI replay boundary", async () => {
    // Archive characterization at block 24,386,915: the fixed proxy has code,
    // decimals=8, answer=278139901677, and an update 2,508 seconds before the
    // verified event-block timestamp.
    const eventTimestamp = 1_770_249_611;
    const updatedAt = 1_770_247_103n;
    const { source } = sourceWith(
      Object.freeze([
        roundData({
          answer: 278_139_901_677n,
          startedAt: updatedAt,
          updatedAt,
        }),
        decimalResult(),
      ]),
    );

    await expect(
      source.readYfiUsdPrice({
        blockNumber: 24_386_915,
        blockHash: `0x${"b".repeat(64)}`,
        timestamp: eventTimestamp,
      }),
    ).resolves.toMatchObject({
      kind: "available",
      blockNumber: 24_386_915,
      yfiUsdCents: 278_140n,
    });
    expect(eventTimestamp - Number(updatedAt)).toBe(2_508);
  });

  it.each([
    { age: CHAINLINK_YFI_USD_HEARTBEAT_SECONDS, available: true },
    { age: CHAINLINK_YFI_USD_HEARTBEAT_SECONDS + 1, available: false },
  ])("uses the inclusive heartbeat boundary at age $age", async ({ age, available }) => {
    const updatedAt = BigInt(EVENT_TIMESTAMP - age);
    const { source } = sourceWith(
      Object.freeze([
        roundData({ startedAt: updatedAt, updatedAt }),
        decimalResult(),
      ]),
    );

    const result = await read(source);

    expect(result.kind).toBe(available ? "available" : "unavailable");
    if (!available) expect(result).toMatchObject({ reason: "not_found" });
  });

  it.each([
    { label: "zero round", round: { roundId: 0n, answeredInRound: 0n } },
    { label: "zero answer", round: { answer: 0n } },
    { label: "negative answer", round: { answer: -1n } },
    { label: "zero started time", round: { startedAt: 0n } },
    { label: "zero updated time", round: { updatedAt: 0n } },
    {
      label: "incomplete round",
      round: { roundId: 100n, answeredInRound: 99n },
    },
    {
      label: "start after update",
      round: {
        startedAt: BigInt(EVENT_TIMESTAMP - 20),
        updatedAt: BigInt(EVENT_TIMESTAMP - 30),
      },
    },
    {
      label: "future update",
      round: { updatedAt: BigInt(EVENT_TIMESTAMP + 1) },
    },
  ])("maps a canonical but unusable $label to exact not-found", async ({ round }) => {
    const { source } = sourceWith(
      Object.freeze([roundData(round), decimalResult()]),
    );

    await expect(read(source)).resolves.toEqual({
      kind: "unavailable",
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      reason: "not_found",
    });
  });

  it.each([
    { label: "empty round", response: ["0x", decimalResult()] },
    { label: "short round", response: ["0x01", decimalResult()] },
    {
      label: "trailing round byte",
      response: [`${roundData()}00`, decimalResult()],
    },
    { label: "missing decimals", response: [roundData()] },
    {
      label: "extra batch result",
      response: [roundData(), decimalResult(), decimalResult()],
    },
    { label: "short decimals", response: [roundData(), "0x08"] },
    {
      label: "trailing decimals byte",
      response: [roundData(), `${decimalResult()}00`],
    },
    { label: "wrong decimals", response: [roundData(), decimalResult(9n)] },
    { label: "dirty uint8", response: [roundData(), decimalResult(264n)] },
    {
      label: "dirty uint80 round",
      response: [roundData({ roundId: 1n << 80n }), decimalResult()],
    },
    {
      label: "dirty uint80 answered round",
      response: [
        roundData({ answeredInRound: 1n << 80n }),
        decimalResult(),
      ],
    },
  ])("rejects a structurally invalid $label response", async ({ response }) => {
    const { source } = sourceWith(Object.freeze(response));

    await expect(read(source)).rejects.toThrow(/chainlink_yfi_usd/);
  });

  it("propagates canonical-hash RPC failures for retry", async () => {
    const failure = new Error("canonical block unavailable");
    const call = vi.fn(async () => {
      throw failure;
    });
    const source = createChainlinkYfiUsdPriceSource({ call } as unknown as RpcClient);

    await expect(read(source)).rejects.toBe(failure);
  });

  it("selects only an explicit source or the configured shared RPC default", () => {
    const injected = Object.freeze({ readYfiUsdPrice: vi.fn() });
    const sharedCall = vi.fn();
    const sharedRpc = { call: sharedCall } as unknown as RpcClient;

    expect(
      selectProductionYfiUsdPriceSource({ sharedRpc, injected }),
    ).toBe(injected);
    expect(
      selectProductionYfiUsdPriceSource({
        sharedRpc: undefined,
        injected,
      }),
    ).toBe(injected);
    expect(
      selectProductionYfiUsdPriceSource({
        sharedRpc: undefined,
        injected: undefined,
      }),
    ).toBeUndefined();
    expect(
      selectProductionYfiUsdPriceSource({
        sharedRpc,
        injected: undefined,
      }),
    ).toBeDefined();
    expect(sharedCall).not.toHaveBeenCalled();
  });
});
