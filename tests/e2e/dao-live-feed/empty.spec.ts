
import { expect, test } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
test("renders the actual live empty feed through app routes without wallet RPC", async ({ page, request }) => {
  const rpc: string[] = [];
  page.on("request", r => { if (/eth_call|eth_accounts|eth_getLogs/.test(r.postData() ?? "")) rpc.push(r.url()); });
  const response = await request.get("/api/dao-data");
  expect(response.ok()).toBe(true);
  const feed = await response.json();
  expect(feed.schema).toBe("yearn.dao.feed.v2");
  expect(feed.proposals).toEqual([]);
  expect(feed.deployments).toHaveLength(1);
  await page.goto("/dao");
  await expect(page.getByRole("heading", { name: "No proposals yet", exact: true })).toBeVisible();
  expect(rpc).toEqual([]);
  const directory = process.env.DAO_EVIDENCE_DIR ?? test.info().outputPath("evidence");
  await mkdir(directory, { recursive: true });
  await writeFile(directory + "/live-empty-app.json", JSON.stringify(feed, null, 2) + "\n");
});
