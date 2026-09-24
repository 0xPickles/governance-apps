// Representative checkpoint, not the complete interactive walkthrough.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect } from "@playwright/test";
import { createPublicClient, http, parseAbi, decodeEventLog, keccak256, sha256 } from "viem";
import { openValidationBrowser } from "./dao-validation-browser.mjs";
import { refresh } from "./dao-validation.mjs";

const directory = resolve(process.argv[2]);
const { s, page, close } = await openValidationBrowser(directory, { headless: true, persistent: false });
try {
  const state = JSON.parse(await readFile(join(directory, "fork/state.json"), "utf8"));
  await page.goto("http://127.0.0.1:3310/dao/propose");
  await page.getByRole("button", { name: /^Connect wallet$/i }).first().click();
  await page.getByRole("button", { name: "Browser Wallet", exact: true }).first().click();
  await page.getByRole("button", { name: "Start proposal", exact: true }).click();
  await page.getByRole("textbox", { name: "Forum discussion", exact: true }).fill("https://gov.yearn.fi/t/local-fork-uat/1234");
  await page.getByRole("button", { name: "Validate topic", exact: true }).click();
  await expect(page.getByText("Forum topic accepted", { exact: true }).last()).toBeVisible();
  await page.getByLabel("Proposal Markdown").fill("# Built application checkpoint\n\nVerify publication and the released producer on the local fork.\n\n## Execution\n\nSet the disposable marker to 42.\n");
  await page.getByRole("radio", { name: /Executable/ }).check();
  await page.getByLabel("Full Executor script").fill(state.script);
  await page.getByRole("button", { name: "Review proposal", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download exact content" }).click();
  const bytes = await readFile(await (await download).path());
  await writeFile(join(directory, "documents/smoke-content.json"), bytes);
  await page.getByRole("checkbox", { name: /I reviewed/ }).check();
  await page.getByRole("button", { name: "Publish immutable content", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Immutable content published", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Create onchain proposal", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.daoLocalWalletControl.hashes.length), { timeout: 30_000 }).toBe(1);
  const hash = await page.evaluate(() => window.daoLocalWalletControl.hashes[0]);
  const client = createPublicClient({ transport: http(s.env.DAO_FORK_RPC) });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 30_000 });
  assert.equal(receipt.status, "success");
  const abi = parseAbi(["event Propose(uint256 indexed idx,address indexed proposer,uint256 indexed epoch,bytes32 ipfs,bytes script)"]);
  const log = receipt.logs.find(log => log.address.toLowerCase() === state.deployment.votingAddress);
  const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
  assert.equal(event.args.ipfs, sha256(bytes));
  assert.equal(event.args.script, state.script);
  const feed = await refresh(s);
  const proposal = feed.proposals.find(p => p.id === String(event.args.idx));
  assert.ok(proposal);
  assert.equal(proposal.proposer, event.args.proposer.toLowerCase());
  assert.equal(proposal.contentDigest, sha256(bytes));
  assert.equal(proposal.scriptHash, keccak256(state.script));
  assert.equal(proposal.scriptBytes, state.script);
  assert.deepEqual(Buffer.from(proposal.contentBytes, "base64"), bytes);
  assert.ok(proposal.events.some(e => e.type === "propose" && e.log.transactionHash === hash && e.log.blockHash === receipt.blockHash && e.log.logIndex === log.logIndex));
  const route = "http://127.0.0.1:3310/dao/proposals/" + proposal.id + "?chain=1&voting=" + proposal.votingAddress;
  await page.clock.setFixedTime(new Date(feed.observedAt * 1000));
  await page.goto(route);
  await expect(page.getByRole("heading", { name: "Built application checkpoint", exact: true })).toBeVisible();
  const served = await (await page.request.get("http://127.0.0.1:3310/api/dao-data")).body();
  assert.deepEqual(JSON.parse(served), feed);
  await page.screenshot({ path: join(directory, "producer-render-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(directory, "producer-render-mobile.png"), fullPage: true });
  await writeFile(join(directory, "smoke-evidence.json"), JSON.stringify({ source: s.manifest.revision, producerSha256: s.manifest.producerSha256,
    hash, proposalId: proposal.id, votingAddress: proposal.votingAddress, blockHash: receipt.blockHash, contentDigest: proposal.contentDigest,
    contentBytes: bytes.length, scriptHash: proposal.scriptHash, exactBytes: true, events: true, rendered: true, feedBlock: feed.block,
    configuration: "optimized-local-development", fullWalkthrough: false }, null, 2) + "\n");
  console.log("UI creation, offline publication, canonical receipt, released producer, exact bytes and rendered feed passed.");
} catch (error) {
  await page.screenshot({ path: join(directory, "smoke-failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally { await close(); }
