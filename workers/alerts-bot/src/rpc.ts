export type BlockTag = number | "latest";

export interface RpcBlockHashReference {
  readonly blockHash: string;
  readonly requireCanonical: true;
}

export type RpcBlockReference = BlockTag | RpcBlockHashReference;

export interface RpcBlock {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number | null;
}

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockHash: string | null;
  blockNumber: number | null;
  transactionHash: string | null;
  logIndex: number | null;
  removed: boolean;
}

export interface RpcTransaction {
  hash: string;
  from: string;
  to: string | null;
  blockHash: string | null;
  blockNumber: number | null;
  nonce: number;
  transactionIndex: number | null;
  value: string;
  input: string;
}

export interface RpcTransactionReceipt {
  transactionHash: string;
  blockHash: string | null;
  blockNumber: number | null;
  status: number | null;
  logs: RpcLog[];
}

export interface RpcCallTraceLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly index: number;
  /** Number of direct child calls completed before this log was emitted. */
  readonly position: number;
}

export interface RpcCallTraceFrame {
  readonly type: string;
  readonly from: string;
  readonly to: string | null;
  readonly input: string;
  readonly output: string | null;
  readonly error: string | null;
  readonly calls: readonly RpcCallTraceFrame[];
  readonly logs: readonly RpcCallTraceLog[];
}

export interface RpcCallRequest {
  to: string;
  data: string;
}

export interface RpcExactBlockCallRequest {
  readonly request: RpcCallRequest;
  readonly blockReference: RpcBlockHashReference;
}

export interface RpcLogFilter {
  address?: string[];
  topics?: Array<string | string[] | null>;
  fromBlock: number;
  toBlock: number;
}

export interface RpcClient {
  getBlockNumber(signal?: AbortSignal): Promise<number>;
  getBlockByNumber(blockNumber: BlockTag, signal?: AbortSignal): Promise<RpcBlock>;
  /** Optional narrow batch used by the replay planner. Results preserve input order. */
  getBlocksByNumber?(
    blockNumbers: readonly number[],
    signal?: AbortSignal,
  ): Promise<RpcBlock[]>;
  getLogs(filter: RpcLogFilter, signal?: AbortSignal): Promise<RpcLog[]>;
  getTransactionByHash(
    hash: string,
    signal?: AbortSignal,
  ): Promise<RpcTransaction | null>;
  getTransactionByHash(
    hashes: string[],
    signal?: AbortSignal,
  ): Promise<Array<RpcTransaction | null>>;
  getTransactionReceipt(
    hash: string,
    signal?: AbortSignal,
  ): Promise<RpcTransactionReceipt | null>;
  getTransactionReceipt(
    hashes: string[],
    signal?: AbortSignal,
  ): Promise<Array<RpcTransactionReceipt | null>>;
  call(
    request: RpcCallRequest,
    blockReference?: RpcBlockReference,
    signal?: AbortSignal,
  ): Promise<string>;
  call(
    requests: readonly RpcCallRequest[],
    blockReference?: RpcBlockReference,
    signal?: AbortSignal,
  ): Promise<string[]>;
  /** Optional heterogeneous EIP-1898 batch used for per-block yETH metrics. */
  callAtBlocks?(
    requests: readonly RpcExactBlockCallRequest[],
    signal?: AbortSignal,
  ): Promise<string[]>;
  /** Optional exact transaction replay used only when event-time call evidence is required. */
  traceTransactionByHash?(
    hash: string,
    signal?: AbortSignal,
  ): Promise<RpcCallTraceFrame>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}

interface RawRpcBlock {
  number: string | null;
  hash: string;
  parentHash: string;
  timestamp?: unknown;
}

interface RawRpcLog {
  address: string;
  topics: string[];
  data: string;
  blockHash?: string | null;
  blockNumber: string | null;
  transactionHash: string | null;
  logIndex: string | null;
  removed?: boolean;
}

interface RawRpcTransaction {
  hash: string;
  from: string;
  to: string | null;
  blockHash: string | null;
  blockNumber: string | null;
  nonce: string;
  transactionIndex: string | null;
  value: string;
  input: string;
}

interface RawRpcTransactionReceipt {
  transactionHash: string;
  blockHash: string | null;
  blockNumber: string | null;
  status: string | null;
  logs: RawRpcLog[];
}

