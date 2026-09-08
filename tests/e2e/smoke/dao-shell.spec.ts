import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";
import { DAO_MOCK_NOW } from "@/lib/clients/dao";

const EXPECT_PRODUCTION_FAIL_CLOSED =
  process.env.E2E_EXPECT_DAO_PRODUCTION_FAIL_CLOSED === "true";
const configuredBaseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const configuredHostname = new URL(configuredBaseUrl).hostname;
const IS_LOCAL_E2E = ["localhost", "127.0.0.1", "::1"].includes(
  configuredHostname
);

test("answers preview DAO HEAD probes without self-proxying", async ({
  request,
}) => {
  test.skip(EXPECT_PRODUCTION_FAIL_CLOSED);

  for (const path of ["/dao", "/dao/proposals/2"]) {
    const response = await request.head(path);

    expect(response.status()).toBe(200);
    expect(response.status()).toBeLessThan(500);
    expectHeadSecurityHeaders(response);
    expectNoSelfRewrite(response, path);
  }
});

test("fails closed for production DAO requests without a server error", async ({
  page,
  request,
}) => {
  test.skip(!EXPECT_PRODUCTION_FAIL_CLOSED);

  for (const path of ["/dao", "/dao/propose", "/dao/proposals/2"]) {
    for (const method of ["head", "get"] as const) {
      const response = await request[method](path);

      expect(response.status()).toBe(404);
      expect(response.status()).toBeLessThan(500);
      expectHeadSecurityHeaders(response);
      expectNoSelfRewrite(response, path);
    }
  }

  if (IS_LOCAL_E2E) {
    const betaUrl = new URL(configuredBaseUrl);
    betaUrl.hostname = "dao-beta.dao-ops.com";
    betaUrl.pathname = "/";
    const betaResponse = await page.goto(betaUrl.toString());

    expect(betaResponse?.status()).toBe(404);
    expect(betaResponse?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  }
});

test("renders the DAO proposal board shell", async ({ page }) => {
  await page.goto("/dao");

  await expect(
    page.getByRole("heading", { name: "Proposals", level: 1 })
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByText("22 proposals are available.")).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Open the Yearn discussion forum in a new tab",
    })
  ).toHaveAttribute("href", "https://gov.yearn.fi/");
  await expect(
    page.getByText(/\b(mock|fixture|prototype|qa|implementation)\b/i)
  ).toHaveCount(0);

  const createProposalLink = page.getByRole("link", {
    name: "Create proposal",
  });
  const forumLink = page.getByRole("link", {
    name: "Open the Yearn discussion forum in a new tab",
  });

  await forumLink.focus();
  await expect(forumLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(createProposalLink).toBeFocused();

  await expectMinimumHitArea(createProposalLink);
});

test("links the shared DAO application label home on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_280, height: 900 });
  await page.goto("/dao/proposals/2");
  const desktopHome = page
    .locator("header")
    .getByRole("link", { name: "DAO Governance", exact: true });
  await expect(desktopHome).toHaveAttribute("href", "/dao");
  await expectMinimumHitArea(desktopHome);
  await desktopHome.focus();
  await expect(desktopHome).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dao$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dao/proposals/2");
  const opener = page.getByRole("button", { name: "Open navigation menu" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Navigation menu" });
  const mobileHome = dialog.getByRole("link", {
    name: "DAO Governance",
    exact: true,
  });
  await expect(mobileHome).toHaveAttribute("href", "/dao");
  const mobileBox = await mobileHome.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.height).toBeGreaterThanOrEqual(44);
  await mobileHome.click();
  await expect(page).toHaveURL(/\/dao$/);
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open navigation menu" })
  ).toBeFocused();
});

test("wraps the long shared app label at 200% mobile text without clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ybc");
  await expect(
    page.getByRole("heading", {
      name: "Yearn Builder's Collective",
      level: 1,
    })
  ).toBeVisible();
  await page.addStyleTag({
    content: "html { font-size: 200% !important; }",
  });

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Navigation menu" });
  const mobileHome = dialog.getByRole("link", {
    name: "Yearn Builder's Collective",
    exact: true,
  });
  const label = mobileHome.getByText("Yearn Builder's Collective", {
    exact: true,
  });

  await expect(mobileHome).toBeVisible();
  await expect(mobileHome).toHaveAttribute("href", "/ybc");
  const labelLayout = await label.evaluate((element) => {
    const style = window.getComputedStyle(element);

    return {
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    };
  });

  expect(labelLayout.textOverflow, "long app label must not ellipsize").not.toBe(
    "ellipsis"
  );
  expect(labelLayout.whiteSpace, "long app label must wrap").not.toBe("nowrap");
  expect(
    labelLayout.scrollHeight,
    "wrapped label height must not clip"
  ).toBeLessThanOrEqual(labelLayout.clientHeight);
  expect(
    labelLayout.scrollWidth,
    "wrapped label width must not clip"
  ).toBeLessThanOrEqual(labelLayout.clientWidth);
  const mobileBox = await mobileHome.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.height).toBeGreaterThanOrEqual(44);
  const drawerLayout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();

    return {
      clientWidth: element.clientWidth,
      left: rect.left,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(drawerLayout.left).toBeGreaterThanOrEqual(0);
  expect(drawerLayout.right).toBeLessThanOrEqual(drawerLayout.viewportWidth);
  expect(drawerLayout.scrollWidth).toBeLessThanOrEqual(drawerLayout.clientWidth);
  await expect
    .poll(() => page.evaluate(() => window.getComputedStyle(document.body).overflow))
    .toBe("hidden");
});

