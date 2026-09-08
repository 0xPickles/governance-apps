export type FeedRequestContext = {
  deadlineAt: number;
  signal: AbortSignal;
};

export type FeedTransportPolicy = {
  createPayloadTooLargeError: () => Error;
  createTimeoutError: () => Error;
  fetchOptions?: Omit<RequestInit, "signal">;
  maximumPayloadBytes: number;
  fatalUtf8?: boolean;
  payloadTooLargeCancelReason: string;
  requestTimeoutMs: number;
  timeoutCancelReason: string;
};

/**
 * Gives the upstream fetch and its response body one shared elapsed-time
 * budget. The explicit race also bounds mocked or non-compliant fetch
 * implementations that do not settle when their AbortSignal fires.
 */
export async function withFeedRequest<T>(
  url: string,
  policy: FeedTransportPolicy,
  handleResponse: (
    response: Response,
    context: FeedRequestContext
  ) => Promise<T>
): Promise<T> {
  const abortController = new AbortController();
  const deadlineAt = Date.now() + policy.requestTimeoutMs;
  const timeoutError = policy.createTimeoutError();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      abortController.abort(timeoutError);
      reject(timeoutError);
    }, policy.requestTimeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, {
        ...policy.fetchOptions,
        signal: abortController.signal,
      }),
      deadline,
    ]);

    return await Promise.race([
      handleResponse(response, {
        deadlineAt,
        signal: abortController.signal,
      }),
      deadline,
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export async function readBoundedJson(
  response: Response,
  context: FeedRequestContext,
  policy: FeedTransportPolicy
): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (
      Number.isFinite(declaredBytes) &&
      declaredBytes > policy.maximumPayloadBytes
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw policy.createPayloadTooLargeError();
    }
  }

  if (!response.body) {
    return JSON.parse("") as unknown;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let payloadBytes = 0;
  const cancelReader = () => {
    void reader
      .cancel(context.signal.reason ?? policy.timeoutCancelReason)
      .catch(() => undefined);
  };
  context.signal.addEventListener("abort", cancelReader, { once: true });

  try {
    while (true) {
      if (Date.now() >= context.deadlineAt || context.signal.aborted) {
        cancelReader();
        throw policy.createTimeoutError();
      }

      const { done, value } = await readBeforeDeadline(
        reader,
        context.deadlineAt,
        policy
      );
      if (done) break;
      payloadBytes += value.byteLength;
      if (payloadBytes > policy.maximumPayloadBytes) {
        await reader.cancel(policy.payloadTooLargeCancelReason);
        throw policy.createPayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    context.signal.removeEventListener("abort", cancelReader);
    try {
      reader.releaseLock();
    } catch {
      // A late, non-compliant stream may still have a pending read.
    }
  }

  const payload = new Uint8Array(payloadBytes);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder("utf-8", { fatal: policy.fatalUtf8 ?? false }).decode(payload)) as unknown;
}

async function readBeforeDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadlineAt: number,
  policy: FeedTransportPolicy
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    void reader
      .cancel(policy.timeoutCancelReason)
      .catch(() => undefined);
    throw policy.createTimeoutError();
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      void reader
        .cancel(policy.timeoutCancelReason)
        .catch(() => undefined);
      reject(policy.createTimeoutError());
    }, remainingMs);
  });

  try {
    return await Promise.race([reader.read(), deadline]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
