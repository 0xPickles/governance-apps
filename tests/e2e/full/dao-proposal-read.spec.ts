import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForTestBridge } from "../utils";
import { DAO_MOCK_GOVERNANCE_FLOW_ASSET_CID } from "@/lib/clients/dao";

const PINNED_VOTING_SOURCE_URL =
  "https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1_024 },
  { name: "desktop", width: 1_280, height: 900 },
  { name: "short desktop", width: 1_280, height: 600 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/dao");
  await waitForTestBridge(page);
  await page.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.reset();
  });
});

test("scans and filters the proposal board at every review viewport", async ({
  page,
}) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/dao");

    await expect(
      page.getByRole("heading", { name: "Proposals", level: 1 })
    ).toBeVisible();
    await expect(page.getByText("22 proposals are available.")).toBeVisible();
    await expect(page.getByText("Voting ends in 6 hours").first()).toBeVisible();
    await expect(
      page.getByText("of votes cast · 50% approval threshold").first()
    ).toBeVisible();

    for (const filter of ["Active", "Upcoming", "Closed"]) {
      const tab = page.getByRole("tab", { name: new RegExp(filter) });
      await expectMinimumHitArea(tab);
    }

    await page.getByRole("tab", { name: /Upcoming/ }).click();
    await expect(
      page.getByRole("link", {
        name: /Adopt the contributor budget policy/,
      })
    ).toBeVisible();
    await page.getByRole("tab", { name: /Closed/ }).click();
    await expect(
      page.getByRole("link", { name: /Approve the contributor charter/ })
    ).toBeVisible();
    await expect(page.getByText("No executable actions").first()).toBeVisible();
    await expectNoDocumentOverflow(page, viewport.name);
  }
});

test("presents proposal #19 execution integrity first on board and detail", async ({
  page,
}) => {
  await page.goto("/dao");
  const blockedRow = page.getByRole("article", {
    name: /Proposal with a script hash mismatch/,
  });
  const boardFacts = blockedRow.getByTestId("dao-proposal-heading-facts");
  await expectHeadingFactsOrder(boardFacts);
  await expect(
    blockedRow.getByText("Executable actions", { exact: true })
  ).toHaveCount(0);
  await expect(boardFacts.getByRole("alert")).toHaveCount(0);

  await blockedRow
    .getByRole("link", { name: /Open proposal #19:/ })
    .click();
  await expect(page).toHaveURL(/\/dao\/proposals\/19/);
  const detailFacts = page.getByTestId("dao-proposal-heading-facts");
  await expectHeadingFactsOrder(detailFacts);
  await expect(detailFacts.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({
      hasText: "Event script does not match the stored script hash",
    })
  ).toBeVisible();

  await page.goto("/dao/proposals/18");
  await expect(
    page
      .getByTestId("dao-proposal-heading-facts")
      .getByText("Execution blocked", { exact: true })
  ).toHaveCount(0);
});

test("supports keyboard filters and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dao");

  const active = page.getByRole("tab", { name: /Active/ });
  await active.focus();
  await page.keyboard.press("ArrowLeft");
  const upcoming = page.getByRole("tab", { name: /Upcoming/ });
  await expect(upcoming).toBeFocused();
  await expect(upcoming).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: /Upcoming/ })
  ).toBeVisible();
  await expect(upcoming).toHaveCSS("transition-duration", "0s");
});

