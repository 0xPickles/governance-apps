import {
  decodeFunctionData,
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import type { RpcTransaction } from "./rpc";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const SAFE_EXEC_TRANSACTION_ABI = parseAbi([
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool success)",
] as const);

export interface AttributedProtocolCall {
  readonly principal: Address;
  readonly input: Hex;
  readonly envelope: "direct" | "safe_exec_transaction";
}

export class UnsupportedProtocolCallEnvelopeError extends Error {
  constructor() {
    super("protocol_call_envelope_unsupported");
    this.name = "UnsupportedProtocolCallEnvelopeError";
  }
}

const SAFE_EXEC_TRANSACTION_SELECTOR = "0x6a761202";

function nonZeroAddress(value: unknown): Address | null {
  return typeof value === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(value) &&
    value.toLowerCase() !== ZERO_ADDRESS
    ? (value as Address)
    : null;
}

function calldata(value: unknown): Hex | null {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value)
    ? (value as Hex)
    : null;
}

export function decodeAttributedProtocolCall(
  transaction: RpcTransaction,
  expectedTarget: Address,
): AttributedProtocolCall {
  const transactionTarget = nonZeroAddress(transaction.to);
  const outerInput = calldata(transaction.input);
  if (transactionTarget === null || outerInput === null) {
    throw new Error("protocol_call_transaction_invalid");
  }

  if (transactionTarget.toLowerCase() === expectedTarget.toLowerCase()) {
    const principal = nonZeroAddress(transaction.from);
    if (principal === null) {
      throw new Error("protocol_call_principal_invalid");
    }
    return { principal, input: outerInput, envelope: "direct" };
  }

  if (
    outerInput.length < 10 ||
    outerInput.slice(0, 10).toLowerCase() !== SAFE_EXEC_TRANSACTION_SELECTOR
  ) {
    throw new UnsupportedProtocolCallEnvelopeError();
  }

  const decoded = decodeFunctionData({
    abi: SAFE_EXEC_TRANSACTION_ABI,
    data: outerInput,
  });
  if (decoded.functionName !== "execTransaction") {
    throw new Error("safe_exec_transaction_selector_invalid");
  }
  const [target, value, innerInput, operation] = decoded.args;
  const validatedTarget = nonZeroAddress(target);
  const validatedInput = calldata(innerInput);
  if (
    validatedTarget === null ||
    validatedInput === null ||
    validatedInput.length < 10
  ) {
    throw new Error("safe_exec_transaction_call_invalid");
  }
  const canonicalInput = encodeFunctionData({
    abi: SAFE_EXEC_TRANSACTION_ABI,
    functionName: "execTransaction",
    args: decoded.args,
  });
  if (canonicalInput.toLowerCase() !== outerInput.toLowerCase()) {
    throw new Error("safe_exec_transaction_noncanonical");
  }
  if (
    validatedTarget.toLowerCase() !== expectedTarget.toLowerCase() ||
    value !== 0n ||
    operation !== 0
  ) {
    // A valid Safe batch can emit a protocol event without proving its end user.
    throw new UnsupportedProtocolCallEnvelopeError();
  }
  return {
    principal: transactionTarget,
    input: validatedInput,
    envelope: "safe_exec_transaction",
  };
}
