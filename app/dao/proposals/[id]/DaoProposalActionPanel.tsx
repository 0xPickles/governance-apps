"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UtcTime } from "@/components/ui/UtcTime";
import {
  parseDaoProposalContent,
  serializeDaoProposalRef,
  validateDaoModerationReason,
  type DaoAccountProposalState,
  type DaoActionType,
  type DaoExecutionGuard,
  type DaoPendingAction,
  type DaoProposal,
  type DaoVoteDirection,
} from "@/lib/clients/dao";
import { cn } from "@/lib/cn";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/format";
import {
  useDaoAccountProposalState,
  useDaoMockRuntime,
  useDaoProposalActions,
} from "@/lib/hooks/useDao";
import type { TxState } from "@/lib/tx/types";
import { daoCopy } from "../../messages";

type DialogAction = DaoActionType | null;

export function DaoProposalActionPanel({ proposal }: { proposal: DaoProposal }) {
  const { address } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const runtime = useDaoMockRuntime();
  const effectiveAddress = isE2E && runtime
    ? (runtime?.account.address ?? E2E_MOCK_ADDRESS)
    : (address ?? null);
  const accountQuery = useDaoAccountProposalState(
    proposal.ref,
    effectiveAddress
  );
  const writes = useDaoProposalActions(proposal.ref, effectiveAddress, {
    submittedMessage: daoCopy.actions.transaction.submittedToast,
  });
  const runtimePendingAction = runtime?.pendingAction ?? null;
  const pendingAction = runtimePendingAction
    ? serializeDaoProposalRef(runtimePendingAction.ref) ===
      serializeDaoProposalRef(proposal.ref)
      ? runtimePendingAction
      : null
    : null;

  if (!runtime) {
    const current = accountQuery.data;
    const live = current?.liveProposal;
    const lagging = live && (live.protocolStatus !== proposal.protocolStatus || live.totalWeight !== proposal.totalWeight || live.yeaWeight !== proposal.yeaWeight || live.retracted !== proposal.retracted || live.rules.snapshotThresholdBps !== proposal.rules.snapshotThresholdBps || live.voteStartsAt !== proposal.voteStartsAt || live.rules.executionGuard !== proposal.rules.executionGuard);
    return <Card className="min-w-0 space-y-3">
      <h3 className="text-xl font-bold">{daoCopy.feed.currentWallet}</h3>
      <p>{daoCopy.feed.writesDisabled}</p>
      {!effectiveAddress ? <p>{daoCopy.feed.connect}</p> : accountQuery.isError ? <p role="alert">{accountQuery.error?.message}</p> :
        accountQuery.isPending || accountQuery.isFetching ? <p role="status">{daoCopy.feed.checking}</p> : null}
      {current && live ? <>
        <p>{daoCopy.feed.currentStatus}: <strong>{live.protocolStatus.toUpperCase()}</strong></p>
        <p className="font-number tabular-nums">{daoCopy.feed.liveWeight}: {formatTokenAmount(current.effectiveVotingWeight, 18, 2)}</p>
        <p>{current.capabilities.canVote ? daoCopy.feed.eligible : current.capabilities.voteBlockedReason}</p>
        <p className="text-sm">{daoCopy.feed.liveObserved}: {current.observation?.number.toString()} · <UtcTime timestamp={current.observation?.timestamp ?? null} /></p>
        {lagging ? <p role="status">{daoCopy.feed.feedLag}</p> : null}
      </> : null}
      <p className="text-sm text-text-secondary">{daoCopy.feed.notSigning}</p>
    </Card>;
  }
  return (
    <DaoProposalActionPanelView
      account={accountQuery.data ?? null}
      accountError={accountQuery.isError}
      accountLoading={effectiveAddress !== null && accountQuery.isPending}
      activeAction={writes.activeAction}
      executionGuard={runtime?.executionGuard ?? "guarded"}
      onExecute={writes.executeProposal}
      onFlag={writes.flag}
      onRetract={writes.retract}
      onVeto={writes.veto}
      onVote={writes.vote}
      pendingAction={pendingAction}
      proposal={proposal}
      txState={writes.state}
    />
  );
}

