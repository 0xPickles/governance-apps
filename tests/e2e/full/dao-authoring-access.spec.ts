import { expect, test } from "@playwright/test";
import { resetBridge, waitForTestBridge } from "../utils";

for (const viewport of [{ width: 1280, height: 720 }, { width: 820, height: 533 }, { width: 390, height: 667 }]) {
  test(`complete authoring remains accessible at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/dao/propose");
    await waitForTestBridge(page);
    await resetBridge(page);
    await page.getByRole("button", { name: "Start proposal" }).click();
    const forum = page.getByRole("textbox", { name: "Forum discussion" });
    await forum.fill("https://gov.yearn.fi/t/topic/1001");
    await expect(page.getByText("Review the highlighted fields")).toHaveCount(0);
    await expect(page.getByText("Validate this topic before review.")).toBeVisible();
    await page.getByRole("button", { name: "Validate topic" }).click();
    await expect(page.locator("#dao-forum-status")).toContainText("Forum topic accepted");
    const markdown = page.getByRole("textbox", { name: "Proposal Markdown" });
    await markdown.fill("# Accessible proposal\n\nReview every section.\n\n## Scope\n\nThe editor and final controls remain accessible.");
    await markdown.scrollIntoViewIfNeeded();
    await expect(markdown).toBeInViewport();
    await page.getByRole("tab", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Accessible proposal" })).toBeVisible();
    const review = page.getByRole("button", { name: "Review proposal", exact: true });
    await review.scrollIntoViewIfNeeded();
    await expect(review).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("authoring.png"), fullPage: true });
    await review.click();
    await expect(page.getByRole("checkbox", { name: /I reviewed/ })).toBeVisible();
    // The mock form enforces confirmation before publication. Live downloads
    // are covered by the offline fork browser test.
    await expect(page.getByRole("checkbox", { name: /I reviewed/ })).not.toBeChecked();
    await page.getByRole("button", { name: "Publish immutable content" }).click();
    await expect(page.getByText("Confirm the exact review before publication.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Immutable content published" })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit proposal", exact: true }).click();
    await page.getByRole("tab", { name: "Write", exact: true }).click();
    await expect(markdown).toHaveValue(/The editor and final controls remain accessible\./);
    await forum.scrollIntoViewIfNeeded();
    await expect(forum).toBeInViewport();
  });
}
