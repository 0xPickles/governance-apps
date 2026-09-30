import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daoPublicationServiceConfiguration, uploadDaoPinataFile, retrieveDaoPinataFile } from "@/lib/server/dao-content";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";
import { readDaoBoundedBytes } from "@/lib/clients/dao/publication";
import type { DaoProposalContent } from "@/lib/clients/dao/types";
const content: DaoProposalContent = { schema: "yearn.dao.proposal.v1", markdown: "# Local publication\n\nA canonical document.\n\n## Body\n\nKeep exact bytes.\n",
  discussionUrl: "https://gov.yearn.fi/t/local-fork-uat/1234", proposalType: "signal", createdBy: "0x1111111111111111111111111111111111111111",
  createdAt: "2026-09-10T00:00:00Z", assets: [] };
const identity = deriveDaoProposalContentIdentity(content);
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production"); vi.stubEnv("DAO_PUBLICATION_TEST_ORIGIN", "");
  vi.stubEnv("DAO_PINATA_JWT", "test-only-secret"); vi.stubEnv("DAO_IPFS_GATEWAY_URL", "https://gateway.example/ipfs/");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Pinata exact-file transport", () => {
  it("rejects a timed-out stream even when its prefix is a complete canonical document", async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(identity.bytes); } });
      const failure = expect(readDaoBoundedBytes(new Response(stream))).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(15_000); await failure;
    } finally { vi.useRealTimers(); }
  });
  it.each(["declared", "streamed"])("rejects %s oversize without awaiting cancellation", async kind => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(5)); }, cancel: () => new Promise(() => {}) });
    await expect(readDaoBoundedBytes(new Response(stream, { headers: kind === "declared" ? { "content-length": "5" } : {} }), 4)).rejects.toThrow("byte limit");
  });
  it("rejects upstream errors without waiting for body cancellation or exposing provider details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { status: 503 })));
    await expect(retrieveDaoPinataFile(identity.bytes, daoPublicationServiceConfiguration())).rejects.toThrow("could not yet be verified");
  });
  it("uploads exact bytes with CIDv1 and no wrapping; public retrieval receives no credential", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
      calls.push(url); expect(options.redirect).toBe("manual"); expect(options.credentials).toBe("omit");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      if (options.method === "POST") {
        expect(url).toBe("https://api.pinata.cloud/pinning/pinFileToIPFS");
        expect(options.headers).toEqual({ Authorization: "Bearer test-only-secret" });
        const body = options.body as FormData;
        expect(JSON.parse(body.get("pinataOptions") as string)).toEqual({ cidVersion: 1, wrapWithDirectory: false });
        expect(new Uint8Array(await (body.get("file") as Blob).arrayBuffer())).toEqual(identity.bytes);
        return Response.json({ IpfsHash: identity.cid, PinSize: identity.bytes.length });
      }
      expect(options.headers).toBeUndefined();
      expect(url).toBe("https://gateway.example/ipfs/" + identity.cid);
      return new Response(new Uint8Array(identity.bytes));
    }));
    const service = daoPublicationServiceConfiguration();
    await uploadDaoPinataFile(identity.bytes, service); await retrieveDaoPinataFile(identity.bytes, service);
    expect(calls).toHaveLength(2);
  });
  it.each([301, 302, 303, 307, 308])("rejects upload and gateway redirects (%s)", async status => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.redirect).toBe("manual");
      return new Response(null, { status, headers: { Location: "https://untrusted.example/" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const service = daoPublicationServiceConfiguration();
    await expect(uploadDaoPinataFile(identity.bytes, service)).rejects.toMatchObject({ code: "verification_pending" });
    await expect(retrieveDaoPinataFile(identity.bytes, service)).rejects.toMatchObject({ code: "verification_pending" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([{}, { IpfsHash: "wrong", PinSize: identity.bytes.length }, { IpfsHash: identity.cid, PinSize: 0 }])("rejects invalid provider identity %j", async body => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    await expect(uploadDaoPinataFile(identity.bytes, daoPublicationServiceConfiguration())).rejects.toThrow();
  });
  it("rejects corrupt bytes and noncanonical uploads", async () => {
    const fetcher = vi.fn(async () => new Response("corrupt")); vi.stubGlobal("fetch", fetcher);
    await expect(retrieveDaoPinataFile(identity.bytes, daoPublicationServiceConfiguration())).rejects.toThrow();
    fetcher.mockClear();
    await expect(uploadDaoPinataFile(new TextEncoder().encode(JSON.stringify(content)), daoPublicationServiceConfiguration())).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves the full 131,072-byte canonical boundary", async () => {
    const base = { ...content, createdAt: "2026-09-10T00:00:00.0Z" };
    const overhead = deriveDaoProposalContentIdentity(base).bytes.length;
    const maximum = deriveDaoProposalContentIdentity({ ...base, createdAt: "2026-09-10T00:00:00." + "0".repeat(131072 - overhead + 1) + "Z" });
    expect(maximum.bytes.length).toBe(131072);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "POST") {
        const actual = new Uint8Array(await ((options.body as FormData).get("file") as Blob).arrayBuffer());
        expect(actual).toEqual(maximum.bytes);
        return Response.json({ IpfsHash: maximum.cid, PinSize: maximum.bytes.length });
      }
      return new Response(new Uint8Array(maximum.bytes));
    }));
    await uploadDaoPinataFile(maximum.bytes, daoPublicationServiceConfiguration());
    await retrieveDaoPinataFile(maximum.bytes, daoPublicationServiceConfiguration());
  });
  it.each(["http://gateway.example/ipfs/", "https://user:secret@gateway.example/ipfs/", "https://gateway.example/ipfs/?token=secret", "https://gateway.example/ipfs/#x"])("fails closed for unsafe gateway %s", value => {
    vi.stubEnv("DAO_IPFS_GATEWAY_URL", value); expect(daoPublicationServiceConfiguration).toThrow("temporarily unavailable");
  });
  it("fails closed without a key and forbids the local seam in production", () => {
    vi.stubEnv("DAO_PINATA_JWT", ""); expect(daoPublicationServiceConfiguration).toThrow();
    vi.stubEnv("DAO_PUBLICATION_TEST_ORIGIN", "http://127.0.0.1:18546"); expect(daoPublicationServiceConfiguration).toThrow();
  });
});
