import { encodeFunctionData, keccak256, parseAbi, type Address, type Hex } from "viem";
import type { PreparedTransaction } from "@/lib/tx/types";
import { DAO_EPOCH_SECONDS, DAO_MAX_TIMESTAMP, type DaoFeedWire } from "@/lib/schemas/dao-feed";
import { daoDeploymentScope, type DaoDeployment } from "./deployment";
import { deriveDaoCapabilities, deriveDaoProposerState, validateDaoModerationReason } from "./domain";
import { createDaoExecuteCall, daoExecutionContextKey } from "./execute-call";
import { checkDaoExecutorScript } from "./script";
import { DAO_VOTING_ABI, readDaoLiveAccount, readDaoRpc, daoBlockSchema, type DaoReadContext } from "./onchain";
import type { DaoActionType, DaoAccountProposalState, DaoProposerState, DaoStateObservation, DaoProposalRef, DaoVoteDirection } from "./types";

export type DaoTransactionCall = Readonly<{ chainId: number; from: Address; to: Address; data: Hex }>;
export type DaoPreparedTransaction = PreparedTransaction & { daoCall: DaoTransactionCall };
export function daoPreparedCall(prepared: PreparedTransaction): DaoTransactionCall {
  const call = (prepared as DaoPreparedTransaction).daoCall;
  if (!call) throw new Error("DAO preparation has no verified transaction call.");
  return call;
}
export function daoProposeCall(chainId: number, from: Address, to: Address, digest: Hex, script: Hex): DaoTransactionCall {
  return Object.freeze({ chainId, from, to, data: encodeFunctionData({ abi: authoringAbi, functionName: "propose", args: [digest, script] }) });
}

export type DaoWalletContext = DaoReadContext & {
  getWallet: () => Promise<{ address: Address; chainId: number }>;
  send: (call: { chainId: number; from: Address; to: Address; data: Hex }) => Promise<Hex>;
};
const authoringAbi = parseAbi([
  "function genesis() view returns (uint256)",
  "function hooks() view returns (address)",
  "function weight_measure() view returns (address)",
  "function propose_blacklist() view returns (address)",
  "function propose_min_weight() view returns (uint256)",
  "function propose_cooldown() view returns (uint256)",
  "function last_proposed(address) view returns (uint256)",
  "function executor() view returns (address)",
  "function propose(bytes32,bytes) returns (uint256)",
]);
const hookAbi = parseAbi([
  "function genesis() view returns (uint256)",
  "function voting(address) view returns (bool)",
  "function num_proposals(uint256) view returns (uint256)",
]);
const dependencyAbi = parseAbi([
  "function blacklist(address) view returns (bool)",
  "function weight(address) view returns (uint256)",
]);
const actionsAbi = parseAbi([
  "function vote_yea(address,uint256) returns (uint256)",
  "function vote_nay(address,uint256) returns (uint256)",
  "function retract(uint256)",
  "function flag(uint256,string)",
  "function veto(uint256,string)",
]);
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sameBlock = (a: DaoStateObservation, b: DaoStateObservation) =>
  eq(a.hash, b.hash) && a.number === b.number && a.timestamp === b.timestamp;
const reviewKey = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
export class DaoPreparationChangedError extends Error {
  readonly name = "DaoPreparationChangedError";
}

export function assertDaoFreshObservation(observation: DaoStateObservation) {
  const now = Math.floor(Date.now() / 1000);
  if (observation.timestamp < now - 300 || observation.timestamp > now + 60) {
    throw new DaoPreparationChangedError("DAO RPC head is stale or has an invalid future time. Refresh and review the action again. No transaction was submitted.");
  }
}

async function latest(context: DaoReadContext, deployment: DaoDeployment): Promise<DaoStateObservation> {
  if (context.walletChainId !== deployment.chainId) throw new Error("Switch to the proposal network.");
  const chain = await context.rpc.request({ method: "eth_chainId" });
  if (typeof chain !== "string" || BigInt(chain) !== BigInt(deployment.chainId)) throw new Error("DAO RPC is on the wrong chain.");
  const block = daoBlockSchema.parse(await context.rpc.request({ method: "eth_getBlockByNumber", params: ["latest", false] }));
  const observation = { number: BigInt(block.number), hash: block.hash as Hex, timestamp: Number(BigInt(block.timestamp)) };
  if (!Number.isSafeInteger(observation.timestamp) || observation.timestamp > DAO_MAX_TIMESTAMP || observation.timestamp < deployment.genesis) throw new Error("Invalid DAO block time.");
  assertDaoFreshObservation(observation);
  return observation;
}

