import { createDaoExecuteCall } from "@/lib/clients/dao/execute-call";
import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  assertDaoProposalInvariants,
  DAO_BLOCKED_REASONS,
  DAO_EMPTY_SCRIPT_HASH,
  DAO_MOCK_ACCOUNT_ADDRESS,
  DAO_MOCK_FEED,
  DAO_MOCK_NOW,
  daoProposalPasses,
  deriveDaoCapabilities,
  deriveDaoDisplayGroup,
  deriveDaoDisplayStatus,
  deriveDaoLifecycleFacts,
  deriveDaoProposalExecutionReadiness,
  deriveDaoProposalTiming,
  deriveDaoProposerState,
  deriveDaoProtocolStatus,
  deriveDaoVotingWeight,
  getDaoMockFixture,
  serializeDaoProposalRef,
  type DaoAccountProposalFacts,
  type DaoProposal,
  type DaoProposalLifecycleInput,
  type DaoProposerEligibilityInput,
} from "@/lib/clients/dao";

const DAY = 86_400;

function proposal(id: bigint): DaoProposal {
  const result = DAO_MOCK_FEED.proposals.find(
    (candidate) => candidate.ref.proposalId === id
  );
  if (!result) throw new Error(`Missing proposal fixture ${id.toString()}.`);
  return structuredClone(result);
}

function lifecycle(
  overrides: Partial<DaoProposalLifecycleInput> = {}
): DaoProposalLifecycleInput {
  return {
    exists: true,
    now: 200,
    voteStartsAt: 100,
    voteEndsAt: 300,
    postVoteEpochEndsAt: 500,
    type: "executable",
    thresholdBps: 5_500,
    totalWeight: 100n,
    yeaWeight: 55n,
    retracted: false,
    executed: false,
    flagged: false,
    vetoed: false,
    ...overrides,
  };
}

function capabilityAccount(
  proposalValue: DaoProposal,
  overrides: Partial<DaoAccountProposalFacts> = {}
): DaoAccountProposalFacts {
  return {
    address: DAO_MOCK_ACCOUNT_ADDRESS,
    connected: true,
    correctChain: true,
    votingWeight: 100n,
    effectiveVotingWeight: 100n,
    decayBps: 10_000,
    hasVoted: false,
    voteDirection: null,
    isProposer: false,
    isOperator: false,
    isGuardian: false,
    executionPreflight: {
      call: proposalValue.script.bytes ? createDaoExecuteCall(proposalValue.ref, DAO_MOCK_ACCOUNT_ADDRESS, proposalValue.script.bytes) : null,
      state: "succeeded",
      scriptHash: proposalValue.script.hash,
      blockNumber: 1n,
      simulatedAt: "2026-08-18T12:00:00Z",
      error: null,
    },
    ...overrides,
  };
}

function proposerInput(
  overrides: Partial<DaoProposerEligibilityInput> = {}
): DaoProposerEligibilityInput {
  return {
    address: DAO_MOCK_ACCOUNT_ADDRESS,
    connected: true,
    correctChain: true,
    now: 1_000,
    currentWeight: 10n,
    minimumWeight: 5n,
    blacklisted: false,
    lastProposedAt: null,
    cooldownSeconds: 100,
    expectedVotingEpoch: 9n,
    affectedBoostEpochs: Array.from({ length: 6 }, (_, index) => ({
      epoch: 9n + BigInt(index),
      currentProposalCount: index,
      proposalLimit: 64 as const,
    })),
    ...overrides,
  };
}

