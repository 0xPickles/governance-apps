import type { Address, Hex } from "viem";
import type { DaoActionType, DaoPendingAction, DaoProposalRef } from "./types";
import type { DaoTransactionCall } from "./writes";
import { serializeDaoProposalRef } from "./domain";
import { isDaoTerminalTransactionError, DaoTransactionReplacedError, waitForDaoReceipt } from "./live-receipt";

export type DaoActionRecovery = DaoPendingAction & {
  call: DaoTransactionCall;
  receiptState: "unknown" | "confirmed" | "reverted" | "replaced";
  receiptBlockHash?: Hex;
};
const listeners = new Set<() => void>();
const fallback = new Map<string, string>();
export function subscribeDaoActionRecovery(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function daoActionStorageKey(scope: string, ref: DaoProposalRef, actor: Address) {
  return "yearn.dao.live.action.v1:" + scope + ":" + serializeDaoProposalRef(ref) + ":" + actor.toLowerCase();
}
export function readDaoActionRaw(key: string | null): string | null {
  if (!key) return null;
  if (fallback.has(key)) return fallback.get(key)!;
  try { return sessionStorage.getItem(key); } catch { return fallback.get(key) ?? null; }
}
export function saveDaoActionRecovery(key: string, record: DaoActionRecovery | null) {
  const raw = record ? JSON.stringify(record, (_, value) => typeof value === "bigint" ? value.toString() : value) : null;
  try { if (raw) sessionStorage.setItem(key, raw); else sessionStorage.removeItem(key); fallback.delete(key); }
  catch { if (raw) fallback.set(key, raw); else fallback.delete(key); }
  listeners.forEach(listener => listener());
}
export function parseDaoActionRecovery(raw: string | null, ref: DaoProposalRef, actor: Address | null): DaoActionRecovery | null {
  try {
    if (!raw || raw.length > 262144 || !actor) return null;
    const r = JSON.parse(raw);
    const hash = (v: unknown) => typeof v === "string" && /^0x[0-9a-f]{64}$/i.test(v);
    if (!["vote", "retract", "flag", "veto", "execute"].includes(r.action) ||
        !["unknown", "confirmed", "reverted", "replaced"].includes(r.receiptState) ||
        r.actor.toLowerCase() !== actor.toLowerCase() || r.ref.chainId !== ref.chainId ||
        r.ref.votingAddress.toLowerCase() !== ref.votingAddress.toLowerCase() || r.ref.proposalId !== String(ref.proposalId) ||
        !hash(r.transactionHash) || !Number.isSafeInteger(r.submittedAt) ||
        r.call.chainId !== ref.chainId || r.call.from.toLowerCase() !== actor.toLowerCase() ||
        !/^0x[0-9a-f]{40}$/i.test(r.call.to) || !/^0x(?:[0-9a-f]{2})*$/i.test(r.call.data) ||
        (r.receiptState === "confirmed" && !hash(r.receiptBlockHash))) return null;
    return { ...r, action: r.action as DaoActionType, ref, actor, direction: null, effectiveVotingWeight: null, reason: null };
  } catch { return null; }
}
export function daoActionIsPending(record: DaoPendingAction | null) {
  return record !== null && (record.receiptState === undefined || record.receiptState === "unknown" || record.receiptState === "confirmed");
}
export async function confirmDaoAction(key: string, record: DaoActionRecovery): Promise<Hex> {
  const update = (next: DaoActionRecovery) => {
    const current = parseDaoActionRecovery(readDaoActionRaw(key), record.ref, record.actor);
    if (current?.transactionHash === record.transactionHash) saveDaoActionRecovery(key, next);
  };
  try {
    const receipt = await waitForDaoReceipt(record.transactionHash, record.ref.chainId, record.actor, record.call);
    update({ ...record, transactionHash: receipt.transactionHash, receiptState: "confirmed", receiptBlockHash: receipt.blockHash, confirmationError: undefined });
    return receipt.transactionHash;
  } catch (error) {
    update({ ...record,
      transactionHash: isDaoTerminalTransactionError(error) ? error.transactionHash ?? record.transactionHash : record.transactionHash,
      receiptState: error instanceof DaoTransactionReplacedError ? "replaced" : isDaoTerminalTransactionError(error) ? "reverted" : "unknown",
      confirmationError: error instanceof Error ? error.message : "Receipt confirmation is unavailable.",
    });
    throw error;
  }
}
