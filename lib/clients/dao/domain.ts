import { createDaoExecuteCall, matchesDaoExecuteCall } from "./execute-call";
import { keccak256 } from "viem";
import { checkDaoExecutorScript } from "./script";
import type {
  DaoCapabilities,
  DaoCapabilityInput,
  DaoDisplayGroup,
  DaoDisplayStatus,
  DaoLifecycleFacts,
  DaoProposal,
  DaoProposalExecutionReadiness,
  DaoProposalEvent,
  DaoProposalLifecycleInput,
  DaoProposalRef,
  DaoProposalTiming,
  DaoProposalTimingInput,
  DaoProposalType,
  DaoProtocolStatus,
  DaoProposerEligibilityInput,
  DaoProposerState,
  DaoVotingWeight,
  DaoVotingWeightInput,
} from "./types";
import { validateDaoVerifiedSource } from "./content";

export const DAO_BPS = 10_000;
export const DAO_PROPOSAL_LIMIT = 64 as const;
export const DAO_BOOST_EPOCH_COUNT = 6;
export const DAO_MODERATION_REASON_MAX_BYTES = 256;
export const DAO_EMPTY_SCRIPT_HASH =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" as const;

export const DAO_BLOCKED_REASONS = {
  walletDisconnected: "Connect a wallet to continue.",
  wrongNetwork: "Switch to the proposal network to continue.",
  voteAlreadySubmitted: "This account has already voted on this proposal.",
  voteNotOpen: "Voting has not opened yet.",
  voteClosed: "Voting is closed.",
  voteLifecycle: "This proposal no longer accepts votes.",
  zeroVotingWeight: "Effective voting weight is zero.",
  notProposer: "Only the proposal author can retract it.",
  retractLifecycle: "This proposal can no longer be retracted.",
  proposalHasVotes: "A proposal with votes cannot be retracted or flagged.",
  notOperator: "Only the configured operator can flag this proposal.",
  flagLifecycle: "This proposal can no longer be flagged.",
  notGuardian: "Only the configured guardian can veto this proposal.",
  vetoLifecycle: "This proposal can no longer be vetoed.",
  signalExecution: "Signal proposals have no executable actions.",
  executeLifecycle: "This proposal is not approved for execution.",
  executionDelay: "The execution delay is still active.",
  executionExpired: "The execution window has closed.",
  guardedExecution: "Only the configured operator can execute this proposal.",
  scriptUnavailable: "The exact event script is unavailable.",
  scriptHashMismatch: "The event script does not match the stored script hash.",
  executionSimulationRequired: "A fresh execution simulation is required.",
  executionSimulationPending: "The fresh execution simulation is still running.",
  executionSimulationFailed: "The fresh execution simulation failed.",
  executionSimulationMismatch:
    "The fresh execution simulation does not match this account, proposal or transaction.",
  awaitingIndex:
    "A confirmed proposal action is waiting for feed indexing.",
  proposerBlacklisted: "This account is blocked from creating proposals.",
  proposerWeight: "Proposal weight is below the current minimum.",
  proposerCooldown: "The proposal cooldown is still active.",
  proposerCapacity: "Proposal capacity is full.",
} as const;

const DAO_EXECUTION_READINESS_REASONS = {
  exactScriptUnavailable: "Exact proposed event script bytes are unavailable.",
  storedScriptHashMismatch:
    "Stored script hash does not match the proposed event script.",
} as const;

export type DaoModerationReasonCheck = {
  bytes: number;
  error: string | null;
  value: string;
};

export function validateDaoModerationReason(
  reason: string
): DaoModerationReasonCheck {
  const value = reason.trim();
  const bytes = new TextEncoder().encode(value).length;
  const error =
    value.length === 0
      ? "Enter a reason."
      : bytes > DAO_MODERATION_REASON_MAX_BYTES
        ? `Reason must be at most ${DAO_MODERATION_REASON_MAX_BYTES} UTF-8 bytes.`
        : null;
  return { bytes, error, value };
}

