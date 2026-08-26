import { keccak256, sha256, toBytes, type Address, type Hex } from "viem";
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
  DAO_FEED_EPOCH_LENGTH_SECONDS,
  DAO_FEED_SCHEMA_NAME,
  DAO_FEED_SCHEMA_VERSION,
  createDaoFeedEventId,
  deriveDaoSimulationContextInputsSha256,
  deriveDaoVoterBuildEvidenceSha256,
  deriveDaoVotingExecutedStorageSlots,
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
  repository: "yearn/stYFI",
  revision: DAO_PINNED_VOTING_REVISION,
  sourcePath: SOURCE_PATH,
} as const;
const VOTER_SOURCE_PATH = "contracts/governance/Voter.vy";
const PINNED_VOTER_SOURCE = {
  kind: "github",
  label: "Voter.vy at pinned stYFI revision",
  url: `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${VOTER_SOURCE_PATH}`,
  repository: "yearn/stYFI",
  revision: DAO_PINNED_VOTING_REVISION,
  sourcePath: VOTER_SOURCE_PATH,
} as const;
const EXECUTOR_SOURCE_PATH = "contracts/governance/Executor.vy";
const PINNED_EXECUTOR_SOURCE = {
  kind: "github",
  label: "Executor.vy at pinned stYFI revision",
  url: `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${EXECUTOR_SOURCE_PATH}`,
  repository: "yearn/stYFI",
  revision: DAO_PINNED_VOTING_REVISION,
  sourcePath: EXECUTOR_SOURCE_PATH,
} as const;
const PINNED_EXECUTOR_SOURCE_SHA256 =
  "0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1" as const;
const PINNED_EXECUTOR_COMPILER_INTEGRITY_SHA256 =
  "0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b" as const;
const PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH = 1_157 as const;
const PINNED_EXECUTOR_RUNTIME_KECCAK256 =
  "0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151" as const;
const PINNED_EXECUTOR_RUNTIME_SHA256 =
  "0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c" as const;
const VOTING_HOOK_ADDRESS =
  "0x9999999999999999999999999999999999999999";
const CHANGED_VOTER_ADDRESS =
  "0x8888888888888888888888888888888888888888";
const CHANGED_EXECUTOR_ADDRESS =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHANGED_STYFIX_AGGREGATE_ADDRESS =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CHANGED_YBC_AGGREGATE_ADDRESS =
  "0xcccccccccccccccccccccccccccccccccccccccc";
const CHANGED_VOTING_HOOK_ADDRESS =
  "0xdddddddddddddddddddddddddddddddddddddddd";
const CHANGED_OPERATOR_ADDRESS =
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const CHANGED_GUARDIAN_ADDRESS =
  "0xffffffffffffffffffffffffffffffffffffffff";
const YBC_WEIGHT_AGGREGATOR_ADDRESS =
  "0x1212121212121212121212121212121212121212";
const CHANGED_YBC_WEIGHT_AGGREGATOR_ADDRESS =
  "0x1313131313131313131313131313131313131313";
const WEIGHT_MEASURE_ADDRESS =
  "0x1414141414141414141414141414141414141414";
const CHANGED_WEIGHT_MEASURE_ADDRESS =
  "0x1515151515151515151515151515151515151515";
const PROPOSAL_BLACKLIST_ADDRESS =
  "0x1616161616161616161616161616161616161616";
const CHANGED_PROPOSAL_BLACKLIST_ADDRESS =
  "0x1717171717171717171717171717171717171717";
const DAO_GENESIS_TIMESTAMP = 1_543_946_400;
const VOTER_GENESIS_TIMESTAMP =
  DAO_GENESIS_TIMESTAMP - DAO_FEED_EPOCH_LENGTH_SECONDS;
const CONFIGURATION_CHANGE_BLOCK = 23_902_000n;
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
  {
    sourceId: 19n,
    proposalId: 26n,
    blockOffset: 4_000n,
    script: "source",
    name: "changed-configuration",
  },
  {
    sourceId: 4n,
    proposalId: 27n,
    blockOffset: 6_000n,
    script: "source",
    name: "signal-explicit-execute",
  },
] as const;

type Variant = (typeof FIXTURE_VARIANTS)[number];

type FixtureConfiguration = {
  contractGeneration: "1";
  configurationId: "config-1" | "config-2";
  voteStartOffsetSeconds: number;
  votingPeriodSeconds: number;
  votingWindowState: "enabled" | "disabled_zero_length";
  executionDelaySeconds: number;
  executionGuard: "guarded" | "permissionless";
  voterAddress: string;
  voterState: "configured" | "disabled_zero_address";
  voterImplementation: ReturnType<typeof pinnedVoterImplementation>;
  delegatedStakingAddress: string;
  delegatedStakingState: "configured" | "zero_address";
  ybcAddress: string;
  ybcState: "configured" | "zero_address";
  ybcWeightAggregatorAddress: string;
  ybcWeightAggregatorState: "configured" | "zero_address";
  executorAddress: string;
  executorState: "configured" | "uninitialized_zero_address";
  executorImplementation: ReturnType<typeof pinnedExecutorImplementation>;
  votingHookAddress: string;
  votingHookState: "configured" | "zero_address";
  weightMeasureAddress: string;
  weightMeasureState: "configured" | "zero_address";
  proposalBlacklistAddress: string;
  proposalBlacklistState: "configured" | "uninitialized_zero_address";
  operatorAddress: string;
  operatorState: "configured" | "zero_address";
  guardianAddress: string;
  effectiveAt: {
    blockNumber: string;
    blockHash: Hex;
    transactionIndex: number;
    logIndex: number;
  };
};

