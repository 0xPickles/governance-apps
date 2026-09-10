import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, parseAbi, type Hex } from "viem";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";
import { parseDaoFeed } from "@/lib/schemas/dao-feed";
import { prepareDaoLiveAction, prepareDaoLivePropose, readDaoLiveProposer, type DaoWalletContext } from "@/lib/clients/dao/writes";
import { createDaoRpcFixture } from "../../../fixtures/dao-rpc-v2";
import { V2_ACCOUNT, V2_DEPLOYMENTS, V2_NOW, V2_VOTER, V2_VOTING, v2Hash } from "../../../fixtures/dao-feed-v2";
const actionAbi = parseAbi([
  "function vote_yea(address,uint256) returns (uint256)", "function vote_nay(address,uint256) returns (uint256)",
  "function retract(uint256)", "function flag(uint256,string)", "function veto(uint256,string)", "function execute(uint256,bytes)",
  "function propose(bytes32,bytes) returns (uint256)",
]);
const proposerAbi = parseAbi([
  "function genesis() view returns (uint256)", "function hooks() view returns (address)", "function propose_blacklist() view returns (address)",
  "function propose_min_weight() view returns (uint256)", "function propose_cooldown() view returns (uint256)", "function last_proposed(address) view returns (uint256)",
  "function blacklist(address) view returns (bool)", "function voting(address) view returns (bool)", "function num_proposals(uint256) view returns (uint256)",
]);
const ref = { chainId: 1, votingAddress: V2_VOTING, proposalId: 0n } as const;
function setup() {
  const fixture = createDaoRpcFixture();
  const simulations: Array<{ from: string; to: string; data: Hex }> = [];
  const changes = { rejectSimulation: false, walletChain: 1, walletAddress: V2_ACCOUNT as string, capacity: 0n, blacklisted: false, last: 0n };
  const base = fixture.rpc.request;
  const rpc = { request: vi.fn<DaoWalletContext["rpc"]["request"]>(async input => {
    if (input.method === "eth_call") {
      const call = input.params?.[0] as { from?: string; to: string; data: Hex };
      if (call.from) {
        simulations.push(call as { from: string; to: string; data: Hex });
        if (changes.rejectSimulation) throw new Error("Required simulation unavailable");
        return "0x";
      }
      try {
        const decoded = decodeFunctionData({ abi: proposerAbi, data: call.data });
        const values: Record<string, unknown> = {
          genesis: BigInt(V2_DEPLOYMENTS[0].genesis), hooks: V2_ACCOUNT, propose_blacklist: V2_ACCOUNT,
          propose_min_weight: 1n, propose_cooldown: 86400n, last_proposed: changes.last,
          blacklist: changes.blacklisted, voting: true, num_proposals: changes.capacity,
        };
        return encodeFunctionResult({ abi: proposerAbi, functionName: decoded.functionName, result: values[decoded.functionName] as never });
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "AbiFunctionSignatureNotFoundError") throw error;
      }
    }
    return base(input);
  }) };
  const context: DaoWalletContext = {
    rpc, walletChainId: 1,
    getWallet: async () => ({ address: changes.walletAddress as typeof V2_ACCOUNT, chainId: changes.walletChain }),
    send: vi.fn(async () => v2Hash(99)),
  };
  const deployments = structuredClone(V2_DEPLOYMENTS);
  deployments[0].supportedProposeHooks = [V2_ACCOUNT];
  const feed = parseDaoFeed(structuredClone(saved));
  return { ...fixture, changes, context, deployments, feed, simulations };
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime((V2_NOW + 120) * 1000); });
afterEach(() => vi.useRealTimers());
describe("DAO exact transaction preparation", () => {
  it("simulates and submits the current Voter with the actual caller and ID zero", async () => {
    const f = setup();
    const prepared = await prepareDaoLiveAction({ ...f, ref, address: V2_ACCOUNT, action: "vote", direction: "nay" });
    expect(f.context.send).not.toHaveBeenCalled();
    expect(f.simulations[0]).toMatchObject({ from: V2_ACCOUNT, to: V2_VOTER });
    expect(decodeFunctionData({ abi: actionAbi, data: f.simulations[0].data })).toEqual({ functionName: "vote_nay", args: [V2_VOTING, 0n] });
    await prepared();
    expect(f.simulations).toHaveLength(2);
    expect(f.context.send).toHaveBeenCalledWith({ chainId: 1, from: V2_ACCOUNT, to: V2_VOTER, data: f.simulations[0].data });
    await expect(prepared()).rejects.toThrow("already submitted");
  });
  it.each(["account", "network", "head", "script", "configuration", "simulation", "expired"])("rejects %s changes after preparation", async change => {
    const f = setup();
    const prepared = await prepareDaoLiveAction({ ...f, ref, address: V2_ACCOUNT, action: "vote", direction: "yea" });
    if (change === "account") f.changes.walletAddress = V2_VOTER;
    if (change === "network") f.changes.walletChain = 10;
    if (change === "head") f.state.hash = v2Hash(777);
    if (change === "script") f.feed.proposals[0].scriptBytes = "0x";
    if (change === "configuration") f.deployments[0].supportedVoters = [];
    if (change === "simulation") f.changes.rejectSimulation = true;
    if (change === "expired") vi.setSystemTime((V2_NOW + 1000) * 1000);
    await expect(prepared()).rejects.toThrow();
    expect(f.context.send).not.toHaveBeenCalled();
  });
  it("never lets the shared transport fallback bypass failed DAO simulation", async () => {
    const f = setup(); f.changes.rejectSimulation = true;
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK", "true");
    await expect(prepareDaoLiveAction({ ...f, ref, address: V2_ACCOUNT, action: "vote", direction: "yea" })).rejects.toThrow("simulation");
    expect(f.context.send).not.toHaveBeenCalled(); vi.unstubAllEnvs();
  });
  it("does not require proposal content for voting", async () => {
    const f = setup(); f.feed.proposals[0].contentBytes = null;
    const prepared = await prepareDaoLiveAction({ ...f, ref, address: V2_ACCOUNT, action: "vote", direction: "yea" });
    await prepared(); expect(f.context.send).toHaveBeenCalledOnce();
  });
  it("reads actual hooks and six capacity counts, and fails closed for unsupported hooks", async () => {
    const f = setup();
    const eligible = await readDaoLiveProposer(f.deployments[0], V2_ACCOUNT, f.context);
    expect(eligible.canPropose).toBe(true); expect(eligible.affectedBoostEpochs).toHaveLength(6);
    f.changes.capacity = 64n;
    expect((await readDaoLiveProposer(f.deployments[0], V2_ACCOUNT, f.context)).canPropose).toBe(false);
    f.deployments[0].supportedProposeHooks = [];
    await expect(readDaoLiveProposer(f.deployments[0], V2_ACCOUNT, f.context)).rejects.toThrow("hook");
  });
  it("simulates actual creation including hooks and prevents epoch drift", async () => {
    const f = setup();
    const proposer = await readDaoLiveProposer(f.deployments[0], V2_ACCOUNT, f.context);
    const prepared = await prepareDaoLivePropose(f.deployments, V2_ACCOUNT, v2Hash(22), "0x", proposer.expectedVotingEpoch, f.context);
    await prepared();
    expect(decodeFunctionData({ abi: actionAbi, data: f.simulations[0].data })).toEqual({ functionName: "propose", args: [v2Hash(22), "0x"] });
    await expect(prepareDaoLivePropose(f.deployments, V2_ACCOUNT, v2Hash(22), "0x", proposer.expectedVotingEpoch + 1n, f.context)).rejects.toThrow("epoch");
  });
});
