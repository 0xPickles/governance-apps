import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/dao-content/route";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";
import { publishDaoContent } from "@/lib/server/dao-content";
import { DaoPublicationPolicyError } from "@/lib/server/dao-publication-policy";
vi.mock("@/lib/server/dao-content", () => ({ publishDaoContent: vi.fn(), readStoredDaoContent: vi.fn() }));
const content = { schema: "yearn.dao.proposal.v1" as const, markdown: "# Public publication\n\nKeep exact bytes.\n\n## Scope\n\nTest admission.\n",
  discussionUrl: "https://gov.yearn.fi/t/topic/1001", proposalType: "signal" as const, createdBy: "0x1111111111111111111111111111111111111111" as const,
  createdAt: "2026-09-11T00:00:00Z", assets: [] };
const identity = deriveDaoProposalContentIdentity(content);
function request(bytes = identity.bytes, extra: Record<string, string> = {}) {
  return new Request("https://app.example/api/dao-content", { method: "POST", body: new Uint8Array(bytes),
    headers: { Origin: "https://app.example", "Content-Type": "application/octet-stream",
      "X-DAO-Content-Digest": identity.digest, "X-DAO-Content-CID": identity.cid, ...extra } });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production"); vi.stubEnv("NEXT_PUBLIC_ENABLE_DAO", "true");
  vi.stubEnv("DAO_PUBLICATION_ENABLED", "true");
  vi.mocked(publishDaoContent).mockResolvedValue({ digest: identity.digest, cid: identity.cid, publishedAt: 1, state: "published" });
});

