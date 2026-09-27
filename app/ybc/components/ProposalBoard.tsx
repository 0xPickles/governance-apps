"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { isAddress } from "viem";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import type {
  YbcMockDataV1,
  YbcProposalRecord,
  YbcProposalType,
  YbcVoteChoice,
} from "@/lib/clients/ybc";
import { formatDecimalAmount, formatPercent } from "@/lib/format";
import type { TxState } from "@/lib/tx/types";
import {
  getYbcIdentity,
  type YbcIdentityMap,
} from "../identity";
import { MemberIdentity } from "./MemberIdentity";
import { ProposalCard } from "./ProposalCard";
import { ybcCopy as copy } from "../messages";

type ProposalBoardProps = {
  data: YbcMockDataV1;
  identities: YbcIdentityMap;
  id?: string;
  createProposal?: (
    type: YbcProposalType,
    targetAddress?: string
  ) => void | Promise<void>;
  executeProposal?: (proposalId: string) => void | Promise<void>;
  proposalTargetRequired?: boolean;
  proposalTxState?: TxState;
  resetProposalTx?: () => void;
  focusedProposalId?: string | null;
  retractProposal?: (proposalId: string) => void | Promise<void>;
  voteOnProposal?: (
    proposalId: string,
    choice: YbcVoteChoice
  ) => void | Promise<void>;
};

type ProposalAction = () => void | Promise<void>;

