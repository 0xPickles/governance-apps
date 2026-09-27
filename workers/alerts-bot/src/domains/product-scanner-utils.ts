import {
  decodeFunctionResult,
  encodeFunctionData,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import type { RpcBlock, RpcCallRequest, RpcClient, RpcLog } from "../rpc";

export interface CanonicalProductLog extends RpcLog {
  readonly address: Address;
  readonly topics: Hex[];
  readonly data: Hex;
  readonly blockHash: Hex;
  readonly blockNumber: number;
  readonly transactionHash: Hex;
  readonly logIndex: number;
  readonly removed: false;
}

export function normalizeAddress(value: string): Address {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("product_scan_address_invalid");
  }
  return normalized as Address;
}

export function canonicalProductLog(log: RpcLog): CanonicalProductLog | null {
  if (log.removed) return null;
  if (
    log.blockNumber === null ||
    !Number.isSafeInteger(log.blockNumber) ||
    log.logIndex === null ||
    !Number.isSafeInteger(log.logIndex) ||
    log.transactionHash === null ||
    !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash) ||
    log.blockHash === null ||
    !/^0x[0-9a-fA-F]{64}$/.test(log.blockHash) ||
    !/^0x[0-9a-fA-F]*$/.test(log.data) ||
    log.topics.length === 0 ||
    log.topics.some((topic) => !/^0x[0-9a-fA-F]{64}$/.test(topic))
  ) {
    throw new Error("product_scan_log_metadata_invalid");
  }
  return {
    ...log,
    address: normalizeAddress(log.address),
    topics: log.topics.map((topic) => topic.toLowerCase() as Hex),
    data: log.data.toLowerCase() as Hex,
    blockHash: log.blockHash.toLowerCase() as Hex,
    transactionHash: log.transactionHash.toLowerCase() as Hex,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    removed: false,
  };
}

export function sortProductLogs(
  logs: readonly CanonicalProductLog[],
): readonly CanonicalProductLog[] {
  return [...logs].sort(
    (left, right) =>
      left.blockNumber - right.blockNumber || left.logIndex - right.logIndex,
  );
}

export async function exactBlock(
  rpc: RpcClient,
  blockNumber: number,
): Promise<RpcBlock> {
  const block = await rpc.getBlockByNumber(blockNumber);
  if (
    block.number !== blockNumber ||
    block.timestamp === null ||
    !/^0x[0-9a-fA-F]{64}$/.test(block.hash)
  ) {
    throw new Error("product_scan_block_invalid");
  }
  return block;
}

export function assertCanonicalProductLog(
  log: CanonicalProductLog,
  block: RpcBlock,
): void {
  if (
    block.number !== log.blockNumber ||
    block.hash.toLowerCase() !== log.blockHash.toLowerCase()
  ) {
    throw new Error("product_scan_log_not_canonical");
  }
}

export function exactlyOne<T>(
  values: readonly T[],
  missingReason: string,
  ambiguousReason: string,
): T {
  if (values.length === 0) throw new Error(missingReason);
  if (values.length !== 1) throw new Error(ambiguousReason);
  return values[0]!;
}

export async function exactRead<
  const TAbi extends Abi,
  TFunctionName extends string,
>(params: {
  readonly rpc: RpcClient;
  readonly block: RpcBlock;
  readonly address: Address;
  readonly abi: TAbi;
  readonly functionName: TFunctionName;
  readonly args?: readonly unknown[];
}): Promise<unknown> {
  const request = {
    to: params.address,
    data: encodeFunctionData({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
    } as never),
  } satisfies RpcCallRequest;
  const data = await params.rpc.call(request, {
    blockHash: params.block.hash,
    requireCanonical: true,
  });
  return decodeFunctionResult({
    abi: params.abi,
    functionName: params.functionName,
    data: data as Hex,
  } as never);
}

export async function transactionActor(
  rpc: RpcClient,
  transactionHash: string,
): Promise<Address> {
  const transaction = await rpc.getTransactionByHash(transactionHash);
  if (transaction === null) throw new Error("product_scan_transaction_missing");
  return normalizeAddress(transaction.from);
}

export function productEventId(
  log: CanonicalProductLog,
  kind: string,
): string {
  return `${log.transactionHash}:${log.logIndex}:${kind}`;
}

export function onchainSource(log: CanonicalProductLog) {
  return Object.freeze({
    kind: "onchain" as const,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
  });
}

export function asBigint(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") throw new Error(`${label}_invalid`);
  return value;
}

export function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label}_invalid`);
  return value;
}

export function asAddress(value: unknown, label: string): Address {
  if (typeof value !== "string") throw new Error(`${label}_invalid`);
  return normalizeAddress(value);
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}_invalid`);
  }
  return value as Record<string, unknown>;
}
