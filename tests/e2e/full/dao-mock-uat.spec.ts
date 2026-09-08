import { expect, test } from "@playwright/test";
import { DAO_MOCK_NOW, type DaoMockFixtureId } from "@/lib/clients/dao";
import { resetBridge, waitForTestBridge } from "../utils";

const PROPOSAL_FIXTURES = [
  {
    fixture: "discussion",
    proposalId: 1,
    title: "Adopt the contributor budget policy",
    status: "Discussion",
  },
  {
    fixture: "voting",
    proposalId: 2,
    title: "Fund protocol research",
    status: "Voting",
  },
  {
    fixture: "late-voting",
    proposalId: 3,
    title: "Renew security operations",
    status: "Voting",
  },
  {
    fixture: "approved-signal",
    proposalId: 4,
    title: "Approve the contributor charter",
    status: "Approved",
  },
  {
    fixture: "approved-executable",
    proposalId: 5,
    title: "Update treasury policy",
    status: "Approved",
  },
  {
    fixture: "executed",
    proposalId: 6,
    title: "Execute the treasury migration",
    status: "Executed",
  },
  {
    fixture: "rejected",
    proposalId: 7,
    title: "Increase the operations budget",
    status: "Rejected",
  },
  {
    fixture: "no-votes",
    proposalId: 8,
    title: "Record a proposal with no votes",
    status: "Rejected",
  },
  {
    fixture: "expired",
    proposalId: 9,
    title: "Expired executable proposal",
    status: "Expired",
  },
  {
    fixture: "retracted",
    proposalId: 10,
    title: "Retracted contributor request",
    status: "Retracted",
  },
  {
    fixture: "flagged",
    proposalId: 11,
    title: "Malformed proposal",
    status: "Flagged",
  },
  {
    fixture: "early-veto",
    proposalId: 12,
    title: "Vetoed before participation",
    status: "Vetoed",
  },
  {
    fixture: "post-vote-veto",
    proposalId: 13,
    title: "Vetoed after participation began",
    status: "Vetoed",
  },
  {
    fixture: "content-unavailable",
    proposalId: 14,
    title: "Proposal #14",
    status: "Voting",
  },
  {
    fixture: "content-invalid",
    proposalId: 15,
    title: "Proposal #15",
    status: "Voting",
  },
  {
    fixture: "script-missing",
    proposalId: 16,
    title: "Proposal with unavailable script",
    status: "Voting",
  },
  {
    fixture: "partial-decode",
    proposalId: 17,
    title: "Proposal with a partially decoded script",
    status: "Approved",
  },
  {
    fixture: "script-malformed",
    proposalId: 18,
    title: "Proposal with malformed script",
    status: "Approved",
  },
  {
    fixture: "hash-mismatch",
    proposalId: 19,
    title: "Proposal with a script hash mismatch",
    status: "Approved",
  },
  {
    fixture: "direct-proposal",
    proposalId: 20,
    title: "Direct-contract proposal",
    status: "Discussion",
  },
  {
    fixture: "guarded-execution",
    proposalId: 21,
    title: "Guarded executable proposal",
    status: "Approved",
  },
  {
    fixture: "permissionless-execution",
    proposalId: 22,
    title: "Permissionless executable proposal",
    status: "Approved",
  },
] as const satisfies readonly {
  fixture: DaoMockFixtureId;
  proposalId: number;
  status: string;
  title: string;
}[];

