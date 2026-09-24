// One local session owns the existing fork, app, content seam and released producer.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, rename, symlink, access, rm } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { cleanEnvironment, digest, producerBinary, producerSha256, verifyProducer, verifyFork, forkRequest, validationOrigin } from "./dao-local-validation-config.mjs";

const rpc = "http://127.0.0.1:18545";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const json = value => JSON.stringify(value, null, 2) + "\n";
const exists = path => access(path).then(() => true, () => false);
const delay = ms => new Promise(done => setTimeout(done, ms));
const read = async path => JSON.parse(await readFile(path, "utf8"));
const save = (path, value) => writeFile(path, json(value), { mode: 0o600 });
export async function session(directory) {
  directory = resolve(directory);
  const manifest = await read(join(directory, "session.json"));
  assert.equal(manifest.directory, directory);
  assert.equal(manifest.version, 1);
  const env = { ...cleanEnvironment(join(directory, "home")),
    DAO_FORK_DIR: join(directory, "fork"), DAO_FORK_RPC: rpc, DAO_FORK_SOURCE_RPC: manifest.upstream,
    DAO_PUBLICATION_LOCAL_STATE: join(directory, "d1"), DAO_LOCAL_SERVICES_PORT: "18546",
    DAO_LOCAL_IPFS_API_URL: "http://127.0.0.1:15001", E2E_PORT: "3310",
    // A disposable walkthrough can publish more than two documents. Accounting remains durable.
    DAO_PUBLICATION_LIMITS: JSON.stringify({ hourlyDocuments: 40, dailyDocuments: 40, monthlyDocuments: 40 }),
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME, "Library/Caches/ms-playwright") };
  return { directory, manifest, env, source: join(directory, manifest.sourceDirectory ?? "source") };
}
async function run(s, command, args, label, extra = {}, timeout = 120_000) {
  const fd = openSync(join(s.directory, "logs", label + ".log"), "a", 0o600);
  const child = spawn(command, args, { cwd: s.source, env: { ...s.env, ...extra }, stdio: ["ignore", fd, fd], detached: true });
  let timedOut = false;
  let force;
  const signal = name => { try { process.kill(-child.pid, name); } catch (error) { if (error.code !== "ESRCH") throw error; } };
  const timer = setTimeout(() => {
    timedOut = true; signal("SIGTERM");
    force = setTimeout(() => signal("SIGKILL"), 5000);
  }, timeout);
  try {
    const code = await new Promise((done, reject) => { child.on("error", reject); child.on("exit", done); });
    assert.equal(code, 0, label + (timedOut ? " timed out" : " failed") + ". See logs/" + label + ".log");
  } finally { clearTimeout(timer); clearTimeout(force); closeSync(fd); }
}
async function bounded(check, label, seconds = 60) {
  const deadline = Date.now() + seconds * 1000;
  let last;
  while (Date.now() < deadline) {
    try { await check(); return; } catch (error) { last = error; }
    await delay(500);
  }
  throw new Error(label + " did not become ready: " + last?.message);
}
async function freePort(port) {
  const server = createServer();
  await new Promise((done, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", done); });
  await new Promise(done => server.close(done));
}
function processIdentity(pid) {
  try { return execFileSync("ps", ["-p", String(pid), "-o", "lstart=,command="], { encoding: "utf8" }).trim(); }
  catch { return null; }
}
async function launch(s, name, command, args) {
  const path = join(s.directory, name + ".process.json");
  if (await exists(path)) {
    const previous = await read(path);
    assert.ok(!processIdentity(previous.pid), "An owned " + name + " process already exists. Inspect status before starting another.");
  }
  const fd = openSync(join(s.directory, "logs", name + ".log"), "a", 0o600);
  const child = spawn(command, args, { cwd: s.source, env: s.env, stdio: ["ignore", fd, fd], detached: true });
  await new Promise((done, reject) => { child.once("spawn", done); child.once("error", reject); });
  closeSync(fd); child.unref();
  const owner = { pid: child.pid, identity: processIdentity(child.pid) };
  assert.ok(owner.identity);
  await save(path, owner);
}
async function stopOwned(s, name) {
  const path = join(s.directory, name + ".process.json");
  if (!await exists(path)) return;
  const owner = await read(path);
  const current = processIdentity(owner.pid);
  if (!current) return;
  assert.equal(current, owner.identity, "PID ownership changed. Refusing to signal " + name);
  process.kill(-owner.pid, "SIGTERM");
  await bounded(async () => assert.ok(!processIdentity(owner.pid)), name + " shutdown", 30);
}
async function docker(s, args) { await run(s, "docker", args, "container", { HOME: process.env.HOME }, 60_000); }
async function checkContainer(s) {
  const label = execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "dao.validation"}}', s.manifest.container], { encoding: "utf8" }).trim();
  assert.equal(label, s.directory, "Container ownership differs.");
}
async function guarded(s) { await verifyFork(rpc, s.manifest.identity); }
export async function refresh(s) {
  await guarded(s);
  await verifyProducer(s.manifest.producer);
  assert.equal(digest(await readFile(s.manifest.clockLibrary)), s.manifest.clockSha256, "Clock dependency changed.");
  // Confirm the preceding UI receipt, then include all existing transactions in the safe block.
  await forkRequest(rpc, "evm_mine");
  const head = await forkRequest(rpc, "eth_getBlockByNumber", ["latest", false]);
  const timestamp = Number(BigInt(head.timestamp));
  const offset = timestamp + 2 - Math.floor(Date.now() / 1000);
  const directory = join(s.directory, "producer", String(Date.now()));
  await mkdir(directory, { recursive: true });
  let statePath = join(directory, "state");
  const previousPath = join(s.directory, "snapshot.json");
  if (await exists(previousPath)) {
    const previous = await read(previousPath);
    const previousBlock = await forkRequest(rpc, "eth_getBlockByNumber", ["0x" + BigInt(previous.block.number).toString(16), false]);
    // Reuse released-producer history only on the same canonical branch and
    // a forward clock. Replaced branches retain their old state directories.
    if (previousBlock?.hash === previous.block.hash && timestamp >= previous.observedAt) {
      statePath = previous.statePath ?? join(dirname(previous.output), "state");
    }
  }
  await run(s, s.manifest.producer, ["local", join(s.directory, "producer-config.json"), statePath, join(directory, "dao.json")], "producer", {
    DAO_RPC_TRANSPORT: "http", DAO_RPC_URL: rpc, DAO_CONTENT_GATEWAY: "http://127.0.0.1:18080/ipfs/",
    DYLD_INSERT_LIBRARIES: s.manifest.clockLibrary, DYLD_FORCE_FLAT_NAMESPACE: "1",
    FAKETIME: (offset >= 0 ? "+" : "") + offset, FAKETIME_DONT_FAKE_MONOTONIC: "1", NO_FAKE_STAT: "1",
  }, 120_000);
  const bytes = await readFile(join(directory, "dao.json"));
  const feed = JSON.parse(bytes);
  assert.ok(feed.observedAt >= feed.block.timestamp && feed.observedAt - feed.block.timestamp <= 300,
    "Producer snapshot exceeds the application's freshness window.");
  // The producer clock advances during acquisition. Advance the real local
  // chain by those elapsed seconds, without changing any snapshot bytes.
  await guarded(s);
  const beforeAlignment = await forkRequest(rpc, "eth_getBlockByNumber", ["latest", false]);
  if (feed.observedAt > Number(BigInt(beforeAlignment.timestamp))) {
    await forkRequest(rpc, "evm_setNextBlockTimestamp", [feed.observedAt]);
    await forkRequest(rpc, "evm_mine");
  }
  const aligned = await forkRequest(rpc, "eth_getBlockByNumber", ["latest", false]);
  assert.ok(Math.abs(feed.observedAt - Number(BigInt(aligned.timestamp))) < 60, "Producer clock differs from fork.");
  const canonical = await forkRequest(rpc, "eth_getBlockByNumber", ["0x" + BigInt(feed.block.number).toString(16), false]);
  assert.equal(canonical.hash, feed.block.hash);
  await writeFile(join(s.directory, "fork/feed.next.json"), bytes);
  await rename(join(s.directory, "fork/feed.next.json"), join(s.directory, "fork/feed.json"));
  await save(join(s.directory, "snapshot.json"), { output: join(directory, "dao.json"), statePath, sha256: digest(bytes), observedAt: feed.observedAt,
    block: feed.block, proposals: feed.proposals.length, source: s.manifest.revision, configuration: "optimized-local-development" });
  console.log("Producer snapshot: " + feed.proposals.length + " proposals, block " + feed.block.number);
  return feed;
}
async function start(s) {
  for (const port of [18545, 18546, 15001, 18080, 3310]) await freePort(port);
  await verifyProducer(s.manifest.producer);
  try {
    const state = join(s.directory, "anvil.json");
    await launch(s, "anvil", "anvil", ["--host", "127.0.0.1", "--port", "18545", "--chain-id", "1", "--fork-url", s.manifest.upstream,
      "--fork-block-number", s.manifest.forkBlock, "--state", state, "--state-interval", "30", "--preserve-historical-states", "--silent"]);
    await bounded(() => verifyFork(rpc), "Anvil");
    await verifyFork(rpc, { number: "0x" + BigInt(s.manifest.forkBlock).toString(16), hash: s.manifest.upstreamBlockHash });
    // Anvil can restore the tip with a timestamp older than its parent. Mine
    // two explicit monotonic blocks so the producer's confirmed snapshot is
    // after both retained headers. Never patch the producer's observations.
    const tip = await forkRequest(rpc, "eth_getBlockByNumber", ["latest", false]);
    const parent = await forkRequest(rpc, "eth_getBlockByNumber", ["0x" + (BigInt(tip.number) - 1n).toString(16), false]);
    const previousSnapshot = await exists(join(s.directory, "snapshot.json")) ? await read(join(s.directory, "snapshot.json")) : null;
    const resumeTime = Math.max(Number(BigInt(tip.timestamp)), Number(BigInt(parent.timestamp)), previousSnapshot?.observedAt ?? 0);
    for (const timestamp of [resumeTime + 1, resumeTime + 2]) {
      await forkRequest(rpc, "evm_setNextBlockTimestamp", [timestamp]);
      await forkRequest(rpc, "evm_mine");
    }
    const containerExists = (() => { try { execFileSync("docker", ["inspect", s.manifest.container], { stdio: "ignore" }); return true; } catch { return false; } })();
    if (containerExists) { await checkContainer(s); await docker(s, ["start", s.manifest.container]); }
    else await docker(s, ["run", "--detach", "--name", s.manifest.container, "--label", "dao.validation=" + s.directory,
      "--publish", "127.0.0.1:15001:5001", "--publish", "127.0.0.1:18080:8080", "--env", "IPFS_PROFILE=test", "ipfs/kubo:v0.40.1", "daemon", "--offline"]);
    await bounded(async () => assert.ok((await fetch("http://127.0.0.1:15001/api/v0/id", { method: "POST", signal: AbortSignal.timeout(2000) })).ok), "Offline Kubo");
    if (!s.manifest.identity) {
      await run(s, process.execPath, ["scripts/dao-fork.mjs", "setup"], "setup");
      const block = await forkRequest(rpc, "eth_getBlockByNumber", ["latest", false]);
      s.manifest.identity = { number: block.number, hash: block.hash };
      await save(join(s.directory, "session.json"), s.manifest);
      await copyFile(join(s.directory, "fork/feed.json"), join(s.directory, "fork/setup-fixture.json"));
    }
    await guarded(s);
    await refresh(s);
    if (!await exists(join(s.source, ".next/dao-local-build.json"))) {
      console.log("Building the isolated local application; bounded to ten minutes.");
      await run(s, process.execPath, ["scripts/dao-local-app.mjs", "--build"], "build", {}, 600_000);
    }
    await launch(s, "app", process.execPath, ["scripts/dao-local-app.mjs", "--built"]);
    await bounded(async () => {
      const response = await fetch("http://127.0.0.1:3310/api/dao-data", { signal: AbortSignal.timeout(3000) });
      assert.ok(response.ok); assert.equal((await response.json()).schema, "yearn.dao.feed.v2");
    }, "Built app", 90);
    console.log("Ready: " + validationOrigin + "/dao — use the session browser for its fork wallet and clock.");
  } catch (error) { await stop(s); throw error; }
}
async function stop(s) {
  for (const name of ["browser", "app", "anvil"]) await stopOwned(s, name);
  try { await checkContainer(s); await docker(s, ["stop", "--time", "5", s.manifest.container]); }
  catch (error) { if (!String(error).includes("No such")) console.error("Container status: " + error.message); }
}
async function init(directory) {
  assert.ok(process.env.DAO_FORK_SOURCE_RPC, "Set the unauthenticated DAO_FORK_SOURCE_RPC explicitly.");
  const upstream = new URL(process.env.DAO_FORK_SOURCE_RPC);
  assert.ok(upstream.protocol === "https:" && !upstream.username && !upstream.password && !upstream.search && !upstream.hash,
    "Use a public HTTPS read upstream without credentials or query parameters.");
  assert.ok(process.env.DAO_VALIDATION_CLOCK_LIBRARY, "Set DAO_VALIDATION_CLOCK_LIBRARY to the local libfaketime dylib.");
  const clockLibrary = resolve(process.env.DAO_VALIDATION_CLOCK_LIBRARY);
  const clockSha256 = digest(await readFile(clockLibrary));
  await verifyProducer();
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit the source candidate before session initialization.");
  assert.ok(!directory.startsWith(root + "/") && directory !== root, "Keep validation state outside Git.");
  await mkdir(directory, { recursive: false, mode: 0o700 });
  for (const name of ["source", "logs", "home", "fork", "producer", "documents"]) await mkdir(join(directory, name));
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  execFileSync("git", ["archive", "--format=tar", "--output=" + join(directory, "source.tar"), revision], { cwd: root });
  execFileSync("tar", ["-xf", join(directory, "source.tar"), "-C", join(directory, "source")]);
  await symlink(join(root, "node_modules"), join(directory, "source/node_modules"), "dir");
  const response = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] }), signal: AbortSignal.timeout(15_000) });
  const block = (await response.json()).result;
  assert.ok(block?.hash);
  await save(join(directory, "session.json"), { version: 1, directory, revision, upstream: upstream.href,
    forkBlock: String(BigInt(block.number)), upstreamBlockHash: block.hash,
    producer: producerBinary, producerSha256, clockLibrary, clockSha256,
    container: "dao-validation-" + digest(directory).slice(0, 12),
    dependencyLockSha256: digest(await readFile(join(root, "package-lock.json"))) });
  await copyFile(join(root, "docs/apps/dao/examples/local-producer.json"), join(directory, "producer-config.json"));
  await save(join(directory, "browser-control.json"), { account: 0, rejectNext: false, rpcDelayMs: 0, rpcOffline: false, clock: "fork", viewport: "desktop", feed: "producer" });
  console.log("Initialized " + directory + " from " + revision + ". Run start next.");
}
export async function main([command, argument, ...args]) {
  assert.ok(argument, "Usage: npm run dao:validate -- init|start|status|refresh|browser|control|scenario|stop /absolute/session [arguments]");
  const directory = resolve(argument);
  if (command === "init") return init(directory);
  const s = await session(directory);
  if (command === "start") return start(s);
  if (command === "rebuild") {
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit the candidate before rebuilding.");
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    assert.notEqual(revision, s.manifest.revision, "This source revision is already prepared. Use start.");
    await stop(s);
    const sourceDirectory = "source-" + revision;
    await mkdir(join(directory, sourceDirectory));
    const archive = join(directory, sourceDirectory + ".tar");
    execFileSync("git", ["archive", "--format=tar", "--output=" + archive, revision], { cwd: root });
    execFileSync("tar", ["-xf", archive, "-C", join(directory, sourceDirectory)]);
    await symlink(join(root, "node_modules"), join(directory, sourceDirectory, "node_modules"), "dir");
    s.manifest.previousSources = [...(s.manifest.previousSources ?? []), { revision: s.manifest.revision, sourceDirectory: s.manifest.sourceDirectory ?? "source" }];
    Object.assign(s.manifest, { revision, sourceDirectory, dependencyLockSha256: digest(await readFile(join(root, "package-lock.json"))) });
    await save(join(directory, "session.json"), s.manifest);
    return start(await session(directory));
  }
  if (command === "stop") return stop(s);
  if (command === "refresh") return refresh(s);
  if (command === "browser") {
    await guarded(s);
    await rm(join(directory, "browser-ready.json"), { force: true });
    await launch(s, "browser", process.execPath, ["scripts/dao-validation-browser.mjs", directory]);
    await bounded(async () => assert.ok(await exists(join(directory, "browser-ready.json"))), "Browser", 30);
    return console.log("Visible session browser opened.");
  }
  if (command === "control") {
    const current = await read(join(directory, "browser-control.json"));
    const value = JSON.parse(args[1]);
    assert.ok(Object.hasOwn(current, args[0]), "Unknown browser control.");
    await save(join(directory, "browser-control.json"), { ...current, [args[0]]: value });
    return;
  }
  if (command === "scenario") {
    await guarded(s);
    if (args[0] === "checkpoint") {
      await save(join(directory, "checkpoint.json"), { id: await forkRequest(rpc, "evm_snapshot"), state: await read(join(directory, "fork/state.json")) });
      return console.log("Saved a checkpoint for canonical replacement in this Anvil process.");
    }
    if (args[0] === "replace-chain") {
      const checkpoint = await read(join(directory, "checkpoint.json"));
      const head = await forkRequest(rpc, "eth_getBlockByNumber", ["latest", false]);
      assert.equal(await forkRequest(rpc, "evm_revert", [checkpoint.id]), true, "Checkpoint lost. Preserve this session and initialize another.");
      await forkRequest(rpc, "evm_setNextBlockTimestamp", [Number(BigInt(head.timestamp)) + 20]);
      await forkRequest(rpc, "evm_mine");
      await save(join(directory, "fork/state.json"), checkpoint.state);
      return console.log("Canonical branch replaced. The previous feed is retained until refresh.");
    }
    assert.ok(["mine", "phase", "status", "record", "reset", "replace", "expect-execute-revert"].includes(args[0]), "Use UI actions for the walkthrough.");
    const previous = await readFile(join(directory, "fork/feed.json"));
    await run(s, process.execPath, ["scripts/dao-fork.mjs", ...args], "scenario");
    // reset creates an independently labelled fixture; never serve it as producer output.
    if (args[0] === "reset") {
      await copyFile(join(directory, "fork/feed.json"), join(directory, "fork/reset-fixture.json"));
      await writeFile(join(directory, "fork/feed.json"), previous);
    }
    console.log("Scenario complete. Refresh the producer after relevant transactions or phase changes."); return;
  }
  if (command === "status") {
    const processes = {};
    for (const name of ["anvil", "app", "browser"]) {
      const path = join(directory, name + ".process.json");
      const owner = await exists(path) ? await read(path) : null;
      processes[name] = owner && processIdentity(owner.pid) === owner.identity ? owner.pid : "stopped";
    }
    console.log(json({ revision: s.manifest.revision, directory, processes, ports: [18545, 18546, 15001, 18080, 3310],
      snapshot: await exists(join(directory, "snapshot.json")) ? await read(join(directory, "snapshot.json")) : null })); return;
  }
  throw new Error("Unknown validation command.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
