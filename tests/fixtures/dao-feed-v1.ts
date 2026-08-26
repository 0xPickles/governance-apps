import { keccak256, sha256, toBytes, type Hex } from "viem";
import {
  DAO_MOCK_EXECUTOR_ADDRESS,
  DAO_MOCK_FEED,
  DAO_MOCK_GUARDIAN_ADDRESS,
  DAO_MOCK_OPERATOR_ADDRESS,
  DAO_MOCK_STYFIX_AGGREGATE_ADDRESS,
  DAO_MOCK_VOTER_ADDRESS,
  DAO_MOCK_VOTING_ADDRESS,
  DAO_MOCK_YBC_AGGREGATE_ADDRESS,
} from "@/lib/clients/dao/fixtures";
import {
  canonicalizeDaoProposalContent,
  createDaoRawSha256Cid,
  parseDaoProposalContent,
} from "@/lib/clients/dao/content";
import { DAO_PINNED_VOTING_REVISION } from "@/lib/clients/dao/provenance";
import { checkDaoExecutorScript } from "@/lib/clients/dao/script";
import type {
  DaoAnalysis,
  DaoDecodedCall,
  DaoProposal,
  DaoProposalEvent,
  DaoVerifiedSource,
} from "@/lib/clients/dao/types";
import {
  DAO_FEED_SCHEMA_ID,
  DAO_FEED_SCHEMA_NAME,
  DAO_FEED_SCHEMA_VERSION,
  createDaoFeedEventId,
  encodeDaoFeedLifecycleEventAbi,
  parseDaoCreationIdentityStageV1,
  parseDaoFeedV1,
  type DaoFeedV1,
} from "@/lib/schemas/dao-feed";

const SOURCE_PATH = "contracts/governance/Voting.vy";
const PINNED_SOURCE = {
  kind: "github",
  label: "Voting.vy at pinned stYFI revision",
  url: `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${SOURCE_PATH}`,
  revision: DAO_PINNED_VOTING_REVISION,
  sourcePath: SOURCE_PATH,
} as const;
const VOTING_HOOK_ADDRESS =
  "0x9999999999999999999999999999999999999999";
const SNAPSHOT_ID = "dao-mainnet-24000000-39c219e2";
const GENERATED_AT = "2026-08-18T12:02:00Z";
const EVENT_BLOCK_TIMESTAMPS = new Map<bigint, number | null>();
for (const proposal of DAO_MOCK_FEED.proposals) {
  for (const event of proposal.events) {
    const known = EVENT_BLOCK_TIMESTAMPS.get(event.log.blockNumber);
    if (known === undefined || (known === null && event.log.timestamp !== null)) {
      EVENT_BLOCK_TIMESTAMPS.set(event.log.blockNumber, event.log.timestamp);
    }
  }
}
const FIXTURE_VARIANTS = [
  {
    sourceId: 19n,
    proposalId: 23n,
    blockOffset: 1_000n,
    script: null,
    name: "missing-script",
  },
  {
    sourceId: 19n,
    proposalId: 24n,
    blockOffset: 2_000n,
    script: "0x01" as Hex,
    name: "malformed-script",
  },
  {
    sourceId: 19n,
    proposalId: 25n,
    blockOffset: 3_000n,
    script: `0x${"00".repeat(32)}` as Hex,
    name: "zero-target-script",
  },
] as const;

type Variant = (typeof FIXTURE_VARIANTS)[number];

type WireLog = {
  blockNumber: string;
  blockHash: Hex;
  timestamp: number | null;
  transactionHash: Hex | null;
  transactionIndex: number;
  logIndex: number;
};

type WireEventDraft = {
  eventId: string;
  proposalRef: {
    chainId: number;
    votingAddress: string;
    proposalId: string;
  };
  contractGeneration: string;
  log: WireLog;
  actor: unknown;
  type: DaoProposalEvent["type"];
  data: Record<string, unknown>;
};

