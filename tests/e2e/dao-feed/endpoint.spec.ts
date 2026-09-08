import { expect, test } from "@playwright/test";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";

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
