"use client";

import { type ReactNode, useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { Card } from "@/components/ui/Card";
import { Button, getButtonClassName } from "@/components/ui/Button";
import { UtcTime } from "@/components/ui/UtcTime";
import { useDaoFeed, useDaoMockRuntime } from "@/lib/hooks/useDao";
import { useHostname } from "@/lib/hooks/useHostname";
import {
  DaoErrorPanel,
  DaoLoadingPanel,
  DaoRouteFrame,
  DaoWalletNotice,
  daoRouteControlClassName,
} from "./components/DaoRouteFrame";
import { daoCopy } from "./messages";
import { DaoSnapshotNotice } from "./components/DaoSnapshotNotice";
import { MockControls } from "./components/MockControls";
import { ProposalBoard } from "./components/ProposalBoard";
import type { DaoProposal } from "@/lib/clients/dao";
import type { DaoDisplayGroup } from "@/lib/clients/dao";
import {
  createDaoBoardGroupHref,
  createDaoProposeHref,
  parseDaoBoardGroup,
  type DaoBoardGroupCounts,
} from "./route-state";

export type DaoBoardState = "loading" | "ready" | "empty" | "error";

const DAO_LOCATION_CHANGE_EVENT = "dao:location-change";
const EMPTY_PROPOSALS: DaoProposal[] = [];

function subscribeToDaoLocation(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(DAO_LOCATION_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(DAO_LOCATION_CHANGE_EVENT, onStoreChange);
  };
}

function getDaoLocationSnapshot() {
  return window.location.href;
}

function getDaoServerLocationSnapshot() {
  return "/dao";
}

export function DaoPageClient({
  initialHostname,
}: {
  initialHostname?: string;
}) {
  const browserHostname = useHostname();
  const hostname = browserHostname ?? initialHostname;
  const { isConnected } = useAccount();
  const runtime = useDaoMockRuntime();
  const hasConnectedAccount =
    process.env.NEXT_PUBLIC_E2E === "true" && runtime
      ? runtime.account.connected
      : isConnected;
  const feedQuery = useDaoFeed();
  const proposalCount = feedQuery.data?.proposals.length ?? 0;
  const proposals = feedQuery.data?.proposals ?? EMPTY_PROPOSALS;
  const groupCounts = useMemo<DaoBoardGroupCounts>(
    () => ({
      upcoming: proposals.filter(
        (proposal) => proposal.displayGroup === "upcoming"
      ).length,
      active: proposals.filter(
        (proposal) => proposal.displayGroup === "active"
      ).length,
      closed: proposals.filter(
        (proposal) => proposal.displayGroup === "closed"
      ).length,
    }),
    [proposals]
  );
  const currentHref = useSyncExternalStore(
    subscribeToDaoLocation,
    getDaoLocationSnapshot,
    getDaoServerLocationSnapshot
  );
  const selectedGroup = parseDaoBoardGroup(currentHref, groupCounts);
  const isStale = feedQuery.isError && feedQuery.data !== undefined;
  const state: DaoBoardState =
    feedQuery.isPending && feedQuery.data === undefined
    ? "loading"
    : feedQuery.isError && feedQuery.data === undefined
      ? "error"
      : proposalCount === 0
        ? "empty"
        : "ready";

  const selectGroup = useCallback(
    (group: DaoDisplayGroup) => {
      if (typeof window === "undefined") return;
      window.history.replaceState(
        window.history.state,
        "",
        createDaoBoardGroupHref(window.location.href, group, hostname)
      );
      window.dispatchEvent(new Event(DAO_LOCATION_CHANGE_EVENT));
    },
    [hostname]
  );

  return (
    <>
      <DaoBoardView
        snapshotNotice={!runtime ? <DaoSnapshotNotice snapshot={feedQuery.data} error={feedQuery.error} onRetry={() => { void feedQuery.refetch(); }} /> : null}
        isConnected={hasConnectedAccount}
        isStale={!!runtime && isStale}
        lastGoodSnapshotTimestamp={
          isStale ? (feedQuery.data?.canonicalBlock.timestamp ?? null) : null
        }
        onRetry={() => {
          void feedQuery.refetch();
        }}
        now={runtime?.now ?? feedQuery.data?.canonicalBlock.timestamp ?? 0}
        proposals={proposals}
        hostname={hostname}
        selectedGroup={selectedGroup}
        onSelectGroup={selectGroup}
        state={state}
      />
      <MockControls />
    </>
  );
}

export function DaoBoardView({
  snapshotNotice = null,
  isConnected,
  isStale = false,
  lastGoodSnapshotTimestamp = null,
  now,
  onRetry,
  proposals,
  hostname,
  selectedGroup,
  onSelectGroup,
  state,
}: {
  snapshotNotice?: ReactNode;
  isConnected: boolean;
  isStale?: boolean;
  lastGoodSnapshotTimestamp?: number | null;
  now: number;
  onRetry: () => void;
  proposals: DaoProposal[];
  hostname?: string;
  selectedGroup?: DaoDisplayGroup;
  onSelectGroup?: (group: DaoDisplayGroup) => void;
  state: DaoBoardState;
}) {
  return (
    <DaoRouteFrame>
      <DaoBoardHeader
        hostname={hostname}
        proposalCount={proposals.length}
        showCount={state === "ready"}
      />

      {snapshotNotice}
      {!isConnected ? <DaoWalletNotice /> : null}

      {isStale && lastGoodSnapshotTimestamp !== null ? (
        <StaleFeedNotice
          onRetry={onRetry}
          snapshotTimestamp={lastGoodSnapshotTimestamp}
        />
      ) : null}

      {state === "loading" ? (
        <DaoLoadingPanel message={daoCopy.board.loading} />
      ) : null}

      {state === "error" ? (
        <DaoErrorPanel
          title={daoCopy.board.errorTitle}
          body={daoCopy.board.errorBody}
          retryLabel={daoCopy.board.retry}
          onRetry={onRetry}
        />
      ) : null}

      {state === "empty" ? (
        <Card className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-balance text-xl font-bold">
              {daoCopy.board.emptyTitle}
            </h2>
            <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
              {daoCopy.board.emptyBody}
            </p>
          </div>
          <Link
            href={createDaoProposeHref(hostname)}
            className={getButtonClassName({
              size: "sm",
              className: daoRouteControlClassName,
            })}
          >
            {daoCopy.navigation.createProposal}
          </Link>
        </Card>
      ) : null}

      {state === "ready" ? (
        <ProposalBoard
          now={now}
          proposals={proposals}
          hostname={hostname}
          selectedGroup={selectedGroup}
          onSelectGroup={onSelectGroup}
        />
      ) : null}
    </DaoRouteFrame>
  );
}

function DaoBoardHeader({
  hostname,
  proposalCount,
  showCount,
}: {
  hostname?: string;
  proposalCount: number;
  showCount: boolean;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-2">
        <h1 className="text-balance text-3xl font-bold md:text-4xl">
          {daoCopy.board.title}
        </h1>
        <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
          {daoCopy.board.description}
        </p>
        {showCount ? (
          <p className="font-number text-xs tabular-nums text-text-secondary">
            {daoCopy.board.available(proposalCount)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <a
          href={daoCopy.navigation.forumHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={daoCopy.navigation.forumAccessibleLabel}
          className={getButtonClassName({
            variant: "ghost",
            size: "sm",
            className: `${daoRouteControlClassName} w-full gap-1.5 sm:w-auto`,
          })}
        >
          <span>{daoCopy.navigation.forum}</span>
          <IconLinkOut className="size-3.5" aria-hidden />
        </a>
        <Link
          href={createDaoProposeHref(hostname)}
          className={getButtonClassName({
            size: "sm",
            className: `${daoRouteControlClassName} w-full sm:w-auto`,
          })}
        >
          {daoCopy.navigation.createProposal}
        </Link>
      </div>
    </header>
  );
}

function StaleFeedNotice({
  onRetry,
  snapshotTimestamp,
}: {
  onRetry: () => void;
  snapshotTimestamp: number;
}) {
  return (
    <Card role="alert" className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-balance text-xl font-bold">
          {daoCopy.board.staleTitle}
        </h2>
        <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
          {daoCopy.board.staleBody}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-bold">{daoCopy.board.lastGoodSnapshot}</span>
          <UtcTime
            timestamp={snapshotTimestamp}
            className="font-number tabular-nums text-text-secondary"
          />
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={daoRouteControlClassName}
        onClick={onRetry}
      >
        {daoCopy.board.retry}
      </Button>
    </Card>
  );
}
