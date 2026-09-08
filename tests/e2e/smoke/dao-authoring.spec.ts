import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DAO_CREATED_PROPOSALS_STORAGE_KEY,
  DAO_EXECUTOR_VALID_SCRIPT_VECTORS,
} from "@/lib/clients/dao";
import { resetBridge, waitForTestBridge } from "../utils";

test.beforeEach(async ({ page }) => {
  await page.goto("/dao/propose");
  await waitForTestBridge(page);
  await resetBridge(page);
  await page.evaluate(async () => {
    await window.__TEST__?.setDaoProposerState?.("eligible");
    await window.__TEST__?.setDaoAuthoringState?.("valid-signal");
  });
});

test("authors, reviews, publishes, and submits a Signal proposal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAuthoring(page);
  await fillImmutableDraft(page, 1001);

  await page.getByRole("button", { name: "Review proposal" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the exact proposal" })
  ).toBeVisible();
  await expect(page.getByText("No executable actions")).toBeVisible();
  const immutable = page.getByRole("region", { name: "Immutable content" });
  await expect(
    immutable.getByRole("heading", { name: "Exact proposal title", level: 3 })
  ).toBeVisible();
  await expect(immutable.getByText("Exact summary", { exact: true }).first()).toBeVisible();
  await expect(
    immutable.getByText("Exact specification", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText("0x", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/The indexed proposal retains the exact script and content commitment/i)
  ).toBeVisible();
  const steps = page.getByRole("region", { name: "Submission steps" });
  await expect(steps.getByText(/Two actions are required/i)).toBeVisible();
  await expect(steps.getByText("Current")).toBeVisible();
  await expect(steps.getByText("Upcoming")).toBeVisible();

  const publish = page.getByRole("button", {
    name: "Publish immutable content",
  });
  await expectMinimumHitArea(publish);
  await page
    .getByRole("checkbox", { name: /I reviewed the exact immutable content/i })
    .check();
  await publish.click();

  await expect(
    page.getByRole("heading", { name: "Immutable content published" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Content published — proposal not created yet",
    })
  ).toBeFocused();
  const create = page.getByRole("button", {
    name: "Create onchain proposal",
  });
  await expectMinimumHitArea(create);
  await create.click();
  const ready = page.getByRole("heading", { name: "Proposal ready" });
  await expect(ready).toBeVisible();
  await expect(ready).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Proposal ready");
  await expect(
    page.getByText(/indexed at the same proposal address/i)
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View transaction" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open proposal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy proposal link" })).toBeVisible();
  await expectNoDocumentOverflow(page);
});

test("authors an executable proposal from the full raw script", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.evaluate(async () => {
    await window.__TEST__?.setDaoAuthoringState?.("valid-script");
  });
  await openAuthoring(page);

  const executable = page.getByRole("radio", {
    name: /^Executable/i,
  });
  await expect(executable).toBeChecked();
  const script = page.getByRole("textbox", { name: "Full Executor script" });
  await expect(script).toHaveValue(
    DAO_EXECUTOR_VALID_SCRIPT_VECTORS.twoCalls.script
  );
  const scriptSection = page.getByRole("region", {
    name: "Execution script",
  });
  await expect(scriptSection.getByText("Script structure is valid")).toBeVisible();
  await expect(scriptSection.getByText("Call 1")).toBeVisible();
  await expect(scriptSection.getByText("Call 2")).toBeVisible();
  await expect(scriptSection.getByText(/\b(safe|verified)\b/i)).toHaveCount(0);

  await fillImmutableDraft(page, 1005);
  await page.getByRole("button", { name: "Review proposal" }).click();
  await expect(page.getByText("Script structure is valid")).toBeVisible();
  await expect(
    page.getByText(DAO_EXECUTOR_VALID_SCRIPT_VECTORS.twoCalls.script)
  ).toBeVisible();
  await expect(page.getByText("Script hash", { exact: true })).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

  await page
    .getByRole("checkbox", { name: /I reviewed the exact immutable content/i })
    .check();
  await page
    .getByRole("button", { name: "Publish immutable content" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Immutable content published" })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create onchain proposal" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Proposal identity unavailable" })
  ).toBeVisible();
  await expect(page.getByText("PROPOSE_LOG_MISSING", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View transaction" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open proposal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy proposal link" })).toHaveCount(0);
  await expectNoDocumentOverflow(page);
});