export async function assertDaoCanonical(context: DaoReadContext, observation: DaoStateObservation) {
  assertDaoFreshObservation(observation);
  const block = daoBlockSchema.parse(await context.rpc.request({
    method: "eth_getBlockByNumber",
    params: ["0x" + observation.number.toString(16), false],
  }));
  if (!eq(block.hash, observation.hash) || BigInt(block.number) !== observation.number || Number(BigInt(block.timestamp)) !== observation.timestamp) {
    throw new DaoPreparationChangedError("DAO canonical block changed. Review the action again. No transaction was submitted.");
  }
}

export async function simulateDaoCall(context: DaoReadContext, call: { from: Address; to: Address; data: Hex }, observation: DaoStateObservation) {
  const result = await context.rpc.request({ method: "eth_call", params: [
    { ...call, value: "0x0" }, { blockHash: observation.hash, requireCanonical: true },
  ] });
  if (typeof result !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(result)) throw new Error("Invalid DAO simulation response.");
  await assertDaoCanonical(context, observation);
}

async function assertWallet(context: DaoWalletContext, address: Address, chainId: number) {
  const current = await context.getWallet();
  if (!eq(current.address, address) || current.chainId !== chainId) throw new Error("Wallet account or network changed. Review the action again.");
}

export async function readDaoLiveProposer(deployment: DaoDeployment, address: Address, context: DaoReadContext): Promise<DaoProposerState & { preparationConfiguration: string }> {
  const observation = await latest(context, deployment);
  const call = (name: string, args: readonly unknown[] = []) => readDaoRpc(context.rpc, deployment.votingAddress, authoringAbi, name, args, observation.hash);
  const [genesis, hooks, measure, blacklist, minimum, cooldown, last] = await Promise.all([
    call("genesis"), call("hooks"), call("weight_measure"), call("propose_blacklist"),
    call("propose_min_weight"), call("propose_cooldown"), call("last_proposed", [address]),
  ]) as [bigint, Address, Address, Address, bigint, bigint, bigint];
  if (genesis !== BigInt(deployment.genesis)) throw new Error("Voting genesis differs from the trusted deployment.");
  if (!deployment.supportedProposeHooks?.some(hook => eq(hook, hooks))) throw new Error("Current proposal hook is not independently configured as supported.");
  const [weight, blacklisted, hookGenesis, registered] = await Promise.all([
    readDaoRpc(context.rpc, measure, dependencyAbi, "weight", [address], observation.hash),
    readDaoRpc(context.rpc, blacklist, dependencyAbi, "blacklist", [address], observation.hash),
    readDaoRpc(context.rpc, hooks, hookAbi, "genesis", [], observation.hash),
    readDaoRpc(context.rpc, hooks, hookAbi, "voting", [deployment.votingAddress], observation.hash),
  ]) as [bigint, boolean, bigint, boolean];
  if (hookGenesis !== genesis || !registered) throw new Error("Proposal reward hook configuration is incompatible.");
  const epoch = (BigInt(observation.timestamp) - genesis) / BigInt(DAO_EPOCH_SECONDS) + 1n;
  const counts = await Promise.all(Array.from({ length: 6 }, (_, i) =>
    readDaoRpc(context.rpc, hooks, hookAbi, "num_proposals", [epoch + BigInt(i)], observation.hash))) as bigint[];
  if (cooldown > BigInt(DAO_EPOCH_SECONDS) || last > BigInt(observation.timestamp) || counts.some(count => count > 64n)) throw new Error("Invalid current proposer state.");
  await assertDaoCanonical(context, observation);
  return {
    preparationConfiguration: reviewKey([genesis, hooks, measure, blacklist, minimum, cooldown]),
    ...deriveDaoProposerState({
      address, connected: true, correctChain: true, now: observation.timestamp,
      currentWeight: weight, minimumWeight: minimum, blacklisted, lastProposedAt: last === 0n ? null : Number(last),
      cooldownSeconds: Number(cooldown), expectedVotingEpoch: epoch,
      affectedBoostEpochs: counts.map((count, i) => ({ epoch: epoch + BigInt(i), currentProposalCount: Number(count), proposalLimit: 64 })),
    }),
    observation,
  };
}

