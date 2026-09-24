// Manual acceptance browser. Adapted from the existing dao-live wallet fixture.
// No scenario, publication, transaction, fork reset, or provider request runs automatically.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

export function installForkWallet({ account, rpc }) {
  if (location.origin !== "http://127.0.0.1:3310") return;
  const listeners = new Map();
  let connected = localStorage.getItem("dao-test-connected") === "true";
  const emit = (event, value) => listeners.get(event)?.forEach(fn => fn(value));
  const provider = {
    isMetaMask: true, isConnected: () => true,
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
    removeListener(event, fn) { listeners.get(event)?.delete(fn); },
    async request({ method, params }) {
      if (method === "eth_accounts") return connected ? [account] : [];
      if (method === "eth_requestAccounts" || method === "wallet_requestPermissions") {
        connected = true; localStorage.setItem("dao-test-connected", "true"); emit("accountsChanged", [account]);
        return method === "eth_requestAccounts" ? [account] : [{ parentCapability: "eth_accounts" }];
      }
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") {
        if (params?.[0]?.chainId !== "0x1") throw new Error("Only the disposable chain is supported.");
        return null;
      }
      if (method === "wallet_getCapabilities") return {};
      if (!method.startsWith("eth_") || /sign/i.test(method)) throw new Error("Unsupported fork wallet request.");
      const response = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }) });
      const result = await response.json();
      if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
      return result.result;
    },
  };
  Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
}

export async function retainDownload(path, bytes) {
  try { await writeFile(path, bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.ok((await readFile(path)).equals(bytes), "Download changed. Original bytes were preserved. Stop acceptance.");
  }
}

export function acceptanceForkRpc(value = process.env.DAO_FORK_RPC ?? "http://127.0.0.1:18545") {
  const url = new URL(value);
  assert.ok(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username && !url.password && value === url.origin, "Manual acceptance requires an exact loopback HTTP RPC origin.");
  return url.origin;
}

async function main() {
  assert.ok(process.argv[2], "Supply the existing acceptance session directory.");
  const directory = resolve(process.argv[2]);
  const state = JSON.parse(await readFile(join(directory, "fork/state.json"), "utf8"));
  const rpc = acceptanceForkRpc();
  const call = async method => (await (await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }), signal: AbortSignal.timeout(5000) })).json()).result;
  assert.match(await call("web3_clientVersion"), /anvil/i);
  assert.equal(await call("eth_chainId"), "0x1");
  assert.equal((await call("eth_accounts"))[0].toLowerCase(), state.accounts[0].toLowerCase());
  await runManualBrowser(directory, state.accounts[0], rpc);
}

export async function runManualBrowser(directory, account, rpc = acceptanceForkRpc()) {
  rpc = acceptanceForkRpc(rpc);
  await mkdir(join(directory, "documents"), { recursive: true, mode: 0o700 });
  const browser = await chromium.launch({ headless: false });
  const disconnected = new Promise(done => browser.on("disconnected", done));
  const close = () => void browser.close();
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  try {
    // Follow the actual window. A fixed emulated viewport can extend beyond a
    // smaller native window and make the bottom of the page unreachable.
    const context = await browser.newContext({ acceptDownloads: true, viewport: null });
    await context.addInitScript(installForkWallet, { account, rpc });
    for (const label of ["A", "C", "B"]) {
      const page = await context.newPage();
      page.on("download", async download => {
        try {
          const stream = await download.createReadStream();
          const chunks = []; for await (const chunk of stream) chunks.push(chunk);
          await retainDownload(join(directory, "documents", label + ".json"), Buffer.concat(chunks));
          console.log("Retained exact " + label + " bytes in documents/" + label + ".json");
        } catch (error) { console.error(label + ": " + error.message); process.exitCode = 1; }
      });
      await page.goto("http://127.0.0.1:3310/dao/propose#" + label, { timeout: 60_000 });
    }
    console.log("Manual tabs A, C, B ready. Connect wallet > Browser Wallet. Transactions execute immediately on the local fork.");
    console.log("Wallet RPC: " + rpc);
    console.log("Keep this browser running across the K1/K2 app restart. No real wallet or key import is needed.");
    await disconnected;
  } finally {
    process.off("SIGINT", close);
    process.off("SIGTERM", close);
    await browser.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