test("keeps the exact review locked and announces asynchronous progress", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openAuthoring(page);

  const exactTitle = "  Exact   proposal title  ";
  await fillImmutableDraft(page, 1001, exactTitle);
  const acceptedTopic = page.locator("#dao-forum-status");
  await expect(acceptedTopic.getByText("Fund protocol research")).toBeVisible();
  await expect(acceptedTopic.getByText("Proposals · ID 5")).toBeVisible();
  await expect(acceptedTopic.getByText("yearn-contributor")).toBeVisible();
  await expect(acceptedTopic.locator("time")).toHaveAttribute(
    "datetime",
    "2024-08-01T00:00:00.000Z"
  );

  await page.getByRole("button", { name: "Review proposal" }).click();
  const immutable = page.getByRole("region", { name: "Immutable content" });
  await immutable.getByText("View Markdown source").click();
  const exactSource = `# ${exactTitle}\n\nExact summary\n\n## Specification\n\nExact specification\n`;
  const exactSourceCode = immutable.locator("details code");
  await expect(exactSourceCode).toBeVisible();
  expect(await exactSourceCode.evaluate((element) => element.textContent)).toBe(
    exactSource
  );

  const forum = page.getByRole("region", { name: "Forum topic" });
  await expect(forum.getByText("Fund protocol research")).toBeVisible();
  await expect(forum.getByText("Proposals · ID 5")).toBeVisible();
  await expect(forum.getByText("yearn-contributor")).toBeVisible();
  await expect(forum.locator("time")).toHaveAttribute(
    "datetime",
    "2024-08-01T00:00:00.000Z"
  );
  const forumLink = forum.getByRole("link", { name: /opens in a new tab/i });
  await expect(forumLink).toHaveAttribute("target", "_blank");
  await expectMinimumHitArea(forumLink);

  await page.clock.install();
  await page
    .getByRole("checkbox", { name: /I reviewed the exact immutable content/i })
    .check();
  await page
    .getByRole("button", { name: "Publish immutable content" })
    .click();

  const publishing = page.getByRole("button", {
    name: "Publishing immutable content",
  });
  await expect(publishing).toBeDisabled();
  await expect(publishing).toHaveAttribute("aria-busy", "true");
  const publicationSpinner = publishing.locator("svg");
  await expect(publicationSpinner).toHaveAttribute("aria-hidden", "true");
  expect(
    await publicationSpinner.evaluate(
      (element) => getComputedStyle(element).animationName
    )
  ).toBe("none");
  await expect(
    page.getByRole("status").filter({ hasText: "Publishing immutable content" })
  ).toBeVisible();

  const edit = page.getByRole("button", { name: "Edit proposal" });
  await expect(edit).toBeDisabled();
  await edit.evaluate((element) => {
    element.removeAttribute("disabled");
    (element as HTMLButtonElement).click();
  });
  await expect(
    page.getByRole("heading", { name: "Review the exact proposal" })
  ).toBeVisible();

  await page.clock.fastForward(200);
  await expect(
    page.getByRole("heading", { name: "Immutable content published" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit proposal" })).toBeDisabled();
  expect(await exactSourceCode.evaluate((element) => element.textContent)).toBe(
    exactSource
  );

  await page.getByRole("button", { name: "Create onchain proposal" }).click();
  const waiting = page.getByRole("button", { name: "Waiting for wallet" });
  await expect(waiting).toBeDisabled();
  await expect(waiting).toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByRole("status").filter({ hasText: "Waiting for wallet" })
  ).toBeVisible();
  await page.clock.fastForward(150);
  const submitted = page.getByRole("heading", {
    name: "Proposal transaction submitted",
  });
  await expect(submitted).toBeVisible();
  await expect(submitted).toBeFocused();
  await expect(page.getByRole("link", { name: "View transaction" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open proposal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy proposal link" })).toHaveCount(0);

  await page.clock.fastForward(150);
  await expect(
    page.getByRole("heading", { name: "Proposal identity confirmed" })
  ).toBeVisible();
  const openProposal = page.getByRole("link", { name: "Open proposal" });
  const initialHref = await openProposal.getAttribute("href");
  expect(initialHref).toMatch(/^\/dao\/proposals\/\d+\?from=upcoming&chain=1&voting=0x1111111111111111111111111111111111111111$/);
  await expect(page.getByRole("button", { name: "Copy proposal link" })).toBeVisible();

  await page.clock.fastForward(150);
  await expect(page.getByText("Awaiting proposal indexing")).toBeVisible();
  await expect(openProposal).toHaveAttribute("href", initialHref!);

  await page.clock.fastForward(150);
  await expect(page.getByRole("heading", { name: "Proposal ready" })).toBeVisible();
  await expect(openProposal).toHaveAttribute("href", initialHref!);
  await expectNoDocumentOverflow(page);
});

test("starts authoring with keyboard focus below the sticky header", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 560 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/dao/propose");
    await waitForTestBridge(page);
    await resetBridge(page);
    await page.evaluate(async () => {
      await window.__TEST__?.setDaoProposerState?.("eligible");
      await window.__TEST__?.setDaoAuthoringState?.("valid-signal");
    });

    const start = page.getByRole("button", { name: "Start proposal" });
    await start.focus();
    await page.keyboard.press("Enter");

    const heading = page.getByRole("heading", { name: "Proposal details" });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveAttribute("tabindex", "-1");
    const placement = await heading.evaluate((element) => ({
      bottom: element.getBoundingClientRect().bottom,
      headerBottom:
        document.querySelector("header")?.getBoundingClientRect().bottom ?? 0,
      top: element.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    }));
    expect(placement.top).toBeGreaterThanOrEqual(placement.headerBottom);
    expect(placement.bottom).toBeLessThanOrEqual(placement.viewportHeight);
    await expectNoDocumentOverflow(page);
  }
});

test("shows deterministic forum validation failures without clearing content", async ({
  page,
}) => {
  await openAuthoring(page);
  const forum = page.getByRole("textbox", { name: "Forum discussion" });
  const validate = page.getByRole("button", { name: "Validate topic" });

  for (const [topicId, code] of [
    [404, "TOPIC_NOT_FOUND"],
    [2002, "WRONG_CATEGORY"],
    [503, "FORUM_UNAVAILABLE"],
  ] as const) {
    await forum.fill(`https://gov.yearn.fi/t/topic/${topicId}`);
    await validate.click();
    await expect(
      page.locator("#dao-forum-status").getByText(code, { exact: true })
    ).toBeVisible();
    await expect(forum).toHaveValue(
      `https://gov.yearn.fi/t/topic/${topicId}`
    );
  }
});

test("preserves the draft and does not start the wallet step after publication failure", async ({
  page,
}) => {
  await openAuthoring(page);
  await fillImmutableDraft(page, 1002);
  await reviewAndPublish(page);

  await expect(
    page.getByText("Proposal content was not published")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create onchain proposal" })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit proposal" }).click();
  await expect(
    page.getByRole("textbox", { name: "Proposal Markdown" })
  ).toHaveValue(
    "# Exact proposal title\n\nExact summary\n\n## Specification\n\nExact specification\n"
  );
  await expect(
    page.getByRole("textbox", { name: "Forum discussion" })
  ).toHaveValue("https://gov.yearn.fi/t/improve-treasury-reporting/1002");
});

test("keeps publication after every failed typed transaction outcome", async ({
  page,
}) => {
  for (const [outcome, failureTitle] of [
    ["user-rejected", "Wallet request cancelled"],
    ["revert", "Proposal creation failed"],
    ["network-error", "Network request failed"],
  ] as const) {
    await page.goto("/dao/propose");
    await waitForTestBridge(page);
    await page.evaluate(async () => {
      await window.__TEST__?.setDaoProposerState?.("eligible");
      await window.__TEST__?.setDaoAuthoringState?.("valid-signal");
    });
    await page.evaluate(async (nextOutcome) => {
      await window.__TEST__?.setDaoTransactionOutcome?.(nextOutcome);
    }, outcome);
    await openAuthoring(page);
    await fillImmutableDraft(page, 1001);
    await reviewAndPublish(page);
    await expect(
      page.getByRole("heading", { name: "Immutable content published" })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create onchain proposal" })
      .click();
    await expect(page.getByText(failureTitle, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Immutable content published" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry proposal creation" })
    ).toBeEnabled();
    await expect(page.getByText("Transaction hash", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View transaction" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open proposal" })).toHaveCount(0);
    await expect(page.getByText("Awaiting proposal indexing")).toHaveCount(0);
    expect(
      await page.evaluate(
        (storageKey) => window.sessionStorage.getItem(storageKey),
        DAO_CREATED_PROPOSALS_STORAGE_KEY
      )
    ).toBeNull();
  }
});

