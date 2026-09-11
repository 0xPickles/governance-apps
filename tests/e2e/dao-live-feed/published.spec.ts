
import { expect, test } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
test("displays published bytes retrieved by the released local producer", async ({ page, request }) => {
  test.skip(process.env.DAO_UAT_PRODUCER_CHECKPOINT !== "true");
  const directory = process.env.DAO_EVIDENCE_DIR ?? test.info().outputPath("evidence");
  const expected = await readFile((process.env.DAO_FORK_DIR ?? "/tmp/governance-dao-uat") + "/ui-content.json");
  const rpc: string[] = [], errors: string[] = [];
  page.on("request", r => { if (/eth_call|eth_accounts|eth_getLogs/.test(r.postData() ?? "")) rpc.push(r.url()); });
  page.on("pageerror", e => errors.push(e.message));
  const response = await request.get("/api/dao-data");
  expect(response.ok()).toBe(true);
  const feed = await response.json();
  expect(feed.schema).toBe("yearn.dao.feed.v2");
  expect(feed.proposals).toHaveLength(1);
  expect(Buffer.from(feed.proposals[0].contentBytes, "base64")).toEqual(expected);
  await page.clock.setFixedTime(new Date(feed.observedAt * 1000));
  await page.goto("/dao");
  await page.getByRole("tab", { name: /Upcoming/ }).click();
  await page.getByRole("link", { name: /Open proposal #0:/ }).click();
  await expect(page.getByRole("heading", { name: "Local execution UAT", exact: true })).toBeVisible();
  await expect(page.getByText("Set the local marker to 42.", { exact: true })).toBeVisible();
  expect(rpc).toEqual([]); expect(errors).toEqual([]);
  await mkdir(directory + "/screenshots", { recursive: true });
  await writeFile(directory + "/local-producer-app.json", JSON.stringify(feed, null, 2) + "\n");
  await page.screenshot({ path: directory + "/screenshots/local-producer-content.png", fullPage: true });
});