export type RpcRequestErrorKind = "local" | "protocol" | "provider" | "http";

export class RpcRequestError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly details?: unknown,
    readonly rpcCode?: number,
    readonly httpStatus?: number,
    readonly rangeLimit: boolean = false,
    readonly kind: RpcRequestErrorKind = "local",
    readonly batchLimit: boolean = false,
  ) {
    super(message);
    this.name = "RpcRequestError";
  }
}

class EthereumRpcClient implements RpcClient {
  private nextId = 1;

  constructor(
    private readonly rpcUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async getBlockNumber(signal?: AbortSignal): Promise<number> {
    const result = await this.request<string>("eth_blockNumber", [], signal);
    return parseHexQuantity(result);
  }

  async getBlockByNumber(
    blockNumber: BlockTag,
    signal?: AbortSignal,
  ): Promise<RpcBlock> {
    const result = await this.request<RawRpcBlock | null>("eth_getBlockByNumber", [
      toBlockTag(blockNumber),
      false,
    ], signal);
    if (result === null) {
      throw new RpcRequestError(
        `Block not found for tag ${String(blockNumber)}`,
        "eth_getBlockByNumber",
      );
    }
    return parseBlock(result);
  }

  async getBlocksByNumber(
    blockNumbers: readonly number[],
    signal?: AbortSignal,
  ): Promise<RpcBlock[]> {
    const results = await this.requestBatch<RawRpcBlock | null>(
      blockNumbers.map((blockNumber) => ({
        method: "eth_getBlockByNumber",
        params: [toBlockTag(blockNumber), false],
      })),
      signal,
    );
    return results.map((result, index) => {
      if (result === null) {
        throw new RpcRequestError(
          `Block not found for tag ${String(blockNumbers[index])}`,
          "eth_getBlockByNumber",
        );
      }
      return parseBlock(result);
    });
  }

  async getLogs(filter: RpcLogFilter, signal?: AbortSignal): Promise<RpcLog[]> {
    const params: {
      fromBlock: string;
      toBlock: string;
      address?: string | string[];
      topics?: Array<string | string[] | null>;
    } = {
      fromBlock: toHexQuantity(filter.fromBlock),
      toBlock: toHexQuantity(filter.toBlock),
    };

    if (filter.address && filter.address.length > 0) {
      params.address =
        filter.address.length === 1 ? filter.address[0] : filter.address;
    }

    if (filter.topics) {
      params.topics = filter.topics;
    }

    const results = await this.request<RawRpcLog[]>("eth_getLogs", [params], signal);
    return results.map(parseLog);
  }

  async getTransactionByHash(
    hash: string,
    signal?: AbortSignal,
  ): Promise<RpcTransaction | null>;
  async getTransactionByHash(
    hashes: string[],
    signal?: AbortSignal,
  ): Promise<Array<RpcTransaction | null>>;
  async getTransactionByHash(
    hashOrHashes: string | string[],
    signal?: AbortSignal,
  ): Promise<RpcTransaction | null | Array<RpcTransaction | null>> {
    if (typeof hashOrHashes === "string") {
      const result = await this.request<RawRpcTransaction | null>(
        "eth_getTransactionByHash",
        [hashOrHashes],
        signal,
      );
      return result === null ? null : parseTransaction(result);
    }

    const results = await this.requestBatch<RawRpcTransaction | null>(
      hashOrHashes.map((hash) => ({
        method: "eth_getTransactionByHash",
        params: [hash],
      })),
      signal,
    );
    return results.map((result) =>
      result === null ? null : parseTransaction(result),
    );
  }

  async getTransactionReceipt(
    hash: string,
    signal?: AbortSignal,
  ): Promise<RpcTransactionReceipt | null>;
  async getTransactionReceipt(
    hashes: string[],
    signal?: AbortSignal,
  ): Promise<Array<RpcTransactionReceipt | null>>;
  async getTransactionReceipt(
    hashOrHashes: string | string[],
    signal?: AbortSignal,
  ): Promise<RpcTransactionReceipt | null | Array<RpcTransactionReceipt | null>> {
    if (typeof hashOrHashes === "string") {
      const result = await this.request<RawRpcTransactionReceipt | null>(
        "eth_getTransactionReceipt",
        [hashOrHashes],
        signal,
      );
      return result === null ? null : parseTransactionReceipt(result);
    }

    const results = await this.requestBatch<RawRpcTransactionReceipt | null>(
      hashOrHashes.map((hash) => ({
        method: "eth_getTransactionReceipt",
        params: [hash],
      })),
      signal,
    );
    return results.map((result) =>
      result === null ? null : parseTransactionReceipt(result),
    );
  }

  async call(
    request: RpcCallRequest,
    blockReference?: RpcBlockReference,
    signal?: AbortSignal,
  ): Promise<string>;
  async call(
    requests: readonly RpcCallRequest[],
    blockReference?: RpcBlockReference,
    signal?: AbortSignal,
  ): Promise<string[]>;
  async call(
    requestOrRequests: RpcCallRequest | readonly RpcCallRequest[],
    blockReference: RpcBlockReference = "latest",
    signal?: AbortSignal,
  ): Promise<string | string[]> {
    const blockTag = toBlockReference(blockReference);
    if (Array.isArray(requestOrRequests)) {
      return this.requestBatch<string>(
        requestOrRequests.map((request) => ({
          method: "eth_call",
          params: [request, blockTag],
        })),
        signal,
      );
    }
    return this.request<string>("eth_call", [requestOrRequests, blockTag], signal);
  }

  async callAtBlocks(
    requests: readonly RpcExactBlockCallRequest[],
    signal?: AbortSignal,
  ): Promise<string[]> {
    return this.requestBatch<string>(
      requests.map(({ request, blockReference }) => ({
        method: "eth_call",
        params: [request, toBlockReference(blockReference)],
      })),
      signal,
    );
  }

  async traceTransactionByHash(
    hash: string,
    signal?: AbortSignal,
  ): Promise<RpcCallTraceFrame> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      throw new RpcRequestError(
        "Expected a 32-byte transaction hash",
        "debug_traceTransaction",
      );
    }
    const result = await this.request<unknown>(
      "debug_traceTransaction",
      [
        hash.toLowerCase(),
        {
          tracer: "callTracer",
          tracerConfig: { withLog: true },
        },
      ],
      signal,
      ALERT_RPC_MAX_TRACE_RESPONSE_BYTES,
    );
    return parseCallTraceFrame(result);
  }

  private buildRequest(method: string, params: unknown[]): JsonRpcRequest {
    return {
      jsonrpc: "2.0",
      id: this.nextId++,
      method,
      params,
    };
  }

  private async request<TResult>(
    method: string,
    params: unknown[],
    signal?: AbortSignal,
    maxResponseBytes?: number,
  ): Promise<TResult> {
    const request = this.buildRequest(method, params);
    const response = await this.post(request, method, signal, maxResponseBytes);
    if (Array.isArray(response)) {
      throw malformedResponse(method, "single_shape");
    }
    return extractResult(response, request.id, method);
  }

  private async requestBatch<TResult>(
    calls: Array<{ method: string; params: unknown[] }>,
    signal?: AbortSignal,
  ): Promise<TResult[]> {
    if (calls.length === 0) {
      return [];
    }
    if (calls.length > ALERT_RPC_MAX_BATCH_SIZE) {
      throw new RpcRequestError(
        `JSON-RPC batch exceeds ${ALERT_RPC_MAX_BATCH_SIZE} items`,
        "batch",
      );
    }

    const requests = calls.map((call) => this.buildRequest(call.method, call.params));
    const response = await this.post(requests, "batch", signal);
    const batchLimit = parseBatchPayloadLimit(response);
    if (batchLimit !== null) throw batchLimit;
    if (!Array.isArray(response)) {
      throw malformedResponse("batch", "batch_shape");
    }

    if (response.length !== requests.length) {
      throw malformedResponse("batch", "batch_cardinality");
    }
    const expectedIds = new Set(requests.map(({ id }) => id));
    const responsesById = new Map<number, unknown>();
    for (const item of response) {
      if (
        !isRecord(item) ||
        item.jsonrpc !== "2.0" ||
        !Number.isSafeInteger(item.id) ||
        !expectedIds.has(item.id as number) ||
        responsesById.has(item.id as number)
      ) {
        throw malformedResponse("batch", "batch_identity");
      }
      responsesById.set(item.id as number, item);
    }

    return requests.map((request) => {
      const item = responsesById.get(request.id);
      return extractResult(item, request.id, request.method);
    });
  }

  private async post(
    payload: JsonRpcRequest | JsonRpcRequest[],
    method: string,
    signal?: AbortSignal,
    maxResponseBytes?: number,
  ): Promise<unknown> {
    const response = await this.fetchImpl.call(globalThis, this.rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      ...(signal === undefined ? {} : { signal }),
    });

    if (!response.ok) {
      await cancelResponseBody(response);
      throw new RpcRequestError(
        `RPC request failed with HTTP ${response.status}`,
        method,
        undefined,
        undefined,
        response.status,
        false,
        "http",
      );
    }

    if (maxResponseBytes !== undefined) {
      return readBoundedJson(response, method, maxResponseBytes);
    }

    try {
      return await response.json();
    } catch {
      throw malformedResponse(method, "json_decode");
    }
  }
}

