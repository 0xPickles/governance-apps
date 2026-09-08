import { beforeEach, describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  clearDaoCreatedProposals,
  createDaoAwaitingIndexProposal,
  createDaoRawSha256Cid,
  deriveDaoProposalContentIdentity,
  decodeDaoProposeReceipt,
  encodeDaoProposeLog,
  indexDaoCreatedProposal,
  indexDaoMockCreatedProposal,
  persistDaoCreatedProposal,
  readDaoMockFeed,
  readDaoCreatedProposals,
  registerDaoMockCreatedProposal,
  resetDaoMockStore,
  serializeDaoProposalRef,
  DAO_CREATED_PROPOSALS_STORAGE_KEY,
  DAO_EMPTY_SCRIPT_HASH,
  type DaoProposalContent,
  type DaoTransactionReceipt,
} from "@/lib/clients/dao";

const VOTING = "0x1111111111111111111111111111111111111111" as Address;
const PROPOSER = "0x4444444444444444444444444444444444444444" as Address;
const TRANSACTION_HASH = `0x${"ab".repeat(32)}` as Hex;
const BLOCK_HASH = `0x${"cd".repeat(32)}` as Hex;
const VOTING_EPOCH = 205n;
const content: DaoProposalContent = {
  schema: "yearn.dao.proposal.v1",
  markdown: "# Session proposal\n\nThis route survives a same-session reload.\n",
  discussionUrl: "https://gov.yearn.fi/t/session-proposal/1001",
  proposalType: "signal",
  createdBy: PROPOSER,
  createdAt: "2026-08-18T12:00:00.000Z",
  assets: [],
};
const CONTENT_IDENTITY = deriveDaoProposalContentIdentity(content);

function decodedIdentity() {
  const receipt: DaoTransactionReceipt = {
    status: "success",
    transactionHash: TRANSACTION_HASH,
    blockNumber: 24_000_001n,
    blockHash: BLOCK_HASH,
    blockTimestamp: 1_787_054_412,
    transactionIndex: 3,
    logs: [
      encodeDaoProposeLog({
        address: VOTING,
        proposalId: 4_201n,
        proposer: PROPOSER,
        votingEpoch: VOTING_EPOCH,
        contentDigest: CONTENT_IDENTITY.digest,
        script: "0x",
        logIndex: 7,
      }),
    ],
  };
  const result = decodeDaoProposeReceipt(receipt, {
    chainId: 1,
    votingAddress: VOTING,
    transactionHash: TRANSACTION_HASH,
    proposer: PROPOSER,
    votingEpoch: VOTING_EPOCH,
    contentDigest: CONTENT_IDENTITY.digest,
    script: "0x",
  });
  if (result.state !== "decoded") throw new Error("Expected a decoded receipt.");
  return result.identity;
}

describe("browser-local created DAO proposals", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearDaoCreatedProposals();
  });

  it("persists an awaiting-index route record in sessionStorage", () => {
    const proposal = createDaoAwaitingIndexProposal({
      identity: decodedIdentity(),
      content,
      contentCid: createDaoRawSha256Cid(CONTENT_IDENTITY.digest),
      discussion: {
        state: "verified",
        url: content.discussionUrl,
        title: "Session proposal discussion",
        categoryId: 5,
        category: "Proposals",
        categorySlugPath: ["proposals"],
      },
    });

    persistDaoCreatedProposal({
      stage: "awaiting_index",
      proposal,
    });

    const [stored] = readDaoCreatedProposals();
    expect(stored?.stage).toBe("awaiting_index");
    expect(stored?.proposal.analysis.error).toBeNull();
    expect(stored?.proposal.script).toEqual({
      bytes: "0x",
      hash: DAO_EMPTY_SCRIPT_HASH,
      hashVerified: true,
    });
    expect(serializeDaoProposalRef(stored!.proposal.ref)).toBe(
      serializeDaoProposalRef(proposal.ref)
    );
    expect(sessionStorage.getItem(DAO_CREATED_PROPOSALS_STORAGE_KEY)).toContain(
      '"proposalId":"4201"'
    );
  });

  it("enriches the same proposal identity instead of substituting a fixture", () => {
    const proposal = createDaoAwaitingIndexProposal({
      identity: decodedIdentity(),
      content,
      contentCid: createDaoRawSha256Cid(CONTENT_IDENTITY.digest),
      discussion: {
        state: "verified",
        url: content.discussionUrl,
        title: "Session proposal discussion",
        categoryId: 5,
        category: "Proposals",
        categorySlugPath: ["proposals"],
      },
    });
    persistDaoCreatedProposal({ stage: "awaiting_index", proposal });
    const before = serializeDaoProposalRef(proposal.ref);

    const indexed = indexDaoCreatedProposal(proposal.ref, 1_787_054_424);

    expect(indexed?.stage).toBe("indexed");
    expect(indexed?.proposal.analysis.error).toBeNull();
    expect(serializeDaoProposalRef(indexed!.proposal.ref)).toBe(before);
    expect(
      serializeDaoProposalRef(readDaoCreatedProposals()[0]!.proposal.ref)
    ).toBe(before);
  });

  it("hydrates and updates the same route record through the runtime feed", () => {
    resetDaoMockStore();
    const proposal = createDaoAwaitingIndexProposal({
      identity: decodedIdentity(),
      content,
      contentCid: createDaoRawSha256Cid(CONTENT_IDENTITY.digest),
      discussion: {
        state: "verified",
        url: content.discussionUrl,
        title: "Session proposal discussion",
        categoryId: 5,
        category: "Proposals",
        categorySlugPath: ["proposals"],
      },
    });

    registerDaoMockCreatedProposal({
      stage: "awaiting_index",
      proposal,
    });
    expect(
      readDaoMockFeed().proposals.find(
        (candidate) =>
          serializeDaoProposalRef(candidate.ref) ===
          serializeDaoProposalRef(proposal.ref)
      )?.analysis.error
    ).toBeNull();

    resetDaoMockStore({ preserveCreatedProposals: true });
    expect(
      readDaoMockFeed().proposals.some(
        (candidate) =>
          serializeDaoProposalRef(candidate.ref) ===
          serializeDaoProposalRef(proposal.ref)
      )
    ).toBe(true);

    const indexed = indexDaoMockCreatedProposal(
      proposal.ref,
      1_787_054_424
    );
    expect(serializeDaoProposalRef(indexed!.proposal.ref)).toBe(
      serializeDaoProposalRef(proposal.ref)
    );
    expect(
      readDaoMockFeed().proposals.find(
        (candidate) =>
          serializeDaoProposalRef(candidate.ref) ===
          serializeDaoProposalRef(proposal.ref)
      )?.analysis.error
    ).toBeNull();
  });
});
