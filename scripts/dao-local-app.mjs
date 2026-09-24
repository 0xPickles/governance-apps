// Runs the app only on loopback with explicit real DAO clients and local services.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import { dirname, basename } from "node:path";
import { requireAcceptanceState } from "./dao-pinata-acceptance.mjs";
const directory = process.env.DAO_FORK_DIR ?? "/tmp/governance-dao-uat";
const rpc = process.env.DAO_FORK_RPC ?? "http://127.0.0.1:18545";
const ipfs = process.env.DAO_LOCAL_IPFS_API_URL ?? "http://127.0.0.1:15001";
for (const value of [rpc, ipfs]) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Local UAT requires loopback RPC and IPFS.");
}
const deployments = JSON.parse(await readFile(directory + "/deployments.json", "utf8"));
const servicesPort = process.env.DAO_LOCAL_SERVICES_PORT ?? "18546";
const liveProvider = process.env.DAO_UAT_PROVIDER === "pinata";
if (liveProvider && process.env.DAO_UAT_LIVE_AUTHORIZED !== "yes") throw new Error("Live provider acceptance requires explicit operator authorization.");
if (liveProvider) {
  const statePath = process.env.DAO_PUBLICATION_LOCAL_STATE;
  if (!statePath || basename(statePath) !== "d1") throw new Error("An existing acceptance D1 path is required.");
  await requireAcceptanceState(dirname(statePath), directory);
}
// The same local D1 implementation used by the application. Preserve counters across restarts.
const platform = await getPlatformProxy({ configPath: "wrangler.jsonc",
  ...(process.env.DAO_PUBLICATION_LOCAL_STATE ? { persist: { path: process.env.DAO_PUBLICATION_LOCAL_STATE } } : {}) });
try {
  const exists = await platform.env.DAO_PUBLICATION_DB.prepare("SELECT name FROM sqlite_master WHERE name = 'dao_publications'").first();
  if (!exists) {
    if (liveProvider) throw new Error("Acceptance database schema is missing. Restore the checkpoint before publication.");
    const migration = await readFile("migrations/dao-publication/0001_publications.sql", "utf8");
    await platform.env.DAO_PUBLICATION_DB.batch(migration.split(";").filter(sql => sql.trim()).map(sql => platform.env.DAO_PUBLICATION_DB.prepare(sql)));
  }
} finally { await platform.dispose(); }
const services = spawn(process.execPath, ["scripts/dao-local-services.mjs"], { stdio: "inherit" });
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", process.env.E2E_PORT ?? "3310"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_RUNTIME_MODE: "development", NEXT_PUBLIC_USE_MOCKS: "false", NEXT_PUBLIC_E2E: "false",
    NEXT_PUBLIC_RPC_URLS: rpc, NEXT_PUBLIC_DAO_DEPLOYMENTS: JSON.stringify(deployments),
    DAO_DATA_URL: process.env.DAO_UAT_LIVE_FEED === "true" ? "https://data.dao-ops.com/prod/dao.json" : "http://127.0.0.1:" + servicesPort + "/dao.json",
    DAO_PUBLICATION_ENABLED: "true", DAO_PUBLICATION_TEST_ORIGIN: liveProvider ? "" : "http://127.0.0.1:" + servicesPort,
    DAO_FORUM_TEST_ORIGIN: "http://127.0.0.1:" + servicesPort,
  },
});
function stop() { app.kill("SIGTERM"); services.kill("SIGTERM"); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
app.on("exit", code => { services.kill("SIGTERM"); process.exitCode = code ?? 1; });
services.on("error", stop);
