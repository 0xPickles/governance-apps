import { analyzeDaoScript } from "./script-analysis";
import {
  parseDaoProposalJson,
  serializeDaoProposalJson,
} from "./client";
import { deriveDaoProposalContentIdentity } from "./content";
import {
  assertDaoProposalInvariants,
  DAO_EMPTY_SCRIPT_HASH,
  deriveDaoDisplayGroup,
  deriveDaoDisplayStatus,
  serializeDaoProposalRef,
} from "./domain";
import {
  DAO_MOCK_EPOCH_LENGTH_SECONDS,
  DAO_MOCK_EXECUTION_DELAY_SECONDS,
  DAO_MOCK_GENESIS,
  DAO_MOCK_VOTE_START_OFFSET_SECONDS,
} from "./fixtures";
import { checkDaoExecutorScript } from "./script";
import { DAO_PINNED_VOTING_SOURCE } from "./provenance";
import type {
  DaoCreatedProposalRecord,
  DaoDecodedProposeIdentity,
  DaoProposal,
  DaoProposalContent,
  DaoProposalJson,
} from "./types";

export const DAO_CREATED_PROPOSALS_STORAGE_KEY =
  "yearn.dao.created-proposals.v2";

type DaoStoredCreatedProposalRecord = {
  stage: DaoCreatedProposalRecord["stage"];
  proposal: DaoProposalJson;
};

type DaoStoredCreatedProposals = {
  version: 2;
  records: DaoStoredCreatedProposalRecord[];
};

type DaoCreatedProposalDiscussion = DaoProposal["discussion"];

let memoryRecords: DaoCreatedProposalRecord[] = [];

export function createDaoAwaitingIndexProposal({
  content,
  contentCid,
  discussion,
  identity,
}: {
  content: DaoProposalContent;
  contentCid: string;
  discussion: DaoCreatedProposalDiscussion;
  identity: DaoDecodedProposeIdentity;
}): DaoProposal {
  if (identity.blockTimestamp === null) {
    throw new Error(
      "A created proposal requires the confirmed event block timestamp."
    );
  }
  if (content.createdBy.toLowerCase() !== identity.proposer.toLowerCase()) {
    throw new Error("Created proposal content must name the event proposer.");
  }
  const contentIdentity = deriveDaoProposalContentIdentity(content);
  if (
    contentIdentity.digest.toLowerCase() !==
      identity.contentDigest.toLowerCase() ||
    contentIdentity.cid !== contentCid
  ) {
    throw new Error(
      "Created proposal content must match the confirmed digest and CID."
    );
  }
  if (identity.votingEpoch > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Created proposal voting epoch exceeds safe date arithmetic.");
  }

  const scriptCheck = checkDaoExecutorScript(
    identity.script,
    content.proposalType
  );
  if (scriptCheck.state === "invalid" || scriptCheck.scriptHash === null) {
    throw new Error("The confirmed Propose script is invalid.");
  }

  const voteStartsAt =
    DAO_MOCK_GENESIS +
    Number(identity.votingEpoch) * DAO_MOCK_EPOCH_LENGTH_SECONDS +
    DAO_MOCK_VOTE_START_OFFSET_SECONDS;
  const voteEndsAt =
    DAO_MOCK_GENESIS +
    Number(identity.votingEpoch + 1n) * DAO_MOCK_EPOCH_LENGTH_SECONDS;
  const executable = content.proposalType === "executable";
  const displayStatus = deriveDaoDisplayStatus(
    "proposed",
    content.proposalType
  );
  const proposal: DaoProposal = {
    retracted: false, executed: false, flagged: false, vetoed: false,
    ref: { ...identity.ref },
    proposer: identity.proposer,
    votingEpoch: identity.votingEpoch,
    createdAt: identity.blockTimestamp,
    voteStartsAt,
    voteEndsAt,
    executionStartsAt: executable
      ? voteEndsAt + DAO_MOCK_EXECUTION_DELAY_SECONDS
      : null,
    executionEndsAt: executable
      ? voteEndsAt + DAO_MOCK_EPOCH_LENGTH_SECONDS
      : null,
    thresholdBps: 5_000,
    totalWeight: 0n,
    yeaWeight: 0n,
    nayWeight: 0n,
    protocolStatus: "proposed",
    displayStatus,
    displayGroup: deriveDaoDisplayGroup(displayStatus, content.proposalType),
    type: content.proposalType,
    rules: {
      snapshotThresholdBps: 5000,
      approvalThresholdBps: 5_000,
      thresholdSnapshottedAtCreation: true,
      minimumTurnout: null,
      passageRequiresPositiveTotal: true,
      proposalType: content.proposalType,
      votingPeriodSeconds: voteEndsAt - voteStartsAt,
      executionDelaySeconds: executable
        ? DAO_MOCK_EXECUTION_DELAY_SECONDS
        : null,
      executionGuard: executable ? "guarded" : null,
      votingAddress: identity.ref.votingAddress,
      votingSource: { ...DAO_PINNED_VOTING_SOURCE },
      votingSourcePath: "contracts/governance/Voting.vy",
      observationBlockNumber: identity.log.blockNumber,
    },
    content: {
      state: "available",
      cid: contentCid,
      digest: identity.contentDigest,
      value: {
        ...content,
        assets: content.assets.map((asset) => ({ ...asset })),
      },
      error: null,
    },
    discussion: {
      ...discussion,
      categorySlugPath: [...discussion.categorySlugPath],
    },
    script: {
      bytes: identity.script,
      hash: scriptCheck.scriptHash,
      hashVerified: true,
    },
    analysis: analyzeDaoScript(identity.script, true),
    events: [
      {
        type: "propose",
        log: { ...identity.log },
        actor: identity.proposer,
        yeaBps: null,
        direction: null,
        weight: null,
        reason: null,
      },
    ],
    moderation: {
      flagReason: null,
      vetoReason: null,
    },
  };

  if (
    content.proposalType === "signal" &&
    proposal.script.hash !== DAO_EMPTY_SCRIPT_HASH
  ) {
    throw new Error("Signal proposal identity must use the empty script hash.");
  }
  assertDaoProposalInvariants(proposal);
  return proposal;
}

