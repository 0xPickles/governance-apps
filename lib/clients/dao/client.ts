import type { DaoReadContext } from "./onchain";
import type { Address, Hex } from "viem";
import type { PreparedTransaction } from "@/lib/tx/types";
import type {
  DaoAccountProposalState,
  DaoAnalysis,
  DaoAnalysisJson,
  DaoBigIntJson,
  DaoSnapshot,
  DaoSnapshotJson,
  DaoProposal,
  DaoProposalEvent,
  DaoProposalEventJson,
  DaoProposalJson,
  DaoProposalLookup,
  DaoProposalRef,
  DaoProposerState,
  DaoVoteDirection,
} from "./types";
import { validateDaoVerifiedSource } from "./content";

export interface DaoClient {
  getFeed(): Promise<DaoSnapshot>;
  preparePropose?(address: Address, digest: Hex, script: Hex, expectedEpoch: bigint): Promise<PreparedTransaction>;
  getProposal(ref: DaoProposalRef): Promise<DaoProposalLookup>;
  getAccountProposalState(
    ref: DaoProposalRef,
    address: Address,
    context?: DaoReadContext
  ): Promise<DaoAccountProposalState>;
  getProposerState(address: Address, context?: DaoReadContext): Promise<DaoProposerState>;
  prepareVote(
    ref: DaoProposalRef,
    address: Address,
    direction: DaoVoteDirection
  ): Promise<PreparedTransaction>;
  prepareRetract(
    ref: DaoProposalRef,
    address: Address
  ): Promise<PreparedTransaction>;
  prepareFlag(
    ref: DaoProposalRef,
    address: Address,
    reason: string
  ): Promise<PreparedTransaction>;
  prepareVeto(
    ref: DaoProposalRef,
    address: Address,
    reason: string
  ): Promise<PreparedTransaction>;
  prepareExecute(
    ref: DaoProposalRef,
    address: Address
  ): Promise<PreparedTransaction>;
}

// Internal mock/receipt persistence, not validation of the public wire feed.
export function parseDaoFeedJson(feed: DaoSnapshotJson): DaoSnapshot {
  return {
    schemaVersion: feed.schemaVersion,
    chainId: feed.chainId,
    generatedAt: feed.generatedAt,
    canonicalBlock: {
      ...feed.canonicalBlock,
      number: parseDaoBigInt(feed.canonicalBlock.number),
    },
    contracts: feed.contracts.map((contract) => ({
      ...contract,
      deploymentBlock: parseDaoBigInt(contract.deploymentBlock),
    })),
    proposals: feed.proposals.map(parseDaoProposalJson),
  };
}

export function serializeDaoFeedJson(feed: DaoSnapshot): DaoSnapshotJson {
  return {
    schemaVersion: feed.schemaVersion,
    chainId: feed.chainId,
    generatedAt: feed.generatedAt,
    canonicalBlock: {
      ...feed.canonicalBlock,
      number: serializeDaoBigInt(feed.canonicalBlock.number),
    },
    contracts: feed.contracts.map((contract) => ({
      ...contract,
      deploymentBlock: serializeDaoBigInt(contract.deploymentBlock),
    })),
    proposals: feed.proposals.map(serializeDaoProposalJson),
  };
}

export function parseDaoBigInt(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`DAO bigint JSON values must be canonical unsigned decimals: ${value}`);
  }
  return BigInt(value);
}

export function serializeDaoBigInt(value: bigint): DaoBigIntJson {
  if (value < 0n) {
    throw new Error("DAO bigint JSON values cannot be negative.");
  }
  return value.toString() as DaoBigIntJson;
}

