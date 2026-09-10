import { describe, expect, it, vi } from "vitest";
import type { TransactionReceipt, Address } from "viem";
vi.mock("@/web3/wagmi", () => ({ wagmiConfig: {} }));
vi.mock("wagmi/actions", () => ({ getPublicClient: vi.fn() }));
import { validateDaoLiveReceipt, validateDaoMinedCall } from "@/lib/clients/dao/live-receipt";
import { V2_ACCOUNT, V2_VOTING, v2Hash } from "../../../fixtures/dao-feed-v2";
const hash = v2Hash(1), blockHash = v2Hash(2);
const expected = { hash, sender: V2_ACCOUNT as Address, blockHash, blockTimestamp: 1789000000 };
function receipt() {
  return { transactionHash: hash, from: V2_ACCOUNT as Address, status: "success", blockHash, blockNumber: 1n, transactionIndex: 0, logs: [] } as unknown as TransactionReceipt;
}
describe("confirmed DAO receipts", () => {
  it("accepts a canonical successful receipt", () => {
    expect(validateDaoLiveReceipt(receipt(), expected)).toMatchObject({ status: "success", transactionHash: hash, blockTimestamp: expected.blockTimestamp });
  });
  it.each(["reverted", "sender", "hash", "canonical", "removed", "log transaction"])("rejects %s receipts", change => {
    const r = receipt();
    if (change === "reverted") r.status = "reverted";
    if (change === "sender") r.from = V2_VOTING;
    if (change === "hash") r.transactionHash = v2Hash(5);
    if (change === "canonical") r.blockHash = v2Hash(5);
    if (change === "removed" || change === "log transaction") r.logs = [{ removed: change === "removed", blockHash, transactionHash: v2Hash(5) } as TransactionReceipt["logs"][number]];
    expect(() => validateDaoLiveReceipt(r, expected)).toThrow();
  });
  it.each(["to", "from", "input", "value", "chainId"])("rejects a mined transaction with different %s", field => {
    const call = { chainId: 1, from: V2_ACCOUNT as Address, to: V2_VOTING as Address, data: "0x1234" as const };
    const tx = { chainId: 1, from: V2_ACCOUNT as Address, to: V2_VOTING as Address, input: call.data, value: 0n };
    expect(() => validateDaoMinedCall(tx, call)).not.toThrow();
    const other = { to: V2_ACCOUNT, from: V2_VOTING, input: "0x1235", value: 1n, chainId: 10 };
    expect(() => validateDaoMinedCall({ ...tx, [field]: other[field as keyof typeof other] }, call)).toThrow("simulated call");
  });
});
