import { decodeFunctionResult, encodeFunctionData, parseAbi, type Abi, type Address, type Hex, type PublicClient } from "viem";
import { z } from "@/lib/schemas/zod";
import { DAO_EPOCH_SECONDS, DAO_MAX_TIMESTAMP, validateDaoConfiguration, validateDaoStoredFacts, DaoAddressSchema, DaoHashSchema, DaoProposalWireSchema, DaoSnapshotConfigurationSchema, DaoFeedError, type DaoFeedWire } from "@/lib/schemas/dao-feed";
import { adaptDaoProposal } from "./feed-adapter";
import { DaoFeedReader } from "./feed";
import { type DaoDeployment } from "./deployment";
import { deriveDaoCapabilities, deriveDaoVotingWeight, serializeDaoProposalRef } from "./domain";
import { addDaoExecutionPreflight, prepareDaoLiveAction, prepareDaoLivePropose, readDaoLiveProposer, type DaoWalletContext } from "./writes";
import type { DaoVoteDirection } from "./types";
import type { DaoClient } from "./client";
import type { DaoAccountProposalState, DaoProposalRef } from "./types";

export const DAO_VOTING_ABI = parseAbi([
  "function proposals(uint256) view returns ((address proposer,uint256 epoch,bytes32 ipfs,bytes32 script_hash,uint256 threshold,uint256 votes,uint256 yea,bool retracted,bool executed,bool flagged,bool vetoed))",
  "function status(uint256) view returns (uint256)",
  "function votes(address,uint256) view returns ((uint256 weight,uint256 yea))",
  "function voter() view returns (address)",
  "function executor() view returns (address)",
  "function operator() view returns (address)",
  "function guardian() view returns (address)",
  "function weight_measure() view returns (address)",
  "function vote_start() view returns (uint256)",
  "function execute_delay() view returns (uint256)",
  "function execute_guard() view returns (bool)",
  "function threshold() view returns (uint256)",
  "function execute(uint256,bytes)",
]);
const VOTER_ABI = parseAbi(["function genesis() view returns (uint256)", "function decay_length() view returns (uint256)"]);
const WEIGHT_ABI = parseAbi(["function weight(address) view returns (uint256)"]);
export type DaoRpc = { request: (input: { method: string; params?: readonly unknown[] }) => Promise<unknown> };
export type DaoReadContext = { rpc: DaoRpc; walletChainId: number | undefined };
export function daoRpcFromPublicClient(client: PublicClient): DaoRpc {
  return { request: (input) => client.request(input as Parameters<PublicClient["request"]>[0]) };
}

export const daoBlockSchema = z.object({
  number: z.string().regex(/^0x[0-9a-f]+$/),
  hash: DaoHashSchema,
  timestamp: z.string().regex(/^0x[0-9a-f]+$/),
});
const protocolStatuses = ["PROPOSED", "RETRACTED", "VOTING", "PASSED", "FAILED", "EXECUTED", "EXPIRED", "INVALID", "FLAGGED", "VETOED"] as const;

export async function readDaoRpc(rpc: DaoRpc, address: Address, abi: Abi, name: string, args: readonly unknown[], blockHash: Hex) {
  const data = encodeFunctionData({ abi, functionName: name, args });
  const result = await rpc.request({ method: "eth_call", params: [{ to: address, data }, { blockHash, requireCanonical: true }] });
  if (typeof result !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(result)) throw new Error("Invalid DAO RPC result.");
  return decodeFunctionResult({ abi, functionName: name, data: result as Hex });
}