test("preserves the board group through replace, reload, detail, and Back", async ({
  page,
}) => {
  await page.goto("/dao?trace=1");
  await expect(page.getByRole("tab", { name: /Active/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  const historyLength = await page.evaluate(() => window.history.length);

  await page.getByRole("tab", { name: /Upcoming/ }).click();
  await page.getByRole("tab", { name: /Closed/ }).click();
  await expect(page).toHaveURL(/\/dao\?trace=1&group=closed$/);
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

  await page.reload();
  await expect(page.getByRole("tab", { name: /Closed/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  const proposalLink = page.getByRole("link", {
    name: /Open proposal #4: Approve the contributor charter/,
  });
  const row = proposalLink.locator("xpath=ancestor::article");
  await row.scrollIntoViewIfNeeded();
  const rowBox = await row.boundingBox();
  expect(rowBox).not.toBeNull();
  await page.mouse.click(
    rowBox!.x + rowBox!.width - 24,
    rowBox!.y + rowBox!.height / 2
  );
  await expect(page).toHaveURL(/\/dao\/proposals\/4\?from=closed&chain=1&voting=0x1111111111111111111111111111111111111111$/);
  await expect(page.getByRole("link", { name: "Closed" })).toHaveAttribute(
    "href",
    "/dao?group=closed"
  );

  await page.goBack();
  await expect(page).toHaveURL(/\/dao\?trace=1&group=closed$/);
  await expect(page.getByRole("tab", { name: /Closed/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("keeps nested row controls independent of the stretched proposal link", async ({
  page,
}) => {
  await page.goto("/dao?group=active");
  const proposalLink = page.getByRole("link", {
    name: /Open proposal #2: Fund protocol research/,
  });
  const row = proposalLink.locator("xpath=ancestor::article");
  const copy = row.getByRole("button", { name: "Copy proposed by" });
  const explorer = row.getByRole("link", {
    name: /View Ethereum address .* on Etherscan/,
  });
  await explorer.hover();
  await copy.click();
  await expect(page).toHaveURL(/\/dao\?group=active$/);
  await expect(copy).toHaveAttribute("aria-label", "Copy proposed by");
  await expect(copy).toHaveAttribute("title", "Copied");

  await expect(explorer).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await explorer.click();
  const popup = await popupPromise;
  await popup.waitForURL(/etherscan\.io\/address\//);
  expect(popup.url()).toMatch(/etherscan\.io\/address\//);
  await popup.close();
  await expect(page).toHaveURL(/\/dao\?group=active$/);
});

test("makes no dead-loopback RPC request while hydrating every DAO route", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const failedRpcRequests: string[] = [];
  const deadRpcRequests: string[] = [];
  const ethAccountsRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const postData = request.postData() ?? "";
    if (/"method"\s*:\s*"eth_accounts"/.test(postData)) {
      ethAccountsRequests.push(`${request.url()}: ${postData}`);
    }
    if (request.url().startsWith("http://127.0.0.1:8546")) {
      deadRpcRequests.push(postData || request.url());
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:8546")) {
      failedRpcRequests.push(
        `${request.failure()?.errorText ?? "failed"}: ${request.postData() ?? ""}`
      );
    }
  });

  for (const route of [
    {
      path: "/dao",
      heading: "Proposals",
      hydratedText: "22 proposals are available.",
    },
    {
      path: "/dao/proposals/2",
      heading: "Fund protocol research",
      hydratedText: "Open this proposal's forum discussion in a new tab",
    },
    {
      path: "/dao/propose",
      heading: "Create proposal",
      hydratedText: "Your wallet can create a proposal",
    },
  ]) {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", { name: route.heading, level: 1 })
    ).toBeVisible();
    if (route.path.includes("/proposals/")) {
      await expect(
        page.getByRole("link", { name: route.hydratedText })
      ).toBeVisible();
    } else {
      await expect(page.getByText(route.hydratedText)).toBeVisible();
    }
    await expect(
      page.getByRole("status", { name: /Read-only test wallet/i })
    ).toBeVisible();
  }
  await page.waitForTimeout(250);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRpcRequests).toEqual([]);
  expect(deadRpcRequests).toEqual([]);
  expect(ethAccountsRequests).toEqual([]);
});

test("uses clean client-side paths on the guarded DAO beta host", async ({
  page,
}, testInfo) => {
  test.skip(!IS_LOCAL_E2E, "Local host mapping is required for beta-host UAT.");
  const configuredBaseUrl = testInfo.project.use.baseURL;
  if (typeof configuredBaseUrl !== "string") {
    throw new Error("The Playwright project requires a base URL.");
  }
  const betaUrl = new URL(configuredBaseUrl);
  betaUrl.hostname = "dao-beta.dao-ops.com";
  betaUrl.pathname = "/";

  const response = await page.goto(betaUrl.toString());
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(
    page.getByRole("heading", { name: "Proposals", level: 1 })
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  const betaDesktopHome = page
    .locator("header")
    .getByRole("link", { name: "DAO Governance", exact: true });
  await expect(betaDesktopHome).toHaveAttribute("href", "/");
  await expectMinimumHitArea(betaDesktopHome);
  await expect(page.getByRole("link", { name: "Create proposal" })).toHaveAttribute(
    "href",
    "/propose"
  );

  await page.getByRole("tab", { name: /Upcoming/ }).click();
  await page.getByRole("tab", { name: /Active/ }).click();
  const proposalLink = page.getByRole("link", {
    name: /Open proposal #2: Fund protocol research/,
  });
  await expect(proposalLink).toHaveAttribute(
    "href",
    "/proposals/2?from=active&chain=1&voting=0x1111111111111111111111111111111111111111"
  );
  await proposalLink.click();
  await expect
    .poll(() => {
      const currentUrl = new URL(page.url());
      return `${currentUrl.pathname}${currentUrl.search}`;
    })
    .toBe("/proposals/2?from=active&chain=1&voting=0x1111111111111111111111111111111111111111");
  await expect(page.getByRole("link", { name: "Active" })).toHaveAttribute(
    "href",
    "/?group=active"
  );
  await betaDesktopHome.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");

  betaUrl.pathname = "/proposals/2";
  betaUrl.search = "";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(betaUrl.toString());
  const betaOpener = page.getByRole("button", { name: "Open navigation menu" });
  await betaOpener.click();
  const betaDialog = page.getByRole("dialog", { name: "Navigation menu" });
  const betaMobileHome = betaDialog.getByRole("link", {
    name: "DAO Governance",
    exact: true,
  });
  await expect(betaMobileHome).toHaveAttribute("href", "/");
  const betaMobileBox = await betaMobileHome.boundingBox();
  expect(betaMobileBox).not.toBeNull();
  expect(betaMobileBox!.height).toBeGreaterThanOrEqual(44);
  await betaMobileHome.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(betaDialog).toHaveCount(0);

  betaUrl.pathname = "/propose";
  betaUrl.search = "";
  await page.goto(betaUrl.toString());
  await expect(
    page.getByRole("heading", { name: "Create proposal", level: 1 })
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/propose");
  await expect(page.getByRole("link", { name: "Proposals" })).toHaveAttribute(
    "href",
    "/"
  );
});

test("exposes the shared DAO debug section without route-local controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dao");

  await page.getByRole("button", { name: /debug/i }).click();

  await expect(page.getByText("Debug Controls", { exact: true })).toBeVisible();
  await expect(page.getByText("App Specific", { exact: true })).toBeVisible();
  for (const group of [
    "Route state",
    "Fixture",
    "Persona and roles",
    "Content",
    "Lifecycle",
    "Veto",
    "Script",
    "Account",
    "Execution",
    "Authoring",
    "Proposer eligibility",
  ]) {
    await expect(page.getByText(group, { exact: true })).toBeVisible();
  }
  await expectNoDocumentOverflow(page);
  await expectMinimumHitArea(
    page.getByRole("button", { name: "Close debug controls" })
  );
});

test("moves debug-panel focus and removes its entrance animation for reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dao");

  const trigger = page.getByRole("button", { name: /debug/i });
  await trigger.focus();
  await trigger.click();

  const closeButton = page.getByRole("button", {
    name: "Close debug controls",
  });
  await expect(closeButton).toBeFocused();
  const panel = page
    .getByText("Debug Controls", { exact: true })
    .locator("../..");
  await expect(panel).toHaveCSS("animation-name", "none");

  await closeButton.click();
  await expect(trigger).toBeFocused();
});

test("uses the typed bridge to mutate DAO facts and refresh infinitely fresh queries", async ({
  page,
}) => {
  await page.goto("/dao");

  await page.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.reset();
    await window.__TEST__.setDaoEmpty?.(true);
  });
  await expect(
    page.getByRole("heading", { name: "No proposals yet", level: 2 })
  ).toBeVisible();

  await page.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.setDaoEmpty?.(false);
  });
  await page.goto("/dao/proposals/13");
  await page.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.setDaoFixture?.("post-vote-veto");
  });
  await expect(page.getByText("Vetoed", { exact: true }).first()).toBeVisible();

  await page.evaluate(async () => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.setDaoPersona?.("guardian");
    await window.__TEST__.setDaoRole?.("operator", true);
    await window.__TEST__.setDaoContentState?.("unavailable");
  });
  await expect(page.getByText("Proposal content is unavailable.")).toBeVisible();

  await page.goto("/dao/proposals/1");
  await page.evaluate(async (votingTimestamp) => {
    if (!window.__TEST__) throw new Error("Test bridge is unavailable.");
    await window.__TEST__.setDaoFixture?.("discussion");
    await window.__TEST__.setNow(votingTimestamp);
  }, DAO_MOCK_NOW + 8 * 86_400);
  await expect(page.getByText("Voting", { exact: true }).first()).toBeVisible();
});

