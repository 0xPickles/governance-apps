import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishDaoContent, readStoredDaoContent } from "@/lib/server/dao-content";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";
import { readDaoBoundedBytes } from "@/lib/clients/dao/publication";
import type { DaoProposalContent } from "@/lib/clients/dao/types";
const content: DaoProposalContent = { schema: "yearn.dao.proposal.v1", markdown: "# Local publication\n\nA canonical document.\n\n## Body\n\nKeep exact bytes.\n",
  discussionUrl: "https://gov.yearn.fi/t/local-fork-uat/1234", proposalType: "signal", createdBy: "0x1111111111111111111111111111111111111111",
  createdAt: "2026-09-10T00:00:00Z", assets: [] };
const identity = deriveDaoProposalContentIdentity(content);
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development"); vi.stubEnv("DAO_IPFS_API_URL", "http://127.0.0.1:15001"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("durable raw-block publication adapter", () => {
  it("rejects a timed-out stream even when its prefix is a complete canonical document", async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(identity.bytes); } });
      const failure = expect(readDaoBoundedBytes(new Response(stream))).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(15_000);
      await failure;
    } finally { vi.useRealTimers(); }
  });

  it("requests pinning, publishes canonical bytes and verifies a separate exact retrieval", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
      calls.push(url);
      expect(options.redirect).toBe("error");
      if (url.includes("block/put")) {
        expect(url).toContain("pin=true"); expect(url).toContain("cid-codec=raw");
        const file = (options.body as FormData).get("file") as Blob;
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(identity.bytes);
        return Response.json({ Key: identity.cid, Size: identity.bytes.length });
      }
      return new Response(new Uint8Array(identity.bytes));
    }));
    expect(await publishDaoContent(identity.bytes)).toMatchObject({ digest: identity.digest, cid: identity.cid });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("block/get?arg=" + identity.cid);
  });
  it("refuses a mismatched publication identity or corrupted retrieval", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Key: "wrong", Size: identity.bytes.length })));
    await expect(publishDaoContent(identity.bytes)).rejects.toThrow("different content identity");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("corrupted")));
    await expect(readStoredDaoContent(identity.digest)).rejects.toThrow("commitment");
  });
  it("rejects missing configuration and loopback services in production", async () => {
    vi.stubEnv("DAO_IPFS_API_URL", "");
    await expect(publishDaoContent(identity.bytes)).rejects.toThrow("not configured");
    vi.stubEnv("DAO_IPFS_API_URL", "http://127.0.0.1:15001"); vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production");
    await expect(publishDaoContent(identity.bytes)).rejects.toThrow("configuration");
  });
  it("requires private authorization for an external service without exposing it to content", async () => {
    vi.stubEnv("DAO_IPFS_API_URL", "https://ipfs.example"); vi.stubEnv("DAO_IPFS_AUTHORIZATION", "");
    await expect(publishDaoContent(identity.bytes)).rejects.toThrow("credentials");
  });
  it("bounds streamed and declared sizes, and rejects noncanonical bytes before publication", async () => {
    await expect(readDaoBoundedBytes(new Response("12345"), 4)).rejects.toThrow("limit");
    await expect(readDaoBoundedBytes(new Response("x", { headers: { "content-length": "99999" } }), 4)).rejects.toThrow("limit");
    await expect(publishDaoContent(new TextEncoder().encode(JSON.stringify(content)))).rejects.toThrow();
  });
});
