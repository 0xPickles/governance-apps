"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AddressLink } from "@/components/ui/ExplorerLink";
import { IconChevron } from "@/components/icons/IconChevron";
import { TimelineStepper, type TimelineStep } from "@/components/ui/TimelineStepper";
import type { YbcProposalRecord } from "@/lib/clients/ybc";
import {
  getYbcProposalThresholdState,
  type YbcVoteChoice,
} from "@/lib/clients/ybc/mock";
import { formatUtcDateTime } from "@/lib/date";
import { formatDecimalAmount, formatPercent } from "@/lib/format";
import type { YbcDisplayIdentity } from "../identity";

type ProposalCardProps = {
  proposal: YbcProposalRecord;
  proposerIdentity: YbcDisplayIdentity;
  targetIdentity: YbcDisplayIdentity;
  onRetract?: () => void;
  onVote?: (choice: YbcVoteChoice) => void;
  onExecute?: () => void;
  transactionPending?: boolean;
  defaultOpen?: boolean;
  focused?: boolean;
};

type TimelineStatus = "complete" | "current" | "upcoming" | "closed";

const proposalTypeLabel = {
  addition: "Add member",
  expulsion: "Remove member",
} as const;

const phaseLabel = {
  discussion: "Discussion",
  voting: "Voting",
  "awaiting-execution": "Awaiting Execution",
  executed: "Executed",
  expired: "Expired",
  failed: "Failed",
  retracted: "Retracted",
} as const;

const badgeVariantByPhase = {
  discussion: "brand",
  voting: "warning",
  "awaiting-execution": "success",
  executed: "success",
  expired: "error",
  failed: "error",
  retracted: "neutral",
} as const;

