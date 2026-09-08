import { afterEach, describe, expect, it, vi } from "vitest";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";
import { DaoFeedReader, fetchDaoFeed, DAO_FEED_REQUEST_TIMEOUT_MS } from "@/lib/clients/dao/feed";
import { parseDaoFeed, DAO_FEED_MAX_PAYLOAD_BYTES } from "@/lib/schemas/dao-feed";
import { V2_DEPLOYMENTS, v2Hash } from "../../../fixtures/dao-feed-v2";
import { GET, HEAD } from "@/app/api/dao-data/route";

const originalUrl = process.env.DAO_DATA_URL;
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
  if (originalUrl === undefined) delete process.env.DAO_DATA_URL;
  else process.env.DAO_DATA_URL = originalUrl;
});
function respond(value: unknown) { return new Response(JSON.stringify(value)); }
function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("DAO real transport and snapshot retention", () => {
  it("reads saved bytes through transport, parser and domain adapter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(saved));
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = await new DaoFeedReader(V2_DEPLOYMENTS).refresh();
    expect(snapshot.proposals[0].ref.proposalId).toBe(0n);
    expect(snapshot.proposals[6]).toMatchObject({ retracted: true, flagged: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/dao-data", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });

  it("preserves last-good on invalid envelopes, unsupported versions and HTTP failure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(saved))
      .mockResolvedValueOnce(respond({ ...saved, chainId: "1" }))
      .mockResolvedValueOnce(respond({ ...saved, schema: "yearn.dao.feed.v1" }))
      .mockResolvedValueOnce(new Response("failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const reader = new DaoFeedReader(V2_DEPLOYMENTS);
    const first = await reader.refresh();
    for (let i = 0; i < 3; i++) {
      await expect(reader.refresh()).rejects.toThrow();
      expect(reader.current()).toBe(first);
    }
  });

  it("never promotes an out-of-order response", async () => {
    const first = defer<ReturnType<typeof parseDaoFeed>>();
    const second = defer<ReturnType<typeof parseDaoFeed>>();
    const reader = new DaoFeedReader(V2_DEPLOYMENTS, vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise));
    const olderRequest = reader.refresh();
    const newerRequest = reader.refresh();
    const next = parseDaoFeed({ ...saved, observedAt: saved.observedAt + 1 });
    second.resolve(next);
    const accepted = await newerRequest;
    first.resolve(parseDaoFeed(saved));
    expect(await olderRequest).toBe(accepted);
    expect(reader.wire()?.observedAt).toBe(saved.observedAt + 1);
  });

  it("accepts a later canonical replacement at lower height and rejects delayed publication", async () => {
    const replacement = { ...saved, observedAt: saved.observedAt + 20,
      block: { ...saved.block, number: String(BigInt(saved.block.number) - 1n), hash: v2Hash(9), timestamp: saved.block.timestamp - 12 } };
    const reader = new DaoFeedReader(V2_DEPLOYMENTS, vi.fn()
      .mockResolvedValueOnce(parseDaoFeed(saved)).mockResolvedValueOnce(parseDaoFeed(replacement))
      .mockResolvedValueOnce(parseDaoFeed(saved)));
    await reader.refresh();
    const recovered = await reader.refresh();
    expect(recovered.canonicalBlock.hash).toBe(v2Hash(9));
    await expect(reader.refresh()).rejects.toThrow("older DAO publication");
    expect(reader.current()).toBe(recovered);
  });

  it("scopes caches to deployments and rejects conflicting observations", async () => {
    const reader = new DaoFeedReader(V2_DEPLOYMENTS, async () => parseDaoFeed(saved));
    await reader.refresh();
    const other = new DaoFeedReader([], async () => parseDaoFeed(saved));
    await expect(other.refresh()).rejects.toThrow("configured");
    expect(other.current()).toBeNull();
    const conflict = new DaoFeedReader(V2_DEPLOYMENTS, vi.fn()
      .mockResolvedValueOnce(parseDaoFeed(saved))
      .mockResolvedValueOnce(parseDaoFeed({ ...saved, deployments: saved.deployments.map(d => ({ ...d, configuration: { ...d.configuration, threshold: "6000" } })) })));
    const good = await conflict.refresh();
    await expect(conflict.refresh()).rejects.toThrow("same observation time");
    expect(conflict.current()).toBe(good);
  });

  it.each(["headers", "body"])("times out during %s with one bounded deadline", async (phase) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => phase === "headers"
      ? new Promise(() => undefined)
      : Promise.resolve(new Response(new ReadableStream({ cancel })))));
    const request = fetchDaoFeed();
    const rejected = expect(request).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(DAO_FEED_REQUEST_TIMEOUT_MS);
    await rejected;
    if (phase === "body") expect(cancel).toHaveBeenCalled();
  });

  it.each([true, false])("bounds declared and streamed payload bytes (header: %s)", async (declared) => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) { if (!declared) controller.enqueue(new Uint8Array(DAO_FEED_MAX_PAYLOAD_BYTES + 1)); },
      cancel,
    }), { headers: declared ? { "content-length": String(DAO_FEED_MAX_PAYLOAD_BYTES + 1) } : {} })));
    await expect(fetchDaoFeed()).rejects.toMatchObject({ kind: "oversized" });
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects malformed UTF-8 in the envelope before interpreting JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]))));
    await expect(fetchDaoFeed()).rejects.toThrow();
  });

  it.each([[409, "incompatible"], [504, "timeout"]] as const)("preserves proxy failure classification for HTTP %s", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream error", { status })));
    await expect(fetchDaoFeed()).rejects.toMatchObject({ kind });
  });

  it("validates the fixed upstream in the real proxy and never uses a mock fallback", async () => {
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DAO", "true");
    delete process.env.DAO_DATA_URL;
    expect((await GET()).status).toBe(503);
    process.env.DAO_DATA_URL = "https://operator.example/dao.json";
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(saved)).mockResolvedValueOnce(respond({ schema: "yearn.dao.feed.v1" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await GET();
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(parseDaoFeed(await result.json()).proposals[0].id).toBe("0");
    expect(fetchMock.mock.calls[0][0]).toBe("https://operator.example/dao.json");
    expect((await GET()).status).toBe(409);
  });

  it.each([undefined, "https://operator.example/dao.json"])("gates GET and HEAD before upstream configuration (%s)", async (url) => {
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DAO", "false");
    vi.stubEnv("DAO_DATA_URL", url);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const request of [GET, HEAD]) {
      const response = await request();
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
