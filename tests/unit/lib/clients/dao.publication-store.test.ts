import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";
import { DaoPublicationStore, DAO_PUBLICATION_LEASE_MS } from "@/lib/server/dao-publication-store";
import { DAO_PUBLICATION_DEFAULT_LIMITS as defaults, daoPublicationLimits } from "@/lib/server/dao-publication-policy";
import { publishDaoContent, readStoredDaoContent } from "@/lib/server/dao-content";
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { DAO_PUBLICATION_DB: db } }) }));
vi.mock("@/lib/clients/dao/forum", () => ({ validateDaoForumTopic: vi.fn(async (url: string) => ({ state: "valid", topic: { normalizedUrl: url } })) }));
let db: D1Database, platform: PlatformProxy<{ DAO_PUBLICATION_DB: D1Database }>, directory: string;
const identity = (n = 0) => deriveDaoProposalContentIdentity({
  schema: "yearn.dao.proposal.v1", markdown: "# Public document " + n + "\n\nImmutable Unicode: café 🌱.\n\n## Scope\n\nAdmission test.\n",
  discussionUrl: "https://gov.yearn.fi/t/topic/1001", proposalType: "signal",
  createdBy: "0x1111111111111111111111111111111111111111", createdAt: "2026-09-16T00:00:00Z", assets: [],
});
async function start() {
  platform = await getPlatformProxy<{ DAO_PUBLICATION_DB: D1Database }>({
    configPath: "tests/fixtures/dao-publication.wrangler.jsonc", persist: { path: directory },
  });
  db = platform.env.DAO_PUBLICATION_DB;
}
async function reserve(store: DaoPublicationStore, n = 0, now?: number) {
  const i = identity(n); return store.reserve(i.digest, i.cid, i.bytes, now);
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "dao-publication-test-")); await start();
  const sql = await readFile("migrations/dao-publication/0001_publications.sql", "utf8");
  await db.batch(sql.split(";").filter(s => s.trim()).map(s => db.prepare(s)));
}, 30_000);
afterAll(async () => { await platform?.dispose(); if (directory) await rm(directory, { recursive: true, force: true }); }, 30_000);
beforeEach(async () => {
  await db.batch([db.prepare("DELETE FROM dao_publications"), db.prepare("DELETE FROM dao_publication_policy")]);
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production"); vi.stubEnv("DAO_PUBLICATION_ENABLED", "true");
  vi.stubEnv("DAO_PUBLICATION_LIMITS", ""); vi.stubEnv("DAO_PUBLICATION_TEST_ORIGIN", "");
  vi.stubEnv("DAO_PINATA_JWT", "test-only-secret"); vi.stubEnv("DAO_IPFS_GATEWAY_URL", "https://gateway.example/ipfs/");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("admission on real local D1", () => {
  it("serializes same-digest races across independent stores", async () => {
    const requests = await Promise.allSettled(Array.from({ length: 12 }, () => reserve(new DaoPublicationStore(db, defaults))));
    expect(requests.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.prepare("SELECT COUNT(*) AS n, SUM(reservations) AS r FROM dao_publications").first()).toEqual({ n: 1, r: 1 });
  });
  it("atomically bounds distinct concurrent reservations across stores", async () => {
    const requests = await Promise.allSettled(Array.from({ length: 12 }, (_, n) => reserve(new DaoPublicationStore(db, { ...defaults, hourlyDocuments: 20 }), n)));
    expect(requests.filter(r => r.status === "fulfilled")).toHaveLength(2);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM dao_publications").first()).toEqual({ n: 2 });
  });
  it.each(["hourlyDocuments", "dailyDocuments", "monthlyDocuments", "documents", "bytes"] as const)("enforces %s including abandoned documents", async field => {
    const limits = { ...defaults, hourlyDocuments: 100, dailyDocuments: 100, monthlyDocuments: 100, [field]: field === "bytes" ? identity().bytes.length * 2 - 1 : 1 };
    const store = new DaoPublicationStore(db, limits);
    const first = await reserve(store); await store.release(first.row.digest, first.token!);
    await expect(reserve(store, 1)).rejects.toMatchObject({ code: "budget_reached" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM dao_publications").first()).toEqual({ n: 1 });
  });
  it("reopens rolling windows but never cumulative capacity", async () => {
    const store = new DaoPublicationStore(db, { ...defaults, hourlyDocuments: 1, documents: 2 });
    const now = Date.now(); await reserve(store, 0, now);
    await expect(reserve(store, 1, now + 3_599_999)).rejects.toMatchObject({ code: "budget_reached" });
    await reserve(store, 1, now + 3_600_001);
    await expect(reserve(store, 2, now + 31 * 86_400_000)).rejects.toMatchObject({ code: "budget_reached" });
  });
  it("persists reservations and spent attempts across a runtime restart and fences stale owners", async () => {
    const now = Date.now(), store = new DaoPublicationStore(db, defaults);
    const first = await reserve(store, 0, now); await store.spend(first.row.digest, first.token!, "upload", now);
    await platform.dispose(); await start();
    const restarted = new DaoPublicationStore(db, defaults);
    await expect(reserve(restarted, 0, now + 1)).rejects.toMatchObject({ code: "busy" });
    const next = await reserve(restarted, 0, now + DAO_PUBLICATION_LEASE_MS + 1);
    expect(next.row.upload_attempts).toBe(1); expect(next.token).not.toBe(first.token);
    await expect(restarted.spend(first.row.digest, first.token!, "upload", now)).rejects.toThrow();
    await expect(restarted.verified(first.row.digest, first.token!)).rejects.toThrow();
    await restarted.release(first.row.digest, first.token!);
    expect((await db.prepare("SELECT lease_token FROM dao_publications").first())?.lease_token).toBe(next.token);
  }, 30_000);
  it.each(["upload", "retrieval"] as const)("bounds global and per-document %s attempts without refunds", async kind => {
    const limits = { ...defaults, uploadAttempts: 2, retrievalAttempts: 2, documentUploadAttempts: 1, documentRetrievalAttempts: 1 };
    const store = new DaoPublicationStore(db, limits);
    const a = await reserve(store), b = await reserve(store, 1);
    await Promise.all([store.spend(a.row.digest, a.token!, kind), store.spend(b.row.digest, b.token!, kind)]);
    await expect(store.spend(a.row.digest, a.token!, kind)).rejects.toMatchObject({ code: "budget_reached" });
    await store.release(a.row.digest, a.token!); await store.release(b.row.digest, b.token!);
    await expect(reserve(store, 2, Date.now() + 3_600_001)).rejects.toMatchObject({ code: "budget_reached" });
  });
  it("caps restart/retry reservations even before an upload; rejects policy drift", async () => {
    const now = Date.now(), store = new DaoPublicationStore(db, { ...defaults, documentReservations: 1 });
    await reserve(store, 0, now);
    await expect(reserve(store, 0, now + DAO_PUBLICATION_LEASE_MS + 1)).rejects.toMatchObject({ code: "budget_reached" });
    await expect(reserve(new DaoPublicationStore(db, defaults), 1)).rejects.toMatchObject({ code: "unavailable" });
    vi.stubEnv("DAO_PUBLICATION_LIMITS", '{"concurrent":3}'); expect(daoPublicationLimits).toThrow();
  });
  it("requires upload acceptance before completing a live reservation", async () => {
    const store = new DaoPublicationStore(db, defaults);
    const first = await reserve(store);
    await store.spend(first.row.digest, first.token!, "upload");
    await store.spend(first.row.digest, first.token!, "retrieval");
    await expect(store.verified(first.row.digest, first.token!)).rejects.toThrow();
    expect(await db.prepare("SELECT published_at, upload_accepted, upload_attempts, retrieval_attempts FROM dao_publications").first())
      .toEqual({ published_at: null, upload_accepted: 0, upload_attempts: 1, retrieval_attempts: 1 });
    await store.accepted(first.row.digest, first.token!);
    expect(await store.verified(first.row.digest, first.token!)).toBeGreaterThan(0);
  });
});
describe("publication with durable recovery", () => {
  it("deduplicates verified bytes without provider calls, including restart and disabled recovery reads", async () => {
    const i = identity();
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => options.method === "POST"
      ? Response.json({ IpfsHash: i.cid, PinSize: i.bytes.length }) : new Response(new Uint8Array(i.bytes)));
    vi.stubGlobal("fetch", fetcher);
    expect(await publishDaoContent(i.bytes)).toMatchObject({ state: "published", digest: i.digest, cid: i.cid });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await platform.dispose(); await start();
    expect(await publishDaoContent(i.bytes)).toMatchObject({ state: "already_published" });
    vi.stubEnv("DAO_PUBLICATION_ENABLED", "false");
    vi.stubEnv("DAO_PUBLICATION_LIMITS", "invalid configuration");
    vi.stubEnv("DAO_PINATA_JWT", ""); vi.stubEnv("DAO_IPFS_GATEWAY_URL", "");
    expect(await readStoredDaoContent(i.digest)).toEqual(i.bytes);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(publishDaoContent(identity(1).bytes)).rejects.toMatchObject({ code: "disabled" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  }, 30_000);
  it.each(["rejected", "ambiguous"] as const)("requires another acknowledged upload when the prior outcome is %s, despite retrievable bytes", async outcome => {
    const i = identity();
    let acceptUpload = false;
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      // The open gateway always has the exact bytes, independently of our account's upload.
      if (options.method !== "POST") return new Response(new Uint8Array(i.bytes));
      const file = (options.body as FormData).get("file") as Blob;
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(i.bytes);
      if (acceptUpload) return Response.json({ IpfsHash: i.cid, PinSize: i.bytes.length });
      if (outcome === "ambiguous") throw new Error("timeout with private URL");
      return new Response(null, { status: 403 });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "verification_pending" });
    await db.prepare("UPDATE dao_publications SET retry_after = 0").run();
    await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "verification_pending" });
    await expect(readStoredDaoContent(i.digest)).rejects.toThrow();
    expect(await db.prepare("SELECT published_at, upload_accepted, upload_attempts, retrieval_attempts FROM dao_publications").first())
      .toEqual({ published_at: null, upload_accepted: 0, upload_attempts: 2, retrieval_attempts: 0 });
    acceptUpload = true;
    await db.prepare("UPDATE dao_publications SET retry_after = 0").run();
    expect(await publishDaoContent(i.bytes)).toMatchObject({ state: "published", digest: i.digest, cid: i.cid });
    expect(fetcher.mock.calls.map(([, options]) => options.method ?? "GET")).toEqual(["POST", "POST", "POST", "GET"]);
    expect(await db.prepare("SELECT upload_accepted, upload_attempts, retrieval_attempts FROM dao_publications").first())
      .toEqual({ upload_accepted: 1, upload_attempts: 3, retrieval_attempts: 1 });
  });
  it("exhausts unacknowledged upload attempts without accepting open-gateway bytes", async () => {
    const i = identity();
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => options.method === "POST"
      ? new Response(null, { status: 403 }) : new Response(new Uint8Array(i.bytes)));
    vi.stubGlobal("fetch", fetcher);
    for (let attempt = 0; attempt < defaults.documentUploadAttempts; attempt++) {
      await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "verification_pending" });
      await db.prepare("UPDATE dao_publications SET retry_after = 0").run();
    }
    await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "budget_reached" });
    await expect(readStoredDaoContent(i.digest)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(defaults.documentUploadAttempts);
    expect(await db.prepare("SELECT published_at, upload_accepted, upload_attempts, retrieval_attempts FROM dao_publications").first())
      .toEqual({ published_at: null, upload_accepted: 0, upload_attempts: 3, retrieval_attempts: 0 });
  });
  it("resumes acknowledged uploads after restart without another upload", async () => {
    const i = identity();
    let available = false;
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => options.method === "POST"
      ? Response.json({ IpfsHash: i.cid, PinSize: i.bytes.length })
      : available ? new Response(new Uint8Array(i.bytes)) : new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "verification_pending" });
    await db.prepare("UPDATE dao_publications SET retry_after = 0").run();
    await platform.dispose(); await start();
    available = true;
    expect(await publishDaoContent(i.bytes)).toMatchObject({ state: "published", digest: i.digest, cid: i.cid });
    expect(fetcher.mock.calls.map(([, options]) => options.method ?? "GET")).toEqual(["POST", "GET", "GET", "GET", "GET"]);
    expect(await db.prepare("SELECT upload_accepted, upload_attempts, retrieval_attempts FROM dao_publications").first())
      .toEqual({ upload_accepted: 1, upload_attempts: 1, retrieval_attempts: 4 });
  }, 30_000);
  it("fails closed on older published records without upload acceptance", async () => {
    const i = identity(), store = new DaoPublicationStore(db, defaults);
    await store.reserve(i.digest, i.cid, i.bytes);
    await db.prepare("UPDATE dao_publications SET published_at = 1, lease_token = NULL, lease_until = 0").run();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "unavailable" });
    await expect(readStoredDaoContent(i.digest)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT published_at, upload_accepted, reservations, upload_attempts FROM dao_publications").first())
      .toEqual({ published_at: 1, upload_accepted: 0, reservations: 1, upload_attempts: 0 });
  });
  it("bounds propagation and never reuploads acknowledged content", async () => {
    const i = identity();
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => options.method === "POST"
      ? Response.json({ IpfsHash: i.cid, PinSize: i.bytes.length }) : new Response("not available", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "verification_pending" });
    await expect(readStoredDaoContent(i.digest)).rejects.toThrow();
    await db.prepare("UPDATE dao_publications SET retry_after = 0").run();
    await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "verification_pending" });
    await db.prepare("UPDATE dao_publications SET retry_after = 0").run();
    await expect(publishDaoContent(i.bytes)).rejects.toMatchObject({ code: "budget_reached" });
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(fetcher.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });
  it("fails closed on missing private configuration without storing content or contacting services", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("DAO_PINATA_JWT", "");
    await expect(publishDaoContent(identity().bytes)).rejects.toMatchObject({ code: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT COUNT(*) AS n FROM dao_publications").first()).toEqual({ n: 0 });
  });
});
