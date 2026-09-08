"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AddressLink } from "@/components/ui/ExplorerLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { UtcTime } from "@/components/ui/UtcTime";
import type {
  DaoDisplayGroup,
  DaoProposal,
} from "@/lib/clients/dao";
import { parseDaoProposalContent } from "@/lib/clients/dao";
import {
  createDaoProposalHref,
  DAO_BOARD_GROUPS,
  parseDaoBoardGroup,
  type DaoBoardGroupCounts,
} from "../route-state";
import { daoCopy } from "../messages";
import styles from "./ProposalBoard.module.css";
import {
  ProposalHeadingFacts,
  ProposalTiming,
  ProposalVoteSummary,
} from "./ProposalReadPrimitives";

export function ProposalBoard({
  hostname,
  now,
  onSelectGroup,
  proposals,
  selectedGroup,
}: {
  hostname?: string;
  now: number;
  onSelectGroup?: (group: DaoDisplayGroup) => void;
  proposals: DaoProposal[];
  selectedGroup?: DaoDisplayGroup;
}) {
  const counts = useMemo<DaoBoardGroupCounts>(
    () =>
      Object.fromEntries(
        DAO_BOARD_GROUPS.map((group) => [
          group,
          proposals.filter((proposal) => proposal.displayGroup === group).length,
        ])
      ) as DaoBoardGroupCounts,
    [proposals]
  );
  const fallbackGroup = parseDaoBoardGroup("/dao", counts);
  const [localGroup, setLocalGroup] =
    useState<DaoDisplayGroup>(fallbackGroup);
  const filter = selectedGroup ?? localGroup;
  const selectGroup = (group: DaoDisplayGroup) => {
    if (selectedGroup === undefined) setLocalGroup(group);
    onSelectGroup?.(group);
  };
  const filteredProposals = useMemo(
    () =>
      proposals
        .filter((proposal) => proposal.displayGroup === filter)
        .toSorted((left, right) =>
          left.ref.proposalId > right.ref.proposalId ? -1 : 1
        ),
    [filter, proposals]
  );
  const earliestUpcomingVote = useMemo(() => {
    const upcomingVoteStarts = proposals
      .filter((proposal) => proposal.displayGroup === "upcoming")
      .map((proposal) => proposal.voteStartsAt);
    return upcomingVoteStarts.length > 0
      ? Math.min(...upcomingVoteStarts)
      : null;
  }, [proposals]);

  return (
    <section aria-label={daoCopy.board.title} className="space-y-5">
      <div className="max-w-full overflow-x-auto pb-1">
        <Tabs
          aria-label={daoCopy.board.filterLabel}
          activeTab={filter}
          onChange={(nextFilter) => {
            if (DAO_BOARD_GROUPS.some((group) => group === nextFilter)) {
              selectGroup(nextFilter as DaoDisplayGroup);
            }
          }}
          getPanelId={(id) => `dao-proposals-${id}`}
          getTabId={(id) => `dao-proposals-${id}-tab`}
          className={styles.filterTabs}
          tabs={DAO_BOARD_GROUPS.map((group) => ({
            id: group,
            label: daoCopy.board.filters[group],
            badge: (
              <span className="font-number text-[11px] tabular-nums">
                {counts[group]}
              </span>
            ),
          }))}
        />
      </div>

      <div
        id={`dao-proposals-${filter}`}
        role="tabpanel"
        aria-labelledby={`dao-proposals-${filter}-tab`}
        tabIndex={0}
        className="min-w-0 rounded-box focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app"
      >
        <p className="sr-only" aria-live="polite">
          {daoCopy.board.filteredCount(
            filteredProposals.length,
            daoCopy.board.filters[filter]
          )}
        </p>
        {filteredProposals.length > 0 ? (
          <Card className="min-w-0 divide-y divide-border overflow-hidden p-0">
            {filteredProposals.map((proposal) => (
              <ProposalBoardRow
                key={`${proposal.ref.votingAddress}:${proposal.ref.proposalId.toString()}`}
                now={now}
                proposal={proposal}
                origin={filter}
                hostname={hostname}
              />
            ))}
          </Card>
        ) : (
          <FilteredEmptyState
            counts={counts}
            earliestUpcomingVote={earliestUpcomingVote}
            filter={filter}
            onSelect={selectGroup}
          />
        )}
      </div>
    </section>
  );
}

