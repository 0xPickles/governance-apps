// Operator-run only. No authenticated request runs without an explicit confirmation and hidden key input.
import { readFile, writeFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";

export const acceptanceLimits = {
  hourlyDocuments: 3, dailyDocuments: 3, monthlyDocuments: 3, documents: 3, bytes: 393216,
  concurrent: 2, uploadAttempts: 4, documentUploadAttempts: 2,
  retrievalAttempts: 12, documentRetrievalAttempts: 4, documentReservations: 4,
};
export function confirmationAnswer(answer) {
  if (answer === "yes") return true;
  if (answer === "no") return false;
  return null;
}
async function question(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(prompt)).trim(); } finally { rl.close(); }
}
async function confirm(prompt) {
  for (;;) {
    const answer = confirmationAnswer(await question(prompt + " Type yes or no: "));
    if (answer !== null) return answer;
    console.log("Empty or invalid answer. Nothing was authorized.");
  }
}
async function hiddenKey() {
  if (!process.stdin.isTTY) throw new Error("A private interactive terminal is required.");
  process.stdout.write("Private JWT (hidden): ");
  process.stdin.setRawMode(true); process.stdin.resume();
  try {
    return await new Promise((resolveKey, reject) => {
      let key = "";
      function input(buffer) {
        const chars = buffer.toString("utf8");
        if (chars.includes("\u0003")) { process.stdin.off("data", input); reject(new Error("Cancelled")); return; }
        for (const char of chars) {
          if (char === "\r" || char === "\n") {
            process.stdin.off("data", input);
            if (!key || /\s/.test(key)) reject(new Error("Empty or invalid private input"));
            else resolveKey(key);
            return;
          }
          if (char === "\u007f") key = key.slice(0, -1);
          else if (char >= " ") key += char;
        }
      }
      process.stdin.on("data", input);
    });
  } finally { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); }
}
export async function readAcceptanceDocument(path) {
  const bytes = await readFile(path);
  if (!bytes.length || bytes.length > 131072) throw new Error("Invalid document length");
  JSON.parse(bytes.toString("utf8"));
  return { bytes, cid: CID.createV1(0x55, await sha256.digest(bytes)).toString(),
    digest: "0x" + createHash("sha256").update(bytes).digest("hex") };
}
async function boundedBytes(response) {
  if (Number(response.headers.get("content-length")) > 131072 || !response.body) throw new Error("Invalid retrieval size");
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > 131072) throw new Error("Retrieval exceeds size limit");
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally { void reader.cancel().catch(() => {}); }
}
async function main() {
  const [action, directoryArg, file] = process.argv.slice(2);
  if (!["launch", "verify-app", "scope-delete", "control-delete", "retrieve", "cleanup"].includes(action) || !directoryArg) {
    throw new Error("Usage: node scripts/dao-pinata-acceptance.mjs ACTION /absolute/session-directory [canonical-file]");
  }
  const directory = resolve(directoryArg);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (action === "launch") {
    if (!await confirm("Start the actual loopback app with a live upload-only key?")) { console.log("Skipped app launch. No publication evidence was recorded."); return; }
    const key = await hiddenKey();
    const child = spawn(process.execPath, ["scripts/dao-local-app.mjs"], { stdio: "inherit", env: {
      ...process.env, DAO_PINATA_JWT: key, DAO_UAT_PROVIDER: "pinata", DAO_UAT_LIVE_AUTHORIZED: "yes",
      DAO_PUBLICATION_LIMITS: JSON.stringify(acceptanceLimits), DAO_PUBLICATION_LOCAL_STATE: join(directory, "d1"),
    } });
    process.on("SIGINT", () => child.kill("SIGINT")); process.on("SIGTERM", () => child.kill("SIGTERM"));
    await new Promise((done, reject) => { child.on("error", reject); child.on("exit", code => { process.exitCode = code ?? 1; done(); }); });
    return;
  }
  if (!file) throw new Error("A canonical document file is required");
  const document = await readAcceptanceDocument(file);
  const ledgerFile = join(directory, "acceptance-ledger.json");
  const lockFile = join(directory, "acceptance.lock");
  const lock = await open(lockFile, "wx", 0o600);
  try {
    let ledger;
    try { ledger = JSON.parse(await readFile(ledgerFile, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; ledger = { version: 1, requests: 0, events: [] }; }
    if (ledger.version !== 1 || !Number.isInteger(ledger.requests) || ledger.requests < 0 || !Array.isArray(ledger.events)) throw new Error("Invalid existing ledger");
    const save = async () => { await writeFile(ledgerFile + ".tmp", JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600 }); await rename(ledgerFile + ".tmp", ledgerFile); };
    if (!await confirm("Run one " + action + " request for " + document.cid + "?")) {
      let reason = ""; while (!reason) reason = await question("Reason for skipping (required): ");
      ledger.events.push({ action, cid: document.cid, skipped: true, reason, at: new Date().toISOString() }); await save();
      console.log("Skipped " + action + ". This check remains unproven."); return;
    }
    if (ledger.requests >= 8) throw new Error("The eight-request helper budget is exhausted");
    if (action === "scope-delete" && !ledger.events.some(e => e.action === "verify-app" && e.cid === document.cid && e.passed)) {
      throw new Error("Verify this published canary through the app before the deletion probe.");
    }
    if (action === "control-delete" && !ledger.events.some(e => e.action === "scope-delete" && e.cid === document.cid && e.status === 403)) {
      throw new Error("Record the scoped deletion rejection on this document before the authorized control.");
    }
    let url, key;
    if (["scope-delete", "control-delete", "cleanup"].includes(action)) {
      key = await hiddenKey(); url = "https://api.pinata.cloud/pinning/unpin/" + document.cid;
    } else if (action === "verify-app") {
      const origin = new URL(process.env.DAO_ACCEPTANCE_APP_ORIGIN ?? "http://127.0.0.1:3310");
      if (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname) || origin.username || origin.password) throw new Error("App must remain on loopback");
      url = origin.origin + "/api/dao-content?digest=" + document.digest;
    } else {
      const gateway = new URL(process.env.DAO_IPFS_GATEWAY_URL ?? "");
      if (gateway.protocol !== "https:" || gateway.username || gateway.password || gateway.search || gateway.hash || !gateway.pathname.endsWith("/ipfs/")) throw new Error("Invalid public gateway");
      url = gateway.href + document.cid;
    }
    // Reserve before network I/O. Interruptions and ambiguous outcomes are never refunded.
    ledger.requests++; ledger.events.push({ action, cid: document.cid, outcome: "reserved", at: new Date().toISOString() }); await save();
    const event = ledger.events.at(-1);
    try {
      const response = await fetch(url, { method: key ? "DELETE" : "GET", headers: key ? { Authorization: "Bearer " + key } : {},
        redirect: "error", credentials: "omit", signal: AbortSignal.timeout(20_000) });
      event.status = response.status;
      if (!key) {
        event.exactBytes = response.ok && (await boundedBytes(response)).equals(document.bytes);
        event.passed = event.exactBytes;
      } else {
        void response.body?.cancel().catch(() => {});
        event.passed = response.status === (action === "scope-delete" ? 403 : 200);
      }
      event.outcome = event.passed ? "passed" : "failed";
      await save(); console.log(JSON.stringify({ action, cid: document.cid, status: event.status, passed: event.passed, requests: ledger.requests }));
      if (!event.passed) process.exitCode = 1;
    } catch {
      event.outcome = "failed-or-unknown"; await save(); throw new Error("Request failed or timed out; the attempt remains counted.");
    }
  } finally { await lock.close(); await unlink(lockFile); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("Acceptance stopped. Inspect the sanitized ledger and procedure before retrying."); process.exitCode = 1; });
}
