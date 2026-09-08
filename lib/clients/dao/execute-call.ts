import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import type { DaoProposalRef } from "./types";

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