function ProposalBoardRow({
  hostname,
  now,
  origin,
  proposal,
}: {
  hostname?: string;
  now: number;
  origin: DaoDisplayGroup;
  proposal: DaoProposal;
}) {
  const proposalId = proposal.ref.proposalId.toString();
  const parsed = proposal.content.value
    ? parseDaoProposalContent(proposal.content.value)
    : null;
  const title = parsed?.title ?? daoCopy.detail.eyebrow(proposalId);

  return (
    <article
      aria-labelledby={`dao-proposal-${proposalId}-title`}
      className="relative min-w-0 cursor-pointer p-4 transition-[background-color] duration-150 ease-out hover:bg-surface-secondary/40 motion-reduce:transition-none md:p-5"
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,21rem)] lg:items-center">
        <div className="min-w-0 space-y-3">
          <ProposalHeadingFacts proposal={proposal} showExecutableActions />

          <div className="min-w-0 space-y-1.5">
            <p className="break-words font-number text-xs font-bold tabular-nums text-text-secondary [overflow-wrap:anywhere]">
              {daoCopy.detail.eyebrow(proposalId)}
            </p>
            <h3
              id={`dao-proposal-${proposalId}-title`}
              className="text-balance text-lg font-bold md:text-xl"
            >
              <Link
                href={createDaoProposalHref(proposalId, origin, hostname, proposal.ref)}
                aria-label={daoCopy.board.proposalLink(proposalId, title)}
                className="inline-flex min-h-10 max-w-full items-center rounded py-1 text-left transition-[color] duration-150 ease-out hover:text-yearn-blue focus:outline-none focus-visible:after:absolute focus-visible:after:inset-0 focus-visible:after:rounded-box focus-visible:after:ring-2 focus-visible:after:ring-text-primary focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-app after:absolute after:inset-0 after:rounded-box after:content-[''] motion-reduce:transition-none dark:hover:text-blue-300"
              >
                <span className="break-words [overflow-wrap:anywhere]">{title}</span>
              </Link>
            </h3>
          </div>

          <div className="flex min-w-0 flex-col gap-2 text-xs text-text-secondary sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="shrink-0">{daoCopy.board.proposer}</span>
              <AddressLink
                address={proposal.proposer}
                variant="compact"
                copyLabel={daoCopy.detail.copyValue(daoCopy.board.proposer)}
                className="relative z-10 min-w-0"
              />
            </span>
            <DiscussionState proposal={proposal} />
          </div>

          <ProposalWarnings proposal={proposal} />
        </div>

        <div className="min-w-0 space-y-3 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <ProposalTiming now={now} proposal={proposal} />
          <ProposalVoteSummary compact proposal={proposal} />
          {proposal.type === "signal" &&
          proposal.displayStatus === "approved" ? (
            <p className="text-pretty text-xs font-bold text-text-secondary">
              {daoCopy.board.noExecutableActions}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DiscussionState({ proposal }: { proposal: DaoProposal }) {
  const label =
    proposal.discussion.state === "verified"
      ? daoCopy.board.discussionVerified
      : proposal.discussion.state === "unverified"
        ? daoCopy.board.discussionUnverified
        : daoCopy.board.discussionUnavailable;
  return <span className="text-pretty font-bold">{label}</span>;
}

function ProposalWarnings({ proposal }: { proposal: DaoProposal }) {
  if (proposal.content.state === "available") return null;
  return (
    <p
      role="status"
      className="max-w-2xl text-pretty text-xs font-bold text-error-700 dark:text-red-300"
    >
      {proposal.content.state === "unavailable"
        ? daoCopy.board.contentUnavailable
        : daoCopy.board.contentInvalid}
    </p>
  );
}

function FilteredEmptyState({
  counts,
  earliestUpcomingVote,
  filter,
  onSelect,
}: {
  counts: Record<DaoDisplayGroup, number>;
  earliestUpcomingVote: number | null;
  filter: DaoDisplayGroup;
  onSelect: (filter: DaoDisplayGroup) => void;
}) {
  const empty = daoCopy.board.emptyByFilter[filter];
  return (
    <Card variant="flat" className="space-y-4">
      <h3 className="text-balance text-lg font-bold">{empty.title}</h3>
      <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
        {empty.body}
      </p>
      {filter === "active" ? (
        <>
          {earliestUpcomingVote !== null ? (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-pretty text-sm text-text-secondary">
              <span className="font-bold text-text-primary">
                {daoCopy.board.nextScheduledVote}
              </span>
              <UtcTime
                timestamp={earliestUpcomingVote}
                className="font-number tabular-nums"
              />
            </p>
          ) : null}
          <div
            role="group"
            className="flex flex-wrap gap-2"
            aria-label={daoCopy.board.otherFilterActions}
          >
            {(["upcoming", "closed"] as const).map((group) => (
              <Button
                key={group}
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11 motion-reduce:transition-none motion-reduce:active:scale-100"
                aria-label={daoCopy.board.viewFilter(group, counts[group])}
                onClick={() => {
                  onSelect(group);
                }}
              >
                {daoCopy.board.filters[group]}{" "}
                <span className="font-number tabular-nums">
                  ({counts[group]})
                </span>
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
          {daoCopy.board.viewOtherFilters}
        </p>
      )}
    </Card>
  );
}