export function serializeDaoProposalRef(ref: DaoProposalRef): string {
  return `${ref.chainId}:${ref.votingAddress.toLowerCase()}:${ref.proposalId.toString()}`;
}

export function daoProposalPasses(
  totalWeight: bigint,
  yeaWeight: bigint,
  thresholdBps: number
): boolean {
  assertBasisPoints(thresholdBps, "thresholdBps");
  if (totalWeight < 0n || yeaWeight < 0n || yeaWeight > totalWeight) {
    throw new Error("Vote weights must be non-negative and yea cannot exceed total.");
  }

  return (
    totalWeight > 0n &&
    yeaWeight * BigInt(DAO_BPS) >= totalWeight * BigInt(thresholdBps)
  );
}

/**
 * Mirrors the pinned Voting.status priority and epoch boundaries. The caller
 * supplies the end of the epoch after voting because signal proposals do not
 * expose an execution window in the view model.
 */
export function deriveDaoProtocolStatus(
  input: DaoProposalLifecycleInput
): DaoProtocolStatus {
  assertLifecycleInput(input);

  if (!input.exists) return "invalid";
  if (input.executed) return "executed";
  if (input.flagged) return "flagged";
  if (input.vetoed) return "vetoed";
  if (input.retracted) return "retracted";
  if (input.now < input.voteStartsAt) return "proposed";
  if (input.now < input.voteEndsAt) return "voting";
  if (!daoProposalPasses(input.totalWeight, input.yeaWeight, input.thresholdBps)) {
    return "failed";
  }
  if (input.now < input.postVoteEpochEndsAt) return "passed";
  return input.type === "signal" ? "executed" : "expired";
}

export function deriveDaoDisplayStatus(
  protocolStatus: DaoProtocolStatus,
  proposalType: DaoProposalType
): DaoDisplayStatus {
  if (
    proposalType === "signal" &&
    (protocolStatus === "passed" || protocolStatus === "executed")
  ) {
    return "approved";
  }

  const statusMap: Record<DaoProtocolStatus, DaoDisplayStatus> = {
    proposed: "discussion",
    retracted: "retracted",
    voting: "voting",
    passed: "approved",
    failed: "rejected",
    executed: "executed",
    expired: "expired",
    invalid: "not_found",
    flagged: "flagged",
    vetoed: "vetoed",
  };
  return statusMap[protocolStatus];
}

export function deriveDaoDisplayGroup(
  displayStatus: DaoDisplayStatus,
  proposalType: DaoProposalType
): DaoDisplayGroup {
  if (displayStatus === "discussion") return "upcoming";
  if (displayStatus === "voting") return "active";
  if (displayStatus === "approved" && proposalType === "executable") {
    return "active";
  }
  return "closed";
}

export function deriveDaoProposalExecutionReadiness(
  proposal: Pick<DaoProposal, "type" | "script">
): DaoProposalExecutionReadiness {
  if (proposal.type === "signal") {
    return { state: "not_applicable", blocker: null, reason: null };
  }
  if (proposal.script.bytes === null) {
    return {
      state: "integrity_blocked",
      blocker: "exact_script_unavailable",
      reason: DAO_EXECUTION_READINESS_REASONS.exactScriptUnavailable,
    };
  }
  if (
    keccak256(proposal.script.bytes).toLowerCase() !==
    proposal.script.hash.toLowerCase()
  ) {
    return {
      state: "integrity_blocked",
      blocker: "stored_script_hash_mismatch",
      reason: DAO_EXECUTION_READINESS_REASONS.storedScriptHashMismatch,
    };
  }
  if (proposal.script.framing !== "unsupported" && checkDaoExecutorScript(proposal.script.bytes).state === "invalid") {
    return { state: "integrity_blocked", blocker: "malformed_script", reason: "The proposed script has invalid Executor framing." };
  }
  return { state: "integrity_ready", blocker: null, reason: null };
}

