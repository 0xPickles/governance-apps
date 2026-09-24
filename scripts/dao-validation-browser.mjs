// Visible local browser; wallet injection exists only at the local validation origin.
import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { installForkWallet } from "./dao-pinata-browser.mjs";
import { session } from "./dao-validation.mjs";
import { verifyFork, forkRequest } from "./dao-local-validation-config.mjs";

export async function openValidationBrowser(directory, { headless = false, persistent = true } = {}) {
  const s = await session(directory);
  const rpc = s.env.DAO_FORK_RPC;
  await verifyFork(rpc, s.manifest.identity);
  const state = JSON.parse(await readFile(join(directory, "fork/state.json"), "utf8"));
  const controlPath = join(directory, "browser-control.json");
  const control = JSON.parse(await readFile(controlPath, "utf8"));
  assert.ok(state.accounts[control.account]);
  const browser = persistent ? null : await chromium.launch({ headless });
  const context = persistent ? await chromium.launchPersistentContext(join(directory, "browser-profile"), { headless, viewport: null, acceptDownloads: true }) :
    await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.addInitScript(installForkWallet, { account: state.accounts[control.account], rpc, identity: s.manifest.identity });
  let current = control;
  await context.route("http://127.0.0.1:3310/api/dao-data", async route => {
    if (current.feed === "producer") return route.continue();
    if (current.feed === "unavailable") return route.fulfill({ status: 503, body: "Local display fixture: unavailable feed" });
    const feed = JSON.parse(await readFile(join(directory, "fork/feed.json"), "utf8"));
    if (current.feed === "empty-fixture") {
      feed.proposals = []; feed.deployments.forEach(deployment => { deployment.proposalCount = "0"; });
    } else if (current.feed === "content-fixture") feed.proposals.forEach(proposal => { proposal.contentBytes = null; });
    else throw new Error("Unknown display fixture.");
    console.log("DISPLAY FIXTURE: " + current.feed + ". Not producer interoperability evidence.");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(feed) });
  });
  await context.route(rpc + "/", async route => {
    if (current.rpcOffline) return route.abort("connectionfailed");
    if (current.rpcDelayMs) await new Promise(done => setTimeout(done, Math.min(30000, Math.max(0, current.rpcDelayMs))));
    return route.continue();
  });
  const configured = new WeakSet();
  const viewports = new WeakMap();
  const configure = async page => {
    if (configured.has(page)) return;
    configured.add(page);
    viewports.set(page, "desktop");
    page.on("download", async download => {
      try { await download.saveAs(join(directory, "documents", Date.now() + "-" + download.suggestedFilename())); }
      catch (error) { console.error("Download could not be retained: " + error.message); }
    });
    const block = await forkRequest(rpc, "eth_getBlockByNumber", ["latest", false]);
    await page.clock.setFixedTime(new Date(Number(BigInt(block.timestamp)) * 1000));
  };
  context.on("page", page => void configure(page));
  const page = context.pages()[0] ?? await context.newPage();
  try {
    await configure(page);
    await page.goto("http://127.0.0.1:3310/dao", { timeout: 30_000 });
  } catch (error) { await context.close(); await browser?.close(); throw error; }
  let polling = false;
  const timer = setInterval(async () => {
    if (polling) return; polling = true;
    try {
      current = JSON.parse(await readFile(controlPath, "utf8"));
      assert.ok(state.accounts[current.account]);
      const block = await forkRequest(rpc, "eth_getBlockByNumber", ["latest", false]);
      const feed = JSON.parse(await readFile(join(directory, "fork/feed.json"), "utf8"));
      const clock = Math.max(Number(BigInt(block.timestamp)), feed.observedAt) + (current.clock === "stale" ? 3600 : 0);
      for (const page of context.pages()) {
        if (new URL(page.url()).origin !== "http://127.0.0.1:3310") continue;
        await page.clock.setFixedTime(new Date(clock * 1000));
        if (viewports.get(page) !== current.viewport) {
          if (current.viewport === "mobile") await page.setViewportSize({ width: 390, height: 844 });
          else if (persistent) {
            const cdp = await context.newCDPSession(page);
            await cdp.send("Emulation.clearDeviceMetricsOverride"); await cdp.detach();
          } else await page.setViewportSize({ width: 1280, height: 900 });
          viewports.set(page, current.viewport);
        }
        await page.evaluate(({ account, reject }) => {
          const c = window.daoLocalWalletControl;
          if (!c) return;
          if (c.account !== account) { c.account = account; c.changeAccount(account); }
          if (reject) c.rejectNext = true;
        }, { account: state.accounts[current.account], reject: current.rejectNext });
      }
      if (current.rejectNext) { current.rejectNext = false; await writeFile(controlPath, JSON.stringify(current, null, 2) + "\n"); }
    } catch (error) { console.error("Browser control: " + error.message); }
    finally { polling = false; }
  }, 1000);
  const close = async () => { clearInterval(timer); await context.close(); await browser?.close(); };
  context.on("close", () => { clearInterval(timer); void browser?.close(); });
  return { s, context, page, close };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2]);
  const { context, close } = await openValidationBrowser(directory);
  const ready = join(directory, "browser-ready.json");
  await writeFile(ready, JSON.stringify({ pid: process.pid }));
  process.on("SIGTERM", () => void close()); process.on("SIGINT", () => void close());
  await new Promise(done => context.on("close", done));
  await rm(ready, { force: true });
}
