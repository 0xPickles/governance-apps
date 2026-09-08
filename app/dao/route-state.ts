import type { DaoProposalRef } from "@/lib/clients/dao/types";
import type { DaoDisplayGroup } from "@/lib/clients/dao";
import { resolveGovernanceAppPathHref } from "@/lib/governance-links";

export const DAO_BOARD_GROUPS = ["upcoming", "active", "closed"] as const;

export type DaoBoardGroupCounts = Record<DaoDisplayGroup, number>;

const daoBoardGroupSet = new Set<string>(DAO_BOARD_GROUPS);

export function isDaoDisplayGroup(
  value: string | null | undefined
): value is DaoDisplayGroup {
  return typeof value === "string" && daoBoardGroupSet.has(value);
}

export function parseDaoBoardGroup(
  href: string,
  counts: DaoBoardGroupCounts
): DaoDisplayGroup {
  const requestedGroup = new URL(
    href,
    "https://dao.yearn.fi"
  ).searchParams.get("group");

  if (isDaoDisplayGroup(requestedGroup)) return requestedGroup;
  if (counts.active > 0) return "active";
  if (counts.upcoming > 0) return "upcoming";
  if (counts.closed > 0) return "closed";
  return "active";
}

export function createDaoBoardGroupHref(
  currentHref: string,
  group: DaoDisplayGroup,
  hostname?: string | null
) {
  const currentUrl = new URL(currentHref, "http://localhost");
  const resolvedHostname =
    hostname ?? (/^[a-z][a-z\d+.-]*:\/\//i.test(currentHref) ? currentUrl.host : null);
  const boardHref = resolveGovernanceAppPathHref(
    "dao",
    "/",
    resolvedHostname
  );
  const boardUrl = new URL(boardHref, currentUrl.origin);
  boardUrl.search = currentUrl.search;
  boardUrl.searchParams.set("group", group);
  boardUrl.hash = "";

  return boardHref.startsWith("http")
    ? boardUrl.toString()
    : `${boardUrl.pathname}${boardUrl.search}`;
}

export function createDaoProposalHref(
  proposalId: bigint | string,
  origin: DaoDisplayGroup,
  hostname?: string | null,
  ref?: DaoProposalRef
) {
  const search = new URLSearchParams({ from: origin });
  if (ref) { search.set("chain", String(ref.chainId)); search.set("voting", ref.votingAddress); }
  return resolveGovernanceAppPathHref(
    "dao",
    `/proposals/${proposalId.toString()}?${search.toString()}`,
    hostname
  );
}

export function createDaoRootHref(hostname?: string | null) {
  return resolveGovernanceAppPathHref("dao", "/", hostname);
}

export function createDaoProposeHref(hostname?: string | null) {
  return resolveGovernanceAppPathHref("dao", "/propose", hostname);
}

export function resolveDaoProposalOrigin(
  requestedOrigin: string | null | undefined,
  proposalGroup: DaoDisplayGroup
) {
  return isDaoDisplayGroup(requestedOrigin) ? requestedOrigin : proposalGroup;
}
