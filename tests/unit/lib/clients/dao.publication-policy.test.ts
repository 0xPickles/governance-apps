import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { POST } from "@/app/api/dao-content/route";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";
import { daoPublicationMessage } from "@/lib/clients/dao/publication-authorization";
import { publishDaoContent } from "@/lib/server/dao-content";
import { validateDaoForumTopic } from "@/lib/clients/dao/forum";
vi.mock("@/lib/server/dao-content", () => ({ publishDaoContent: vi.fn(), readStoredDaoContent: vi.fn() }));
vi.mock("@/lib/clients/dao/forum", () => ({ validateDaoForumTopic: vi.fn() }));
const uploader = privateKeyToAccount("0x" + "11".repeat(32) as `0x${string}`);
const content = { schema: "yearn.dao.proposal.v1" as const, markdown: "# Approved publication\n\nKeep exact bytes.\n\n## Scope\n\nTest authorization.\n",
  discussionUrl: "https://gov.yearn.fi/t/topic/1001", proposalType: "signal" as const, createdBy: uploader.address,
  createdAt: "2026-09-11T00:00:00Z", assets: [] };
const identity = deriveDaoProposalContentIdentity(content);
const policy = { maxDocuments: 1, maxTotalBytes: identity.bytes.length,
  grants: [{ uploader: uploader.address, digest: identity.digest, bytes: identity.bytes.length }] };
async function request(signed = true, origin = "https://app.example", body: Uint8Array = identity.bytes, age = 0) {
  const issuedAt = Math.floor(Date.now() / 1000) - age;
  const signature = await uploader.signMessage({ message: daoPublicationMessage({ origin, uploader: uploader.address, digest: identity.digest, bytes: identity.bytes.length, issuedAt }) });
  return new Request("https://app.example/api/dao-content", { method: "POST", body: new Uint8Array(body),
    headers: { Origin: "https://app.example", "Content-Type": "application/octet-stream",
      ...(signed ? { "x-dao-content-digest": identity.digest, "x-dao-uploader": uploader.address,
        "x-dao-publication-issued-at": String(issuedAt), "x-dao-publication-signature": signature } : {}) } });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production"); vi.stubEnv("NEXT_PUBLIC_ENABLE_DAO", "true");
  vi.stubEnv("DAO_PUBLICATION_ENABLED", "true"); vi.stubEnv("DAO_PUBLICATION_POLICY", JSON.stringify(policy));
  vi.mocked(validateDaoForumTopic).mockResolvedValue({ state: "valid", topic: { topicId: 1001, normalizedUrl: content.discussionUrl, title: "Approved", categoryId: 5, category: "Proposals", author: "user", createdAt: 1 } });
  vi.mocked(publishDaoContent).mockResolvedValue({ digest: identity.digest, cid: identity.cid, publishedAt: 1 });
});
afterEach(() => vi.unstubAllEnvs());
describe("publication authorization before upstream services", () => {
  it("keeps uploads independently disabled when DAO reads and provider credentials are enabled", async () => {
    vi.stubEnv("DAO_PUBLICATION_ENABLED", "false");
    vi.stubEnv("DAO_IPFS_AUTHORIZATION", "configured-private-provider-secret");
    expect((await POST(await request())).status).toBe(404);
    expect(validateDaoForumTopic).not.toHaveBeenCalled(); expect(publishDaoContent).not.toHaveBeenCalled();
  });
  it("rejects forged Origin without uploader authorization", async () => {
    expect((await POST(await request(false))).status).toBe(403);
    expect(validateDaoForumTopic).not.toHaveBeenCalled(); expect(publishDaoContent).not.toHaveBeenCalled();
  });
  it.each(["missing", "byte quota", "document quota"])("fails closed for %s policy before services", async kind => {
    vi.stubEnv("DAO_PUBLICATION_POLICY", kind === "missing" ? "" : JSON.stringify(kind === "byte quota"
      ? { ...policy, maxTotalBytes: identity.bytes.length - 1 }
      : { ...policy, grants: [...policy.grants, { ...policy.grants[0], digest: "0x" + "22".repeat(32) }] }));
    expect((await POST(await request())).status).toBe(kind === "missing" ? 503 : 429);
    expect(validateDaoForumTopic).not.toHaveBeenCalled(); expect(publishDaoContent).not.toHaveBeenCalled();
  });
  it.each(["wrong origin", "expired", "changed content"])("rejects %s authorization without upstream calls", async kind => {
    const altered = deriveDaoProposalContentIdentity({ ...content, markdown: content.markdown.replace("Approved", "Modified") });
    expect((await POST(await request(true, kind === "wrong origin" ? "https://evil.example" : "https://app.example",
      kind === "changed content" ? altered.bytes : identity.bytes, kind === "expired" ? 301 : 0))).status).toBe(403);
    expect(validateDaoForumTopic).not.toHaveBeenCalled(); expect(publishDaoContent).not.toHaveBeenCalled();
  });
  it("permits only the exact approved bytes; retries cannot add a different pinned document", async () => {
    expect((await POST(await request())).status).toBe(200);
    expect((await POST(await request())).status).toBe(200);
    expect(publishDaoContent).toHaveBeenCalledTimes(2);
    for (const [bytes] of vi.mocked(publishDaoContent).mock.calls) expect(bytes).toEqual(identity.bytes);
    expect(JSON.parse(new TextDecoder().decode(identity.bytes))).toEqual(content);
  });
});
