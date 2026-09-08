import { beforeEach, describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  applyDaoMockFixture,
  DAO_BLOCKED_REASONS,
  DAO_MOCK_ACCOUNT_ADDRESS,
  DAO_MOCK_NOW,
  getDaoMockSnapshot,
  indexDaoMockPendingAction,
  prepareDaoMockExecute,
  prepareDaoMockFlag,
  prepareDaoMockRetract,
  prepareDaoMockVeto,
  prepareDaoMockVote,
  readDaoMockAccountProposalState,
  resetDaoMockStore,
  setDaoMockAccountState,
  setDaoMockScriptState,
  setDaoMockProposalThreshold,
  setDaoMockAlreadyVoted,
  setDaoMockRole,
  setDaoMockTransactionOutcome,
  syncDaoMockStoreToNow,
  validateDaoModerationReason,
  type DaoActionType,
  type DaoMockFixtureId,
  type DaoProposal,
} from "@/lib/clients/dao";

const SECOND_ACCOUNT =
  "0x9999999999999999999999999999999999999999" as Address;

describe("DAO mock proposal actions", () => {
  beforeEach(() => {
    resetDaoMockStore({ now: DAO_MOCK_NOW });
  });

  it("keeps a submitted vote out of canonical history until indexing", async () => {
    const before = selectedProposal();
    const totals = {
      total: before.totalWeight,
      yea: before.yeaWeight,
      events: before.events.length,
    };
    const prepared = prepareDaoMockVote(
      before.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "yea"
    );

    await expect(prepared()).resolves.toMatch(/^0x[0-9a-f]{64}$/);

    const awaiting = selectedProposal();
    expect(awaiting.totalWeight).toBe(totals.total);
    expect(awaiting.yeaWeight).toBe(totals.yea);
    expect(awaiting.events).toHaveLength(totals.events);
    expect(getDaoMockSnapshot().pendingAction).toMatchObject({
      action: "vote",
      direction: "yea",
      effectiveVotingWeight: 100n * 10n ** 18n,
    });
    expect(
      readDaoMockAccountProposalState(
        before.ref,
        DAO_MOCK_ACCOUNT_ADDRESS
      )
    ).toMatchObject({
      hasVoted: true,
      voteDirection: "yea",
      capabilities: {
        canVote: false,
        voteBlockedReason: DAO_BLOCKED_REASONS.voteAlreadySubmitted,
      },
    });

    indexDaoMockPendingAction();

    const indexed = selectedProposal();
    expect(indexed.totalWeight).toBe(totals.total + 100n * 10n ** 18n);
    expect(indexed.yeaWeight).toBe(totals.yea + 100n * 10n ** 18n);
    expect(indexed.events).toHaveLength(totals.events + 1);
    expect(indexed.events.at(-1)).toMatchObject({
      type: "vote",
      actor: DAO_MOCK_ACCOUNT_ADDRESS,
      yeaBps: 10_000,
      direction: "yea",
      weight: 100n * 10n ** 18n,
    });
    expect(getDaoMockSnapshot().pendingAction).toBeNull();
  });

  it("scopes the live one-vote overlay to the full proposal and actor identity", async () => {
    const firstProposal = load("voting");
    const secondProposal = proposalById(14n);

    await prepareDaoMockVote(
      firstProposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "yea"
    )();

    expect(
      readDaoMockAccountProposalState(
        firstProposal.ref,
        DAO_MOCK_ACCOUNT_ADDRESS
      )
    ).toMatchObject({ hasVoted: true, voteDirection: "yea" });
    expect(
      readDaoMockAccountProposalState(
        secondProposal.ref,
        DAO_MOCK_ACCOUNT_ADDRESS
      )
    ).toMatchObject({
      hasVoted: false,
      voteDirection: null,
      capabilities: { canVote: true },
    });
    expect(
      readDaoMockAccountProposalState(firstProposal.ref, SECOND_ACCOUNT)
    ).toMatchObject({
      hasVoted: false,
      voteDirection: null,
      capabilities: { canVote: true },
    });
    indexDaoMockPendingAction();

    expect(
      readDaoMockAccountProposalState(firstProposal.ref, SECOND_ACCOUNT)
    ).toMatchObject({
      hasVoted: false,
      voteDirection: null,
      capabilities: { canVote: true },
    });
    expect(() =>
      prepareDaoMockVote(
        firstProposal.ref,
        DAO_MOCK_ACCOUNT_ADDRESS,
        "nay"
      )
    ).toThrow(DAO_BLOCKED_REASONS.voteAlreadySubmitted);

    syncDaoMockStoreToNow(DAO_MOCK_NOW + 60);
    expect(
      readDaoMockAccountProposalState(
        firstProposal.ref,
        DAO_MOCK_ACCOUNT_ADDRESS
      ).hasVoted
    ).toBe(true);

    applyDaoMockFixture("voting");
    expect(
      readDaoMockAccountProposalState(
        selectedProposal().ref,
        DAO_MOCK_ACCOUNT_ADDRESS
      )
    ).toMatchObject({ hasVoted: false, voteDirection: null });
  });

  it("scopes lifecycle roles to the exact actor and records the authorized author", async () => {
    const proposal = load("discussion");
    const author = getDaoMockSnapshot().account.address;

    expect(
      readDaoMockAccountProposalState(proposal.ref, author)
    ).toMatchObject({
      isProposer: true,
      capabilities: { canRetract: true },
    });
    expect(
      readDaoMockAccountProposalState(proposal.ref, SECOND_ACCOUNT)
    ).toMatchObject({
      isProposer: false,
      isOperator: false,
      isGuardian: false,
      capabilities: { canRetract: false },
    });
    expect(() => prepareDaoMockRetract(proposal.ref, SECOND_ACCOUNT)).toThrow(
      DAO_BLOCKED_REASONS.notProposer
    );

    await prepareDaoMockRetract(proposal.ref, author)();
    indexDaoMockPendingAction();

    expect(selectedProposal().events.at(-1)).toMatchObject({
      type: "retract",
      actor: null,
    });
  });

  it("keeps operator and guardian roles actor-scoped without narrowing permissionless execution", () => {
    const guarded = load("guarded-execution");
    const operator = getDaoMockSnapshot().account.address;
    expect(
      readDaoMockAccountProposalState(guarded.ref, operator)
    ).toMatchObject({ isOperator: true, capabilities: { canExecute: true } });
    expect(
      readDaoMockAccountProposalState(guarded.ref, SECOND_ACCOUNT)
    ).toMatchObject({
      isOperator: false,
      capabilities: { canExecute: false },
    });

    const earlyVeto = load("early-veto");
    const guardian = getDaoMockSnapshot().account.address;
    expect(
      readDaoMockAccountProposalState(earlyVeto.ref, guardian)
    ).toMatchObject({ isGuardian: true });
    expect(
      readDaoMockAccountProposalState(earlyVeto.ref, SECOND_ACCOUNT)
    ).toMatchObject({ isGuardian: false, capabilities: { canVeto: false } });

    const permissionless = load("permissionless-execution");
    expect(
      readDaoMockAccountProposalState(permissionless.ref, SECOND_ACCOUNT)
    ).toMatchObject({
      isOperator: false,
      capabilities: { canExecute: false, executeBlockedReason: DAO_BLOCKED_REASONS.executionSimulationMismatch },
    });
  });

  it("rechecks capability after preparation and before submission", async () => {
    const proposal = load("voting");
    const prepared = prepareDaoMockVote(
      proposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "yea"
    );

    setDaoMockAlreadyVoted(true, "nay");

    await expect(prepared()).rejects.toThrow(
      DAO_BLOCKED_REASONS.voteAlreadySubmitted
    );
    expect(getDaoMockSnapshot().pendingAction).toBeNull();
  });

  it("keeps fixture vote facts identity-scoped and rechecks time at submission", async () => {
    const proposal = load("voting");
    const otherProposal = proposalById(14n);
    setDaoMockAlreadyVoted(true, "nay");

    expect(
      readDaoMockAccountProposalState(
        proposal.ref,
        DAO_MOCK_ACCOUNT_ADDRESS
      )
    ).toMatchObject({ hasVoted: true, voteDirection: "nay" });
    expect(
      readDaoMockAccountProposalState(
        otherProposal.ref,
        DAO_MOCK_ACCOUNT_ADDRESS
      ).hasVoted
    ).toBe(false);
    expect(
      readDaoMockAccountProposalState(proposal.ref, SECOND_ACCOUNT).hasVoted
    ).toBe(false);

    setDaoMockAlreadyVoted(false);
    const prepared = prepareDaoMockVote(
      proposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "yea"
    );
    syncDaoMockStoreToNow(proposal.voteEndsAt);

    await expect(prepared()).rejects.toThrow(DAO_BLOCKED_REASONS.voteClosed);
    expect(getDaoMockSnapshot().pendingAction).toBeNull();
  });

  it.each(["script", "configuration", "time"] as const)("invalidates prepared data after %s changes even if voting remains possible", async change => {
    const proposal = load("voting");
    const prepared = prepareDaoMockVote(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS, "yea");
    if (change === "script") setDaoMockScriptState("malformed");
    if (change === "configuration") setDaoMockProposalThreshold(6000);
    if (change === "time") syncDaoMockStoreToNow(DAO_MOCK_NOW + 12);
    expect(readDaoMockAccountProposalState(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS).capabilities.canVote).toBe(true);
    await expect(prepared()).rejects.toThrow("DAO preparation changed");
    expect(getDaoMockSnapshot().pendingAction).toBeNull();
  });

  it.each(["disconnected", "wrong-network"] as const)("blocks prepared writes after %s", async state => {
    const proposal = load("voting");
    const prepared = prepareDaoMockVote(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS, "yea");
    setDaoMockAccountState(state);
    await expect(prepared()).rejects.toThrow();
    expect(getDaoMockSnapshot().pendingAction).toBeNull();
  });

  it("assigns every submission unique deterministic provenance and indexes once", async () => {
    const proposal = load("voting");
    const firstHash = await prepareDaoMockVote(
      proposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "yea"
    )();
    expect(getDaoMockSnapshot().pendingAction?.transactionHash).toBe(firstHash);

    indexDaoMockPendingAction();
    const firstIndexed = selectedProposal();
    const firstEvent = firstIndexed.events.at(-1)!;
    expect(firstEvent.log).toMatchObject({
      transactionHash: firstHash,
      transactionIndex: 0,
      logIndex: 0,
    });
    const firstEventCount = firstIndexed.events.length;
    indexDaoMockPendingAction();
    expect(selectedProposal().events).toHaveLength(firstEventCount);

    const secondHash = await prepareDaoMockVote(
      proposal.ref,
      SECOND_ACCOUNT,
      "nay"
    )();
    expect(secondHash).not.toBe(firstHash);
    expect(getDaoMockSnapshot().pendingAction?.transactionHash).toBe(secondHash);

    indexDaoMockPendingAction();
    const secondEvent = selectedProposal().events.at(-1)!;
    expect(secondEvent.log).toMatchObject({
      transactionHash: secondHash,
      transactionIndex: 0,
      logIndex: 0,
    });
    expect(secondEvent.log.blockNumber).toBe(firstEvent.log.blockNumber + 1n);
    expect(secondEvent.log.blockHash).not.toBe(firstEvent.log.blockHash);

    resetDaoMockStore({ now: DAO_MOCK_NOW });
    const resetHash = await prepareDaoMockVote(
      selectedProposal().ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "yea"
    )();
    expect(resetHash).toBe(firstHash);
  });

  it("preserves an indexed block while runtime time moves within and beyond its slot", async () => {
    const proposal = load("voting");
    const before = getDaoMockSnapshot().feed.canonicalBlock;
    await prepareDaoMockVote(
      proposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "yea"
    )();
    indexDaoMockPendingAction();

    const indexed = getDaoMockSnapshot().feed.canonicalBlock;
    expect(indexed.number).toBe(before.number + 1n);

    syncDaoMockStoreToNow(DAO_MOCK_NOW + 1);
    expect(getDaoMockSnapshot().feed.canonicalBlock).toEqual(indexed);

    syncDaoMockStoreToNow(DAO_MOCK_NOW + 12);
    const nextBlock = getDaoMockSnapshot().feed.canonicalBlock;
    expect(nextBlock).toMatchObject({
      number: indexed.number + 1n,
      timestamp: DAO_MOCK_NOW + 12,
    });
    expect(nextBlock.hash).not.toBe(indexed.hash);
  });

  it("allows participation voting after a post-vote veto", async () => {
    const proposal = load("post-vote-veto");
    const account = readDaoMockAccountProposalState(
      proposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS
    );
    expect(account.capabilities).toMatchObject({
      canVote: true,
      votePurpose: "participation_only",
    });

    await prepareDaoMockVote(
      proposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "nay"
    )();
    indexDaoMockPendingAction();

    expect(selectedProposal()).toMatchObject({
      protocolStatus: "vetoed",
      displayStatus: "vetoed",
    });
    expect(selectedProposal().events.at(-1)).toMatchObject({
      type: "vote",
      direction: "nay",
    });
  });

  it("blocks an early-veto vote, a duplicate vote, and zero effective weight", () => {
    const earlyVeto = load("early-veto");
    expect(() =>
      prepareDaoMockVote(
        earlyVeto.ref,
        DAO_MOCK_ACCOUNT_ADDRESS,
        "yea"
      )
    ).toThrow(DAO_BLOCKED_REASONS.voteLifecycle);

    const voting = load("voting");
    setDaoMockAccountState("already-voted");
    expect(() =>
      prepareDaoMockVote(voting.ref, DAO_MOCK_ACCOUNT_ADDRESS, "nay")
    ).toThrow(DAO_BLOCKED_REASONS.voteAlreadySubmitted);

    setDaoMockAccountState("no-weight");
    expect(() =>
      prepareDaoMockVote(voting.ref, DAO_MOCK_ACCOUNT_ADDRESS, "nay")
    ).toThrow(DAO_BLOCKED_REASONS.zeroVotingWeight);
  });

  it.each([
    ["retract", "discussion", "proposer", "retracted", null],
    ["flag", "discussion", "operator", "flagged", "Malformed or spam"],
    ["veto", "discussion", "guardian", "vetoed", "Emergency veto"],
    ["execute", "permissionless-execution", null, "executed", null],
  ] as const)(
    "applies the exact %s effect only after indexing",
    async (action, fixture, role, expectedStatus, reason) => {
      const proposal = load(fixture);
      if (role) setDaoMockRole(role, true);
      const beforeEvents = selectedProposal().events.length;
      const prepared = prepareAction(action, proposal, reason);

      await prepared();
      expect(selectedProposal().displayStatus).not.toBe(expectedStatus);
      expect(getDaoMockSnapshot().pendingAction).toMatchObject({ action });

      indexDaoMockPendingAction();

      const indexed = selectedProposal();
      expect(indexed.displayStatus).toBe(expectedStatus);
      expect(indexed.events).toHaveLength(beforeEvents + 1);
      expect(indexed.events.at(-1)).toMatchObject({
        type: action,
        reason,
      });
      if (action === "flag") {
        expect(indexed.moderation.flagReason).toBe(reason);
      }
      if (action === "veto") {
        expect(indexed.moderation.vetoReason).toBe(reason);
        expect(
          readDaoMockAccountProposalState(
            indexed.ref,
            DAO_MOCK_ACCOUNT_ADDRESS
          ).capabilities.canVote
        ).toBe(false);
      }
    }
  );

  it("keeps post-vote veto participation open after the veto is indexed", async () => {
    const proposal = load("voting");
    setDaoMockRole("guardian", true);
    await prepareDaoMockVeto(
      proposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "Post-vote safeguard"
    )();
    indexDaoMockPendingAction();

    const indexed = selectedProposal();
    expect(indexed.protocolStatus).toBe("vetoed");
    expect(
      readDaoMockAccountProposalState(
        indexed.ref,
        DAO_MOCK_ACCOUNT_ADDRESS
      ).capabilities
    ).toMatchObject({ canVote: true, votePurpose: "participation_only" });
  });

  it.each(["user-rejected", "revert", "network-error"] as const)(
    "does not create a pending action when the transaction outcome is %s",
    async (outcome) => {
      const proposal = load("voting");
      setDaoMockTransactionOutcome(outcome);
      const prepared = prepareDaoMockVote(
        proposal.ref,
        DAO_MOCK_ACCOUNT_ADDRESS,
        "yea"
      );

      await expect(prepared()).rejects.toThrow();
      expect(getDaoMockSnapshot().pendingAction).toBeNull();
      expect(getDaoMockSnapshot().account.hasVoted).toBe(false);
    }
  );

  it("validates required moderation reasons against the pinned UTF-8 byte bound", () => {
    expect(validateDaoModerationReason("  ")).toMatchObject({
      bytes: 0,
      error: "Enter a reason.",
    });
    expect(validateDaoModerationReason("a".repeat(256))).toMatchObject({
      bytes: 256,
      error: null,
    });
    expect(validateDaoModerationReason("é".repeat(129))).toMatchObject({
      bytes: 258,
      error: "Reason must be at most 256 UTF-8 bytes.",
    });
  });

  it("resets transaction controls and any pending live overlay", async () => {
    const proposal = load("voting");
    await prepareDaoMockVote(
      proposal.ref,
      DAO_MOCK_ACCOUNT_ADDRESS,
      "yea"
    )();
    setDaoMockTransactionOutcome("network-error");

    expect(getDaoMockSnapshot()).toMatchObject({
      transactionOutcome: "network-error",
      pendingAction: { action: "vote" },
    });

    resetDaoMockStore({ now: DAO_MOCK_NOW });
    expect(getDaoMockSnapshot()).toMatchObject({
      transactionOutcome: "success",
      pendingAction: null,
    });
  });
});