describe("publication origin after Next.js loopback normalization", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development");
    vi.stubEnv("__NEXT_NO_MIDDLEWARE_URL_NORMALIZE", "");
  });

  function emptyRequest(origin: string | null, host: string | null = "127.0.0.1:3310", extra: Record<string, string> = {}) {
    return new NextRequest("http://127.0.0.1:3310/api/dao-content", {
      method: "POST", body: new Uint8Array(),
      headers: { "Content-Type": "application/octet-stream", ...(origin === null ? {} : { Origin: origin }),
        ...(host === null ? {} : { Host: host }), ...extra },
    });
  }

  it.each(["127.0.0.1:3310", "[::1]:3310"])("accepts the original %s authority without reaching publication", async host => {
    const input = new NextRequest("http://" + host + "/api/dao-content", {
      method: "POST", body: new Uint8Array(),
      headers: { Origin: "http://" + host, Host: host, "Content-Type": "application/octet-stream" },
    });
    expect(new URL(input.url).origin).toBe("http://localhost:3310");
    const response = await POST(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_content" });
    expect(publishDaoContent).not.toHaveBeenCalled();
  });

  it.each([
    null, "null", "https://foreign.example", "http://127.0.0.1:3311", "https://127.0.0.1:3310",
    "http://localhost:3311", "https://localhost:3310", "http://127.0.0.2:3310",
    "http://127.0.0.1:3310/", "http://127.0.0.1:3310/path", "http://user@127.0.0.1:3310",
    "http://127.0.0.1:3310?query", "http://127.0.0.1:3310#fragment", "not an origin",
    "http://127.0.0.1:3310 http://foreign.example",
  ])("rejects missing, foreign, or malformed Origin %s", async origin => {
    const response = await POST(emptyRequest(origin));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(publishDaoContent).not.toHaveBeenCalled();
  });

  it.each([null, "localhost:3310", "127.0.0.1:3311", "foreign.example:3310"])("requires the original Host, not forwarded authority (%s)", async host => {
    const response = await POST(emptyRequest("http://127.0.0.1:3310", host, {
      "X-Forwarded-Host": "127.0.0.1:3310", "X-Forwarded-Proto": "http",
      Forwarded: "host=127.0.0.1:3310;proto=http",
    }));
    expect(response.status).toBe(403);
    expect(publishDaoContent).not.toHaveBeenCalled();
  });

  it("does not accept a foreign origin even when Host and forwarded headers agree", async () => {
    expect((await POST(emptyRequest("http://foreign.example:3310", "foreign.example:3310", {
      "X-Forwarded-Host": "foreign.example:3310",
    }))).status).toBe(403);
    expect(publishDaoContent).not.toHaveBeenCalled();
  });

  it("does not apply the development exception to a public request URL", async () => {
    const input = new NextRequest("http://app.example:3310/api/dao-content", {
      method: "POST", body: new Uint8Array(),
      headers: { Origin: "http://127.0.0.1:3310", Host: "127.0.0.1:3310", "Content-Type": "application/octet-stream" },
    });
    expect((await POST(input)).status).toBe(403);
    expect(publishDaoContent).not.toHaveBeenCalled();
  });

  it.each([
    ["production", "development"], ["development", "production"], ["development", "preview"], ["development", ""],
  ])("keeps exact-origin protection with NODE_ENV=%s and runtime=%s", async (nodeEnv, runtime) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", runtime);
    expect((await POST(emptyRequest("http://127.0.0.1:3310"))).status).toBe(403);
    expect(publishDaoContent).not.toHaveBeenCalled();
  });

  it("keeps same-origin production requests and rejects missing or foreign production origins", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production");
    for (const origin of ["https://app.example", null, "https://foreign.example", "http://app.example", "https://app.example:3310"]) {
      const input = new NextRequest("https://app.example/api/dao-content", {
        method: "POST", body: new Uint8Array(),
        headers: { "Content-Type": "application/octet-stream", ...(origin === null ? {} : { Origin: origin }) },
      });
      expect((await POST(input)).status).toBe(origin === "https://app.example" ? 400 : 403);
    }
    expect(publishDaoContent).not.toHaveBeenCalled();
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("public publication route", () => {
  it("returns disabled before reading input or contacting services", async () => {
    vi.stubEnv("DAO_PUBLICATION_ENABLED", "false");
    expect((await POST(request(new Uint8Array(131073)))).status).toBe(404);
    expect(publishDaoContent).not.toHaveBeenCalled();
    expect((await GET(new Request("https://app.example/api/dao-content?authorize=" + identity.digest))).status).toBe(404);
  });
  it.each(["digest", "cid", "canonical", "oversize", "declared"])("rejects invalid %s before services", async kind => {
    const bytes = kind === "oversize" ? new Uint8Array(131073) : kind === "canonical" ? new TextEncoder().encode(JSON.stringify(content)) : identity.bytes;
    const extra: Record<string, string> = kind === "digest" ? { "X-DAO-Content-Digest": "0x" + "00".repeat(32) } :
      kind === "cid" ? { "X-DAO-Content-CID": "wrong" } : kind === "declared" ? { "Content-Length": "131073" } : {};
    expect((await POST(request(bytes, extra))).status).toBe(kind === "declared" ? 413 : 400);
    expect(publishDaoContent).not.toHaveBeenCalled();
  });
  it("requires matching origin and binary transport without requesting a signature", async () => {
    expect((await POST(request(identity.bytes, { Origin: "https://elsewhere.example" }))).status).toBe(403);
    expect((await POST(request(identity.bytes, { "Content-Type": "application/json" }))).status).toBe(415);
    expect((await POST(request())).status).toBe(200);
    expect(publishDaoContent).toHaveBeenCalledExactlyOnceWith(identity.bytes);
  });
  it("sanitizes arbitrary provider errors and returns actionable bounded retry errors", async () => {
    vi.mocked(publishDaoContent).mockRejectedValueOnce(new Error("SECRET at https://private.example"));
    const failed = await POST(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("SECRET");
    vi.mocked(publishDaoContent).mockRejectedValueOnce(new DaoPublicationPolicyError("budget_reached", 429));
    const budget = await POST(request()); expect(budget.status).toBe(429); expect(budget.headers.get("Retry-After")).toBe("60");
  });
});
