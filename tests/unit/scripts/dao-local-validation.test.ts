import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanEnvironment, localAppEnvironment, loopbackOrigin, requireCleanSource, verifyFork, verifyProducer } from "@/scripts/dao-local-validation-config.mjs";
import { installForkWallet } from "@/scripts/dao-pinata-browser.mjs";

afterEach(() => vi.unstubAllGlobals());
describe("isolated built validation", () => {
  it("rejects remote, credential-bearing and ambiguous local origins", () => {
    for (const url of ["https://127.0.0.1", "http://example.com", "http://key@localhost:18545", "http://localhost/path", "http://localhost?key=x"]) {
      expect(() => loopbackOrigin(url)).toThrow();
    }
  });
  it("does not inherit secrets and makes local substitutions explicit", () => {
    process.env.DAO_PINATA_JWT = "private-test-value";
    try {
      const env = localAppEnvironment(cleanEnvironment("/tmp/local-home"), []);
      expect(env.DAO_PINATA_JWT).toBe("");
      expect(env).toMatchObject({ NODE_ENV: "production", NEXT_PUBLIC_RUNTIME_MODE: "development", NEXT_PUBLIC_USE_MOCKS: "false",
        NEXT_PUBLIC_E2E: "false", NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK: "false", DAO_UAT_PROVIDER: "offline" });
      expect(env.DAO_DATA_URL).toBe("http://127.0.0.1:18546/dao.json");
    } finally { delete process.env.DAO_PINATA_JWT; }
  });
  it("refuses private environment files and an unapproved producer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dao-build-config-"));
    try {
      await writeFile(join(directory, ".env.local"), "dummy");
      await expect(requireCleanSource(directory)).rejects.toThrow("isolated source");
      await expect(verifyProducer(join(directory, ".env.local"))).rejects.toThrow("hash differs");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("refuses a different canonical fork checkpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => ({ ok: true, json: async () => ({ result:
      JSON.parse(init.body).method === "web3_clientVersion" ? "anvil/v1" :
      JSON.parse(init.body).method === "eth_chainId" ? "0x1" : { hash: "0xother" } }) })));
    await expect(verifyFork("http://127.0.0.1:18545", { number: "0x1", hash: "0xselected" })).rejects.toThrow("checkpoint differs");
  });
  it("checks Anvil identity before sending a wallet transaction", async () => {
    const window: { ethereum?: { request: (request: unknown) => Promise<unknown> } } = {};
    vi.stubGlobal("window", window);
    vi.stubGlobal("location", { origin: "http://127.0.0.1:3310" });
    vi.stubGlobal("localStorage", { getItem: () => null });
    const fetch = vi.fn(async () => ({ json: async () => ({ result: "Geth" }) }));
    vi.stubGlobal("fetch", fetch);
    installForkWallet({ account: "0xlocal", rpc: "http://127.0.0.1:18545" });
    await expect(window.ethereum!.request({ method: "eth_sendTransaction", params: [{ from: "0xlocal" }] })).rejects.toThrow("Only Anvil");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
