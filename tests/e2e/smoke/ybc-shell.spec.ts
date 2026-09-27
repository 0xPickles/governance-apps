import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  resetBridge,
  setYbcEmptyBoard,
  setYbcPerspective,
  waitForTestBridge,
} from "../utils";

test("renders the YBC overview and operator panel states", async ({ page }) => {
  await page.goto("/ybc");
  await waitForTestBridge(page);
  await resetBridge(page);

  await expect(
    page.getByRole("heading", { name: "Yearn Builder's Collective", level: 1 })
  ).toBeVisible();
  await expect(page.getByText("/ybc")).toHaveCount(0);
  await expect(page.getByText("Accepted shell map")).toHaveCount(0);
  await expect(page.getByText("Mock interactions")).toHaveCount(0);
  await expect(page.getByText("Mock MVP scope")).toHaveCount(0);
  await expect(page.getByText("Total collective voting power", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Observer view", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Proposal Board", level: 2 })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Raw staked" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Effective weight" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Target weight" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Snapshot|off[ -]?chain voting|stYFIx delegation|delegation (?:gained|lost)/i,
  );
  await page.getByRole("button", { name: /Cards/i }).click();
  await expect(page.getByRole("table")).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Proposal Board", level: 2 })).toBeVisible();

  await expect(
    page.getByRole("heading", {
      name: "Rewards",
      exact: true,
      level: 2,
    })
  ).toBeVisible();
  await expect(
    page.getByText("Connect a member wallet to view YBC rewards")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Shared rewards unavailable" })
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Operator Panel", level: 2 })
  ).toHaveCount(0);

  await setYbcPerspective(page, "operator");

  await expect(
    page.getByRole("heading", { name: "Operators and management" })
  ).toBeVisible();
  await expect(page.getByText("Governance hooks")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start add member flow" })).toBeVisible();

  await setYbcEmptyBoard(page, true);
  await expect(page.getByText("No proposal history")).toBeVisible();
});

test("opens proposal links from Telegram and cleans invalid proposal ids", async ({
  page,
}) => {
  await page.goto("/ybc?proposal=2#proposals");
  await waitForTestBridge(page);

  const focused = page.locator('[id="ybc-proposal-YBC-2"]');
  await expect(focused).toBeVisible();
  await expect(focused).toHaveAttribute("data-focused", "true");
  await expect(focused.locator("details")).toHaveAttribute("open", "");

  await page.goto("/ybc?proposal=3#proposals");
  await expect(page.locator('[id="ybc-proposal-YBC-3"]')).toHaveAttribute(
    "data-focused",
    "true"
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/ybc\?proposal=2#proposals$/);
  await expect(focused).toHaveAttribute("data-focused", "true");
  await page.goForward();
  await expect(page).toHaveURL(/\/ybc\?proposal=3#proposals$/);
  await expect(page.locator('[id="ybc-proposal-YBC-3"]')).toHaveAttribute(
    "data-focused",
    "true"
  );

  await page.goto("/ybc?keep=yes&proposal=999999#proposals");
  await expect(page).toHaveURL(/\/ybc\?keep=yes#proposals$/);

  await page.goto("/ybc?keep=yes&proposal=invalid#overview");
  await expect(page).toHaveURL(/\/ybc\?keep=yes#proposals$/);

  await page.goto("/ybc?keep=yes&proposal=999999");
  await expect(page).toHaveURL(/\/ybc\?keep=yes#proposals$/);
});

test("contains YBC identity and timestamp layouts at 360px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/ybc");
  await waitForTestBridge(page);
  await resetBridge(page);

  const members = page.locator("#members");
  const proposals = page.locator("#proposals");
  const statusTimestamp = page.locator('main > [role="status"] time');
  const memberAddress = "0x1111111111111111111111111111111111111111";
  const longEnsName = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(
    63
  )}.${"d".repeat(59)}.eth`;
  await page.evaluate(
    async ({ address, ens }) => {
      await window.__TEST__?.patchYbcMember?.(address, { ens });
    },
    {
      address: memberAddress,
      ens: longEnsName,
    }
  );

  await expect(members).toBeVisible();
  await expect(proposals).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(statusTimestamp).toBeVisible();
  await expect(page.getByText(longEnsName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("ENS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Generated", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Local", { exact: true })).toHaveCount(0);
  await expectNoDocumentOverflow(page);
  await expectWithinViewport(members, 360);
  await expectWithinViewport(proposals, 360);
  await expectWithinViewport(statusTimestamp, 360);

  await page.getByRole("button", { name: /Cards/i }).click();

  await expect(page.getByRole("table")).toHaveCount(0);
  const editNameButton = page
    .getByRole("button", { name: /^Edit name:/i })
    .first();
  await expect(editNameButton).toBeVisible();
  await expect(editNameButton).toHaveAttribute("title", "Edit name");
  await expect(editNameButton).toHaveClass(/group\/name/);
  await expect(editNameButton).toHaveClass(/min-h-10/);
  const editNameIcon = editNameButton.locator("svg");
  await expect(editNameIcon).toHaveClass(/text-text-tertiary/);
  await expect(editNameIcon).toHaveClass(/opacity-0/);
  await expect(editNameIcon).toHaveClass(/transition-opacity/);
  await expect(editNameIcon).not.toHaveClass(/blur-/);
  await expect(editNameIcon).not.toHaveClass(/scale-/);
  await expect(editNameIcon).toHaveClass(/group-hover\/name:opacity-100/);
  await expect(editNameIcon).toHaveClass(/group-focus-visible\/name:opacity-100/);
  await expect(editNameIcon).toHaveCSS("opacity", "0");
  await editNameButton.hover();
  await expect(editNameIcon).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(editNameIcon).toHaveCSS("opacity", "0");
  const editNameButtonBox = await editNameButton.boundingBox();
  expect(editNameButtonBox).not.toBeNull();
  expect(editNameButtonBox!.width).toBeGreaterThanOrEqual(40);
  expect(editNameButtonBox!.height).toBeGreaterThanOrEqual(40);
  await expect(
    page.getByRole("link", {
      name: `View Ethereum address ${memberAddress} on Etherscan`,
    }).first()
  ).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectWithinViewport(members, 360);
  await expectWithinViewport(proposals, 360);
  await expectWithinViewport(statusTimestamp, 360);
});

test.describe("touch identity controls", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 360, height: 900 },
  });

  test("keeps the compact member address as the tap target", async ({
    page,
  }) => {
    const memberAddress = "0x1111111111111111111111111111111111111111";

    await page.goto("/ybc");
    await waitForTestBridge(page);
    await resetBridge(page);

    expect(
      await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)
    ).toBe(true);

    const addressLink = page
      .locator("#members")
      .getByRole("link", {
        name: `View Ethereum address ${memberAddress} on Etherscan`,
      })
      .first();
    await expect(addressLink).toBeVisible();
    await expect(addressLink).toHaveAttribute(
      "href",
      `https://etherscan.io/address/${memberAddress}`
    );

    const addressBox = await addressLink.boundingBox();
    expect(addressBox).not.toBeNull();
    expect(addressBox!.height).toBeGreaterThanOrEqual(40);

    const explorerControl = addressLink.locator("..");
    await expect(
      explorerControl.getByRole("button", { name: "Copy address" })
    ).toBeHidden();

    await addressLink.evaluate((element) => {
      element.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          element.setAttribute("data-tap-observed", "true");
        },
        { once: true }
      );
    });
    await addressLink.tap();
    await expect(addressLink).toHaveAttribute("data-tap-observed", "true");
  });
});

async function expectNoDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

async function expectWithinViewport(locator: Locator, viewportWidth: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
}