describe("DAO proposal identity and lifecycle", () => {
  it("serializes the full identity with a normalized Voting address", () => {
    expect(
      serializeDaoProposalRef({
        chainId: 1,
        votingAddress:
          "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa" as Address,
        proposalId: 7n,
      })
    ).toBe("1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:7");
  });

  it("uses each proposal's snapshotted threshold and requires at least one vote", () => {
    expect(daoProposalPasses(0n, 0n, 0)).toBe(false);
    expect(daoProposalPasses(100n, 55n, 5_500)).toBe(true);
    expect(daoProposalPasses(100n, 55n, 5_501)).toBe(false);
  });

  it("switches status at the exact vote and post-vote epoch boundaries", () => {
    expect(deriveDaoProtocolStatus(lifecycle({ now: 99 }))).toBe("proposed");
    expect(deriveDaoProtocolStatus(lifecycle({ now: 100 }))).toBe("voting");
    expect(deriveDaoProtocolStatus(lifecycle({ now: 299 }))).toBe("voting");
    expect(deriveDaoProtocolStatus(lifecycle({ now: 300 }))).toBe("passed");
    expect(
      deriveDaoProtocolStatus(lifecycle({ now: 300, yeaWeight: 54n }))
    ).toBe("failed");
    expect(deriveDaoProtocolStatus(lifecycle({ now: 500 }))).toBe("expired");
    expect(
      deriveDaoProtocolStatus(lifecycle({ now: 500, type: "signal" }))
    ).toBe("executed");
  });

  it("preserves the contract's terminal-boolean priority", () => {
    expect(
      deriveDaoProtocolStatus(
        lifecycle({
          executed: true,
          flagged: true,
          vetoed: true,
          retracted: true,
        })
      )
    ).toBe("executed");
    expect(
      deriveDaoProtocolStatus(
        lifecycle({ flagged: true, vetoed: true, retracted: true })
      )
    ).toBe("flagged");
    expect(
      deriveDaoProtocolStatus(lifecycle({ vetoed: true, retracted: true }))
    ).toBe("vetoed");
  });

  it("keeps terminal signals approved without implying execution", () => {
    expect(deriveDaoDisplayStatus("executed", "signal")).toBe("approved");
    expect(deriveDaoDisplayGroup("approved", "signal")).toBe("closed");
    expect(deriveDaoDisplayGroup("approved", "executable")).toBe("active");
  });

  it("separates lifecycle status, vote result, moderation, and execution", () => {
    expect(deriveDaoLifecycleFacts(proposal(4n), DAO_MOCK_NOW)).toMatchObject({
      status: "executed",
      voteResult: "approved",
      moderation: { kind: null },
      execution: { state: "no_actions", guard: null },
    });
    expect(deriveDaoLifecycleFacts(proposal(11n), DAO_MOCK_NOW)).toMatchObject({
      status: "flagged",
      voteResult: null,
      moderation: {
        kind: "flagged",
        reason: "Malformed proposal content",
      },
      execution: { state: "blocked" },
    });
  });

  it("distinguishes early veto from post-participation veto", () => {
    expect(deriveDaoLifecycleFacts(proposal(12n), DAO_MOCK_NOW)).toMatchObject({
      voteResult: null,
      moderation: {
        kind: "vetoed",
        votingAvailable: false,
        executionBlocked: true,
      },
    });
    expect(deriveDaoLifecycleFacts(proposal(13n), DAO_MOCK_NOW)).toMatchObject({
      voteResult: null,
      moderation: {
        kind: "vetoed",
        votingAvailable: true,
        executionBlocked: true,
      },
    });
  });
});

describe("DAO proposal execution readiness", () => {
  it("derives the exact typed integrity states from proposal type and script bytes", () => {
    expect(deriveDaoProposalExecutionReadiness(proposal(4n))).toEqual({
      state: "not_applicable",
      blocker: null,
      reason: null,
    });
    expect(deriveDaoProposalExecutionReadiness(proposal(5n))).toEqual({
      state: "integrity_ready",
      blocker: null,
      reason: null,
    });
    expect(deriveDaoProposalExecutionReadiness(proposal(19n))).toEqual({
      state: "integrity_blocked",
      blocker: "stored_script_hash_mismatch",
      reason: "Stored script hash does not match the proposed event script.",
    });

    const withoutExactBytes = proposal(21n);
    withoutExactBytes.script.bytes = null;
    withoutExactBytes.script.hashVerified = null;
    expect(deriveDaoProposalExecutionReadiness(withoutExactBytes)).toEqual({
      state: "integrity_blocked",
      blocker: "exact_script_unavailable",
      reason: "Exact proposed event script bytes are unavailable.",
    });
  });

  it("does not conflate integrity with lifecycle, moderation, analysis, or guard state", () => {
    for (const proposalId of [
      5n,
      6n,
      7n,
      9n,
      13n,
      14n,
      17n,
      21n,
      22n,
    ]) {
      expect(
        deriveDaoProposalExecutionReadiness(proposal(proposalId)),
        `proposal ${proposalId.toString()}`
      ).toEqual({
        state: "integrity_ready",
        blocker: null,
        reason: null,
      });
    }
  });

  it("requires hashVerified to equal the actual hash comparison when bytes exist", () => {
    const matchingMarkedFalse = proposal(21n);
    matchingMarkedFalse.script.hashVerified = false;
    expect(() => assertDaoProposalInvariants(matchingMarkedFalse)).toThrow(
      /hashVerified/i
    );

    const matchingMarkedUnknown = proposal(21n);
    matchingMarkedUnknown.script.hashVerified = null;
    expect(() => assertDaoProposalInvariants(matchingMarkedUnknown)).toThrow(
      /hashVerified/i
    );

    const mismatchMarkedTrue = proposal(19n);
    mismatchMarkedTrue.script.hashVerified = true;
    expect(() => assertDaoProposalInvariants(mismatchMarkedTrue)).toThrow(
      /hashVerified/i
    );
  });

  it("allows nullable hash verification only when exact bytes are absent", () => {
    const missingBytes = proposal(21n);
    missingBytes.script.bytes = null;
    missingBytes.script.hashVerified = null;
    expect(() => assertDaoProposalInvariants(missingBytes)).not.toThrow();

    missingBytes.script.hashVerified = false;
    expect(() => assertDaoProposalInvariants(missingBytes)).toThrow(
      /hashVerified/i
    );
  });
});

