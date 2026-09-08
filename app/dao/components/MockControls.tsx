"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  DebugControls,
  type DebugControlsSection,
} from "@/components/DebugControls";
import { Button, getButtonClassName } from "@/components/ui/Button";
import {
  DAO_MOCK_FIXTURE_IDS,
  getDaoMockFixture,
  type DaoMockAccountState,
  type DaoMockScriptState,
  type DaoMockAuthoringState,
  type DaoMockContentState,
  type DaoMockExecutionState,
  type DaoMockLifecycleState,
  type DaoMockPersona,
  type DaoMockProposerState,
  type DaoMockRole,
  type DaoMockSurfaceState,
  type DaoMockTransactionOutcome,
  type DaoMockVetoState,
} from "@/lib/clients/dao";
import { useDaoDebugActions, useDaoMockRuntime } from "@/lib/hooks/useDao";
import { useHostname } from "@/lib/hooks/useHostname";
import {
  isDaoReviewControlsEnabled,
  isDebugUiEnabled,
} from "@/lib/runtime/features";
import {
  GOVERNANCE_APP_PREPROD_HOSTS,
  normalizeGovernanceHostname,
} from "@/lib/runtime/governance-hosts";
import { daoCopy } from "../messages";
import { createDaoProposalHref } from "../route-state";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const CONTROL_INPUT_CLASS_NAME =
  "h-10 w-full rounded-box border border-border bg-app px-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary focus:ring-offset-2 focus:ring-offset-app";

