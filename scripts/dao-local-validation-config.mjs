// Explicit local configuration. This is not a production Worker configuration.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

export const producerSha256 = "61c51b8528cb249b8290b0bc1fe9acc9f9514be7a5991d8af22fd61fedc8ff5c";
export const producerBinary = "/Users/hydra/Developer/dao-operations/gov-apps-stats.agent.integration/target/release/gov-apps-dao";
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function loopbackOrigin(value) {
  const url = new URL(value);
  assert.ok(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    value === url.origin && !url.username && !url.password, "Expected an exact loopback HTTP origin.");
  return value;
}
export async function forkRequest(rpc, method, params = []) {
  loopbackOrigin(rpc);
  const response = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  assert.ok(response.ok, "Local RPC unavailable.");
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}
export async function verifyFork(rpc, identity) {
  assert.match(await forkRequest(rpc, "web3_clientVersion"), /anvil/i);
  assert.equal(await forkRequest(rpc, "eth_chainId"), "0x1");
  if (identity) {
    const block = await forkRequest(rpc, "eth_getBlockByNumber", [identity.number, false]);
    assert.equal(block?.hash, identity.hash, "Selected fork checkpoint differs. Refusing local operation.");
  }
}
export async function verifyProducer(binary = producerBinary) {
  assert.equal(digest(await readFile(binary)), producerSha256, "Released producer hash differs. Investigate provenance.");
}
export function cleanEnvironment(home) {
  return { PATH: process.env.PATH, HOME: home, TMPDIR: process.env.TMPDIR ?? "/tmp",
    NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" };
}
export async function requireCleanSource(directory = process.cwd()) {
  const names = await readdir(directory);
  assert.ok(!names.some(name => /^(\.env($|\.)|\.dev\.vars($|\.))/.test(name) && !name.endsWith(".example")),
    "Built local validation requires an isolated source copy without private environment files.");
}
export function localAppEnvironment(base, deployments) {
  const rpc = loopbackOrigin(base.DAO_FORK_RPC ?? "http://127.0.0.1:18545");
  const services = loopbackOrigin("http://127.0.0.1:" + (base.DAO_LOCAL_SERVICES_PORT ?? "18546"));
  return { ...base, NODE_ENV: "production", NEXT_PUBLIC_RUNTIME_MODE: "development",
    NEXT_PUBLIC_USE_MOCKS: "false", NEXT_PUBLIC_E2E: "false", NEXT_PUBLIC_ENABLE_DAO: "true",
    NEXT_PUBLIC_ENABLE_DEBUG_UI: "false", NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS: "false",
    NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK: "false", NEXT_PUBLIC_WC_PROJECT_ID: "offline-validation",
    NEXT_PUBLIC_RPC_URLS: rpc, NEXT_PUBLIC_DAO_DEPLOYMENTS: JSON.stringify(deployments),
    DAO_DATA_URL: services + "/dao.json", DAO_PUBLICATION_ENABLED: "true",
    DAO_PINATA_JWT: "", DAO_IPFS_GATEWAY_URL: "", DAO_UAT_PROVIDER: "offline",
    DAO_PUBLICATION_TEST_ORIGIN: services, DAO_FORUM_TEST_ORIGIN: services };
}