export function DaoProposalActionPanelView({
  account,
  accountError,
  accountLoading,
  activeAction,
  executionGuard,
  onExecute,
  onFlag,
  onRetract,
  onVeto,
  onVote,
  pendingAction,
  proposal,
  txState,
}: {
  account: DaoAccountProposalState | null;
  accountError: boolean;
  accountLoading: boolean;
  activeAction: DaoActionType | null;
  executionGuard: DaoExecutionGuard;
  onExecute: () => Promise<void>;
  onFlag: (reason: string) => Promise<void>;
  onRetract: () => Promise<void>;
  onVeto: (reason: string) => Promise<void>;
  onVote: (direction: DaoVoteDirection) => Promise<void>;
  pendingAction: DaoPendingAction | null;
  proposal: DaoProposal;
  txState: TxState;
}) {
  const [direction, setDirection] = useState<DaoVoteDirection | null>(null);
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [reason, setReason] = useState("");
  const [acknowledgedContent, setAcknowledgedContent] = useState(false);
  const [acknowledgedOnchainRecord, setAcknowledgedOnchainRecord] =
    useState(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const voteGroupName = useId();
  const reasonCheck = validateDaoModerationReason(reason);
  const transactionBusy = [
    "simulating",
    "signing",
    "submitted",
    "mining",
  ].includes(txState.status);
  const actionLocked = transactionBusy || pendingAction !== null;

  const openDialog = (
    action: Exclude<DialogAction, null>,
    trigger: HTMLElement
  ) => {
    restoreFocusRef.current = trigger;
    setReason("");
    setAcknowledgedContent(false);
    setAcknowledgedOnchainRecord(false);
    setDialogAction(action);
  };
  const closeDialog = () => setDialogAction(null);

  const submitDialog = () => {
    const action = dialogAction;
    if (!action) return;
    closeDialog();
    if (action === "vote" && direction) {
      void onVote(direction);
    } else if (action === "retract") {
      void onRetract();
    } else if (action === "flag" && !reasonCheck.error) {
      void onFlag(reasonCheck.value);
    } else if (action === "veto" && !reasonCheck.error) {
      void onVeto(reasonCheck.value);
    } else if (action === "execute") {
      void onExecute();
    }
  };

  return (
    <Card className="min-w-0 space-y-5" aria-label={daoCopy.actions.title}>
      <div className="space-y-2">
        <h3 className="text-balance text-xl font-bold">
          {daoCopy.actions.title}
        </h3>
        <p className="text-pretty text-sm leading-6 text-text-secondary">
          {daoCopy.actions.description}
        </p>
      </div>

      <TransactionNotice
        activeAction={activeAction}
        pendingAction={pendingAction}
        state={txState}
      />

      {accountLoading ? (
        <p role="status" className="text-pretty text-sm text-text-secondary">
          {daoCopy.actions.loading}
        </p>
      ) : accountError ? (
        <p
          role="alert"
          className="text-pretty text-sm font-bold text-error-700 dark:text-red-300"
        >
          {daoCopy.actions.unavailable}
        </p>
      ) : (
        <>
          <VoteAction
            account={account}
            actionLocked={actionLocked}
            direction={direction}
            groupName={voteGroupName}
            onReview={(trigger) => openDialog("vote", trigger)}
            onSelect={setDirection}
          />

          {account ? (
            <ExecuteAction
              account={account}
              actionLocked={actionLocked}
              onReview={(trigger) => openDialog("execute", trigger)}
              proposal={proposal}
            />
          ) : null}

          {account ? (
            <LifecycleActions
              account={account}
              actionLocked={actionLocked}
              onReview={openDialog}
            />
          ) : null}
        </>
      )}

      <ActionConfirmationDialog
        account={account}
        acknowledgedContent={acknowledgedContent}
        acknowledgedOnchainRecord={acknowledgedOnchainRecord}
        action={dialogAction}
        direction={direction}
        executionGuard={executionGuard}
        onAcknowledgedContent={setAcknowledgedContent}
        onAcknowledgedOnchainRecord={setAcknowledgedOnchainRecord}
        onClose={closeDialog}
        onConfirm={submitDialog}
        onReason={setReason}
        proposal={proposal}
        reason={reason}
        reasonCheck={reasonCheck}
        returnFocusRef={restoreFocusRef}
      />
    </Card>
  );
}

function VoteAction({
  account,
  actionLocked,
  direction,
  groupName,
  onReview,
  onSelect,
}: {
  account: DaoAccountProposalState | null;
  actionLocked: boolean;
  direction: DaoVoteDirection | null;
  groupName: string;
  onReview: (trigger: HTMLElement) => void;
  onSelect: (direction: DaoVoteDirection) => void;
}) {
  const capabilities = account?.capabilities;
  const canVote = capabilities?.canVote === true;
  const blockedReason =
    capabilities?.voteBlockedReason ?? "Connect a wallet to continue.";

  return (
    <section className="space-y-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-balance text-base font-bold">
          {daoCopy.actions.voteTitle}
        </h4>
        {canVote ? (
          <Badge
            variant="brand"
            className="font-sans dark:bg-yearn-blue dark:text-white"
          >
            {capabilities.votePurpose === "participation_only"
              ? daoCopy.actions.participationLabel
              : daoCopy.actions.decisionLabel}
          </Badge>
        ) : null}
      </div>

      {capabilities?.votePurpose === "participation_only" ? (
        <p className="rounded-box bg-blue-50 p-3 text-pretty text-sm leading-6 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100">
          {daoCopy.actions.participationNotice}
        </p>
      ) : null}

      {account ? <VotingWeight account={account} /> : null}

      {canVote ? (
        <>
          <fieldset disabled={actionLocked} className="space-y-2">
            <legend className="text-pretty text-xs font-bold text-text-secondary">
              {daoCopy.actions.chooseDirection}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["yea", "nay"] as const).map((choice) => (
                <label
                  key={choice}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-box border px-3 text-sm font-bold transition-[background-color,border-color,color,scale] duration-150 ease-out focus-within:ring-2 focus-within:ring-text-primary focus-within:ring-offset-2 focus-within:ring-offset-surface active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
                    direction === choice
                      ? "border-yearn-blue bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100"
                      : "border-border bg-surface hover:bg-surface-secondary",
                    actionLocked && "cursor-not-allowed opacity-50"
                  )}
                >
                  <input
                    type="radio"
                    className="size-4 accent-yearn-blue"
                    name={groupName}
                    value={choice}
                    checked={direction === choice}
                    onChange={() => onSelect(choice)}
                  />
                  <span>
                    {choice === "yea" ? daoCopy.actions.yea : daoCopy.actions.nay}
                  </span>
                  {direction === choice ? (
                    <span className="sr-only">{daoCopy.actions.selected}</span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            className="w-full motion-reduce:transition-none motion-reduce:active:scale-100"
            disabled={direction === null || actionLocked}
            onClick={(event) => onReview(event.currentTarget)}
          >
            {daoCopy.actions.reviewVote}
          </Button>
        </>
      ) : (
        <div className="space-y-1 rounded-box bg-surface-secondary/60 p-3">
          {account?.hasVoted && account.voteDirection ? (
            <p className="text-pretty text-sm font-bold">
              {daoCopy.actions.alreadyVoted(
                account.voteDirection === "yea"
                  ? daoCopy.actions.yea
                  : daoCopy.actions.nay
              )}
            </p>
          ) : null}
          <p className="text-pretty text-sm leading-6 text-text-secondary">
            {blockedReason}
          </p>
        </div>
      )}
    </section>
  );
}

function VotingWeight({ account }: { account: DaoAccountProposalState }) {
  const decayed = account.decayBps < 10_000;
  return (
    <dl className={cn("grid gap-3", decayed ? "grid-cols-2" : "grid-cols-1")}>
      {decayed ? (
        <ActionFact
          label={daoCopy.actions.originalWeight}
          value={formatTokenAmount(account.votingWeight, 18, 2)}
        />
      ) : null}
      <ActionFact
        label={
          decayed
            ? daoCopy.actions.effectiveWeight
            : daoCopy.actions.votingWeight
        }
        value={formatTokenAmount(account.effectiveVotingWeight, 18, 2)}
      />
      {decayed ? (
        <p className="col-span-2 text-pretty font-number text-xs tabular-nums text-text-secondary">
          {daoCopy.actions.decayRemaining(formatBasisPoints(account.decayBps))}
        </p>
      ) : null}
    </dl>
  );
}

function ExecuteAction({
  account,
  actionLocked,
  onReview,
  proposal,
}: {
  account: DaoAccountProposalState;
  actionLocked: boolean;
  onReview: (trigger: HTMLElement) => void;
  proposal: DaoProposal;
}) {
  if (proposal.type === "signal") return null;
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <Button
        className="w-full motion-reduce:transition-none motion-reduce:active:scale-100"
        disabled={!account.capabilities.canExecute || actionLocked}
        onClick={(event) => onReview(event.currentTarget)}
      >
        {daoCopy.actions.execute}
      </Button>
      {!account.capabilities.canExecute ? (
        <p className="text-pretty text-sm leading-6 text-text-secondary">
          {account.capabilities.executeBlockedReason}
        </p>
      ) : null}
    </section>
  );
}

function LifecycleActions({
  account,
  actionLocked,
  onReview,
}: {
  account: DaoAccountProposalState;
  actionLocked: boolean;
  onReview: (action: Exclude<DialogAction, null>, trigger: HTMLElement) => void;
}) {
  const rows = [
    account.isProposer
      ? {
          action: "retract" as const,
          label: daoCopy.actions.retract,
          enabled: account.capabilities.canRetract,
          reason: account.capabilities.retractBlockedReason,
        }
      : null,
    account.isOperator
      ? {
          action: "flag" as const,
          label: daoCopy.actions.flag,
          enabled: account.capabilities.canFlag,
          reason: account.capabilities.flagBlockedReason,
        }
      : null,
    account.isGuardian
      ? {
          action: "veto" as const,
          label: daoCopy.actions.veto,
          enabled: account.capabilities.canVeto,
          reason: account.capabilities.vetoBlockedReason,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return null;
  return (
    <details className="group border-t border-border pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded py-2 text-sm font-bold transition-[color] duration-150 ease-out hover:text-yearn-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary motion-reduce:transition-none dark:hover:text-blue-300 [&::-webkit-details-marker]:hidden">
        <span>{daoCopy.actions.lifecycleTitle}</span>
        <span
          aria-hidden="true"
          className="text-lg transition-transform duration-150 ease-out group-open:rotate-45 motion-reduce:transition-none"
        >
          +
        </span>
      </summary>
      <div className="space-y-3 pb-2 pt-2">
        <p className="text-pretty text-xs leading-5 text-text-secondary">
          {daoCopy.actions.lifecycleDescription}
        </p>
        {rows.map((row) => (
          <div key={row.action} className="space-y-1">
            <Button
              size="sm"
              variant="secondary"
              className="w-full motion-reduce:transition-none motion-reduce:active:scale-100"
              disabled={!row.enabled || actionLocked}
              onClick={(event) => onReview(row.action, event.currentTarget)}
            >
              {row.label}
            </Button>
            {!row.enabled ? (
              <p className="text-pretty text-xs leading-5 text-text-secondary">
                {row.reason}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function ActionConfirmationDialog({
  account,
  acknowledgedContent,
  acknowledgedOnchainRecord,
  action,
  direction,
  executionGuard,
  onAcknowledgedContent,
  onAcknowledgedOnchainRecord,
  onClose,
  onConfirm,
  onReason,
  proposal,
  reason,
  reasonCheck,
  returnFocusRef,
}: {
  account: DaoAccountProposalState | null;
  acknowledgedContent: boolean;
  acknowledgedOnchainRecord: boolean;
  action: DialogAction;
  direction: DaoVoteDirection | null;
  executionGuard: DaoExecutionGuard;
  onAcknowledgedContent: (checked: boolean) => void;
  onAcknowledgedOnchainRecord: (checked: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
  onReason: (reason: string) => void;
  proposal: DaoProposal;
  reason: string;
  reasonCheck: ReturnType<typeof validateDaoModerationReason>;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  if (!action || !account) return null;
  const title = dialogTitle(action);
  const isReasonAction = action === "flag" || action === "veto";
  const contentConfirmationRequired =
    action === "vote" && proposal.content.state !== "available";
  const invalidContentConfirmationRequired =
    action === "vote" && proposal.content.state === "invalid";
  const confirmationBlocked =
    (action === "vote" && direction === null) ||
    (isReasonAction && reasonCheck.error !== null) ||
    (contentConfirmationRequired && !acknowledgedContent) ||
    (invalidContentConfirmationRequired && !acknowledgedOnchainRecord);

  return (
    <AccessibleDialog
      description={dialogDescription(action)}
      onClose={onClose}
      open
      returnFocusRef={returnFocusRef}
      title={title}
    >
      <div className="space-y-5">
        {action === "vote" && direction ? (
          <VoteConfirmation
            account={account}
            acknowledgedContent={acknowledgedContent}
            acknowledgedOnchainRecord={acknowledgedOnchainRecord}
            direction={direction}
            onAcknowledgedContent={onAcknowledgedContent}
            onAcknowledgedOnchainRecord={onAcknowledgedOnchainRecord}
            proposal={proposal}
          />
        ) : null}
        {action === "retract" ? (
          <ConfirmationCopy>{daoCopy.actions.retractEffect}</ConfirmationCopy>
        ) : null}
        {action === "flag" ? (
          <>
            <ConfirmationCopy>{daoCopy.actions.flagEffect}</ConfirmationCopy>
            <ReasonField
              onChange={onReason}
              reason={reason}
              reasonCheck={reasonCheck}
            />
          </>
        ) : null}
        {action === "veto" ? (
          <>
            <ConfirmationCopy>
              {proposal.totalWeight === 0n
                ? daoCopy.actions.earlyVetoEffect
                : proposal.protocolStatus === "voting"
                  ? daoCopy.actions.postVoteVetoEffect
                  : daoCopy.actions.postVoteVetoClosedEffect}
            </ConfirmationCopy>
            <ReasonField
              onChange={onReason}
              reason={reason}
              reasonCheck={reasonCheck}
            />
          </>
        ) : null}
        {action === "execute" ? (
          <ExecuteConfirmation
            account={account}
            executionGuard={executionGuard}
            proposal={proposal}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-5">
          <Button
            variant="secondary"
            className="motion-reduce:transition-none motion-reduce:active:scale-100"
            onClick={onClose}
          >
            {daoCopy.actions.cancel}
          </Button>
          <Button
            data-autofocus
            className="motion-reduce:transition-none motion-reduce:active:scale-100"
            disabled={confirmationBlocked}
            onClick={onConfirm}
          >
            {confirmLabel(action, direction)}
          </Button>
        </div>
      </div>
    </AccessibleDialog>
  );
}

function VoteConfirmation({
  account,
  acknowledgedContent,
  acknowledgedOnchainRecord,
  direction,
  onAcknowledgedContent,
  onAcknowledgedOnchainRecord,
  proposal,
}: {
  account: DaoAccountProposalState;
  acknowledgedContent: boolean;
  acknowledgedOnchainRecord: boolean;
  direction: DaoVoteDirection;
  onAcknowledgedContent: (checked: boolean) => void;
  onAcknowledgedOnchainRecord: (checked: boolean) => void;
  proposal: DaoProposal;
}) {
  const content = proposal.content.value;
  const parsedContent = content ? parseDaoProposalContent(content) : null;
  const title =
    parsedContent?.title ?? `Proposal #${proposal.ref.proposalId.toString()}`;
  const decayed = account.decayBps < 10_000;
  return (
    <div className="space-y-5">
      {proposal.content.state !== "available" ? (
        <div
          role="alert"
          className="space-y-1 rounded-box bg-red-50 p-3 text-red-950 dark:bg-red-950/40 dark:text-red-100"
        >
          <p className="text-pretty text-sm font-bold">
            {proposal.content.state === "invalid"
              ? daoCopy.actions.contentWarningInvalid
              : daoCopy.actions.contentWarningUnavailable}
          </p>
          {proposal.content.error ? (
            <p className="break-words font-number text-xs [overflow-wrap:anywhere]">
              {proposal.content.error}
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="grid gap-4 rounded-box bg-surface-secondary/60 p-4 sm:grid-cols-2">
        <ActionFact
          label={daoCopy.actions.voteDirection}
          value={direction === "yea" ? daoCopy.actions.yea : daoCopy.actions.nay}
        />
        <ActionFact label={daoCopy.actions.proposal} value={title} />
        {decayed ? (
          <ActionFact
            label={daoCopy.actions.originalWeight}
            value={formatTokenAmount(account.votingWeight, 18, 2)}
          />
        ) : null}
        <ActionFact
          label={daoCopy.actions.effectiveWeight}
          value={formatTokenAmount(account.effectiveVotingWeight, 18, 2)}
        />
        {decayed ? (
          <ActionFact
            label={daoCopy.actions.decay}
            value={daoCopy.actions.decayRemaining(
              formatBasisPoints(account.decayBps)
            )}
          />
        ) : null}
      </dl>
      <ConfirmationCopy>{daoCopy.actions.irreversibility}</ConfirmationCopy>

      {proposal.content.state !== "available" ? (
        <div className="space-y-2">
          <Acknowledgement
            checked={acknowledgedContent}
            label={
              proposal.content.state === "invalid"
                ? daoCopy.actions.invalidAcknowledgement
                : daoCopy.actions.unavailableAcknowledgement
            }
            onChange={onAcknowledgedContent}
          />
          {proposal.content.state === "invalid" ? (
            <Acknowledgement
              checked={acknowledgedOnchainRecord}
              label={daoCopy.actions.onchainAcknowledgement}
              onChange={onAcknowledgedOnchainRecord}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ExecuteConfirmation({
  account,
  executionGuard,
  proposal,
}: {
  account: DaoAccountProposalState;
  executionGuard: DaoExecutionGuard;
  proposal: DaoProposal;
}) {
  const preflight = account.executionPreflight;
  return (
    <div className="space-y-5">
      <ConfirmationCopy>{daoCopy.actions.executeEffect}</ConfirmationCopy>
      <dl className="grid gap-4 rounded-box bg-surface-secondary/60 p-4">
        <ActionFact
          label={daoCopy.actions.currentSimulation}
          value={daoCopy.actions.simulationSucceeded}
        />
        {preflight.blockNumber !== null ? (
          <ActionFact
            label={daoCopy.actions.simulationReference}
            value={daoCopy.actions.simulationBlock(
              preflight.blockNumber.toString()
            )}
          />
        ) : null}
        <ActionFact
          label={daoCopy.actions.scriptHash}
          value={proposal.script.hash}
        />
      </dl>
      <ConfirmationCopy>
        {executionGuard === "permissionless"
          ? daoCopy.actions.guardPermissionless
          : daoCopy.actions.guardOperator}
      </ConfirmationCopy>
    </div>
  );
}

function ReasonField({
  onChange,
  reason,
  reasonCheck,
}: {
  onChange: (reason: string) => void;
  reason: string;
  reasonCheck: ReturnType<typeof validateDaoModerationReason>;
}) {
  const descriptionId = useId();
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold" htmlFor={`${descriptionId}-field`}>
        {daoCopy.actions.reason}
      </label>
      <textarea
        id={`${descriptionId}-field`}
        aria-describedby={descriptionId}
        aria-invalid={reasonCheck.error !== null}
        className="min-h-28 w-full resize-y rounded-box border border-border bg-app px-3 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-text-primary focus:ring-offset-2 focus:ring-offset-surface"
        onChange={(event) => onChange(event.target.value)}
        placeholder={daoCopy.actions.reasonPlaceholder}
        required
        value={reason}
      />
      <div
        id={descriptionId}
        className="flex flex-wrap justify-between gap-2 text-xs"
      >
        <span
          className={cn(
            reasonCheck.error
              ? "font-bold text-error-700 dark:text-red-300"
              : "text-text-secondary"
          )}
        >
          {reasonCheck.error ?? ""}
        </span>
        <span className="font-number tabular-nums text-text-secondary">
          {daoCopy.actions.reasonBytes(reasonCheck.bytes)}
        </span>
      </div>
    </div>
  );
}

function TransactionNotice({
  activeAction,
  pendingAction,
  state,
}: {
  activeAction: DaoActionType | null;
  pendingAction: DaoPendingAction | null;
  state: TxState;
}) {
  if (pendingAction) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="space-y-1 rounded-box bg-blue-50 p-3 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100"
      >
        <p className="text-pretty text-sm font-bold">
          {daoCopy.actions.transaction.awaitingIndex}
        </p>
        <p className="text-pretty text-xs leading-5">
          {daoCopy.actions.transaction.awaitingIndexBody}
        </p>
      </div>
    );
  }
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <div role="alert" className="space-y-1 rounded-box bg-red-50 p-3 text-red-950 dark:bg-red-950/40 dark:text-red-100">
        <p className="text-pretty text-sm font-bold">
          {daoCopy.actions.transaction.failed}
        </p>
        <p className="text-pretty text-xs leading-5">
          {state.errorMessage ?? daoCopy.actions.unavailable}
        </p>
      </div>
    );
  }
  const message =
    state.status === "simulating"
      ? daoCopy.actions.transaction.checking
      : state.status === "signing"
        ? daoCopy.actions.transaction.signing
        : state.status === "submitted" || state.status === "mining"
          ? daoCopy.actions.transaction.pending
          : daoCopy.actions.transaction.confirmed;
  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-box bg-surface-secondary/60 p-3 text-pretty text-sm font-bold"
    >
      {message}
      {activeAction ? <span className="sr-only"> · {activeAction}</span> : null}
    </p>
  );
}

function AccessibleDialog({
  children,
  description,
  onClose,
  open,
  returnFocusRef,
  title,
}: {
  children: ReactNode;
  description: string;
  onClose: () => void;
  open: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  title: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnFocus = returnFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>(
        "[data-autofocus]:not(:disabled), button:not(:disabled), input:not(:disabled), textarea:not(:disabled)"
      );
      target?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => returnFocus?.focus(), 0);
    };
  }, [open, returnFocusRef]);

  if (!open) return null;
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"
      ) ?? []
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-box bg-surface p-5 shadow-xl sm:p-6"
        onKeyDown={trapFocus}
      >
        <div className="mb-5 space-y-2 pr-8">
          <h2 id={titleId} className="text-balance text-xl font-bold">
            {title}
          </h2>
          <p
            id={descriptionId}
            className="text-pretty text-sm leading-6 text-text-secondary"
          >
            {description}
          </p>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ActionFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-pretty text-xs font-bold text-text-secondary">
        {label}
      </dt>
      <dd className="break-words font-number text-sm font-bold tabular-nums [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function Acknowledgement({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-box border border-border p-3 text-pretty text-sm leading-6 focus-within:ring-2 focus-within:ring-text-primary">
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-yearn-blue"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function ConfirmationCopy({ children }: { children: ReactNode }) {
  return (
    <p className="text-pretty text-sm leading-6 text-text-secondary">
      {children}
    </p>
  );
}

function formatBasisPoints(bps: number): string {
  const whole = Math.floor(bps / 100);
  const remainder = bps % 100;
  return `${whole}${remainder === 0 ? "" : `.${remainder.toString().padStart(2, "0")}`}%`;
}

function dialogTitle(action: Exclude<DialogAction, null>): string {
  if (action === "vote") return daoCopy.actions.voteDialogTitle;
  if (action === "retract") return daoCopy.actions.retractDialogTitle;
  if (action === "flag") return daoCopy.actions.flagDialogTitle;
  if (action === "veto") return daoCopy.actions.vetoDialogTitle;
  return daoCopy.actions.executeDialogTitle;
}

function dialogDescription(action: Exclude<DialogAction, null>): string {
  if (action === "vote") return daoCopy.actions.voteDialogDescription;
  if (action === "retract") return daoCopy.actions.retractDialogDescription;
  if (action === "flag") return daoCopy.actions.flagDialogDescription;
  if (action === "veto") return daoCopy.actions.vetoDialogDescription;
  return daoCopy.actions.executeDialogDescription;
}

function confirmLabel(
  action: Exclude<DialogAction, null>,
  direction: DaoVoteDirection | null
): string {
  if (action === "vote") {
    return daoCopy.actions.submitVote(
      direction === "yea" ? daoCopy.actions.yea : daoCopy.actions.nay
    );
  }
  if (action === "retract") return daoCopy.actions.confirmRetract;
  if (action === "flag") return daoCopy.actions.confirmFlag;
  if (action === "veto") return daoCopy.actions.confirmVeto;
  return daoCopy.actions.confirmExecute;
}