async function readBoundedJson(
  response: Response,
  method: string,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    await cancelResponseBody(response);
    throw malformedResponse(method, "response_size");
  }
  if (response.body === null) {
    throw malformedResponse(method, "json_decode");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw malformedResponse(method, "response_size");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof RpcRequestError) throw error;
    throw malformedResponse(method, "json_decode");
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cancellation is best-effort; retain the controlled RPC failure.
  }
}

function extractResult<TResult>(
  response: unknown,
  id: number,
  method: string,
): TResult {
  if (
    !isRecord(response) ||
    response.jsonrpc !== "2.0" ||
    response.id !== id
  ) {
    throw malformedResponse(method, "response_identity");
  }

  const hasResult = Object.prototype.hasOwnProperty.call(response, "result");
  const hasError = Object.prototype.hasOwnProperty.call(response, "error");
  if (hasResult === hasError) {
    throw malformedResponse(method, "response_outcome");
  }

  if (hasError) {
    const error = response.error;
    if (
      !isRecord(error) ||
      !Number.isSafeInteger(error.code) ||
      typeof error.message !== "string"
    ) {
      throw malformedResponse(method, "error_shape");
    }
    throw new RpcRequestError(
      `RPC error ${String(error.code)}`,
      method,
      undefined,
      error.code as number,
      undefined,
      isClosedRangeLimitMessage(error.message),
      isProtocolRpcErrorCode(error.code as number) ? "protocol" : "provider",
    );
  }

  return response.result as TResult;
}

