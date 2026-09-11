import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { renderHookWithProviders } from "@/tests/test-utils";
import { useDaoProposalActions } from "@/lib/hooks/useDao";
import { useDaoAuthoringServices } from "@/lib/hooks/useDaoAuthoring";
import { OnchainDaoClient } from "@/lib/clients/dao/onchain";
import { waitForDaoReceipt, DaoTransactionReplacedError, DaoTransactionRevertedError } from "@/lib/clients/dao/live-receipt";
import { applyDaoMockFixture, getDaoMockSnapshot, DAO_MOCK_ACCOUNT_ADDRESS, DAO_MOCK_VOTING_ADDRESS, deriveDaoProposerState, getDaoMockFixture, deriveDaoProposalContentIdentity, encodeDaoProposeLog } from "@/lib/clients/dao";
import { daoAuthoringStorageKey, saveDaoAuthoringRecovery, readDaoAuthoringRecovery } from "@/lib/clients/dao/authoring-recovery";
import { daoDeploymentScope, getDaoDeployments } from "@/lib/clients/dao/deployment";
import { createDaoAuthoringReview } from "@/app/dao/propose/authoring";
vi.mock("@/lib/clients/dao/live-receipt", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/clients/dao/live-receipt")>(), waitForDaoReceipt: vi.fn() }));
const hash = ("0x" + "11".repeat(32)) as Hex, replacement = ("0x" + "22".repeat(32)) as Hex, blockHash = ("0x" + "33".repeat(32)) as Hex;
const receipt = { transactionHash: replacement, status: "success" as const, blockNumber: 1n, blockHash, blockTimestamp: 1789000000, transactionIndex: 0, logs: [] };
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); applyDaoMockFixture("voting");
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development"); vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false"); vi.stubEnv("NEXT_PUBLIC_E2E", "false");
  vi.stubEnv("NEXT_PUBLIC_DAO_DEPLOYMENTS", JSON.stringify([{ chainId: 1, votingAddress: DAO_MOCK_VOTING_ADDRESS, deploymentBlock: "0", genesis: 0, active: true, supportedVoters: [], supportedExecutors: [] }]));
  vi.spyOn(OnchainDaoClient.prototype, "getFeed").mockResolvedValue(getDaoMockSnapshot().feed);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("live action receipt recovery", () => {
  it("retains a submitted action through timeout and reload; retry confirms without another wallet send", async () => {
    const proposal = getDaoMockSnapshot().feed.proposals[0];
    const send = vi.fn(async () => hash);
    const prepare = vi.spyOn(OnchainDaoClient.prototype, "prepareVote").mockResolvedValue(Object.assign(send,
      { daoCall: { from: DAO_MOCK_ACCOUNT_ADDRESS, to: DAO_MOCK_VOTING_ADDRESS, chainId: 1, data: "0x1234" as Hex } }));
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(new Error("RPC receipt timeout"));
    const useActions = () => useDaoProposalActions(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS, { submittedMessage: "Submitted" });
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    expect(first.result.current.pendingAction).toMatchObject({ transactionHash: hash, receiptState: "unknown" });
    expect(first.result.current.state.status).toBe("error");
    first.unmount();
    const second = renderHookWithProviders(useActions);
    await waitFor(() => expect(second.result.current.pendingAction?.transactionHash).toBe(hash));
    await act(async () => { await second.result.current.vote("nay"); });
    expect(send).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
    vi.mocked(waitForDaoReceipt).mockResolvedValueOnce(receipt);
    await act(async () => { await second.result.current.retryConfirmation(); });
    expect(second.result.current.pendingAction).toMatchObject({ transactionHash: replacement, receiptState: "confirmed", receiptBlockHash: blockHash });
    expect(send).toHaveBeenCalledTimes(1);
    second.unmount();
    const third = renderHookWithProviders(useActions);
    await waitFor(() => expect(third.result.current.pendingAction).toMatchObject({ transactionHash: replacement, receiptState: "confirmed" }));
  });
  it.each(["reverted", "cancelled", "changed"] as const)("retains the known %s hash as a terminal outcome", async kind => {
    const proposal = getDaoMockSnapshot().feed.proposals[0];
    vi.spyOn(OnchainDaoClient.prototype, "prepareVote").mockResolvedValue(Object.assign(async () => hash,
      { daoCall: { from: DAO_MOCK_ACCOUNT_ADDRESS, to: DAO_MOCK_VOTING_ADDRESS, chainId: 1, data: "0x1234" as Hex } }));
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(kind === "reverted" ? new DaoTransactionRevertedError(hash) : new DaoTransactionReplacedError(replacement, kind));
    const useActions = () => useDaoProposalActions(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS, { submittedMessage: "Submitted" });
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    const expected = { receiptState: kind === "reverted" ? "reverted" : "replaced", transactionHash: kind === "reverted" ? hash : replacement };
    expect(first.result.current.pendingAction).toMatchObject(expected);
    first.unmount();
    const second = renderHookWithProviders(useActions);
    await waitFor(() => expect(second.result.current.pendingAction).toMatchObject(expected));
  });
});
describe("creation replacement recovery", () => {
  it("decodes proposal zero from the accepted hash and restores that hash on reload", async () => {
    const fixture = getDaoMockFixture("discussion"), proposer = deriveDaoProposerState(fixture.proposer);
    const result = createDaoAuthoringReview({ address: proposer.address, createdAt: fixture.now,
      draft: { markdown: "# Replacement creation\n\nKeep exact identity.\n\n## Scope\n\nTest recovery.\n", proposalType: "signal", executableScript: "0x" },
      topic: { topicId: 1001, normalizedUrl: "https://gov.yearn.fi/t/topic/1001", title: "Topic", category: "Proposals", categoryId: 5, author: "user", createdAt: 1 } });
    if (result.state !== "valid") throw new Error("Invalid test review");
    const review = result.review, identity = deriveDaoProposalContentIdentity(review.content);
    const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: fixture.now };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review, publication, hash, proposer.expectedVotingEpoch);
    vi.mocked(waitForDaoReceipt).mockResolvedValue({ ...receipt, logs: [encodeDaoProposeLog({ address: DAO_MOCK_VOTING_ADDRESS, contentDigest: identity.digest,
      logIndex: 0, proposalId: 0n, proposer: proposer.address, script: "0x", votingEpoch: proposer.expectedVotingEpoch })] });
    const first = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => {
      const confirmed = await first.result.current.services.confirm(review, publication, hash, proposer.expectedVotingEpoch);
      expect(confirmed.decoded).toMatchObject({ state: "decoded", identity: { ref: { proposalId: 0n }, log: { transactionHash: replacement } } });
    });
    expect(readDaoAuthoringRecovery(key, proposer.address)?.transactionHash).toBe(replacement);
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    expect(second.result.current.recovery?.transactionHash).toBe(replacement);
    await act(async () => { await second.result.current.services.confirm(review, publication, replacement, proposer.expectedVotingEpoch); });
    expect(waitForDaoReceipt).toHaveBeenLastCalledWith(replacement, 1, proposer.address, expect.any(Object));
  });
});