describe("DAO timing and voting weight", () => {
  it("derives voting and execution times from live configuration inputs", () => {
    expect(
      deriveDaoProposalTiming({
        genesis: 1_000,
        createdAt: 1_150,
        epochLengthSeconds: 100,
        voteStartOffsetSeconds: 40,
        executionDelaySeconds: 25,
      })
    ).toEqual({
      votingEpoch: 2n,
      voteStartsAt: 1_240,
      voteEndsAt: 1_300,
      executionStartsAt: 1_325,
      executionEndsAt: 1_400,
    });
  });

  it("matches the Voter's strict decay start and integer flooring", () => {
    expect(
      deriveDaoVotingWeight({
        votingWeight: 101n,
        now: 900,
        voteEndsAt: 1_000,
        decayLengthSeconds: 100,
      })
    ).toEqual({
      votingWeight: 101n,
      effectiveVotingWeight: 101n,
      decayBps: 10_000,
    });
    expect(
      deriveDaoVotingWeight({
        votingWeight: 101n,
        now: 951,
        voteEndsAt: 1_000,
        decayLengthSeconds: 100,
      })
    ).toEqual({
      votingWeight: 101n,
      effectiveVotingWeight: 49n,
      decayBps: 4_900,
    });
    expect(
      deriveDaoVotingWeight({
        votingWeight: 101n,
        now: 1_000,
        voteEndsAt: 1_000,
        decayLengthSeconds: 100,
      }).effectiveVotingWeight
    ).toBe(0n);
  });
});