test("renders DAO proposal detail and not-found shells", async ({ page }) => {
  await page.goto("/dao/proposals/2");

  await expect(
    page.getByRole("heading", { name: "Fund protocol research", level: 1 })
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByText("Proposal #2").first()).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Open this proposal's forum discussion in a new tab",
    })
  ).toHaveAttribute("target", "_blank");

  for (const label of ["Proposal #2", "Proposal ID", "Status", "Type"]) {
    await expect(page.getByText(label, { exact: true }).first()).toHaveCSS(
      "color",
      "rgb(82, 82, 82)"
    );
  }
  await expect(
    page.getByText(/\b(mock|fixture|prototype|qa|implementation)\b/i)
  ).toHaveCount(0);

  await page.goto("/dao/proposals/999");
  await expect(
    page.getByRole("heading", { name: "Proposal not found", level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return to proposals" })
  ).toHaveAttribute("href", "/dao");
});

test("renders the DAO proposal authoring shell without M2 form controls", async ({
  page,
}) => {
  await page.goto("/dao/propose");

  await expect(
    page.getByRole("heading", { name: "Create proposal", level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Before you propose", level: 2 })
  ).toBeVisible();
  await expect(page.getByText("Your wallet can create a proposal")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByText(/\b(mock|fixture|prototype|qa|implementation)\b/i)
  ).toHaveCount(0);
});

test("contains every DAO route at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const routes = [
    {
      path: "/dao",
      readyText: "22 proposals are available.",
      linkName: "Create proposal",
    },
    {
      path: "/dao/proposals/2",
      readyText: "Fund protocol research",
      readyHeading: true,
      linkName: "Proposals",
    },
    {
      path: "/dao/propose",
      readyText: "Your wallet can create a proposal",
      linkName: "Proposals",
    },
  ];

  for (const route of routes) {
    await page.goto(route.path);
    const readyState =
      "readyHeading" in route && route.readyHeading
        ? page.getByRole("heading", { name: route.readyText, level: 1 })
        : page.getByText(route.readyText, { exact: true });
    await expect(readyState).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectMinimumHitArea(
      page.getByRole("link", { name: route.linkName }).first()
    );
  }
});