test("uses visible review controls for rejection then retries the same publication to Indexed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDebugControls(page);
  await selectDebugControl(page, "Persona and roles", "Proposer");
  await selectDebugControl(page, "Transaction result", "Rejected");
  await page.getByRole("button", { name: "Close debug controls" }).click();

  await openAuthoring(page);
  await fillImmutableDraft(page, 1001);
  await reviewAndPublish(page);
  await expect(
    page.getByRole("heading", { name: "Immutable content published" })
  ).toBeVisible();
  const fingerprintFact = page
    .getByText("Content fingerprint", { exact: true })
    .locator("xpath=..");
  const publicationFingerprint = await fingerprintFact.textContent();

  await page.getByRole("button", { name: "Create onchain proposal" }).click();
  await expect(page.getByText("Wallet request cancelled")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Immutable content published" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry proposal creation" })
  ).toBeEnabled();
  await expect(page.getByText("Transaction hash", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View transaction" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open proposal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy proposal link" })).toHaveCount(0);
  await expect(page.getByText("Awaiting proposal indexing")).toHaveCount(0);
  expect(
    await page.evaluate(
      (storageKey) => window.sessionStorage.getItem(storageKey),
      DAO_CREATED_PROPOSALS_STORAGE_KEY
    )
  ).toBeNull();

  await openDebugControls(page);
  const transactionControls = await getDebugControlGroup(
    page,
    "Transaction result"
  );
  await expect(transactionControls.getByText(/awaiting indexing/i)).toHaveCount(0);
  await transactionControls
    .getByRole("button", { name: "Success", exact: true })
    .click();
  await page.getByRole("button", { name: "Close debug controls" }).click();

  await expect(fingerprintFact).toHaveText(publicationFingerprint ?? "");
  await page
    .getByRole("button", { name: "Retry proposal creation" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Proposal ready" })
  ).toBeVisible();
  await expect(fingerprintFact).toHaveText(publicationFingerprint ?? "");

  const openProposal = page.getByRole("link", { name: "Open proposal" });
  const proposalHref = await openProposal.getAttribute("href");
  expect(proposalHref).toMatch(/^\/dao\/proposals\/\d+\?from=upcoming&chain=1&voting=0x1111111111111111111111111111111111111111$/);
  await page.getByRole("button", { name: "Copy proposal link" }).click();
  await expect(
    page.getByRole("button", { name: "Proposal link copied" })
  ).toBeVisible();
  const stored = await page.evaluate(
    (storageKey) => window.sessionStorage.getItem(storageKey),
    DAO_CREATED_PROPOSALS_STORAGE_KEY
  );
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!).records).toHaveLength(1);
  expect(JSON.parse(stored!).records[0]?.stage).toBe("indexed");

  await openProposal.click();
  await expect(page).toHaveURL(proposalHref!);
  await expect(
    page.getByRole("heading", { name: "Exact proposal title", level: 1 })
  ).toBeVisible();
});