test("keeps the deterministic account presentation consistent across shared and DAO routes", async ({
  page,
}) => {
  await page.goto("/dao");
  await waitForTestBridge(page);
  await resetBridge(page);

  await expect(page.getByText("22 proposals are available.")).toBeVisible();
  const walletIdentity = page.getByTestId("dao-wallet-presentation");
  await expect(walletIdentity).toHaveText(/0xf39f\.\.\.2266/i);
  await expect(walletIdentity).toHaveAttribute("role", "status");
  const walletIdentityBox = await walletIdentity.boundingBox();
  expect(walletIdentityBox).not.toBeNull();
  expect(walletIdentityBox!.height).toBeGreaterThanOrEqual(40);
  await expect(walletIdentity.locator("button")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect wallet" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Wallet not connected" })
  ).toHaveCount(0);

  await page.goto("/dao/proposals/2");
  await expect(page.getByText("Voting weight", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Yea" })).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Wallet not connected" })
  ).toHaveCount(0);

  await page.goto("/dao/propose");
  await expect(
    page.getByText("Your wallet can create a proposal", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Wallet not connected" })
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dao");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const mobileWalletIdentity = page.getByTestId(
    "dao-mobile-wallet-presentation"
  );
  await expect(mobileWalletIdentity).toHaveText(/0xf39f\.\.\.2266/i);
  await expect(mobileWalletIdentity).toHaveAttribute("role", "status");
  const mobileWalletIdentityBox = await mobileWalletIdentity.boundingBox();
  expect(mobileWalletIdentityBox).not.toBeNull();
  expect(mobileWalletIdentityBox!.height).toBeGreaterThanOrEqual(44);
  await expect(mobileWalletIdentity.locator("button")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect Wallet" })
  ).toHaveCount(0);
});

