import type { Address, Hex } from "viem";
import { deriveDaoProposalContentIdentity, parseDaoProposalContent } from "./content";
import { checkDaoExecutorScript } from "./script";
import type { DaoAuthoringRecovery } from "./authoring-services";
import type { DaoAuthoringReview, DaoPublishedContent } from "./authoring-types";
import type { DaoDecodedProposeIdentity } from "./types";
import { serializeDaoProposalRef } from "./domain";

export function daoAuthoringStorageKey(scope: string, address: Address) {
  return "yearn.dao.live.authoring.v1:" + scope + ":" + address.toLowerCase();
}
export function saveDaoAuthoringRecovery(key: string, review: DaoAuthoringReview, publication: DaoPublishedContent, transactionHash: Hex | null = null, expectedEpoch: bigint | null = null) {
  sessionStorage.setItem(key, JSON.stringify({
    content: review.content, topic: review.topic, script: review.scriptCheck.script,
    digest: publication.fingerprint, publishedAt: publication.publishedAt, transactionHash, expectedEpoch: expectedEpoch?.toString() ?? null,
  }));
}
export function readDaoAuthoringRecovery(key: string, address: Address): DaoAuthoringRecovery | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 262144) return null;
    const value = JSON.parse(raw);
    const parsedContent = parseDaoProposalContent(value.content);
    if (parsedContent.errors.length || value.content.createdBy.toLowerCase() !== address.toLowerCase()) return null;
    const identity = deriveDaoProposalContentIdentity(value.content);
    const scriptCheck = checkDaoExecutorScript(value.script, value.content.proposalType);
    if (identity.digest !== value.digest || scriptCheck.state === "invalid" ||
        value.topic.normalizedUrl !== value.content.discussionUrl ||
        (value.transactionHash !== null && !/^0x[0-9a-f]{64}$/i.test(value.transactionHash)) ||
        !Number.isSafeInteger(value.publishedAt)) return null;
    return {
      review: { content: value.content, topic: value.topic, scriptCheck, parsedContent },
      publication: { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: value.publishedAt },
      transactionHash: value.transactionHash,
      expectedEpoch: value.expectedEpoch === null ? null : BigInt(value.expectedEpoch),
    };
  } catch { return null; }
}
const pendingKey = "yearn.dao.live.pending-creation.v1:";
export function saveDaoPendingCreation(identity: DaoDecodedProposeIdentity, title: string) {
  sessionStorage.setItem(pendingKey + serializeDaoProposalRef(identity.ref), JSON.stringify({ title, transactionHash: identity.log.transactionHash }));
}
export function readDaoPendingCreation(ref: import("./types").DaoProposalRef): { title: string; transactionHash: Hex } | null {
  try {
    const raw = sessionStorage.getItem(pendingKey + serializeDaoProposalRef(ref));
    if (!raw || raw.length > 4096) return null;
    const value = JSON.parse(raw);
    return typeof value.title === "string" && value.title.length <= 1024 && /^0x[0-9a-f]{64}$/i.test(value.transactionHash) ? value : null;
  } catch { return null; }
}