test("offers responsive keyboard shortcuts when Active has no proposals", async ({
  page,
}) => {
  test.setTimeout(120_000);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/dao?group=active");
    await waitForTestBridge(page);
    await page.evaluate(async () => {
      if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
      await window.__TEST__.reset();
      await window.__TEST__.setNow(
        Math.floor(Date.now() / 1_000) + 60 * 86_400
      );
    });

    await expect(
      page.getByRole("heading", { name: "No active proposals" })
    ).toBeVisible();
    const upcoming = page.getByRole("button", {
      name: /View upcoming proposals/,
    });
    const closed = page.getByRole("button", {
      name: /View closed proposals/,
    });
    await expectMinimumHitArea(upcoming);
    await expectMinimumHitArea(closed);
    await expect(page.getByText("Next scheduled vote")).toHaveCount(0);

    await upcoming.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: /Upcoming/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await page.getByRole("tab", { name: /Active/ }).click();
    const refreshedClosed = page.getByRole("button", {
      name: /View closed proposals/,
    });
    await refreshedClosed.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("tab", { name: /Closed/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expectNoDocumentOverflow(page, `${viewport.name} Active-empty state`);
  }
});

test("keeps the last-good board visible while preserving outage semantics", async ({
  page,
}) => {
  await page.goto("/dao");
  await expect(page.getByText("22 proposals are available.")).toBeVisible();

  await waitForTestBridge(page);
  await page.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.setDaoSurface?.("error");
  });

  const outage = page.getByRole("alert").filter({
    hasText: "Proposal updates are unavailable",
  });
  await expect(outage).toBeVisible();
  await expect(page.getByText("22 proposals are available.")).toBeVisible();
  await expect(outage.getByText("Last successful snapshot")).toBeVisible();
  await expect(outage.locator("time")).toHaveAttribute(
    "datetime",
    /^\d{4}-\d{2}-\d{2}T/
  );
  const retry = outage.getByRole("button", { name: "Retry proposal data" });
  await expectMinimumHitArea(retry);
  await retry.click();
  await expect(outage).toBeVisible();
  await expect(page.getByText("22 proposals are available.")).toBeVisible();

  await waitForTestBridge(page);
  await page.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.setDaoSurface?.("ready");
  });
  await expect(outage).toHaveCount(0);
});

test("keeps a synthetic cold error distinct from a last-good outage", async ({
  page,
}) => {
  const coldPage = await page.context().newPage();
  await coldPage.goto("/dao", { waitUntil: "commit" });
  await coldPage.waitForFunction(() => Boolean(window.__TEST__));
  await coldPage.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.setDaoSurface?.("error");
  });
  await expect(
    coldPage.getByRole("heading", { name: "Proposal data is unavailable" })
  ).toBeVisible();
  await expect(coldPage.getByText("Last successful snapshot")).toHaveCount(0);
  await expect(coldPage.getByText(/proposals are available/)).toHaveCount(0);
  await coldPage.waitForTimeout(400);
  await expect(coldPage.getByText(/proposals are available/)).toHaveCount(0);
  await coldPage.close();
});

test("does not retain a found detail outside the surfaced feed snapshot", async ({
  page,
}) => {
  await page.goto("/dao/proposals/2");
  await expect(
    page.getByRole("heading", { name: "Fund protocol research" })
  ).toBeVisible();

  await waitForTestBridge(page);
  await page.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.setDaoEmpty?.(true);
  });

  await expect(
    page.getByRole("heading", { name: "Proposal not found" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fund protocol research" })
  ).toHaveCount(0);
});

test("contains proposed script and technical values at every review viewport", async ({
  page,
}) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/dao/proposals/17");
    if (viewport.name === "tablet") {
      await page.getByRole("button", { name: "Switch to Dark Mode" }).click();
      await expect(
        page.getByRole("button", { name: "Switch to Light Mode" })
      ).toBeVisible();
    }
    if (viewport.name === "short desktop") {
      await page.getByRole("button", { name: "Switch to Light Mode" }).click();
      await expect(
        page.getByRole("button", { name: "Switch to Dark Mode" })
      ).toBeVisible();
    }

    const immutableHeading = page.getByRole("heading", {
      name: "Immutable proposal content",
    });
    const resultsHeading = page.getByRole("heading", { name: "Vote results" });
    await expect(immutableHeading).toBeVisible();
    await expect(resultsHeading).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Proposed script" })
    ).toBeVisible();
    await expect(page.getByText("Unknown call").first()).toBeVisible();
    await expect(
      page.getByText("No verified source", { exact: true }).first(),
    ).toBeVisible();
    await page.getByText("Proposal rules", { exact: true }).click();
    await expect(
      page
        .getByRole("link", { name: "Voting.vy at pinned stYFI revision" })
        .first()
    ).toHaveAttribute("href", PINNED_VOTING_SOURCE_URL);
    await expectNoDeliveryLanguage(page);

    const technicalSummary = page.getByText("Technical details", {
      exact: true,
    });
    await technicalSummary.click();
    await expect(
      page.getByText("Proposal identity", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Event script", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Feed snapshot block", { exact: true }),
    ).toBeVisible();
    await expectMinimumHitArea(
      page.getByRole("button", { name: "Copy script hash" })
    );

    const immutableBox = await immutableHeading.boundingBox();
    const resultsBox = await resultsHeading.boundingBox();
    expect(immutableBox).not.toBeNull();
    expect(resultsBox).not.toBeNull();
    if (viewport.width < 1_024) {
      expect(resultsBox!.y).toBeLessThan(immutableBox!.y);
    } else {
      expect(resultsBox!.x).toBeGreaterThan(immutableBox!.x);
    }
    if (viewport.name === "short desktop") {
      await expect(resultsHeading.locator("xpath=ancestor::aside")).toHaveCSS(
        "position",
        "static"
      );
    }
    await expectNoDocumentOverflow(page, viewport.name);
  }
});

