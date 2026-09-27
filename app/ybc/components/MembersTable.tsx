"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { usePersistentViewToggle } from "@/components/ui/usePersistentViewToggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import type { YbcMemberRecord, YbcRosterRecord } from "@/lib/clients/ybc";
import { formatUtcDate } from "@/lib/date";
import { formatDecimalAmount, formatPercent } from "@/lib/format";
import {
  getYbcIdentity,
  type YbcIdentityMap,
} from "../identity";
import type { YbcMemberAliases } from "../memberAliases";
import type { YbcMemberAliasMutationResult } from "../useYbcMemberAliases";
import { MemberIdentity } from "./MemberIdentity";
import { ybcCopy as copy } from "../messages";

type MembersTableProps = {
  aliases: YbcMemberAliases;
  identities: YbcIdentityMap;
  roster: YbcRosterRecord;
  currentAddress?: string | null;
  onClearAliases: () => YbcMemberAliasMutationResult;
  onResetAlias: (address: string) => YbcMemberAliasMutationResult;
  onSetAlias: (
    address: string,
    alias: string
  ) => YbcMemberAliasMutationResult;
};

const MEMBERS_VIEW_STORAGE_KEY = "yearn.ybc.members.view";

export function MembersTable({
  aliases,
  identities,
  roster,
  currentAddress,
  onClearAliases,
  onResetAlias,
  onSetAlias,
}: MembersTableProps) {
  const [viewMode, setViewMode] = usePersistentViewToggle(
    MEMBERS_VIEW_STORAGE_KEY,
    "audit"
  );
  const [aliasControlError, setAliasControlError] = useState<string | null>(
    null
  );
  const hasAliases = Object.keys(aliases).length > 0;

  return (
    <section id="members" className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-balance text-3xl font-bold">{copy.members.title}</h2>
        <p className="max-w-3xl text-pretty text-sm leading-6 text-text-secondary md:text-base">
          {copy.members.description}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TotalCard
          label={copy.members.totals.rawStaked}
          value={`${formatDecimalAmount(roster.totals.rawStaked, 2)} YFI`}
        />
        <TotalCard
          label={copy.members.totals.effectiveWeight}
          value={`${formatDecimalAmount(roster.totals.effectiveWeight, 2)} weight`}
        />
        <TotalCard
          label={copy.members.totals.targetWeight}
          value={`${formatDecimalAmount(roster.totals.targetWeight, 2)} weight`}
        />
        <TotalCard
          label={copy.members.totals.rampingMembers}
          value={roster.totals.rampingMemberCount.toLocaleString("en-US")}
        />
      </div>

      {roster.members.length === 0 ? (
        <Card className="space-y-3">
          <h3 className="text-xl font-bold">{copy.members.states.emptyTitle}</h3>
          <p className="max-w-2xl text-sm leading-6 text-text-secondary">
            {copy.members.states.emptyBody}
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasAliases ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const result = onClearAliases();
                  setAliasControlError(
                    result === "saved" ? null : copy.members.alias.storageError
                  );
                }}
              >
                {copy.members.alias.clearAll}
              </Button>
            ) : null}
            <ViewToggle
              aria-label="YBC roster view"
              value={viewMode}
              onChange={setViewMode}
            />
          </div>
          {aliasControlError ? (
            <p
              className="rounded-box border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
              role="alert"
            >
              {aliasControlError}
            </p>
          ) : null}
          {viewMode === "visual" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {roster.members.map((member) => (
                <MemberCard
                  key={member.address}
                  alias={aliases[member.address.toLowerCase()]}
                  identity={getYbcIdentity(identities, member.address)}
                  member={member}
                  onResetAlias={onResetAlias}
                  onSetAlias={onSetAlias}
                  isCurrentMember={
                    !!currentAddress &&
                    currentAddress.toLowerCase() === member.address.toLowerCase()
                  }
                />
              ))}
            </div>
          ) : (
            <MembersAuditTable
              aliases={aliases}
              identities={identities}
              roster={roster}
              currentAddress={currentAddress}
              onResetAlias={onResetAlias}
              onSetAlias={onSetAlias}
            />
          )}
        </>
      )}
    </section>
  );
}

export function MembersTableSkeleton() {
  return (
    <section id="members" className="container mx-auto space-y-6 px-4 py-10 md:px-6 md:py-14">
      <div className="space-y-3">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-16 w-full max-w-3xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Card className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </Card>
    </section>
  );
}

