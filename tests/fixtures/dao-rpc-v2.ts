// Synthetic ABI-encoded responses, independently chosen from pinned source semantics.
import { decodeFunctionData, encodeFunctionResult, parseAbi, type Abi, type Hex } from "viem";
import { vi } from "vitest";
import { DAO_VOTING_ABI, type DaoRpc } from "@/lib/clients/dao/onchain";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";
import { V2_ACCOUNT, V2_EXECUTOR, V2_GENESIS, V2_NOW, V2_VOTER, v2Hash } from "./dao-feed-v2";

const ABI = [...DAO_VOTING_ABI, ...parseAbi([
  "function genesis() view returns (uint256)",
  "function decay_length() view returns (uint256)",
  "function weight(address) view returns (uint256)",
])] as Abi;
export function createDaoRpcFixture() {
  const original = saved.proposals[0];
  const state = {
    chain: "0x1", hash: v2Hash(88), replaced: false, timestamp: V2_NOW + 120,
    fail: false,
    values: {
      proposals: {
        proposer: V2_ACCOUNT, epoch: 200n, ipfs: original.contentDigest, script_hash: original.scriptHash,
        threshold: 5000n, votes: 0n, yea: 0n,
        retracted: false, executed: false, flagged: false, vetoed: true,
      },
      status: 512n, votes: { weight: 0n, yea: 0n },
      voter: V2_VOTER, executor: V2_EXECUTOR, operator: V2_ACCOUNT, guardian: V2_ACCOUNT,
      weight_measure: "0x5555555555555555555555555555555555555555",
      vote_start: 604800n, execute_delay: 86400n, execute_guard: true, threshold: 8000n,
      weight: 100000000000000000000n, genesis: BigInt(V2_GENESIS), decay_length: 0n,
    } as Record<string, unknown>,
  };
  const calls: Array<{ to: string; name: string; args: readonly unknown[]; block: unknown }> = [];
  const request = vi.fn<DaoRpc["request"]>(async ({ method, params }) => {
    if (state.fail) throw new Error("Controlled RPC failure");
    if (method === "eth_chainId") return state.chain;
    if (method === "eth_getBlockByNumber") return {
      number: "0x2a00000", hash: state.replaced && params?.[0] !== "latest" ? v2Hash(89) : state.hash,
      timestamp: "0x" + state.timestamp.toString(16),
    };
    if (method !== "eth_call") throw new Error("Unexpected RPC method");
    const transaction = params?.[0] as { to: string; data: Hex };
    const decoded = decodeFunctionData({ abi: ABI, data: transaction.data });
    calls.push({ to: transaction.to, name: decoded.functionName, args: decoded.args ?? [], block: params?.[1] });
    if (!(decoded.functionName in state.values)) throw new Error("Unexpected ABI read");
    return encodeFunctionResult({ abi: ABI, functionName: decoded.functionName, result: state.values[decoded.functionName] });
  });
  return { rpc: { request }, state, calls };
}