export function parseDaoProposalJson(proposal: DaoProposalJson): DaoProposal {
  return {
    ...proposal,
    ref: {
      ...proposal.ref,
      proposalId: parseDaoBigInt(proposal.ref.proposalId),
    },
    votingEpoch: parseDaoBigInt(proposal.votingEpoch),
    totalWeight: parseDaoBigInt(proposal.totalWeight),
    yeaWeight: parseDaoBigInt(proposal.yeaWeight),
    nayWeight: parseDaoBigInt(proposal.nayWeight),
    content: {
      ...proposal.content,
      value:
        proposal.content.value === null
          ? null
          : {
              ...proposal.content.value,
              assets: proposal.content.value.assets.map((asset) => ({ ...asset })),
            },
    },
    discussion: {
      ...proposal.discussion,
      categorySlugPath: [...proposal.discussion.categorySlugPath],
    },
    script: { ...proposal.script },
    analysis: parseDaoAnalysisJson(proposal.analysis),
    events: proposal.events.map(parseDaoProposalEventJson),
    moderation: { ...proposal.moderation },
    rules: {
      ...proposal.rules,
      votingSource: {
        ...validateDaoVerifiedSource(proposal.rules.votingSource),
      },
      observationBlockNumber: parseDaoBigInt(
        proposal.rules.observationBlockNumber
      ),
    },
  };
}

export function serializeDaoProposalJson(proposal: DaoProposal): DaoProposalJson {
  return {
    ...proposal,
    ref: {
      ...proposal.ref,
      proposalId: serializeDaoBigInt(proposal.ref.proposalId),
    },
    votingEpoch: serializeDaoBigInt(proposal.votingEpoch),
    totalWeight: serializeDaoBigInt(proposal.totalWeight),
    yeaWeight: serializeDaoBigInt(proposal.yeaWeight),
    nayWeight: serializeDaoBigInt(proposal.nayWeight),
    content: {
      ...proposal.content,
      value:
        proposal.content.value === null
          ? null
          : {
              ...proposal.content.value,
              assets: proposal.content.value.assets.map((asset) => ({ ...asset })),
            },
    },
    discussion: {
      ...proposal.discussion,
      categorySlugPath: [...proposal.discussion.categorySlugPath],
    },
    script: { ...proposal.script },
    analysis: serializeDaoAnalysisJson(proposal.analysis),
    events: proposal.events.map(serializeDaoProposalEventJson),
    moderation: { ...proposal.moderation },
    rules: {
      ...proposal.rules,
      votingSource: { ...proposal.rules.votingSource },
      observationBlockNumber: serializeDaoBigInt(
        proposal.rules.observationBlockNumber
      ),
    },
  };
}

function parseDaoAnalysisJson(analysis: DaoAnalysisJson): DaoAnalysis {
  return {
    ...analysis,
    calls: analysis.calls.map((call) => ({
      ...call,
      arguments: call.arguments.map((argument) => ({ ...argument })),
      verifiedSource:
        call.verifiedSource === null
          ? null
          : { ...validateDaoVerifiedSource(call.verifiedSource) },
    })),
  };
}

function serializeDaoAnalysisJson(analysis: DaoAnalysis): DaoAnalysisJson {
  return {
    ...analysis,
    calls: analysis.calls.map((call) => ({
      ...call,
      arguments: call.arguments.map((argument) => ({ ...argument })),
      verifiedSource:
        call.verifiedSource === null ? null : { ...call.verifiedSource },
    })),

  };
}

function parseDaoProposalEventJson(
  event: DaoProposalEventJson
): DaoProposalEvent {
  return {
    ...event,
    log: {
      ...event.log,
      blockNumber: parseDaoBigInt(event.log.blockNumber),
    },
    weight: event.weight === null ? null : parseDaoBigInt(event.weight),
  };
}

function serializeDaoProposalEventJson(
  event: DaoProposalEvent
): DaoProposalEventJson {
  return {
    ...event,
    log: {
      ...event.log,
      blockNumber: serializeDaoBigInt(event.log.blockNumber),
    },
    weight: event.weight === null ? null : serializeDaoBigInt(event.weight),
  };
}
