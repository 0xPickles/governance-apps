"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UtcTime } from "@/components/ui/UtcTime";
import type {
  YbcMockDataV1,
  YbcProposalType,
  YbcPrototypeScenarioId,
  YbcVoteChoice,
} from "@/lib/clients/ybc";
import { useYbcState } from "@/lib/hooks/useYbc";
import { useYbcEnsIdentities } from "@/lib/hooks/useYbcEnsIdentities";
import { useYbcProposalWrites } from "@/lib/hooks/useYbcProposalWrites";
import type { TxState } from "@/lib/tx/types";
import { useProtocol } from "@/state/protocol";
import { MembersTable, MembersTableSkeleton } from "./components/MembersTable";
import { MockControls } from "./components/MockControls";
import { OperatorPanel } from "./components/OperatorPanel";
import { ProposalBoard } from "./components/ProposalBoard";
import { RewardsCard } from "./components/RewardsCard";
import { YbcHero, YbcHeroSkeleton } from "./components/YbcHero";
import { buildYbcIdentityMap } from "./identity";
import { ybcCopy as copy } from "./messages";
import { useYbcMemberAliases } from "./useYbcMemberAliases";

type YbcPageClientProps = {
  scenarioOverride?: YbcPrototypeScenarioId;
  latencyMs?: number;
  hostname?: string | null;
};

type YbcPageContentProps = {
  data: YbcMockDataV1;
  hostname?: string | null;
  trustRecordEns?: boolean;
  verifiedEns?: Record<string, string>;
  createProposal?: (
    type: YbcProposalType,
    targetAddress?: string
  ) => void | Promise<void>;
  retractProposal?: (proposalId: string) => void | Promise<void>;
  voteOnProposal?: (
    proposalId: string,
    choice: YbcVoteChoice
  ) => void | Promise<void>;
  executeProposal?: (proposalId: string) => void | Promise<void>;
  proposalTargetRequired?: boolean;
  proposalTxState?: TxState;
  resetProposalTx?: () => void;
  isRefreshing?: boolean;
  lastUpdatedAt?: number | null;
  onRetry?: () => void;
  readStatus?: "current" | "stale";
  warningMessage?: string | null;
};

const SECTION_HASHES = new Set(["overview", "members", "proposals", "rewards", "admin"]);
const PRIORITY_PROPOSAL_PHASES = new Set([
  "discussion",
  "voting",
  "awaiting-execution",
]);

