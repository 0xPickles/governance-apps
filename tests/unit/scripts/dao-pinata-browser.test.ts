import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { acceptanceForkRpc, installForkWallet, retainDownload, runManualBrowser } from "@/scripts/dao-pinata-browser.mjs";

describe("manual browser startup", () => {
  it.each([18545, 18547])("uses the selected local fork on %s and closes Chromium after a navigation timeout", async port => {
    const directory = await mkdtemp(join(tmpdir(), "dao-manual-startup-"));
    const close = vi.fn(async () => {});
    const goto = vi.fn(async () => { throw new Error("Navigation timed out"); });
    const context = { addInitScript: vi.fn(), newPage: vi.fn(async () => ({ on: vi.fn(), goto })) };
    const browser = { on: vi.fn(), newContext: vi.fn(async () => context), close };
    const launch = vi.spyOn(chromium, "launch").mockResolvedValue(browser as unknown as Awaited<ReturnType<typeof chromium.launch>>);
    const sigint = process.listenerCount("SIGINT");
    const sigterm = process.listenerCount("SIGTERM");
    try {
      await expect(runManualBrowser(directory, "0xlocal", "http://127.0.0.1:" + port)).rejects.toThrow("Navigation timed out");
      expect(context.addInitScript).toHaveBeenCalledWith(installForkWallet, { account: "0xlocal", rpc: "http://127.0.0.1:" + port });
      expect(goto).toHaveBeenCalledExactlyOnceWith("http://127.0.0.1:3310/dao/propose#A", { timeout: 60_000 });
      expect(close).toHaveBeenCalledOnce();
      expect(process.listenerCount("SIGINT")).toBe(sigint);
      expect(process.listenerCount("SIGTERM")).toBe(sigterm);
    } finally {
      launch.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("manual acceptance downloads", () => {
  it("preserves the first exact bytes and rejects a changed retry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dao-manual-download-"));
    const path = join(directory, "B.json");
    try {
      const bytes = Buffer.from('{"markdown":"unchanged"}\n');
      await retainDownload(path, bytes);
      await retainDownload(path, bytes);
      await expect(retainDownload(path, Buffer.from('{"markdown":"edited"}\n'))).rejects.toThrow("Original bytes were preserved");
      expect(await readFile(path)).toEqual(bytes);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe("manual fork wallet", () => {
  it("rejects non-local, credential-bearing, and ambiguous fork URLs", () => {
    for (const url of ["https://127.0.0.1:18547", "http://example.com", "http://key@127.0.0.1:18547", "http://127.0.0.1:18547/path", "http://127.0.0.1:18547?rpc=x"]) {
      expect(() => acceptanceForkRpc(url)).toThrow();
    }
    expect(acceptanceForkRpc("http://127.0.0.1:18547")).toBe("http://127.0.0.1:18547");
  });
  it("makes no automatic request and forwards operator transactions only to the local RPC", async () => {
    const browserWindow: { ethereum?: { request: (request: { method: string; params?: unknown[] }) => Promise<unknown> } } = {};
    const fetch = vi.fn(async () => ({ json: async () => ({ result: "0xreceipt" }) }));
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("location", { origin: "http://127.0.0.1:3310" });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal("fetch", fetch);
    try {
      installForkWallet({ account: "0xlocal", rpc: "http://127.0.0.1:18545" });
      expect(fetch).not.toHaveBeenCalled();
      const wallet = browserWindow.ethereum!;
      expect(await wallet.request({ method: "eth_requestAccounts" })).toEqual(["0xlocal"]);
      expect(fetch).not.toHaveBeenCalled();
      await expect(wallet.request({ method: "personal_sign" })).rejects.toThrow("Unsupported");
      await expect(wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa" }] })).rejects.toThrow("Only the disposable");
      await wallet.request({ method: "eth_sendTransaction", params: [{ from: "0xlocal" }] });
      expect(fetch).toHaveBeenCalledExactlyOnceWith("http://127.0.0.1:18545", expect.objectContaining({ method: "POST" }));
    } finally { vi.unstubAllGlobals(); }
  });

  it("does not expose the wallet on an external page", () => {
    const browserWindow = {};
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("location", { origin: "https://gov.yearn.fi" });
    try {
      installForkWallet({ account: "0xlocal", rpc: "http://127.0.0.1:18545" });
      expect(browserWindow).not.toHaveProperty("ethereum");
    } finally { vi.unstubAllGlobals(); }
  });
});
