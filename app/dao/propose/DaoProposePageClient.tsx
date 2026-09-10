"use client";

import { LiveDaoProposalAuthoringForm } from "./LiveDaoProposalAuthoringForm";
import { useState } from "react";
import { useAccount } from "wagmi";
import type {
  DaoMockAuthoring,
  DaoMockTransactionOutcome,
  DaoProposerState,
} from "@/lib/clients/dao";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button, getButtonClassName } from "@/components/ui/Button";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import {
  useDaoMockRuntime,
  useDaoProposerState,
} from "@/lib/hooks/useDao";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { useHostname } from "@/lib/hooks/useHostname";
import {
  DaoErrorPanel,
  DaoBreadcrumbs,
  DaoLoadingPanel,
  DaoRouteFrame,
  DaoWalletNotice,
  daoRouteControlClassName,
} from "../components/DaoRouteFrame";
import { daoCopy } from "../messages";
import { createDaoRootHref } from "../route-state";
import { MockControls } from "../components/MockControls";
import {
  DaoProposalAuthoringForm,
  DaoProposalEligibility,
} from "./DaoProposalAuthoringForm";
import { daoProposeCopy } from "./messages";

export type DaoProposeRouteState =
  | "disconnected"
  | "loading"
  | "ready"
  | "error";

export function DaoProposePageClient({
  initialHostname,
}: {
  initialHostname?: string;
}) {
  const browserHostname = useHostname();
  const hostname = browserHostname ?? initialHostname;
  const { address, isConnected } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const runtime = useDaoMockRuntime();
  const effectiveAddress = isE2E && runtime
    ? (runtime?.proposer.address ?? E2E_MOCK_ADDRESS)
    : (address ?? null);
  const hasConnectedAccount =
    isE2E && runtime
      ? runtime.proposer.connected && effectiveAddress !== null
      : isConnected && effectiveAddress !== null;
  const proposerQuery = useDaoProposerState(effectiveAddress);
  const state: DaoProposeRouteState = !hasConnectedAccount
    ? "disconnected"
    : proposerQuery.isPending
      ? "loading"
      : proposerQuery.isError
        ? "error"
        : "ready";


  return (
    <>
      <DaoProposeView
        onRetry={() => {
          void proposerQuery.refetch();
        }}
        live={!runtime}
        authoring={runtime?.authoring ?? null}
        hostname={hostname}
        now={runtime?.now ?? proposerQuery.data?.observation?.timestamp ?? 0}
        proposer={proposerQuery.data ?? null}
        state={state}
        transactionOutcome={runtime?.transactionOutcome ?? "success"}
      />
      <MockControls />
    </>
  );
}

export function DaoProposeView({
  live = false,
  authoring = null,
  hostname,
  now = 0,
  onRetry,
  proposer,
  state,
  transactionOutcome = "success",
}: {
  live?: boolean;
  authoring?: DaoMockAuthoring | null;
  hostname?: string;
  now?: number;
  onRetry: () => void;
  proposer: DaoProposerState | null;
  state: DaoProposeRouteState;
  transactionOutcome?: DaoMockTransactionOutcome;
}) {
  const [isAuthoring, setIsAuthoring] = useState(false);

  const handleStart = () => {
    setIsAuthoring(true);
    requestAnimationFrame(() => {
      const heading = document.getElementById("dao-proposal-authoring-heading");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView?.({ block: "start" });
      if (heading) {
        const stickyHeader = document.querySelector<HTMLElement>(
          "header.sticky"
        );
        const minimumTop =
          (stickyHeader?.getBoundingClientRect().bottom ?? 0) + 40;
        const headingTop = heading.getBoundingClientRect().top;
        if (headingTop < minimumTop) {
          window.scrollBy({ top: headingTop - minimumTop });
        }
      }
    });
  };

  return (
    <DaoRouteFrame>
      <header className="space-y-2 border-b border-border pb-6">
        <DaoBreadcrumbs
          items={[
            {
              href: createDaoRootHref(hostname),
              label: daoCopy.navigation.proposals,
            },
            { label: daoProposeCopy.page.title },
          ]}
        />
        <h1 className="text-balance text-3xl font-bold md:text-4xl">
          {daoProposeCopy.page.title}
        </h1>
        <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
          {daoProposeCopy.page.description}
        </p>
      </header>

      {state === "disconnected" ? (
        <DaoWalletNotice context="propose" />
      ) : null}

      {state === "loading" ? (
        <DaoLoadingPanel message={daoCopy.propose.loading} />
      ) : null}

      {state === "error" ? (
        <DaoErrorPanel
          title={daoCopy.propose.errorTitle}
          body={daoCopy.propose.errorBody}
          retryLabel={daoCopy.propose.retry}
          onRetry={onRetry}
        />
      ) : null}

      {state === "ready" && proposer && !isAuthoring ? (
        <ProposerSummary
          proposer={proposer}
          onStart={handleStart}
        />
      ) : null}

      {state === "ready" && proposer && isAuthoring ? live ? (
        <LiveDaoProposalAuthoringForm key={proposer.address} address={proposer.address} proposer={proposer} hostname={hostname} now={now} />
      ) : (
        <DaoProposalAuthoringForm
          address={proposer.address}
          authoringPreset={authoring}
          hostname={hostname}
          now={now}
          proposer={proposer}
          transactionOutcome={transactionOutcome}
        />
      ) : null}
    </DaoRouteFrame>
  );
}

function ProposerSummary({
  onStart,
  proposer,
}: {
  onStart: () => void;
  proposer: DaoProposerState;
}) {
  const title = proposer.canPropose
    ? daoCopy.propose.eligibleTitle
    : daoCopy.propose.blockedTitle;
  const body = proposer.canPropose
    ? daoCopy.propose.eligibleBody
    : proposer.proposeBlockedReason ?? daoCopy.propose.blockedFallback;

  return (
    <Card className="space-y-5">
      <div className="space-y-3">
        <Badge
          variant={proposer.canPropose ? "success" : "warning"}
          className={
            proposer.canPropose
              ? "dark:bg-green-950 dark:text-green-200"
              : "dark:bg-amber-950 dark:text-amber-200"
          }
        >
          {proposer.canPropose
            ? daoCopy.propose.eligibleLabel
            : daoCopy.propose.unavailableLabel}
        </Badge>
        <h2 className="text-balance text-2xl font-bold">
          {daoCopy.propose.title}
        </h2>
        <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
          {daoCopy.propose.description}
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-5">
        <h3 className="text-balance text-lg font-bold">{title}</h3>
        <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
          {body}
        </p>
      </div>

      <DaoProposalEligibility proposer={proposer} />

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
        <Button
          type="button"
          className={`${daoRouteControlClassName} w-full motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto`}
          onClick={onStart}
        >
          {proposer.canPropose
            ? daoProposeCopy.landing.start
            : daoProposeCopy.landing.draft}
        </Button>

        <a
          href={daoCopy.navigation.forumHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={daoCopy.navigation.forumAccessibleLabel}
          className={getButtonClassName({
            variant: "secondary",
            size: "sm",
            className: `${daoRouteControlClassName} w-full gap-1.5 motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto`,
          })}
        >
          <span>{daoCopy.navigation.forum}</span>
          <IconLinkOut className="size-3.5" aria-hidden />
        </a>
      </div>
    </Card>
  );
}