test("renders every mutable proposer blocker and the shared capacity rule", async ({
  page,
}) => {
  for (const [state, reason] of [
    ["blacklisted", "This account is blocked from creating proposals."],
    ["insufficient-weight", "Proposal weight is below the current minimum."],
    ["cooldown", "The proposal cooldown is still active."],
    ["capacity-full", "Proposal capacity is full."],
  ] as const) {
    await page.evaluate(async (nextState) => {
      await window.__TEST__?.setDaoProposerState?.(nextState);
    }, state);
    await expect(page.getByText(reason, { exact: state !== "capacity-full" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Draft proposal" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Draft proposal" }).click();
  await expect(
    page.getByText(/shared system-wide; it is not a per-user quota/i)
  ).toBeVisible();
  await expect(page.getByText("64 / 64 proposals")).toBeVisible();
  await expect(page.getByText("Affected reward epochs")).toBeVisible();
});

test("keeps normal eligibility compact while retaining the six-epoch range", async ({
  page,
}) => {
  await expect(page.getByText("Expected voting epoch")).toBeVisible();
  await expect(page.getByText("Affected reward epochs")).toBeVisible();
  await expect(page.getByText(/^\d+–\d+$/)).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByText(/64 \/ 64 proposals/)).toHaveCount(0);
  await expect(page.getByText(/shared system-wide/i)).toHaveCount(0);
});

async function openAuthoring(page: Page) {
  const start = page.getByRole("button", {
    name: /^(Start|Draft) proposal$/,
  });
  await expect(start).toBeVisible();
  await start.click();
  await expect(
    page.getByRole("heading", { name: "Proposal details" })
  ).toBeVisible();
}

async function fillImmutableDraft(
  page: Page,
  topicId: number,
  title = "Exact proposal title"
) {
  await page
    .getByRole("textbox", { name: "Forum discussion" })
    .fill(`https://gov.yearn.fi/t/topic/${topicId}`);
  await page.getByRole("button", { name: "Validate topic" }).click();
  await expect(
    page
      .locator("#dao-forum-status")
      .getByText("Forum topic accepted", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Proposal Markdown" })
    .fill(
      `# ${title}\n\nExact summary\n\n## Specification\n\nExact specification\n`
    );
}

async function reviewAndPublish(page: Page) {
  await page.getByRole("button", { name: "Review proposal" }).click();
  await page
    .getByRole("checkbox", { name: /I reviewed the exact immutable content/i })
    .check();
  await page
    .getByRole("button", { name: "Publish immutable content" })
    .click();
}

async function openDebugControls(page: Page) {
  await page.getByRole("button", { name: /Debug/ }).click();
  await expect(
    page.getByRole("heading", { name: "Debug Controls" })
  ).toBeVisible();
}

async function getDebugControlGroup(page: Page, label: string) {
  const summary = page.getByText(label, { exact: true });
  const group = summary.locator("xpath=ancestor::details[1]");
  if ((await group.getAttribute("open")) === null) {
    await summary.click();
  }
  return group;
}

async function selectDebugControl(
  page: Page,
  groupLabel: string,
  buttonName: string
) {
  const group = await getDebugControlGroup(page, groupLabel);
  await group
    .getByRole("button", { name: buttonName, exact: true })
    .first()
    .click();
}

async function expectMinimumHitArea(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(40);
  expect(box!.height).toBeGreaterThanOrEqual(40);
}

async function expectNoDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}
