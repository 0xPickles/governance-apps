import type { DaoParsedProposalContent } from "./content";
import type { Hex } from "viem";
import type { DaoMockTransactionOutcome, DaoProposalContent, DaoProposeReceiptDecodeResult, DaoScriptCheck, DaoTransactionReceipt } from "./types";

export type DaoForumTopic = {
  topicId: number;
  normalizedUrl: string;
  title: string;
  categoryId: number;
  category: string;
  author: string;
  createdAt: number;
};

export type DaoForumValidationErrorCode =
  | "INVALID_TOPIC_URL"
  | "TOPIC_NOT_FOUND"
  | "WRONG_CATEGORY"
  | "FORUM_UNAVAILABLE";

export type DaoForumValidationResult =
  | { state: "valid"; topic: DaoForumTopic }
  | {
      state: "invalid";
      error: {
        code: DaoForumValidationErrorCode;
        message: string;
      };
    };

export type DaoAuthoringReview = {
  topic: DaoForumTopic;
  content: DaoProposalContent;
  parsedContent: DaoParsedProposalContent;
  scriptCheck: DaoScriptCheck;
};

export type DaoPublishedContent = {
  fingerprint: Hex;
  cid: string;
  canonicalBytes: Uint8Array;
  publishedAt: number;
};

export type DaoPublicationResult =
  | { state: "published"; publication: DaoPublishedContent }
  | {
      state: "failed";
      error: {
        code: "PUBLICATION_FAILED";
        message: string;
      };
    };

export type DaoProposalSubmissionResult =
  | {
      state: "submitted";
      transactionHash: Hex;
    }
  | {
      state: "failed";
      error: {
        code: "WALLET_REJECTED" | "PROPOSAL_REVERTED" | "NETWORK_ERROR";
        message: string;
      };
    };

export type DaoProposalSubmissionRequest = {
  review: DaoAuthoringReview;
  publication: DaoPublishedContent;
  outcome: DaoMockTransactionOutcome;
  latencyMs?: number;
};

export type DaoProposalReceiptResult = {
  state: "confirmed";
  receipt: DaoTransactionReceipt;
  decoded: DaoProposeReceiptDecodeResult;
};