/** Execution readiness comes only from actual Voting.execute at the live observation. */
export async function addDaoExecutionPreflight(state: DaoAccountProposalState, context: DaoReadContext): Promise<DaoAccountProposalState> {
  const proposal = state.liveProposal, observation = state.observation;
  if (!proposal || !observation || proposal.type !== "executable" || !proposal.script.bytes ||
      proposal.script.framing !== "supported" || !proposal.script.hashVerified ||
      checkDaoExecutorScript(proposal.script.bytes, "executable").state === "invalid") return state;
  const input = {
    proposal, account: state, now: observation.timestamp, vetoEndsAt: proposal.voteEndsAt + DAO_EPOCH_SECONDS,
    executionGuard: proposal.rules.executionGuard ?? "guarded" as const,
  };
  const call = createDaoExecuteCall(proposal.ref, state.address, proposal.script.bytes);
  try {
    await simulateDaoCall(context, { from: call.caller, to: call.to, data: call.data }, observation);
    state.executionPreflight = {
      state: "succeeded", call, scriptHash: proposal.script.hash, observation,
      contextKey: daoExecutionContextKey(input)!, simulatedAt: new Date().toISOString(), error: null,
    };
  } catch {
    state.executionPreflight = { ...state.executionPreflight, state: "failed", error: "Actual Voting.execute simulation failed or is unavailable." };
  }
  return { ...state, capabilities: deriveDaoCapabilities({ ...input, account: state }) };
}

export async function prepareDaoLiveAction(args: {
  deployments: readonly DaoDeployment[]; feed: DaoFeedWire; ref: DaoProposalRef; address: Address;
  action: DaoActionType; context: DaoWalletContext; direction?: DaoVoteDirection; reason?: string;
}): Promise<DaoPreparedTransaction> {
  const { deployments, feed, ref, address, action, context } = args;
  const scope = daoDeploymentScope(deployments);
  const deployment = deployments.find(d => d.chainId === ref.chainId && eq(d.votingAddress, ref.votingAddress));
  if (!deployment) throw new Error("Unknown trusted DAO deployment.");
  const inputKey = () => reviewKey([args.action, args.direction, args.reason, ref, address,
    feed.proposals.find(p => p.votingAddress === ref.votingAddress.toLowerCase() && p.id === ref.proposalId.toString())]);
  const reviewedInputs = inputKey();
  const checkInputs = () => {
    if (scope !== daoDeploymentScope(deployments) || inputKey() !== reviewedInputs) {
      throw new DaoPreparationChangedError("DAO proposal inputs or deployment configuration changed. Review the action again. No transaction was submitted.");
    }
  };
  const prepare = async (): Promise<DaoPreparation> => {
    await assertWallet(context, address, ref.chainId);
    const live = await readDaoLiveAccount(feed, deployments, ref, address, context);
    let state: DaoAccountProposalState = live;
    if (action === "execute") state = await addDaoExecutionPreflight(state, context);
    const proposal = state.liveProposal!, observation = state.observation!;
    const genesis = await readDaoRpc(context.rpc, deployment.votingAddress, authoringAbi, "genesis", [], observation.hash);
    if (genesis !== BigInt(deployment.genesis)) throw new Error("Voting genesis differs from the trusted deployment.");
    const capability = { vote: "canVote", retract: "canRetract", flag: "canFlag", veto: "canVeto", execute: "canExecute" } as const;
    if (!state.capabilities[capability[action]]) throw new DaoPreparationChangedError("This action is not permitted by current DAO state. Refresh and review it again. No transaction was submitted.");
    let to = deployment.votingAddress;
    let data: Hex;
    if (action === "vote") {
      if (args.direction !== "yea" && args.direction !== "nay") throw new Error("Choose Yea or Nay.");
      const voter = await readDaoRpc(context.rpc, to, DAO_VOTING_ABI, "voter", [], observation.hash) as Address;
      if (!deployment.supportedVoters.some(a => eq(a, voter))) throw new Error("Unsupported current Voter.");
      data = encodeFunctionData({ abi: actionsAbi, functionName: args.direction === "yea" ? "vote_yea" : "vote_nay", args: [to, ref.proposalId] });
      to = voter;
    } else if (action === "execute") {
      const executor = await readDaoRpc(context.rpc, to, DAO_VOTING_ABI, "executor", [], observation.hash) as Address;
      if (!deployment.supportedExecutors.some(a => eq(a, executor)) || !proposal.script.bytes ||
          !eq(keccak256(proposal.script.bytes), proposal.script.hash)) throw new Error("Execution script or current Executor is unsupported.");
      data = createDaoExecuteCall(ref, address, proposal.script.bytes).data;
    } else if (action === "retract") {
      data = encodeFunctionData({ abi: actionsAbi, functionName: "retract", args: [ref.proposalId] });
    } else {
      const reason = validateDaoModerationReason(args.reason ?? "");
      if (reason.error) throw new Error(reason.error);
      data = encodeFunctionData({ abi: actionsAbi, functionName: action, args: [ref.proposalId, reason.value] });
    }
    const call = Object.freeze({ chainId: ref.chainId, from: address, to, data });
    await simulateDaoCall(context, call, observation);
    // Block identity and the simulation belong to this preparation only. All other
    // displayed facts, permissions and contract configuration must survive a refresh.
    return { call, observation, review: reviewKey({ ...state, observation: undefined, executionPreflight: undefined,
      liveProposal: { ...proposal, rules: { ...proposal.rules, observationBlockNumber: undefined } },
      configuration: live.preparationConfiguration }) };
  };
  return preparedSubmission(context, deployment, await prepare(), checkInputs, prepare);
}