/** One EIP-1898 block for every dependent read. Unsupported providers fail closed. */
async function acquireDaoLiveAccount(
  feed: DaoFeedWire,
  deployments: readonly DaoDeployment[],
  ref: DaoProposalRef,
  account: Address,
  context: DaoReadContext,
): Promise<DaoAccountProposalState & { preparationConfiguration: string }> {
  const deployment = deployments.find((d) => d.chainId === ref.chainId && d.votingAddress === ref.votingAddress.toLowerCase());
  const original = feed.proposals.find((p) => p.votingAddress === ref.votingAddress.toLowerCase() && p.id === ref.proposalId.toString());
  if (!deployment || !original) throw new Error("Unknown DAO proposal or deployment.");
  if (context.walletChainId !== ref.chainId) throw new Error("Switch to the proposal network to load current wallet eligibility.");
  const { rpc } = context;
  const chain = await rpc.request({ method: "eth_chainId" });
  if (typeof chain !== "string" || BigInt(chain) !== BigInt(ref.chainId)) throw new Error("DAO RPC is on the wrong chain.");
  const block = daoBlockSchema.parse(await rpc.request({ method: "eth_getBlockByNumber", params: ["latest", false] }));
  const number = BigInt(block.number);
  const timestamp = Number(BigInt(block.timestamp));
  if (!Number.isSafeInteger(timestamp) || timestamp > DAO_MAX_TIMESTAMP || timestamp < deployment.genesis) throw new Error("Invalid DAO live block time.");
  const now = Math.floor(Date.now() / 1000);
  if (timestamp < now - 300 || timestamp > now + 60) throw new Error("DAO RPC head is stale or has an invalid future time.");
  const hash = block.hash as Hex;
  const call = (name: string, args: readonly unknown[] = []) => readDaoRpc(rpc, deployment.votingAddress, DAO_VOTING_ABI, name, args, hash);
  const names = ["proposals", "status", "votes", "voter", "executor", "operator", "guardian", "weight_measure", "vote_start", "execute_delay", "execute_guard", "threshold"];
  const values = await Promise.all(names.map((name) => call(name,
    name === "proposals" || name === "status" ? [ref.proposalId] : name === "votes" ? [account, ref.proposalId] : [])));
  const stored = values[0] as { proposer: Address; epoch: bigint; ipfs: Hex; script_hash: Hex; threshold: bigint; votes: bigint; yea: bigint; retracted: boolean; executed: boolean; flagged: boolean; vetoed: boolean };
  const status = protocolStatuses.find((_, index) => (1n << BigInt(index)) === values[1]);
  if (!status || status === "INVALID") throw new Error("DAO proposal is absent from the current canonical state.");
  const contribution = values[2] as { weight: bigint; yea: bigint };
  const voter = DaoAddressSchema.parse(String(values[3]).toLowerCase()) as Address;
  const executor = DaoAddressSchema.parse(String(values[4]).toLowerCase()) as Address;
  const operator = DaoAddressSchema.parse(String(values[5]).toLowerCase());
  const guardian = DaoAddressSchema.parse(String(values[6]).toLowerCase());
  const measure = DaoAddressSchema.parse(String(values[7]).toLowerCase()) as Address;
  const config = DaoSnapshotConfigurationSchema.parse({
    voter, executor, voteStart: String(values[8]), executeDelay: String(values[9]),
    executeGuard: values[10], threshold: String(values[11]),
  });
  validateDaoConfiguration(config);
  const proposal = DaoProposalWireSchema.parse({
    ...original, proposer: stored.proposer.toLowerCase(), epoch: String(stored.epoch),
    contentDigest: stored.ipfs, scriptHash: stored.script_hash,
    threshold: String(stored.threshold), votes: String(stored.votes), yea: String(stored.yea),
    retracted: stored.retracted, executed: stored.executed, flagged: stored.flagged, vetoed: stored.vetoed, status,
  });
  validateDaoStoredFacts(proposal);
  for (const field of ["proposer", "epoch", "contentDigest", "scriptHash", "threshold"] as const) {
    if (proposal[field] !== original[field]) throw new Error("Live proposal commitments differ from the snapshot. Refresh after canonical recovery.");
  }
  const supportedVoter = deployment.supportedVoters.includes(voter);
  if (!supportedVoter) throw new Error("Current Voter implementation is not supported for wallet eligibility.");
  const [weightValue, genesisValue, decayValue] = await Promise.all([
    readDaoRpc(rpc, measure, WEIGHT_ABI, "weight", [account], hash),
    readDaoRpc(rpc, voter, VOTER_ABI, "genesis", [], hash),
    readDaoRpc(rpc, voter, VOTER_ABI, "decay_length", [], hash),
  ]);
  const votingWeight = weightValue as bigint;
  const voterGenesis = genesisValue as bigint;
  const decayLength = decayValue as bigint;
  if (voterGenesis > BigInt(timestamp) || decayLength >= BigInt(DAO_EPOCH_SECONDS / 2)) throw new Error("Unsupported live Voter configuration.");
  const voterEpochEnd = voterGenesis + ((BigInt(timestamp) - voterGenesis) / BigInt(DAO_EPOCH_SECONDS) + 1n) * BigInt(DAO_EPOCH_SECONDS);
  const weight = deriveDaoVotingWeight({ votingWeight, now: timestamp, voteEndsAt: Number(voterEpochEnd), decayLengthSeconds: Number(decayLength) });
  const observation = { number, hash, timestamp };
  const liveProposal = adaptDaoProposal(proposal, { chainId: ref.chainId, block: { number: number.toString(), hash, timestamp } }, config, deployment);
  // Even with hash-pinned calls, reject a block that became noncanonical while
  // reading. A provider unable to serve EIP-1898 must not fall back to latest.
  const canonical = daoBlockSchema.parse(await rpc.request({ method: "eth_getBlockByNumber", params: [block.number, false] }));
  if (canonical.hash !== hash) throw new Error("DAO live block was replaced during the read.");
  const facts = {
    address: account, connected: true, correctChain: true, ...weight, observation,
    hasVoted: contribution.weight > 0n,
    voteDirection: contribution.weight > 0n && contribution.yea === contribution.weight ? "yea" as const : contribution.weight > 0n && contribution.yea === 0n ? "nay" as const : null,
    isProposer: account.toLowerCase() === stored.proposer.toLowerCase(),
    isOperator: account.toLowerCase() === operator,
    isGuardian: account.toLowerCase() === guardian,
    executionPreflight: { call: null, state: "idle" as const, scriptHash: stored.script_hash, observation: null, contextKey: null, simulatedAt: null, error: null },
  };
  return {
    preparationConfiguration: JSON.stringify([config, operator, guardian, measure, String(voterGenesis), String(decayLength)]),
    ...facts, observation, liveProposal, writesEnabled: true,
    capabilities: deriveDaoCapabilities({
      proposal: liveProposal, account: facts, now: timestamp,
      vetoEndsAt: liveProposal.voteEndsAt + DAO_EPOCH_SECONDS,
      executionGuard: config.executeGuard ? "guarded" : "permissionless",
    }),
  };
}

