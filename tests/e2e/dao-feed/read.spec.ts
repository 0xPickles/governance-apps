import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";

const captureDirectory = "docs/apps/dao/delivery/evidence/m5-live/screenshots";
test("renders saved V2 through real routes without wallet RPC or mocks", async ({ page }) => {
  let response = saved;
  let failed = false;
  let failureStatus = 503;
  const rpcRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on("request", request => {
    if (/eth_call|eth_accounts|eth_getLogs/.test(request.postData() ?? "")) rpcRequests.push(request.url());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/api/dao-data", route => failed
    ? route.fulfill({ status: failureStatus, body: "unavailable" })
    : route.fulfill({ contentType: "application/json", body: JSON.stringify(response) }));
  await page.clock.setFixedTime(new Date("2026-09-08T12:00:00Z"));
  await page.goto("/dao");
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
  const zero = page.getByRole("link", { name: /Open proposal #0:/ });
  await expect(zero).toHaveAttribute("href", /chain=1&voting=0x1111111111111111111111111111111111111111/);
  await expect(page.getByText(/Snapshot.*UTC/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /debug/i })).toHaveCount(0);
  await mkdir(captureDirectory, { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: captureDirectory + "/board-" + viewport.width + ".png" });
  }
  await zero.click();
  await expect(page.getByRole("heading", { name: "Immutable proposal content" })).toBeVisible();
  await expect(page.getByText(/Connect.*wallet.*(vote|eligibility|participate)/i).first()).toBeVisible();
  await expect(page.getByText("Vote account", { exact: true }).first()).toBeVisible();

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 1280, height: 600 }]) {
    await page.setViewportSize(viewport);
    const technical = page.locator("summary").filter({ hasText: "Technical details" });
    await technical.focus();
    await page.keyboard.press("Enter");
    await expect(technical.locator("..")).toHaveAttribute("open", "");
    await expect(page.getByText("0xdeadbeef", { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: captureDirectory + "/detail-" + viewport.width + "x" + viewport.height + ".png", fullPage: true });
    await technical.scrollIntoViewIfNeeded();
    await technical.focus();
    await page.screenshot({ path: captureDirectory + "/technical-" + viewport.width + "x" + viewport.height + ".png" });
    await technical.press("Enter");
  }
  failed = true;
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByText(/last.*valid|last.*good/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Immutable proposal content" })).toBeVisible();
  failureStatus = 409;
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByText(/feed version is incompatible/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Immutable proposal content" })).toBeVisible();
  failed = false;

  await page.goto("/dao/proposals/9?chain=1&voting=0x1111111111111111111111111111111111111111");
  await expect(page.getByTestId("dao-approved-signal")).toBeVisible();
  // Protocol EXECUTED remains visible as an observed status; it creates no event/action.
  await expect(page.getByRole("heading", { name: "Recorded events" }).locator("..").getByText(/^Executed/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Execute proposal", exact: true })).toHaveCount(0);
  await page.goto("/dao/proposals/7?chain=1&voting=0x1111111111111111111111111111111111111111");
  await expect(page.getByText("This proposal is retracted and vetoed. Voting and execution are blocked.")).toBeVisible();
  await page.goto("/dao/proposals/8?chain=1&voting=0x1111111111111111111111111111111111111111");
  await expect(page.getByText(/Participation voting remains available/)).toBeVisible();
  await page.goto("/dao/proposals/16?chain=1&voting=0x1111111111111111111111111111111111111111");
  await expect(page.getByText("Immutable content could not be retrieved").first()).toBeVisible();
  await page.goto("/dao/proposals/19?chain=1&voting=0x1111111111111111111111111111111111111111");
  await expect(page.getByText("Immutable content did not pass validation").first()).toBeVisible();
  expect(await page.locator("main script, main iframe").count()).toBe(0);

  response = { ...saved, proposals: [], deployments: saved.deployments.map(d => ({ ...d, proposalCount: "0" })), observedAt: saved.observedAt + 1 };
  await page.goto("/dao");
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByRole("heading", { name: "No proposals yet" })).toBeVisible();
  expect(rpcRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
