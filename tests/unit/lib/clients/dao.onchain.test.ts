import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";
import { parseDaoFeed } from "@/lib/schemas/dao-feed";
import { OnchainDaoClient, readDaoLiveAccount } from "@/lib/clients/dao/onchain";
import { V2_ACCOUNT, V2_DEPLOYMENTS, V2_GENESIS, V2_NOW, V2_VOTING, v2Hash } from "../../../fixtures/dao-feed-v2";
import { createDaoRpcFixture } from "../../../fixtures/dao-rpc-v2";

const ref = { chainId: 1, votingAddress: V2_VOTING, proposalId: 0n } as const;
const feed = parseDaoFeed(saved);
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime((V2_NOW + 120) * 1000); });
afterEach(() => vi.useRealTimers());
describe("DAO coherent live wallet reads", () => {
  it("uses current stored flags and eligibility without rewriting the snapshot", async () => {
    const { rpc, calls, state } = createDaoRpcFixture();
    const live = await readDaoLiveAccount(feed, V2_DEPLOYMENTS, ref, V2_ACCOUNT, { rpc, walletChainId: 1 });
    expect(live).toMatchObject({
      hasVoted: false, isOperator: true, isGuardian: true, writesEnabled: true,
      capabilities: { canVote: true, votePurpose: "participation_only", canExecute: false },
      liveProposal: { vetoed: true, retracted: false, totalWeight: 0n, thresholdBps: 5000,
        rules: { snapshotThresholdBps: 8000 } },
      observation: { hash: state.hash, timestamp: V2_NOW + 120 },
    });
    expect(feed.proposals[0]).toMatchObject({ status: "VOTING", votes: "250000000000000000000", vetoed: false });
    expect(calls).toHaveLength(15);
    expect(calls.every(call => JSON.stringify(call.block) === JSON.stringify({ blockHash: state.hash, requireCanonical: true }))).toBe(true);
    expect(calls.find(c => c.name === "votes")?.args).toEqual([V2_ACCOUNT, 0n]);
  });

  it("uses changed current timing and Voter genesis rather than stale feed assumptions", async () => {
    const { rpc, state } = createDaoRpcFixture();
    state.values.status = 1n;
    (state.values.proposals as { vetoed: boolean }).vetoed = false;
    state.values.vote_start = 1209600n;
    state.values.genesis = BigInt(V2_GENESIS + 3600);
    state.values.decay_length = 86400n;
    const result = await readDaoLiveAccount(feed, V2_DEPLOYMENTS, ref, V2_ACCOUNT, { rpc, walletChainId: 1 });
    expect(result.capabilities.canVote).toBe(false);
    const remaining = 86400n - BigInt((state.timestamp - V2_GENESIS - 3600) % 1209600 - (1209600 - 86400));
    const expectedBps = Number(remaining * 10000n / 86400n);
    expect(result.decayBps).toBe(expectedBps);
    expect(result.liveProposal?.thresholdBps).toBe(5000);
  });

  it("recognizes already-voted accounts and zero current weight", async () => {
    const { rpc, state } = createDaoRpcFixture();
    state.values.votes = { weight: 10n, yea: 10n };
    let result = await readDaoLiveAccount(feed, V2_DEPLOYMENTS, ref, V2_ACCOUNT, { rpc, walletChainId: 1 });
    expect(result.hasVoted).toBe(true);
    expect(result.capabilities.canVote).toBe(false);
    state.values.votes = { weight: 0n, yea: 0n };
    state.values.weight = 0n;
    result = await readDaoLiveAccount(feed, V2_DEPLOYMENTS, ref, V2_ACCOUNT, { rpc, walletChainId: 1 });
    expect(result.capabilities.canVote).toBe(false);
  });

  it.each(["wrong-wallet", "wrong-rpc", "failure", "reorg", "commitment", "unsupported-voter", "contradictory-flags", "stale-head"])("fails closed for %s", async reason => {
    const { rpc, state } = createDaoRpcFixture();
    if (reason === "stale-head") state.timestamp -= 301;
    if (reason === "wrong-rpc") state.chain = "0xa";
    if (reason === "failure") state.fail = true;
    if (reason === "reorg") state.replaced = true;
    if (reason === "commitment") (state.values.proposals as { script_hash: string }).script_hash = v2Hash(2);
    if (reason === "unsupported-voter") state.values.voter = V2_ACCOUNT;
    if (reason === "contradictory-flags") (state.values.proposals as { flagged: boolean }).flagged = true;
    await expect(readDaoLiveAccount(feed, V2_DEPLOYMENTS, ref, V2_ACCOUNT,
      { rpc, walletChainId: reason === "wrong-wallet" ? 10 : 1 })).rejects.toThrow();
  });

  it("bounds a stalled RPC without falling back to unpinned reads", async () => {
    vi.useFakeTimers();
    const rpc = { request: vi.fn(() => new Promise<never>(() => undefined)) };
    const rejected = expect(readDaoLiveAccount(feed, V2_DEPLOYMENTS, ref, V2_ACCOUNT, { rpc, walletChainId: 1 })).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(rpc.request).toHaveBeenCalledTimes(1);
  });

  it("reads global proposals without RPC and requires current state for writes", async () => {
    const client = new OnchainDaoClient(V2_DEPLOYMENTS, async () => feed);
    expect((await client.getFeed()).proposals[0].ref).toEqual(ref);
    expect((await client.getProposal(ref)).state).toBe("found");
    const unloaded = new OnchainDaoClient(V2_DEPLOYMENTS, async () => feed);
    await expect(unloaded.prepareVote(ref, V2_ACCOUNT, "yea")).rejects.toThrow("Load a DAO snapshot");
  });
});