describe("DAO action capabilities", () => {
  it("allows participation voting after a post-vote veto", () => {
    const fixture = getDaoMockFixture("post-vote-veto");
    const value = proposal(fixture.proposalRef.proposalId);

    expect(
      deriveDaoCapabilities({
        proposal: value,
        account: fixture.account,
        now: fixture.now,
        vetoEndsAt: fixture.vetoEndsAt,
        executionGuard: fixture.executionGuard,
      })
    ).toMatchObject({
      canVote: true,
      votePurpose: "participation_only",
      voteBlockedReason: null,
      canExecute: false,
    });
  });

  it("blocks voting after an early veto", () => {
    const fixture = getDaoMockFixture("early-veto");
    const value = proposal(fixture.proposalRef.proposalId);
    const capabilities = deriveDaoCapabilities({
      proposal: value,
      account: fixture.account,
      now: fixture.now,
      vetoEndsAt: fixture.vetoEndsAt,
      executionGuard: fixture.executionGuard,
    });

    expect(capabilities.canVote).toBe(false);
    expect(capabilities.votePurpose).toBeNull();
    expect(capabilities.voteBlockedReason).toBe(
      DAO_BLOCKED_REASONS.voteLifecycle
    );
  });

  it("does not use content availability to authorize voting", () => {
    const value = proposal(14n);
    const account = capabilityAccount(value);
    const capabilities = deriveDaoCapabilities({
      proposal: value,
      account,
      now: DAO_MOCK_NOW,
      vetoEndsAt: value.executionEndsAt!,
      executionGuard: "guarded",
    });

    expect(value.content.state).toBe("unavailable");
    expect(capabilities.canVote).toBe(true);
    expect(capabilities.votePurpose).toBe("decision");
  });

  it("changes vote, moderation, and veto capabilities at exact time boundaries", () => {
    const voting = proposal(2n);
    const roles = capabilityAccount(voting, {
      isProposer: true,
      isOperator: true,
      isGuardian: true,
    });

    const atVoteStart = deriveDaoCapabilities({
      proposal: voting,
      account: roles,
      now: voting.voteStartsAt,
      vetoEndsAt: voting.executionEndsAt!,
      executionGuard: "guarded",
    });
    expect(atVoteStart).toMatchObject({
      canVote: true,
      canVeto: true,
    });
    expect(atVoteStart.canRetract).toBe(false);
    expect(atVoteStart.retractBlockedReason).toBe(
      DAO_BLOCKED_REASONS.proposalHasVotes
    );
    expect(atVoteStart.canFlag).toBe(false);
    expect(atVoteStart.flagBlockedReason).toBe(
      DAO_BLOCKED_REASONS.proposalHasVotes
    );

    const atVoteEnd = deriveDaoCapabilities({
      proposal: voting,
      account: roles,
      now: voting.voteEndsAt,
      vetoEndsAt: voting.executionEndsAt!,
      executionGuard: "guarded",
    });
    expect(atVoteEnd.canVote).toBe(false);
    expect(atVoteEnd.voteBlockedReason).toBe(DAO_BLOCKED_REASONS.voteClosed);
    expect(atVoteEnd.retractBlockedReason).toBe(
      DAO_BLOCKED_REASONS.retractLifecycle
    );
    expect(atVoteEnd.flagBlockedReason).toBe(
      DAO_BLOCKED_REASONS.flagLifecycle
    );

    const atVetoEnd = deriveDaoCapabilities({
      proposal: voting,
      account: roles,
      now: voting.executionEndsAt!,
      vetoEndsAt: voting.executionEndsAt!,
      executionGuard: "guarded",
    });
    expect(atVetoEnd.canVeto).toBe(false);
    expect(atVetoEnd.vetoBlockedReason).toBe(
      DAO_BLOCKED_REASONS.vetoLifecycle
    );
  });

  it("enforces the public Voter one-vote rule from hasVoted", () => {
    const value = proposal(2n);
    const account = capabilityAccount(value, {
      hasVoted: true,
      voteDirection: "yea",
    });

    const capabilities = deriveDaoCapabilities({
      proposal: value,
      account,
      now: DAO_MOCK_NOW,
      vetoEndsAt: value.executionEndsAt!,
      executionGuard: "guarded",
    });

    expect(capabilities).toMatchObject({
      canVote: false,
      votePurpose: null,
      voteBlockedReason: DAO_BLOCKED_REASONS.voteAlreadySubmitted,
    });
  });

  it("allows no-vote moderation during the voting epoch", () => {
    const discussion = proposal(1n);
    const roles = capabilityAccount(discussion, {
      isProposer: true,
      isOperator: true,
      isGuardian: true,
    });

    const capabilities = deriveDaoCapabilities({
      proposal: discussion,
      account: roles,
      now: DAO_MOCK_NOW,
      vetoEndsAt: discussion.voteEndsAt + 14 * DAY,
      executionGuard: "guarded",
    });

    expect(capabilities).toMatchObject({
      canRetract: true,
      canFlag: true,
      canVeto: true,
    });
  });

  it.each(["caller", "destination", "arguments", "chain", "missing"] as const)("requires an exact Voting.execute preflight binding: %s", mutation => {
    const value = proposal(22n);
    const account = capabilityAccount(value);
    const call = account.executionPreflight.call!;
    if (mutation === "caller") call.caller = "0x9999999999999999999999999999999999999999";
    if (mutation === "destination") call.to = "0x2222222222222222222222222222222222222222";
    if (mutation === "arguments") call.data = "0x12345678";
    if (mutation === "chain") call.chainId = 10;
    if (mutation === "missing") account.executionPreflight.call = null;
    expect(deriveDaoCapabilities({ proposal: value, account, now: DAO_MOCK_NOW,
      vetoEndsAt: value.voteEndsAt + 1209600, executionGuard: "permissionless" })
      .executeBlockedReason).toBe(DAO_BLOCKED_REASONS.executionSimulationMismatch);
  });

  it("rejects a stale successful execution simulation", () => {
    const value = proposal(22n);
    const account = capabilityAccount(value);
    account.executionPreflight.simulatedAt = new Date((DAO_MOCK_NOW - 301) * 1000).toISOString();
    expect(deriveDaoCapabilities({ proposal: value, account, now: DAO_MOCK_NOW,
      vetoEndsAt: value.voteEndsAt + 1209600, executionGuard: "permissionless" })
      .executeBlockedReason).toBe(DAO_BLOCKED_REASONS.executionSimulationRequired);
  });

  it("requires operator access, an exact script, and fresh matching simulation", () => {
    const value = proposal(21n);
    const baseAccount = capabilityAccount(value);
    const vetoEndsAt = value.executionEndsAt!;

    expect(
      deriveDaoCapabilities({
        proposal: value,
        account: baseAccount,
        now: DAO_MOCK_NOW,
        vetoEndsAt,
        executionGuard: "guarded",
      }).executeBlockedReason
    ).toBe(DAO_BLOCKED_REASONS.guardedExecution);

    const operator = { ...baseAccount, isOperator: true };
    expect(
      deriveDaoCapabilities({
        proposal: value,
        account: operator,
        now: DAO_MOCK_NOW,
        vetoEndsAt,
        executionGuard: "guarded",
      }).canExecute
    ).toBe(true);

    const mismatch = proposal(19n);
    expect(
      deriveDaoCapabilities({
        proposal: mismatch,
        account: capabilityAccount(mismatch, { isOperator: true }),
        now: DAO_MOCK_NOW,
        vetoEndsAt: mismatch.executionEndsAt!,
        executionGuard: "guarded",
      }).executeBlockedReason
    ).toBe(DAO_BLOCKED_REASONS.scriptHashMismatch);
  });

  it("opens and closes execution at the configured exact boundaries", () => {
    const value = proposal(21n);
    const account = capabilityAccount(value, { isOperator: true });
    // The successful actual-call preflight must be fresh at the tested boundary.
    account.executionPreflight.simulatedAt = new Date(value.executionStartsAt! * 1000).toISOString();

    expect(
      deriveDaoCapabilities({
        proposal: value,
        account,
        now: value.executionStartsAt!,
        vetoEndsAt: value.executionEndsAt!,
        executionGuard: "guarded",
      }).canExecute
    ).toBe(true);
    expect(
      deriveDaoCapabilities({
        proposal: value,
        account,
        now: value.executionEndsAt!,
        vetoEndsAt: value.executionEndsAt!,
        executionGuard: "guarded",
      }).executeBlockedReason
    ).toBe(DAO_BLOCKED_REASONS.executionExpired);
  });

  it("rejects the empty-script hash for executables without retained bytes", () => {
    const value = proposal(21n);
    value.script = {
      bytes: null,
      hash: DAO_EMPTY_SCRIPT_HASH,
      hashVerified: null,
    };

    expect(() => assertDaoProposalInvariants(value)).toThrow(/empty/i);
  });

  it("validates vote event yea basis points", () => {
    for (const invalidYeaBps of [-1, 7_500.5, 10_001]) {
      const value = proposal(2n);
      const vote = value.events.find((event) => event.type === "vote");
      if (!vote) throw new Error("Missing vote fixture.");
      vote.yeaBps = invalidYeaBps;

      expect(() => assertDaoProposalInvariants(value)).toThrow(/yeaBps/i);
    }
  });

  it("keeps binary direction consistent with raw vote basis points", () => {
    const mismatchedHuman = proposal(2n);
    const humanVote = mismatchedHuman.events.find(
      (event) => event.type === "vote" && event.direction === "yea"
    );
    if (!humanVote) throw new Error("Missing human vote fixture.");
    humanVote.yeaBps = 0;
    expect(() => assertDaoProposalInvariants(mismatchedHuman)).toThrow(
      /direction must match/i
    );

    const directedAggregate = proposal(2n);
    const aggregateVote = directedAggregate.events.find(
      (event) =>
        event.type === "vote" && event.yeaBps === 7_500
    );
    if (!aggregateVote) throw new Error("Missing aggregate vote fixture.");
    aggregateVote.direction = "yea";
    expect(() => assertDaoProposalInvariants(directedAggregate)).toThrow(
      /direction must match/i
    );
  });
});