test("wraps an arbitrary-length numeric proposal ID at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const proposalId = "9".repeat(160);

  await page.goto(`/dao/proposals/${proposalId}`);
  await expect(
    page.getByRole("heading", { name: "Proposal not found", level: 1 })
  ).toBeVisible();
  await expectNoDocumentOverflow(page);
});

test("balances all six preview launcher apps across desktop rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const links = page.locator(
    'a[href="/styfi"], a[href="/veyfi"], a[href="/teams"], a[href="/yeth"], a[href="/ybc"], a[href="/dao"]'
  );
  await expect(links).toHaveCount(6);
  const rowCounts = await links.evaluateAll((elements) => {
    const counts = new Map<number, number>();
    for (const element of elements) {
      const top = Math.round(element.getBoundingClientRect().top);
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    return [...counts.values()];
  });

  expect(rowCounts).toEqual([3, 3]);
});

async function expectNoDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

async function expectMinimumHitArea(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(40);
  expect(box!.height).toBeGreaterThanOrEqual(40);
}

function expectNoSelfRewrite(response: APIResponse, requestPath: string) {
  const rewrite = response.headers()["x-middleware-rewrite"];
  if (!rewrite) return;

  expect(new URL(rewrite, response.url()).pathname).not.toBe(requestPath);
}

function expectHeadSecurityHeaders(response: APIResponse) {
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-nonce"]).toMatch(/^[a-f0-9]{32}$/);
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
}
