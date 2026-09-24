import type { Address, Hex, TransactionReceipt, Transaction } from "viem";
import { getPublicClient } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import type { DaoTransactionCall } from "./writes";
import type { DaoTransactionReceipt } from "./types";

export class DaoTransactionRevertedError extends Error {
  readonly code = "DAO_TRANSACTION_REVERTED";
  constructor(readonly transactionHash?: Hex) { super("DAO transaction reverted."); }
}

export class DaoTransactionReplacedError extends Error {
  readonly code = "DAO_TRANSACTION_REPLACED";
  constructor(readonly transactionHash: Hex, readonly reason: "cancelled" | "changed") {
    super(reason === "cancelled" ? "The wallet cancelled this DAO transaction." : "The wallet replaced this DAO transaction with a different call.");
  }
}
export function isDaoTerminalTransactionError(error: unknown): error is DaoTransactionRevertedError | DaoTransactionReplacedError {
  return error instanceof DaoTransactionRevertedError || error instanceof DaoTransactionReplacedError;
}

/** Receipt confirmation uses the configured app RPC, with no alternate transport. */
export async function waitForDaoReceipt(hash: Hex, chainId: number, sender: Address, call: DaoTransactionCall): Promise<DaoTransactionReceipt> {
  if (chainId !== 1) throw new Error("Unsupported DAO receipt chain.");
  const client = getPublicClient(wagmiConfig, { chainId: 1 });
  if (!client || await client.getChainId() !== chainId) throw new Error("DAO receipt RPC is on the wrong chain.");
  let replacedTransaction: Transaction | undefined;
  const receipt = await client.waitForTransactionReceipt({
    hash, confirmations: 1, timeout: 120_000, checkReplacement: true,
    onReplaced: replacement => { replacedTransaction = replacement.replacedTransaction; },
  });
  const transaction = await client.getTransaction({ hash: receipt.transactionHash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (receipt.from.toLowerCase() !== sender.toLowerCase() || receipt.blockHash !== block.hash ||
      transaction.hash !== receipt.transactionHash || transaction.blockHash !== receipt.blockHash ||
      transaction.blockNumber !== receipt.blockNumber) throw new Error("DAO mined transaction or canonical block differs from the receipt.");
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
    const original = replacedTransaction ?? await client.getTransaction({ hash });
    if (original.hash.toLowerCase() !== hash.toLowerCase() || original.nonce !== transaction.nonce ||
        original.from.toLowerCase() !== transaction.from.toLowerCase()) throw new Error("DAO replacement does not consume the submitted transaction nonce.");
    validateDaoMinedCall(original, call);
    try { validateDaoMinedCall(transaction, call); } catch {
      throw new DaoTransactionReplacedError(receipt.transactionHash,
        transaction.to?.toLowerCase() === sender.toLowerCase() && transaction.value === 0n && transaction.input === "0x" ? "cancelled" : "changed");
    }
  }
  validateDaoMinedCall(transaction, call);
  return validateDaoLiveReceipt(receipt, { hash: receipt.transactionHash, sender, blockHash: block.hash, blockTimestamp: Number(block.timestamp) });
}

export function validateDaoLiveReceipt(receipt: TransactionReceipt, expected: { hash: Hex; sender: Address; blockHash: Hex; blockTimestamp: number }): DaoTransactionReceipt {
  if (receipt.transactionHash.toLowerCase() !== expected.hash.toLowerCase() ||
      receipt.from.toLowerCase() !== expected.sender.toLowerCase()) throw new Error("DAO receipt transaction or sender differs from the submitted action.");
  if (receipt.blockHash !== expected.blockHash) throw new Error("DAO receipt block is no longer canonical.");
  if (!Number.isSafeInteger(expected.blockTimestamp) || expected.blockTimestamp < 0) throw new Error("Invalid DAO receipt block time.");
  if (receipt.logs.some(log => log.removed || log.blockHash !== receipt.blockHash || log.transactionHash !== receipt.transactionHash)) throw new Error("DAO receipt contains inconsistent logs.");
  if (receipt.status !== "success") throw new DaoTransactionRevertedError(receipt.transactionHash);
  return {
    status: receipt.status, transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash, blockTimestamp: expected.blockTimestamp, transactionIndex: receipt.transactionIndex,
    logs: receipt.logs.map(log => ({ address: log.address, topics: log.topics, data: log.data, logIndex: log.logIndex })),
  };
}

export function validateDaoMinedCall(transaction: Pick<Transaction, "from" | "to" | "input" | "value" | "chainId">, call: DaoTransactionCall) {
  if (transaction.from.toLowerCase() !== call.from.toLowerCase() || transaction.to?.toLowerCase() !== call.to.toLowerCase() ||
      transaction.input.toLowerCase() !== call.data.toLowerCase() || transaction.value !== 0n || transaction.chainId !== call.chainId) {
    throw new Error("Mined DAO transaction differs from the simulated call.");
  }
}