function MemberRow({
  alias,
  identity,
  member,
  isCurrentMember,
  onResetAlias,
  onSetAlias,
}: {
  alias?: string;
  identity: ReturnType<typeof getYbcIdentity>;
  member: YbcMemberRecord;
  isCurrentMember: boolean;
  onResetAlias: (address: string) => YbcMemberAliasMutationResult;
  onSetAlias: (
    address: string,
    alias: string
  ) => YbcMemberAliasMutationResult;
}) {
  const maturityPercent = member.weight.maturityBps / 100;

  return (
    <TableRow className={isCurrentMember ? "bg-yearn-blue/[0.04]" : undefined}>
      <TableCell>
        <MemberIdentity
          alias={alias}
          identity={identity}
          isCurrentMember={isCurrentMember}
          onResetAlias={onResetAlias}
          onSetAlias={onSetAlias}
        />
      </TableCell>
      <TableCell>
        <Badge variant={statusVariantMap[member.status]}>
          {statusLabelMap[member.status]}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-number font-bold">
        {formatDecimalAmount(member.weight.rawStaked, 2)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-number font-bold">
        {formatDecimalAmount(member.weight.effectiveWeight, 2)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-number font-bold">
        {formatDecimalAmount(member.weight.targetWeight, 2)}
      </TableCell>
      <TableCell>
        <div className="min-w-40 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase text-text-tertiary">
              {formatPercent(member.weight.maturityBps / 10_000, 0)}
            </span>
            <span className="text-xs text-text-secondary">
              {getMaturityLabel(member)}
            </span>
          </div>
          <ProgressBar value={maturityPercent} className="h-2.5 bg-surface-secondary" />
        </div>
      </TableCell>
    </TableRow>
  );
}

function MemberCard({
  alias,
  identity,
  member,
  isCurrentMember,
  onResetAlias,
  onSetAlias,
}: {
  alias?: string;
  identity: ReturnType<typeof getYbcIdentity>;
  member: YbcMemberRecord;
  isCurrentMember: boolean;
  onResetAlias: (address: string) => YbcMemberAliasMutationResult;
  onSetAlias: (
    address: string,
    alias: string
  ) => YbcMemberAliasMutationResult;
}) {
  const maturityPercent = member.weight.maturityBps / 100;

  return (
    <Card
      variant="default"
      className="flex min-h-[24rem] flex-col gap-5 bg-surface shadow-sm"
      data-state={isCurrentMember ? "current" : undefined}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <MemberIdentity
          alias={alias}
          identity={identity}
          isCurrentMember={isCurrentMember}
          onResetAlias={onResetAlias}
          onSetAlias={onSetAlias}
        />
        <Badge className="shrink-0" variant={statusVariantMap[member.status]}>
          {statusLabelMap[member.status]}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
        <MaturityRing value={maturityPercent} label={getMaturityLabel(member)} />
        <dl className="grid gap-3">
          <MemberMetric
            label={copy.members.columns.rawStaked}
            value={`${formatDecimalAmount(member.weight.rawStaked, 2)} YFI`}
          />
          <MemberMetric
            label={copy.members.columns.effectiveWeight}
            value={`${formatDecimalAmount(member.weight.effectiveWeight, 2)} weight`}
          />
          <MemberMetric
            label={copy.members.columns.targetWeight}
            value={`${formatDecimalAmount(member.weight.targetWeight, 2)} weight`}
          />
        </dl>
      </div>

    </Card>
  );
}

function MembersAuditTable({
  aliases,
  identities,
  roster,
  currentAddress,
  onResetAlias,
  onSetAlias,
}: {
  aliases: YbcMemberAliases;
  identities: YbcIdentityMap;
  roster: YbcRosterRecord;
  currentAddress?: string | null;
  onResetAlias: (address: string) => YbcMemberAliasMutationResult;
  onSetAlias: (
    address: string,
    alias: string
  ) => YbcMemberAliasMutationResult;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{copy.members.columns.member}</TableHead>
            <TableHead>{copy.members.columns.status}</TableHead>
            <TableHead className="text-right">{copy.members.columns.rawStaked}</TableHead>
            <TableHead className="text-right">
              {copy.members.columns.effectiveWeight}
            </TableHead>
            <TableHead className="text-right">{copy.members.columns.targetWeight}</TableHead>
            <TableHead>{copy.members.columns.maturity}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.members.map((member) => (
            <MemberRow
              key={member.address}
              alias={aliases[member.address.toLowerCase()]}
              identity={getYbcIdentity(identities, member.address)}
              member={member}
              onResetAlias={onResetAlias}
              onSetAlias={onSetAlias}
              isCurrentMember={
                !!currentAddress &&
                currentAddress.toLowerCase() === member.address.toLowerCase()
              }
            />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function MaturityRing({ value, label }: { value: number; label: string }) {
  const clampedValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className="grid justify-items-center gap-2">
      <div
        className="grid size-24 place-items-center rounded-full"
        style={{
          background: `conic-gradient(rgb(6 87 249) ${clampedValue}%, rgb(229 231 235) 0)`,
        }}
        aria-label={`${copy.members.columns.maturity}: ${label}`}
      >
        <div className="grid size-16 place-items-center rounded-full bg-surface">
          <span className="font-number text-base font-bold text-text-primary">
            {formatPercent(clampedValue / 100, 0)}
          </span>
        </div>
      </div>
      <p className="text-center text-xs leading-5 text-text-secondary">{label}</p>
    </div>
  );
}

function MemberMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box border border-border bg-app px-3 py-2">
      <dt className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-words font-number text-sm font-bold text-text-primary [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-surface">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase text-text-tertiary">{label}</p>
        <p className="min-w-0 break-words font-number text-xl font-bold text-text-primary [overflow-wrap:anywhere] sm:text-2xl">
          {value}
        </p>
      </div>
    </Card>
  );
}

function getMaturityLabel(member: YbcMemberRecord) {
  if (member.weight.maturesAt) {
    return `${copy.members.states.maturesOn} ${formatUtcDate(
      member.weight.maturesAt
    )} UTC`;
  }

  return member.weight.maturityBps >= 10_000
    ? copy.members.states.fullyMatured
    : copy.members.states.ramping;
}

const statusVariantMap = {
  active: "success",
  ramping: "warning",
  "pending-removal": "error",
  removed: "neutral",
} as const;

const statusLabelMap = {
  active: copy.members.states.active,
  ramping: copy.members.states.ramping,
  "pending-removal": copy.members.states.pendingRemoval,
  removed: copy.members.states.removed,
} as const;