test("synchronizes read-only E2E wallet truth for connected, disconnected, and wrong-network states", async ({
  page,
}) => {
  await page.goto("/dao");
  await waitForTestBridge(page);
  await resetBridge(page);

  for (const [state, label, notice] of [
    ["weight", /0xf39f\.\.\.2266/i, null],
    ["disconnected", /Wallet disconnected/i, "Wallet not connected"],
    ["wrong-network", /Wrong network/i, null],
  ] as const) {
    await page.evaluate(async (accountState) => {
      await window.__TEST__?.setDaoAccountState?.(accountState);
    }, state);

    const desktop = page.getByTestId("dao-wallet-presentation");
    await expect(desktop).toHaveText(label);
    await expect(desktop).toHaveAttribute("role", "status");
    await expect(desktop.locator("button")).toHaveCount(0);
    await desktop.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (notice) {
      await expect(page.getByRole("heading", { name: notice })).toBeVisible();
    } else if (state === "weight") {
      await expect(
        page.getByRole("heading", { name: "Wallet not connected" })
      ).toHaveCount(0);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const opener = page.getByRole("button", { name: "Open navigation menu" });
    await opener.click();
    const mobile = page.getByTestId("dao-mobile-wallet-presentation");
    await expect(mobile).toHaveText(label);
    await expect(mobile).toHaveAttribute("role", "status");
    await expect(mobile.locator("button")).toHaveCount(0);
    await page.getByRole("button", { name: "Close navigation menu" }).click();
    await page.setViewportSize({ width: 1_280, height: 900 });
  }
});

test("makes the mobile menu a contained modal for every closure path", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const height of [500, 844]) {
    await page.setViewportSize({ width: 390, height });
    await page.goto("/dao");
    const opener = page.getByRole("button", { name: "Open navigation menu" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    const close = dialog.getByRole("button", { name: "Close navigation menu" });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await expect(dialog).toHaveCSS("animation-name", "none");
    await page.getByRole("button", { name: "Products" }).click();
    await expect(
      page.getByTestId("mobile-navigation-section-products")
    ).toHaveCSS("transition-duration", "0s");
    await page.getByRole("button", { name: "Products" }).click();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    expect(
      await page.evaluate(() => {
        const header = document.querySelector("header");
        return Boolean(
          header?.closest("[inert]") ||
            header?.closest('[aria-hidden="true"]')
        );
      })
    ).toBe(true);
    await expectNoDocumentOverflow(page, `mobile menu 390x${height}`);

    const focusable = dialog.locator(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const count = await focusable.count();
    await focusable.first().focus();
    await page.keyboard.press("Shift+Tab");
    await expect(focusable.nth(count - 1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(focusable.first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

    await opener.click();
    await page.getByRole("button", { name: "Close navigation menu" }).click();
    await expect(opener).toBeFocused();
  }

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("button", { name: "Products" }).click();
  await page.getByRole("link", { name: /stYFI/i }).click();
  await expect(page).toHaveURL(/\/styfi$/);
  await expect(
    page.getByRole("button", { name: "Open navigation menu" })
  ).toBeFocused();
});

for (const [range, fixtures] of [
  ["1–11", PROPOSAL_FIXTURES.slice(0, 11)],
  ["12–22", PROPOSAL_FIXTURES.slice(11)],
] as const) {
  test(`reaches deterministic proposal fixtures ${range} through the shared bridge`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dao");
    await waitForTestBridge(page);
    await resetBridge(page);

    for (const fixture of fixtures) {
      await page.goto(`/dao/proposals/${fixture.proposalId}`);
      await waitForTestBridge(page);
      await page.evaluate(async (fixtureId) => {
        await window.__TEST__?.setDaoFixture?.(fixtureId);
      }, fixture.fixture);

      const evidence = await page.evaluate(async () =>
        window.__TEST__?.getDaoState?.()
      );
      expect(evidence?.selectedFixtureId).toBe(fixture.fixture);
      expect(evidence?.selectedProposalId).toBe(fixture.proposalId.toString());

      await expect(
        page.getByRole("heading", { name: fixture.title, level: 1 })
      ).toBeVisible();
      await expect(
        page.getByText(fixture.status, { exact: true }).first()
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Your action" })
      ).toBeVisible();
      await expectNoDocumentOverflow(page, fixture.fixture);

      if (fixture.fixture === "post-vote-veto") {
        expect(evidence?.capabilities).toMatchObject({
          canVote: true,
          votePurpose: "participation_only",
        });
        await expect(
          page.getByText(/still vote to record your participation/i)
        ).toBeVisible();
      }
      if (fixture.fixture === "permissionless-execution") {
        expect(evidence?.executionGuard).toBe("permissionless");
        expect(evidence?.capabilities.canExecute).toBe(true);
        const execute = page.getByRole("button", { name: "Execute proposal" });
        await expect(execute).toBeEnabled();
        await execute.click();
        await expect(
          page.getByRole("dialog").getByText(/Any eligible connected account/i)
        ).toBeVisible();
      }
      if (fixture.fixture === "content-unavailable") {
        expect(evidence?.proposal.contentState).toBe("unavailable");
        await expect(
          page
            .getByText("Immutable content could not be retrieved", {
              exact: true,
            })
            .last()
        ).toBeVisible();
      }
      if (fixture.fixture === "hash-mismatch") {
        expect(evidence?.proposal.scriptHashVerified).toBe(false);
        await expect(
          page.getByText("Event script does not match the stored script hash")
        ).toBeVisible();
      }
    }
  });
}

test("reaches the non-visual proposal capacity fixture through the shared bridge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dao/propose");
  await waitForTestBridge(page);
  await resetBridge(page);
  await page.evaluate(async () => {
    await window.__TEST__?.setDaoFixture?.("proposal-capacity-full");
  });
  const evidence = await page.evaluate(async () =>
    window.__TEST__?.getDaoState?.()
  );

  expect(evidence?.selectedFixtureId).toBe("proposal-capacity-full");
  await expect(
    page.getByText("Proposal capacity is full.", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText("64 / 64 proposals")).toBeVisible();
  await expectNoDocumentOverflow(page, "proposal-capacity-full");

  await page.evaluate(async (timestamp) => {
    await window.__TEST__?.setNow(timestamp);
  }, DAO_MOCK_NOW + 8 * 86_400);
  const advancedEvidence = await page.evaluate(async () =>
    window.__TEST__?.getDaoState?.()
  );
  expect(advancedEvidence?.proposer.expectedVotingEpoch).toBe("202");
  expect(
    advancedEvidence?.proposer.affectedBoostEpochs.map(({ epoch }) => epoch)
  ).toEqual(["202", "203", "204", "205", "206", "207"]);
  expect(
    advancedEvidence?.proposer.affectedBoostEpochs.map(
      ({ currentProposalCount }) => currentProposalCount
    )
  ).toEqual([12, 13, 64, 15, 16, 17]);
  await expect(
    page
      .getByText("Expected voting epoch", { exact: true })
      .locator("xpath=following-sibling::dd")
  ).toHaveText("202");
  await expect(
    page
      .getByText("Affected reward epochs", { exact: true })
      .locator("xpath=following-sibling::dd")
  ).toHaveText("202–207");
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByText("Proposal capacity is full in reward epoch 204.")
  ).toBeVisible();
  await expect(page.getByText("64 / 64 proposals")).toBeVisible();
  await expect(
    page.getByText(/64-proposal limit is shared system-wide/i)
  ).toBeVisible();
});

test("keeps core review and authoring surfaces contained with a 200% root font size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_280, height: 900 });

  for (const route of ["/dao", "/dao/proposals/17", "/dao/propose"]) {
    await page.goto(route);
    await waitForTestBridge(page);
    await page.addStyleTag({
      content: "html { font-size: 200% !important; }",
    });
    await expect(page.locator("main")).toBeVisible();
    await expectNoDocumentOverflow(page, `${route} at 200% root font size`);
  }
});

test("keeps DAO status, purpose, and feedback text at AA contrast in both themes", async (
  { page },
  testInfo
) => {
  const measurements: Array<{ context: string; ratio: number }> = [];
  const measure = async (
    locator: import("@playwright/test").Locator,
    context: string
  ) => {
    const contrast = await expectTextContrast(locator, context);
    measurements.push({ context, ratio: contrast.ratio });
  };
  await page.setViewportSize({ width: 1_280, height: 900 });
  await page.goto("/dao/proposals/2");
  await waitForTestBridge(page);
  await resetBridge(page);

  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") {
      await page.getByRole("button", { name: "Switch to Dark Mode" }).click();
    }
    await measure(
      page.getByTestId("dao-proposal-status").first(),
      `${theme} voting status`
    );
    await measure(
      page.getByText("Decision vote", { exact: true }),
      `${theme} decision-purpose badge`
    );
    await measure(
      page.getByText("Event script matches the stored script hash"),
      `${theme} script integrity`
    );

    await page.goto("/dao/proposals/13");
    await page.evaluate(async () => {
      await window.__TEST__?.setDaoFixture?.("post-vote-veto");
    });
    await measure(
      page.getByText("Participation vote", { exact: true }),
      `${theme} participation-purpose badge`
    );

    await page.goto("/dao/proposals/19");
    await page.evaluate(async () => {
      await window.__TEST__?.setDaoFixture?.("hash-mismatch");
    });
    await measure(
      page.getByText("Event script does not match the stored script hash"),
      `${theme} hash-mismatch error`
    );

    await page.goto("/dao/proposals/18");
    await page.evaluate(async () => {
      await window.__TEST__?.setDaoFixture?.("script-malformed");
    });
    await measure(
      page.getByText(/The first Executor header is incomplete\./).first(),
      `${theme} script framing error`
    );

    await page.goto("/dao");
    await measure(
      page.getByText("Content unavailable · onchain record shown").first(),
      `${theme} board content warning`
    );

    await page.goto("/dao/proposals/1");
    await page.evaluate(async () => {
      await window.__TEST__?.setDaoFixture?.("discussion");
      await window.__TEST__?.setDaoRole?.("operator", true);
    });
    await page.getByText("Lifecycle actions", { exact: true }).click();
    await page.getByRole("button", { name: "Flag proposal" }).click();
    await measure(
      page.getByRole("dialog").getByText("Enter a reason.", { exact: true }),
      `${theme} moderation error`
    );
    await page.keyboard.press("Escape");

    await page.goto("/dao/proposals/4");
    await page.evaluate(async () => {
      await window.__TEST__?.setDaoFixture?.("approved-signal");
    });
    await measure(
      page.getByTestId("dao-approved-signal"),
      `${theme} approved signal`
    );

    await page.goto("/dao/propose");
    await page.getByRole("button", { name: "Start proposal" }).click();
    await measure(
      page.getByText("Proposal authoring", { exact: true }),
      `${theme} authoring eyebrow`
    );
    await measure(
      page.getByText("1", { exact: true }).first(),
      `${theme} authoring step`
    );
    await page.getByRole("button", { name: "Review proposal" }).click();
    await measure(
      page.getByText("Validate a supported Yearn forum topic before review."),
      `${theme} authoring validation error`
    );

    if (theme === "light") {
      await page.goto("/dao/proposals/2");
    }
  }
  for (const measurement of measurements) {
    testInfo.annotations.push({
      type: "contrast",
      description: `${measurement.context}: ${measurement.ratio.toFixed(2)}:1`,
    });
  }
});