export function persistDaoCreatedProposal(
  record: DaoCreatedProposalRecord
): DaoCreatedProposalRecord {
  assertDaoProposalInvariants(record.proposal);
  const key = serializeDaoProposalRef(record.proposal.ref);
  const records = readDaoCreatedProposals().filter(
    (candidate) => serializeDaoProposalRef(candidate.proposal.ref) !== key
  );
  const stored = cloneRecord(record);
  records.push(stored);
  writeRecords(records);
  return cloneRecord(stored);
}

export function indexDaoCreatedProposal(
  ref: DaoProposal["ref"],
  indexedAt: number
): DaoCreatedProposalRecord | null {
  void indexedAt; // Indexing time does not change immutable content or script interpretation.
  const key = serializeDaoProposalRef(ref);
  const records = readDaoCreatedProposals();
  const record = records.find(
    (candidate) => serializeDaoProposalRef(candidate.proposal.ref) === key
  );
  if (!record) return null;

  record.stage = "indexed";
  record.proposal = {
    ...record.proposal,
    analysis: analyzeDaoScript(record.proposal.script.bytes, true),
  };
  assertDaoProposalInvariants(record.proposal);
  writeRecords(records);
  return cloneRecord(record);
}

export function readDaoCreatedProposals(): DaoCreatedProposalRecord[] {
  const storage = getSessionStorage();
  if (!storage) return memoryRecords.map(cloneRecord);

  const raw = storage.getItem(DAO_CREATED_PROPOSALS_STORAGE_KEY);
  if (raw === null) return memoryRecords.map(cloneRecord);
  try {
    const value = JSON.parse(raw) as Partial<DaoStoredCreatedProposals>;
    if (value.version !== 2 || !Array.isArray(value.records)) {
      throw new Error("Unsupported created-proposal storage.");
    }
    const records = value.records.map((record) => ({
      stage: record.stage,
      proposal: parseDaoProposalJson(record.proposal),
    })) as DaoCreatedProposalRecord[];
    for (const record of records) {
      if (record.stage !== "awaiting_index" && record.stage !== "indexed") {
        throw new Error("Invalid created-proposal stage.");
      }
      assertDaoProposalInvariants(record.proposal);
    }
    memoryRecords = records.map(cloneRecord);
    return records.map(cloneRecord);
  } catch {
    storage.removeItem(DAO_CREATED_PROPOSALS_STORAGE_KEY);
    memoryRecords = [];
    return [];
  }
}

export function clearDaoCreatedProposals(): void {
  memoryRecords = [];
  getSessionStorage()?.removeItem(DAO_CREATED_PROPOSALS_STORAGE_KEY);
}

function writeRecords(records: DaoCreatedProposalRecord[]): void {
  memoryRecords = records.map(cloneRecord);
  const stored: DaoStoredCreatedProposals = {
    version: 2,
    records: records.map((record) => ({
      stage: record.stage,
      proposal: serializeDaoProposalJson(record.proposal),
    })),
  };
  getSessionStorage()?.setItem(
    DAO_CREATED_PROPOSALS_STORAGE_KEY,
    JSON.stringify(stored)
  );
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function cloneRecord(record: DaoCreatedProposalRecord): DaoCreatedProposalRecord {
  return structuredClone(record);
}
