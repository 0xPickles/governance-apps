import { expect, test } from "@playwright/test";
import {
  patchTeamsAdmin,
  patchTeamsTeam,
  setTeamsEmpty,
  setTeamsLoading,
  setTeamsSelectedTeam,
  setTeamsViewerRole,
  waitForTestBridge,
} from "../utils";

test("renders the Team Finances route shell", async ({ page }) => {
  await page.goto("/teams");
  await waitForTestBridge(page);

  await expect(
    page.getByRole("heading", { name: "Team Finances", level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Teams hierarchy" })
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Review each team's revenue, costs, funding, bonus, and status."
    )
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Platform details" })
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Owner" })
  ).toBeVisible();
  await page.getByRole("button", { name: /Cards/i }).click();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /debug/i })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Admin/i })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Revenue Deposit", level: 2 })
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Open Platform details" }).click();
  const platformHeading = page.getByRole("heading", {
    name: "Platform",
    level: 1,
  });
  const teamsBreadcrumb = page.getByRole("link", { name: "/teams" });
  await expect(platformHeading).toBeVisible();
  await expect(platformHeading).toBeInViewport({ ratio: 1 });
  await expect(teamsBreadcrumb).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("navigation", { name: "Teams hierarchy" })
  ).toContainText("/teams/platform");
  await expect(
    page.getByRole("heading", { name: "Bonus", level: 2, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ownership and Status", level: 2 })
  ).toBeVisible();

  await setTeamsViewerRole(page, "operator-admin");
  await patchTeamsAdmin(page, { enabled: true });
  await setTeamsSelectedTeam(page, "security");

  await page.getByRole("link", { name: /Admin/i }).click();
  await expect(
    page.getByRole("heading", { name: "Admin Console", level: 1 })
  ).toBeVisible();
  await expect(
    page.locator("#admin").getByRole("heading", { name: "Admin Console" })
  ).toHaveCount(0);
});

test("keeps loading and empty coverage reachable through the shared Teams runtime", async ({
  page,
}) => {
  await page.goto("/teams");
  await waitForTestBridge(page);

  await setTeamsLoading(page, true);

  await expect(page.getByText("Loading team directory")).toBeVisible();

  await setTeamsLoading(page, false);
  await page.getByRole("link", { name: "Open Platform details" }).click();
  await setTeamsLoading(page, true);

  await expect(page.getByText("Loading team overview")).toBeVisible();
  await expect(page.getByText("Loading revenue deposit flow")).toBeVisible();

  await setTeamsLoading(page, false);
  await setTeamsViewerRole(page, "operator-admin");
  await patchTeamsAdmin(page, { enabled: true });
  await setTeamsEmpty(page, true);

  await expect(page.getByText("No teams available")).toBeVisible();
  await expect(page).toHaveURL(/\/teams$/);
  await page.getByRole("link", { name: /Admin/i }).click();
  await expect(page.locator("#admin").getByText("No admin console available")).toBeVisible();
});

test("opens lifecycle and bonus links from Teams alerts", async ({ page }) => {
  const teamAddress = "0x1111111111111111111111111111111111111111";
  const destinations = [
    { section: "lifecycle", heading: "Ownership and Status" },
    { section: "bonus", heading: "Bonus" },
  ] as const;

  for (const destination of destinations) {
    await page.goto(
      `/teams?section=${destination.section}&team=${teamAddress}`,
    );
    await waitForTestBridge(page);

    await expect(page).toHaveURL((url) =>
      url.pathname === "/teams" &&
      url.searchParams.get("team") === teamAddress &&
      url.searchParams.get("section") === destination.section
    );
    await expect(
      page.locator(`#${destination.section}`).getByRole("heading", {
        name: destination.heading,
        exact: true,
      }),
    ).toBeVisible();
  }
});

