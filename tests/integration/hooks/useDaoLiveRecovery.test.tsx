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
import { recoveredReview } from "@/tests/fixtures/dao-pinata-recovery";
import { DaoPreparationChangedError } from "@/lib/clients/dao/writes";
vi.mock("@/lib/clients/dao/live-receipt", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/clients/dao/live-receipt")>(), waitForDaoReceipt: vi.fn() }));
const hash = ("0x" + "11".repeat(32)) as Hex, replacement = ("0x" + "22".repeat(32)) as Hex, blockHash = ("0x" + "33".repeat(32)) as Hex;
const receipt = { transactionHash: replacement, status: "success" as const, blockNumber: 1n, blockHash, blockTimestamp: 1789000000, transactionIndex: 0, logs: [] };
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); applyDaoMockFixture("voting");
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development"); vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false"); vi.stubEnv("NEXT_PUBLIC_E2E", "false");
  vi.stubEnv("NEXT_PUBLIC_DAO_DEPLOYMENTS", JSON.stringify([{ chainId: 1, votingAddress: DAO_MOCK_VOTING_ADDRESS, deploymentBlock: "0", genesis: 0, active: true, supportedVoters: [], supportedExecutors: [] }]));
  vi.spyOn(OnchainDaoClient.prototype, "getFeed").mockResolvedValue(getDaoMockSnapshot().feed);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("public content publication", () => {
  function reviewedContent() {
    const fixture = getDaoMockFixture("discussion"), proposer = deriveDaoProposerState(fixture.proposer);
    const result = createDaoAuthoringReview({ address: proposer.address, createdAt: fixture.now,
      draft: { markdown: "# Public publication\n\nKeep reviewed bytes.\n\n## Scope\n\nNo publication signature.\n", proposalType: "signal", executableScript: "0x" },
      topic: { topicId: 1001, normalizedUrl: "https://gov.yearn.fi/t/topic/1001", title: "Topic", category: "Proposals", categoryId: 5, author: "user", createdAt: 1 } });
    if (result.state !== "valid") throw new Error("Invalid review");
    return { proposer, review: result.review, identity: deriveDaoProposalContentIdentity(result.review.content) };
  }
  it("publishes without a challenge and restores verified publication after reload", async () => {
    const { proposer, review, identity } = reviewedContent();
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        expect(options.headers).toEqual({ "Content-Type": "application/octet-stream", "X-DAO-Content-Digest": identity.digest, "X-DAO-Content-CID": identity.cid });
        expect(Array.from(options.body as Uint8Array)).toEqual(Array.from(identity.bytes));
        return Response.json({ digest: identity.digest, cid: identity.cid, publishedAt: 100 });
      }
      expect(url).toBe("/api/dao-content?digest=" + identity.digest);
      return new Response(new Uint8Array(identity.bytes));
    });
    vi.stubGlobal("fetch", fetcher);
    const first = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => { const published = await first.result.current.services.publish(review, 100); expect(published, JSON.stringify(published)).toMatchObject({ state: "published" }); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    expect(second.result.current.recovery?.publication).toMatchObject({ fingerprint: identity.digest, cid: identity.cid });
  });
  it("reports unstable preparation as review recovery without republishing or discarding publication", async () => {
    const { proposer, review, identity } = reviewedContent();
    const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: 100 };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review, publication);
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe("/api/dao-content?digest=" + identity.digest);
      return new Response(new Uint8Array(identity.bytes));
    });
    vi.stubGlobal("fetch", fetcher);
    const message = "DAO blocks advanced repeatedly during preparation. Retry when the RPC can provide a stable preparation. No transaction was submitted.";
    vi.spyOn(OnchainDaoClient.prototype, "preparePropose").mockRejectedValue(new DaoPreparationChangedError(message));
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => expect(await hook.result.current.services.submit({ review, publication, outcome: "success" })).toMatchObject({
      state: "failed", error: { code: "PREPARATION_CHANGED", message },
    }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/dao-content?digest=" + identity.digest);
    expect(readDaoAuthoringRecovery(key, proposer.address)).toMatchObject({ state: "published", transactionHash: null, publication: { fingerprint: identity.digest } });
  });
  it.each(["disabled", "budget_reached", "verification_pending", "unavailable"])("keeps %s publication failures out of transaction recovery", async code => {
    const { proposer, review } = reviewedContent();
    const fetcher = vi.fn(async () => Response.json({ code, error: "private-provider-detail" }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => {
      const result = await hook.result.current.services.publish(review, 100);
      expect(result.state).toBe("failed"); expect(JSON.stringify(result)).not.toContain("private-provider-detail");
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readDaoAuthoringRecovery(daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address), proposer.address)).toMatchObject({ state: "unpublished", publication: null, transactionHash: null });
  });
  it("retries exact recovered B after a failed upload and remount with a later clock", async () => {
    const b = recoveredReview();
    const proposer = { ...reviewedContent().proposer, address: b.address };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), b.address);
    let accept = false;
    const posts: Uint8Array[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        expect(readDaoAuthoringRecovery(key, b.address)?.state).toBe("unpublished");
        posts.push(new Uint8Array(options.body as Uint8Array));
        return accept ? Response.json({ digest: b.identity.digest, cid: b.identity.cid, publishedAt: 1789750800 }) : Response.json({ code: "verification_pending" }, { status: 503 });
      }
      return new Response(new Uint8Array(b.bytes));
    }));
    const first = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    expect(first.result.current.services.retainReview?.(b.review)).toBe(true);
    await act(async () => expect(await first.result.current.services.publish(b.review, 1789750431)).toMatchObject({ state: "failed" }));
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    expect(second.result.current.recovery).toMatchObject({ state: "unpublished", publication: null });
    accept = true;
    await act(async () => expect(await second.result.current.services.publish(second.result.current.recovery!.review, 1789750800)).toMatchObject({ state: "published" }));
    expect(posts).toEqual([b.bytes, b.bytes]);
    expect(readDaoAuthoringRecovery(key, b.address)?.state).toBe("published");
  });
  it("blocks publication when storage is unavailable and retains the caller's exact document", async () => {
    const { proposer, review, identity } = reviewedContent();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => expect(await hook.result.current.services.publish(review, 100)).toMatchObject({ state: "failed" }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(deriveDaoProposalContentIdentity(review.content).bytes).toEqual(identity.bytes);
  });
  it("switches recovery with account and deployment changes without carrying the prior review", () => {
    const { proposer, review } = reviewedContent();
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review);
    const hook = renderHookWithProviders(({ address }) => useDaoAuthoringServices(address, { ...proposer, address }), { initialProps: { address: proposer.address } });
    expect(hook.result.current.recovery?.state).toBe("unpublished");
    hook.rerender({ address: "0x1111111111111111111111111111111111111111" });
    expect(hook.result.current.recovery).toBeNull();
    hook.rerender({ address: proposer.address });
    expect(hook.result.current.recovery?.state).toBe("unpublished");
    vi.stubEnv("NEXT_PUBLIC_DAO_DEPLOYMENTS", JSON.stringify([{ ...getDaoDeployments()[0], deploymentBlock: "0", votingAddress: "0x2222222222222222222222222222222222222222" }]));
    hook.rerender({ address: proposer.address });
    expect(hook.result.current.recovery).toBeNull();
    expect(readDaoAuthoringRecovery(key, proposer.address)?.review.content).toEqual(review.content);
  });
  it.each(["unpublished", "forged-published", "ineligible"])("requires server publication and current eligibility before a %s review can create a transaction", async kind => {
    const { proposer, review, identity } = reviewedContent();
    const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: 100 };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review, kind === "unpublished" ? null : publication);
    const fetcher = vi.fn(async () => new Response(null, { status: 404 })); vi.stubGlobal("fetch", fetcher);
    const prepare = vi.spyOn(OnchainDaoClient.prototype, "preparePropose");
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, { ...proposer, canPropose: kind !== "ineligible" }));
    await act(async () => expect(await hook.result.current.services.submit({ review, publication, outcome: "success" })).toMatchObject({ state: "failed" }));
    expect(prepare).not.toHaveBeenCalled();
    if (kind === "ineligible") expect(fetcher).not.toHaveBeenCalled();
  });
});
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
  it.each(["reverted", "cancelled", "changed"] as const)("retains publication and the %s transaction link through creation reload", async kind => {
    const fixture = getDaoMockFixture("discussion"), proposer = deriveDaoProposerState(fixture.proposer);
    const result = createDaoAuthoringReview({ address: proposer.address, createdAt: fixture.now,
      draft: { markdown: "# Terminal creation\n\nKeep published bytes.\n\n## Scope\n\nRecover terminal transactions.\n", proposalType: "signal", executableScript: "0x" },
      topic: { topicId: 1001, normalizedUrl: "https://gov.yearn.fi/t/topic/1001", title: "Topic", category: "Proposals", categoryId: 5, author: "user", createdAt: 1 } });
    if (result.state !== "valid") throw new Error("Invalid test review");
    const review = result.review, identity = deriveDaoProposalContentIdentity(review.content);
    const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: fixture.now };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review, publication, hash, proposer.expectedVotingEpoch);
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(kind === "reverted" ? new DaoTransactionRevertedError(hash) : new DaoTransactionReplacedError(replacement, kind));
    const first = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => { await expect(first.result.current.services.confirm(review, publication, hash, proposer.expectedVotingEpoch)).rejects.toThrow(); });
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    expect(second.result.current.recovery).toMatchObject({ transactionHash: null, publication: { fingerprint: identity.digest },
      lastFailure: { transactionHash: kind === "reverted" ? hash : replacement, code: kind === "reverted" ? "PROPOSAL_REVERTED" : "PROPOSAL_REPLACED" } });
  });

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