const SURFACES: readonly [DaoMockSurfaceState, string][] = [
  ["ready", "Ready"],
  ["loading", "Loading"],
  ["empty", "Empty"],
  ["error", "Error"],
];
const PERSONAS: readonly [DaoMockPersona, string][] = [
  ["observer", "Observer"],
  ["voter", "Voter"],
  ["proposer", "Proposer"],
  ["operator", "Operator"],
  ["guardian", "Guardian"],
];
const CONTENT_STATES: readonly [DaoMockContentState, string][] = [
  ["available", "Available"],
  ["unavailable", "Unavailable"],
  ["invalid", "Invalid"],
  ["unverified-forum", "Unverified forum"],
];
const LIFECYCLE_STATES: readonly [DaoMockLifecycleState, string][] = [
  ["discussion", "Discussion"],
  ["voting", "Voting"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["expired", "Expired"],
  ["retracted", "Retracted"],
  ["flagged", "Flagged"],
];
const VETO_STATES: readonly [DaoMockVetoState, string][] = [
  ["before-votes", "Before votes"],
  ["after-votes", "After votes"],
];
const SCRIPT_STATES: readonly [DaoMockScriptState, string][] = [
  ["missing", "Missing"],
  ["decoded", "Decoded"],
  ["partial", "Partial"],
  ["malformed", "Malformed"],
  ["hash-mismatch", "Hash mismatch"],
];
const ACCOUNT_STATES: readonly [DaoMockAccountState, string][] = [
  ["weight", "Weight"],
  ["no-weight", "No weight"],
  ["already-voted", "Already voted"],
  ["late-decayed", "Late-decayed"],
  ["disconnected", "Disconnected"],
  ["wrong-network", "Wrong network"],
];
const TRANSACTION_OUTCOMES: readonly [DaoMockTransactionOutcome, string][] = [
  ["success", "Success"],
  ["user-rejected", "Rejected"],
  ["revert", "Revert"],
  ["network-error", "Network error"],
];
const EXECUTION_STATES: readonly [DaoMockExecutionState, string][] = [
  ["signal", "Signal"],
  ["executable", "Executable"],
  ["guarded", "Guarded"],
  ["permissionless", "Permissionless"],
  ["simulation-failure", "Simulation failure"],
];
const AUTHORING_STATES: readonly [DaoMockAuthoringState, string][] = [
  ["valid-signal", "Valid signal"],
  ["valid-script", "Valid script"],
  ["invalid-frame", "Invalid frame"],
  ["too-many-calls", "Too many calls"],
  ["too-large", "Too large"],
];
const PROPOSER_STATES: readonly [DaoMockProposerState, string][] = [
  ["eligible", "Eligible"],
  ["blacklisted", "Blacklisted"],
  ["insufficient-weight", "Below weight"],
  ["cooldown", "Cooldown"],
  ["capacity-full", "Capacity full"],
];
const ROLES: readonly [DaoMockRole, string][] = [
  ["proposer", "Proposer"],
  ["operator", "Operator"],
  ["guardian", "Guardian"],
];

export function MockControls() {
  const hostname = useHostname();
  const runtime = useDaoMockRuntime();
  const actions = useDaoDebugActions();

  const showGlobalDebug = isDebugUiEnabled();
  const showDaoBetaReviewControls =
    isDaoReviewControlsEnabled() &&
    normalizeGovernanceHostname(hostname) === GOVERNANCE_APP_PREPROD_HOSTS.dao;

  if ((!showGlobalDebug && !showDaoBetaReviewControls) || !runtime) return null;

  const selectedProposal = runtime.feed.proposals.find(
    (proposal) => proposal.ref.proposalId === runtime.selectedProposalId
  );
  const selectedProposalId = runtime.selectedProposalId.toString();
  const activeRole: Record<DaoMockRole, boolean> = {
    proposer: runtime.account.isProposer,
    operator: runtime.account.isOperator,
    guardian: runtime.account.isGuardian,
  };

  const section: DebugControlsSection = {
    id: "dao",
    title: daoCopy.debug.title,
    content: (
      <div className="space-y-3 text-xs">
        <div className="rounded-box border border-border bg-app px-3 py-2">
          <p className="text-pretty font-bold text-text-primary">
            Proposal #{selectedProposalId} · {selectedProposal?.displayStatus ?? "empty"}
          </p>
          <p className="font-number tabular-nums text-text-secondary">
            {DATE_TIME_FORMATTER.format(runtime.now * 1_000)} UTC
          </p>
        </div>

        <ControlGroup label={daoCopy.debug.surface} defaultOpen>
          <ButtonGrid columns={4}>
            {SURFACES.map(([surface, label]) => (
              <ToggleButton
                key={surface}
                active={runtime.surface === surface}
                onClick={() => {
                  void actions.setSurface(surface);
                }}
              >
                {label}
              </ToggleButton>
            ))}
          </ButtonGrid>
        </ControlGroup>

        <ControlGroup label={daoCopy.debug.fixture} defaultOpen>
          <select
            aria-label="DAO fixture"
            className={CONTROL_INPUT_CLASS_NAME}
            value={runtime.selectedFixtureId ?? ""}
            onChange={(event) => {
              if (event.target.value) {
                void actions.applyFixture(event.target.value as (typeof DAO_MOCK_FIXTURE_IDS)[number]);
              }
            }}
          >
            <option value="" disabled>
              {daoCopy.debug.custom}
            </option>
            {DAO_MOCK_FIXTURE_IDS.map((fixtureId) => (
              <option key={fixtureId} value={fixtureId}>
                {getDaoMockFixture(fixtureId).label}
              </option>
            ))}
          </select>
          <select
            aria-label="Selected DAO proposal"
            className={CONTROL_INPUT_CLASS_NAME}
            value={selectedProposalId}
            onChange={(event) => {
              void actions.setSelectedProposal(event.target.value);
            }}
          >
            {runtime.feed.proposals.map((proposal) => (
              <option
                key={proposal.ref.proposalId.toString()}
                value={proposal.ref.proposalId.toString()}
              >
                #{proposal.ref.proposalId.toString()} · {proposal.displayStatus}
              </option>
            ))}
          </select>
          <Link
            href={createDaoProposalHref(
              selectedProposalId,
              selectedProposal?.displayGroup ?? "active",
              hostname
            )}
            className={getButtonClassName({
              size: "sm",
              variant: "secondary",
              className: "w-full motion-reduce:transition-none motion-reduce:active:scale-100",
            })}
          >
            {daoCopy.debug.openProposal}
          </Link>
        </ControlGroup>

        <ControlGroup label={daoCopy.debug.persona} defaultOpen>
          <ButtonGrid>
            {PERSONAS.map(([persona, label]) => (
              <ToggleButton
                key={persona}
                active={runtime.persona === persona}
                onClick={() => {
                  void actions.setPersona(persona);
                }}
              >
                {label}
              </ToggleButton>
            ))}
          </ButtonGrid>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(([role, label]) => (
              <ToggleButton
                key={role}
                active={activeRole[role]}
                onClick={() => {
                  void actions.setRole(role, !activeRole[role]);
                }}
              >
                {label}
              </ToggleButton>
            ))}
          </div>
        </ControlGroup>

        <StateGroup
          label={daoCopy.debug.content}
          values={CONTENT_STATES}
          onSelect={actions.setContentState}
        />
        <StateGroup
          label={daoCopy.debug.lifecycle}
          values={LIFECYCLE_STATES}
          onSelect={actions.setLifecycle}
        />
        <StateGroup
          label={daoCopy.debug.veto}
          values={VETO_STATES}
          onSelect={actions.setVetoState}
        />
        <StateGroup
          label={daoCopy.debug.analysis}
          values={SCRIPT_STATES}
          onSelect={actions.setScriptState}
        />
        <StateGroup
          label={daoCopy.debug.account}
          values={ACCOUNT_STATES}
          onSelect={actions.setAccountState}
        />
        <StateGroup
          label={daoCopy.debug.execution}
          values={EXECUTION_STATES}
          onSelect={actions.setExecutionState}
        />

        <ControlGroup label={daoCopy.debug.transaction}>
          <ButtonGrid>
            {TRANSACTION_OUTCOMES.map(([outcome, label]) => (
              <ToggleButton
                key={outcome}
                active={runtime.transactionOutcome === outcome}
                onClick={() => {
                  void actions.setTransactionOutcome(outcome);
                }}
              >
                {label}
              </ToggleButton>
            ))}
          </ButtonGrid>
          {runtime.pendingAction ? (
            <div className="space-y-2">
              <p className="text-pretty text-text-secondary">
                {runtime.pendingAction.action} awaiting indexing
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void actions.indexPendingAction();
                  }}
                >
                  Index action
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void actions.clearPendingAction();
                  }}
                >
                  Clear pending
                </Button>
              </div>
            </div>
          ) : null}
        </ControlGroup>

        <ControlGroup label={daoCopy.debug.authoring}>
          <ButtonGrid>
            {AUTHORING_STATES.map(([authoringState, label]) => (
              <ToggleButton
                key={authoringState}
                active={runtime.authoring.state === authoringState}
                onClick={() => {
                  void actions.setAuthoringState(authoringState);
                }}
              >
                {label}
              </ToggleButton>
            ))}
          </ButtonGrid>
          <p className="text-pretty text-text-secondary">
            {runtime.authoring.scriptCheck.error?.code ??
              `${runtime.authoring.scriptCheck.frames.length} calls · ${runtime.authoring.scriptCheck.scriptBytes ?? 0} bytes`}
          </p>
        </ControlGroup>

        <ControlGroup label={daoCopy.debug.eligibility}>
          <ButtonGrid>
            {PROPOSER_STATES.map(([proposerState, label]) => (
              <ToggleButton
                key={proposerState}
                active={
                  proposerState === "eligible"
                    ? runtime.proposer.blacklisted === false &&
                      runtime.proposer.currentWeight >= runtime.proposer.minimumWeight &&
                      runtime.proposer.lastProposedAt === null &&
                      runtime.proposer.affectedBoostEpochs.every(
                        (epoch) => epoch.currentProposalCount < epoch.proposalLimit
                      )
                    : false
                }
                onClick={() => {
                  void actions.setProposerState(proposerState);
                }}
              >
                {label}
              </ToggleButton>
            ))}
          </ButtonGrid>
        </ControlGroup>
      </div>
    ),
  };

  return <DebugControls sections={[section]} />;
}

function ControlGroup({
  children,
  defaultOpen = false,
  label,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  label: string;
}) {
  return (
    <details
      className="rounded-box border border-border bg-surface px-3 py-2"
      open={defaultOpen}
    >
      <summary className="flex min-h-10 cursor-pointer items-center font-bold uppercase tracking-wide text-text-tertiary">
        {label}
      </summary>
      <div className="space-y-2 pt-2">{children}</div>
    </details>
  );
}

function ButtonGrid({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 2 | 4;
}) {
  return (
    <div className={columns === 4 ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "grid grid-cols-2 gap-2"}>
      {children}
    </div>
  );
}

function StateGroup<TState extends string>({
  label,
  onSelect,
  values,
}: {
  label: string;
  onSelect: (state: TState) => Promise<void>;
  values: readonly (readonly [TState, string])[];
}) {
  return (
    <ControlGroup label={label}>
      <ButtonGrid>
        {values.map(([value, text]) => (
          <Button
            key={value}
            size="sm"
            variant="secondary"
            onClick={() => {
              void onSelect(value);
            }}
          >
            {text}
          </Button>
        ))}
      </ButtonGrid>
    </ControlGroup>
  );
}

function ToggleButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "primary" : "secondary"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
