import { expect, test } from "@playwright/test";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";

test("serves enabled GET and HEAD through the actual configured upstream", async ({ request }) => {
  test.skip(process.env.E2E_DAO_TEST_UPSTREAM !== "true");
  const response = await request.get("/api/dao-data");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual(saved);
  const head = await request.head("/api/dao-data");
  expect(head.status()).toBe(200);
  expect(await head.body()).toHaveLength(0);
});

test("keeps publication disabled independently of enabled production DAO reads", async ({ request, baseURL }) => {
  test.skip(process.env.E2E_DAO_TEST_UPSTREAM !== "true");
  const challenge = await request.get("/api/dao-content?authorize=0x" + "11".repeat(32));
  expect(challenge.status()).toBe(404);
  const response = await request.post("/api/dao-content", {
    headers: { origin: baseURL!, "content-type": "application/octet-stream" }, data: "forged content",
  });
  expect(response.status()).toBe(404);
});

test("fails closed for unconfigured publication while production DAO reads remain enabled", async ({ request, baseURL }) => {
  test.skip(process.env.E2E_DAO_PUBLICATION_UNCONFIGURED !== "true");
  const identity = deriveDaoProposalContentIdentity({ schema: "yearn.dao.proposal.v1",
    markdown: "# Production gate\n\nNo private key is configured.\n\n## Scope\n\nReject before upstream access.\n",
    discussionUrl: "https://gov.yearn.fi/t/topic/1001", proposalType: "signal", assets: [],
    createdBy: "0x1111111111111111111111111111111111111111", createdAt: "2026-09-16T00:00:00Z" });
  const response = await request.post("/api/dao-content", {
    headers: { origin: baseURL!, "content-type": "application/octet-stream", "x-dao-content-digest": identity.digest, "x-dao-content-cid": identity.cid },
    data: Buffer.from(identity.bytes),
  });
  expect(response.status()).toBe(503);
  expect((await response.json()).code).toBe("unavailable");
  expect((await request.get("/api/dao-data")).status()).toBe(200);
});