test("restores deep links and browser history without resetting active sections", async ({
  page,
}) => {
  const securityAddress = "0x2222222222222222222222222222222222222222";
  const revenueAddress = "0x1111111111111111111111111111111111111111";

  await page.goto(`/teams?section=actions&team=${revenueAddress}`);
  await waitForTestBridge(page);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/teams" &&
      url.searchParams.get("team") === revenueAddress &&
      url.searchParams.get("section") === "actions"
  );
  await expect(
    page.locator("#actions").getByRole("heading", {
      name: "Actions",
      level: 2,
    })
  ).toBeVisible();
  await page.reload();
  await waitForTestBridge(page);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/teams" &&
      url.searchParams.get("team") === revenueAddress &&
      url.searchParams.get("section") === "actions"
  );
  await expect(
    page.locator("#actions").getByRole("heading", {
      name: "Actions",
      level: 2,
    })
  ).toBeVisible();

  await page.goto(
    `/teams?section=revenue&team=${revenueAddress}`
  );
  await waitForTestBridge(page);

  await expect(
    page.getByRole("heading", { name: "Platform", level: 1 })
  ).toBeVisible();
  await expect(
    page.locator("#revenue").getByRole("heading", {
      name: "Revenue Deposit",
      level: 3,
    })
  ).toBeVisible();
  await expect(
    page.locator("#revenue-ledger").getByRole("heading", {
      name: "Revenue ledger",
      level: 2,
    })
  ).toBeVisible();

  const activeTeamHref = page.url();
  const activeTeamHistoryLength = await page.evaluate(() => history.length);
  await page.reload();
  await waitForTestBridge(page);
  await expect(page).toHaveURL(activeTeamHref);
  expect(await page.evaluate(() => history.length)).toBe(activeTeamHistoryLength);
  await expect(
    page.locator("#revenue").getByRole("heading", {
      name: "Revenue Deposit",
      level: 3,
    })
  ).toBeVisible();

  await page.getByRole("link", { name: "/teams" }).click();
  await expect(page).toHaveURL(/\/teams$/);
  const activeDirectoryHref = page.url();
  const activeDirectoryHistoryLength = await page.evaluate(() => history.length);
  await page.getByRole("link", { name: "Open Platform details" }).click();
  await expect(page).toHaveURL(
    new RegExp(`section=overview&team=${revenueAddress}`)
  );

  await page.goBack();
  await expect(page).toHaveURL(activeDirectoryHref);
  expect(await page.evaluate(() => history.length)).toBe(
    activeDirectoryHistoryLength + 1
  );
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`section=revenue&team=${revenueAddress}`)
  );
  await expect(
    page.locator("#revenue").getByRole("heading", {
      name: "Revenue Deposit",
      level: 3,
    })
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(activeDirectoryHref);
  await page.goForward();
  await expect(page).toHaveURL(
    new RegExp(`section=overview&team=${revenueAddress}`)
  );

  await setTeamsLoading(page, true);
  await page.evaluate((address) => {
    history.pushState(
      null,
      "",
      `/teams?section=funding&team=${address}`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, securityAddress);
  await setTeamsLoading(page, false);
  await expect(
    page.getByRole("heading", { name: "Security", level: 1 })
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`section=funding&team=${securityAddress}`)
  );

  await page.goto(
    "/teams?section=overview&team=0x9999999999999999999999999999999999999999"
  );
  await waitForTestBridge(page);
  await expect(page).toHaveURL(/\/teams$/);
  await expect(
    page.getByRole("heading", { name: "Team Directory", level: 2 })
  ).toBeVisible();
});

test("keeps DAI and USDC labels horizontal in the nested revenue pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/teams");
  await waitForTestBridge(page);
  await patchTeamsTeam(page, "platform", {
    revenueOptions: [
      {
        symbol: "USDC",
        tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
        isConvertible: true,
        convertToSymbol: "yvUSDC-1",
        oraclePriceUsd: "1.00",
        previewAmount: "10000",
        estimatedCreditUsd: "9985.40",
      },
      {
        symbol: "DAI",
        tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        decimals: 18,
        isConvertible: false,
        convertToSymbol: null,
        oraclePriceUsd: "1.00",
        previewAmount: "7500",
        estimatedCreditUsd: "7500.00",
      },
    ],
  });

  await page.getByRole("link", { name: "Open Platform details" }).click();

  const optionFor = (symbol: "DAI" | "USDC") =>
    page.locator("#revenue button[aria-pressed]").filter({
      has: page.getByText(symbol, { exact: true }),
    });
  const measureHorizontalLabel = async (
    locator: ReturnType<typeof page.locator>
  ) =>
    locator.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const parentBounds = element.parentElement?.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight);
      return {
        clientWidth: element.clientWidth,
        height: bounds.height,
        insideParent:
          parentBounds !== undefined &&
          bounds.left >= parentBounds.left &&
          bounds.right <= parentBounds.right,
        lineHeight,
        scrollWidth: element.scrollWidth,
        whiteSpace: style.whiteSpace,
      };
    });

  for (const symbol of ["USDC", "DAI"] as const) {
    const option = optionFor(symbol);
    await expect(option).toHaveCount(1);
    const label = option.getByText(symbol, { exact: true });
    const metrics = await measureHorizontalLabel(label);
    expect(metrics.whiteSpace).toBe("nowrap");
    expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 1.5);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.insideParent).toBe(true);
  }

  const amountInput = page.getByRole("textbox", { name: "Deposit amount" });
  for (const symbol of ["USDC", "DAI"] as const) {
    await optionFor(symbol).click();
    const suffix = amountInput.locator("..").getByText(symbol, { exact: true });
    const metrics = await measureHorizontalLabel(suffix);
    expect(metrics.whiteSpace).toBe("nowrap");
    expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 1.5);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.insideParent).toBe(true);
  }

  const paneContainment = await page.evaluate(() => {
    const revenue = document.getElementById("revenue");
    const workspace = document.getElementById("workspace");
    return {
      revenueClientWidth: revenue?.clientWidth ?? 0,
      revenueScrollWidth: revenue?.scrollWidth ?? Number.POSITIVE_INFINITY,
      workspaceClientWidth: workspace?.clientWidth ?? 0,
      workspaceScrollWidth: workspace?.scrollWidth ?? Number.POSITIVE_INFINITY,
    };
  });
  expect(paneContainment.revenueScrollWidth).toBeLessThanOrEqual(
    paneContainment.revenueClientWidth
  );
  expect(paneContainment.workspaceScrollWidth).toBeLessThanOrEqual(
    paneContainment.workspaceClientWidth
  );
});