export function createDaoFeedV1Example(): DaoFeedV1 {
  const proposals = DAO_MOCK_FEED.proposals.map((proposal) =>
    createProposal(proposal, null)
  );
  for (const variant of FIXTURE_VARIANTS) {
    const source = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === variant.sourceId
    );
    if (!source) throw new Error(`Missing fixture source ${variant.sourceId}.`);
    proposals.push(createProposal(source, variant));
  }
  const eventCount = proposals.reduce<number>(
    (total, proposal) =>
      total +
      ((proposal as { events: unknown[] }).events?.length ?? 0),
    0
  );
  const canonicalBlock = {
    number: DAO_MOCK_FEED.canonicalBlock.number.toString(),
    hash: DAO_MOCK_FEED.canonicalBlock.hash,
    timestamp: DAO_MOCK_FEED.canonicalBlock.timestamp,
  };
  const deploymentHash = fixedHex32(23_900_000n);
  const feed = {
    schemaId: DAO_FEED_SCHEMA_ID,
    schemaVersion: DAO_FEED_SCHEMA_VERSION,
    schemaName: DAO_FEED_SCHEMA_NAME,
    chainId: DAO_MOCK_FEED.chainId,
    generatedAt: GENERATED_AT,
    publication: {
      mode: "atomic_snapshot",
      snapshotId: SNAPSHOT_ID,
      previousSnapshotId: null,
      publishedAt: GENERATED_AT,
      producer: {
        name: "gov-apps-stats",
        version: "dao-wp8-fixture-v1",
        runtime: "rust-1.88/alloy-1.4/revm-34",
      },
      cursor: {
        chainId: DAO_MOCK_FEED.chainId,
        startBlockNumber: "23900000",
        lastBlockNumber: canonicalBlock.number,
        lastBlockHash: canonicalBlock.hash,
        nextBlockNumber: "24000001",
      },
      finality: {
        requiredConfirmations: 8,
        observedConfirmations: 8,
        headBlock: {
          number: "24000008",
          hash: fixedHex32(24_000_008n),
          timestamp: canonicalBlock.timestamp + 96,
        },
      },
      reorg: {
        state: "clean",
        replayFromBlock: null,
        commonAncestor: null,
        replacedSnapshotId: null,
      },
      retry: {
        state: "first_attempt",
        attempt: 1,
        maxAttempts: 16,
        lastFailure: null,
        nextRetryAt: null,
      },
      atomicity: {
        localWrite: "temp_then_rename",
        remoteWrite: "immutable_then_stable_put",
        singleWriter: true,
        retainLastGood: true,
        validateImmutableBeforeStable: true,
        stableObjectWrittenLast: true,
      },
      retention: {
        eventScripts: "indefinite",
        contentJson: "indefinite",
        assetRecords: "indefinite",
        immutableAuditSnapshots: "indefinite",
        rawContentMaxAttempts: 8,
        rawAssetMaxAttempts: 8,
      },
      counts: {
        contracts: 1,
        proposals: proposals.length,
        events: eventCount,
      },
    },
    canonicalBlock,
    contracts: [
      {
        generation: "1",
        votingAddress: DAO_MOCK_VOTING_ADDRESS,
        voterAddress: DAO_MOCK_VOTER_ADDRESS,
        executorAddress: DAO_MOCK_EXECUTOR_ADDRESS,
        deploymentBlock: {
          number: "23900000",
          hash: deploymentHash,
          timestamp: null,
        },
        startBlock: "23900000",
        active: true,
        retiredAtBlock: null,
        replacedByVotingAddress: null,
        source: PINNED_SOURCE,
      },
    ],
    proposals,
  };
  return parseDaoFeedV1(feed);
}

export const DAO_FEED_V1_EXAMPLE = createDaoFeedV1Example();
export const DAO_CREATION_IDENTITY_STAGES_V1_EXAMPLE =
  createDaoCreationIdentityStagesV1Example();