export function deriveDaoLifecycleFacts(
  proposal: DaoProposal,
  now: number
): DaoLifecycleFacts {
  assertFiniteInteger(now, "now");
  const isFlagged = proposal.protocolStatus === "flagged";
  const isVetoed = proposal.protocolStatus === "vetoed";
  const votingWindowOpen = now >= proposal.voteStartsAt && now < proposal.voteEndsAt;

  const moderation: DaoLifecycleFacts["moderation"] =
    isFlagged || isVetoed
      ? {
          kind: isFlagged ? "flagged" : "vetoed",
          reason: isFlagged
            ? proposal.moderation.flagReason
            : proposal.moderation.vetoReason,
          votingAvailable: isVetoed && !proposal.retracted && votingWindowOpen,
          executionBlocked: true,
        }
      : {
          kind: null,
          reason: null,
          votingAvailable:
            proposal.protocolStatus === "voting" && votingWindowOpen,
          executionBlocked: false,
        };

  let voteResult: DaoLifecycleFacts["voteResult"] = null;
  if (proposal.protocolStatus === "failed") voteResult = "rejected";
  if (
    proposal.protocolStatus === "passed" ||
    proposal.protocolStatus === "executed" ||
    proposal.protocolStatus === "expired"
  ) {
    voteResult = "approved";
  }

  let execution: DaoLifecycleFacts["execution"];
  if (moderation.kind !== null) {
    execution = { state: "blocked", guard: proposal.rules.executionGuard };
  } else if (proposal.type === "signal") {
    execution = { state: "no_actions", guard: null };
  } else if (proposal.protocolStatus === "executed") {
    execution = { state: "executed", guard: proposal.rules.executionGuard };
  } else if (proposal.protocolStatus === "expired") {
    execution = { state: "expired", guard: proposal.rules.executionGuard };
  } else if (
    proposal.protocolStatus === "passed" &&
    proposal.executionStartsAt !== null &&
    proposal.executionEndsAt !== null
  ) {
    execution = {
      state:
        now < proposal.executionStartsAt
          ? "scheduled"
          : now < proposal.executionEndsAt
            ? "executable"
            : "expired",
      guard: proposal.rules.executionGuard,
    };
  } else {
    execution = { state: "blocked", guard: proposal.rules.executionGuard };
  }

  return {
    status: proposal.protocolStatus,
    voteResult,
    moderation,
    execution,
  };
}

export function deriveDaoProposalTiming(
  input: DaoProposalTimingInput
): DaoProposalTiming {
  assertFiniteInteger(input.genesis, "genesis");
  assertFiniteInteger(input.createdAt, "createdAt");
  assertPositiveInteger(input.epochLengthSeconds, "epochLengthSeconds");
  assertFiniteInteger(input.voteStartOffsetSeconds, "voteStartOffsetSeconds");
  assertFiniteInteger(input.executionDelaySeconds, "executionDelaySeconds");

  if (input.createdAt < input.genesis) {
    throw new Error("createdAt cannot be before genesis.");
  }
  if (
    input.voteStartOffsetSeconds < 0 ||
    input.voteStartOffsetSeconds >= input.epochLengthSeconds
  ) {
    throw new Error("voteStartOffsetSeconds must be inside the epoch.");
  }
  if (
    input.executionDelaySeconds < 0 ||
    input.executionDelaySeconds >= input.epochLengthSeconds
  ) {
    throw new Error("executionDelaySeconds must be inside the epoch.");
  }

  const createdEpoch = Math.floor(
    (input.createdAt - input.genesis) / input.epochLengthSeconds
  );
  const votingEpochNumber = createdEpoch + 1;
  const voteEpochStartsAt =
    input.genesis + votingEpochNumber * input.epochLengthSeconds;
  const voteEndsAt = voteEpochStartsAt + input.epochLengthSeconds;

  return {
    votingEpoch: BigInt(votingEpochNumber),
    voteStartsAt: voteEpochStartsAt + input.voteStartOffsetSeconds,
    voteEndsAt,
    executionStartsAt: voteEndsAt + input.executionDelaySeconds,
    executionEndsAt: voteEndsAt + input.epochLengthSeconds,
  };
}

