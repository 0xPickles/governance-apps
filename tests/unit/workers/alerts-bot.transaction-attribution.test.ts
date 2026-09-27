import { describe, expect, it } from "vitest";
import { encodeFunctionData, type Address, type Hex } from "viem";

import type { RpcTransaction } from "@/workers/alerts-bot/src/rpc";
import {
  decodeAttributedProtocolCall,
  SAFE_EXEC_TRANSACTION_ABI,
  UnsupportedProtocolCallEnvelopeError,
} from "@/workers/alerts-bot/src/transaction-attribution";

const TARGET = "0x0000000000000000000000000000000000000011" as Address;
const CALLER = "0x0000000000000000000000000000000000000022" as Address;
const SAFE = "0x0000000000000000000000000000000000000033" as Address;
const INNER_INPUT = "0x12345678" as Hex;

function transaction(params: {
  readonly from?: Address;
  readonly to?: Address;
  readonly input?: Hex;
} = {}): RpcTransaction {
  return {
    hash: `0x${"11".repeat(32)}`,
    from: params.from ?? CALLER,
    to: params.to ?? TARGET,
    blockHash: `0x${"22".repeat(32)}`,
    blockNumber: 1,
    nonce: 0,
    transactionIndex: 0,
    value: "0x0",
    input: params.input ?? INNER_INPUT,
  };
}

function safeInput(params: {
  readonly target?: Address;
  readonly value?: bigint;
  readonly operation?: number;
  readonly input?: Hex;
} = {}): Hex {
  return encodeFunctionData({
    abi: SAFE_EXEC_TRANSACTION_ABI,
    functionName: "execTransaction",
    args: [
      params.target ?? TARGET,
      params.value ?? 0n,
      params.input ?? INNER_INPUT,
      params.operation ?? 0,
      0n,
      0n,
      0n,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x1234",
    ],
  });
}

describe("protocol transaction attribution", () => {
  it("attributes a direct protocol call to the transaction sender", () => {
    expect(decodeAttributedProtocolCall(transaction(), TARGET)).toEqual({
      principal: CALLER,
      input: INNER_INPUT,
      envelope: "direct",
    });
  });

  it("attributes a canonical Safe call to the Safe rather than its executor", () => {
    expect(
      decodeAttributedProtocolCall(
        transaction({ to: SAFE, input: safeInput() }),
        TARGET,
      ),
    ).toEqual({
      principal: SAFE,
      input: INNER_INPUT,
      envelope: "safe_exec_transaction",
    });
  });

  it("classifies a non-Safe indirect call as an unsupported envelope", () => {
    expect(() =>
      decodeAttributedProtocolCall(
        transaction({ to: SAFE, input: "0x8cbf8566" }),
        TARGET,
      ),
    ).toThrow(UnsupportedProtocolCallEnvelopeError);
  });

  it.each([
    { label: "wrong target", input: safeInput({ target: CALLER }) },
    { label: "native value", input: safeInput({ value: 1n }) },
    { label: "delegatecall", input: safeInput({ operation: 1 }) },
  ])("leaves a Safe envelope with $label unattributed", ({ input }) => {
    expect(() =>
      decodeAttributedProtocolCall(transaction({ to: SAFE, input }), TARGET),
    ).toThrow(UnsupportedProtocolCallEnvelopeError);
  });

  it("rejects an invalid Safe inner call", () => {
    expect(() =>
      decodeAttributedProtocolCall(transaction({ to: SAFE, input: safeInput({ input: "0x" }) }), TARGET),
    ).toThrow("safe_exec_transaction_call_invalid");
  });

  it("rejects noncanonical Safe calldata", () => {
    const input = `${safeInput()}${"00"}` as Hex;
    expect(() =>
      decodeAttributedProtocolCall(transaction({ to: SAFE, input }), TARGET),
    ).toThrow("safe_exec_transaction_noncanonical");
  });
});