function createDaoCreationIdentityStagesV1Example() {
  const proposal = DAO_FEED_V1_EXAMPLE.proposals[0];
  const propose = proposal?.events.find((event) => event.type === "propose");
  if (
    !proposal ||
    !propose ||
    propose.data.abi.state !== "available" ||
    propose.data.script === null ||
    propose.log.transactionHash === null
  ) {
    throw new Error("The creation-stage fixture requires one complete Propose record.");
  }
  const common = {
    schemaVersion: DAO_FEED_SCHEMA_VERSION,
    ref: proposal.ref,
    transactionHash: propose.log.transactionHash,
    receipt: { status: "success", matchingProposeLogCount: 1 },
    identity: {
      proposer: propose.data.proposer,
      votingEpoch: propose.data.votingEpoch,
      contentDigest: propose.data.contentDigest,
      script: propose.data.script,
      log: propose.log,
      abi: {
        address: propose.data.abi.address,
        topics: propose.data.abi.topics,
        data: propose.data.abi.data,
        matchingLogCount: 1,
        canonicalReencodingMatched: true,
      },
    },
  } as const;
  return (["receipt_confirmed", "awaiting_index", "indexed"] as const).map(
    (stage) =>
      parseDaoCreationIdentityStageV1({
        ...common,
        stage,
        indexedSnapshotId: stage === "indexed" ? SNAPSHOT_ID : null,
      })
  );
}

function createProposal(
  source: DaoProposal,
  variant: Variant | null
): unknown {
  const proposalId = variant?.proposalId ?? source.ref.proposalId;
  const blockOffset = variant?.blockOffset ?? 0n;
  const exactScript = variant ? variant.script : source.script.bytes;
  const storedScriptHash =
    variant && exactScript !== null
      ? keccak256(exactScript)
      : source.script.hash;
  const content = createContent(source);
  const ref = {
    chainId: source.ref.chainId,
    votingAddress: source.ref.votingAddress,
    proposalId: proposalId.toString(),
  };
  const events = source.events.map((event) =>
    createEvent({
      event,
      source,
      ref,
      contentDigest: content.digest,
      exactScript,
      blockOffset,
    })
  );
  const propose = events.find((event) => event.type === "propose");
  if (!propose) throw new Error("Every fixture proposal needs a Propose event.");
  const script = createScript(
    source,
    exactScript,
    storedScriptHash,
    propose.eventId
  );
  const analysis = createAnalysis(
    source.analysis,
    source,
    variant,
    propose.log,
    exactScript === null ? storedScriptHash : keccak256(exactScript),
    proposalId
  );
  const configObservedAt = observationBefore(propose.log);
  const flagReason = getModerationReason(events, "flag");
  const vetoReason = getModerationReason(events, "veto");
  const humanParticipationCount = events.filter(
    (event) =>
      event.type === "vote" && event.data.actorKind === "human"
  ).length;

  return {
    ref,
    contractGeneration: "1",
    proposer: source.proposer,
    votingEpoch: source.votingEpoch.toString(),
    createdAt: source.createdAt,
    voteStartsAt: source.voteStartsAt,
    voteEndsAt: source.voteEndsAt,
    executionStartsAt: source.executionStartsAt,
    executionEndsAt: source.executionEndsAt,
    thresholdBps: source.thresholdBps,
    totalWeight: source.totalWeight.toString(),
    yeaWeight: source.yeaWeight.toString(),
    nayWeight: source.nayWeight.toString(),
    protocolStatus: source.protocolStatus,
    displayStatus: source.displayStatus,
    displayGroup: source.displayGroup,
    type: source.type,
    voteAccounting: {
      aggregateSemantics: "last_event_per_actor",
      humanParticipationCount,
    },
    rules: {
      approvalThresholdBps: source.thresholdBps,
      thresholdSnapshottedAtCreation: true,
      minimumTurnout: null,
      passageRequiresPositiveTotal: true,
      proposalType: source.type,
      votingAddress: source.ref.votingAddress,
      votingSource: PINNED_SOURCE,
      mutableConfiguration: {
        contractGeneration: "1",
        voteStartTimestamp: source.voteStartsAt,
        votingPeriodSeconds: source.voteEndsAt - source.voteStartsAt,
        executionDelaySeconds:
          source.executionStartsAt === null
            ? null
            : source.executionStartsAt - source.voteEndsAt,
        executionGuard: source.rules.executionGuard,
        voterAddress: DAO_MOCK_VOTER_ADDRESS,
        executorAddress: DAO_MOCK_EXECUTOR_ADDRESS,
        votingHookAddress: VOTING_HOOK_ADDRESS,
        operatorAddress: DAO_MOCK_OPERATOR_ADDRESS,
        guardianAddress: DAO_MOCK_GUARDIAN_ADDRESS,
        observedAt: configObservedAt,
        observationSemantics: "effective_at_propose_event",
        valuesAreSnapshotted: false,
      },
    },
    content,
    discussion: createDiscussion(source),
    script,
    analysis,
    events,
    moderation: { flagReason, vetoReason },
    creation:
      propose.log.transactionHash === null || exactScript === null
        ? {
            state: "historical_incomplete",
            transactionHash: propose.log.transactionHash,
            proposeEventId: propose.eventId,
            receipt: null,
            error: failure(
              "RECEIPT_PROVENANCE_INCOMPLETE",
              "The historical Propose record has no transaction hash.",
              false,
              "provenance"
            ),
          }
        : {
            state: "indexed",
            transactionHash: propose.log.transactionHash,
            proposeEventId: propose.eventId,
            receipt: {
              status: "success",
              transactionHash: propose.log.transactionHash,
              blockNumber: propose.log.blockNumber,
              blockHash: propose.log.blockHash,
              blockTimestamp: propose.log.timestamp,
              transactionIndex: propose.log.transactionIndex,
              matchingProposeLogCount: 1,
            },
            error: null,
          },
  };
}