/** Mirrors Voter._vote's strict decay-start comparison and integer flooring. */
export function deriveDaoVotingWeight(
  input: DaoVotingWeightInput
): DaoVotingWeight {
  if (input.votingWeight < 0n) {
    throw new Error("votingWeight cannot be negative.");
  }
  assertFiniteInteger(input.now, "now");
  assertFiniteInteger(input.voteEndsAt, "voteEndsAt");
  assertFiniteInteger(input.decayLengthSeconds, "decayLengthSeconds");
  if (input.decayLengthSeconds < 0) {
    throw new Error("decayLengthSeconds cannot be negative.");
  }

  const decayStartsAt = input.voteEndsAt - input.decayLengthSeconds;
  let decayBps = DAO_BPS;

  if (input.now >= input.voteEndsAt) {
    decayBps = 0;
  } else if (
    input.decayLengthSeconds > 0 &&
    input.now > decayStartsAt
  ) {
    decayBps = Math.floor(
      (DAO_BPS * (input.voteEndsAt - input.now)) /
        input.decayLengthSeconds
    );
  }

  return {
    votingWeight: input.votingWeight,
    effectiveVotingWeight:
      (input.votingWeight * BigInt(decayBps)) / BigInt(DAO_BPS),
    decayBps,
  };
}

export function deriveDaoProposerState(
  input: DaoProposerEligibilityInput
): DaoProposerState {
  assertFiniteInteger(input.now, "now");
  assertFiniteInteger(input.cooldownSeconds, "cooldownSeconds");
  if (input.cooldownSeconds < 0) {
    throw new Error("cooldownSeconds cannot be negative.");
  }
  if (input.currentWeight < 0n || input.minimumWeight < 0n) {
    throw new Error("Proposal weights cannot be negative.");
  }
  if (input.expectedVotingEpoch < 0n) {
    throw new Error("expectedVotingEpoch cannot be negative.");
  }
  if (input.affectedBoostEpochs.length !== DAO_BOOST_EPOCH_COUNT) {
    throw new Error(
      `Exactly ${DAO_BOOST_EPOCH_COUNT} affected boost epochs are required.`
    );
  }
  for (const [index, affected] of input.affectedBoostEpochs.entries()) {
    const expectedEpoch = input.expectedVotingEpoch + BigInt(index);
    if (index === 0 && affected.epoch !== input.expectedVotingEpoch) {
      throw new Error(
        "The first affected boost epoch must match the expected voting epoch."
      );
    }
    if (affected.epoch !== expectedEpoch) {
      throw new Error(
        "Affected boost epochs must be consecutive from the expected voting epoch."
      );
    }
    if (
      !Number.isInteger(affected.currentProposalCount) ||
      affected.currentProposalCount < 0 ||
      affected.proposalLimit !== DAO_PROPOSAL_LIMIT
    ) {
      throw new Error("Affected boost epoch counts must use the shared limit of 64.");
    }
  }

  const nextEligibleAt =
    input.lastProposedAt === null
      ? 0
      : input.lastProposedAt + input.cooldownSeconds;
  const capacityFull = input.affectedBoostEpochs.some(
    (affected) => affected.currentProposalCount >= affected.proposalLimit
  );

  let proposeBlockedReason: string | null = null;
  if (!input.connected) {
    proposeBlockedReason = DAO_BLOCKED_REASONS.walletDisconnected;
  } else if (!input.correctChain) {
    proposeBlockedReason = DAO_BLOCKED_REASONS.wrongNetwork;
  } else if (input.blacklisted) {
    proposeBlockedReason = DAO_BLOCKED_REASONS.proposerBlacklisted;
  } else if (input.currentWeight < input.minimumWeight) {
    proposeBlockedReason = DAO_BLOCKED_REASONS.proposerWeight;
  } else if (input.now < nextEligibleAt) {
    proposeBlockedReason = DAO_BLOCKED_REASONS.proposerCooldown;
  } else if (capacityFull) {
    proposeBlockedReason = DAO_BLOCKED_REASONS.proposerCapacity;
  }

  return {
    address: input.address,
    connected: input.connected,
    correctChain: input.correctChain,
    canPropose: proposeBlockedReason === null,
    proposeBlockedReason,
    currentWeight: input.currentWeight,
    minimumWeight: input.minimumWeight,
    blacklisted: input.blacklisted,
    lastProposedAt: input.lastProposedAt,
    nextEligibleAt,
    expectedVotingEpoch: input.expectedVotingEpoch,
    affectedBoostEpochs: input.affectedBoostEpochs.map((affected) => ({
      ...affected,
    })),
  };
}