export function YbcPageClient({
  scenarioOverride,
  latencyMs,
  hostname,
}: YbcPageClientProps = {}) {
  const { mainnetPublicClient, ybcUsesMockBackend } = useProtocol();
  const ybcState = useYbcState({
    scenarioOverride,
    latencyMs,
  });
  const ensAddresses = useMemo(
    () => getYbcIdentityAddresses(ybcState.data),
    [ybcState.data]
  );
  const verifiedEns = useYbcEnsIdentities(
    mainnetPublicClient,
    ensAddresses,
    ybcState.backend === "feed"
  );
  const hasLiveWriteContext =
    ybcState.backend === "feed" && ybcState.writeFeed !== null;
  const proposalWrites = useYbcProposalWrites(
    ybcState.backend === "feed" ? ybcState.writeFeed : null
  );
  const {
    data,
    error,
    isError,
    isLoading,
    isRefreshing,
    lastUpdatedAt,
    readStatus,
    refetch,
    warning,
  } = ybcState;
  const createProposal =
    ybcState.backend === "feed"
      ? hasLiveWriteContext
        ? proposalWrites.createProposal
        : undefined
      : ybcState.createProposal
        ? (type: YbcProposalType) => {
            ybcState.createProposal(type);
          }
        : undefined;
  const retractProposal =
    ybcState.backend === "feed"
      ? hasLiveWriteContext
        ? proposalWrites.retractProposal
        : undefined
      : ybcState.retractProposal
        ? (proposalId: string) => {
            ybcState.retractProposal(proposalId);
          }
        : undefined;
  const voteOnProposal =
    ybcState.backend === "feed"
      ? hasLiveWriteContext
        ? proposalWrites.voteOnProposal
        : undefined
      : ybcState.voteOnProposal
        ? (proposalId: string, choice: YbcVoteChoice) => {
            ybcState.voteOnProposal(proposalId, choice);
          }
        : undefined;
  const executeProposal =
    ybcState.backend === "feed"
      ? hasLiveWriteContext
        ? proposalWrites.executeProposal
        : undefined
      : ybcState.executeProposal
        ? (proposalId: string) => {
            ybcState.executeProposal(proposalId);
          }
        : undefined;

  if (isError) {
    return (
      <YbcPageErrorState
        errorMessage={error instanceof Error ? error.message : null}
        isRetrying={isRefreshing}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isLoading || !data) {
    return <YbcPageLoadingState />;
  }

  return (
    <>
      <YbcPageContent
        data={data}
        hostname={hostname}
        trustRecordEns={ybcState.backend === "mock"}
        verifiedEns={verifiedEns}
        createProposal={createProposal}
        retractProposal={retractProposal}
        voteOnProposal={voteOnProposal}
        executeProposal={executeProposal}
        proposalTargetRequired={ybcState.backend === "feed"}
        proposalTxState={
          ybcState.backend === "feed" ? proposalWrites.state : undefined
        }
        resetProposalTx={
          hasLiveWriteContext
            ? proposalWrites.reset
            : undefined
        }
        isRefreshing={isRefreshing}
        lastUpdatedAt={lastUpdatedAt}
        onRetry={() => {
          void refetch();
        }}
        readStatus={readStatus}
        warningMessage={warning?.message ?? null}
      />
      {ybcUsesMockBackend ? <MockControls /> : null}
    </>
  );
}

export function YbcPageContent({
  data,
  hostname,
  trustRecordEns = true,
  verifiedEns = {},
  createProposal,
  retractProposal,
  voteOnProposal,
  executeProposal,
  proposalTargetRequired = false,
  proposalTxState,
  resetProposalTx,
  isRefreshing = false,
  lastUpdatedAt = null,
  onRetry,
  readStatus = "current",
  warningMessage,
}: YbcPageContentProps) {
  const [focusedProposalId, setFocusedProposalId] = useState<string | null>(null);
  const {
    aliases,
    clearAliases,
    resetAlias,
    setAlias,
  } = useYbcMemberAliases();
  const showOperatorSection = Boolean(data.admin && data.me.isOperator);
  const hasPriorityProposals = data.proposals.items.some((proposal) =>
    PRIORITY_PROPOSAL_PHASES.has(proposal.phase)
  );
  const visibleIdentityAddresses = useMemo(
    () => getYbcIdentityAddresses(data),
    [data]
  );
  const identities = useMemo(
    () =>
      buildYbcIdentityMap(
        data.roster.members,
        data.admin?.operators ?? [],
        {
          aliases,
          trustRecordEns,
          verifiedEns,
          visibleAddresses: visibleIdentityAddresses,
        }
      ),
    [
      aliases,
      data.admin?.operators,
      data.roster.members,
      trustRecordEns,
      verifiedEns,
      visibleIdentityAddresses,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!SECTION_HASHES.has(hash)) return;
      if (hash === "admin" && !showOperatorSection) return;

      window.requestAnimationFrame(() => {
        scrollToHashTarget(hash);
      });
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [showOperatorSection]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyProposalLink = () => {
      const url = new URL(window.location.href);
      const rawProposal = url.searchParams.get("proposal");
      if (rawProposal === null) {
        setFocusedProposalId(null);
        return;
      }
      const proposalId = /^\d+$/.test(rawProposal)
        ? `YBC-${BigInt(rawProposal).toString()}`
        : null;
      const exists = proposalId !== null && data.proposals.items.some(
        (proposal) => proposal.id === proposalId
      );
      if (!exists) {
        url.searchParams.delete("proposal");
        url.hash = "proposals";
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`
        );
        setFocusedProposalId(null);
        return;
      }
      setFocusedProposalId(proposalId);
      window.requestAnimationFrame(() => {
        document.getElementById(`ybc-proposal-${proposalId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    };

    applyProposalLink();
    window.addEventListener("popstate", applyProposalLink);
    window.addEventListener("hashchange", applyProposalLink);
    return () => {
      window.removeEventListener("popstate", applyProposalLink);
      window.removeEventListener("hashchange", applyProposalLink);
    };
  }, [data.proposals.items]);

  const membersSection = (
    <MembersTable
      aliases={aliases}
      identities={identities}
      roster={data.roster}
      currentAddress={data.me.address}
      onClearAliases={clearAliases}
      onResetAlias={resetAlias}
      onSetAlias={setAlias}
    />
  );
  const proposalsSection = (
    <ProposalBoard
      id="proposals"
      data={data}
      identities={identities}
      createProposal={createProposal}
      retractProposal={retractProposal}
      voteOnProposal={voteOnProposal}
      executeProposal={executeProposal}
      proposalTargetRequired={proposalTargetRequired}
      proposalTxState={proposalTxState}
      resetProposalTx={resetProposalTx}
      focusedProposalId={focusedProposalId}
    />
  );

  return (
    <div
      className="bg-app text-text-primary"
      aria-busy={isRefreshing || undefined}
    >
      <YbcHero data={data} />
      <main className="container mx-auto space-y-8 px-4 py-8 md:px-6 md:py-10">
        <YbcDataStatusNotice
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
          onRetry={onRetry}
          readStatus={readStatus}
          warningMessage={warningMessage}
        />
        {hasPriorityProposals ? proposalsSection : membersSection}
        {hasPriorityProposals ? membersSection : proposalsSection}
        <RewardsCard id="rewards" data={data} hostname={hostname} />

        {showOperatorSection ? (
          <OperatorPanel
            id="admin"
            identities={identities}
            data={data}
            createProposal={createProposal}
          />
        ) : null}
      </main>
    </div>
  );
}

export function YbcDataStatusNotice({
  isRefreshing = false,
  lastUpdatedAt,
  onRetry,
  readStatus,
  warningMessage,
}: {
  isRefreshing?: boolean;
  lastUpdatedAt?: number | null;
  onRetry?: () => void;
  readStatus: "current" | "stale";
  warningMessage?: string | null;
}) {
  if (readStatus === "current") {
    return (
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary"
        role="status"
        aria-live="polite"
      >
        {isRefreshing ? <span>{copy.page.refreshing}</span> : null}
        {lastUpdatedAt !== null && lastUpdatedAt !== undefined ? (
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            {copy.page.lastUpdated}:{" "}
            <UtcTime
              className="font-number"
              timestamp={lastUpdatedAt}
            />
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-3 rounded-box border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 space-y-1">
        {warningMessage ? (
          <p className="min-w-0 text-pretty break-words [overflow-wrap:anywhere]">
            {warningMessage}
          </p>
        ) : null}
        {lastUpdatedAt !== null && lastUpdatedAt !== undefined ? (
          <p className="min-w-0 break-words font-number text-xs tabular-nums [overflow-wrap:anywhere]">
            {copy.page.lastUpdated}:{" "}
            <UtcTime timestamp={lastUpdatedAt} />
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={isRefreshing}
          aria-busy={isRefreshing || undefined}
          onClick={onRetry}
        >
          {isRefreshing ? copy.page.retrying : copy.page.retryCta}
        </Button>
      ) : null}
    </div>
  );
}

function getYbcIdentityAddresses(
  data: YbcMockDataV1 | null | undefined
): string[] {
  if (!data) return [];

  return [
    ...data.roster.members.map((member) => member.address),
    ...(data.admin?.operators.map((operator) => operator.address) ?? []),
    ...data.proposals.items.flatMap((proposal) => [
      proposal.proposer,
      proposal.targetAccount,
    ]),
    ...(data.me.address ? [data.me.address] : []),
  ];
}

export function YbcPageLoadingState() {
  return (
    <div className="bg-app text-text-primary" aria-busy="true">
      <section className="border-b border-border bg-surface">
        <div className="container mx-auto space-y-3 px-4 py-8 md:px-6">
          <p className="text-sm font-bold uppercase text-text-tertiary">
            {copy.page.loadingTitle}
          </p>
          <p className="max-w-2xl text-sm leading-6 text-text-secondary">
            {copy.page.loadingBody}
          </p>
        </div>
      </section>
      <YbcHeroSkeleton />
      <MembersTableSkeleton />
    </div>
  );
}

function scrollToHashTarget(id: string) {
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "start" });
    }
  });
}

export function YbcPageErrorState({
  errorMessage,
  isRetrying = false,
  onRetry,
}: {
  errorMessage?: string | null;
  isRetrying?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-app text-text-primary">
      <section className="container mx-auto px-4 py-16 md:px-6 md:py-24">
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase text-text-tertiary">
              {copy.page.errorTitle}
            </p>
            <h1 className="text-3xl font-bold">{copy.app.displayLabel}</h1>
            <p className="max-w-2xl text-sm leading-6 text-text-secondary">
              {copy.page.errorBody}
            </p>
            {errorMessage ? (
              <p className="font-number text-xs text-text-tertiary">
                {errorMessage}
              </p>
            ) : null}
          </div>
          {onRetry ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={isRetrying}
                aria-busy={isRetrying || undefined}
                onClick={onRetry}
              >
                {isRetrying ? copy.page.retrying : copy.page.retryCta}
              </Button>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
