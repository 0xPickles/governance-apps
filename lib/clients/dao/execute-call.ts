import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import type { DaoCapabilityInput, DaoProposalRef, DaoStateObservation } from "./types";

const executeAbi = parseAbi(["function execute(uint256,bytes)"]);
export type DaoExecuteCall = { chainId: number; to: Address; caller: Address; data: Hex };

/** Exact preflight identity; this helper neither simulates nor submits a call. */
export function createDaoExecuteCall(ref: DaoProposalRef, caller: Address, script: Hex): DaoExecuteCall {
  return { chainId: ref.chainId, to: ref.votingAddress, caller,
    data: encodeFunctionData({ abi: executeAbi, functionName: "execute", args: [ref.proposalId, script] }) };
}

export function matchesDaoExecuteCall(actual: DaoExecuteCall | null, expected: DaoExecuteCall): boolean {
  return actual !== null && actual.chainId === expected.chainId &&
    actual.to.toLowerCase() === expected.to.toLowerCase() &&
    actual.caller.toLowerCase() === expected.caller.toLowerCase() &&
    actual.data.toLowerCase() === expected.data.toLowerCase();
}

export function isDaoStateObservation(value: DaoStateObservation | null | undefined): value is DaoStateObservation {
  return value != null && typeof value.number === "bigint" && value.number >= 0n &&
    /^0x[0-9a-fA-F]{64}$/.test(value.hash) && Number.isSafeInteger(value.timestamp) && value.timestamp >= 0;
}

/** Local equality key for the live preparation inputs, never a feed proof.
 * The canonical block binds all configuration read at that block, including
 * contract identities. Explicit facts also invalidate inconsistent local edits.
 */
export function daoExecutionContextKey(input: DaoCapabilityInput): string | null {
  const { proposal: p, account: a } = input;
  if (!isDaoStateObservation(a.observation)) return null;
  return JSON.stringify([
    a.observation.number, a.observation.hash.toLowerCase(), a.observation.timestamp,
    p.ref.chainId, p.ref.votingAddress.toLowerCase(), p.ref.proposalId,
    p.proposer.toLowerCase(), p.votingEpoch, p.content.digest, p.script,
    p.protocolStatus, p.retracted, p.executed, p.flagged, p.vetoed,
    p.totalWeight, p.yeaWeight, p.thresholdBps,
    p.voteStartsAt, p.voteEndsAt, p.executionStartsAt, p.executionEndsAt,
    p.rules.approvalThresholdBps, p.rules.snapshotThresholdBps,
    p.rules.votingPeriodSeconds, p.rules.executionDelaySeconds, p.rules.executionGuard,
    a.address.toLowerCase(), a.connected, a.correctChain, a.isProposer, a.isOperator,
    a.isGuardian, a.votingWeight, a.effectiveVotingWeight, a.hasVoted, a.voteDirection,
    input.vetoEndsAt, input.executionGuard,
  ], (_key, value) => typeof value === "bigint" ? value.toString() : value);
}

export function matchesDaoExecutionContext(input: DaoCapabilityInput): boolean {
  const { executionPreflight: preflight, observation } = input.account;
  if (!isDaoStateObservation(observation) || !isDaoStateObservation(preflight.observation)) return false;
  return preflight.observation.number === observation.number &&
    preflight.observation.hash.toLowerCase() === observation.hash.toLowerCase() &&
    preflight.observation.timestamp === observation.timestamp &&
    observation.timestamp >= input.now - 300 && observation.timestamp <= input.now + 60 &&
    preflight.contextKey === daoExecutionContextKey(input);
}
