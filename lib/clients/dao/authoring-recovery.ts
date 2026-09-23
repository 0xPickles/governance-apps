import type { Address, Hex } from "viem";
import { deriveDaoProposalContentIdentity, parseDaoProposalContent } from "./content";
import { checkDaoExecutorScript } from "./script";
import type { DaoAuthoringRecovery } from "./authoring-services";
import type { DaoAuthoringReview, DaoPublishedContent } from "./authoring-types";
import type { DaoDecodedProposeIdentity } from "./types";
import { serializeDaoProposalRef } from "./domain";
import { validateDaoPublicationBytes } from "./publication";
import { parseDaoForumUrl, DAO_FORUM_CATEGORIES } from "./forum";
import { z } from "@/lib/schemas/zod";

const topicSchema = z.object({
  topicId: z.number().int().positive(), normalizedUrl: z.string().max(2048),
  title: z.string().min(1).max(1024), categoryId: z.number().int(), category: z.string().max(256),
  author: z.string().min(1).max(256), createdAt: z.number().int().nonnegative(),
});

/** Import bytes, never rebuild their timestamp. Forum metadata and script are validated separately. */
export function restoreDaoAuthoringReview(bytes: Uint8Array, address: Address, topic: unknown, script: string): DaoAuthoringReview {
  const { content } = validateDaoPublicationBytes(bytes);
  const validatedTopic = topicSchema.parse(topic);
  const scriptCheck = checkDaoExecutorScript(script, content.proposalType);
  if (content.createdBy.toLowerCase() !== address.toLowerCase() ||
      validatedTopic.normalizedUrl !== content.discussionUrl ||
      parseDaoForumUrl(content.discussionUrl)?.topicId !== validatedTopic.topicId ||
      DAO_FORUM_CATEGORIES[validatedTopic.categoryId]?.name !== validatedTopic.category || scriptCheck.state === "invalid") {
    throw new Error("The document, wallet, forum topic, or script does not match the review.");
  }
  return { content, topic: validatedTopic, scriptCheck, parsedContent: parseDaoProposalContent(content) };
}

export function daoAuthoringStorageKey(scope: string, address: Address) {
  return "yearn.dao.live.authoring.v1:" + scope + ":" + address.toLowerCase();
}
export function saveDaoAuthoringRecovery(key: string, review: DaoAuthoringReview, publication: DaoPublishedContent | null = null, transactionHash: Hex | null = null, expectedEpoch: bigint | null = null, lastFailure?: DaoAuthoringRecovery["lastFailure"]): boolean {
  try {
    const identity = deriveDaoProposalContentIdentity(review.content);
    const raw = JSON.stringify({
      state: publication ? "published" : "unpublished",
      lastFailure, content: review.content, topic: review.topic, script: review.scriptCheck.script,
      digest: identity.digest, cid: identity.cid, publishedAt: publication?.publishedAt ?? null,
      transactionHash: publication ? transactionHash : null, expectedEpoch: publication ? expectedEpoch?.toString() ?? null : null,
    });
    if (raw.length > 262144) return false;
    sessionStorage.setItem(key, raw);
    return sessionStorage.getItem(key) === raw;
  } catch { return false; }
}
export function readDaoAuthoringRecovery(key: string, address: Address): DaoAuthoringRecovery | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 262144) return null;
    const value = JSON.parse(raw);
    const identity = deriveDaoProposalContentIdentity(value.content);
    const review = restoreDaoAuthoringReview(identity.bytes, address, value.topic, value.script);
    if (identity.digest !== value.digest || (value.cid !== undefined && value.cid !== identity.cid)) return null;
    if (value.state === "unpublished") {
      if (value.publishedAt !== null || value.transactionHash !== null || value.expectedEpoch !== null || value.lastFailure) return null;
      return { state: "unpublished", review, publication: null, transactionHash: null, expectedEpoch: null };
    }
    // Records without a state field are the existing published v1 format.
    if ((value.state !== undefined && value.state !== "published") ||
        (value.transactionHash !== null && !/^0x[0-9a-f]{64}$/i.test(value.transactionHash)) ||
        !Number.isSafeInteger(value.publishedAt) || value.publishedAt <= 0 ||
        (value.expectedEpoch !== null && !/^(0|[1-9][0-9]*)$/.test(value.expectedEpoch))) return null;
    return {
      state: "published", review,
      publication: { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: value.publishedAt },
      lastFailure: value.lastFailure && /^0x[0-9a-f]{64}$/i.test(value.lastFailure.transactionHash) &&
        ["PROPOSAL_REVERTED", "PROPOSAL_REPLACED"].includes(value.lastFailure.code) && typeof value.lastFailure.message === "string" &&
        value.lastFailure.message.length <= 1024 ? value.lastFailure : undefined,
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