export function deriveDaoCapabilities(
  input: DaoCapabilityInput
): DaoCapabilities {
  const vote = deriveVoteCapability(input);
  const retract = deriveRetractCapability(input);
  const flag = deriveFlagCapability(input);
  const veto = deriveVetoCapability(input);
  const execute = deriveExecuteCapability(input);

  return {
    canVote: vote.reason === null,
    votePurpose: vote.reason === null ? vote.purpose : null,
    voteBlockedReason: vote.reason,
    canRetract: retract === null,
    retractBlockedReason: retract,
    canFlag: flag === null,
    flagBlockedReason: flag,
    canVeto: veto === null,
    vetoBlockedReason: veto,
    canExecute: execute === null,
    executeBlockedReason: execute,
  };
}

export function assertDaoProposalInvariants(proposal: DaoProposal): void {
  if (!Number.isSafeInteger(proposal.ref.chainId) || proposal.ref.chainId <= 0) {
    throw new Error("Proposal chainId must be a positive safe integer.");
  }
  if (proposal.ref.proposalId < 0n || proposal.votingEpoch < 0n) {
    throw new Error("Proposal identifiers and epochs cannot be negative.");
  }
  assertBasisPoints(proposal.thresholdBps, "thresholdBps");
  if (
    proposal.totalWeight < 0n ||
    proposal.yeaWeight < 0n ||
    proposal.nayWeight < 0n ||
    proposal.totalWeight !== proposal.yeaWeight + proposal.nayWeight
  ) {
    throw new Error("Proposal vote totals are inconsistent.");
  }
  if (
    proposal.createdAt > proposal.voteStartsAt ||
    proposal.voteStartsAt > proposal.voteEndsAt
  ) {
    throw new Error("Proposal voting timestamps are inconsistent.");
  }
  if (
    proposal.executionStartsAt !== null &&
    proposal.executionEndsAt !== null &&
    (proposal.voteEndsAt > proposal.executionStartsAt ||
      proposal.executionStartsAt >= proposal.executionEndsAt)
  ) {
    throw new Error("Proposal execution timestamps are inconsistent.");
  }
  if (
    (proposal.executionStartsAt === null) !==
    (proposal.executionEndsAt === null)
  ) {
    throw new Error("Proposal execution timestamps must both be present or absent.");
  }
  if (
    (proposal.type === "signal" && proposal.executionStartsAt !== null) ||
    (proposal.type === "executable" && proposal.executionStartsAt === null)
  ) {
    throw new Error("Proposal execution timestamps must match its script type.");
  }
  if (proposal.protocolStatus === "invalid" || proposal.displayStatus === "not_found") {
    throw new Error("Not-found proposals cannot appear in feed history.");
  }

  const expectedDisplay = deriveDaoDisplayStatus(
    proposal.protocolStatus,
    proposal.type
  );
  if (proposal.displayStatus !== expectedDisplay) {
    throw new Error("Proposal display status does not match protocol status and type.");
  }
  const expectedGroup = deriveDaoDisplayGroup(
    proposal.displayStatus,
    proposal.type
  );
  if (proposal.displayGroup !== expectedGroup) {
    throw new Error("Proposal display group is inconsistent.");
  }

  assertDaoProposalRulesInvariant(proposal);

  if (proposal.type === "signal") {
    if (
      proposal.script.hash.toLowerCase() !== DAO_EMPTY_SCRIPT_HASH ||
      (proposal.script.bytes !== null && proposal.script.bytes !== "0x")
    ) {
      throw new Error("Signal proposals must use the empty Executor script.");
    }
  } else if (
    proposal.script.bytes === "0x" ||
    proposal.script.hash.toLowerCase() === DAO_EMPTY_SCRIPT_HASH
  ) {
    throw new Error("Executable proposals cannot use the empty Executor script.");
  }

  const actualHashVerified =
    proposal.script.bytes === null
      ? null
      : keccak256(proposal.script.bytes).toLowerCase() ===
        proposal.script.hash.toLowerCase();
  if (proposal.script.hashVerified !== actualHashVerified) {
    throw new Error(
      "Proposal script hashVerified must equal the actual hash comparison and may be null only when exact bytes are absent."
    );
  }

  for (const event of proposal.events) assertDaoProposalEventInvariant(event);
}