function createContent(source: DaoProposal): {
  state: "available" | "invalid" | "unavailable";
  cid: string;
  digest: Hex;
  canonicalJson: string | null;
  value: DaoProposal["content"]["value"];
  retry: unknown;
  assetRecords: unknown[];
  attachmentRecords: unknown[];
  error: unknown;
} {
  const baseRetry = {
    attempts: 1,
    maxAttempts: 8,
    lastAttemptAt: GENERATED_AT,
    nextRetryAt: null,
  };
  if (source.content.state === "unavailable") {
    return {
      state: "unavailable",
      cid: createDaoRawSha256Cid(source.content.digest),
      digest: source.content.digest,
      canonicalJson: null,
      value: null,
      retry: { ...baseRetry, attempts: 8 },
      assetRecords: [],
      attachmentRecords: [],
      error: failure(
        "CONTENT_FETCH_EXHAUSTED",
        source.content.error ?? "Proposal content was unavailable.",
        false,
        "content"
      ),
    };
  }
  if (source.content.state === "invalid") {
    const canonicalJson = `${JSON.stringify({
      schema: "yearn.dao.proposal.invalid",
      failure: source.content.error,
    })}\n`;
    const digest = sha256(toBytes(canonicalJson));
    return {
      state: "invalid",
      cid: createDaoRawSha256Cid(digest),
      digest,
      canonicalJson,
      value: null,
      retry: baseRetry,
      assetRecords: [],
      attachmentRecords: [],
      error: failure(
        "CONTENT_SCHEMA_INVALID",
        source.content.error ?? "Proposal content was invalid.",
        false,
        "content"
      ),
    };
  }
  if (!source.content.value) throw new Error("Available content needs its value.");
  const canonicalJson = new TextDecoder().decode(
    canonicalizeDaoProposalContent(source.content.value)
  );
  const digest = sha256(toBytes(canonicalJson));
  const assetRecords = source.content.value.assets.map((asset) => {
    const cid = createDaoRawSha256Cid(asset.digest);
    return {
      ...asset,
      cid,
      gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
      state: "available",
      retry: {
        attempts: 1,
        maxAttempts: 8,
        lastAttemptAt: GENERATED_AT,
        nextRetryAt: null,
      },
      error: null,
    };
  });
  const parsed = parseDaoProposalContent(source.content.value);
  if (parsed.errors.length > 0) {
    throw new Error("Available feed fixtures require accepted proposal content.");
  }
  const attachmentRecords = parsed.attachments.map((attachment) => ({
    kind: attachment.target.startsWith("ipfs://")
      ? "direct_ipfs"
      : "relative_manifest_path",
    target: attachment.target,
    manifestPath: attachment.asset.path,
    assetCid: attachment.cid,
    gatewayUrl: attachment.gatewayUrl,
  }));
  return {
    state: "available",
    cid: createDaoRawSha256Cid(digest),
    digest,
    canonicalJson,
    value: source.content.value,
    retry: baseRetry,
    assetRecords,
    attachmentRecords,
    error: null,
  };
}

