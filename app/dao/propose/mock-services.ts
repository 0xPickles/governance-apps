import { isHex, keccak256, stringToHex, type Hex } from "viem";
import {
  createDaoAwaitingIndexProposal,
  decodeDaoProposeReceipt,
  deriveDaoProposalContentIdentity,
  deriveDaoMockBlockHash,
  encodeDaoProposeLog,
  indexDaoMockCreatedProposal,
  registerDaoMockCreatedProposal,
  DAO_MOCK_CHAIN_ID,
  DAO_MOCK_VOTING_ADDRESS,
  type DaoCreatedProposalRecord,
  type DaoDecodedProposeIdentity,
  type DaoProposalRef,
  type DaoTransactionReceipt,
} from "@/lib/clients/dao";

const ALLOWED_PROPOSALS_CATEGORY_ID = 5;

export type * from "@/lib/clients/dao/authoring-types";
import type { DaoAuthoringReview, DaoForumTopic, DaoForumValidationErrorCode, DaoForumValidationResult, DaoPublishedContent, DaoPublicationResult, DaoProposalSubmissionRequest, DaoProposalSubmissionResult, DaoProposalReceiptResult } from "@/lib/clients/dao/authoring-types";

type MockTopicFixture = Omit<DaoForumTopic, "topicId" | "normalizedUrl">;

const TOPIC_FIXTURES: Readonly<Record<number, MockTopicFixture>> = {
  1001: {
    title: "Fund protocol research",
    categoryId: ALLOWED_PROPOSALS_CATEGORY_ID,
    category: "Proposals",
    author: "yearn-contributor",
    createdAt: 1_722_470_400,
  },
  1002: {
    title: "Improve treasury reporting",
    categoryId: ALLOWED_PROPOSALS_CATEGORY_ID,
    category: "Proposals",
    author: "treasury-working-group",
    createdAt: 1_723_420_800,
  },
  1003: {
    title: "Update contributor budget",
    categoryId: ALLOWED_PROPOSALS_CATEGORY_ID,
    category: "Proposals",
    author: "budget-steward",
    createdAt: 1_724_889_600,
  },
  1004: {
    title: "Renew operations mandate",
    categoryId: ALLOWED_PROPOSALS_CATEGORY_ID,
    category: "Proposals",
    author: "operations-council",
    createdAt: 1_726_531_200,
  },
  1005: {
    title: "Deploy strategy safeguards",
    categoryId: ALLOWED_PROPOSALS_CATEGORY_ID,
    category: "Proposals",
    author: "strategy-team",
    createdAt: 1_728_000_000,
  },
  2002: {
    title: "General governance question",
    categoryId: 2,
    category: "General",
    author: "forum-member",
    createdAt: 1_722_470_400,
  },
};

const FORUM_ERROR_MESSAGES: Record<DaoForumValidationErrorCode, string> = {
  INVALID_TOPIC_URL:
    "Enter a full https://gov.yearn.fi/t/.../<topicId> topic URL.",
  TOPIC_NOT_FOUND: "This forum topic could not be found.",
  WRONG_CATEGORY:
    "This topic is not in the configured Proposals category.",
  FORUM_UNAVAILABLE:
    "The forum topic could not be checked. Try again without changing your draft.",
};

export async function validateMockDaoForumTopic(
  input: string,
  latencyMs = 120
): Promise<DaoForumValidationResult> {
  await wait(latencyMs);
  const parsed = parseForumTopicUrl(input);
  if (!parsed) return forumError("INVALID_TOPIC_URL");
  if (parsed.topicId === 503) return forumError("FORUM_UNAVAILABLE");

  const fixture = TOPIC_FIXTURES[parsed.topicId];
  if (!fixture || parsed.topicId === 404) return forumError("TOPIC_NOT_FOUND");
  if (fixture.categoryId !== ALLOWED_PROPOSALS_CATEGORY_ID) {
    return forumError("WRONG_CATEGORY");
  }

  const slug = slugify(fixture.title);
  return {
    state: "valid",
    topic: {
      topicId: parsed.topicId,
      normalizedUrl: `https://gov.yearn.fi/t/${slug}/${parsed.topicId}`,
      ...fixture,
    },
  };
}

export async function publishMockDaoProposalContent(
  review: DaoAuthoringReview,
  publishedAt: number,
  latencyMs = 160
): Promise<DaoPublicationResult> {
  await wait(latencyMs);
  if (review.topic.topicId === 1002) {
    return {
      state: "failed",
      error: {
        code: "PUBLICATION_FAILED",
        message:
          "Proposal content could not be published. Your full draft and review are unchanged.",
      },
    };
  }

  const identity = deriveDaoProposalContentIdentity(review.content);
  return {
    state: "published",
    publication: {
      fingerprint: identity.digest,
      cid: identity.cid,
      canonicalBytes: identity.bytes,
      publishedAt,
    },
  };
}

