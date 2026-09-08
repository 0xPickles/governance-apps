import { formatTokenAmount } from "@/lib/format";
import { serializeDaoProposalRef } from "./domain";
import type {
  DaoSnapshot,
  DaoProposal,
  DaoProposalEvent,
  DaoProposalRef,
} from "./types";

const PERCENT_TENTHS = 1_000n;

export type DaoVoteDisplay = {
  yeaPercent: string;
  nayPercent: string;
  yeaPercentTenths: number;
  nayPercentTenths: number;
  thresholdPercent: string;
  yeaWeight: string;
  nayWeight: string;
  totalWeight: string;
};

export type DaoProposalTimingDisplay =
  | {
      kind: "voting_opens" | "voting_ends" | "execution_opens" | "execution_expires";
      timestamp: number;
      remainingSeconds: number;
      event: null;
    }
  | {
      kind: "approved_on" | "rejected_on" | "execution_expired_on";
      timestamp: number;
      remainingSeconds: null;
      event: null;
    }
  | {
      kind: "executed_recorded" | "retracted_recorded" | "flagged_recorded" | "vetoed_recorded";
      timestamp: number | null;
      remainingSeconds: null;
      event: DaoProposalEvent | null;
    };

export type DaoProposalReadEnvelope = {
  feed: DaoSnapshot;
  proposal: DaoProposal;
};

/**
 * Couples a proposal to the exact feed snapshot that surfaced it. Numeric IDs
 * are insufficient because proposal identity also includes chain and Voting.
 */
export function resolveDaoProposalReadEnvelope(
  feed: DaoSnapshot,
  ref: DaoProposalRef
): DaoProposalReadEnvelope | null {
  const serializedRef = serializeDaoProposalRef(ref);
  const proposal =
    feed.proposals.find(
      (candidate) => serializeDaoProposalRef(candidate.ref) === serializedRef
    ) ?? null;
  return proposal ? { feed, proposal } : null;
}

/**
 * Produces display-ready vote facts without moving ratio math into route
 * components. Percentages use one decimal place at most and stay exact until
 * the final bounded conversion to a CSS-friendly number.
 */
export function deriveDaoVoteDisplay(proposal: DaoProposal): DaoVoteDisplay {
  const yeaPercentTenths = derivePercentTenths(
    proposal.yeaWeight,
    proposal.totalWeight
  );
  const nayPercentTenths =
    proposal.totalWeight === 0n ? 0 : 1_000 - yeaPercentTenths;

  return {
    yeaPercent: formatPercentTenths(yeaPercentTenths),
    nayPercent: formatPercentTenths(nayPercentTenths),
    yeaPercentTenths,
    nayPercentTenths,
    thresholdPercent: formatDaoBasisPoints(proposal.thresholdBps),
    yeaWeight: formatTokenAmount(proposal.yeaWeight, 18, 2),
    nayWeight: formatTokenAmount(proposal.nayWeight, 18, 2),
    totalWeight: formatTokenAmount(proposal.totalWeight, 18, 2),
  };
}

/**
 * Selects the single timing fact that should scan first for a proposal. The
 * route owns the words; this helper owns the status/timestamp relationship.
 */
export function deriveDaoProposalTimingDisplay(
  proposal: DaoProposal,
  now: number
): DaoProposalTimingDisplay {
  if (proposal.displayStatus === "discussion") {
    return futureTiming("voting_opens", proposal.voteStartsAt, now);
  }
  if (proposal.displayStatus === "voting") {
    return futureTiming("voting_ends", proposal.voteEndsAt, now);
  }
  if (proposal.displayStatus === "approved") {
    if (proposal.type === "signal") {
      return pastTiming("approved_on", proposal.voteEndsAt);
    }
    if (
      proposal.executionStartsAt !== null &&
      now < proposal.executionStartsAt
    ) {
      return futureTiming("execution_opens", proposal.executionStartsAt, now);
    }
    if (proposal.executionEndsAt !== null && now < proposal.executionEndsAt) {
      return futureTiming("execution_expires", proposal.executionEndsAt, now);
    }
    return pastTiming("approved_on", proposal.voteEndsAt);
  }
  if (proposal.displayStatus === "rejected") {
    return pastTiming("rejected_on", proposal.voteEndsAt);
  }
  if (proposal.displayStatus === "expired") {
    return pastTiming(
      "execution_expired_on",
      proposal.executionEndsAt ?? proposal.voteEndsAt
    );
  }
  if (proposal.displayStatus === "executed") {
    return eventTiming("executed_recorded", proposal, "execute");
  }
  if (proposal.displayStatus === "retracted") {
    return eventTiming("retracted_recorded", proposal, "retract");
  }
  if (proposal.displayStatus === "flagged") {
    return eventTiming("flagged_recorded", proposal, "flag");
  }
  return eventTiming("vetoed_recorded", proposal, "veto");
}

function derivePercentTenths(weight: bigint, totalWeight: bigint): number {
  if (totalWeight <= 0n) return 0;
  const rounded = (weight * PERCENT_TENTHS + totalWeight / 2n) / totalWeight;
  return Number(rounded > PERCENT_TENTHS ? PERCENT_TENTHS : rounded);
}

function formatPercentTenths(tenths: number): string {
  const whole = Math.trunc(tenths / 10);
  const decimal = tenths % 10;
  return decimal === 0 ? `${whole}%` : `${whole}.${decimal}%`;
}

export function formatDaoBasisPoints(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const remainder = basisPoints % 100;
  if (remainder === 0) return `${whole}%`;
  return `${whole}.${remainder.toString().padStart(2, "0").replace(/0$/, "")}%`;
}

function futureTiming(
  kind: Extract<
    DaoProposalTimingDisplay["kind"],
    "voting_opens" | "voting_ends" | "execution_opens" | "execution_expires"
  >,
  timestamp: number,
  now: number
): DaoProposalTimingDisplay {
  return {
    kind,
    timestamp,
    remainingSeconds: Math.max(0, timestamp - now),
    event: null,
  };
}

function pastTiming(
  kind: Extract<
    DaoProposalTimingDisplay["kind"],
    "approved_on" | "rejected_on" | "execution_expired_on"
  >,
  timestamp: number
): DaoProposalTimingDisplay {
  return { kind, timestamp, remainingSeconds: null, event: null };
}

function eventTiming(
  kind: Extract<
    DaoProposalTimingDisplay["kind"],
    | "executed_recorded"
    | "retracted_recorded"
    | "flagged_recorded"
    | "vetoed_recorded"
  >,
  proposal: DaoProposal,
  eventType: DaoProposalEvent["type"]
): DaoProposalTimingDisplay {
  const event =
    [...proposal.events].reverse().find((candidate) => candidate.type === eventType) ??
    null;
  return {
    kind,
    timestamp: event?.log.timestamp ?? null,
    remainingSeconds: null,
    event,
  };
}