function createDiscussion(source: DaoProposal): unknown {
  const discussion = source.discussion;
  if (discussion.state === "verified") {
    return { ...discussion, error: null };
  }
  if (discussion.state === "unverified") {
    return { ...discussion, categorySlugPath: [], error: null };
  }
  return {
    ...discussion,
    categorySlugPath: [],
    error: failure(
      "DISCUSSION_UNAVAILABLE",
      "The discussion source could not be verified.",
      true,
      "content"
    ),
  };
}

function createScript(
  source: DaoProposal,
  exactScript: Hex | null,
  storedHash: Hex,
  proposeEventId: string
): unknown {
  if (exactScript === null) {
    return {
      bytes: null,
      hash: storedHash,
      structure: {
        state: "unavailable",
        errorCode: null,
        errorOffset: null,
      },
      hashVerification: { state: "unavailable", computedHash: null },
      retention: {
        state: "missing",
        proposeEventId,
        error: failure(
          "EVENT_SCRIPT_UNAVAILABLE",
          "The exact Propose event script bytes were not retained.",
          true,
          "provenance"
        ),
      },
    };
  }
  const check = checkDaoExecutorScript(exactScript, source.type);
  const computedHash = keccak256(exactScript);
  return {
    bytes: exactScript,
    hash: storedHash,
    structure: {
      state: check.state,
      errorCode: check.error?.code ?? null,
      errorOffset: check.error?.offset ?? null,
    },
    hashVerification: {
      state: computedHash === storedHash ? "verified" : "mismatch",
      computedHash,
    },
    retention: { state: "retained", proposeEventId, error: null },
  };
}

function createAnalysis(
  sourceAnalysis: DaoAnalysis,
  sourceProposal: DaoProposal,
  variant: Variant | null,
  proposeLog: WireLog,
  scriptHash: Hex,
  proposalId: bigint
): unknown {
  if (variant) {
    return unavailableAnalysis(
      variant.name === "missing-script"
        ? "EVENT_SCRIPT_UNAVAILABLE"
        : variant.name === "malformed-script"
          ? "SCRIPT_STRUCTURE_INVALID"
          : "SIMULATION_CONTEXT_UNAVAILABLE",
      "The execution-equivalent REVM context is unavailable for this retained script."
    );
  }
  if (sourceAnalysis.state === "pending") {
    return {
      state: "pending",
      generatedAt: null,
      registryVersion: null,
      calls: [],
      proposalSimulation: pendingSimulation(),
      error: null,
    };
  }
  if (sourceProposal.type === "signal") {
    return {
      state: "unavailable",
      generatedAt: null,
      registryVersion: null,
      calls: [],
      proposalSimulation: unavailableSimulation(
        "NO_EXECUTABLE_CALLS",
        "Signal proposals have no executable calls."
      ),
      error: failure(
        "NO_EXECUTABLE_CALLS",
        "Signal proposals have no executable calls.",
        false,
        "simulation"
      ),
    };
  }
  const calls = sourceAnalysis.calls.map(createCall);
  const failed = sourceAnalysis.proposalSimulation.state === "failed";
  return {
    state: sourceAnalysis.state,
    generatedAt: sourceAnalysis.generatedAt,
    registryVersion: sourceAnalysis.registryVersion,
    calls,
    proposalSimulation: {
      state: failed ? "failed" : "succeeded",
      method: "revm_voting_transition_then_executor_execute",
      engine: "revm@34",
      executorAddress: DAO_MOCK_EXECUTOR_ADDRESS,
      scriptHash,
      blockNumber: proposeLog.blockNumber,
      blockHash: proposeLog.blockHash,
      simulatedAt: sourceAnalysis.proposalSimulation.simulatedAt ?? GENERATED_AT,
      stateTimestamp: proposeLog.timestamp,
      timestampMode: "block",
      timestampOverride: null,
      caller: DAO_MOCK_VOTING_ADDRESS,
      stateOverrides: [
        {
          kind: "voting_proposal_executed_flag",
          votingAddress: DAO_MOCK_VOTING_ADDRESS,
          proposalId: proposalId.toString(),
          value: true,
          source: PINNED_SOURCE,
        },
      ],
      atomic: true,
      result: failed ? "revert" : "success",
      error: failed
        ? failure(
            "TARGET_CALL_REVERTED",
            "The complete ordered script reverted atomically.",
            false,
            "simulation"
          )
        : null,
    },
    error: failed
      ? failure(
          "SIMULATION_REVERTED",
          "Proposal-time simulation reverted.",
          false,
          "simulation"
        )
      : null,
  };
}