test("keeps technical address copy controls visible for coarse pointers", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("The Playwright project requires a base URL.");
  }
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const coarsePage = await context.newPage();
  await coarsePage.goto("/dao/proposals/17");
  expect(
    await coarsePage.evaluate(() => matchMedia("(pointer: coarse)").matches)
  ).toBe(true);
  await coarsePage.getByText("Technical details", { exact: true }).click();

  for (const name of [
    "Copy voting contract",
    "Copy voter contract",
    "Copy executor contract",
  ]) {
    const control = coarsePage.getByRole("button", { name });
    await expect(control).toBeVisible();
    await expectMinimumHitArea(control);
  }
  const targetControl = coarsePage
    .getByRole("button", { name: "Copy target" })
    .first();
  await expect(targetControl).toBeVisible();
  await expectMinimumHitArea(targetControl);
  await expect(
    coarsePage
      .getByRole("link", { name: /View Ethereum address .* on Etherscan/ })
      .first()
  ).toHaveAttribute("target", "_blank");
  await expectNoDocumentOverflow(coarsePage, "coarse-pointer technical details");
  await context.close();
});

test("renders every terminal fixture with explicit status and vote rule copy", async ({
  page,
}) => {
  const terminalFixtures = [
    { id: 4, status: "Approved" },
    { id: 6, status: "Executed" },
    { id: 7, status: "Rejected" },
    { id: 8, status: "Rejected" },
    { id: 9, status: "Expired" },
    { id: 10, status: "Retracted" },
    { id: 11, status: "Flagged" },
    { id: 12, status: "Vetoed" },
    { id: 13, status: "Vetoed" },
  ];

  await page.setViewportSize({ width: 390, height: 844 });
  for (const fixture of terminalFixtures) {
    await page.goto(`/dao/proposals/${fixture.id}`);
    await expect(page.getByText(fixture.status, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/of votes cast · \d/)).toBeVisible();
    await page.getByText("Proposal rules", { exact: true }).click();
    await expect(page.getByText("No minimum turnout is required.")).toBeVisible();
    await expect(
      page.getByText(
        fixture.id === 7 ? "60% of votes cast" : "50% of votes cast",
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Lifecycle" })
    ).toBeVisible();
    await expectNoDocumentOverflow(page, `terminal proposal ${fixture.id}`);
  }

  await page.goto("/dao/proposals/4");
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No executable actions").first()).toBeVisible();

  await page.goto("/dao/proposals/11");
  await expect(page.getByText("Flagged", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No community result", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Flagging retracts the proposal and blocks voting and execution. No community vote result is implied.")).toBeVisible();

  await page.goto("/dao/proposals/12");
  await expect(page.getByText("This proposal is retracted and vetoed. Voting and execution are blocked.")).toBeVisible();
  await page.goto("/dao/proposals/13");
  await expect(page.getByText(/Participation voting remains available/)).toBeVisible();

  await page.goto("/dao/proposals/6");
  await expect(page.getByText(/Executed .+ UTC/).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /View Ethereum transaction/ }).first()
  ).toHaveAttribute("rel", /noopener/);

  await page.goto("/dao/proposals/20");
  const lifecycle = page
    .getByRole("heading", { name: "Lifecycle" })
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' rounded-box ')][1]"
    );
  await expect(
    lifecycle.getByText("Time unavailable", { exact: true })
  ).toBeVisible();
  await expect(
    lifecycle.getByText("Transaction unavailable", { exact: true })
  ).toBeVisible();
});

