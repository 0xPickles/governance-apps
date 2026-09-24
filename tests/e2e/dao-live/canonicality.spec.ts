import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import type { Address } from "viem";
import { parseDaoFeed } from "@/lib/schemas/dao-feed";
import { parseDaoDeployments } from "@/lib/clients/dao/deployment";
import { prepareDaoLiveAction, type DaoWalletContext } from "@/lib/clients/dao/writes";

test("refreshes on fork advancement, rejects canonical replacement, and submits only once", async () => {
  const directory = process.env.DAO_FORK_DIR ?? "/tmp/governance-dao-uat";
  const url = process.env.DAO_FORK_RPC ?? "http://127.0.0.1:18545";
  const parsed = new URL(url);
  expect(["127.0.0.1", "localhost", "[::1]"]).toContain(parsed.hostname);
  expect(parsed.protocol).toBe("http:");
  const request: DaoWalletContext["rpc"]["request"] = async ({ method, params }) => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }) });
    const result = await response.json() as { result?: unknown; error?: { message: string } };
    if (result.error) throw new Error(result.error.message);
    return result.result;
  };
  expect(await request({ method: "web3_clientVersion" })).toMatch(/anvil/i);
  expect(await request({ method: "eth_chainId" })).toBe("0x1");
  const fork = (...args: string[]) => JSON.parse(execFileSync(process.execPath, ["scripts/dao-fork.mjs", ...args], { encoding: "utf8" }));
  fork("reset");
  const state = fork("status");
  const account = state.accounts[0] as Address;
  await writeFile(directory + "/canonical.json", JSON.stringify({ schema: "yearn.dao.proposal.v1", markdown: "# Canonicality UAT\n\nVerify preparation invalidation.\n\n## Scope\n\nDisposable local test.\n",
    discussionUrl: "https://gov.yearn.fi/t/local-fork-uat/1234", proposalType: "signal", createdBy: account, createdAt: new Date(state.timestamp * 1000).toISOString(), assets: [] }) + "\n");
  fork("propose", directory + "/canonical.json", "signal");
  const feed = parseDaoFeed(fork("fixture"));
  const deployments = parseDaoDeployments(await readFile(directory + "/deployments.json", "utf8"));
  let sent = 0;
  const context: DaoWalletContext = { rpc: { request }, walletChainId: 1, getWallet: async () => ({ address: account, chainId: 1 }),
    send: async ({ from, to, data }) => {
      sent++;
      return await request({ method: "eth_sendTransaction", params: [{ from, to, data, gas: "0x2dc6c0" }] }) as `0x${string}`;
    } };
  const ref = { chainId: 1, votingAddress: deployments[0].votingAddress, proposalId: 0n };
  const actualNow = Date.now;
  const setClock = async () => {
    const block = await request({ method: "eth_getBlockByNumber", params: ["latest", false] }) as { timestamp: string };
    const timestamp = Number(BigInt(block.timestamp)); Date.now = () => timestamp * 1000; return timestamp;
  };
  try {
    await setClock();
    const snapshot = await request({ method: "evm_snapshot" });
    await request({ method: "evm_mine" });
    const timestamp = await setClock();
    const reorgPrepared = await prepareDaoLiveAction({ deployments, feed, ref, address: account, action: "retract", context });
    expect(await request({ method: "evm_revert", params: [snapshot] })).toBe(true);
    await request({ method: "evm_setNextBlockTimestamp", params: [timestamp + 20] });
    await request({ method: "evm_mine" });
    await expect(reorgPrepared()).rejects.toThrow("canonical block changed");
    expect(sent).toBe(0);
    await setClock();
    const prepared = await prepareDaoLiveAction({ deployments, feed, ref, address: account, action: "retract", context });
    await request({ method: "evm_mine" });
    const hash = await prepared();
    const receipt = await request({ method: "eth_getTransactionReceipt", params: [hash] }) as { status: string };
    expect(receipt.status).toBe("0x1");
    expect(sent).toBe(1);
    await expect(prepared()).rejects.toThrow("already submitted");
    expect(sent).toBe(1);
  } finally { Date.now = actualNow; }
});