export async function prepareDaoLivePropose(
  deployments: readonly DaoDeployment[], address: Address, digest: Hex, script: Hex,
  expectedEpoch: bigint, context: DaoWalletContext,
): Promise<DaoPreparedTransaction> {
  const deployment = deployments.find(d => d.active);
  if (!deployment) throw new Error("No active trusted DAO deployment.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(digest)) throw new Error("Invalid published content digest.");
  const type = script === "0x" ? "signal" : "executable";
  if (checkDaoExecutorScript(script, type).state === "invalid") throw new Error("Invalid proposal script.");
  const scope = daoDeploymentScope(deployments);
  const checkInputs = () => {
    if (scope !== daoDeploymentScope(deployments)) throw new DaoPreparationChangedError("DAO deployment configuration changed. Review the action again. No transaction was submitted.");
  };
  const prepare = async (): Promise<DaoPreparation> => {
    await assertWallet(context, address, deployment.chainId);
    const proposer = await readDaoLiveProposer(deployment, address, context);
    if (!proposer.canPropose || proposer.expectedVotingEpoch !== expectedEpoch) throw new DaoPreparationChangedError(proposer.proposeBlockedReason ?? "Proposal epoch changed. Review the action again. No transaction was submitted.");
    const observation = proposer.observation!;
    const executor = await readDaoRpc(context.rpc, deployment.votingAddress, authoringAbi, "executor", [], observation.hash) as Address;
    if (type === "executable") {
      if (!deployment.supportedExecutors.some(a => eq(a, executor))) throw new Error("Unsupported current Executor.");
    }
    const call = daoProposeCall(deployment.chainId, address, deployment.votingAddress, digest, script);
    // This call runs the real blacklist, weight measure, capacity hook, and downstream calls.
    await simulateDaoCall(context, call, observation);
    return { call, observation, review: reviewKey({ ...proposer, observation: undefined, executor }) };
  };
  return preparedSubmission(context, deployment, await prepare(), checkInputs, prepare);
}

type DaoPreparation = { call: DaoTransactionCall; observation: DaoStateObservation; review: string };
function preparedSubmission(context: DaoWalletContext, deployment: DaoDeployment, initial: DaoPreparation, checkInputs: () => void, refresh: () => Promise<DaoPreparation>): DaoPreparedTransaction {
  let used = false;
  let preparing = false;
  const submit = async () => {
    if (used || preparing) throw new Error("This preparation was already submitted or is in progress. Check its receipt before retrying.");
    preparing = true;
    try {
      let current = initial;
      // At most two fresh preparations. Never retry send, even after an uncertain result.
      for (let attempt = 0; attempt < 3; attempt++) {
        checkInputs();
        await assertWallet(context, initial.call.from, initial.call.chainId);
        await assertDaoCanonical(context, initial.observation);
        await assertDaoCanonical(context, current.observation);
        let head = await latest(context, deployment);
        if (sameBlock(head, current.observation)) {
          await simulateDaoCall(context, current.call, current.observation);
          await assertWallet(context, current.call.from, current.call.chainId);
          head = await latest(context, deployment);
          await assertDaoCanonical(context, initial.observation);
          await assertDaoCanonical(context, current.observation);
          if (sameBlock(head, current.observation)) {
            checkInputs();
            used = true;
            return await context.send(current.call);
          }
        }
        if (head.number <= current.observation.number) throw new DaoPreparationChangedError("DAO canonical block changed. Review the action again. No transaction was submitted.");
        if (attempt === 2) break;
        current = await refresh();
        if (current.review !== initial.review || reviewKey(current.call) !== reviewKey(initial.call)) {
          throw new DaoPreparationChangedError("DAO eligibility or review details changed while preparing. Refresh and review the action again. No transaction was submitted.");
        }
      }
      throw new DaoPreparationChangedError("DAO blocks advanced repeatedly during preparation. Retry when the RPC can provide a stable preparation. No transaction was submitted.");
    } finally { preparing = false; }
  };
  return Object.assign(submit, { daoCall: Object.freeze({ ...initial.call }) });
}