test("keeps onchain records and trust failures explicit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/dao/proposals/14");
  await expect(
    page.getByText("Immutable content could not be retrieved").first()
  ).toBeVisible();
  await expect(page.getByText(/onchain proposal remains visible/).first()).toBeVisible();
  const technicalDetails = page
    .getByText("Technical details", { exact: true })
    .locator("xpath=ancestor::details");
  await technicalDetails.getByText("Technical details", { exact: true }).click();
  await expect(
    technicalDetails.getByText("Voting contract", { exact: true })
  ).toBeVisible();
  await expect(
    technicalDetails.getByText("Raw contract status", { exact: true })
  ).toBeVisible();

  await page.goto("/dao/proposals/15");
  await expect(
    page.getByText("Immutable content did not pass validation").first()
  ).toBeVisible();
  await expect(page.getByText(/yearn\.dao\.proposal\.v1/).first()).toBeVisible();

  await page.goto("/dao/proposals/16");
  await expect(page.getByText("Exact proposed script bytes are unavailable.", { exact: true })).toBeVisible();

  await page.goto("/dao/proposals/18");
  await expect(page.getByText(/The first Executor header is incomplete\./).first()).toBeVisible();

  await page.goto("/dao/proposals/19");
  await expect(
    page.getByRole("alert").filter({
      hasText: "Event script does not match the stored script hash",
    })
  ).toBeVisible();

  await page.goto("/dao/proposals/20");
  await expect(
    page.getByText(/not a verified Proposals-category topic/)
  ).toBeVisible();
  await expectNoDocumentOverflow(page, "trust failure fixtures");
});

test("contains long immutable Markdown at 200% text scaling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dao/proposals/21");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });

  await expect(
    page.getByRole("heading", { name: /Interoperability evidence/ })
  ).toBeVisible();
  const longLink = page.getByRole("link", {
    name: /governance-verification-evidence-/,
  });
  await expect(longLink).toHaveAttribute("target", "_blank");
  await expect(longLink).toHaveAttribute("rel", "noopener noreferrer");

  const table = page.getByRole("region", { name: "Proposal Markdown table" });
  const code = page.getByRole("region", {
    name: "Proposal Markdown code block",
  });
  await expect(table).toBeVisible();
  await expect(code).toBeVisible();
  await expectHorizontallyScrollable(table);
  await expectHorizontallyScrollable(code);

  await page.getByText("View Markdown source").click();
  const source = page.getByRole("region", { name: "Exact Markdown source" });
  await expect(source).toBeVisible();
  await expectHorizontallyScrollable(source);
  await expectNoDocumentOverflow(page, "200% immutable Markdown");
});

test("loads an authenticated attachment only after explicit activation", async ({
  page,
}) => {
  const gatewayUrl = `https://ipfs.io/ipfs/${DAO_MOCK_GOVERNANCE_FLOW_ASSET_CID}`;
  const gatewayRequests: string[] = [];
  const context = page.context();
  context.on("request", (request) => {
    if (request.url().startsWith("https://ipfs.io/ipfs/")) {
      gatewayRequests.push(request.url());
    }
  });
  await context.route(gatewayUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "authenticated raw block",
    });
  });

  for (const id of [1, 2]) {
    await page.goto(`/dao/proposals/${id}`);
    const attachment = page.getByRole("complementary", {
      name: "Attachment: Governance flow diagram",
    });
    await expect(attachment).toBeVisible();
    await expect(attachment.locator("img, picture, source, video")).toHaveCount(0);
    const open = attachment.getByRole("link", { name: "Open attachment" });
    await expect(open).toHaveAttribute("href", gatewayUrl);
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");
    await attachment.getByRole("button", { name: "Copy immutable link" }).click();
    await expect.poll(() => gatewayRequests).toEqual([]);
  }

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Open attachment" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await expect.poll(() => gatewayRequests).toEqual([gatewayUrl]);
  await popup.close();
});

async function expectNoDocumentOverflow(page: Page, context: string) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    widths.scrollWidth,
    `${context} should contain long values inside the viewport`
  ).toBeLessThanOrEqual(widths.clientWidth);
}

async function expectMinimumHitArea(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(40);
  expect(box!.height).toBeGreaterThanOrEqual(40);
}

async function expectHeadingFactsOrder(facts: Locator) {
  await expect(facts).toBeVisible();
  expect((await facts.innerText()).replace(/\s+/g, " ").trim()).toBe(
    "Execution blocked Approved Executable Stored script hash does not match the proposed event script."
  );
}

async function expectHorizontallyScrollable(locator: Locator) {
  const widths = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeGreaterThan(widths.clientWidth);
}

async function expectNoDeliveryLanguage(page: Page) {
  await expect(
    page.getByText(/\b(mock|fixture|prototype|qa|implementation)\b/i)
  ).toHaveCount(0);
}
