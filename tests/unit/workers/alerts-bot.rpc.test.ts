import { describe, expect, it, vi } from "vitest";
import {
  ALERT_RPC_MAX_TRACE_RESPONSE_BYTES,
  createRpcClient,
  isRpcBatchPayloadTooLargeError,
  isRpcRangeTooLargeError,
} from "@/workers/alerts-bot/src/rpc";

function jsonRpcResponse(result: unknown): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("alerts-bot rpc client", () => {
  it("invokes fetch with globalThis binding", async () => {
    let called = false;

    const fetchImpl = function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      called = true;
      expect(this).toBe(globalThis);
      expect(String(input)).toBe("https://rpc.example");
      expect(init?.method).toBe("POST");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: "0x1",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    };

    const rpc = createRpcClient(
      "https://rpc.example",
      fetchImpl as unknown as typeof fetch,
    );
    const blockNumber = await rpc.getBlockNumber();

    expect(called).toBe(true);
    expect(blockNumber).toBe(1);
  });

  it("serializes a canonical EIP-1898 block-hash reference exactly", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };
      expect(body).toEqual({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          { to: "0x00000000000000000000000000000000000000a1", data: "0x1234" },
          { blockHash: `0x${"ab".repeat(32)}`, requireCanonical: true },
        ],
      });
      return jsonRpcResponse("0x");
    });
    const rpc = createRpcClient("https://rpc.example", fetchImpl as typeof fetch);

    await expect(
      rpc.call(
        { to: "0x00000000000000000000000000000000000000a1", data: "0x1234" },
        { blockHash: `0x${"AB".repeat(32)}`, requireCanonical: true },
      ),
    ).resolves.toBe("0x");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("requests a log-aware call trace and validates its positional evidence", async () => {
    const transactionHash = `0x${"12".repeat(32)}`;
    const election = "0x00000000000000000000000000000000000000a1";
    const aggregator = "0x00000000000000000000000000000000000000a2";
    const voteTopic = `0x${"34".repeat(32)}`;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };
      expect(body).toEqual({
        jsonrpc: "2.0",
        id: 1,
        method: "debug_traceTransaction",
        params: [
          transactionHash,
          { tracer: "callTracer", tracerConfig: { withLog: true } },
        ],
      });
      return jsonRpcResponse({
        type: "CALL",
        from: "0x00000000000000000000000000000000000000B0",
        to: election.toUpperCase().replace("0X", "0x"),
        input: "0xAABB",
        output: "0x",
        calls: [{
          type: "STATICCALL",
          from: election,
          to: aggregator,
          input: "0x1234",
          output: `0x${"00".repeat(31)}01`,
        }],
        logs: [{
          address: election,
          topics: [voteTopic],
          data: "0xAABB",
          index: "0x7",
          position: "0x1",
        }],
      });
    });
    const rpc = createRpcClient("https://rpc.example", fetchImpl as typeof fetch);

    await expect(rpc.traceTransactionByHash!(transactionHash)).resolves.toEqual({
      type: "CALL",
      from: "0x00000000000000000000000000000000000000b0",
      to: election,
      input: "0xaabb",
      output: "0x",
      error: null,
      calls: [{
        type: "STATICCALL",
        from: election,
        to: aggregator,
        input: "0x1234",
        output: `0x${"00".repeat(31)}01`,
        error: null,
        calls: [],
        logs: [],
      }],
      logs: [{
        address: election,
        topics: [voteTopic],
        data: "0xaabb",
        index: 7,
        position: 1,
      }],
    });
  });

  it("rejects malformed or oversized transaction traces", async () => {
    const transactionHash = `0x${"56".repeat(32)}`;
    const malformed = createRpcClient(
      "https://rpc.example",
      vi.fn(async () => jsonRpcResponse({
        type: "CALL",
        from: "0x00000000000000000000000000000000000000b0",
        to: "0x00000000000000000000000000000000000000a1",
        input: "0x",
        calls: [],
        logs: [{
          address: "0x00000000000000000000000000000000000000a1",
          topics: [],
          data: "0x",
          index: "0x0",
          position: "0x1",
        }],
      })) as typeof fetch,
    );
    await expect(malformed.traceTransactionByHash!(transactionHash)).rejects.toMatchObject({
      name: "RpcRequestError",
      method: "debug_traceTransaction",
      kind: "protocol",
    });

    const oversized = createRpcClient(
      "https://rpc.example",
      vi.fn(async () => new Response("{}", {
        status: 200,
        headers: {
          "content-length": String(ALERT_RPC_MAX_TRACE_RESPONSE_BYTES + 1),
          "content-type": "application/json",
        },
      })) as typeof fetch,
    );
    await expect(oversized.traceTransactionByHash!(transactionHash)).rejects.toMatchObject({
      name: "RpcRequestError",
      method: "debug_traceTransaction",
      kind: "protocol",
    });
  });

  it("surfaces a noncanonical hash-bound call error without numeric fallback", async () => {
    const blockHash = `0x${"cd".repeat(32)}`;
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          method: string;
          params: unknown[];
        };
        expect(body.method).toBe("eth_call");
        expect(body.params[1]).toEqual({
          blockHash,
          requireCanonical: true,
        });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32_000, message: "block not canonical" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    const rpc = createRpcClient("https://rpc.example", fetchImpl as typeof fetch);
    await expect(
      rpc.call(
        { to: "0x00000000000000000000000000000000000000a1", data: "0x" },
        { blockHash, requireCanonical: true },
      ),
    ).rejects.toMatchObject({
      name: "RpcRequestError",
      method: "eth_call",
      message: "RPC error -32000",
      rpcCode: -32_000,
      kind: "provider",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid block references and unsafe quantities before fetch", async () => {
    const fetchImpl = vi.fn(async () => jsonRpcResponse("0x"));
    const rpc = createRpcClient("https://rpc.example", fetchImpl as typeof fetch);

    await expect(
      rpc.call(
        { to: "0x00000000000000000000000000000000000000a1", data: "0x" },
        { blockHash: "0x01", requireCanonical: true },
      ),
    ).rejects.toThrow("canonical 32-byte block-hash");
    await expect(
      rpc.getLogs({
        fromBlock: Number.MAX_SAFE_INTEGER + 1,
        toBlock: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).rejects.toThrow("non-negative integer");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("preserves a log block hash and rejects malformed RPC identities", async () => {
    const blockHash = `0x${"12".repeat(32)}`;
    const logFetch = vi.fn(async () =>
      jsonRpcResponse([
        {
          address: "0x00000000000000000000000000000000000000a1",
          topics: [],
          data: "0x",
          blockHash,
          blockNumber: "0x2a",
          transactionHash: `0x${"34".repeat(32)}`,
          logIndex: "0x0",
          removed: false,
        },
      ]),
    );
    const logRpc = createRpcClient("https://rpc.example", logFetch as typeof fetch);
    await expect(logRpc.getLogs({ fromBlock: 42, toBlock: 42 })).resolves.toEqual([
      expect.objectContaining({ blockHash, blockNumber: 42, logIndex: 0 }),
    ]);

    for (const result of [
      "0x1junk",
      "0x00",
      "0x01",
      `0x${(BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(16)}`,
    ]) {
      const rpc = createRpcClient(
        "https://rpc.example",
        vi.fn(async () => jsonRpcResponse(result)) as typeof fetch,
      );
      await expect(rpc.getBlockNumber()).rejects.toThrow("hex quantity");
    }

    const malformedBlockRpc = createRpcClient(
      "https://rpc.example",
      vi.fn(async () =>
        jsonRpcResponse({
          number: "0x2a",
          hash: null,
          parentHash: `0x${"00".repeat(32)}`,
          timestamp: "0x1",
        }),
      ) as typeof fetch,
    );
    await expect(malformedBlockRpc.getBlockByNumber(42)).rejects.toThrow(
      "invalid identity fields",
    );
  });

  it.each([
    { label: "missing", timestamp: undefined },
    { label: "malformed", timestamp: "0x01" },
    {
      label: "overflowing",
      timestamp: `0x${(BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(16)}`,
    },
  ])("preserves canonical block identity when timestamp is $label", async ({
    timestamp,
  }) => {
    const payload = {
      number: "0x2a",
      hash: `0x${"ab".repeat(32)}`,
      parentHash: `0x${"cd".repeat(32)}`,
      ...(timestamp === undefined ? {} : { timestamp }),
    };
    const rpc = createRpcClient(
      "https://rpc.example",
      vi.fn(async () => jsonRpcResponse(payload)) as typeof fetch,
    );

    await expect(rpc.getBlockByNumber(42)).resolves.toEqual({
      number: 42,
      hash: payload.hash,
      parentHash: payload.parentHash,
      timestamp: null,
    });
  });

  it("preserves a canonical resolved block timestamp", async () => {
    const rpc = createRpcClient(
      "https://rpc.example",
      vi.fn(async () =>
        jsonRpcResponse({
          number: "0x2a",
          hash: `0x${"ab".repeat(32)}`,
          parentHash: `0x${"cd".repeat(32)}`,
          timestamp: "0x6b49d200",
        }),
      ) as typeof fetch,
    );

    await expect(rpc.getBlockByNumber(42)).resolves.toEqual({
      number: 42,
      hash: `0x${"ab".repeat(32)}`,
      parentHash: `0x${"cd".repeat(32)}`,
      timestamp: 1_800_000_000,
    });
  });

  it.each([
    { label: "wrong version", payload: { jsonrpc: "1.0", id: 1, result: "0x1" } },
    { label: "wrong id", payload: { jsonrpc: "2.0", id: 2, result: "0x1" } },
    { label: "missing outcome", payload: { jsonrpc: "2.0", id: 1 } },
    {
      label: "both outcomes",
      payload: {
        jsonrpc: "2.0",
        id: 1,
        result: "0x1",
        error: { code: -32_000, message: "failure" },
      },
    },
    {
      label: "malformed error code",
      payload: { jsonrpc: "2.0", id: 1, error: { code: "-32000", message: "x" } },
    },
    {
      label: "malformed error message",
      payload: { jsonrpc: "2.0", id: 1, error: { code: -32_000, message: 1 } },
    },
  ])("rejects a $label single-response envelope", async ({ payload }) => {
    const rpc = createRpcClient(
      "https://rpc.example",
      vi.fn(async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ) as typeof fetch,
    );

    await expect(rpc.getBlockNumber()).rejects.toMatchObject({
      name: "RpcRequestError",
      kind: "protocol",
      message: expect.stringContaining("Malformed JSON-RPC response"),
    });
  });

  it("reorders valid batch responses by request id and preserves requested block order", async () => {
    const block = (number: number) => ({
      number: `0x${number.toString(16)}`,
      hash: `0x${number.toString(16).padStart(64, "0")}`,
      parentHash: `0x${(number - 1).toString(16).padStart(64, "0")}`,
      timestamp: "0x1",
    });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requests = JSON.parse(String(init?.body)) as Array<{
        id: number;
        method: string;
        params: [string, boolean];
      }>;
      expect(requests.map(({ method }) => method)).toEqual([
        "eth_getBlockByNumber",
        "eth_getBlockByNumber",
      ]);
      return new Response(
        JSON.stringify(
          [...requests].reverse().map((request) => ({
            jsonrpc: "2.0",
            id: request.id,
            result: block(Number.parseInt(request.params[0].slice(2), 16)),
          })),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const rpc = createRpcClient("https://rpc.example", fetchImpl as typeof fetch);

    await expect(rpc.getBlocksByNumber!([10, 11])).resolves.toEqual([
      expect.objectContaining({ number: 10 }),
      expect.objectContaining({ number: 11 }),
    ]);
  });

  it.each([
    {
      label: "short",
      mutate: (responses: unknown[]) => responses.slice(0, 1),
    },
    {
      label: "extra",
      mutate: (responses: unknown[]) => [
        ...responses,
        { jsonrpc: "2.0", id: 99, result: "0x3" },
      ],
    },
    {
      label: "duplicate id",
      mutate: (responses: Array<Record<string, unknown>>) => [
        responses[0],
        { ...responses[1], id: 1 },
      ],
    },
    {
      label: "unknown id",
      mutate: (responses: Array<Record<string, unknown>>) => [
        responses[0],
        { ...responses[1], id: 99 },
      ],
    },
    {
      label: "wrong version",
      mutate: (responses: Array<Record<string, unknown>>) => [
        { ...responses[0], jsonrpc: "1.0" },
        responses[1],
      ],
    },
    {
      label: "missing outcome",
      mutate: (responses: Array<Record<string, unknown>>) => [
        { jsonrpc: "2.0", id: 1 },
        responses[1],
      ],
    },
  ])("rejects a $label batch response before returning evidence", async ({ mutate }) => {
    const fetchImpl = vi.fn(async () => {
      const responses: Array<Record<string, unknown>> = [
        { jsonrpc: "2.0", id: 1, result: "0x1" },
        { jsonrpc: "2.0", id: 2, result: "0x2" },
      ];
      return new Response(JSON.stringify(mutate(responses)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const rpc = createRpcClient("https://rpc.example", fetchImpl as typeof fetch);

    await expect(
      rpc.callAtBlocks!([
        {
          request: { to: "0x00000000000000000000000000000000000000a1", data: "0x1" },
          blockReference: { blockHash: `0x${"11".repeat(32)}`, requireCanonical: true },
        },
        {
          request: { to: "0x00000000000000000000000000000000000000a2", data: "0x2" },
          blockReference: { blockHash: `0x${"22".repeat(32)}`, requireCanonical: true },
        },
      ]),
    ).rejects.toMatchObject({ name: "RpcRequestError", kind: "protocol" });
  });

  it("serializes heterogeneous exact-block calls and returns them in request order", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requests = JSON.parse(String(init?.body)) as Array<Record<string, unknown>>;
      expect(requests.map(({ method }) => method)).toEqual(["eth_call", "eth_call"]);
      expect(requests.map(({ params }) => (params as unknown[])[1])).toEqual([
        { blockHash: `0x${"11".repeat(32)}`, requireCanonical: true },
        { blockHash: `0x${"22".repeat(32)}`, requireCanonical: true },
      ]);
      return new Response(
        JSON.stringify([
          { jsonrpc: "2.0", id: 2, result: "0x02" },
          { jsonrpc: "2.0", id: 1, result: "0x01" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const rpc = createRpcClient("https://rpc.example", fetchImpl as typeof fetch);
    const requests = [
      {
        request: { to: "0x00000000000000000000000000000000000000a1", data: "0x1" },
        blockReference: { blockHash: `0x${"11".repeat(32)}`, requireCanonical: true as const },
      },
      {
        request: { to: "0x00000000000000000000000000000000000000a2", data: "0x2" },
        blockReference: { blockHash: `0x${"22".repeat(32)}`, requireCanonical: true as const },
      },
    ];

    await expect(rpc.callAtBlocks!(requests)).resolves.toEqual(["0x01", "0x02"]);
  });

  it.each([
    {
      label: "HTTP 413",
      response: () => new Response("", { status: 413 }),
      expected: true,
    },
    {
      label: "closed provider batch limit",
      response: () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32_005, message: "batch size too large" },
          }),
          { status: 200 },
        ),
      expected: true,
    },
    {
      label: "protocol -32600",
      response: () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32_600, message: "batch size too large" },
          }),
          { status: 200 },
        ),
      expected: false,
    },
    {
      label: "missing response id",
      response: () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32_005, message: "batch size too large" },
          }),
          { status: 200 },
        ),
      expected: false,
    },
    {
      label: "HTTP 429",
      response: () => new Response("", { status: 429 }),
      expected: false,
    },
  ])("classifies $label as batch-payload limit: $expected", async ({
    response,
    expected,
  }) => {
    const rpc = createRpcClient(
      "https://rpc.example",
      vi.fn(async () => response()) as typeof fetch,
    );
    let caught: unknown;
    try {
      await rpc.getBlocksByNumber!([1, 2]);
    } catch (error) {
      caught = error;
    }
    expect(isRpcBatchPayloadTooLargeError(caught)).toBe(expected);
  });

  it.each([
    {
      label: "explicit -32602 block limit",
      method: "logs" as const,
      status: 200,
      message: "eth_getLogs is limited to a 10,000 blocks range",
      code: -32_602,
      expected: true,
    },
    {
      label: "explicit result limit",
      method: "logs" as const,
      status: 200,
      message: "query returned more than 10000 results",
      code: -32_005,
      expected: true,
    },
    {
      label: "ordinary -32602 invalid range",
      method: "logs" as const,
      status: 200,
      message: "invalid block range",
      code: -32_602,
      expected: false,
    },
    {
      label: "rate limit",
      method: "logs" as const,
      status: 200,
      message: "request rate limit exceeded",
      code: -32_005,
      expected: false,
    },
    {
      label: "non-log range wording",
      method: "head" as const,
      status: 200,
      message: "block range too large",
      code: -32_005,
      expected: false,
    },
    {
      label: "HTTP 413",
      method: "logs" as const,
      status: 413,
      message: "payload too large",
      code: -32_005,
      expected: false,
    },
    {
      label: "HTTP 429",
      method: "logs" as const,
      status: 429,
      message: "rate limited",
      code: -32_005,
      expected: false,
    },
    {
      label: "HTTP 500",
      method: "logs" as const,
      status: 500,
      message: "server error",
      code: -32_000,
      expected: false,
    },
  ])("classifies $label without exposing provider text", async (testCase) => {
    const fetchImpl = vi.fn(async () =>
      testCase.status === 200
        ? new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              error: { code: testCase.code, message: testCase.message },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        : new Response("", { status: testCase.status }),
    );
    const rpc = createRpcClient("https://rpc.example", fetchImpl as typeof fetch);
    let caught: unknown;
    try {
      if (testCase.method === "logs") {
        await rpc.getLogs({ fromBlock: 1, toBlock: 2 });
      } else {
        await rpc.getBlockNumber();
      }
    } catch (error) {
      caught = error;
    }

    expect(isRpcRangeTooLargeError(caught)).toBe(testCase.expected);
    expect(String(caught)).not.toContain(testCase.message);
  });
});