function malformedResponse(method: string, reason: string): RpcRequestError {
  return new RpcRequestError(
    `Malformed JSON-RPC response (${reason})`,
    method,
    undefined,
    undefined,
    undefined,
    false,
    "protocol",
  );
}

function isProtocolRpcErrorCode(code: number): boolean {
  return code === -32700 || (code >= -32602 && code <= -32600);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseBlock(raw: RawRpcBlock): RpcBlock {
  if (!isRecord(raw) || raw.number === null || typeof raw.number !== "string") {
    throw new RpcRequestError(
      "Block payload is missing a block number",
      "eth_getBlockByNumber",
    );
  }

  if (
    typeof raw.hash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(raw.hash) ||
    typeof raw.parentHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(raw.parentHash)
  ) {
    throw new RpcRequestError(
      "Block payload has invalid identity fields",
      "eth_getBlockByNumber",
    );
  }

  let timestamp: number | null = null;
  if (typeof raw.timestamp === "string") {
    try {
      timestamp = parseHexQuantity(raw.timestamp);
    } catch {
      timestamp = null;
    }
  }

  return {
    number: parseHexQuantity(raw.number),
    hash: raw.hash.toLowerCase(),
    parentHash: raw.parentHash.toLowerCase(),
    timestamp,
  };
}

function parseLog(raw: RawRpcLog): RpcLog {
  return {
    address: raw.address,
    topics: raw.topics,
    data: raw.data,
    blockHash: raw.blockHash ?? null,
    blockNumber: parseNullableHexQuantity(raw.blockNumber),
    transactionHash: raw.transactionHash,
    logIndex: parseNullableHexQuantity(raw.logIndex),
    removed: raw.removed ?? false,
  };
}

function parseTransaction(raw: RawRpcTransaction): RpcTransaction {
  return {
    hash: raw.hash,
    from: raw.from,
    to: raw.to,
    blockHash: raw.blockHash,
    blockNumber: parseNullableHexQuantity(raw.blockNumber),
    nonce: parseHexQuantity(raw.nonce),
    transactionIndex: parseNullableHexQuantity(raw.transactionIndex),
    value: raw.value,
    input: raw.input,
  };
}

function parseTransactionReceipt(raw: RawRpcTransactionReceipt): RpcTransactionReceipt {
  return {
    transactionHash: raw.transactionHash,
    blockHash: raw.blockHash,
    blockNumber: parseNullableHexQuantity(raw.blockNumber),
    status: parseNullableHexQuantity(raw.status),
    logs: raw.logs.map(parseLog),
  };
}

interface CallTraceParseBudget {
  frames: number;
  logs: number;
}

function parseCallTraceFrame(
  raw: unknown,
  depth = 0,
  budget: CallTraceParseBudget = { frames: 0, logs: 0 },
): RpcCallTraceFrame {
  budget.frames += 1;
  if (
    depth > ALERT_RPC_MAX_TRACE_DEPTH ||
    budget.frames > ALERT_RPC_MAX_TRACE_FRAMES ||
    !isRecord(raw) ||
    typeof raw.type !== "string" ||
    typeof raw.from !== "string" ||
    !isAddress(raw.from) ||
    (raw.to !== undefined && (typeof raw.to !== "string" || !isAddress(raw.to))) ||
    typeof raw.input !== "string" ||
    !isHexData(raw.input) ||
    (raw.output !== undefined && (typeof raw.output !== "string" || !isHexData(raw.output))) ||
    (raw.error !== undefined && typeof raw.error !== "string") ||
    (raw.calls !== undefined && !Array.isArray(raw.calls)) ||
    (raw.logs !== undefined && !Array.isArray(raw.logs))
  ) {
    throw malformedResponse("debug_traceTransaction", "call_trace_shape");
  }

  const rawCalls = raw.calls ?? [];
  const rawLogs = raw.logs ?? [];
  const calls = rawCalls.map((call) =>
    parseCallTraceFrame(call, depth + 1, budget)
  );
  const logs = rawLogs.map((log) => parseCallTraceLog(log, budget));
  let previousPosition = 0;
  for (const log of logs) {
    if (log.position > calls.length || log.position < previousPosition) {
      throw malformedResponse("debug_traceTransaction", "call_trace_log_position");
    }
    previousPosition = log.position;
  }

  return Object.freeze({
    type: raw.type.toUpperCase(),
    from: raw.from.toLowerCase(),
    to: typeof raw.to === "string" ? raw.to.toLowerCase() : null,
    input: raw.input.toLowerCase(),
    output: typeof raw.output === "string" ? raw.output.toLowerCase() : null,
    error: typeof raw.error === "string" ? raw.error : null,
    calls: Object.freeze(calls),
    logs: Object.freeze(logs),
  });
}

function parseCallTraceLog(
  raw: unknown,
  budget: CallTraceParseBudget,
): RpcCallTraceLog {
  budget.logs += 1;
  if (
    budget.logs > ALERT_RPC_MAX_TRACE_LOGS ||
    !isRecord(raw) ||
    typeof raw.address !== "string" ||
    !isAddress(raw.address) ||
    !Array.isArray(raw.topics) ||
    !raw.topics.every((topic) => typeof topic === "string" && isHash(topic)) ||
    typeof raw.data !== "string" ||
    !isHexData(raw.data) ||
    typeof raw.index !== "string" ||
    typeof raw.position !== "string"
  ) {
    throw malformedResponse("debug_traceTransaction", "call_trace_log_shape");
  }
  let index: number;
  let position: number;
  try {
    index = parseHexQuantity(raw.index);
    position = parseHexQuantity(raw.position);
  } catch {
    throw malformedResponse("debug_traceTransaction", "call_trace_log_quantity");
  }
  return Object.freeze({
    address: raw.address.toLowerCase(),
    topics: Object.freeze(raw.topics.map((topic) => topic.toLowerCase())),
    data: raw.data.toLowerCase(),
    index,
    position,
  });
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isHexData(value: string): boolean {
  return /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}

function parseHexQuantity(value: string): number {
  if (
    typeof value !== "string" ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)
  ) {
    throw new RpcRequestError(
      `Expected hex quantity, received "${value}"`,
      "parseHexQuantity",
    );
  }

  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RpcRequestError(
      `Unable to parse numeric hex quantity "${value}"`,
      "parseHexQuantity",
    );
  }

  return Number(parsed);
}