export async function submitMockDaoProposal(
  request: DaoProposalSubmissionRequest
): Promise<DaoProposalSubmissionResult> {
  const { latencyMs = 180, outcome, publication, review } = request;
  await wait(latencyMs);
  if (outcome === "user-rejected") {
    return {
      state: "failed",
      error: {
        code: "WALLET_REJECTED",
        message:
          "The wallet request was cancelled. Published proposal content remains available for another attempt.",
      },
    };
  }
  if (outcome === "revert") {
    return {
      state: "failed",
      error: {
        code: "PROPOSAL_REVERTED",
        message:
          "The proposal transaction reverted. Recheck current eligibility before trying again.",
      },
    };
  }
  if (outcome === "network-error") {
    return {
      state: "failed",
      error: {
        code: "NETWORK_ERROR",
        message:
          "The network request failed before submission. Published proposal content remains available for another attempt.",
      },
    };
  }

  return {
    state: "submitted",
    transactionHash: keccak256(
      stringToHex(
        `${publication.fingerprint}:${review.scriptCheck.scriptHash ?? "0x"}`
      )
    ),
  };
}

export async function confirmMockDaoProposalReceipt(
  review: DaoAuthoringReview,
  publication: DaoPublishedContent,
  transactionHash: Hex,
  votingEpoch: bigint,
  latencyMs = 180
): Promise<DaoProposalReceiptResult> {
  await wait(latencyMs);
  const script = review.scriptCheck.script;
  if (!isHex(script)) {
    throw new Error("A mock Propose receipt requires a valid exact script.");
  }

  const proposalId = deriveMockProposalId(transactionHash);
  const blockNumber = 24_000_001n + (proposalId % 10_000n);
  const receipt: DaoTransactionReceipt = {
    status: "success",
    transactionHash,
    blockNumber,
    blockHash: deriveDaoMockBlockHash(blockNumber, publication.publishedAt),
    blockTimestamp: publication.publishedAt,
    transactionIndex: 0,
    logs:
      review.topic.topicId === 1005
        ? []
        : [
            encodeDaoProposeLog({
              address: DAO_MOCK_VOTING_ADDRESS,
              proposalId,
              proposer: review.content.createdBy,
              votingEpoch,
              contentDigest: publication.fingerprint,
              script,
              logIndex: 0,
            }),
          ],
  };

  return {
    state: "confirmed",
    receipt,
    decoded: decodeDaoProposeReceipt(receipt, {
      chainId: DAO_MOCK_CHAIN_ID,
      votingAddress: DAO_MOCK_VOTING_ADDRESS,
      transactionHash,
      proposer: review.content.createdBy,
      votingEpoch,
      contentDigest: publication.fingerprint,
      script,
    }),
  };
}

export async function registerMockDaoProposalAwaitingIndex(
  review: DaoAuthoringReview,
  publication: DaoPublishedContent,
  identity: DaoDecodedProposeIdentity,
  latencyMs = 100
): Promise<DaoCreatedProposalRecord> {
  await wait(latencyMs);
  const proposal = createDaoAwaitingIndexProposal({
    identity,
    content: review.content,
    contentCid: publication.cid,
    discussion: {
      state: "verified",
      url: review.topic.normalizedUrl,
      title: review.topic.title,
      categoryId: review.topic.categoryId,
      category: review.topic.category,
      categorySlugPath: ["proposals"],
    },
  });
  const record: DaoCreatedProposalRecord = {
    stage: "awaiting_index",
    proposal,
  };
  registerDaoMockCreatedProposal(record);
  return record;
}

export async function completeMockDaoProposalIndex(
  ref: DaoProposalRef,
  indexedAt: number,
  latencyMs = 180
): Promise<DaoCreatedProposalRecord | null> {
  await wait(latencyMs);
  return indexDaoMockCreatedProposal(ref, indexedAt);
}

function parseForumTopicUrl(input: string): { topicId: number } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "gov.yearn.fi" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }

  const match = /^\/t\/[^/]+\/(\d+)\/?$/.exec(url.pathname);
  if (!match) return null;
  const topicId = Number(match[1]);
  if (!Number.isSafeInteger(topicId) || topicId <= 0) return null;
  return { topicId };
}

function forumError(
  code: DaoForumValidationErrorCode
): DaoForumValidationResult {
  return {
    state: "invalid",
    error: { code, message: FORUM_ERROR_MESSAGES[code] },
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function deriveMockProposalId(transactionHash: Hex): bigint {
  return BigInt(`0x${transactionHash.slice(2, 18)}`) + 1_000n;
}

async function wait(latencyMs: number): Promise<void> {
  if (latencyMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, latencyMs));
}