function load(fixture: DaoMockFixtureId): DaoProposal {
  applyDaoMockFixture(fixture);
  return selectedProposal();
}

function selectedProposal(): DaoProposal {
  const runtime = getDaoMockSnapshot();
  const proposal = runtime.feed.proposals.find(
    (candidate) => candidate.ref.proposalId === runtime.selectedProposalId
  );
  if (!proposal) throw new Error("Selected DAO proposal is unavailable.");
  return proposal;
}

function proposalById(proposalId: bigint): DaoProposal {
  const proposal = getDaoMockSnapshot().feed.proposals.find(
    (candidate) => candidate.ref.proposalId === proposalId
  );
  if (!proposal) {
    throw new Error(`DAO proposal ${proposalId.toString()} is unavailable.`);
  }
  return proposal;
}

function prepareAction(
  action: Exclude<DaoActionType, "vote">,
  proposal: DaoProposal,
  reason: string | null
) {
  const actor = getDaoMockSnapshot().account.address;
  if (action === "retract") {
    return prepareDaoMockRetract(proposal.ref, actor);
  }
  if (action === "flag") {
    return prepareDaoMockFlag(
      proposal.ref,
      actor,
      reason ?? "Flag"
    );
  }
  if (action === "veto") {
    return prepareDaoMockVeto(
      proposal.ref,
      actor,
      reason ?? "Veto"
    );
  }
  return prepareDaoMockExecute(proposal.ref, actor);
}