function pinnedVoterImplementation(
  address: string,
  effectiveAt: FixtureConfiguration["effectiveAt"]
) {
  const runtimeHash = fixedHex32(BigInt(address));
  const buildArtifactSha256 = fixedHex32(BigInt(address) + 1n);
  return {
    state: "verified_pinned" as const,
    address,
    source: PINNED_VOTER_SOURCE,
    sourceSha256:
      "0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab" as const,
    compiler: "vyper@0.4.2" as const,
    optimization: "gas" as const,
    evmVersion: "cancun" as const,
    immutableGenesisTimestamp: VOTER_GENESIS_TIMESTAMP,
    compiledRuntimeBytecodeHash: runtimeHash,
    bytecode: {
      evidenceKind: "archive_rpc_and_reproducible_build" as const,
      rpcMethod: "eth_getCode" as const,
      hashMethod: "keccak256" as const,
      address,
      blockNumber: effectiveAt.blockNumber,
      blockHash: effectiveAt.blockHash,
      codeByteLength: 3_072,
      deployedBytecodeHash: runtimeHash,
      buildArtifactSha256,
      buildEvidenceSha256: deriveDaoVoterBuildEvidenceSha256({
        constructorGenesisTimestamp: VOTER_GENESIS_TIMESTAMP,
        compiledRuntimeBytecodeHash: runtimeHash,
        codeByteLength: 3_072,
        deployedBytecodeHash: runtimeHash,
        buildArtifactSha256,
      }),
      constructorGenesisTimestamp: VOTER_GENESIS_TIMESTAMP,
    },
    classificationSemantics:
      "pinned_voter_trace_required_for_human_and_aggregate_labels" as const,
    error: null,
  };
}

function pinnedExecutorImplementation(
  address: string,
  effectiveAt: FixtureConfiguration["effectiveAt"]
) {
  return {
    state: "verified_pinned" as const,
    address,
    source: PINNED_EXECUTOR_SOURCE,
    sourceSha256: PINNED_EXECUTOR_SOURCE_SHA256,
    compiler: "vyper@0.4.2" as const,
    compilerIntegritySha256: PINNED_EXECUTOR_COMPILER_INTEGRITY_SHA256,
    optimization: "gas" as const,
    evmVersion: "cancun" as const,
    experimentalCodegen: false as const,
    compiledRuntimeByteLength: PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH,
    compiledRuntimeBytecodeHash: PINNED_EXECUTOR_RUNTIME_KECCAK256,
    compiledRuntimeArtifactSha256: PINNED_EXECUTOR_RUNTIME_SHA256,
    bytecode: {
      evidenceKind: "archive_rpc_and_reproducible_build" as const,
      rpcMethod: "eth_getCode" as const,
      hashMethod: "keccak256" as const,
      address,
      blockNumber: effectiveAt.blockNumber,
      blockHash: effectiveAt.blockHash,
      blockHashVerification: "canonical_hash_at_height" as const,
      codeByteLength: PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH,
      deployedBytecodeHash: PINNED_EXECUTOR_RUNTIME_KECCAK256,
      buildArtifactSha256: PINNED_EXECUTOR_RUNTIME_SHA256,
    },
    executionSemantics:
      "pinned_executor_32_byte_header_96_bit_length_max_64_calls" as const,
    error: null,
  };
}