export class OnchainDaoClient implements DaoClient {
  readonly reader: DaoFeedReader;
  constructor(private readonly deployments: readonly DaoDeployment[], fetchFeed?: () => Promise<DaoFeedWire>, private readonly walletContext?: () => Promise<DaoWalletContext>) {
    this.reader = new DaoFeedReader(deployments, fetchFeed);
  }
  getFeed() { return this.reader.refresh(); }
  async getProposal(ref: DaoProposalRef) {
    const feed = this.reader.current() ?? await this.getFeed();
    const proposal = feed.proposals.find((p) => serializeDaoProposalRef(p.ref) === serializeDaoProposalRef(ref));
    return proposal ? { state: "found" as const, proposal } : { state: "not_found" as const, ref, protocolStatus: "invalid" as const, displayStatus: "not_found" as const };
  }
  async getAccountProposalState(ref: DaoProposalRef, address: Address, context?: DaoReadContext) {
    if (!context) throw new Error("DAO RPC is unavailable.");
    const feed = this.reader.wire();
    if (!feed) throw new DaoFeedError("unavailable", "Load a DAO snapshot before current eligibility.");
    return addDaoExecutionPreflight(await readDaoLiveAccount(feed, this.deployments, ref, address, context), context);
  }
  private async context() {
    if (this.walletContext) return this.walletContext();
    return (await import("./wallet")).getDaoWalletContext();
  }
  async getProposerState(address: Address, context?: DaoReadContext) {
    const deployment = this.deployments.find(d => d.active);
    if (!deployment) throw new Error("No active trusted DAO deployment.");
    return readDaoLiveProposer(deployment, address, context ?? await this.context());
  }
  private async prepare(action: import("./types").DaoActionType, ref: DaoProposalRef, address: Address, direction?: DaoVoteDirection, reason?: string) {
    const feed = this.reader.wire();
    if (!feed) throw new Error("Load a DAO snapshot before preparing an action.");
    return prepareDaoLiveAction({ deployments: this.deployments, feed, action, ref, address, direction, reason, context: await this.context() });
  }
  prepareVote(ref: DaoProposalRef, address: Address, direction: DaoVoteDirection) { return this.prepare("vote", ref, address, direction); }
  prepareRetract(ref: DaoProposalRef, address: Address) { return this.prepare("retract", ref, address); }
  prepareFlag(ref: DaoProposalRef, address: Address, reason: string) { return this.prepare("flag", ref, address, undefined, reason); }
  prepareVeto(ref: DaoProposalRef, address: Address, reason: string) { return this.prepare("veto", ref, address, undefined, reason); }
  prepareExecute(ref: DaoProposalRef, address: Address) { return this.prepare("execute", ref, address); }
  async preparePropose(address: Address, digest: Hex, script: Hex, expectedEpoch: bigint) {
    return prepareDaoLivePropose(this.deployments, address, digest, script, expectedEpoch, await this.context());
  }
}

export async function readDaoLiveAccount(...args: Parameters<typeof acquireDaoLiveAccount>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      acquireDaoLiveAccount(...args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DAO live RPC request timed out.")), 10_000);
      }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