function createCall(call: DaoDecodedCall): unknown {
  const base = {
    index: call.index,
    offset: call.offset,
    target: call.target,
    calldata: call.calldata,
    calldataBytes: call.calldataBytes,
    selector: call.selector,
  };
  if (call.decodeStatus === "verified") {
    return {
      ...base,
      decodeStatus: "verified",
      contractName: call.contractName,
      functionSignature: call.functionSignature,
      arguments: call.arguments,
      verifiedSource: sourceWithPath(
        call.verifiedSource,
        call.sourcePath
      ),
      error: null,
    };
  }
  if (call.decodeStatus === "unknown") {
    return {
      ...base,
      decodeStatus: "unknown",
      contractName: null,
      functionSignature: null,
      arguments: [],
      verifiedSource: null,
      error: null,
    };
  }
  return {
    ...base,
    decodeStatus: "failed",
    contractName: call.contractName,
    functionSignature: call.functionSignature,
    arguments: call.arguments,
    verifiedSource:
      call.verifiedSource === null
        ? null
        : sourceWithPath(call.verifiedSource, call.sourcePath),
    error: failure(
      "CALL_DECODE_FAILED",
      "The call could not be decoded with its candidate source.",
      false,
      "decoder"
    ),
  };
}

function createEvent({
  event,
  source,
  ref,
  contentDigest,
  exactScript,
  blockOffset,
}: {
  event: DaoProposalEvent;
  source: DaoProposal;
  ref: WireEventDraft["proposalRef"];
  contentDigest: Hex;
  exactScript: Hex | null;
  blockOffset: bigint;
}): WireEventDraft {
  const log = shiftLog(event.log, blockOffset);
  const eventId = createDaoFeedEventId(ref.chainId, ref.votingAddress, log);
  const common = {
    eventId,
    proposalRef: ref,
    contractGeneration: "1",
    log,
  };
  if (event.type === "propose") {
    const abiScript = exactScript ?? ("0x" as Hex);
    const raw = encodeDaoFeedLifecycleEventAbi({
      type: "propose",
      votingAddress: source.ref.votingAddress,
      contentDigest,
      proposalId: BigInt(ref.proposalId),
      proposer: source.proposer,
      script: abiScript,
      votingEpoch: source.votingEpoch,
    });
    return {
      ...common,
      actor: eventArgumentActor(source.proposer, "proposer"),
      type: event.type,
      data: {
        proposalId: ref.proposalId,
        proposer: source.proposer,
        votingEpoch: source.votingEpoch.toString(),
        contentDigest,
        script: exactScript,
        scriptFailure:
          exactScript === null
            ? failure(
                "EVENT_SCRIPT_UNAVAILABLE",
                "The event script bytes were not retained.",
                true,
                "provenance"
              )
            : null,
        abi:
          exactScript === null
            ? {
                state: "unavailable",
                address: raw.address,
                topics: raw.topics,
                data: null,
                matchingLogCount: 1,
                canonicalReencodingMatched: null,
                error: failure(
                  "PROPOSE_LOG_BYTES_UNAVAILABLE",
                  "The raw Propose log data and exact script were not retained.",
                  true,
                  "provenance"
                ),
              }
            : {
                state: "available",
                address: raw.address,
                topics: raw.topics,
                data: raw.data,
                matchingLogCount: 1,
                canonicalReencodingMatched: true,
                error: null,
              },
      },
    };
  }
  if (event.type === "vote") {
    const actorKind =
      event.voteActorKind === "styfix_aggregate"
        ? "delegated_staking_aggregate"
        : event.voteActorKind;
    const role = actorKind === "human" ? "voter" : actorKind;
    const raw = encodeDaoFeedLifecycleEventAbi({
      type: "vote",
      votingAddress: source.ref.votingAddress,
      proposalId: BigInt(ref.proposalId),
      account: event.actor,
      weight: event.weight ?? 0n,
      yeaBps: BigInt(event.yeaBps ?? 0),
    });
    return {
      ...common,
      actor: eventArgumentActor(event.actor, role),
      type: event.type,
      data: {
        actorKind,
        yeaBps: event.yeaBps,
        direction: event.direction,
        weight: event.weight?.toString(),
        weightSemantics: "absolute_actor_contribution",
        countsAsHumanParticipation: actorKind === "human",
        classification: {
          method: "historical_voter_configuration",
          voterAddress: DAO_MOCK_VOTER_ADDRESS,
          delegatedStakingAddress: DAO_MOCK_STYFIX_AGGREGATE_ADDRESS,
          ybcAddress: DAO_MOCK_YBC_AGGREGATE_ADDRESS,
          observedAt: observationBefore(log),
          observationSemantics: "effective_at_event",
        },
        abi: availableAbi(raw),
      },
    };
  }
  if (event.type === "retract") {
    const raw = encodeDaoFeedLifecycleEventAbi({
      type: "retract",
      votingAddress: source.ref.votingAddress,
      proposalId: BigInt(ref.proposalId),
    });
    return {
      ...common,
      actor: {
        address: source.proposer,
        role: "proposer",
        evidence: {
          state: "verified",
          method: "proposal_proposer",
          observedAt: null,
          transactionSender: null,
          configuredRoleAddress: null,
          error: null,
        },
      },
      type: event.type,
      data: { abi: availableAbi(raw) },
    };
  }
  if (event.type === "flag" || event.type === "veto") {
    const reason = event.reason ?? "";
    const raw = encodeDaoFeedLifecycleEventAbi({
      type: event.type,
      votingAddress: source.ref.votingAddress,
      proposalId: BigInt(ref.proposalId),
      reason,
    });
    return {
      ...common,
      actor:
        source.ref.proposalId === 12n
          ? {
              address: null,
              role: "unknown",
              evidence: {
                state: "unavailable",
                method: null,
                observedAt: null,
                transactionSender: null,
                configuredRoleAddress: null,
                error: failure(
                  "HISTORICAL_ACTOR_UNAVAILABLE",
                  "The historical transaction sender and role state could not both be established.",
                  false,
                  "provenance"
                ),
              },
            }
          : {
              address: event.actor,
              role: event.type === "flag" ? "operator" : "guardian",
              evidence: {
                state: "verified",
                method: "historical_role_and_transaction_sender",
                observedAt: observationBefore(log),
                transactionSender: event.actor,
                configuredRoleAddress: event.actor,
                error: null,
              },
            },
      type: event.type,
      data: { reason, abi: availableAbi(raw) },
    };
  }
  const raw = encodeDaoFeedLifecycleEventAbi({
    type: "execute",
    votingAddress: source.ref.votingAddress,
    proposalId: BigInt(ref.proposalId),
    executionCaller: event.actor,
  });
  return {
    ...common,
    actor: eventArgumentActor(event.actor, "execution_caller"),
    type: event.type,
    data: { abi: availableAbi(raw) },
  };
}