export function ProposalBoard({
  data,
  identities,
  id,
  createProposal,
  executeProposal,
  proposalTargetRequired = false,
  proposalTxState,
  resetProposalTx,
  focusedProposalId = null,
  retractProposal,
  voteOnProposal,
}: ProposalBoardProps) {
  const [proposalType, setProposalType] = useState<YbcProposalType>("addition");
  const [targetAddress, setTargetAddress] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const additionThresholdBps = getThresholdBps(data, "addition");
  const expulsionThresholdBps = getThresholdBps(data, "expulsion");
  const canCreateProposal = data.me.canPropose && Boolean(createProposal);
  const transactionPending = isYbcProposalTxPending(proposalTxState);
  const transactionError =
    proposalTxState?.status === "error" ? proposalTxState.errorMessage : null;
  const canSubmitProposal = canCreateProposal && !transactionPending;

  const switchProposalType = (nextType: string) => {
    if (nextType !== "addition" && nextType !== "expulsion") return;
    setProposalType(nextType);
    setTargetAddress("");
    setTargetError(null);
    setActionError(null);
    resetProposalTx?.();
  };

  const runProposalAction = (action: ProposalAction) => {
    setActionError(null);

    try {
      void Promise.resolve(action()).catch((error: unknown) => {
        setActionError(getProposalActionError(error));
      });
    } catch (error) {
      setActionError(getProposalActionError(error));
    }
  };

  const submitProposal = () => {
    if (!createProposal) return;

    if (!proposalTargetRequired) {
      runProposalAction(() => createProposal(proposalType));
      return;
    }

    const trimmedTarget = targetAddress.trim();
    if (!isAddress(trimmedTarget)) {
      setTargetError(copy.proposalBoard.targetInvalid);
      return;
    }

    setTargetError(null);
    runProposalAction(() => createProposal(proposalType, trimmedTarget));
  };

  return (
    <section id={id} className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-balance text-2xl font-bold">
          {copy.proposalBoard.title}
        </h2>
        <p className="max-w-3xl text-pretty text-sm leading-6 text-text-secondary">
          {copy.proposalBoard.description}
        </p>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-end gap-2">
            <div className="w-full max-w-xl space-y-3 rounded-box border border-border bg-app/60 p-4 sm:w-auto sm:min-w-[360px]">
              <Tabs
                activeTab={proposalType}
                onChange={switchProposalType}
                aria-label="YBC proposal type"
                tabs={[
                  { id: "addition", label: "Add member" },
                  { id: "expulsion", label: "Remove member" },
                ]}
              />
              {proposalTargetRequired ? (
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase text-text-tertiary"
                    htmlFor="ybc-proposal-target"
                  >
                    {copy.proposalBoard.targetLabel}
                  </label>
                  <input
                    id="ybc-proposal-target"
                    className="h-11 w-full rounded-box border border-border bg-surface px-3 font-number text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-text-primary focus:ring-2 focus:ring-text-primary/10"
                    value={targetAddress}
                    onChange={(event) => {
                      setTargetAddress(event.target.value);
                      if (targetError) {
                        setTargetError(null);
                      }
                      if (actionError) {
                        setActionError(null);
                      }
                    }}
                    placeholder="0x..."
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
              ) : null}
              <Button
                className="w-full"
                size="sm"
                onClick={submitProposal}
                disabled={!canSubmitProposal}
                isLoading={transactionPending}
              >
                {getProposalSubmitLabel(proposalType, canCreateProposal)}
              </Button>
              {!canCreateProposal ? (
                <p className="rounded-box border border-border bg-app px-3 py-2 text-sm leading-6 text-text-secondary">
                  {copy.proposalBoard.proposeDisabledBody}
                </p>
              ) : null}
              {targetError || actionError || transactionError ? (
                <p
                  className="rounded-box border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-900"
                  role="alert"
                >
                  {targetError ?? actionError ?? transactionError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryStat
              label={copy.proposalBoard.summary.active}
              value={String(data.proposals.summary.activeCount)}
            />
            <SummaryStat
              label={copy.proposalBoard.summary.awaitingExecution}
              value={String(data.proposals.summary.awaitingExecutionCount)}
            />
            <SummaryStat
              label={copy.proposalBoard.summary.terminal}
              value={String(data.proposals.summary.terminalCount)}
            />
          </div>

          {data.proposals.items.length > 0 ? (
            <div className="space-y-4">
              {data.proposals.items.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  defaultOpen={shouldOpenProposalByDefault(
                    proposal,
                    data.proposals.items.length
                  )}
                  proposerIdentity={getYbcIdentity(
                    identities,
                    proposal.proposer
                  )}
                  targetIdentity={getYbcIdentity(
                    identities,
                    proposal.targetAccount
                  )}
                  onRetract={
                    retractProposal
                      ? () => {
                          runProposalAction(() =>
                            retractProposal(proposal.id)
                          );
                        }
                      : undefined
                  }
                  onVote={
                    voteOnProposal
                      ? (choice) => {
                          runProposalAction(() =>
                            voteOnProposal(proposal.id, choice)
                          );
                        }
                      : undefined
                  }
                  onExecute={
                    executeProposal
                      ? () => {
                          runProposalAction(() =>
                            executeProposal(proposal.id)
                          );
                        }
                      : undefined
                  }
                  transactionPending={transactionPending}
                  focused={proposal.id === focusedProposalId}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed bg-app/40">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-text-primary">
                  {copy.proposalBoard.emptyTitle}
                </h3>
                <p className="text-sm leading-6 text-text-secondary">
                  {copy.proposalBoard.emptyBody}
                </p>
                <p className="text-sm font-medium text-text-primary">
                  {copy.proposalBoard.emptyHint}
                </p>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="bg-app/50 p-4">
            <p className="text-xs font-bold uppercase text-text-tertiary">
              {copy.proposalBoard.thresholdTitle}
            </p>
            <div className="mt-4 space-y-4">
              <ThresholdRow
                label="Add member"
                value={formatPercent(additionThresholdBps / 10_000, 0)}
              />
              <ThresholdRow
                label="Remove member"
                value={formatPercent(expulsionThresholdBps / 10_000, 0)}
              />
            </div>
          </Card>

          <Card className="bg-app/50 p-4">
            <p className="text-xs font-bold uppercase text-text-tertiary">
              {copy.proposalBoard.viewerTitle}
            </p>
            <div className="mt-4 space-y-3 text-sm text-text-secondary">
              <ViewerRow
                label="Wallet"
                value={
                  data.me.address
                    ? (
                        <MemberIdentity
                          identity={getYbcIdentity(identities, data.me.address)}
                          isCurrentMember={data.me.isMember}
                        />
                      )
                    : "Observer"
                }
              />
              <ViewerRow
                label="Effective weight"
                value={`${formatDecimalAmount(
                  data.me.weight.effectiveWeight,
                  2
                )} voting weight`}
              />
              <ViewerRow
                label="Can propose"
                value={data.me.canPropose ? "Yes" : "No"}
              />
              <ViewerRow
                label="Can vote"
                value={data.me.canVote ? "Yes" : "No"}
              />
            </div>
          </Card>

          <Card className="bg-app/50 p-4">
            <p className="text-xs font-bold uppercase text-text-tertiary">
              {copy.proposalBoard.terminalTitle}
            </p>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              {copy.proposalBoard.terminalBody}
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}

function getProposalActionError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : copy.proposalBoard.actionFailed;
}

function shouldOpenProposalByDefault(
  proposal: YbcProposalRecord,
  proposalCount: number
) {
  if (proposalCount < 3) {
    return true;
  }

  return (
    proposal.phase === "discussion" ||
    proposal.phase === "voting" ||
    proposal.phase === "awaiting-execution" ||
    proposal.actions.canRetract ||
    proposal.actions.canVote ||
    proposal.actions.canExecute
  );
}

function getThresholdBps(data: YbcMockDataV1, type: YbcProposalType): number {
  if (type === "addition") {
    return (
      data.admin?.thresholds.additionBps ??
      data.proposals.items.find((proposal) => proposal.type === "addition")
        ?.thresholdBps ??
      5000
    );
  }

  return (
    data.admin?.thresholds.expulsionBps ??
    data.proposals.items.find((proposal) => proposal.type === "expulsion")
      ?.thresholdBps ??
    6000
  );
}

function getProposalSubmitLabel(
  type: YbcProposalType,
  canCreateProposal: boolean
) {
  if (type === "addition") {
    return canCreateProposal
      ? copy.proposalBoard.proposeAdditionCta
      : copy.proposalBoard.proposeAdditionDisabledCta;
  }

  return canCreateProposal
    ? copy.proposalBoard.proposeExpulsionCta
    : copy.proposalBoard.proposeExpulsionDisabledCta;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box border border-border bg-app/60 p-4">
      <p className="text-xs font-bold uppercase text-text-tertiary">{label}</p>
      <p className="mt-2 min-w-0 break-words font-number text-xl font-bold text-text-primary [overflow-wrap:anywhere] sm:text-2xl">
        {value}
      </p>
    </div>
  );
}

function ThresholdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="font-number text-sm font-bold text-text-primary">{value}</span>
    </div>
  );
}

function ViewerRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 border-t border-border pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
      <span className="text-text-tertiary">{label}</span>
      <div className="min-w-0 break-words font-medium text-text-primary [overflow-wrap:anywhere] sm:text-right">
        {value}
      </div>
    </div>
  );
}

function isYbcProposalTxPending(state?: TxState) {
  return (
    state?.status === "signing" ||
    state?.status === "submitted" ||
    state?.status === "mining"
  );
}
