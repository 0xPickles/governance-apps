import type { Hex } from "viem";
import { checkDaoExecutorScript } from "./script";
import type { DaoAnalysis } from "./types";

/** Framing is available only for the app's reviewed Executor allowlist. */
export function analyzeDaoScript(bytes: Hex | null, supported: boolean): DaoAnalysis {
  if (bytes === null) return { calls: [], error: "Exact proposed script bytes are unavailable." };
  if (bytes === "0x") return { calls: [], error: null };
  if (!supported) return { calls: [], error: "This Executor implementation has no supported script decoder. Review the exact raw bytes." };
  const check = checkDaoExecutorScript(bytes);
  return {
    calls: check.state === "valid" ? check.frames.map((frame) => ({
      ...frame, decodeStatus: "unknown", contractName: null,
      functionSignature: null, arguments: [], verifiedSource: null, sourcePath: null,
    })) : [],
    error: check.error?.message ?? null,
  };
}