function assertDaoProposalEventInvariant(event: DaoProposalEvent): void {
  if (
    event.log.timestamp !== null &&
    (!Number.isSafeInteger(event.log.timestamp) || event.log.timestamp < 0)
  ) {
    throw new Error("Event timestamps must be canonical unsigned Unix seconds.");
  }
  if (event.type !== "vote") {
    if (
      event.yeaBps !== null ||
      event.direction !== null ||
      event.weight !== null
    ) {
      throw new Error("Only vote events can carry vote facts.");
    }
    return;
  }

  if (
    event.yeaBps === null ||
    event.weight === null
  ) {
    throw new Error("Vote events require yeaBps and weight.");
  }
  assertBasisPoints(event.yeaBps, "yeaBps");
  if (event.weight < 0n) {
    throw new Error("Vote event weight cannot be negative.");
  }

  if (event.direction !== null &&
      ((event.direction === "yea" && event.yeaBps !== DAO_BPS) ||
       (event.direction === "nay" && event.yeaBps !== 0))) {
    throw new Error("Vote direction must match event basis points.");
  }
}

function assertDaoProposalRulesInvariant(proposal: DaoProposal): void {
  const rules = proposal.rules;
  assertBasisPoints(rules.approvalThresholdBps, "approvalThresholdBps");
  if (rules.approvalThresholdBps !== proposal.thresholdBps) {
    throw new Error("Proposal rules must carry the snapshotted threshold.");
  }
  if (rules.proposalType !== proposal.type) {
    throw new Error("Proposal rules must carry the proposal type.");
  }
  if (
    rules.votingAddress.toLowerCase() !== proposal.ref.votingAddress.toLowerCase()
  ) {
    throw new Error("Proposal rules must bind to the exact Voting contract.");
  }
  if (rules.votingPeriodSeconds !== proposal.voteEndsAt - proposal.voteStartsAt) {
    throw new Error("Proposal rules must carry the proposal voting period.");
  }
  if (!Number.isSafeInteger(rules.votingPeriodSeconds) || rules.votingPeriodSeconds < 0) {
    throw new Error("Proposal voting period must be positive Unix seconds.");
  }
  const expectedDelay =
    proposal.executionStartsAt === null
      ? null
      : proposal.executionStartsAt - proposal.voteEndsAt;
  if (rules.executionDelaySeconds !== expectedDelay) {
    throw new Error("Proposal rules must carry the proposal execution delay.");
  }
  if (
    (proposal.type === "signal" && rules.executionGuard !== null) ||
    (proposal.type === "executable" && rules.executionGuard === null)
  ) {
    throw new Error("Proposal execution rules must match the proposal type.");
  }
  if (rules.observationBlockNumber < 0n) {
    throw new Error("Proposal rule observation block cannot be negative.");
  }
  if (!rules.votingSourcePath.trim()) {
    throw new Error("Proposal rules require the pinned Voting source path.");
  }
  validateDaoVerifiedSource(rules.votingSource);
}