const FIXTURE_CONFIGURATIONS: readonly FixtureConfiguration[] = [
  {
    contractGeneration: "1",
    configurationId: "config-1",
    voteStartOffsetSeconds: 604_800,
    votingPeriodSeconds: 604_800,
    votingWindowState: "enabled",
    executionDelaySeconds: 86_400,
    executionGuard: "guarded",
    voterAddress: DAO_MOCK_VOTER_ADDRESS,
    voterState: "configured",
    voterImplementation: pinnedVoterImplementation(
      DAO_MOCK_VOTER_ADDRESS,
      {
        blockNumber: "23900000",
        blockHash: fixedHex32(23_900_000n),
        transactionIndex: 0,
        logIndex: 0,
      }
    ),
    delegatedStakingAddress: DAO_MOCK_STYFIX_AGGREGATE_ADDRESS,
    delegatedStakingState: "configured",
    ybcAddress: DAO_MOCK_YBC_AGGREGATE_ADDRESS,
    ybcState: "configured",
    ybcWeightAggregatorAddress: YBC_WEIGHT_AGGREGATOR_ADDRESS,
    ybcWeightAggregatorState: "configured",
    executorAddress: DAO_MOCK_EXECUTOR_ADDRESS,
    executorState: "configured",
    executorImplementation: pinnedExecutorImplementation(
      DAO_MOCK_EXECUTOR_ADDRESS,
      {
        blockNumber: "23900000",
        blockHash: fixedHex32(23_900_000n),
        transactionIndex: 0,
        logIndex: 0,
      }
    ),
    votingHookAddress: VOTING_HOOK_ADDRESS,
    votingHookState: "configured",
    weightMeasureAddress: WEIGHT_MEASURE_ADDRESS,
    weightMeasureState: "configured",
    proposalBlacklistAddress: PROPOSAL_BLACKLIST_ADDRESS,
    proposalBlacklistState: "configured",
    operatorAddress: DAO_MOCK_OPERATOR_ADDRESS,
    operatorState: "configured",
    guardianAddress: DAO_MOCK_GUARDIAN_ADDRESS,
    effectiveAt: {
      blockNumber: "23900000",
      blockHash: fixedHex32(23_900_000n),
      transactionIndex: 0,
      logIndex: 0,
    },
  },
  {
    contractGeneration: "1",
    configurationId: "config-2",
    voteStartOffsetSeconds: 604_700,
    votingPeriodSeconds: 604_900,
    votingWindowState: "enabled",
    executionDelaySeconds: 172_800,
    executionGuard: "permissionless",
    voterAddress: CHANGED_VOTER_ADDRESS,
    voterState: "configured",
    voterImplementation: pinnedVoterImplementation(CHANGED_VOTER_ADDRESS, {
      blockNumber: CONFIGURATION_CHANGE_BLOCK.toString(),
      blockHash: fixedHex32(CONFIGURATION_CHANGE_BLOCK),
      transactionIndex: 0,
      logIndex: 0,
    }),
    delegatedStakingAddress: CHANGED_STYFIX_AGGREGATE_ADDRESS,
    delegatedStakingState: "configured",
    ybcAddress: CHANGED_YBC_AGGREGATE_ADDRESS,
    ybcState: "configured",
    ybcWeightAggregatorAddress: CHANGED_YBC_WEIGHT_AGGREGATOR_ADDRESS,
    ybcWeightAggregatorState: "configured",
    executorAddress: CHANGED_EXECUTOR_ADDRESS,
    executorState: "configured",
    executorImplementation: pinnedExecutorImplementation(
      CHANGED_EXECUTOR_ADDRESS,
      {
        blockNumber: CONFIGURATION_CHANGE_BLOCK.toString(),
        blockHash: fixedHex32(CONFIGURATION_CHANGE_BLOCK),
        transactionIndex: 0,
        logIndex: 0,
      }
    ),
    votingHookAddress: CHANGED_VOTING_HOOK_ADDRESS,
    votingHookState: "configured",
    weightMeasureAddress: CHANGED_WEIGHT_MEASURE_ADDRESS,
    weightMeasureState: "configured",
    proposalBlacklistAddress: CHANGED_PROPOSAL_BLACKLIST_ADDRESS,
    proposalBlacklistState: "configured",
    operatorAddress: CHANGED_OPERATOR_ADDRESS,
    operatorState: "configured",
    guardianAddress: CHANGED_GUARDIAN_ADDRESS,
    effectiveAt: {
      blockNumber: CONFIGURATION_CHANGE_BLOCK.toString(),
      blockHash: fixedHex32(CONFIGURATION_CHANGE_BLOCK),
      transactionIndex: 0,
      logIndex: 0,
    },
  },
];

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
        lastAttemptAt: GENERATED_AT,
        policy: "fixed_120_seconds",
        lastFailure: null,
        nextRetryAt: null,
        backoffSeconds: null,
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
        rawContentBytes: "indefinite",
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
        deploymentBlock: {
          number: "23900000",
          hash: deploymentHash,
          timestamp: null,
        },
        deployedBytecodeHash: fixedHex32(99_999n),
        startBlock: "23900000",
        genesisTimestamp: DAO_GENESIS_TIMESTAMP,
        epochLengthSeconds: DAO_FEED_EPOCH_LENGTH_SECONDS,
        configurationHistory: FIXTURE_CONFIGURATIONS.map((configuration) => ({
          ...configuration,
          source: PINNED_SOURCE,
        })),
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
  const exactScript =
    variant?.script === "source"
      ? source.script.bytes
      : variant
        ? variant.script
        : source.script.bytes;
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
      contentDigest: content.expectedDigest,
      exactScript,
      blockOffset,
    })
  );
  if (source.ref.proposalId === 13n && variant === null) {
    repairPostVetoVoteInvocations(events, source, ref);
  }
  if (variant?.name === "signal-explicit-execute") {
    addSignalExecuteEvent(events, source, ref);
  }
  decorateVetoEvidence(events);
  const propose = events.find((event) => event.type === "propose");
  if (!propose) throw new Error("Every fixture proposal needs a Propose event.");
  const configuration = configurationForPosition(propose.log);
  const statusConfiguration = FIXTURE_CONFIGURATIONS.at(-1)!;
  const votingEpoch = Number(source.votingEpoch);
  const voteStartsAt =
    DAO_GENESIS_TIMESTAMP +
    votingEpoch * DAO_FEED_EPOCH_LENGTH_SECONDS +
    statusConfiguration.voteStartOffsetSeconds;
  const voteEndsAt = voteStartsAt + statusConfiguration.votingPeriodSeconds;
  const followingEpochStart =
    DAO_GENESIS_TIMESTAMP +
    (votingEpoch + 1) * DAO_FEED_EPOCH_LENGTH_SECONDS;
  const executionStartsAt =
    source.type === "executable"
      ? followingEpochStart + statusConfiguration.executionDelaySeconds
      : null;
  const executionEndsAt =
    source.type === "executable"
      ? followingEpochStart + DAO_FEED_EPOCH_LENGTH_SECONDS
      : null;
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
    exactScript === null
      ? null
      : keccak256(exactScript) === storedScriptHash,
    proposalId,
    configuration
  );
  const flagReason = getModerationReason(events, "flag");
  const vetoReason = getModerationReason(events, "veto");
  const classifiedHumanCount = new Set(
    events
      .filter(
        (event) => event.type === "vote" && event.data.actorKind === "human"
      )
      .map((event) =>
        (event.actor as { address?: string }).address?.toLowerCase()
      )
      .filter((address): address is string => address !== undefined)
  ).size;
  const unclassifiedVoteEventCount = events.filter(
    (event) =>
      event.type === "vote" && event.data.actorKind === "unclassified"
  ).length;

  return {
    ref,
    contractGeneration: "1",
    proposer: source.proposer,
    votingEpoch: source.votingEpoch.toString(),
    chainCreatedAt:
      propose.log.timestamp === null
        ? {
            state: "unavailable",
            timestamp: null,
            source: null,
            observedAt: null,
            error: failure(
              "PROPOSE_BLOCK_TIME_UNAVAILABLE",
              "The canonical Propose block timestamp is unavailable.",
              false,
              "provenance"
            ),
          }
        : {
            state: "available",
            timestamp: propose.log.timestamp,
            source: "propose_block_timestamp",
            observedAt: eventPosition(propose.log),
            error: null,
          },
    statusConfiguration: {
      configurationId: statusConfiguration.configurationId,
      effectiveAt: statusConfiguration.effectiveAt,
      observationSemantics: "effective_at_end_of_canonical_block",
    },
    voteStartsAt,
    voteEndsAt,
    executionStartsAt,
    executionEndsAt,
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
      humanParticipation:
        unclassifiedVoteEventCount === 0
          ? {
              state: "complete",
              classifiedHumanCount,
              unclassifiedVoteEventCount: 0,
              error: null,
            }
          : {
              state: "lower_bound",
              classifiedHumanCount,
              unclassifiedVoteEventCount,
              error: failure(
                "VOTER_TRACE_UNAVAILABLE",
                "At least one raw Vote event could not be classified without the pinned Voter call trace.",
                true,
                "provenance"
              ),
            },
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
        ...configurationValues(configuration),
        observedAt: configuration.effectiveAt,
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
              transactionSender: source.proposer,
              effectiveGasPriceWei: "1",
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
  expectedCid: string;
  expectedDigest: Hex;
  computedCid: string | null;
  computedDigest: Hex | null;
  digestComparison: "verified" | "mismatch" | "unavailable";
  canonicalJson: string | null;
  rawBytesBase64: string | null;
  byteLength: number | null;
  value: DaoProposal["content"]["value"];
  retry: unknown;
  assetRecords: unknown[];
  attachmentRecords: unknown[];
  error: unknown;
} {
  const baseRetry = {
    state: "succeeded" as const,
    attempts: 1,
    maxAttempts: 8,
    lastAttemptAt: GENERATED_AT,
    nextRetryAt: null,
    policy: "fixed_120_seconds" as const,
    backoffSeconds: null,
  };
  if (source.content.state === "unavailable") {
    return {
      state: "unavailable",
      expectedCid: createDaoRawSha256Cid(source.content.digest),
      expectedDigest: source.content.digest,
      computedCid: null,
      computedDigest: null,
      digestComparison: "unavailable",
      canonicalJson: null,
      rawBytesBase64: null,
      byteLength: null,
      value: null,
      retry: { ...baseRetry, state: "exhausted", attempts: 8 },
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
    const rawBytes = toBytes('{"schema":"yearn.dao.proposal.invalid"');
    const digest = sha256(rawBytes);
    return {
      state: "invalid",
      expectedCid: createDaoRawSha256Cid(source.content.digest),
      expectedDigest: source.content.digest,
      computedCid: createDaoRawSha256Cid(digest),
      computedDigest: digest,
      digestComparison:
        digest === source.content.digest ? "verified" : "mismatch",
      canonicalJson: null,
      rawBytesBase64: bytesToBase64(rawBytes),
      byteLength: rawBytes.byteLength,
      value: null,
      retry: { ...baseRetry, state: "non_retryable" },
      assetRecords: [],
      attachmentRecords: [],
      error: failure(
        digest === source.content.digest
          ? "CONTENT_SCHEMA_INVALID"
          : "CONTENT_DIGEST_MISMATCH",
        digest === source.content.digest
          ? source.content.error ?? "Proposal content was invalid."
          : "Fetched content bytes do not match the expected onchain SHA-256 digest.",
        false,
        "content"
      ),
    };
  }
  if (!source.content.value) throw new Error("Available content needs its value.");
  const contentValue =
    source.ref.proposalId === 1n
      ? {
          ...source.content.value,
          createdAt: new Date(source.createdAt * 1_000 - 60_000).toISOString(),
        }
      : source.content.value;
  const canonicalJson = new TextDecoder().decode(
    canonicalizeDaoProposalContent(contentValue)
  );
  const digest = sha256(toBytes(canonicalJson));
  const assetRecords = contentValue.assets.map((asset) => {
    const cid = createDaoRawSha256Cid(asset.digest);
    return {
      ...asset,
      cid,
      gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
      state: "available",
      retry: {
        state: "succeeded",
        attempts: 1,
        maxAttempts: 8,
        lastAttemptAt: GENERATED_AT,
        nextRetryAt: null,
        policy: "fixed_120_seconds",
        backoffSeconds: null,
      },
      error: null,
    };
  });
  const parsed = parseDaoProposalContent(contentValue);
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
    expectedCid: createDaoRawSha256Cid(digest),
    expectedDigest: digest,
    computedCid: createDaoRawSha256Cid(digest),
    computedDigest: digest,
    digestComparison: "verified",
    canonicalJson,
    rawBytesBase64: null,
    byteLength: new TextEncoder().encode(canonicalJson).byteLength,
    value: contentValue,
    retry: baseRetry,
    assetRecords,
    attachmentRecords,
    error: null,
  };
}