async function expectNoDocumentOverflow(
  page: import("@playwright/test").Page,
  context: string
) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    widths.scrollWidth,
    `${context} should remain contained inside the viewport`
  ).toBeLessThanOrEqual(widths.clientWidth + 1);
}

async function expectTextContrast(
  locator: import("@playwright/test").Locator,
  context: string
) {
  await expect(locator).toBeVisible();
  const contrast = await locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context2d = canvas.getContext("2d", { willReadFrequently: true });
    if (!context2d) throw new Error("Canvas color parsing is unavailable.");
    const parse = (color: string) => {
      context2d.clearRect(0, 0, 1, 1);
      context2d.fillStyle = color;
      context2d.fillRect(0, 0, 1, 1);
      const channels = context2d.getImageData(0, 0, 1, 1).data;
      return {
        red: channels[0],
        green: channels[1],
        blue: channels[2],
        alpha: channels[3] / 255,
      };
    };
    const foreground = parse(getComputedStyle(element).color);
    let backgroundElement: Element | null = element;
    const backgroundLayers: ReturnType<typeof parse>[] = [];
    while (backgroundElement) {
      const candidate = parse(
        getComputedStyle(backgroundElement).backgroundColor
      );
      if (candidate.alpha > 0) backgroundLayers.push(candidate);
      backgroundElement = backgroundElement.parentElement;
    }
    const composite = (
      foregroundLayer: ReturnType<typeof parse>,
      backgroundLayer: ReturnType<typeof parse>
    ) => {
      const alpha =
        foregroundLayer.alpha +
        backgroundLayer.alpha * (1 - foregroundLayer.alpha);
      const channel = (foregroundChannel: number, backgroundChannel: number) =>
        alpha === 0
          ? 0
          : (foregroundChannel * foregroundLayer.alpha +
              backgroundChannel *
                backgroundLayer.alpha *
                (1 - foregroundLayer.alpha)) /
            alpha;
      return {
        red: channel(foregroundLayer.red, backgroundLayer.red),
        green: channel(foregroundLayer.green, backgroundLayer.green),
        blue: channel(foregroundLayer.blue, backgroundLayer.blue),
        alpha,
      };
    };
    let background = parse("rgb(255, 255, 255)");
    for (const layer of backgroundLayers.reverse()) {
      background = composite(layer, background);
    }
    const luminance = ({ red, green, blue }: typeof foreground) => {
      const convert = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * convert(red) +
        0.7152 * convert(green) +
        0.0722 * convert(blue)
      );
    };
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return {
      background,
      foreground,
      ratio:
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
    };
  });
  expect(
    contrast.ratio,
    `${context} contrast (${JSON.stringify(contrast)})`
  ).toBeGreaterThanOrEqual(4.5);
  return contrast;
}