describe("DAO proposer eligibility", () => {
  it("reports the six shared capacity epochs and blocks when any reaches 64", () => {
    const affectedBoostEpochs = proposerInput().affectedBoostEpochs.map(
      (affected, index) => ({
        ...affected,
        currentProposalCount: index === 4 ? 64 : affected.currentProposalCount,
      })
    );
    const state = deriveDaoProposerState(
      proposerInput({ affectedBoostEpochs })
    );

    expect(state.affectedBoostEpochs).toHaveLength(6);
    expect(state.canPropose).toBe(false);
    expect(state.proposeBlockedReason).toBe(
      DAO_BLOCKED_REASONS.proposerCapacity
    );
  });

  it("requires affected boost epochs to start at the voting epoch", () => {
    const affectedBoostEpochs = proposerInput().affectedBoostEpochs.map(
      (affected) => ({ ...affected, epoch: affected.epoch + 1n })
    );

    expect(() =>
      deriveDaoProposerState(proposerInput({ affectedBoostEpochs }))
    ).toThrow(/expected voting epoch/i);
  });

  it("requires affected boost epochs to be consecutive", () => {
    const affectedBoostEpochs = proposerInput().affectedBoostEpochs.map(
      (affected, index) => ({
        ...affected,
        epoch: index === 3 ? affected.epoch + 1n : affected.epoch,
      })
    );

    expect(() =>
      deriveDaoProposerState(proposerInput({ affectedBoostEpochs }))
    ).toThrow(/consecutive/i);
  });

  it("uses wallet, network, blacklist, weight, cooldown, then capacity priority", () => {
    const fullEpochs = proposerInput().affectedBoostEpochs.map((affected) => ({
      ...affected,
      currentProposalCount: 64,
    }));
    const cases: Array<
      [Partial<DaoProposerEligibilityInput>, string]
    > = [
      [
        {
          connected: false,
          correctChain: false,
          blacklisted: true,
          currentWeight: 0n,
          affectedBoostEpochs: fullEpochs,
        },
        DAO_BLOCKED_REASONS.walletDisconnected,
      ],
      [
        {
          correctChain: false,
          blacklisted: true,
          currentWeight: 0n,
          affectedBoostEpochs: fullEpochs,
        },
        DAO_BLOCKED_REASONS.wrongNetwork,
      ],
      [
        { blacklisted: true, currentWeight: 0n, affectedBoostEpochs: fullEpochs },
        DAO_BLOCKED_REASONS.proposerBlacklisted,
      ],
      [
        { currentWeight: 0n, affectedBoostEpochs: fullEpochs },
        DAO_BLOCKED_REASONS.proposerWeight,
      ],
      [
        {
          lastProposedAt: 950,
          cooldownSeconds: 100,
          affectedBoostEpochs: fullEpochs,
        },
        DAO_BLOCKED_REASONS.proposerCooldown,
      ],
      [
        { affectedBoostEpochs: fullEpochs },
        DAO_BLOCKED_REASONS.proposerCapacity,
      ],
    ];

    for (const [overrides, expectedReason] of cases) {
      expect(
        deriveDaoProposerState(proposerInput(overrides)).proposeBlockedReason
      ).toBe(expectedReason);
    }
  });

  it("does not treat the rolling cap as a per-account allowance", () => {
    const state = deriveDaoProposerState(
      proposerInput({
        lastProposedAt: DAO_MOCK_NOW - 30 * DAY,
        now: DAO_MOCK_NOW,
      })
    );

    expect(state.canPropose).toBe(true);
    expect(state.proposeBlockedReason).toBeNull();
  });

  it("allows proposal creation at the exact cooldown boundary", () => {
    const state = deriveDaoProposerState(
      proposerInput({
        now: 1_000,
        lastProposedAt: 900,
        cooldownSeconds: 100,
      })
    );

    expect(state.nextEligibleAt).toBe(1_000);
    expect(state.canPropose).toBe(true);
  });
});