function deriveVoteCapability(input: DaoCapabilityInput): {
  purpose: "decision" | "participation_only";
  reason: string | null;
} {
  if (!input.account.connected) {
    return { purpose: "decision", reason: DAO_BLOCKED_REASONS.walletDisconnected };
  }
  if (!input.account.correctChain) {
    return { purpose: "decision", reason: DAO_BLOCKED_REASONS.wrongNetwork };
  }
  if (input.account.hasVoted) {
    return {
      purpose: "decision",
      reason: DAO_BLOCKED_REASONS.voteAlreadySubmitted,
    };
  }
  if (input.now < input.proposal.voteStartsAt) {
    return { purpose: "decision", reason: DAO_BLOCKED_REASONS.voteNotOpen };
  }
  if (input.now >= input.proposal.voteEndsAt) {
    return { purpose: "decision", reason: DAO_BLOCKED_REASONS.voteClosed };
  }

  const participationOnly =
    input.proposal.protocolStatus === "vetoed" &&
    !input.proposal.retracted;
  if (
    input.proposal.retracted ||
    (input.proposal.protocolStatus !== "voting" && !participationOnly)
  ) {
    return { purpose: "decision", reason: DAO_BLOCKED_REASONS.voteLifecycle };
  }
  if (input.account.effectiveVotingWeight <= 0n) {
    return {
      purpose: participationOnly ? "participation_only" : "decision",
      reason: DAO_BLOCKED_REASONS.zeroVotingWeight,
    };
  }

  return {
    purpose: participationOnly ? "participation_only" : "decision",
    reason: null,
  };
}

function deriveRetractCapability(input: DaoCapabilityInput): string | null {
  const connectionReason = deriveConnectionReason(input);
  if (connectionReason) return connectionReason;
  if (!input.account.isProposer) return DAO_BLOCKED_REASONS.notProposer;
  if (
    input.now >= input.proposal.voteEndsAt ||
    input.proposal.retracted || input.proposal.vetoed
  ) {
    return DAO_BLOCKED_REASONS.retractLifecycle;
  }
  if (input.proposal.totalWeight > 0n) return DAO_BLOCKED_REASONS.proposalHasVotes;
  return null;
}

function deriveFlagCapability(input: DaoCapabilityInput): string | null {
  const connectionReason = deriveConnectionReason(input);
  if (connectionReason) return connectionReason;
  if (!input.account.isOperator) return DAO_BLOCKED_REASONS.notOperator;
  if (
    input.now >= input.proposal.voteEndsAt ||
    input.proposal.retracted
  ) {
    return DAO_BLOCKED_REASONS.flagLifecycle;
  }
  if (input.proposal.totalWeight > 0n) return DAO_BLOCKED_REASONS.proposalHasVotes;
  return null;
}

function deriveVetoCapability(input: DaoCapabilityInput): string | null {
  const connectionReason = deriveConnectionReason(input);
  if (connectionReason) return connectionReason;
  if (!input.account.isGuardian) return DAO_BLOCKED_REASONS.notGuardian;
  if (
    input.now >= input.vetoEndsAt ||
    ["executed", "expired", "retracted", "flagged", "vetoed", "invalid"].includes(
      input.proposal.protocolStatus
    )
  ) {
    return DAO_BLOCKED_REASONS.vetoLifecycle;
  }
  return null;
}

