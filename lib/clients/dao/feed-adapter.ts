import { keccak256, type Address, type Hex } from "viem";
import { DAO_EPOCH_SECONDS, DAO_MAX_TIMESTAMP, DaoFeedError, type DaoFeedWire, type DaoProposalWire } from "@/lib/schemas/dao-feed";
import { assertDaoDeployments, type DaoDeployment } from "./deployment";
import { DAO_EMPTY_SCRIPT_HASH, deriveDaoDisplayGroup, deriveDaoDisplayStatus } from "./domain";
import { readDaoContentBytes } from "./content-bytes";
import { DAO_PINNED_VOTING_SOURCE } from "./provenance";
import { analyzeDaoScript } from "./script-analysis";
import type { DaoSnapshot, DaoProposal, DaoProtocolStatus } from "./types";

export function adaptDaoProposal(
  p: DaoProposalWire,
  snapshot: Pick<DaoFeedWire, "chainId" | "block">,
  configuration: DaoFeedWire["deployments"][number]["configuration"],
  deployment: DaoDeployment,
): DaoProposal {
  const type = p.scriptHash === DAO_EMPTY_SCRIPT_HASH ? "signal" : "executable";
  const voteEnd = BigInt(deployment.genesis) + (BigInt(p.epoch) + 1n) * BigInt(DAO_EPOCH_SECONDS);
  if (voteEnd + BigInt(DAO_EPOCH_SECONDS) > BigInt(DAO_MAX_TIMESTAMP)) throw new DaoFeedError("invalid", "Proposal timing exceeds the supported date range.");
  const voteEndsAt = Number(voteEnd);
  const voteStartsAt = voteEndsAt - DAO_EPOCH_SECONDS + Number(configuration.voteStart);
  const protocolStatus = p.status.toLowerCase() as DaoProtocolStatus;
  const displayStatus = deriveDaoDisplayStatus(protocolStatus, type);
  const supported = deployment.supportedExecutors.includes(configuration.executor as Address);
  const content = readDaoContentBytes(p.contentBytes, p.contentDigest as Hex);
  const events: DaoProposal["events"] = p.events.map((e) => ({
    type: e.type,
    log: { ...e.log, blockNumber: BigInt(e.log.blockNumber), blockHash: e.log.blockHash as Hex, transactionHash: e.log.transactionHash as Hex },
    // These are event identities. Transaction sender and current roles are
    // deliberately not used to identify historical callers.
    actor: e.type === "propose" ? p.proposer as Address
      : e.type === "vote" ? e.account as Address
        : e.type === "execute" ? e.executor as Address : null,
    yeaBps: e.type === "vote" ? Number(e.yea) : null,
    direction: e.type === "vote" && e.yea === "10000" ? "yea" : e.type === "vote" && e.yea === "0" ? "nay" : null,
    weight: e.type === "vote" ? BigInt(e.weight) : null,
    reason: e.type === "flag" || e.type === "veto" ? e.reason : null,
  }));
  return {
    ref: { chainId: snapshot.chainId, votingAddress: p.votingAddress as Address, proposalId: BigInt(p.id) },
    proposer: p.proposer as Address,
    votingEpoch: BigInt(p.epoch),
    createdAt: p.events[0].log.timestamp,
    voteStartsAt, voteEndsAt,
    executionStartsAt: type === "signal" ? null : voteEndsAt + Number(configuration.executeDelay),
    executionEndsAt: type === "signal" ? null : voteEndsAt + DAO_EPOCH_SECONDS,
    thresholdBps: Number(p.threshold),
    totalWeight: BigInt(p.votes), yeaWeight: BigInt(p.yea), nayWeight: BigInt(p.votes) - BigInt(p.yea),
    retracted: p.retracted, executed: p.executed, flagged: p.flagged, vetoed: p.vetoed,
    protocolStatus, displayStatus, displayGroup: deriveDaoDisplayGroup(displayStatus, type), type,
    rules: {
      approvalThresholdBps: Number(p.threshold), snapshotThresholdBps: Number(configuration.threshold), thresholdSnapshottedAtCreation: true,
      minimumTurnout: null, passageRequiresPositiveTotal: true, proposalType: type,
      votingPeriodSeconds: DAO_EPOCH_SECONDS - Number(configuration.voteStart),
      executionDelaySeconds: type === "signal" ? null : Number(configuration.executeDelay),
      executionGuard: type === "signal" ? null : configuration.executeGuard ? "guarded" : "permissionless",
      votingAddress: p.votingAddress as Address,
      votingSource: DAO_PINNED_VOTING_SOURCE, votingSourcePath: "contracts/governance/Voting.vy",
      observationBlockNumber: BigInt(snapshot.block.number),
    },
    content,
    discussion: {
      state: content.value?.discussionUrl ? "unverified" : "unavailable",
      // Canonical content does not verify a live forum topic or ancestry.
      url: safeDiscussionUrl(content.value?.discussionUrl),
      title: null, categoryId: null, category: null, categorySlugPath: [],
    },
    script: {
      bytes: p.scriptBytes as Hex | null, hash: p.scriptHash as Hex,
      hashVerified: p.scriptBytes === null ? null : keccak256(p.scriptBytes as Hex) === p.scriptHash,
      framing: supported ? "supported" : "unsupported",
    },
    analysis: analyzeDaoScript(p.scriptBytes as Hex | null, supported),
    events,
    moderation: {
      flagReason: events.findLast((e) => e.type === "flag")?.reason ?? null,
      vetoReason: events.findLast((e) => e.type === "veto")?.reason ?? null,
    },
  };
}

function safeDiscussionUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "gov.yearn.fi" &&
      !url.username && !url.password && !url.port ? value : null;
  } catch { return null; }
}

export function adaptDaoFeed(feed: DaoFeedWire, deployments: readonly DaoDeployment[]): DaoSnapshot {
  assertDaoDeployments(feed, deployments);
  return {
    schemaVersion: 2, chainId: feed.chainId,
    generatedAt: new Date(feed.observedAt * 1000).toISOString(),
    canonicalBlock: { number: BigInt(feed.block.number), hash: feed.block.hash as Hex, timestamp: feed.block.timestamp },
    contracts: feed.deployments.map((d) => {
      const trusted = deployments.find((entry) => entry.votingAddress === d.votingAddress)!;
      return {
        votingAddress: trusted.votingAddress,
        voterAddress: d.configuration.voter as Address, executorAddress: d.configuration.executor as Address,
        deploymentBlock: BigInt(trusted.deploymentBlock), active: trusted.active,
      };
    }),
    proposals: feed.proposals.map((p) => adaptDaoProposal(p, feed,
      feed.deployments.find((d) => d.votingAddress === p.votingAddress)!.configuration,
      deployments.find((d) => d.votingAddress === p.votingAddress)!)),
  };
}
