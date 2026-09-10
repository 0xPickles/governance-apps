import type { Hex } from "viem";
import type { DaoDecodedProposeIdentity, DaoProposalRef } from "./types";
import type { DaoAuthoringReview, DaoForumValidationResult, DaoPublishedContent, DaoPublicationResult, DaoProposalSubmissionRequest, DaoProposalSubmissionResult, DaoProposalReceiptResult } from "./authoring-types";

export type DaoAuthoringRecovery = { review: DaoAuthoringReview; publication: DaoPublishedContent; transactionHash: Hex | null; expectedEpoch: bigint | null };
export type DaoAuthoringServices = {
  validateForum: (input: string, latency?: number) => Promise<DaoForumValidationResult>;
  publish: (review: DaoAuthoringReview, now: number, latency?: number) => Promise<DaoPublicationResult>;
  submit: (input: DaoProposalSubmissionRequest & { onSubmitted?: (hash: Hex) => void }) => Promise<DaoProposalSubmissionResult>;
  confirm: (review: DaoAuthoringReview, publication: DaoPublishedContent, hash: Hex, epoch: bigint, latency?: number) => Promise<DaoProposalReceiptResult>;
  register: (review: DaoAuthoringReview, publication: DaoPublishedContent, identity: DaoDecodedProposeIdentity, latency?: number) => Promise<unknown>;
  index: (ref: DaoProposalRef, now: number, latency?: number) => Promise<unknown | null>;
};
