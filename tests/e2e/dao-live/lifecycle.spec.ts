import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

test.use({ actionTimeout: 15_000 });
const directory = process.env.DAO_FORK_DIR ?? "/tmp/governance-dao-uat";
const rpc = process.env.DAO_FORK_RPC ?? "http://127.0.0.1:18545";
type ForkState = { timestamp: number; marker: string; accounts: string[]; script: string; deployment: { votingAddress: string }; proposals: Record<string, { scriptBytes: string; events: unknown[] }> };
function fork(command: string, ...args: string[]): ForkState {
  return JSON.parse(execFileSync(process.execPath, ["scripts/dao-fork.mjs", command, ...args], { encoding: "utf8" }));
}
declare global {
  interface Window {
    daoTestWallet: { hashes: string[]; reject: boolean; chainId: string; emit: (event: string, value: unknown) => void };
  }
}
async function wallet(page: Page, account: string) {
  await page.addInitScript(({ account, rpc }) => {
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    let connected = localStorage.getItem("dao-test-connected") === "true";
    const control = { hashes: [] as string[], reject: false, chainId: "0x1",
      emit: (event: string, value: unknown) => listeners.get(event)?.forEach(fn => fn(value)) };
    window.daoTestWallet = control;
    const provider = {
      isMetaMask: true, isConnected: () => true,
      on(event: string, fn: (value: unknown) => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn); },
      removeListener(event: string, fn: (value: unknown) => void) { listeners.get(event)?.delete(fn); },
      async request({ method, params }: { method: string; params?: unknown[] }) {
        if (method === "eth_accounts") return connected ? [account] : [];
        if (method === "eth_requestAccounts" || method === "wallet_requestPermissions") { connected = true; localStorage.setItem("dao-test-connected", "true"); control.emit("accountsChanged", [account]); return method === "eth_requestAccounts" ? [account] : [{ parentCapability: "eth_accounts" }]; }
        if (method === "eth_chainId") return control.chainId;
        if (method === "wallet_switchEthereumChain") { control.chainId = "0x1"; control.emit("chainChanged", "0x1"); return null; }
        if (method === "wallet_getCapabilities") return {};
        if (method === "eth_sendTransaction" && control.reject) { control.reject = false; throw Object.assign(new Error("User rejected the request."), { code: 4001 }); }
        const response = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }) });
        const result = await response.json() as { result?: unknown; error?: { message: string; code: number } };
        if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
        if (method === "eth_sendTransaction" && typeof result.result === "string") control.hashes.push(result.result);
        return result.result;
      },
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
  }, { account, rpc });
}
async function connect(page: Page) {
  await page.getByRole("button", { name: /^Connect wallet$/i }).first().click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Browser Wallet", exact: true }).first().click();
}
async function clock(page: Page) { const state = fork("mine"); await page.clock.setFixedTime(new Date(state.timestamp * 1000)); }
async function detail(page: Page) {
  const state = fork("status");
  await page.goto("/dao/proposals/0?chain=1&voting=" + state.deployment.votingAddress);
}
async function lastHash(page: Page, count = 1) {
  await expect.poll(() => page.evaluate(() => window.daoTestWallet.hashes.length)).toBe(count);
  return page.evaluate(() => window.daoTestWallet.hashes.at(-1)!);
}
test.beforeEach(async ({ page }) => {
  fork("reset");
  const state = fork("status");
  await wallet(page, state.accounts[0]);
  await clock(page);
});
test("publishes exact bytes, creates ID zero, recovers feed lag, votes and executes through the connected wallet", async ({ page, request }) => {
  test.setTimeout(180_000);
  const state = fork("status");
  await page.goto("/dao/propose");
  await connect(page);
  await expect(page.getByRole("button", { name: "Start proposal", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start proposal", exact: true }).click();
  await page.getByRole("textbox", { name: "Forum discussion", exact: true }).fill("https://gov.yearn.fi/t/local-fork-uat/1234");
  await page.getByRole("button", { name: "Validate topic", exact: true }).click();
  await expect(page.getByText("Forum topic accepted", { exact: true }).last()).toBeVisible();
  await page.getByLabel("Proposal Markdown").fill("# Local execution UAT\n\nVerify the deployed governance contracts on a disposable fork.\n\n## Execution\n\nSet the local marker to 42.\n");
  await page.getByRole("radio", { name: /Executable/ }).check();
  await page.getByLabel("Full Executor script").fill(state.script);
  await page.getByRole("button", { name: "Review proposal", exact: true }).click();
  await page.getByRole("checkbox", { name: /I reviewed/ }).check();
  // The real route performs public durable admission. No grant or publication wallet signature.
  // Corrupt one transport body to exercise actual route rejection while preserving the editor review.
  await page.route("**/api/dao-content", route => route.continue({ postData: "invalid canonical bytes" }), { times: 1 });
  await page.getByRole("button", { name: "Publish immutable content", exact: true }).click();
  await expect(page.getByText("Proposal content was not published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create onchain proposal", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.daoTestWallet.hashes)).toEqual([]);
  await page.getByRole("button", { name: "Retry content publication", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Immutable content published", exact: true })).toBeVisible();
  await page.evaluate(() => { window.daoTestWallet.reject = true; });
  await page.getByRole("button", { name: "Create onchain proposal", exact: true }).click();
  await expect(page.getByText("Wallet request cancelled", { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(key => key.startsWith("yearn.dao.live.authoring"))!)!));
  const bytes = Buffer.from(JSON.stringify(stored.content) + "\n");
  await writeFile(directory + "/ui-content.json", bytes);
  const retrieved = await request.get("/api/dao-content?digest=" + stored.digest);
  expect(retrieved.ok()).toBe(true); expect(await retrieved.body()).toEqual(bytes);
  await page.getByRole("button", { name: "Retry proposal creation", exact: true }).click();
  const hash = await lastHash(page);
  await expect(page.getByRole("heading", { name: /Proposal (confirmed|indexing)/ }).first()).toBeVisible();
  fork("record", hash, directory + "/ui-content.json");
  // Keep the old saved feed deliberately. A reload must retain the one receipt/hash.
  await page.reload();
  await page.getByRole("button", { name: /Draft proposal|Start proposal/, exact: true }).click();
  await expect(page.getByRole("link", { name: "Open proposal", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Create onchain proposal|Retry proposal creation)$/ })).toHaveCount(0);
  expect(Object.keys(fork("status").proposals)).toEqual(["0"]);
  await page.getByRole("link", { name: "Open proposal", exact: true }).click();
  await expect(page.getByText(/saved transaction is awaiting proposal indexing/i).first()).toBeVisible();
  fork("phase", "vote", "0");
  await clock(page);
  fork("fixture");
  await detail(page);
  await page.getByRole("radio", { name: "Yea", exact: true }).check();
  await page.getByRole("button", { name: "Review vote", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Vote Yea", exact: true }).click();
  const vote = await lastHash(page); // Wallet control is new after the reload.
  fork("record", vote);
  const voted = fork("fixture") as unknown as { proposals: Array<{ votes: string; yea: string }> };
  expect(BigInt(voted.proposals[0].votes)).toBeGreaterThan(0n);
  expect(voted.proposals[0].yea).toBe(voted.proposals[0].votes);
  fork("phase", "execute", "0");
  await clock(page); fork("fixture"); await detail(page);
  await page.getByRole("button", { name: "Execute proposal", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Execute proposal", exact: true }).click();
  const execution = await lastHash(page);
  fork("record", execution);
  expect(fork("status").marker).toBe("42");
  const executed = fork("fixture") as unknown as { proposals: Array<{ executed: boolean }> };
  expect(executed.proposals[0].executed).toBe(true);
  await page.screenshot({ path: directory + "/live-execution.png", fullPage: true });
});
for (const action of ["retract", "flag", "veto"] as const) {
  test("submits " + action + " for a signal through the UI", async ({ page }) => {
    const state = fork("status");
    const content = { schema: "yearn.dao.proposal.v1", markdown: "# Signal UAT\n\nExercise the signal lifecycle.\n\n## Scope\n\nDisposable local test.\n",
      discussionUrl: "https://gov.yearn.fi/t/local-fork-uat/1234", proposalType: "signal", createdBy: state.accounts[0], createdAt: new Date(state.timestamp * 1000).toISOString(), assets: [] };
    await writeFile(directory + "/signal.json", JSON.stringify(content) + "\n");
    fork("propose", directory + "/signal.json", "signal");
    await clock(page); fork("fixture");
    await detail(page); await connect(page);
    await page.locator("summary").filter({ hasText: "Lifecycle actions" }).click();
    const labels = { retract: "Retract proposal", flag: "Flag proposal", veto: "Veto proposal" };
    await page.getByRole("button", { name: labels[action], exact: true }).click();
    const dialog = page.getByRole("dialog");
    if (action !== "retract") await dialog.getByRole("textbox").fill("Disposable local UAT moderation.");
    await dialog.getByRole("button", { name: labels[action], exact: true }).click();
    fork("record", await lastHash(page));
    const feed = fork("fixture") as unknown as { proposals: Array<Record<string, unknown>> };
    expect(feed.proposals[0][{ retract: "retracted", flag: "flagged", veto: "vetoed" }[action]]).toBe(true);
    expect(feed.proposals[0].scriptBytes).toBe("0x");
    expect(feed.proposals[0].retracted).toBe(true);
  });
}
test("asserts replacement contributions in deployed Voting and retains only saved-fixture evidence", async ({ page }) => {
  const state = fork("status");
  await writeFile(directory + "/signal.json", JSON.stringify({ schema: "yearn.dao.proposal.v1", markdown: "# Replacement UAT\n\nTest aggregate vote replacement.\n\n## Scope\n\nLocal test.\n",
    discussionUrl: "https://gov.yearn.fi/t/local-fork-uat/1234", proposalType: "signal", createdBy: state.accounts[0], createdAt: new Date(state.timestamp * 1000).toISOString(), assets: [] }) + "\n");
  fork("propose", directory + "/signal.json", "signal"); fork("phase", "vote", "0");
  fork("replace", "0", "10000");
  const first = JSON.parse(await readFile(directory + "/state.json", "utf8"));
  fork("replace", "0", "0");
  const feed = fork("fixture") as unknown as { proposals: Array<{ votes: string; yea: string; events: Array<{ type: string }> }> };
  expect(feed.proposals[0].votes).toBe("1000000000000000000000000");
  expect(feed.proposals[0].yea).toBe("0");
  expect(feed.proposals[0].events.filter(e => e.type === "vote")).toHaveLength(2);
  expect(first.proposals["0"].events).toHaveLength(2);
  fork("replace", "0", "0", "0");
  const zero = fork("fixture") as unknown as { proposals: Array<{ votes: string; yea: string }> };
  expect(zero.proposals[0].votes).toBe("0"); expect(zero.proposals[0].yea).toBe("0");
  fork("replace", "0", "10000");
  fork("veto", "0");
  const veto = fork("fixture") as unknown as { proposals: Array<{ vetoed: boolean; retracted: boolean }> };
  expect(veto.proposals[0].vetoed).toBe(true); expect(veto.proposals[0].retracted).toBe(false);
  fork("replace", "0", "0", "0");
  const afterVeto = fork("fixture") as unknown as { proposals: Array<{ votes: string; vetoed: boolean; retracted: boolean }> };
  expect(afterVeto.proposals[0].votes).toBe("0");
  expect(afterVeto.proposals[0].vetoed).toBe(true); expect(afterVeto.proposals[0].retracted).toBe(false);
  await clock(page); await detail(page);
  await expect(page.getByText("Replacement UAT", { exact: true }).first()).toBeVisible();
});

test("blocks wrong-network and reverted execution while preserving the actual contract state", async ({ page }) => {
  test.setTimeout(120_000);
  const state = fork("status");
  const bytes = Buffer.from(JSON.stringify({ schema: "yearn.dao.proposal.v1", markdown: "# Reverting execution\n\nExercise a failed downstream call.\n\n## Scope\n\nDisposable local test.\n",
    discussionUrl: "https://gov.yearn.fi/t/local-fork-uat/1234", proposalType: "executable", createdBy: state.accounts[0], createdAt: new Date(state.timestamp * 1000).toISOString(), assets: [] }) + "\n");
  await writeFile(directory + "/reverting.json", bytes);
  await writeFile(directory + "/reverting.hex", state.script.replace("2c16cd8a", "ffffffff"));
  fork("propose", directory + "/reverting.json", directory + "/reverting.hex");
  fork("phase", "vote", "0"); fork("vote", "0"); fork("phase", "execute", "0");
  await clock(page); fork("fixture");
  await detail(page); await connect(page);
  const execute = page.getByRole("button", { name: "Execute proposal", exact: true });
  await expect(execute).toBeDisabled();
  await expect(page.getByText("The fresh execution simulation failed.", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.daoTestWallet.chainId = "0xa"; window.daoTestWallet.emit("chainChanged", "0xa"); });
  await expect(page.getByText(/eligibility.*unavailable|could not.*eligibility/i).first()).toBeVisible();
  expect(await page.evaluate(() => window.daoTestWallet.hashes)).toEqual([]);
  const result = fork("expect-execute-revert", "0") as unknown as { status: string };
  expect(result.status).toBe("reverted");
  expect(fork("status").marker).toBe("0");
});