export function ProposalCard({
  proposal,
  proposerIdentity,
  targetIdentity,
  onRetract,
  onVote,
  onExecute,
  transactionPending = false,
  defaultOpen = false,
  focused = false,
}: ProposalCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const threshold = getYbcProposalThresholdState(proposal);
  const headingId = `${proposal.id}-heading`;
  const timelineRows = getTimelineRows(proposal);
  const isExpanded = focused || isOpen;

  return (
    <Card
      id={`ybc-proposal-${proposal.id}`}
      data-focused={focused || undefined}
      className={`overflow-hidden bg-app/70 p-0 transition-[border-color,box-shadow,background-color] duration-200 ${
        focused
          ? "border-yearn-blue bg-yearn-blue/[0.04] ring-2 ring-yearn-blue/30"
          : "border-border"
      }`}
    >
      <details
        open={isExpanded}
        onToggle={(event) => {
          if (!focused) setIsOpen(event.currentTarget.open);
        }}
        role="article"
        aria-labelledby={headingId}
        className="group"
      >
        <summary
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${proposal.id} proposal details`}
          className="grid cursor-pointer list-none gap-4 p-6 transition-colors hover:bg-surface-secondary/40 focus:outline-none focus-visible:bg-surface-secondary/60 lg:grid-cols-[minmax(0,1fr)_minmax(260px,auto)] [&::-webkit-details-marker]:hidden"
        >
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{proposal.id}</Badge>
              <Badge variant="brand">{proposalTypeLabel[proposal.type]}</Badge>
              <Badge variant={badgeVariantByPhase[proposal.phase]}>
                {phaseLabel[proposal.phase]}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3
                  id={headingId}
                  className="min-w-0 break-words text-xl font-bold text-text-primary [overflow-wrap:anywhere]"
                >
                  {proposal.id} · {proposalTypeLabel[proposal.type]} proposal
                  for {targetIdentity.label}
                </h3>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-text-secondary">
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  Proposed by {proposerIdentity.label} in epoch{" "}
                  <span className="font-number">{proposal.epoch}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-2">
                  Target{" "}
                  <AddressLink
                    address={targetIdentity.address}
                    variant="compact"
                  />
                </span>
                <span className="inline-flex items-center gap-2">
                  Proposer{" "}
                  <AddressLink
                    address={proposerIdentity.address}
                    variant="compact"
                  />
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-1">
            <div className="min-w-0 rounded-box border border-border bg-surface p-3">
              <p className="text-xs font-bold uppercase text-text-tertiary">
                Next action
              </p>
              <p className="mt-1 text-sm font-bold text-text-primary">
                {getNextActionLabel(proposal)}
              </p>
            </div>
            <span className="inline-flex h-10 items-center justify-center gap-2 rounded-box border border-border bg-surface px-3 text-xs font-bold text-text-secondary transition-[background-color,color] group-hover:text-text-primary">
              Details
              <IconChevron
                className="h-4 w-4 transition-transform duration-150 group-open:rotate-180"
                aria-hidden="true"
              />
            </span>
          </div>
        </summary>

        <div className="space-y-6 border-t border-border p-6">
          <div className="rounded-box border border-border bg-surface p-3">
            <p className="text-xs font-bold uppercase text-text-tertiary">
              Status
            </p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {getDisabledReason(proposal)}
            </p>
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
            <div className="space-y-4">
              <div className="rounded-box border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-text-tertiary">
                      Threshold target
                    </p>
                    <p className="mt-1 font-number text-lg font-bold text-text-primary">
                      {formatPercent(threshold.thresholdRatio, 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase text-text-tertiary">
                      Current support
                    </p>
                    <p className="mt-1 font-number text-lg font-bold text-text-primary">
                      {formatPercent(threshold.currentRatio, 1)}
                    </p>
                  </div>
                </div>
                <ThresholdVoteBar
                  currentBps={threshold.currentBps}
                  thresholdBps={threshold.thresholdBps}
                  thresholdMet={threshold.thresholdMet}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary">
                  <span className="font-number">
                    {formatDecimalAmount(proposal.votes.yea, 4)} yea weight
                  </span>
                  <span className="font-number">
                    {formatDecimalAmount(proposal.votes.total, 4)} total weight
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs text-text-tertiary">
                  <span className="font-number">
                    {formatDecimalAmount(proposal.votes.nay, 4)} nay weight
                  </span>
                  <span>
                    {threshold.thresholdMet ? "Threshold met" : "Below threshold"}
                  </span>
                </div>
              </div>

              <div className="grid gap-3">
                {proposal.actions.canRetract && onRetract ? (
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={onRetract}
                    disabled={transactionPending}
                    isLoading={transactionPending}
                  >
                    Retract proposal
                  </Button>
                ) : null}
                {proposal.actions.canVote && onVote ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => onVote("yea")}
                      disabled={transactionPending}
                      isLoading={transactionPending}
                    >
                      Vote yea
                    </Button>
                    <Button
                      className="w-full"
                      size="lg"
                      variant="secondary"
                      onClick={() => onVote("nay")}
                      disabled={transactionPending}
                      isLoading={transactionPending}
                    >
                      Vote nay
                    </Button>
                  </div>
                ) : null}
                {proposal.actions.canExecute && onExecute ? (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={onExecute}
                    disabled={transactionPending}
                    isLoading={transactionPending}
                  >
                    Execute proposal
                  </Button>
                ) : null}
                {!proposal.actions.canRetract &&
                !proposal.actions.canVote &&
                !proposal.actions.canExecute ? (
                  <Button className="w-full" disabled>
                    {getDisabledActionLabel(proposal)}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="rounded-box border border-border bg-surface p-4">
              <p className="text-xs font-bold uppercase text-text-tertiary">
                Proposal timeline (UTC)
              </p>
              <TimelineStepper
                aria-label={`${proposal.id} proposal phase timeline`}
                steps={timelineRows}
                className="mt-4"
              />
            </div>
          </div>
        </div>
      </details>
    </Card>
  );
}

function getDisabledReason(proposal: YbcProposalRecord): string {
  if (proposal.phase === "expired") {
    return "Expired proposals are terminal. Start a new proposal instead.";
  }

  return proposal.actions.disabledReason ?? "No further actions are available.";
}

function getNextActionLabel(proposal: YbcProposalRecord): string {
  if (proposal.actions.canRetract) return "Retract while discussion is open";
  if (proposal.actions.canVote) return "Vote during the active window";
  if (proposal.actions.canExecute) return "Execute before the proposal expires";

  if (proposal.phase === "expired") return "Expired and closed";
  if (proposal.phase === "executed") return "Executed and complete";
  if (proposal.phase === "failed") return "Failed and closed";
  if (proposal.phase === "retracted") return "Retracted and closed";

  return "Waiting for the next phase";
}

function getDisabledActionLabel(proposal: YbcProposalRecord): string {
  if (proposal.phase === "expired") return "Proposal expired";
  if (proposal.phase === "executed") return "Already executed";
  if (proposal.phase === "failed") return "Proposal failed";
  if (proposal.phase === "retracted") return "Proposal retracted";

  return "Action unavailable";
}

function getTimelineRows(
  proposal: YbcProposalRecord
): TimelineStep[] {
  return [
    {
      id: "discussion",
      label: "Discussion opens",
      description: formatTimestamp(proposal.timing.discussionStartsAt),
      status: proposal.phase === "discussion" ? "current" : "complete",
    },
    {
      id: "voting-opens",
      label: "Voting opens",
      description: formatTimestamp(proposal.timing.votingStartsAt),
      status: normalizeTimelineStatus(getVotingOpenStatus(proposal)),
    },
    {
      id: "voting-closes",
      label: "Voting closes",
      description: formatTimestamp(proposal.timing.votingEndsAt),
      status: normalizeTimelineStatus(getVotingCloseStatus(proposal)),
    },
    {
      id: "execution-opens",
      label: "Execution opens",
      description: formatTimestamp(proposal.timing.executionOpensAt),
      status: normalizeTimelineStatus(getExecutionStatus(proposal)),
    },
    {
      id: "expires",
      label: proposal.phase === "expired" ? "Expired at" : "Execution expires",
      description: formatTimestamp(proposal.timing.expiresAt),
      status: normalizeTimelineStatus(getExpiryStatus(proposal)),
    },
    ...(proposal.timing.executedAt
      ? [
          {
            id: "executed",
            label: "Executed at",
            description: formatTimestamp(proposal.timing.executedAt),
            status: "complete" as const,
          },
        ]
      : []),
  ];
}

function normalizeTimelineStatus(status: TimelineStatus): TimelineStep["status"] {
  return status === "closed" ? "blocked" : status;
}

function ThresholdVoteBar({
  currentBps,
  thresholdBps,
  thresholdMet,
}: {
  currentBps: number;
  thresholdBps: number;
  thresholdMet: boolean;
}) {
  const currentPercent = Math.min(Math.max(currentBps / 100, 0), 100);
  const thresholdPercent = Math.min(Math.max(thresholdBps / 100, 0), 100);

  return (
    <div className="mt-4 space-y-2">
      <div
        className="relative h-4 overflow-hidden rounded-full bg-surface-secondary"
        aria-label={`Current support ${currentPercent.toFixed(0)} percent, threshold ${thresholdPercent.toFixed(0)} percent`}
      >
        <div
          className={thresholdMet ? "h-full rounded-full bg-green-600" : "h-full rounded-full bg-amber-500"}
          style={{ width: `${currentPercent}%` }}
        />
        <div
          className="absolute inset-y-[-0.25rem] w-0.5 bg-text-primary"
          style={{ left: `${thresholdPercent}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-text-tertiary">
        <span>0%</span>
        <span>Threshold marker</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function getVotingOpenStatus(proposal: YbcProposalRecord): TimelineStatus {
  if (proposal.phase === "discussion") return "upcoming";
  if (proposal.phase === "voting") return "current";
  return "complete";
}

function getVotingCloseStatus(proposal: YbcProposalRecord): TimelineStatus {
  if (proposal.phase === "discussion") return "upcoming";
  if (proposal.phase === "voting") return "current";
  return "complete";
}

function getExecutionStatus(proposal: YbcProposalRecord): TimelineStatus {
  if (proposal.phase === "discussion" || proposal.phase === "voting") {
    return "upcoming";
  }
  if (proposal.phase === "awaiting-execution") {
    return "current";
  }
  if (proposal.phase === "failed" || proposal.phase === "retracted") {
    return "closed";
  }
  return "complete";
}

function getExpiryStatus(proposal: YbcProposalRecord): TimelineStatus {
  if (proposal.phase === "expired") return "closed";
  if (
    proposal.phase === "executed" ||
    proposal.phase === "failed" ||
    proposal.phase === "retracted"
  ) {
    return "closed";
  }
  return "upcoming";
}

function formatTimestamp(timestamp: number): string {
  return formatUtcDateTime(timestamp);
}
