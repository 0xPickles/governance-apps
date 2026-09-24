// Small receipt-backed scenarios for a disposable Anvil fork. Never a producer.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createPublicClient, http, parseAbi, encodeFunctionData, decodeEventLog, keccak256, sha256 } from "viem";
const rpcUrl = process.env.DAO_FORK_RPC ?? "http://127.0.0.1:18545";
const directory = process.env.DAO_FORK_DIR ?? "/tmp/governance-dao-uat";
const url = new URL(rpcUrl);
assert.ok(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !url.username && !url.password, "Fork writes require a loopback HTTP RPC.");
const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }) });
const voting = "0x543e8871562a8c53e8b6a26835aeecb3a5a13070";
const abi = parseAbi([
  "function genesis() view returns (uint256)", "function management() view returns (address)", "function guardian() view returns (address)",
  "function hooks() view returns (address)", "function voter() view returns (address)", "function executor() view returns (address)",
  "function vote_start() view returns (uint256)", "function execute_delay() view returns (uint256)", "function execute_guard() view returns (bool)",
  "function threshold() view returns (uint256)", "function num_proposals() view returns (uint256)", "function propose_cooldown() view returns (uint256)",
  "function set_weight_measure(address)", "function set_operator(address)", "function set_guardian(address)", "function accept_guardian()",
  "function propose(bytes32,bytes) returns (uint256)", "function retract(uint256)", "function flag(uint256,string)", "function veto(uint256,string)",
  "function vote(address,uint256,uint256,uint256) returns (uint256)", "function vote_yea(address,uint256) returns (uint256)",
  "function execute(uint256,bytes)", "function status(uint256) view returns (uint256)",
  "function proposals(uint256) view returns ((address proposer,uint256 epoch,bytes32 ipfs,bytes32 script_hash,uint256 threshold,uint256 votes,uint256 yea,bool retracted,bool executed,bool flagged,bool vetoed))",
  "event Propose(uint256 indexed idx,address indexed proposer,uint256 indexed epoch,bytes32 ipfs,bytes script)",
  "event Retract(uint256 indexed idx)", "event Vote(address indexed account,uint256 indexed idx,uint256 weight,uint256 yea)",
  "event Flag(uint256 indexed idx,string reason)", "event Veto(uint256 indexed idx,string reason)", "event Execute(address indexed executor,uint256 indexed idx)",
]);
const helperAbi = parseAbi(["function record(uint256)", "function marker() view returns (uint256)"]);
const read = (functionName, args = [], address = voting) => client.readContract({ address, abi, functionName, args });
const rpc = (method, params = []) => client.request({ method, params });
const json = value => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2) + "\n";
const load = async () => JSON.parse(await readFile(directory + "/state.json", "utf8"));
const save = state => writeFile(directory + "/state.json", json(state));
async function guard() {
  assert.match(await rpc("web3_clientVersion"), /anvil/i, "Only Anvil is supported.");
  assert.equal(await client.getChainId(), 1);
}
async function receipt(hash) {
  const r = await client.waitForTransactionReceipt({ hash, timeout: 30_000 });
  assert.equal(r.status, "success", "Local transaction reverted.");
  assert.equal((await client.getBlock({ blockNumber: r.blockNumber })).hash, r.blockHash);
  return r;
}
async function send(account, functionName, args = [], address = voting) {
  await guard();
  const data = encodeFunctionData({ abi, functionName, args });
  const hash = await rpc("eth_sendTransaction", [{ from: account, to: address, data, gas: "0x7a1200", value: "0x0" }]);
  await receipt(hash);
  return hash;
}
async function impersonate(account) {
  await guard();
  await rpc("anvil_setBalance", [account, "0x56bc75e2d63100000"]);
  await rpc("anvil_impersonateAccount", [account]);
}
async function record(state, hash, contentBytes) {
  const r = await receipt(hash);
  const tx = await client.getTransaction({ hash });
  assert.equal(tx.value, 0n);
  const block = await client.getBlock({ blockNumber: r.blockNumber });
  for (const log of r.logs.filter(log => log.address.toLowerCase() === voting)) {
    let event;
    try { event = decodeEventLog({ abi, data: log.data, topics: log.topics }); } catch { continue; }
    if (!["Propose", "Retract", "Vote", "Flag", "Veto", "Execute"].includes(event.eventName)) continue;
    const id = event.args.idx.toString();
    if (event.eventName === "Propose") {
      const p = await read("proposals", [event.args.idx]);
      assert.equal(p.ipfs, event.args.ipfs);
      assert.equal(p.script_hash, keccak256(event.args.script));
      if (contentBytes) assert.equal(sha256(Buffer.from(contentBytes, "base64")), p.ipfs);
      if (!state.proposals[id]) state.proposals[id] = { scriptBytes: event.args.script, contentBytes: contentBytes ?? null, events: [] };
    }
    assert.ok(state.proposals[id], "Record the proposal receipt before subsequent actions.");
    const facts = { type: event.eventName.toLowerCase(), log: {
      blockNumber: r.blockNumber.toString(), blockHash: r.blockHash, timestamp: Number(block.timestamp),
      transactionHash: hash, transactionIndex: r.transactionIndex, logIndex: log.logIndex,
    } };
    if (event.eventName === "Vote") Object.assign(facts, { account: event.args.account.toLowerCase(), weight: event.args.weight.toString(), yea: event.args.yea.toString() });
    if (["Flag", "Veto"].includes(event.eventName)) facts.reason = event.args.reason;
    if (event.eventName === "Execute") facts.executor = event.args.executor.toLowerCase();
    if (!state.proposals[id].events.some(e => e.log.transactionHash === hash && e.log.logIndex === log.logIndex)) state.proposals[id].events.push(facts);
  }
  await save(state);
}
async function fixture(state) {
  const block = await client.getBlock();
  const count = await read("num_proposals");
  assert.equal(Number(count), Object.keys(state.proposals).length, "Fixture must account for every fork proposal; record missing receipts.");
  const configuration = { voter: (await read("voter")).toLowerCase(), executor: (await read("executor")).toLowerCase(),
    voteStart: String(await read("vote_start")), executeDelay: String(await read("execute_delay")), executeGuard: await read("execute_guard"), threshold: String(await read("threshold")) };
  const statuses = ["PROPOSED", "RETRACTED", "VOTING", "PASSED", "FAILED", "EXECUTED", "EXPIRED", "INVALID", "FLAGGED", "VETOED"];
  const proposals = [];
  for (const [id, known] of Object.entries(state.proposals)) {
    const p = await read("proposals", [BigInt(id)]);
    assert.equal(keccak256(known.scriptBytes), p.script_hash);
    const status = await read("status", [BigInt(id)]);
    assert.ok(statuses.some((_, i) => 1n << BigInt(i) === status));
    proposals.push({ votingAddress: voting, id, proposer: p.proposer.toLowerCase(), epoch: String(p.epoch), contentDigest: p.ipfs, scriptHash: p.script_hash,
      threshold: String(p.threshold), votes: String(p.votes), yea: String(p.yea), retracted: p.retracted, executed: p.executed, flagged: p.flagged, vetoed: p.vetoed,
      status: statuses.find((_, i) => 1n << BigInt(i) === status), ...known });
  }
  const feed = { schema: "yearn.dao.feed.v2", chainId: 1, observedAt: Number(block.timestamp),
    block: { number: String(block.number), hash: block.hash, timestamp: Number(block.timestamp) },
    deployments: [{ votingAddress: voting, proposalCount: String(count), configuration }], proposals };
  await writeFile(directory + "/feed.json", json(feed));
  return feed;
}
export async function scenario(command, args = []) {
  await guard();
  await mkdir(directory, { recursive: true });
  if (command === "setup") {
    assert.equal(await read("num_proposals"), 0n, "Setup requires a fresh fork of the empty live deployment.");
    const accounts = await rpc("eth_accounts");
    assert.ok(accounts.length >= 3);
    const initial = await rpc("evm_snapshot");
    const bytecode = execFileSync("uvx", ["--from", "vyper==0.4.2", "vyper", "-f", "bytecode", "scripts/dao-fork-helper.vy"], { encoding: "utf8" }).trim();
    const deploymentReceipt = await receipt(await rpc("eth_sendTransaction", [{ from: accounts[0], data: bytecode, gas: "0x2dc6c0" }]));
    const helper = deploymentReceipt.contractAddress;
    const management = await read("management"), guardian = await read("guardian");
    for (const account of accounts.slice(0, 3)) await rpc("anvil_setBalance", [account, "0x56bc75e2d63100000"]);
    await impersonate(management);
    await send(management, "set_weight_measure", [helper]);
    await rpc("anvil_stopImpersonatingAccount", [management]);
    await impersonate(guardian);
    await send(guardian, "set_operator", [accounts[0]]);
    await send(guardian, "set_guardian", [accounts[0]]);
    await rpc("anvil_stopImpersonatingAccount", [guardian]);
    await send(accounts[0], "accept_guardian");
    const deployment = { chainId: 1, votingAddress: voting, deploymentBlock: "25883944", genesis: Number(await read("genesis")), active: true,
      supportedVoters: [(await read("voter")).toLowerCase()], supportedExecutors: [(await read("executor")).toLowerCase()], supportedProposeHooks: [(await read("hooks")).toLowerCase()] };
    const data = encodeFunctionData({ abi: helperAbi, functionName: "record", args: [42n] });
    const script = helper.toLowerCase() + BigInt((data.length - 2) / 2).toString(16).padStart(24, "0") + data.slice(2);
    const state = { initial, accounts, helper, script, deployment, proposals: {} };
    state.ready = await rpc("evm_snapshot");
    await save(state);
    await writeFile(directory + "/deployments.json", json([deployment]));
    await fixture(state);
    return state;
  }
  const state = await load();
  if (command === "reset") {
    assert.equal(await rpc("evm_revert", [state.ready]), true, "Fork snapshot was lost; restart the node and run setup.");
    state.ready = await rpc("evm_snapshot"); state.proposals = {};
    await save(state); return fixture(state);
  }
  if (command === "mine") { await rpc("evm_mine"); return { timestamp: Number((await client.getBlock()).timestamp) }; }
  if (command === "phase") {
    assert.ok(["vote", "execute", "expire"].includes(args[0]), "Choose vote, execute or expire.");
    const p = await read("proposals", [BigInt(args[1] ?? 0)]);
    assert.notEqual(p.proposer, "0x0000000000000000000000000000000000000000");
    const timestamp = state.deployment.genesis + Number(p.epoch) * 1209600 +
      (args[0] === "vote" ? Number(await read("vote_start")) : args[0] === "execute" ? 1209600 + Number(await read("execute_delay")) : 2 * 1209600) + 10;
    assert.ok(timestamp > Number((await client.getBlock()).timestamp), "Phase time must move forward.");
    await rpc("evm_setNextBlockTimestamp", [timestamp]); await rpc("evm_mine");
    return { timestamp }; // Refreshing saved JSON is a separate, explicit command.
  }
  if (command === "propose") {
    const bytes = await readFile(args[0]);
    const script = args[1] === "signal" ? "0x" : args[1] ? (await readFile(args[1], "utf8")).trim() : state.script;
    const hash = await send(state.accounts[0], "propose", [sha256(bytes), script]);
    await record(state, hash, bytes.toString("base64")); return { hash };
  }
  if (command === "expect-execute-revert") {
    const id = BigInt(args[0]);
    const data = encodeFunctionData({ abi, functionName: "execute", args: [id, state.proposals[String(id)].scriptBytes] });
    const hash = await rpc("eth_sendTransaction", [{ from: state.accounts[0], to: voting, data, gas: "0x7a1200", value: "0x0" }]);
    const r = await client.waitForTransactionReceipt({ hash });
    assert.equal(r.status, "reverted");
    assert.equal((await client.getBlock({ blockNumber: r.blockNumber })).hash, r.blockHash);
    assert.equal((await read("proposals", [id])).executed, false);
    return { hash, status: r.status };
  }
  if (command === "record") {
    const content = args[1] ? (await readFile(args[1])).toString("base64") : undefined;
    await record(state, args[0], content); return { hash: args[0] };
  }
  if (command === "fixture") return fixture(state);
  if (command === "status") return { ...state, timestamp: Number((await client.getBlock()).timestamp), marker: String(await client.readContract({ address: state.helper, abi: helperAbi, functionName: "marker" })) };
  if (command === "replace") {
    // Protocol-level replacement fixture; the public Voter deliberately permits one user vote.
    const voter = state.deployment.supportedVoters[0];
    await impersonate(voter);
    try { const hash = await send(voter, "vote", [state.accounts[1], BigInt(args[0]), BigInt(args[2] ?? "10000"), BigInt(args[1])]);
      await record(state, hash); return { hash }; }
    finally { await rpc("anvil_stopImpersonatingAccount", [voter]); }
  }
  if (["retract", "flag", "veto", "execute", "vote"].includes(command)) {
    const id = BigInt(args[0]);
    const params = command === "vote" ? [voting, id] : command === "execute" ? [id, state.proposals[String(id)].scriptBytes] :
      command === "retract" ? [id] : [id, args[1] ?? "Disposable fork scenario"];
    const hash = await send(state.accounts[command === "vote" ? 1 : 0], command === "vote" ? "vote_yea" : command, params,
      command === "vote" ? state.deployment.supportedVoters[0] : voting);
    await record(state, hash); return { hash };
  }
  throw new Error("Use setup, reset, mine, phase vote|execute ID, propose CONTENT [signal|SCRIPT_FILE], record HASH [CONTENT], fixture, status, vote|retract|flag|veto|execute ID, or replace ID YEA_BPS.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(json(await scenario(process.argv[2] ?? "status", process.argv.slice(3))));
}