test("contains long deposit-preview words and values at 375px", async ({
  page,
}) => {
  const longSymbol =
    "SUPERCALIFRAGILISTICEXPIALIDOCIOUSYEARNREVENUEVAULTTOKEN";

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/teams");
  await waitForTestBridge(page);
  await patchTeamsTeam(page, "platform", {
    revenueOptions: [
      {
        symbol: longSymbol,
        tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 18,
        isConvertible: true,
        convertToSymbol: `${longSymbol}OUTPUT`,
        oraclePriceUsd: "1.00",
        previewAmount: "12345678901234567890.123456789012345678",
        estimatedCreditUsd: "987654321098765432109876543210.12",
      },
    ],
  });

  await page.getByRole("link", { name: "Open Platform details" }).click();
  await page.getByRole("textbox", { name: "Deposit amount" }).fill(
    "12345678901234567890.123456789012345678"
  );

  await expect(page.getByText(longSymbol, { exact: true }).first()).toBeVisible();
  await expect(
    page.locator("#revenue").getByText(`${longSymbol} -> ${longSymbol}OUTPUT`)
  ).toBeVisible();

  const containment = await page.evaluate(() => {
    const measure = (element: HTMLElement | null) => ({
      clientWidth: element?.clientWidth ?? 0,
      scrollWidth: element?.scrollWidth ?? Number.POSITIVE_INFINITY,
    });
    const depositPreviewLabel = Array.from(
      document.querySelectorAll<HTMLElement>("#revenue p")
    ).find((element) => element.textContent?.trim() === "Deposit preview");

    return {
      workspace: measure(document.getElementById("workspace")),
      revenue: measure(document.getElementById("revenue")),
      preview: measure(depositPreviewLabel?.parentElement ?? null),
    };
  });

  expect(containment.workspace.scrollWidth).toBeLessThanOrEqual(
    containment.workspace.clientWidth
  );
  expect(containment.revenue.scrollWidth).toBeLessThanOrEqual(
    containment.revenue.clientWidth
  );
  expect(containment.preview.scrollWidth).toBeLessThanOrEqual(
    containment.preview.clientWidth
  );

  const ledgerScroller = page.locator("#revenue-ledger table").locator("..");
  const ledgerScroll = await ledgerScroller.evaluate((element) => {
    const before = element.scrollLeft;
    element.scrollLeft = element.scrollWidth;
    return {
      after: element.scrollLeft,
      before,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(ledgerScroll.scrollWidth).toBeGreaterThan(ledgerScroll.clientWidth);
  expect(ledgerScroll.after).toBeGreaterThan(ledgerScroll.before);

  const workspaceAfterLedgerScroll = await page.locator("#workspace").evaluate(
    (element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    })
  );
  expect(workspaceAfterLedgerScroll.scrollWidth).toBeLessThanOrEqual(
    workspaceAfterLedgerScroll.clientWidth
  );
});

test("keeps bonus math inside the viewport at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/teams");
  await waitForTestBridge(page);
  await patchTeamsTeam(page, "platform", {
    bonus: {
      tokenSymbol: "YFI",
      status: "claimable",
      totalClaimable: "12345678901234567890.123456789012345678",
      includedPeriodCount: 1,
      periods: [
        {
          period: 4,
          status: "finalized-claimable",
          finalized: true,
          claimed: false,
          profitUsd: "123456789012345678901234567890.12",
          spotPriceUsd: "3000.00",
          adjustedPriceUsd: "2700.00",
          growthFactorBps: 10500,
          ybcSplitBps: 1000,
          claimableYfi: "12345678901234567890.123456789012345678",
          claimableYfiRaw: "12345678901234567890123456789012345678",
        },
      ],
      tokenDecimals: 18,
      totalClaimableRaw: "12345678901234567890123456789012345678",
    },
  });

  await page.getByRole("link", { name: "Open Platform details" }).click();
  await page.getByText("View period detail and math", { exact: true }).click();
  await page.getByRole("button", { name: "Math inputs" }).focus();

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  const containment = await tooltip.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bodyScrollWidth: document.documentElement.scrollWidth,
      clientWidth: element.clientWidth,
      left: bounds.left,
      right: bounds.right,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(containment.left).toBeGreaterThanOrEqual(16);
  expect(containment.right).toBeLessThanOrEqual(
    containment.viewportWidth - 16
  );
  expect(containment.scrollWidth).toBeLessThanOrEqual(
    containment.clientWidth
  );
  expect(containment.bodyScrollWidth).toBeLessThanOrEqual(
    containment.viewportWidth
  );
});