function availableAbi(raw: {
  address: string;
  topics: readonly string[];
  data: string;
}): unknown {
  return {
    state: "available",
    address: raw.address,
    topics: raw.topics,
    data: raw.data,
    matchingLogCount: 1,
    canonicalReencodingMatched: true,
    error: null,
  };
}

function shiftLog(
  log: DaoProposalEvent["log"],
  blockOffset: bigint
): WireLog {
  const blockNumber = log.blockNumber + blockOffset;
  const blockHash = fixedHex32(blockNumber);
  const transactionHash =
    log.transactionHash === null
      ? null
      : blockOffset === 0n
        ? log.transactionHash
        : fixedHex32(
            blockNumber * 10_000n +
              BigInt(log.transactionIndex * 100 + log.logIndex)
          );
  return {
    blockNumber: blockNumber.toString(),
    blockHash,
    timestamp: EVENT_BLOCK_TIMESTAMPS.get(log.blockNumber) ?? null,
    transactionHash,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
  };
}

function eventArgumentActor(address: string, role: unknown): unknown {
  return {
    address,
    role,
    evidence: {
      state: "verified",
      method: "event_argument",
      observedAt: null,
      transactionSender: null,
      configuredRoleAddress: null,
      error: null,
    },
  };
}

function observationBefore(log: WireLog): {
  blockNumber: string;
  blockHash: Hex;
  transactionIndex: number;
  logIndex: number;
} {
  const block = BigInt(log.blockNumber) - 1n;
  return {
    blockNumber: block.toString(),
    blockHash: fixedHex32(block),
    transactionIndex: 0,
    logIndex: 0,
  };
}

