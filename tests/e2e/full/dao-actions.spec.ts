import {
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  DAO_BLOCKED_REASONS,
  DAO_MOCK_FEED,
  type DaoMockFixtureId,
  type DaoMockRole,
  type DaoMockTransactionOutcome,
} from "@/lib/clients/dao";
import { resetBridge, waitForTestBridge } from "../utils";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1_024 },
  { name: "desktop", width: 1_280, height: 900 },
  { name: "short desktop", width: 1_280, height: 600 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/dao");
  await waitForTestBridge(page);
  await resetBridge(page);
});

test("keeps the action panel reachable, responsive, and keyboard safe", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await loadFixture(page, "voting", 2);

    if (viewport.name === "tablet") {
      await page.getByRole("button", { name: "Switch to Dark Mode" }).click();
      const purposeBadge = page.getByText("Decision vote", { exact: true });
      const colors = await purposeBadge.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          foreground: style.color,
        };
      });
      expect(
        contrastRatio(colors.foreground, colors.background)
      ).toBeGreaterThanOrEqual(4.5);
    }

    const actionHeading = page.getByRole("heading", { name: "Your action" });
    const results = page.getByLabel("Vote results", { exact: true });
    const rules = results.locator("summary");
    await expect(results).toBeVisible();
    await expect(results.locator("details")).not.toHaveAttribute("open", "");
    const resultsBox = await results.boundingBox();
    const contentHeading = page.getByRole("heading", {
      name: "Immutable proposal content",
    });
    const actionBox = await actionHeading.boundingBox();
    const contentBox = await contentHeading.boundingBox();
    expect(actionBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(resultsBox).not.toBeNull();
    expect(resultsBox!.y + resultsBox!.height).toBeLessThan(actionBox!.y);
    expect(
      await actionHeading.evaluate((heading) => {
        const resultsCard = document.querySelector('[aria-label="Vote results"]');
        return Boolean(
          resultsCard &&
          (resultsCard.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      })
    ).toBe(true);

    const yea = page.getByRole("radio", { name: "Yea" });
    const nay = page.getByRole("radio", { name: "Nay" });
    await expect(yea).toBeEnabled();
    await expect(nay).toBeEnabled();
    await rules.focus();
    await expect(rules).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(yea).toBeFocused();

    if (viewport.width < 1_024) {
      expect(actionBox!.y).toBeLessThan(contentBox!.y);
    } else {
      expect(actionBox!.x).toBeGreaterThan(contentBox!.x);
    }

    await expect(yea).not.toBeChecked();
    await expect(nay).not.toBeChecked();
    await expectMinimumHitArea(yea.locator(".."));
    await expectMinimumHitArea(nay.locator(".."));
    await expect(
      actionHeading.locator("xpath=ancestor::aside")
    ).toHaveCSS("position", "static");
    await expectNoDocumentOverflow(page, viewport.name);
    if (viewport.name === "phone" || viewport.name === "desktop") {
      await page.getByRole("complementary", {
        name: "Proposal actions and vote results", exact: true,
      }).screenshot({
        path: testInfo.outputPath(`results-first-${viewport.name}.png`),
      });
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await loadFixture(page, "voting", 2);
  await page.getByRole("radio", { name: "Yea" }).check();
  const review = page.getByRole("button", { name: "Review vote" });
  await review.focus();
  await review.click();
  const dialog = page.getByRole("dialog", { name: "Confirm your vote" });
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Vote Yea" });
  await expect(cancel).toHaveCSS("transition-property", "none");
  await expect(confirm).toHaveCSS("transition-property", "none");
  const cancelBox = await cancel.boundingBox();
  expect(cancelBox).not.toBeNull();
  await page.mouse.move(
    cancelBox!.x + cancelBox!.width / 2,
    cancelBox!.y + cancelBox!.height / 2
  );
  await page.mouse.down();
  expect(await cancel.evaluate((element) => getComputedStyle(element).scale)).toBe(
    "1"
  );
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();

  await review.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
  await expect(review).toHaveCSS("transition-property", "none");
});

test("submits one vote, preserves canonical totals, then indexes the event", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadFixture(page, "voting", 2);

  await expect(voteFact(page, "Total weight")).toHaveText("11");
  await expect(voteFact(page, "Nay weight")).toHaveText("3.5");

  await page.getByRole("radio", { name: "Nay" }).check();
  await page.getByRole("button", { name: "Review vote" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm your vote" });
  await expect(dialog.getByText("Nay", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Fund protocol research")).toBeVisible();
  await expect(
    dialog.getByText(/public Voter and cannot be changed/i)
  ).toBeVisible();
  await expect(dialog.getByText("100", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Vote Nay" }).click();

  await expect(page.getByText("Transaction submitted.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Transaction confirmed · awaiting proposal indexing")
  ).toBeVisible();
  await expect(page.getByText("Vote recorded: Nay")).toBeVisible();
  await expect(
    page.getByText(DAO_BLOCKED_REASONS.voteAlreadySubmitted)
  ).toBeVisible();
  await expect(voteFact(page, "Total weight")).toHaveText("11");
  await expect(voteFact(page, "Nay weight")).toHaveText("3.5");
  await expect(page.getByText(/Transaction submitted \(Mock\)/i)).toHaveCount(0);

  await page.evaluate(async () => {
    await window.__TEST__?.indexDaoPendingAction?.();
  });
  await expect(
    page.getByText("Transaction confirmed · awaiting proposal indexing")
  ).toHaveCount(0);
  await expect(voteFact(page, "Total weight")).toHaveText("111");
  await expect(voteFact(page, "Nay weight")).toHaveText("103.5");
  await expectNoDocumentOverflow(page, "indexed vote");
});

test("keeps post-veto participation open and blocks an early veto", async ({
  page,
}) => {
  await loadFixture(page, "post-vote-veto", 13);
  await expect(
    page.getByText(/still vote to record your participation/i)
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Yea" })).toBeEnabled();
  await expect(page.getByRole("radio", { name: "Nay" })).toBeEnabled();

  await loadFixture(page, "early-veto", 12);
  await expect(page.getByText(DAO_BLOCKED_REASONS.voteVetoed)).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});

for (const [fixture, id, reason] of [
  ["retracted", 10, "This proposal was retracted and cannot receive votes."],
  ["flagged", 11, "This proposal was flagged and cannot receive votes."],
  ["early-veto", 12, "This proposal was vetoed and cannot receive votes."],
] as const) {
  test(`explains ${fixture} before, during, and after voting`, async ({ page }, testInfo) => {
    const proposal = DAO_MOCK_FEED.proposals.find(
      (value) => value.ref.proposalId === BigInt(id)
    )!;
    await page.setViewportSize(
      id === 11 ? { width: 390, height: 844 } : { width: 1_280, height: 900 }
    );
    await loadFixture(page, fixture, id);
    for (const now of [proposal.voteStartsAt - 1, proposal.voteStartsAt, proposal.voteEndsAt + 1]) {
      await page.evaluate(async (timestamp) => {
        await window.__TEST__?.setNow(timestamp);
      }, now);
      await expect(page.getByText(reason, { exact: true })).toBeVisible();
      await expect(page.getByRole("radio")).toHaveCount(0);
      const state = await page.evaluate(async () => window.__TEST__?.getDaoState?.());
      expect(state?.capabilities.canVote).toBe(false);
      await expectNoDocumentOverflow(page, `${fixture} at ${now}`);
      if (now < proposal.voteStartsAt) {
        await page.getByRole("complementary", {
          name: "Proposal actions and vote results", exact: true,
        }).screenshot({ path: testInfo.outputPath(`${fixture}.png`) });
      }
    }
  });
}

test("keeps results readable above actions without a wallet", async ({ page }) => {
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    await page.setViewportSize(viewport);
    await loadFixture(page, "voting", 2);
    await page.evaluate(async () => {
      await window.__TEST__?.setDaoAccountState?.("disconnected");
    });
    const results = page.getByLabel("Vote results", { exact: true });
    await expect(results.getByText("11", { exact: true })).toBeVisible();
    await expect(page.getByText(DAO_BLOCKED_REASONS.walletDisconnected, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    const resultsBox = await results.boundingBox();
    const actionBox = await page.getByRole("heading", { name: "Your action" }).boundingBox();
    expect(resultsBox!.y + resultsBox!.height).toBeLessThan(actionBox!.y);
    await expectNoDocumentOverflow(page, `disconnected ${viewport.name}`);
  }
});

test("requires tiered confirmation when immutable content cannot be trusted", async ({
  page,
}) => {
  await loadFixture(page, "content-unavailable", 14);
  await openYeaConfirmation(page);
  let dialog = page.getByRole("dialog", { name: "Confirm your vote" });
  let confirm = dialog.getByRole("button", { name: "Vote Yea" });
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await expect(confirm).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await loadFixture(page, "content-invalid", 15);
  await openYeaConfirmation(page);
  dialog = page.getByRole("dialog", { name: "Confirm your vote" });
  confirm = dialog.getByRole("button", { name: "Vote Yea" });
  const acknowledgements = dialog.getByRole("checkbox");
  await expect(acknowledgements).toHaveCount(2);
  await acknowledgements.nth(0).check();
  await expect(confirm).toBeDisabled();
  await acknowledgements.nth(1).check();
  await expect(confirm).toBeEnabled();
});

test("shows exact account, timing, and execution guard reasons", async ({
  page,
}) => {
  await loadFixture(page, "late-voting", 3);
  await expect(page.getByText("Original weight", { exact: true })).toBeVisible();
  await expect(page.getByText("Effective weight now", { exact: true })).toBeVisible();
  await expect(page.getByText(/of original weight remains/)).toBeVisible();

  await loadFixture(page, "voting", 2);
  for (const [state, reason] of [
    ["no-weight", DAO_BLOCKED_REASONS.zeroVotingWeight],
    ["already-voted", DAO_BLOCKED_REASONS.voteAlreadySubmitted],
    ["disconnected", DAO_BLOCKED_REASONS.walletDisconnected],
    ["wrong-network", DAO_BLOCKED_REASONS.wrongNetwork],
  ] as const) {
    await page.evaluate(async (accountState) => {
      await window.__TEST__?.setDaoAccountState?.(accountState);
    }, state);
    const voteSection = page
      .getByRole("heading", { name: "Vote" })
      .locator("xpath=ancestor::section");
    await expect(voteSection.getByText(reason)).toBeVisible();
  }

  await page.evaluate(async () => {
    await window.__TEST__?.setDaoFixture?.("voting");
    await window.__TEST__?.setNow(Math.floor(Date.now() / 1_000) + 60 * 86_400);
  });
  await expect(page.getByText(DAO_BLOCKED_REASONS.voteClosed)).toBeVisible();

  await loadFixture(page, "permissionless-execution", 22);
  await page.evaluate(async () => {
    await window.__TEST__?.setDaoExecutionGuard?.("guarded");
  });
  const execute = page.getByRole("button", { name: "Execute proposal" });
  await expect(execute).toBeDisabled();
  await expect(
    page.getByText(DAO_BLOCKED_REASONS.guardedExecution)
  ).toBeVisible();
  await page.evaluate(async () => {
    await window.__TEST__?.setDaoRole?.("operator", true);
  });
  await expect(execute).toBeDisabled();
  await expect(page.getByText(DAO_BLOCKED_REASONS.executionSimulationRequired)).toBeVisible();
  // Supply a newly simulated guarded mock scenario after the context change.
  await page.evaluate(async () => {
    await window.__TEST__?.setDaoExecutionState?.("guarded");
  });
  await expect(execute).toBeEnabled();

  await loadFixture(page, "approved-signal", 4);
  await expect(
    page.getByRole("button", { name: "Execute proposal" })
  ).toHaveCount(0);
  await expect(page.getByText("No executable actions").first()).toBeVisible();
});

const lifecycleScenarios: Array<{
  action: "Retract proposal" | "Flag proposal" | "Veto proposal" | "Execute proposal";
  effect: RegExp;
  fixture: DaoMockFixtureId;
  id: number;
  indexedStatus: "Retracted" | "Flagged" | "Vetoed" | "Executed";
  reason: string | null;
  role: DaoMockRole | null;
}> = [
  {
    action: "Retract proposal",
    effect: /does not reset the proposal cooldown/i,
    fixture: "discussion",
    id: 1,
    indexedStatus: "Retracted",
    reason: null,
    role: null,
  },
  {
    action: "Flag proposal",
    effect: /removes it from participation accounting/i,
    fixture: "discussion",
    id: 1,
    indexedStatus: "Flagged",
    reason: "Malformed immutable content",
    role: "operator",
  },
  {
    action: "Veto proposal",
    effect: /also retracts it, disables voting/i,
    fixture: "discussion",
    id: 1,
    indexedStatus: "Vetoed",
    reason: "Guardian safeguard",
    role: "guardian",
  },
  {
    action: "Execute proposal",
    effect: /run in order and atomically/i,
    fixture: "permissionless-execution",
    id: 22,
    indexedStatus: "Executed",
    reason: null,
    role: null,
  },
];

for (const scenario of lifecycleScenarios) {
  test(`${scenario.action.toLowerCase()} confirms its effect and indexes separately`, async ({
    page,
  }) => {
    await loadFixture(page, scenario.fixture, scenario.id);
    if (scenario.role) {
      await page.evaluate(async (role) => {
        await window.__TEST__?.setDaoRole?.(role, true);
      }, scenario.role);
    }

    if (scenario.action !== "Execute proposal") {
      await page.getByText("Lifecycle actions", { exact: true }).click();
    }
    await page.getByRole("button", { name: scenario.action }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(scenario.effect)).toBeVisible();
    if (scenario.reason) {
      await dialog.getByLabel("Reason").fill(scenario.reason);
    }
    await dialog.getByRole("button", { name: scenario.action }).click();

    await expect(
      page.getByText("Transaction confirmed · awaiting proposal indexing")
    ).toBeVisible();
    await expect(
      page.getByText(scenario.indexedStatus, { exact: true }).first()
    ).toHaveCount(0);

    await page.evaluate(async () => {
      await window.__TEST__?.indexDaoPendingAction?.();
    });
    await expect(
      page.getByText(scenario.indexedStatus, { exact: true }).first()
    ).toBeVisible();
    if (scenario.reason) {
      await expect(
        page.getByText(scenario.reason, { exact: true }).first()
      ).toBeVisible();
    }
  });
}

for (const [outcome, message] of [
  ["user-rejected", "Transaction cancelled."],
  ["revert", "Transaction reverted."],
  ["network-error", "Network issue. Please retry."],
] as const satisfies readonly (readonly [DaoMockTransactionOutcome, string])[]) {
  test(`keeps vote state unchanged after ${outcome}`, async ({ page }) => {
    await loadFixture(page, "voting", 2);
    await page.evaluate(async (nextOutcome) => {
      await window.__TEST__?.setDaoTransactionOutcome?.(nextOutcome);
    }, outcome);
    await openYeaConfirmation(page);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Vote Yea" })
      .click();

    const alert = page.getByRole("alert").filter({ hasText: "Transaction failed" });
    await expect(alert).toContainText(message);
    await expect(page.getByRole("radio", { name: "Yea" })).toBeEnabled();
    await expect(
      page.getByText("Transaction confirmed · awaiting proposal indexing")
    ).toHaveCount(0);
    await expect(voteFact(page, "Total weight")).toHaveText("11");
  });
}

async function loadFixture(
  page: Page,
  fixture: DaoMockFixtureId,
  proposalId: number
) {
  await page.goto(`/dao/proposals/${proposalId}`);
  await waitForTestBridge(page);
  await page.evaluate(async (fixtureId) => {
    await window.__TEST__?.setDaoFixture?.(fixtureId);
  }, fixture);
  await expect(page.getByRole("heading", { name: "Your action" })).toBeVisible();
}

async function openYeaConfirmation(page: Page) {
  await page.getByRole("radio", { name: "Yea" }).check();
  await page.getByRole("button", { name: "Review vote" }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm your vote" })
  ).toBeVisible();
}

function voteFact(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::dd");
}

async function expectMinimumHitArea(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(40);
  expect(box!.height).toBeGreaterThanOrEqual(40);
}

async function expectNoDocumentOverflow(page: Page, context: string) {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    sizes.scrollWidth,
    `${context} should not overflow horizontally`
  ).toBeLessThanOrEqual(sizes.clientWidth + 1);
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function parseRgb(value: string): [number, number, number] {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected an RGB color, received ${value}.`);
  }
  return channels as [number, number, number];
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