function parseNullableHexQuantity(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  return parseHexQuantity(value);
}

function toHexQuantity(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RpcRequestError(
      `Expected a non-negative integer, received ${value}`,
      "toHexQuantity",
    );
  }
  return `0x${value.toString(16)}`;
}

function toBlockTag(tag: BlockTag): string {
  if (tag === "latest") {
    return tag;
  }
  return toHexQuantity(tag);
}

function toBlockReference(
  reference: RpcBlockReference,
): string | RpcBlockHashReference {
  if (typeof reference === "string" || typeof reference === "number") {
    return toBlockTag(reference);
  }
  if (
    reference === null ||
    typeof reference !== "object" ||
    reference.requireCanonical !== true ||
    typeof reference.blockHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(reference.blockHash)
  ) {
    throw new RpcRequestError(
      "Expected a canonical 32-byte block-hash reference",
      "eth_call",
    );
  }
  return {
    blockHash: reference.blockHash.toLowerCase(),
    requireCanonical: true,
  };
}

export function createRpcClient(
  rpcUrl: string,
  fetchImpl: typeof fetch = fetch,
): RpcClient {
  if (!rpcUrl) {
    throw new RpcRequestError("RPC URL is required", "constructor");
  }
  return new EthereumRpcClient(rpcUrl, fetchImpl);
}

