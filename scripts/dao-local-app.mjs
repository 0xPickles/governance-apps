// Runs the app only on loopback with explicit real DAO clients and local services.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import { dirname, basename } from "node:path";
import { requireAcceptanceState } from "./dao-pinata-acceptance.mjs";
import { requireCleanSource, verifyFork, localAppEnvironment, digest } from "./dao-local-validation-config.mjs";
const build = process.argv.includes("--build");
const built = process.argv.includes("--built");
if (build && built) throw new Error("Choose --build or --built.");
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
let builtEnv;
if (build || built) {
  await requireCleanSource();
  if (liveProvider || process.env.DAO_PINATA_JWT || !process.env.DAO_PUBLICATION_LOCAL_STATE) throw new Error("Built validation requires offline publication and explicit local D1.");
  await verifyFork(rpc);
  builtEnv = localAppEnvironment(process.env, deployments);
  const configuration = Object.fromEntries(Object.entries(builtEnv).filter(([key]) => key.startsWith("NEXT_PUBLIC_") || ["DAO_DATA_URL", "DAO_PUBLICATION_TEST_ORIGIN", "DAO_FORUM_TEST_ORIGIN", "DAO_PUBLICATION_LOCAL_STATE"].includes(key)));
  const fingerprint = digest(JSON.stringify(configuration));
  if (build) {
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], { stdio: "inherit", env: builtEnv });
    const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
    if (code !== 0) process.exit(code ?? 1);
    await writeFile(".next/dao-local-build.json", JSON.stringify({ fingerprint, configuration }, null, 2) + "\n");
    process.exit(0);
  }
  const manifest = JSON.parse(await readFile(".next/dao-local-build.json", "utf8"));
  if (manifest.fingerprint !== fingerprint) throw new Error("Local configuration changed. Rebuild this isolated source copy.");
}
if (liveProvider && process.env.DAO_UAT_LIVE_AUTHORIZED !== "yes") throw new Error("Live provider acceptance requires explicit operator authorization.");
if (liveProvider) {
  const statePath = process.env.DAO_PUBLICATION_LOCAL_STATE;
  if (!statePath || basename(statePath) !== "d1") throw new Error("An existing acceptance D1 path is required.");
  await requireAcceptanceState(dirname(statePath), directory);
}
// The same local D1 implementation used by the application. Preserve counters across restarts.
const platform = await getPlatformProxy({ configPath: "wrangler.jsonc", remoteBindings: false, envFiles: [],
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
const app = spawn(process.execPath, [...(built ? ["--import", "./scripts/dao-local-context.mjs"] : []), "node_modules/next/dist/bin/next", ...(built ? ["start"] : ["dev", "--webpack"]), "--hostname", "127.0.0.1", "--port", process.env.E2E_PORT ?? "3310"], {
  stdio: "inherit",
  env: builtEnv ?? { ...process.env, NEXT_PUBLIC_RUNTIME_MODE: "development", NEXT_PUBLIC_USE_MOCKS: "false", NEXT_PUBLIC_E2E: "false",
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
services.on("exit", () => app.kill("SIGTERM"));
app.on("error", stop);