function deriveExecuteCapability(input: DaoCapabilityInput): string | null {
  const connectionReason = deriveConnectionReason(input);
  if (connectionReason) return connectionReason;
  if (input.proposal.type === "signal") return DAO_BLOCKED_REASONS.signalExecution;
  if (
    input.proposal.executionStartsAt === null ||
    input.proposal.executionEndsAt === null
  ) {
    return DAO_BLOCKED_REASONS.executeLifecycle;
  }
  if (input.now >= input.proposal.executionEndsAt) {
    return DAO_BLOCKED_REASONS.executionExpired;
  }
  if (input.proposal.protocolStatus !== "passed") {
    return DAO_BLOCKED_REASONS.executeLifecycle;
  }
  if (input.now < input.proposal.executionStartsAt) {
    return DAO_BLOCKED_REASONS.executionDelay;
  }
  if (input.executionGuard === "guarded" && !input.account.isOperator) {
    return DAO_BLOCKED_REASONS.guardedExecution;
  }
  const integrity = deriveDaoProposalExecutionReadiness(input.proposal);
  if (integrity.state === "integrity_blocked") return integrity.blocker === "exact_script_unavailable"
    ? DAO_BLOCKED_REASONS.scriptUnavailable : integrity.blocker === "stored_script_hash_mismatch"
      ? DAO_BLOCKED_REASONS.scriptHashMismatch : integrity.reason;

  const preflight = input.account.executionPreflight;
  if (preflight.scriptHash.toLowerCase() !== input.proposal.script.hash.toLowerCase()) {
    return DAO_BLOCKED_REASONS.executionSimulationMismatch;
  }
  if (preflight.state === "idle") {
    return DAO_BLOCKED_REASONS.executionSimulationRequired;
  }
  if (preflight.state === "simulating") {
    return DAO_BLOCKED_REASONS.executionSimulationPending;
  }
  if (preflight.state === "failed") {
    return DAO_BLOCKED_REASONS.executionSimulationFailed;
  }
  const simulatedAt = preflight.simulatedAt === null ? NaN : Date.parse(preflight.simulatedAt) / 1000;
  if (!Number.isFinite(simulatedAt) || simulatedAt < input.now - 300 || simulatedAt > input.now + 60) {
    return DAO_BLOCKED_REASONS.executionSimulationRequired;
  }
  if (!input.proposal.script.bytes || !matchesDaoExecuteCall(preflight.call,
    createDaoExecuteCall(input.proposal.ref, input.account.address, input.proposal.script.bytes))) {
    return DAO_BLOCKED_REASONS.executionSimulationMismatch;
  }
  return null;
}

function deriveConnectionReason(input: DaoCapabilityInput): string | null {
  if (!input.account.connected) return DAO_BLOCKED_REASONS.walletDisconnected;
  if (!input.account.correctChain) return DAO_BLOCKED_REASONS.wrongNetwork;
  return null;
}

function assertLifecycleInput(input: DaoProposalLifecycleInput): void {
  assertFiniteInteger(input.now, "now");
  assertFiniteInteger(input.voteStartsAt, "voteStartsAt");
  assertFiniteInteger(input.voteEndsAt, "voteEndsAt");
  assertFiniteInteger(input.postVoteEpochEndsAt, "postVoteEpochEndsAt");
  assertBasisPoints(input.thresholdBps, "thresholdBps");
  if (
    input.voteStartsAt > input.voteEndsAt ||
    input.voteEndsAt >= input.postVoteEpochEndsAt
  ) {
    throw new Error("Lifecycle timestamps are inconsistent.");
  }
  if (
    input.totalWeight < 0n ||
    input.yeaWeight < 0n ||
    input.yeaWeight > input.totalWeight
  ) {
    throw new Error("Lifecycle vote weights are inconsistent.");
  }
}

function assertBasisPoints(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > DAO_BPS) {
    throw new Error(`${name} must be an integer from 0 to ${DAO_BPS}.`);
  }
}

function assertFiniteInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  assertFiniteInteger(value, name);
  if (value <= 0) throw new Error(`${name} must be positive.`);
}