function pendingSimulation(): unknown {
  return {
    state: "pending",
    method: null,
    engine: null,
    executorAddress: null,
    scriptHash: null,
    blockNumber: null,
    blockHash: null,
    simulatedAt: null,
    stateTimestamp: null,
    timestampMode: null,
    timestampOverride: null,
    caller: null,
    stateOverrides: [],
    atomic: null,
    result: null,
    error: null,
  };
}

function unavailableAnalysis(code: string, message: string): unknown {
  return {
    state: "unavailable",
    generatedAt: GENERATED_AT,
    registryVersion: "yearn-dao-registry/v1",
    calls: [],
    proposalSimulation: unavailableSimulation(code, message),
    error: failure(code, message, false, "simulation"),
  };
}

function unavailableSimulation(code: string, message: string): unknown {
  return {
    state: "unavailable",
    method: null,
    engine: null,
    executorAddress: null,
    scriptHash: null,
    blockNumber: null,
    blockHash: null,
    simulatedAt: GENERATED_AT,
    stateTimestamp: null,
    timestampMode: null,
    timestampOverride: null,
    caller: null,
    stateOverrides: [],
    atomic: null,
    result: null,
    error: failure(code, message, false, "simulation"),
  };
}

function sourceWithPath(
  source: DaoVerifiedSource | null,
  sourcePath: string | null
): unknown {
  if (!source || !sourcePath) {
    throw new Error("Verified fixture calls need a complete source record.");
  }
  return { ...source, sourcePath };
}

function getModerationReason(
  events: WireEventDraft[],
  type: "flag" | "veto"
): string | null {
  const event = events.find((candidate) => candidate.type === type);
  return (event?.data.reason as string | undefined) ?? null;
}

function failure(
  code: string,
  message: string,
  retryable: boolean,
  source:
    | "chain"
    | "rpc"
    | "content"
    | "asset"
    | "decoder"
    | "simulation"
    | "publication"
    | "provenance"
): unknown {
  return { code, message, retryable, observedAt: GENERATED_AT, source };
}

function fixedHex32(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}
