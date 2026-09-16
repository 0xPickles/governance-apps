import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
