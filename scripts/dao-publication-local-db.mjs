// File entry point: --input-type is inherited by Miniflare's synchronous workers.
// This helper never contacts a provider and never repairs or resets existing state.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { acceptanceDatabaseRelativePath, readAcceptanceLedger } from "./dao-pinata-acceptance.mjs";

export function inspectLocalDatabase(directory) {
  const path = join(directory, acceptanceDatabaseRelativePath);
  const db = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
  try {
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw new Error("Database integrity check failed. Preserve and inspect it.");
    // Explicit columns also reject incomplete or unrelated schemas.
    const documents = db.prepare("SELECT digest, cid, byte_length, published_at, upload_attempts, retrieval_attempts, reservations FROM dao_publications").all();
    const policies = db.prepare("SELECT singleton, limits_json FROM dao_publication_policy").all();
    return { database: path, documents: documents.length, policies: policies.length, integrity: "ok" };
  } finally { db.close(); }
}

async function initialize(directory) {
  const { getPlatformProxy } = await import("wrangler");
  const platform = await getPlatformProxy({
    configPath: join(directory, "wrangler-setup.json"), remoteBindings: false,
    envFiles: [], persist: { path: join(directory, "d1") },
  });
  try {
    const db = platform.env.DAO_PUBLICATION_DB;
    const existing = await db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
    if (existing.results.length) throw new Error("Database is not empty. Initialization refused.");
    const sql = await readFile(new URL("../migrations/dao-publication/0001_publications.sql", import.meta.url), "utf8");
    await db.batch(sql.split(";").filter(statement => statement.trim()).map(statement => db.prepare(statement)));
  } finally { await platform.dispose(); }
  const result = inspectLocalDatabase(directory);
  if (result.documents || result.policies) throw new Error("Fresh database unexpectedly contains accounting. Preserve it for inspection.");
  await writeFile(join(directory, "acceptance-ledger.json"), JSON.stringify({ version: 1, requests: 0, events: [] }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

export async function localDatabase(mode, directory) {
  if (!["fresh", "resume"].includes(mode)) throw new Error("Choose fresh or resume.");
  if (process.execArgv.some(arg => arg.startsWith("--input-type"))) throw new Error("Run scripts/dao-publication-local-db.mjs as a file, without --input-type.");
  directory = resolve(directory);
  if (mode === "fresh") {
    // Atomic refusal if ANY prior session directory exists, even an empty one.
    await mkdir(directory, { recursive: false, mode: 0o700 });
    await writeFile(join(directory, "wrangler-setup.json"), JSON.stringify({
      name: "dao-publication-local-setup", compatibility_date: "2026-09-16",
      d1_databases: [{ binding: "DAO_PUBLICATION_DB", database_name: "dao-publication", database_id: "00000000-0000-0000-0000-000000000000" }],
    }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    try {
      await promisify(execFile)(process.execPath, [fileURLToPath(import.meta.url), "initialize-worker", directory], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    } catch {
      throw new Error("Local initialization failed or exceeded 30 seconds. Preserve this directory and inspect it; do not rerun fresh or recreate its ledger.");
    }
  }
  // Resume is read-only. In particular, getPlatformProxy must not create a
  // missing database at a new path and make it look like restored accounting.
  if (!(await stat(join(directory, acceptanceDatabaseRelativePath))).isFile()) throw new Error("Expected database is missing.");
  const ledger = await readAcceptanceLedger(directory);
  return { mode, ...inspectLocalDatabase(directory), helperRequests: ledger.requests };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, directory] = process.argv.slice(2);
    if (!directory) throw new Error("Usage: node scripts/dao-publication-local-db.mjs fresh|resume /absolute/session-directory");
    if (mode === "initialize-worker") await initialize(resolve(directory));
    else console.log(JSON.stringify(await localDatabase(mode, directory), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