function createDiscussion(source: DaoProposal): unknown {
  const discussion = source.discussion;
  if (discussion.state === "verified") {
    return {
      ...discussion,
      rootCategoryId: 5,
      categoryId: 5,
      category: "Proposals",
      categorySlugPath: ["proposals"],
      categoryAncestryIds: [5],
      membership: "root",
      error: null,
    };
  }
  if (discussion.state === "unverified") {
    return {
      ...discussion,
      rootCategoryId: null,
      categorySlugPath: [],
      categoryAncestryIds: [],
      membership: null,
      error: null,
    };
  }
  return {
    ...discussion,
    rootCategoryId: null,
    categorySlugPath: [],
    categoryAncestryIds: [],
    membership: null,
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
  scriptHashVerified: boolean | null,
  proposalId: bigint,
  configuration: FixtureConfiguration
): unknown {
  if (
    variant &&
    ["missing-script", "malformed-script", "zero-target-script"].includes(
      variant.name
    )
  ) {
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
      generatedAt: GENERATED_AT,
      registryVersion: "yearn-dao-registry/v1",
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
  const calls = sourceAnalysis.calls.map((call) =>
    createCall(call, sourceAnalysis.generatedAt ?? GENERATED_AT)
  );
  if (scriptHashVerified === false) {
    return {
      state: "complete",
      generatedAt: GENERATED_AT,
      registryVersion:
        sourceAnalysis.registryVersion ?? "yearn-dao-registry/v1",
      calls,
      proposalSimulation: unavailableSimulation(
        "SCRIPT_HASH_MISMATCH",
        "The exact retained script bytes do not match the stored proposal script hash."
      ),
      error: null,
    };
  }
  const failed = sourceAnalysis.proposalSimulation.state === "failed";
  const storageSlots = deriveDaoVotingExecutedStorageSlots(proposalId);
  const harnessRevision = "dao-feed-v1-fixture";
  const harnessArtifactSha256 = fixedHex32(77_777n);
  const blockGasLimit = "36000000";
  const blockBaseFeePerGasWei = "1";
  const executorFrameInitialGas = "30000000";
  const effectiveGasPriceWei = "1";
  if (proposeLog.transactionHash === null) {
    throw new Error(
      "Completed proposal simulation requires the authenticated Propose transaction hash."
    );
  }
  if (proposeLog.timestamp === null) {
    throw new Error(
      "Completed proposal simulation requires the authenticated Propose block timestamp."
    );
  }
  const executorImplementation = {
    ...configuration.executorImplementation,
    bytecode: {
      ...configuration.executorImplementation.bytecode,
      blockNumber: proposeLog.blockNumber,
      blockHash: proposeLog.blockHash,
    },
  };
  const contextInputsSha256 = deriveDaoSimulationContextInputsSha256({
    blockNumber: proposeLog.blockNumber,
    blockHash: proposeLog.blockHash,
    blockGasLimit,
    blockBaseFeePerGasWei,
    proposeTransactionHash: proposeLog.transactionHash,
    proposeTransactionSender: sourceProposal.proposer,
    proposeReceiptBlockNumber: proposeLog.blockNumber,
    proposeReceiptBlockHash: proposeLog.blockHash,
    proposeReceiptEffectiveGasPriceWei: effectiveGasPriceWei,
    transactionOrigin: sourceProposal.proposer,
    votingCaller: DAO_MOCK_VOTING_ADDRESS,
    executorAddress: configuration.executorAddress as Address,
    executorCaller: DAO_MOCK_VOTING_ADDRESS,
    executorCodeAddress: configuration.executorAddress as Address,
    targetCaller: configuration.executorAddress as Address,
    harnessRevision,
    harnessArtifactSha256,
    scriptHash,
    executorSourceRevision: executorImplementation.source.revision,
    executorSourcePath: executorImplementation.source.sourcePath,
    executorSourceSha256: executorImplementation.sourceSha256,
    executorCompilerIntegritySha256:
      executorImplementation.compilerIntegritySha256,
    executorRuntimeByteLength:
      executorImplementation.compiledRuntimeByteLength,
    executorRuntimeBytecodeHash:
      executorImplementation.compiledRuntimeBytecodeHash,
    executorRuntimeArtifactSha256:
      executorImplementation.compiledRuntimeArtifactSha256,
    executorEvidenceAddress:
      executorImplementation.bytecode.address as Address,
    executorEvidenceBlockNumber:
      executorImplementation.bytecode.blockNumber,
    executorEvidenceBlockHash: executorImplementation.bytecode.blockHash,
    executorEvidenceCodeByteLength:
      executorImplementation.bytecode.codeByteLength,
    executorEvidenceDeployedBytecodeHash:
      executorImplementation.bytecode.deployedBytecodeHash,
    executorFrameInitialGas,
    effectiveGasPriceWei,
  });
  return {
    state: sourceAnalysis.state,
    generatedAt: sourceAnalysis.generatedAt,
    registryVersion: sourceAnalysis.registryVersion,
    calls,
    proposalSimulation: {
      state: failed ? "failed" : "succeeded",
      method: "revm_engine_injected_executor_frame_conditional_origin",
      engine: "revm@34",
      executorAddress: configuration.executorAddress,
      scriptHash,
      blockNumber: proposeLog.blockNumber,
      blockHash: proposeLog.blockHash,
      simulatedAt: sourceAnalysis.proposalSimulation.simulatedAt ?? GENERATED_AT,
      stateTimestamp: proposeLog.timestamp,
      timestampMode: "block",
      timestampOverride: null,
      caller: DAO_MOCK_VOTING_ADDRESS,
      transactionOrigin: sourceProposal.proposer,
      originPolicy: {
        state: "frozen_hypothetical_scenario",
        source: "propose_transaction_sender",
        semantics:
          "conditional_on_recorded_origin_block_gas_frame_and_state",
        proposalTransactionHash: proposeLog.transactionHash,
      },
      frameContext: {
        entry: "engine_injected",
        outerVotingCall: "not_simulated",
        executorCaller: DAO_MOCK_VOTING_ADDRESS,
        executorCodeAddress: configuration.executorAddress,
        targetCaller: configuration.executorAddress,
        callValue: "0",
        noCodeOverrides: true,
        operatorCheckExecuted: true,
        executorImplementation,
        harness: {
          name: "gov-apps-stats-revm-frame-injector",
          revision: harnessRevision,
          artifactSha256: harnessArtifactSha256,
        },
        gasContext: {
          derivationPolicy:
            "min_propose_block_gas_limit_and_30000000",
          gasPricePolicy: "propose_receipt_effective_gas_price",
          executorFrameGasCap: "30000000",
          executorFrameInitialGas,
          effectiveGasPriceWei,
          blockHeader: {
            evidenceKind: "archive_rpc",
            rpcMethod: "eth_getBlockByHash",
            blockNumber: proposeLog.blockNumber,
            blockHash: proposeLog.blockHash,
            gasLimit: blockGasLimit,
            baseFeePerGasWei: blockBaseFeePerGasWei,
          },
          proposeReceipt: {
            evidenceKind: "archive_rpc",
            rpcMethod: "eth_getTransactionReceipt",
            transactionHash: proposeLog.transactionHash,
            transactionSender: sourceProposal.proposer,
            blockNumber: proposeLog.blockNumber,
            blockHash: proposeLog.blockHash,
            status: "success",
            effectiveGasPriceWei,
          },
          transactionEnvelope: "synthetic_legacy_no_blobs",
          accessList: [],
          initialWarmSetPolicy:
            "cancun_frame_entry_origin_voting_executor_and_precompiles_no_storage",
          contextInputsSha256,
        },
      },
      stateOverrides: [
        {
          kind: "voting_proposal_executed_flag",
          votingAddress: DAO_MOCK_VOTING_ADDRESS,
          proposalId: proposalId.toString(),
          fromValue: false,
          toValue: true,
          proof: {
            source: PINNED_SOURCE,
            storageLayout: {
              compiler: "vyper@0.4.2",
              sourceSha256:
                "0x6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e",
              derivation:
                "keccak256(bytes32(mapping_base_slot) || bytes32(proposal_id)) + executed_field_slot_offset",
              layoutArtifactSha256:
                "0x0f963a37d02adeb6a34fabb98ab37b118031ac9b7380e4ad65ac2765b4b6db26",
              mappingBaseSlot: "17",
              mappingKey: proposalId.toString(),
              mappingHashInputOrder: "slot_then_key",
              proposalStorageBaseSlot:
                storageSlots.proposalStorageBaseSlot,
              executedFieldSlotOffset: 8,
              resolvedStorageSlot: storageSlots.resolvedStorageSlot,
              preStorageWord: fixedHex32(0n),
              postStorageWord: fixedHex32(1n),
            },
            bytecode: {
              evidenceKind: "archive_rpc",
              rpcMethod: "eth_getCode",
              hashMethod: "keccak256",
              address: DAO_MOCK_VOTING_ADDRESS,
              blockNumber: proposeLog.blockNumber,
              blockHash: proposeLog.blockHash,
              blockHashVerification: "canonical_hash_at_height",
              codeByteLength: 4_096,
              deployedBytecodeHash: fixedHex32(99_999n),
              derivation:
                "keccak256(eth_getCode(voting_address, propose_block_number))",
            },
          },
        },
      ],
      atomic: true,
      result: failed ? "revert" : "success",
      error: failed
        ? failureAt(
            "TARGET_CALL_REVERTED",
            "The complete ordered script reverted atomically.",
            false,
            "simulation",
            sourceAnalysis.proposalSimulation.simulatedAt ?? GENERATED_AT
          )
        : null,
    },
    error: failed
      ? failureAt(
          "SIMULATION_REVERTED",
          "Proposal-time simulation reverted.",
          false,
          "simulation",
          sourceAnalysis.generatedAt ?? GENERATED_AT
        )
      : null,
  };
}

function createCall(call: DaoDecodedCall, observedAt: string): unknown {
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
    error: failureAt(
      "CALL_DECODE_FAILED",
      "The call could not be decoded with its candidate source.",
      false,
      "decoder",
      observedAt
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
  const configuration = configurationForPosition(log);
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
    const emittedActor =
      actorKind === "delegated_staking_aggregate"
        ? configuration.delegatedStakingAddress
        : actorKind === "ybc_aggregate"
          ? configuration.ybcAddress
          : event.actor;
    const traceUnavailable =
      source.ref.proposalId === 14n && event.log.logIndex === 1;
    const raw = encodeDaoFeedLifecycleEventAbi({
      type: "vote",
      votingAddress: source.ref.votingAddress,
      proposalId: BigInt(ref.proposalId),
      account: emittedActor as `0x${string}`,
      weight: event.weight ?? 0n,
      yeaBps: BigInt(event.yeaBps ?? 0),
    });
    return {
      ...common,
      actor: eventArgumentActor(
        emittedActor,
        traceUnavailable ? "unknown" : role
      ),
      type: event.type,
      data: {
        actorKind: traceUnavailable ? "unclassified" : actorKind,
        yeaBps: event.yeaBps,
        direction: traceUnavailable ? null : event.direction,
        weight: event.weight?.toString(),
        weightSemantics: "absolute_actor_contribution",
        countsAsHumanParticipation:
          !traceUnavailable && actorKind === "human",
        classification: traceUnavailable
          ? pinnedVoterTraceUnavailable(configuration)
          : pinnedVoterCallTraceClassification({
              configuration,
              source,
              ref,
              log,
              emittedAccount: emittedActor,
              actorKind,
              sourceEvent: event,
            }),
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
          configurationId: null,
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
                configurationId: null,
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
              observedAt: configuration.effectiveAt,
              configurationId: configuration.configurationId,
              transactionSender: event.actor,
              configuredRoleAddress:
                event.type === "flag"
                  ? configuration.operatorAddress
                  : configuration.guardianAddress,
                error: null,
              },
            },
      type: event.type,
      data: {
        reason,
        ...(event.type === "veto"
          ? {
              branch: "early_no_votes",
              voteTotalsAtVeto: {
                totalWeight: "0",
                yeaWeight: "0",
                nayWeight: "0",
                aggregateSemantics:
                  "last_event_per_actor_at_event_position",
              },
            }
          : {}),
        abi: availableAbi(raw),
      },
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

function pinnedVoterCallTraceClassification({
  configuration,
  source,
  ref,
  log,
  emittedAccount,
  actorKind,
  sourceEvent,
}: {
  configuration: FixtureConfiguration;
  source: DaoProposal;
  ref: WireEventDraft["proposalRef"];
  log: WireLog;
  emittedAccount: string;
  actorKind:
    | "human"
    | "delegated_staking_aggregate"
    | "ybc_aggregate"
    | null;
  sourceEvent: DaoProposalEvent;
}): unknown {
  if (actorKind === null || log.transactionHash === null) {
    throw new Error(
      "Pinned Voter fixture classification requires an actor kind and transaction hash."
    );
  }
  const invocationHuman = source.events.find(
    (candidate) =>
      candidate.type === "vote" &&
      candidate.voteActorKind === "human" &&
      candidate.log.transactionHash === sourceEvent.log.transactionHash
  );
  if (
    !invocationHuman ||
    invocationHuman.direction === null ||
    invocationHuman.log.transactionHash === null
  ) {
    throw new Error(
      "Pinned Voter fixture invocation requires one directional human Vote."
    );
  }
  const ordinal =
    actorKind === "human"
      ? 0
      : actorKind === "delegated_staking_aggregate"
        ? 1
        : 2;
  const hasAggregateTriplet = source.ref.proposalId === 2n;
  return pinnedVoterClassification({
    configuration,
    ref,
    log,
    emittedAccount,
    voterCaller: invocationHuman.actor,
    voterDirection: invocationHuman.direction,
    ordinal,
    ybcMembership: hasAggregateTriplet,
    aggregatePathExecuted: hasAggregateTriplet,
    aggregatorResult: hasAggregateTriplet
      ? { state: "returned_positive", weight: "1" }
      : { state: "skipped_non_member", weight: null },
  });
}

function pinnedVoterClassification({
  configuration,
  ref,
  log,
  emittedAccount,
  voterCaller,
  voterDirection,
  ordinal,
  ybcMembership,
  aggregatePathExecuted,
  aggregatorResult,
}: {
  configuration: FixtureConfiguration;
  ref: WireEventDraft["proposalRef"];
  log: WireLog;
  emittedAccount: string;
  voterCaller: string;
  voterDirection: "yea" | "nay";
  ordinal: 0 | 1 | 2;
  ybcMembership: boolean;
  aggregatePathExecuted: boolean;
  aggregatorResult:
    | { state: "skipped_non_member"; weight: null }
    | { state: "returned_zero"; weight: "0" }
    | { state: "returned_positive"; weight: string };
}): unknown {
  if (log.transactionHash === null) {
    throw new Error("Pinned Voter fixture trace requires a transaction hash.");
  }
  const voterCallTraceAddress = [0];
  return {
    method: "pinned_voter_call_trace",
    configurationId: configuration.configurationId,
    voterAddress: configuration.voterAddress,
    delegatedStakingAddress: configuration.delegatedStakingAddress,
    ybcAddress: configuration.ybcAddress,
    ybcWeightAggregatorAddress: configuration.ybcWeightAggregatorAddress,
    voterImplementationState: "verified_pinned",
    observedAt: configuration.effectiveAt,
    observationSemantics: "effective_at_event",
    trace: {
      invocationId: `${ref.chainId}:${ref.votingAddress.toLowerCase()}:${log.transactionHash}:0`,
      transactionHash: log.transactionHash,
      voterCallTraceAddress,
      votingCallTraceAddress: [...voterCallTraceAddress, ordinal],
      voterCallDepth: voterCallTraceAddress.length,
      votingCallDepth: voterCallTraceAddress.length + 1,
      voterSelector:
        voterDirection === "yea" ? "0x69586e2e" : "0xff855dde",
      voterCaller,
      votingTarget: ref.votingAddress,
      proposalId: ref.proposalId,
      votingCallOrdinal: ordinal,
      emittedAccount,
      ybcMembership,
      aggregatePathExecuted,
      aggregatorResult,
    },
    error: null,
  };
}

function pinnedVoterTraceUnavailable(
  configuration: FixtureConfiguration
): unknown {
  return {
    method: "pinned_voter_trace_unavailable",
    configurationId: configuration.configurationId,
    voterAddress: configuration.voterAddress,
    delegatedStakingAddress: configuration.delegatedStakingAddress,
    ybcAddress: configuration.ybcAddress,
    ybcWeightAggregatorAddress: configuration.ybcWeightAggregatorAddress,
    voterImplementationState: "verified_pinned",
    observedAt: configuration.effectiveAt,
    observationSemantics: "effective_at_event",
    trace: null,
    error: failure(
      "VOTER_TRACE_UNAVAILABLE",
      "The authenticated raw Vote log is retained, but its pinned Voter call trace is unavailable.",
      true,
      "provenance"
    ),
  };
}

function repairPostVetoVoteInvocations(
  events: WireEventDraft[],
  source: DaoProposal,
  ref: WireEventDraft["proposalRef"]
): void {
  const propose = events.find((event) => event.type === "propose");
  const sourceVotes = source.events.filter((event) => event.type === "vote");
  const wireVotes = events.filter((event) => event.type === "vote");
  const firstSourceVote = sourceVotes[0];
  const secondSourceVote = sourceVotes[1];
  const firstWireVote = wireVotes[0];
  const secondWireVote = wireVotes[1];
  const vetoIndex = events.findIndex((event) => event.type === "veto");
  if (
    !propose ||
    !firstSourceVote ||
    !secondSourceVote ||
    !firstWireVote ||
    !secondWireVote ||
    firstSourceVote.direction === null ||
    secondSourceVote.direction === null ||
    firstSourceVote.weight === null ||
    secondSourceVote.weight === null ||
    vetoIndex < 1
  ) {
    throw new Error(
      "The proposal-13 fixture needs Propose, two human Votes, and Veto."
    );
  }
  const veto = events[vetoIndex]!;
  const configuration = configurationForPosition(firstWireVote.log);
  const positiveAggregatorResult = {
    state: "returned_positive" as const,
    weight: "50000000000000000000",
  };
  const firstHumanLog = { ...firstWireVote.log, logIndex: 1 };
  const delegatedLog = { ...firstHumanLog, logIndex: 2 };
  const ybcLog = { ...firstHumanLog, logIndex: 3 };
  const returnedZeroLog = { ...secondWireVote.log, logIndex: 4 };
  const vetoLog = { ...veto.log, logIndex: 5 };
  const firstHuman = createPinnedSyntheticVoteEvent({
    source,
    ref,
    log: firstHumanLog,
    actorAddress: firstSourceVote.actor,
    weight: firstSourceVote.weight.toString(),
    yeaBps: firstSourceVote.yeaBps ?? 10_000,
    direction: firstSourceVote.direction,
    actorKind: "human",
    voterCaller: firstSourceVote.actor,
    voterDirection: firstSourceVote.direction,
    ordinal: 0,
    ybcMembership: true,
    aggregatePathExecuted: true,
    aggregatorResult: positiveAggregatorResult,
  });
  const delegated = createPinnedSyntheticVoteEvent({
    source,
    ref,
    log: delegatedLog,
    actorAddress: configuration.delegatedStakingAddress,
    weight: "0",
    yeaBps: 5_000,
    direction: null,
    actorKind: "delegated_staking_aggregate",
    voterCaller: firstSourceVote.actor,
    voterDirection: firstSourceVote.direction,
    ordinal: 1,
    ybcMembership: true,
    aggregatePathExecuted: true,
    aggregatorResult: positiveAggregatorResult,
  });
  const ybc = createPinnedSyntheticVoteEvent({
    source,
    ref,
    log: ybcLog,
    actorAddress: configuration.ybcAddress,
    weight: "0",
    yeaBps: 5_000,
    direction: null,
    actorKind: "ybc_aggregate",
    voterCaller: firstSourceVote.actor,
    voterDirection: firstSourceVote.direction,
    ordinal: 2,
    ybcMembership: true,
    aggregatePathExecuted: true,
    aggregatorResult: positiveAggregatorResult,
  });
  const returnedZeroHuman = createPinnedSyntheticVoteEvent({
    source,
    ref,
    log: returnedZeroLog,
    actorAddress: secondSourceVote.actor,
    weight: secondSourceVote.weight.toString(),
    yeaBps: secondSourceVote.yeaBps ?? 0,
    direction: secondSourceVote.direction,
    actorKind: "human",
    voterCaller: secondSourceVote.actor,
    voterDirection: secondSourceVote.direction,
    ordinal: 0,
    ybcMembership: true,
    aggregatePathExecuted: true,
    aggregatorResult: { state: "returned_zero", weight: "0" },
  });
  events.splice(0, events.length, propose, firstHuman, delegated, ybc, returnedZeroHuman, {
    ...veto,
    eventId: createDaoFeedEventId(ref.chainId, ref.votingAddress, vetoLog),
    log: vetoLog,
  });
}

function createPinnedSyntheticVoteEvent({
  source,
  ref,
  log,
  actorAddress,
  weight,
  yeaBps,
  direction,
  actorKind,
  voterCaller,
  voterDirection,
  ordinal,
  ybcMembership,
  aggregatePathExecuted,
  aggregatorResult,
}: {
  source: DaoProposal,
  ref: WireEventDraft["proposalRef"],
  log: WireLog,
  actorAddress: string,
  weight: string,
  yeaBps: number,
  direction: "yea" | "nay" | null,
  actorKind: "human" | "delegated_staking_aggregate" | "ybc_aggregate",
  voterCaller: string,
  voterDirection: "yea" | "nay",
  ordinal: 0 | 1 | 2,
  ybcMembership: boolean,
  aggregatePathExecuted: boolean,
  aggregatorResult:
    | { state: "skipped_non_member"; weight: null }
    | { state: "returned_zero"; weight: "0" }
    | { state: "returned_positive"; weight: string },
}): WireEventDraft {
  const configuration = configurationForPosition(log);
  const raw = encodeDaoFeedLifecycleEventAbi({
    type: "vote",
    votingAddress: source.ref.votingAddress,
    proposalId: BigInt(ref.proposalId),
    account: actorAddress as `0x${string}`,
    weight: BigInt(weight),
    yeaBps: BigInt(yeaBps),
  });
  return {
    eventId: createDaoFeedEventId(ref.chainId, ref.votingAddress, log),
    proposalRef: ref,
    contractGeneration: "1",
    log,
    actor: eventArgumentActor(
      actorAddress,
      actorKind === "human" ? "voter" : actorKind
    ),
    type: "vote",
    data: {
      actorKind,
      yeaBps,
      direction,
      weight,
      weightSemantics: "absolute_actor_contribution",
      countsAsHumanParticipation: actorKind === "human",
      classification: pinnedVoterClassification({
        configuration,
        ref,
        log,
        emittedAccount: actorAddress,
        voterCaller,
        voterDirection,
        ordinal,
        ybcMembership,
        aggregatePathExecuted,
        aggregatorResult,
      }),
      abi: availableAbi(raw),
    },
  };
}

function addSignalExecuteEvent(
  events: WireEventDraft[],
  source: DaoProposal,
  ref: WireEventDraft["proposalRef"]
): void {
  const last = events.at(-1);
  if (!last) throw new Error("The signal fixture needs lifecycle history.");
  const blockNumber = BigInt(last.log.blockNumber) + 1n;
  const position = {
    blockNumber: blockNumber.toString(),
    transactionIndex: 1,
    logIndex: 0,
  };
  const configuration = configurationForPosition(position);
  const log: WireLog = {
    blockNumber: position.blockNumber,
    blockHash: fixedHex32(blockNumber),
    timestamp:
      DAO_GENESIS_TIMESTAMP +
      (Number(source.votingEpoch) + 1) * DAO_FEED_EPOCH_LENGTH_SECONDS +
      configuration.executionDelaySeconds,
    transactionHash: fixedHex32(blockNumber * 100n + 93n),
    transactionIndex: position.transactionIndex,
    logIndex: position.logIndex,
  };
  const executionCaller = "0x7777777777777777777777777777777777777777";
  const raw = encodeDaoFeedLifecycleEventAbi({
    type: "execute",
    votingAddress: source.ref.votingAddress,
    proposalId: BigInt(ref.proposalId),
    executionCaller,
  });
  events.push({
    eventId: createDaoFeedEventId(ref.chainId, ref.votingAddress, log),
    proposalRef: ref,
    contractGeneration: "1",
    log,
    actor: eventArgumentActor(executionCaller, "execution_caller"),
    type: "execute",
    data: { abi: availableAbi(raw) },
  });
}

function decorateVetoEvidence(events: WireEventDraft[]): void {
  const latestVotes = new Map<
    string,
    { weight: bigint; yeaBps: number }
  >();
  for (const event of events) {
    if (event.type === "vote") {
      const address = (event.actor as { address: string }).address.toLowerCase();
      latestVotes.set(address, {
        weight: BigInt(event.data.weight as string),
        yeaBps: event.data.yeaBps as number,
      });
      continue;
    }
    if (event.type !== "veto") continue;
    let total = 0n;
    let yea = 0n;
    for (const vote of latestVotes.values()) {
      total += vote.weight;
      yea += (vote.weight * BigInt(vote.yeaBps)) / 10_000n;
    }
    event.data.branch = total === 0n ? "early_no_votes" : "post_participation";
    event.data.voteTotalsAtVeto = {
      totalWeight: total.toString(),
      yeaWeight: yea.toString(),
      nayWeight: (total - yea).toString(),
      aggregateSemantics: "last_event_per_actor_at_event_position",
    };
  }
}

function configurationForPosition(
  position: Pick<WireLog, "blockNumber" | "transactionIndex" | "logIndex">
): FixtureConfiguration {
  let selected = FIXTURE_CONFIGURATIONS[0]!;
  for (const configuration of FIXTURE_CONFIGURATIONS) {
    if (
      BigInt(configuration.effectiveAt.blockNumber) < BigInt(position.blockNumber) ||
      (configuration.effectiveAt.blockNumber === position.blockNumber &&
        (configuration.effectiveAt.transactionIndex < position.transactionIndex ||
          (configuration.effectiveAt.transactionIndex === position.transactionIndex &&
            configuration.effectiveAt.logIndex <= position.logIndex)))
    ) {
      selected = configuration;
    }
  }
  return selected;
}

function configurationValues(configuration: FixtureConfiguration) {
  return {
    contractGeneration: configuration.contractGeneration,
    configurationId: configuration.configurationId,
    voteStartOffsetSeconds: configuration.voteStartOffsetSeconds,
    votingPeriodSeconds: configuration.votingPeriodSeconds,
    votingWindowState: configuration.votingWindowState,
    executionDelaySeconds: configuration.executionDelaySeconds,
    executionGuard: configuration.executionGuard,
    voterAddress: configuration.voterAddress,
    voterState: configuration.voterState,
    voterImplementation: configuration.voterImplementation,
    delegatedStakingAddress: configuration.delegatedStakingAddress,
    delegatedStakingState: configuration.delegatedStakingState,
    ybcAddress: configuration.ybcAddress,
    ybcState: configuration.ybcState,
    ybcWeightAggregatorAddress:
      configuration.ybcWeightAggregatorAddress,
    ybcWeightAggregatorState: configuration.ybcWeightAggregatorState,
    executorAddress: configuration.executorAddress,
    executorState: configuration.executorState,
    executorImplementation: configuration.executorImplementation,
    votingHookAddress: configuration.votingHookAddress,
    votingHookState: configuration.votingHookState,
    weightMeasureAddress: configuration.weightMeasureAddress,
    weightMeasureState: configuration.weightMeasureState,
    proposalBlacklistAddress: configuration.proposalBlacklistAddress,
    proposalBlacklistState: configuration.proposalBlacklistState,
    operatorAddress: configuration.operatorAddress,
    operatorState: configuration.operatorState,
    guardianAddress: configuration.guardianAddress,
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
      configurationId: null,
      transactionSender: null,
      configuredRoleAddress: null,
      error: null,
    },
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
    transactionOrigin: null,
    originPolicy: null,
    frameContext: null,
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
    transactionOrigin: null,
    originPolicy: null,
    frameContext: null,
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
  return { ...source, repository: "yearn/stYFI", sourcePath };
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
  source: FailureSource
): unknown {
  return failureAt(code, message, retryable, source, GENERATED_AT);
}

type FailureSource =
  | "chain"
  | "rpc"
  | "content"
  | "asset"
  | "decoder"
  | "simulation"
  | "publication"
  | "provenance";

function failureAt(
  code: string,
  message: string,
  retryable: boolean,
  source: FailureSource,
  observedAt: string
): unknown {
  return { code, message, retryable, observedAt, source };
}

function fixedHex32(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function eventPosition(log: WireLog) {
  return {
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