export const ALERT_RPC_MAX_BATCH_SIZE = 25;
export const ALERT_RPC_MAX_TRACE_RESPONSE_BYTES = 8 * 1024 * 1024;
const ALERT_RPC_MAX_TRACE_DEPTH = 1_024;
const ALERT_RPC_MAX_TRACE_FRAMES = 20_000;
const ALERT_RPC_MAX_TRACE_LOGS = 20_000;

/** Only explicit provider result/range limits are safe to retry with a smaller range. */
export function isRpcRangeTooLargeError(error: unknown): boolean {
  return (
    error instanceof RpcRequestError &&
    error.method === "eth_getLogs" &&
    error.httpStatus === undefined &&
    error.rangeLimit
  );
}

/** Only a batch HTTP payload rejection is safe to retry with fewer items. */
export function isRpcBatchPayloadTooLargeError(error: unknown): boolean {
  return (
    error instanceof RpcRequestError &&
    error.method === "batch" &&
    ((error.kind === "http" && error.httpStatus === 413) ||
      (error.kind === "provider" && error.batchLimit))
  );
}

function parseBatchPayloadLimit(response: unknown): RpcRequestError | null {
  const candidate =
    Array.isArray(response) && response.length === 1 ? response[0] : response;
  if (
    !isRecord(candidate) ||
    candidate.jsonrpc !== "2.0" ||
    candidate.id !== null ||
    !Object.hasOwn(candidate, "error") ||
    Object.hasOwn(candidate, "result") ||
    !isRecord(candidate.error) ||
    !Number.isSafeInteger(candidate.error.code) ||
    isProtocolRpcErrorCode(candidate.error.code as number) ||
    typeof candidate.error.message !== "string" ||
    !isClosedBatchLimitMessage(candidate.error.message)
  ) {
    return null;
  }
  return new RpcRequestError(
    `RPC batch error ${String(candidate.error.code)}`,
    "batch",
    undefined,
    candidate.error.code as number,
    undefined,
    false,
    "provider",
    true,
  );
}

function isClosedBatchLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "batch too large",
    "batch size too large",
    "batch limit exceeded",
    "exceeds maximum batch size",
    "too many requests in batch",
    "too many items in batch",
  ].some((marker) => normalized.includes(marker));
}

function isClosedRangeLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "block range too large",
    "block range is too large",
    "exceeds maximum block range",
    "block range limit exceeded",
    "range exceeds maximum",
    "too many results",
    "query returned more than",
    "response size exceeded",
    "log response size exceeded",
  ].some((marker) => normalized.includes(marker)) ||
    /limited to (?:a )?(?:[0-9][0-9,]* )?blocks? range/.test(normalized);
}
