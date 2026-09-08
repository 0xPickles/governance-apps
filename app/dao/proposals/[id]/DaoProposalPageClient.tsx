"use client";

import type { ReactNode } from "react";
import {
  serializeDaoProposalRef,
  type DaoProposalReadEnvelope,
} from "@/lib/clients/dao";
import { Card } from "@/components/ui/Card";
import { getButtonClassName } from "@/components/ui/Button";
import Link from "next/link";
import { useDaoMockRuntime, useDaoProposal } from "@/lib/hooks/useDao";
import { useHostname } from "@/lib/hooks/useHostname";
import {
  DaoErrorPanel,
  DaoBreadcrumbs,
  DaoLoadingPanel,
  DaoRouteFrame,
  daoRouteControlClassName,
} from "../../components/DaoRouteFrame";
import { daoCopy } from "../../messages";
import { MockControls } from "../../components/MockControls";
import { DaoSnapshotNotice } from "../../components/DaoSnapshotNotice";
import { ProposalDetail } from "./ProposalDetail";
import { DaoProposalActionPanel } from "./DaoProposalActionPanel";
import {
  createDaoBoardGroupHref,
  createDaoRootHref,
  isDaoDisplayGroup,
} from "../../route-state";

export type DaoProposalRouteState =
  | "loading"
  | "ready"
  | "not_found"
  | "error";

const PROPOSAL_EYEBROW_CLASS_NAME =
  "min-w-0 max-w-full break-words font-number text-xs font-bold tabular-nums text-text-secondary [overflow-wrap:anywhere]";

export function DaoProposalPageClient({
  initialHostname,
  proposalId,
  selection,
  requestedOrigin = null,
}: {
  initialHostname?: string;
  proposalId: string;
  selection?: { chainId: string | null; votingAddress: string | null };
  requestedOrigin?: string | null;
}) {
  const browserHostname = useHostname();
  const hostname = browserHostname ?? initialHostname;
  const runtime = useDaoMockRuntime();
  const proposalQuery = useDaoProposal(proposalId, selection);
  const envelope = proposalQuery.envelope;
  const state: DaoProposalRouteState = proposalQuery.isPending
    ? "loading"
    : envelope
      ? "ready"
      : proposalQuery.isError
        ? "error"
        : "not_found";

  return (
    <>
      <DaoProposalView
        snapshotNotice={!runtime ? <DaoSnapshotNotice snapshot={envelope?.feed} error={proposalQuery.error} onRetry={() => { void proposalQuery.refetch(); }} /> : null}
        actionPanel={
          envelope ? (
            <DaoProposalActionPanel
              key={serializeDaoProposalRef(envelope.proposal.ref)}
              proposal={envelope.proposal}
            />
          ) : null
        }
        envelope={envelope}
        hostname={hostname}
        now={runtime?.now ?? envelope?.feed.canonicalBlock.timestamp ?? 0}
        onRetry={() => {
          void proposalQuery.refetch();
        }}
        proposalId={proposalId}
        requestedOrigin={requestedOrigin}
        state={state}
      />
      <MockControls />
    </>
  );
}

export function DaoProposalView({
  snapshotNotice = null,
  actionPanel = null,
  envelope,
  hostname,
  now,
  onRetry,
  proposalId,
  requestedOrigin = null,
  state,
}: {
  snapshotNotice?: ReactNode;
  actionPanel?: ReactNode;
  envelope: DaoProposalReadEnvelope | null;
  hostname?: string;
  now?: number;
  onRetry: () => void;
  proposalId: string;
  requestedOrigin?: string | null;
  state: DaoProposalRouteState;
}) {
  return (
    <DaoRouteFrame>
      {snapshotNotice}
      {state !== "ready" ? (
        <header className="space-y-2 border-b border-border pb-6">
          <DaoBreadcrumbs
            items={[
              {
                href: createDaoRootHref(hostname),
                label: daoCopy.navigation.proposals,
              },
              ...(isDaoDisplayGroup(requestedOrigin)
                ? [
                    {
                      href: createDaoBoardGroupHref(
                        "/dao",
                        requestedOrigin,
                        hostname
                      ),
                      label: daoCopy.board.filters[requestedOrigin],
                    },
                  ]
                : []),
              { label: daoCopy.detail.eyebrow(proposalId) },
            ]}
          />
          <h1 className="text-balance text-3xl font-bold md:text-4xl">
            {state === "not_found"
              ? daoCopy.detail.notFoundTitle
              : daoCopy.detail.eyebrow(proposalId)}
          </h1>
        </header>
      ) : null}

      {state === "loading" ? (
        <DaoLoadingPanel message={daoCopy.detail.loading} />
      ) : null}

      {state === "error" ? (
        <DaoErrorPanel
          title={daoCopy.detail.errorTitle}
          body={daoCopy.detail.errorBody}
          retryLabel={daoCopy.detail.retry}
          onRetry={onRetry}
        />
      ) : null}

      {state === "not_found" ? (
        <Card className="min-w-0 space-y-5 overflow-hidden">
          <div className="min-w-0 space-y-2">
            <p className={PROPOSAL_EYEBROW_CLASS_NAME}>
              {daoCopy.detail.eyebrow(proposalId)}
            </p>
            <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
              {daoCopy.detail.notFoundBody}
            </p>
          </div>
          <Link
            href={createDaoRootHref(hostname)}
            className={getButtonClassName({
              variant: "secondary",
              size: "sm",
              className: daoRouteControlClassName,
            })}
          >
            {daoCopy.detail.returnToBoard}
          </Link>
        </Card>
      ) : null}

      {state === "ready" && envelope ? (
        <ProposalDetail
          actionPanel={actionPanel}
          envelope={envelope}
          hostname={hostname}
          now={now}
          requestedOrigin={requestedOrigin}
        />
      ) : null}
    </DaoRouteFrame>
  );
}
