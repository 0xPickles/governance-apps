import {
  encodeAbiParameters,
  encodeEventTopics,
  isAddressEqual,
  keccak256,
  sha256,
  type Address,
  type Hex,
} from "viem";
import { z } from "@/lib/schemas/zod";
import {
  canonicalizeDaoProposalContent,
  createDaoRawSha256Cid,
  deriveDaoProposalContentIdentity,
  getDaoProposalUtf8ByteLength,
  parseDaoProposalContent,
} from "@/lib/clients/dao/content";
import {
  DAO_BPS,
  DAO_EMPTY_SCRIPT_HASH,
  deriveDaoDisplayGroup,
  deriveDaoDisplayStatus,
  deriveDaoProtocolStatus,
} from "@/lib/clients/dao/domain";
import { DAO_PINNED_VOTING_REVISION } from "@/lib/clients/dao/provenance";
import { encodeDaoProposeLog } from "@/lib/clients/dao/receipt";
import { checkDaoExecutorScript } from "@/lib/clients/dao/script";
import type { DaoProposalContent } from "@/lib/clients/dao/types";

export const DAO_FEED_SCHEMA_VERSION = 1 as const;
export const DAO_FEED_SCHEMA_ID =
  "https://dao.yearn.fi/schemas/yearn.dao.feed.v1.schema.json" as const;
export const DAO_FEED_SCHEMA_NAME = "yearn.dao.feed.v1" as const;
export const DAO_FEED_DEFAULT_CONFIRMATIONS = 8 as const;
export const DAO_FEED_MAX_CONTRACTS = 64;
export const DAO_FEED_MAX_PROPOSALS = 100_000;
export const DAO_FEED_MAX_EVENTS_PER_PROPOSAL = 100_000;
export const DAO_FEED_MAX_CALLS = 64;
export const DAO_FEED_MAX_FAILURE_MESSAGE_BYTES = 2_048;
export const DAO_FEED_MAX_MODERATION_REASON_BYTES = 256;
export const DAO_FEED_MAX_RETRY_ATTEMPTS = 16;
export const DAO_FEED_MAX_CONTENT_RETRIES = 8;
export const DAO_FEED_MAX_ASSET_RETRIES = 8;

export const DAO_FEED_LIFECYCLE_EVENT_TOPICS = {
  propose:
    "0x385a5c21b60cb605d8ba2e06eaecca5148598b1c9401ea0e2a5f181d50a53ffd",
  retract:
    "0xf8f7459e0aa0dfe770104b09822d11939d2c6ae3827597365a9620fb8b566df4",
  vote: "0x6c7eb2743ec28489909706ea440d909129004996be657d36c6e9add778546abf",
  flag: "0x258a67880aca461bf80e63896ed86b1271300e35d5c9c1c24e7346d60053b4bd",
  veto: "0x4742cd05951e3d1376451e464abec38be686b768a43162033255bc349f677818",
  execute:
    "0x892cd8f5b436bd5fb7dac1f11aafb73345d892ba3e9fe09cd94d95ba84928e73",
} as const;

export const DAO_FEED_LIFECYCLE_EVENT_ABI = {
  propose: [
    {
      type: "event",
      name: "Propose",
      inputs: [
        { name: "idx", type: "uint256", indexed: true },
        { name: "proposer", type: "address", indexed: true },
        { name: "epoch", type: "uint256", indexed: true },
        { name: "ipfs", type: "bytes32", indexed: false },
        { name: "script", type: "bytes", indexed: false },
      ],
    },
  ],
  retract: [
    {
      type: "event",
      name: "Retract",
      inputs: [{ name: "idx", type: "uint256", indexed: true }],
    },
  ],
  vote: [
    {
      type: "event",
      name: "Vote",
      inputs: [
        { name: "account", type: "address", indexed: true },
        { name: "idx", type: "uint256", indexed: true },
        { name: "weight", type: "uint256", indexed: false },
        { name: "yea", type: "uint256", indexed: false },
      ],
    },
  ],
  flag: [
    {
      type: "event",
      name: "Flag",
      inputs: [
        { name: "idx", type: "uint256", indexed: true },
        { name: "reason", type: "string", indexed: false },
      ],
    },
  ],
  veto: [
    {
      type: "event",
      name: "Veto",
      inputs: [
        { name: "idx", type: "uint256", indexed: true },
        { name: "reason", type: "string", indexed: false },
      ],
    },
  ],
  execute: [
    {
      type: "event",
      name: "Execute",
      inputs: [
        { name: "executor", type: "address", indexed: true },
        { name: "idx", type: "uint256", indexed: true },
      ],
    },
  ],
} as const;

const PINNED_VOTING_SOURCE_PATH = "contracts/governance/Voting.vy";
const UINT_PATTERN = /^(0|[1-9]\d*)$/u;
const POSITIVE_UINT_PATTERN = /^[1-9]\d*$/u;
const LOWER_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const LOWER_HASH_PATTERN = /^0x[0-9a-f]{64}$/u;
const LOWER_BYTES_PATTERN = /^0x(?:[0-9a-f]{2})*$/u;
const SELECTOR_PATTERN = /^0x[0-9a-f]{8}$/u;
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,95}$/u;
const SNAPSHOT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const EVENT_ID_PATTERN = /^[0-9]+:0x[0-9a-f]{40}:0x[0-9a-f]{64}:[0-9]+:[0-9]+$/u;
const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const zUint = z.string().max(78).regex(UINT_PATTERN);
const zPositiveUint = z.string().max(78).regex(POSITIVE_UINT_PATTERN);
const zSafeUint = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const zPositiveSafeUint = zSafeUint.min(1);
const zUnixSeconds = zSafeUint.max(4_294_967_295);
const zAddress = z.string().regex(LOWER_ADDRESS_PATTERN);
const zHash = z.string().regex(LOWER_HASH_PATTERN);
const zBytes = z.string().max(4_098).regex(LOWER_BYTES_PATTERN);
const zProposeLogData = z.string().max(4_290).regex(LOWER_BYTES_PATTERN);
const zVoteLogData = z.string().length(130).regex(LOWER_BYTES_PATTERN);
const zReasonLogData = z.string().max(642).regex(LOWER_BYTES_PATTERN);
const zSelector = z.string().regex(SELECTOR_PATTERN);
const zIsoUtc = z.string().max(32).regex(ISO_UTC_PATTERN);

const FailureSchema = z.strictObject({
  code: z.string().regex(FAILURE_CODE_PATTERN),
  message: z.string().min(1).max(DAO_FEED_MAX_FAILURE_MESSAGE_BYTES),
  retryable: z.boolean(),
  observedAt: zIsoUtc.nullable(),
  source: z.enum([
    "chain",
    "rpc",
    "content",
    "asset",
    "decoder",
    "simulation",
    "publication",
    "provenance",
  ]),
});

const ContentFailureSchema = FailureSchema.extend({
  source: z.literal("content"),
}).strict();
const AssetFailureSchema = FailureSchema.extend({
  source: z.literal("asset"),
}).strict();
const ProvenanceFailureSchema = FailureSchema.extend({
  source: z.literal("provenance"),
}).strict();
const DecoderFailureSchema = FailureSchema.extend({
  source: z.literal("decoder"),
}).strict();
const SimulationFailureSchema = FailureSchema.extend({
  source: z.literal("simulation"),
}).strict();
const DiscussionFailureSchema = z.union([
  ContentFailureSchema,
  ProvenanceFailureSchema,
]);

const VerifiedSourceSchema = z.strictObject({
  kind: z.enum(["github", "sourcify", "explorer"]),
  label: z.string().min(1).max(256),
  url: z.string().min(1).max(2_048),
  revision: z.string().min(1).max(128),
  sourcePath: z.string().min(1).max(512),
});

const ProposalRefSchema = z.strictObject({
  chainId: zPositiveSafeUint,
  votingAddress: zAddress,
  proposalId: zUint,
});

const CanonicalBlockSchema = z.strictObject({
  number: zUint,
  hash: zHash,
  timestamp: zUnixSeconds,
});

const NullableBlockTimeSchema = z.strictObject({
  number: zUint,
  hash: zHash,
  timestamp: zUnixSeconds.nullable(),
});

const EventPositionSchema = z.strictObject({
  blockNumber: zUint,
  blockHash: zHash,
  transactionIndex: zSafeUint,
  logIndex: zSafeUint,
});

const LogRefSchema = EventPositionSchema.extend({
  timestamp: zUnixSeconds.nullable(),
  transactionHash: zHash.nullable(),
}).strict();

const ActorEvidenceSchema = z.union([
  z.strictObject({
    state: z.literal("verified"),
    method: z.literal("event_argument"),
    observedAt: z.null(),
    transactionSender: z.null(),
    configuredRoleAddress: z.null(),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("verified"),
    method: z.literal("proposal_proposer"),
    observedAt: z.null(),
    transactionSender: z.null(),
    configuredRoleAddress: z.null(),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("verified"),
    method: z.literal("historical_role_and_transaction_sender"),
    observedAt: EventPositionSchema,
    transactionSender: zAddress,
    configuredRoleAddress: zAddress,
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    method: z.null(),
    observedAt: z.null(),
    transactionSender: z.null(),
    configuredRoleAddress: z.null(),
    error: ProvenanceFailureSchema,
  }),
]);

const ActorSchema = z.strictObject({
  address: zAddress.nullable(),
  role: z.enum([
    "proposer",
    "voter",
    "delegated_staking_aggregate",
    "ybc_aggregate",
    "execution_caller",
    "operator",
    "guardian",
    "unknown",
  ]),
  evidence: ActorEvidenceSchema,
});

const EventBaseShape = {
  eventId: z.string().regex(EVENT_ID_PATTERN),
  proposalRef: ProposalRefSchema,
  contractGeneration: zPositiveUint,
  log: LogRefSchema,
  actor: ActorSchema,
};

const AvailableEventAbiBaseShape = {
  state: z.literal("available"),
  address: zAddress,
  matchingLogCount: z.literal(1),
  canonicalReencodingMatched: z.literal(true),
  error: z.null(),
};

const ProposeEventAbiSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...AvailableEventAbiBaseShape,
    topics: z.tuple([zHash, zHash, zHash, zHash]),
    data: zProposeLogData,
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    address: zAddress,
    topics: z.tuple([zHash, zHash, zHash, zHash]),
    data: z.null(),
    matchingLogCount: z.literal(1),
    canonicalReencodingMatched: z.null(),
    error: ProvenanceFailureSchema,
  }),
]);

const RetractEventAbiSchema = z.strictObject({
  ...AvailableEventAbiBaseShape,
  topics: z.tuple([zHash, zHash]),
  data: z.literal("0x"),
});

const VoteEventAbiSchema = z.strictObject({
  ...AvailableEventAbiBaseShape,
  topics: z.tuple([zHash, zHash, zHash]),
  data: zVoteLogData,
});

const ReasonEventAbiSchema = z.strictObject({
  ...AvailableEventAbiBaseShape,
  topics: z.tuple([zHash, zHash]),
  data: zReasonLogData,
});

const ExecuteEventAbiSchema = z.strictObject({
  ...AvailableEventAbiBaseShape,
  topics: z.tuple([zHash, zHash, zHash]),
  data: z.literal("0x"),
});

const ProposeEventSchema = z.strictObject({
  ...EventBaseShape,
  type: z.literal("propose"),
  data: z.strictObject({
    proposalId: zUint,
    proposer: zAddress,
    votingEpoch: zUint,
    contentDigest: zHash,
    script: zBytes.nullable(),
    scriptFailure: ProvenanceFailureSchema.nullable(),
    abi: ProposeEventAbiSchema,
  }),
});

const VoteEventSchema = z.strictObject({
  ...EventBaseShape,
  type: z.literal("vote"),
  data: z.strictObject({
    actorKind: z.enum([
      "human",
      "delegated_staking_aggregate",
      "ybc_aggregate",
    ]),
    yeaBps: z.number().int().min(0).max(DAO_BPS),
    direction: z.enum(["yea", "nay"]).nullable(),
    weight: zUint,
    weightSemantics: z.literal("absolute_actor_contribution"),
    countsAsHumanParticipation: z.boolean(),
    classification: z.strictObject({
      method: z.literal("historical_voter_configuration"),
      voterAddress: zAddress,
      delegatedStakingAddress: zAddress,
      ybcAddress: zAddress,
      observedAt: EventPositionSchema,
      observationSemantics: z.literal("effective_at_event"),
    }),
    abi: VoteEventAbiSchema,
  }),
});

const RetractEventSchema = z.strictObject({
  ...EventBaseShape,
  type: z.literal("retract"),
  data: z.strictObject({ abi: RetractEventAbiSchema }),
});

const FlagEventSchema = z.strictObject({
  ...EventBaseShape,
  type: z.literal("flag"),
  data: z.strictObject({ reason: z.string().max(256), abi: ReasonEventAbiSchema }),
});

const VetoEventSchema = z.strictObject({
  ...EventBaseShape,
  type: z.literal("veto"),
  data: z.strictObject({ reason: z.string().max(256), abi: ReasonEventAbiSchema }),
});

const ExecuteEventSchema = z.strictObject({
  ...EventBaseShape,
  type: z.literal("execute"),
  data: z.strictObject({ abi: ExecuteEventAbiSchema }),
});

export const DaoFeedEventV1Schema = z.discriminatedUnion("type", [
  ProposeEventSchema,
  VoteEventSchema,
  RetractEventSchema,
  FlagEventSchema,
  VetoEventSchema,
  ExecuteEventSchema,
]);

const ProposalAssetSchema = z.strictObject({
  path: z.string().min(1).max(512),
  mediaType: z.string().min(1).max(127),
  byteLength: zPositiveSafeUint.max(2_097_152),
  digest: zHash,
  width: zPositiveSafeUint.max(8_192).nullable(),
  height: zPositiveSafeUint.max(8_192).nullable(),
});

const ProposalContentValueSchema = z.strictObject({
  schema: z.literal("yearn.dao.proposal.v1"),
  markdown: z.string().max(32_768),
  discussionUrl: z.string().min(1).max(2_048),
  proposalType: z.enum(["signal", "executable"]),
  createdBy: zAddress,
  createdAt: zIsoUtc,
  assets: z.array(ProposalAssetSchema).max(16),
});

const ContentRetrySchema = z.strictObject({
  attempts: zSafeUint.max(DAO_FEED_MAX_CONTENT_RETRIES),
  maxAttempts: z.literal(DAO_FEED_MAX_CONTENT_RETRIES),
  lastAttemptAt: zIsoUtc.nullable(),
  nextRetryAt: zIsoUtc.nullable(),
});

const AssetRecordSchema = z.strictObject({
  path: z.string().min(1).max(512),
  mediaType: z.string().min(1).max(127),
  byteLength: zPositiveSafeUint.max(2_097_152),
  digest: zHash,
  cid: z.string().min(1).max(128),
  gatewayUrl: z.string().min(1).max(256),
  width: zPositiveSafeUint.max(8_192).nullable(),
  height: zPositiveSafeUint.max(8_192).nullable(),
  state: z.enum(["available", "unavailable"]),
  retry: z.strictObject({
    attempts: zSafeUint.max(DAO_FEED_MAX_ASSET_RETRIES),
    maxAttempts: z.literal(DAO_FEED_MAX_ASSET_RETRIES),
    lastAttemptAt: zIsoUtc.nullable(),
    nextRetryAt: zIsoUtc.nullable(),
  }),
  error: AssetFailureSchema.nullable(),
});

const AttachmentRecordSchema = z.strictObject({
  kind: z.enum(["relative_manifest_path", "direct_ipfs"]),
  target: z.string().min(1).max(640),
  manifestPath: z.string().min(1).max(512),
  assetCid: z.string().min(1).max(128),
  gatewayUrl: z.string().min(1).max(256),
});

const ContentCommonShape = {
  cid: z.string().min(1).max(128),
  digest: zHash,
  retry: ContentRetrySchema,
  assetRecords: z.array(AssetRecordSchema).max(16),
  attachmentRecords: z.array(AttachmentRecordSchema).max(4_096),
};

export const DaoFeedContentV1Schema = z.discriminatedUnion("state", [
  z.strictObject({
    ...ContentCommonShape,
    state: z.literal("available"),
    canonicalJson: z.string().min(2).max(131_072),
    value: ProposalContentValueSchema,
    error: z.null(),
  }),
  z.strictObject({
    ...ContentCommonShape,
    state: z.literal("invalid"),
    canonicalJson: z.string().min(2).max(131_072),
    value: z.null(),
    error: ContentFailureSchema,
  }),
  z.strictObject({
    ...ContentCommonShape,
    state: z.literal("unavailable"),
    canonicalJson: z.null(),
    value: z.null(),
    error: ContentFailureSchema,
  }),
]);

const DiscussionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("verified"),
    url: z.string().min(1).max(2_048),
    title: z.string().min(1).max(512),
    categoryId: zSafeUint,
    category: z.string().min(1).max(128),
    categorySlugPath: z.array(z.string().min(1).max(128)).min(1).max(16),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unverified"),
    url: z.string().min(1).max(2_048),
    title: z.null(),
    categoryId: z.null(),
    category: z.null(),
    categorySlugPath: z.tuple([]),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    url: z.string().max(2_048).nullable(),
    title: z.null(),
    categoryId: z.null(),
    category: z.null(),
    categorySlugPath: z.tuple([]),
    error: DiscussionFailureSchema,
  }),
]);

export const DaoRetainedScriptV1Schema = z.strictObject({
  bytes: zBytes.nullable(),
  hash: zHash,
  structure: z.strictObject({
    state: z.enum(["empty", "valid", "invalid", "unavailable"]),
    errorCode: z.string().max(96).nullable(),
    errorOffset: zSafeUint.nullable(),
  }),
  hashVerification: z.discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("verified"),
      computedHash: zHash,
    }),
    z.strictObject({
      state: z.literal("mismatch"),
      computedHash: zHash,
    }),
    z.strictObject({
      state: z.literal("unavailable"),
      computedHash: z.null(),
    }),
  ]),
  retention: z.discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("retained"),
      proposeEventId: z.string().regex(EVENT_ID_PATTERN),
      error: z.null(),
    }),
    z.strictObject({
      state: z.literal("missing"),
      proposeEventId: z.string().regex(EVENT_ID_PATTERN),
      error: ProvenanceFailureSchema,
    }),
  ]),
});

const DecodedArgumentSchema = z.strictObject({
  name: z.string().max(256),
  type: z.string().min(1).max(256),
  value: z.string().max(8_192),
});

const CallBaseShape = {
  index: zSafeUint.max(DAO_FEED_MAX_CALLS - 1),
  offset: zSafeUint.max(2_048),
  target: zAddress,
  calldata: zBytes,
  calldataBytes: zSafeUint.max(2_048),
  selector: zSelector.nullable(),
};

const VerifiedCallSchema = z.strictObject({
  ...CallBaseShape,
  decodeStatus: z.literal("verified"),
  contractName: z.string().min(1).max(256),
  functionSignature: z.string().min(1).max(512),
  arguments: z.array(DecodedArgumentSchema).max(128),
  verifiedSource: VerifiedSourceSchema,
  error: z.null(),
});

const UnknownCallSchema = z.strictObject({
  ...CallBaseShape,
  decodeStatus: z.literal("unknown"),
  contractName: z.null(),
  functionSignature: z.null(),
  arguments: z.tuple([]),
  verifiedSource: z.null(),
  error: z.null(),
});

const FailedDecodeCallSchema = z.strictObject({
  ...CallBaseShape,
  decodeStatus: z.literal("failed"),
  contractName: z.string().max(256).nullable(),
  functionSignature: z.string().max(512).nullable(),
  arguments: z.array(DecodedArgumentSchema).max(128),
  verifiedSource: VerifiedSourceSchema.nullable(),
  error: DecoderFailureSchema,
});

const DecodedCallSchema = z.discriminatedUnion("decodeStatus", [
  VerifiedCallSchema,
  UnknownCallSchema,
  FailedDecodeCallSchema,
]);

const VotingTransitionOverrideSchema = z.strictObject({
  kind: z.literal("voting_proposal_executed_flag"),
  votingAddress: zAddress,
  proposalId: zUint,
  value: z.literal(true),
  source: VerifiedSourceSchema,
});

const SimulationCompleteShape = {
  method: z.literal("revm_voting_transition_then_executor_execute"),
  engine: z.literal("revm@34"),
  executorAddress: zAddress,
  scriptHash: zHash,
  blockNumber: zUint,
  blockHash: zHash,
  simulatedAt: zIsoUtc,
  stateTimestamp: zUnixSeconds,
  timestampMode: z.literal("block"),
  timestampOverride: z.null(),
  caller: zAddress,
  stateOverrides: z.tuple([VotingTransitionOverrideSchema]),
  atomic: z.literal(true),
};

export const DaoProposalSimulationV1Schema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("pending"),
    method: z.null(),
    engine: z.null(),
    executorAddress: z.null(),
    scriptHash: z.null(),
    blockNumber: z.null(),
    blockHash: z.null(),
    simulatedAt: z.null(),
    stateTimestamp: z.null(),
    timestampMode: z.null(),
    timestampOverride: z.null(),
    caller: z.null(),
    stateOverrides: z.tuple([]),
    atomic: z.null(),
    result: z.null(),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("succeeded"),
    ...SimulationCompleteShape,
    result: z.literal("success"),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("failed"),
    ...SimulationCompleteShape,
    result: z.literal("revert"),
    error: SimulationFailureSchema,
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    method: z.null(),
    engine: z.null(),
    executorAddress: z.null(),
    scriptHash: z.null(),
    blockNumber: z.null(),
    blockHash: z.null(),
    simulatedAt: zIsoUtc.nullable(),
    stateTimestamp: z.null(),
    timestampMode: z.null(),
    timestampOverride: z.null(),
    caller: z.null(),
    stateOverrides: z.tuple([]),
    atomic: z.null(),
    result: z.null(),
    error: SimulationFailureSchema,
  }),
]);

const AnalysisSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("pending"),
    generatedAt: z.null(),
    registryVersion: z.null(),
    calls: z.tuple([]),
    proposalSimulation: DaoProposalSimulationV1Schema,
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("complete"),
    generatedAt: zIsoUtc,
    registryVersion: z.string().min(1).max(256),
    calls: z.array(DecodedCallSchema).max(DAO_FEED_MAX_CALLS),
    proposalSimulation: DaoProposalSimulationV1Schema,
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("partial"),
    generatedAt: zIsoUtc,
    registryVersion: z.string().min(1).max(256),
    calls: z.array(DecodedCallSchema).max(DAO_FEED_MAX_CALLS),
    proposalSimulation: DaoProposalSimulationV1Schema,
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("failed"),
    generatedAt: zIsoUtc,
    registryVersion: z.string().min(1).max(256),
    calls: z.array(DecodedCallSchema).max(DAO_FEED_MAX_CALLS),
    proposalSimulation: DaoProposalSimulationV1Schema,
    error: z.union([DecoderFailureSchema, SimulationFailureSchema]),
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    generatedAt: zIsoUtc.nullable(),
    registryVersion: z.string().min(1).max(256).nullable(),
    calls: z.tuple([]),
    proposalSimulation: DaoProposalSimulationV1Schema,
    error: z.union([SimulationFailureSchema, ProvenanceFailureSchema]),
  }),
]);

const MutableConfigurationSchema = z.strictObject({
  contractGeneration: zPositiveUint,
  voteStartTimestamp: zUnixSeconds,
  votingPeriodSeconds: zPositiveSafeUint,
  executionDelaySeconds: zSafeUint.nullable(),
  executionGuard: z.enum(["guarded", "permissionless"]).nullable(),
  voterAddress: zAddress,
  executorAddress: zAddress,
  votingHookAddress: zAddress.nullable(),
  operatorAddress: zAddress,
  guardianAddress: zAddress,
  observedAt: EventPositionSchema,
  observationSemantics: z.literal("effective_at_propose_event"),
  valuesAreSnapshotted: z.literal(false),
});

const ProposalRulesSchema = z.strictObject({
  approvalThresholdBps: z.number().int().min(0).max(DAO_BPS),
  thresholdSnapshottedAtCreation: z.literal(true),
  minimumTurnout: z.null(),
  passageRequiresPositiveTotal: z.literal(true),
  proposalType: z.enum(["signal", "executable"]),
  votingAddress: zAddress,
  votingSource: VerifiedSourceSchema,
  mutableConfiguration: MutableConfigurationSchema,
});

const IndexedCreationSchema = z.strictObject({
  state: z.literal("indexed"),
  transactionHash: zHash,
  proposeEventId: z.string().regex(EVENT_ID_PATTERN),
  receipt: z.strictObject({
    status: z.literal("success"),
    transactionHash: zHash,
    blockNumber: zUint,
    blockHash: zHash,
    blockTimestamp: zUnixSeconds.nullable(),
    transactionIndex: zSafeUint,
    matchingProposeLogCount: z.literal(1),
  }),
  error: z.null(),
});

const HistoricalCreationSchema = z.strictObject({
  state: z.literal("historical_incomplete"),
  transactionHash: zHash.nullable(),
  proposeEventId: z.string().regex(EVENT_ID_PATTERN),
  receipt: z.null(),
  error: ProvenanceFailureSchema,
});

const CreationSchema = z.discriminatedUnion("state", [
  IndexedCreationSchema,
  HistoricalCreationSchema,
]);

const ModerationSchema = z.strictObject({
  flagReason: z.string().max(256).nullable(),
  vetoReason: z.string().max(256).nullable(),
});

const ProposalSchema = z.strictObject({
  ref: ProposalRefSchema,
  contractGeneration: zPositiveUint,
  proposer: zAddress,
  votingEpoch: zUint,
  createdAt: zUnixSeconds,
  voteStartsAt: zUnixSeconds,
  voteEndsAt: zUnixSeconds,
  executionStartsAt: zUnixSeconds.nullable(),
  executionEndsAt: zUnixSeconds.nullable(),
  thresholdBps: z.number().int().min(0).max(DAO_BPS),
  totalWeight: zUint,
  yeaWeight: zUint,
  nayWeight: zUint,
  protocolStatus: z.enum([
    "proposed",
    "retracted",
    "voting",
    "passed",
    "failed",
    "executed",
    "expired",
    "flagged",
    "vetoed",
  ]),
  displayStatus: z.enum([
    "discussion",
    "voting",
    "approved",
    "rejected",
    "executed",
    "expired",
    "retracted",
    "flagged",
    "vetoed",
  ]),
  displayGroup: z.enum(["active", "upcoming", "closed"]),
  type: z.enum(["signal", "executable"]),
  voteAccounting: z.strictObject({
    aggregateSemantics: z.literal("last_event_per_actor"),
    humanParticipationCount: zSafeUint,
  }),
  rules: ProposalRulesSchema,
  content: DaoFeedContentV1Schema,
  discussion: DiscussionSchema,
  script: DaoRetainedScriptV1Schema,
  analysis: AnalysisSchema,
  events: z.array(DaoFeedEventV1Schema).min(1).max(DAO_FEED_MAX_EVENTS_PER_PROPOSAL),
  moderation: ModerationSchema,
  creation: CreationSchema,
});

const FeedContractSchema = z.strictObject({
  generation: zPositiveUint,
  votingAddress: zAddress,
  voterAddress: zAddress,
  executorAddress: zAddress,
  deploymentBlock: NullableBlockTimeSchema,
  startBlock: zUint,
  active: z.boolean(),
  retiredAtBlock: NullableBlockTimeSchema.nullable(),
  replacedByVotingAddress: zAddress.nullable(),
  source: VerifiedSourceSchema,
});

const PublicationFailureSchema = FailureSchema.extend({
  source: z.literal("publication"),
}).strict();

const ReorgSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("clean"),
    replayFromBlock: z.null(),
    commonAncestor: z.null(),
    replacedSnapshotId: z.null(),
  }),
  z.strictObject({
    state: z.literal("recovered"),
    replayFromBlock: zUint,
    commonAncestor: NullableBlockTimeSchema,
    replacedSnapshotId: z.string().regex(SNAPSHOT_ID_PATTERN),
  }),
]);

const PublicationSchema = z.strictObject({
  mode: z.literal("atomic_snapshot"),
  snapshotId: z.string().regex(SNAPSHOT_ID_PATTERN),
  previousSnapshotId: z.string().regex(SNAPSHOT_ID_PATTERN).nullable(),
  publishedAt: zIsoUtc,
  producer: z.strictObject({
    name: z.literal("gov-apps-stats"),
    version: z.string().min(1).max(128),
    runtime: z.literal("rust-1.88/alloy-1.4/revm-34"),
  }),
  cursor: z.strictObject({
    chainId: zPositiveSafeUint,
    startBlockNumber: zUint,
    lastBlockNumber: zUint,
    lastBlockHash: zHash,
    nextBlockNumber: zUint,
  }),
  finality: z.strictObject({
    requiredConfirmations: z.literal(DAO_FEED_DEFAULT_CONFIRMATIONS),
    observedConfirmations: zSafeUint.max(10_000),
    headBlock: NullableBlockTimeSchema,
  }),
  reorg: ReorgSchema,
  retry: z.discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("first_attempt"),
      attempt: z.literal(1),
      maxAttempts: z.literal(DAO_FEED_MAX_RETRY_ATTEMPTS),
      lastFailure: z.null(),
      nextRetryAt: z.null(),
    }),
    z.strictObject({
      state: z.literal("succeeded_after_retry"),
      attempt: zPositiveSafeUint.min(2).max(DAO_FEED_MAX_RETRY_ATTEMPTS),
      maxAttempts: z.literal(DAO_FEED_MAX_RETRY_ATTEMPTS),
      lastFailure: PublicationFailureSchema,
      nextRetryAt: z.null(),
    }),
  ]),
  atomicity: z.strictObject({
    localWrite: z.literal("temp_then_rename"),
    remoteWrite: z.literal("immutable_then_stable_put"),
    singleWriter: z.literal(true),
    retainLastGood: z.literal(true),
    validateImmutableBeforeStable: z.literal(true),
    stableObjectWrittenLast: z.literal(true),
  }),
  retention: z.strictObject({
    eventScripts: z.literal("indefinite"),
    contentJson: z.literal("indefinite"),
    assetRecords: z.literal("indefinite"),
    immutableAuditSnapshots: z.literal("indefinite"),
    rawContentMaxAttempts: z.literal(DAO_FEED_MAX_CONTENT_RETRIES),
    rawAssetMaxAttempts: z.literal(DAO_FEED_MAX_ASSET_RETRIES),
  }),
  counts: z.strictObject({
    contracts: zSafeUint.max(DAO_FEED_MAX_CONTRACTS),
    proposals: zSafeUint.max(DAO_FEED_MAX_PROPOSALS),
    events: zSafeUint,
  }),
});

const DaoFeedV1StructuralSchema = z.strictObject({
  schemaId: z.literal(DAO_FEED_SCHEMA_ID),
  schemaVersion: z.literal(DAO_FEED_SCHEMA_VERSION),
  schemaName: z.literal(DAO_FEED_SCHEMA_NAME),
  chainId: zPositiveSafeUint,
  generatedAt: zIsoUtc,
  publication: PublicationSchema,
  canonicalBlock: CanonicalBlockSchema,
  contracts: z.array(FeedContractSchema).min(1).max(DAO_FEED_MAX_CONTRACTS),
  proposals: z.array(ProposalSchema).max(DAO_FEED_MAX_PROPOSALS),
});

export const DaoFeedV1Schema = DaoFeedV1StructuralSchema.superRefine(
  validateDaoFeedSemantics
);

const CreationIdentitySchema = z.strictObject({
  proposer: zAddress,
  votingEpoch: zUint,
  contentDigest: zHash,
  script: zBytes,
  log: LogRefSchema,
  abi: z.strictObject({
    address: zAddress,
    topics: z.tuple([zHash, zHash, zHash, zHash]),
    data: zProposeLogData,
    matchingLogCount: z.literal(1),
    canonicalReencodingMatched: z.literal(true),
  }),
});

const DaoCreationIdentityStageStructuralSchema = z.strictObject({
  schemaVersion: z.literal(DAO_FEED_SCHEMA_VERSION),
  stage: z.enum(["receipt_confirmed", "awaiting_index", "indexed"]),
  ref: ProposalRefSchema,
  transactionHash: zHash,
  receipt: z.strictObject({
    status: z.literal("success"),
    matchingProposeLogCount: z.literal(1),
  }),
  identity: CreationIdentitySchema,
  indexedSnapshotId: z.string().regex(SNAPSHOT_ID_PATTERN).nullable(),
});

export const DaoCreationIdentityStageV1Schema =
  DaoCreationIdentityStageStructuralSchema.superRefine(
    validateCreationIdentityStage
  );

export type DaoFeedFailureV1 = z.infer<typeof FailureSchema>;
export type DaoVerifiedSourceV1 = z.infer<typeof VerifiedSourceSchema>;
export type DaoFeedEventV1 = z.infer<typeof DaoFeedEventV1Schema>;
export type DaoFeedContentV1 = z.infer<typeof DaoFeedContentV1Schema>;
export type DaoRetainedScriptV1 = z.infer<typeof DaoRetainedScriptV1Schema>;
export type DaoProposalSimulationV1 = z.infer<
  typeof DaoProposalSimulationV1Schema
>;
export type DaoFeedV1 = z.infer<typeof DaoFeedV1Schema>;
export type DaoCreationIdentityStageV1 = z.infer<
  typeof DaoCreationIdentityStageV1Schema
>;

export function parseDaoFeedV1(value: unknown): DaoFeedV1 {
  return DaoFeedV1Schema.parse(value);
}

export function parseDaoCreationIdentityStageV1(
  value: unknown
): DaoCreationIdentityStageV1 {
  return DaoCreationIdentityStageV1Schema.parse(value);
}

export function createDaoFeedEventId(
  chainId: number,
  votingAddress: string,
  log: Pick<
    z.infer<typeof LogRefSchema>,
    "blockHash" | "transactionIndex" | "logIndex"
  >
): string {
  return `${chainId}:${votingAddress.toLowerCase()}:${log.blockHash.toLowerCase()}:${log.transactionIndex}:${log.logIndex}`;
}

export type DaoFeedLifecycleAbiInput =
  | {
      type: "propose";
      votingAddress: Address;
      proposalId: bigint;
      proposer: Address;
      votingEpoch: bigint;
      contentDigest: Hex;
      script: Hex;
    }
  | {
      type: "vote";
      votingAddress: Address;
      proposalId: bigint;
      account: Address;
      weight: bigint;
      yeaBps: bigint;
    }
  | {
      type: "retract";
      votingAddress: Address;
      proposalId: bigint;
    }
  | {
      type: "flag";
      votingAddress: Address;
      proposalId: bigint;
      reason: string;
    }
  | {
      type: "veto";
      votingAddress: Address;
      proposalId: bigint;
      reason: string;
    }
  | {
      type: "execute";
      votingAddress: Address;
      proposalId: bigint;
      executionCaller: Address;
    };

export function encodeDaoFeedLifecycleEventAbi(
  input: DaoFeedLifecycleAbiInput
): { address: Address; topics: Hex[]; data: Hex } {
  if (input.type === "propose") {
    const encoded = encodeDaoProposeLog({
      address: input.votingAddress,
      contentDigest: input.contentDigest,
      logIndex: 0,
      proposalId: input.proposalId,
      proposer: input.proposer,
      script: input.script,
      votingEpoch: input.votingEpoch,
    });
    return {
      address: encoded.address,
      topics: encoded.topics as Hex[],
      data: encoded.data,
    };
  }

  if (input.type === "vote") {
    return {
      address: input.votingAddress,
      topics: scalarTopics(
        encodeEventTopics({
          abi: DAO_FEED_LIFECYCLE_EVENT_ABI.vote,
          eventName: "Vote",
          args: { account: input.account, idx: input.proposalId },
        })
      ),
      data: encodeAbiParameters(
        [
          { name: "weight", type: "uint256" },
          { name: "yea", type: "uint256" },
        ],
        [input.weight, input.yeaBps]
      ),
    };
  }

  if (input.type === "retract") {
    return {
      address: input.votingAddress,
      topics: scalarTopics(
        encodeEventTopics({
          abi: DAO_FEED_LIFECYCLE_EVENT_ABI.retract,
          eventName: "Retract",
          args: { idx: input.proposalId },
        })
      ),
      data: "0x",
    };
  }

  if (input.type === "flag" || input.type === "veto") {
    const isFlag = input.type === "flag";
    return {
      address: input.votingAddress,
      topics: scalarTopics(
        isFlag
          ? encodeEventTopics({
              abi: DAO_FEED_LIFECYCLE_EVENT_ABI.flag,
              eventName: "Flag",
              args: { idx: input.proposalId },
            })
          : encodeEventTopics({
              abi: DAO_FEED_LIFECYCLE_EVENT_ABI.veto,
              eventName: "Veto",
              args: { idx: input.proposalId },
            })
      ),
      data: encodeAbiParameters(
        [{ name: "reason", type: "string" }],
        [input.reason]
      ),
    };
  }

  return {
    address: input.votingAddress,
    topics: scalarTopics(
      encodeEventTopics({
        abi: DAO_FEED_LIFECYCLE_EVENT_ABI.execute,
        eventName: "Execute",
        args: {
          executor: input.executionCaller,
          idx: input.proposalId,
        },
      })
    ),
    data: "0x",
  };
}

function scalarTopics(topics: readonly (Hex | Hex[] | null)[]): Hex[] {
  return topics.map((topic) => {
    if (topic === null || typeof topic !== "string") {
      throw new Error("DAO lifecycle event topics must be exact scalar values.");
    }
    return topic;
  });
}

type StructuralFeed = z.infer<typeof DaoFeedV1StructuralSchema>;
type FeedProposal = StructuralFeed["proposals"][number];
type FeedEvent = FeedProposal["events"][number];
type RefinementContext = z.core.$RefinementCtx<unknown>;

const UINT256_MAX = (1n << 256n) - 1n;
const DAO_FEED_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;

function validateDaoFeedSemantics(
  feed: StructuralFeed,
  context: RefinementContext
): void {
  assertPayloadBound(feed, context);
  validateCanonicalPrimitives(feed, context, []);
  assertIsoUtc(feed.generatedAt, context, ["generatedAt"]);
  assertIsoUtc(feed.publication.publishedAt, context, ["publication", "publishedAt"]);
  validatePublication(feed, context);
  const contracts = validateContracts(feed, context);
  validateProposals(feed, contracts, context);
}

const UINT_FIELD_NAMES = new Set([
  "generation",
  "startBlock",
  "startBlockNumber",
  "lastBlockNumber",
  "nextBlockNumber",
  "number",
  "proposalId",
  "votingEpoch",
  "totalWeight",
  "yeaWeight",
  "nayWeight",
  "weight",
  "blockNumber",
]);

function validateCanonicalPrimitives(
  value: unknown,
  context: RefinementContext,
  path: PropertyKey[]
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateCanonicalPrimitives(item, context, [...path, index])
    );
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (
    typeof record.code === "string" &&
    typeof record.message === "string" &&
    typeof record.retryable === "boolean" &&
    typeof record.source === "string" &&
    new TextEncoder().encode(record.message).byteLength >
      DAO_FEED_MAX_FAILURE_MESSAGE_BYTES
  ) {
    issue(context, [...path, "message"], "Failure messages cannot exceed 2,048 UTF-8 bytes.");
  }
  for (const [key, item] of Object.entries(record)) {
    if (
      UINT_FIELD_NAMES.has(key) &&
      typeof item === "string" &&
      toUint(item) === null
    ) {
      issue(context, [...path, key], "Integer strings must be canonical unsigned uint256 values.");
    }
    if (
      (key.endsWith("At") || key === "createdAt") &&
      typeof item === "string" &&
      ISO_UTC_PATTERN.test(item) &&
      !isCanonicalIsoUtc(item)
    ) {
      issue(context, [...path, key], "Timestamp must be a real canonical UTC instant.");
    }
    validateCanonicalPrimitives(item, context, [...path, key]);
  }
}

function validatePublication(
  feed: StructuralFeed,
  context: RefinementContext
): void {
  const publication = feed.publication;
  const canonicalNumber = toUint(feed.canonicalBlock.number);
  const start = toUint(publication.cursor.startBlockNumber);
  const last = toUint(publication.cursor.lastBlockNumber);
  const next = toUint(publication.cursor.nextBlockNumber);
  const head = toUint(publication.finality.headBlock.number);
  const publishedAt = Date.parse(publication.publishedAt) / 1_000;

  if (publication.publishedAt !== feed.generatedAt) {
    issue(
      context,
      ["publication", "publishedAt"],
      "An atomic snapshot must use one exact generation and publication timestamp."
    );
  }
  if (
    !Number.isFinite(publishedAt) ||
    publishedAt < feed.canonicalBlock.timestamp ||
    (publication.finality.headBlock.timestamp !== null &&
      publishedAt < publication.finality.headBlock.timestamp)
  ) {
    issue(
      context,
      ["publication", "publishedAt"],
      "Publication time cannot precede its canonical or confirmation-head block time."
    );
  }

  if (publication.cursor.chainId !== feed.chainId) {
    issue(context, ["publication", "cursor", "chainId"], "The publication cursor must use the feed chain ID.");
  }
  if (last !== canonicalNumber || publication.cursor.lastBlockHash !== feed.canonicalBlock.hash) {
    issue(context, ["publication", "cursor"], "The cursor last block and hash must equal the canonical block.");
  }
  if (start === null || last === null || start > last) {
    issue(context, ["publication", "cursor", "startBlockNumber"], "The cursor start block must not follow its last block.");
  }
  if (last === null || next !== last + 1n) {
    issue(context, ["publication", "cursor", "nextBlockNumber"], "The cursor next block must be exactly one after its last block.");
  }
  if (head === null || last === null || head < last) {
    issue(context, ["publication", "finality", "headBlock", "number"], "The finality head cannot precede the canonical block.");
  } else if (BigInt(publication.finality.observedConfirmations) !== head - last) {
    issue(context, ["publication", "finality", "observedConfirmations"], "Observed confirmations must equal head block minus canonical block.");
  }
  if (
    publication.finality.observedConfirmations <
    publication.finality.requiredConfirmations
  ) {
    issue(context, ["publication", "finality", "observedConfirmations"], "Atomic publication requires the configured confirmation depth.");
  }
  if (
    publication.finality.headBlock.number === feed.canonicalBlock.number &&
    publication.finality.headBlock.hash !== feed.canonicalBlock.hash
  ) {
    issue(context, ["publication", "finality", "headBlock", "hash"], "Equal block numbers must use the canonical block hash.");
  }
  if (publication.previousSnapshotId === publication.snapshotId) {
    issue(context, ["publication", "previousSnapshotId"], "A snapshot cannot replace itself.");
  }

  if (publication.retry.state === "succeeded_after_retry") {
    const failedAt = publication.retry.lastFailure.observedAt;
    if (
      failedAt === null ||
      Date.parse(failedAt) > Date.parse(publication.publishedAt)
    ) {
      issue(
        context,
        ["publication", "retry", "lastFailure", "observedAt"],
        "A successful publication retry must retain its exact preceding failure time."
      );
    }
  }

  if (publication.reorg.state === "clean") {
    if (publication.previousSnapshotId === null && publication.retry.state === "succeeded_after_retry") {
      issue(context, ["publication", "retry"], "A retried snapshot must retain its preceding snapshot identity.");
    }
  } else {
    const ancestor = toUint(publication.reorg.commonAncestor.number);
    const replay = toUint(publication.reorg.replayFromBlock);
    if (
      publication.previousSnapshotId === null ||
      publication.reorg.replacedSnapshotId !== publication.previousSnapshotId
    ) {
      issue(context, ["publication", "reorg"], "A recovered reorg must identify the replaced last-good snapshot.");
    }
    if (ancestor === null || replay !== ancestor + 1n || last === null || replay > last) {
      issue(context, ["publication", "reorg"], "A recovered reorg must replay from exactly one block after its common ancestor.");
    }
  }

  if (publication.counts.contracts !== feed.contracts.length) {
    issue(context, ["publication", "counts", "contracts"], "The published contract count must equal the atomic payload.");
  }
  if (publication.counts.proposals !== feed.proposals.length) {
    issue(context, ["publication", "counts", "proposals"], "The published proposal count must equal the atomic payload.");
  }
  const eventCount = feed.proposals.reduce(
    (total, proposal) => total + proposal.events.length,
    0
  );
  if (publication.counts.events !== eventCount) {
    issue(context, ["publication", "counts", "events"], "The published event count must equal the atomic payload event count.");
  }
}

function validateContracts(
  feed: StructuralFeed,
  context: RefinementContext
): Map<string, StructuralFeed["contracts"][number]> {
  const byGeneration = new Map<string, StructuralFeed["contracts"][number]>();
  const addresses = new Set<string>();
  const generations = feed.contracts.map((contract) => toUint(contract.generation));
  const active = feed.contracts.filter((contract) => contract.active);

  if (active.length !== 1) {
    issue(context, ["contracts"], "Exactly one Voting contract generation must be active.");
  }

  for (const [index, contract] of feed.contracts.entries()) {
    const path = ["contracts", index] as const;
    const generation = toUint(contract.generation);
    const deployment = toUint(contract.deploymentBlock.number);
    const start = toUint(contract.startBlock);
    if (generation === null || generation === 0n || generation > UINT256_MAX) {
      issue(context, [...path, "generation"], "Contract generation must be a positive uint256.");
    }
    if (byGeneration.has(contract.generation)) {
      issue(context, [...path, "generation"], "Contract generations must be unique.");
    }
    byGeneration.set(contract.generation, contract);
    const normalizedAddress = contract.votingAddress.toLowerCase();
    if (addresses.has(normalizedAddress)) {
      issue(context, [...path, "votingAddress"], "Voting contract addresses must be unique across generations.");
    }
    addresses.add(normalizedAddress);
    if (deployment === null || start === null || start < deployment) {
      issue(context, [...path, "startBlock"], "The producer start block cannot precede contract deployment.");
    }
    if (contract.active) {
      if (contract.retiredAtBlock !== null || contract.replacedByVotingAddress !== null) {
        issue(context, path, "The active contract generation cannot be retired or replaced.");
      }
    } else if (contract.retiredAtBlock === null || contract.replacedByVotingAddress === null) {
      issue(context, path, "An inactive contract generation must identify retirement and replacement.");
    } else {
      const retired = toUint(contract.retiredAtBlock.number);
      if (retired === null || start === null || retired < start) {
        issue(
          context,
          [...path, "retiredAtBlock"],
          "A contract generation cannot retire before its producer start block."
        );
      }
    }
    validatePinnedVotingSource(contract.source, context, [...path, "source"]);
  }

  if (generations.every((generation) => generation !== null)) {
    const normalized = generations as bigint[];
    for (let index = 0; index < normalized.length; index += 1) {
      if (normalized[index] !== BigInt(index + 1)) {
        issue(context, ["contracts", index, "generation"], "Contract generations must be ordered and contiguous from one.");
      }
    }
  }
  for (let index = 0; index < feed.contracts.length - 1; index += 1) {
    const current = feed.contracts[index];
    const next = feed.contracts[index + 1];
    if (
      current.active ||
      current.replacedByVotingAddress === null ||
      !sameAddress(current.replacedByVotingAddress, next.votingAddress)
    ) {
      issue(
        context,
        ["contracts", index, "replacedByVotingAddress"],
        "Each retired Voting generation must point to the next ordered generation."
      );
    }
  }
  return byGeneration;
}

function validateProposals(
  feed: StructuralFeed,
  contracts: Map<string, StructuralFeed["contracts"][number]>,
  context: RefinementContext
): void {
  const proposalKeys = new Set<string>();
  const eventIds = new Set<string>();
  const logCoordinates = new Set<string>();
  const transactionGroups = new Map<
    string,
    Pick<FeedEvent["log"], "blockNumber" | "blockHash" | "timestamp" | "transactionHash">
  >();
  const blockGroups = new Map<
    string,
    Pick<FeedEvent["log"], "blockHash" | "timestamp">
  >();

  for (const [proposalIndex, proposal] of feed.proposals.entries()) {
    const path = ["proposals", proposalIndex] as const;
    const proposalKey = proposalRefKey(proposal.ref);
    if (proposalKeys.has(proposalKey)) {
      issue(context, [...path, "ref"], "Composite proposal identities must be globally unique.");
    }
    proposalKeys.add(proposalKey);

    const contract = contracts.get(proposal.contractGeneration);
    if (
      !contract ||
      proposal.ref.chainId !== feed.chainId ||
      !contract ||
      !sameAddress(contract.votingAddress, proposal.ref.votingAddress)
    ) {
      issue(context, [...path, "ref"], "The proposal feed chain and Voting address must match its contract generation.");
    }
    validateProposal(feed, proposal, contract, context, path);

    let previousPosition: FeedEvent["log"] | null = null;
    for (const [eventIndex, event] of proposal.events.entries()) {
      const eventPath = [...path, "events", eventIndex] as PropertyKey[];
      validateEvent(feed, proposal, contract, event, context, eventPath);
      const expectedId = createDaoFeedEventId(
        feed.chainId,
        event.proposalRef.votingAddress,
        event.log
      );
      if (event.eventId !== expectedId) {
        issue(context, [...eventPath, "eventId"], "Event ID must be derived from chain, Voting address, block hash, transaction index, and log index without transaction-hash dependence.");
      }
      if (eventIds.has(event.eventId)) {
        issue(context, [...eventPath, "eventId"], "Event IDs must be globally unique.");
      }
      eventIds.add(event.eventId);
      const coordinate = `${proposal.ref.chainId}:${proposal.ref.votingAddress}:${event.log.blockHash}:${event.log.transactionIndex}:${event.log.logIndex}`;
      if (logCoordinates.has(coordinate)) {
        issue(context, eventPath, "Event log coordinates must be globally unique.");
      }
      logCoordinates.add(coordinate);
      if (previousPosition && comparePositions(previousPosition, event.log) >= 0) {
        issue(context, eventPath, "Proposal events must be strictly ordered by block, transaction, and log position.");
      }
      previousPosition = event.log;

      const blockGroup = blockGroups.get(event.log.blockNumber);
      if (
        blockGroup &&
        (blockGroup.blockHash !== event.log.blockHash ||
          blockGroup.timestamp !== event.log.timestamp)
      ) {
        issue(
          context,
          [...eventPath, "log"],
          "Events at one block height must share its canonical hash and producer-owned timestamp."
        );
      } else if (!blockGroup) {
        blockGroups.set(event.log.blockNumber, event.log);
      }

      const transactionKey = `${event.log.blockHash}:${event.log.transactionIndex}`;
      const group = transactionGroups.get(transactionKey);
      if (group) {
        if (
          group.blockNumber !== event.log.blockNumber ||
          group.blockHash !== event.log.blockHash ||
          group.timestamp !== event.log.timestamp ||
          group.transactionHash !== event.log.transactionHash
        ) {
          issue(context, [...eventPath, "log"], "Events in one transaction group must share block, timestamp, and nullable transaction provenance.");
        }
      } else {
        transactionGroups.set(transactionKey, event.log);
      }
    }
  }
}

function validateProposal(
  feed: StructuralFeed,
  proposal: FeedProposal,
  contract: StructuralFeed["contracts"][number] | undefined,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const total = toUint(proposal.totalWeight);
  const yea = toUint(proposal.yeaWeight);
  const nay = toUint(proposal.nayWeight);
  if (total === null || yea === null || nay === null || total !== yea + nay) {
    issue(context, [...path, "totalWeight"], "Proposal vote totals must equal Yea plus Nay weights.");
  }
  if (
    proposal.createdAt > proposal.voteStartsAt ||
    proposal.voteStartsAt >= proposal.voteEndsAt
  ) {
    issue(context, [...path, "voteStartsAt"], "Proposal voting timestamps must be ordered from creation through vote end.");
  }
  if ((proposal.executionStartsAt === null) !== (proposal.executionEndsAt === null)) {
    issue(context, [...path, "executionStartsAt"], "Execution start and end timestamps must be present together.");
  }
  if (
    proposal.executionStartsAt !== null &&
    proposal.executionEndsAt !== null &&
    (proposal.voteEndsAt > proposal.executionStartsAt ||
      proposal.executionStartsAt >= proposal.executionEndsAt)
  ) {
    issue(context, [...path, "executionStartsAt"], "Execution timestamps must follow the voting window.");
  }

  validateRules(proposal, contract, context, [...path, "rules"]);
  validateContent(proposal, context, [...path, "content"]);
  validateDiscussion(proposal, context, [...path, "discussion"]);
  validateScript(proposal, context, [...path, "script"]);
  validateVoteAccounting(proposal, context, [...path, "voteAccounting"]);

  const proposeEvents = proposal.events.filter(
    (event): event is Extract<FeedEvent, { type: "propose" }> =>
      event.type === "propose"
  );
  if (proposeEvents.length !== 1) {
    issue(context, [...path, "events"], "Every proposal must retain exactly one Propose event.");
    return;
  }
  const propose = proposeEvents[0];
  if (proposal.events[0] !== propose) {
    issue(
      context,
      [...path, "events"],
      "The unique Propose event must be the first lifecycle event."
    );
  }
  validateProposeBindings(proposal, propose, context, path);
  validateCreation(proposal, propose, context, [...path, "creation"]);
  validateStatus(feed, proposal, context, path);
  validateModeration(proposal, context, [...path, "moderation"]);
  validateAnalysis(
    feed,
    proposal,
    contract,
    propose,
    context,
    [...path, "analysis"]
  );
}

function validateRules(
  proposal: FeedProposal,
  contract: StructuralFeed["contracts"][number] | undefined,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const rules = proposal.rules;
  const mutable = rules.mutableConfiguration;
  if (rules.approvalThresholdBps !== proposal.thresholdBps) {
    issue(context, [...path, "approvalThresholdBps"], "Rules must retain the proposal's snapshotted threshold.");
  }
  if (rules.proposalType !== proposal.type) {
    issue(context, [...path, "proposalType"], "Rules must retain the proposal type.");
  }
  if (!sameAddress(rules.votingAddress, proposal.ref.votingAddress)) {
    issue(context, [...path, "votingAddress"], "Rules must bind to the proposal Voting address.");
  }
  if (mutable.contractGeneration !== proposal.contractGeneration) {
    issue(context, [...path, "mutableConfiguration", "contractGeneration"], "Mutable rule observations must bind to the proposal contract generation.");
  }
  if (mutable.voteStartTimestamp !== proposal.voteStartsAt) {
    issue(
      context,
      [...path, "mutableConfiguration", "voteStartTimestamp"],
      "The observed mutable vote start must match the proposal timeline."
    );
  }
  if (mutable.votingPeriodSeconds !== proposal.voteEndsAt - proposal.voteStartsAt) {
    issue(context, [...path, "mutableConfiguration", "votingPeriodSeconds"], "The observed voting period must match proposal timestamps.");
  }
  const expectedDelay =
    proposal.executionStartsAt === null
      ? null
      : proposal.executionStartsAt - proposal.voteEndsAt;
  if (mutable.executionDelaySeconds !== expectedDelay) {
    issue(context, [...path, "mutableConfiguration", "executionDelaySeconds"], "The observed execution delay must match proposal timestamps.");
  }
  if (
    (proposal.type === "signal" && mutable.executionGuard !== null) ||
    (proposal.type === "executable" && mutable.executionGuard === null)
  ) {
    issue(context, [...path, "mutableConfiguration", "executionGuard"], "The observed execution guard must match proposal type.");
  }
  if (
    contract &&
    (!sameAddress(mutable.voterAddress, contract.voterAddress) ||
      !sameAddress(mutable.executorAddress, contract.executorAddress))
  ) {
    issue(context, [...path, "mutableConfiguration"], "Mutable Voter and Executor observations must match the contract generation.");
  }
  validatePinnedVotingSource(rules.votingSource, context, [...path, "votingSource"]);
}

function validateContent(
  proposal: FeedProposal,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const content = proposal.content;
  let expectedCid: string;
  try {
    expectedCid = createDaoRawSha256Cid(content.digest as Hex);
  } catch {
    issue(context, [...path, "digest"], "Content digest must produce a CIDv1 raw SHA-256 Base32 identity.");
    return;
  }
  if (content.cid !== expectedCid) {
    issue(context, [...path, "cid"], "Content CID must be the CIDv1 raw SHA-256 Base32 form of the onchain content digest.");
  }
  validateRetryRecord(
    content.retry,
    content.state !== "available",
    content.error?.retryable ?? false,
    context,
    [...path, "retry"],
    "content"
  );

  if (content.state === "unavailable") {
    if (
      content.assetRecords.length !== 0 ||
      content.attachmentRecords.length !== 0
    ) {
      issue(context, [...path, "assetRecords"], "Unavailable content cannot guess asset records.");
    }
    return;
  }

  if (!hasExactlyOneFinalLf(content.canonicalJson)) {
    issue(context, [...path, "canonicalJson"], "Fetched content JSON must end in exactly one final LF.");
  }
  if (getDaoProposalUtf8ByteLength(content.canonicalJson) > 131_072) {
    issue(
      context,
      [...path, "canonicalJson"],
      "Retained raw proposal content cannot exceed 131,072 UTF-8 bytes."
    );
  }
  const rawDigest = sha256(new TextEncoder().encode(content.canonicalJson));
  if (rawDigest !== content.digest) {
    issue(context, [...path, "digest"], "Content digest must hash the exact fetched JSON bytes including its final LF.");
  }

  if (content.state === "invalid") {
    if (
      content.assetRecords.length !== 0 ||
      content.attachmentRecords.length !== 0
    ) {
      issue(
        context,
        [...path, "assetRecords"],
        "Invalid content cannot publish guessed asset records before manifest validation."
      );
    }
    return;
  }

  const value = content.value as DaoProposalContent;
  const canonical = new TextDecoder().decode(canonicalizeDaoProposalContent(value));
  if (canonical !== content.canonicalJson) {
    issue(context, [...path, "canonicalJson"], "Available content must retain the fixed-order canonical JSON without reserialization guesses.");
  }
  const identity = deriveDaoProposalContentIdentity(value);
  if (identity.digest !== content.digest || identity.cid !== content.cid) {
    issue(context, path, "Available content digest and CID must bind its exact canonical bytes.");
  }
  const parsed = parseDaoProposalContent(value);
  if (parsed.errors.length > 0) {
    issue(context, [...path, "value"], `Available proposal content failed the accepted parser: ${parsed.errors[0]?.code ?? "UNKNOWN"}.`);
  }
  if (value.proposalType !== proposal.type) {
    issue(context, [...path, "value", "proposalType"], "Available content proposal type must match the event script type.");
  }
  if (!sameAddress(value.createdBy, proposal.proposer)) {
    issue(context, [...path, "value", "createdBy"], "Available content author must match the proposal proposer.");
  }
  if (Math.floor(Date.parse(value.createdAt) / 1_000) !== proposal.createdAt) {
    issue(context, [...path, "value", "createdAt"], "Available content creation time must match the proposal creation record.");
  }

  const normalizedPaths = new Set<string>();
  const normalizedDigests = new Set<string>();
  for (const [index, asset] of value.assets.entries()) {
    const normalizedPath = asset.path.normalize("NFC");
    const digest = asset.digest.toLowerCase();
    if (asset.path !== normalizedPath || normalizedPaths.has(normalizedPath)) {
      issue(context, [...path, "value", "assets", index, "path"], "Manifest paths must be normalized and duplicate asset paths are forbidden.");
    }
    if (normalizedDigests.has(digest)) {
      issue(context, [...path, "value", "assets", index, "digest"], "Manifest digests must be unique; duplicate asset digests are forbidden.");
    }
    normalizedPaths.add(normalizedPath);
    normalizedDigests.add(digest);
    const record = content.assetRecords[index];
    if (!record || !assetRecordsMatch(asset, record)) {
      issue(context, [...path, "assetRecords", index], "Each manifest entry must bind one exact independent raw asset record.");
      continue;
    }
    const assetCid = createDaoRawSha256Cid(asset.digest as Hex);
    if (
      record.cid !== assetCid ||
      record.gatewayUrl !== `https://ipfs.io/ipfs/${assetCid}`
    ) {
      issue(context, [...path, "assetRecords", index], "Asset CID and gateway must bind the manifest digest without a path suffix.");
    }
    validateRetryRecord(
      record.retry,
      record.state !== "available",
      record.error?.retryable ?? false,
      context,
      [...path, "assetRecords", index, "retry"],
      "asset"
    );
    if ((record.state === "available") !== (record.error === null)) {
      issue(context, [...path, "assetRecords", index, "error"], "Asset availability and failure evidence must agree.");
    }
  }
  if (content.assetRecords.length !== value.assets.length) {
    issue(context, [...path, "assetRecords"], "Asset records must map every manifest entry exactly once.");
  }
  if (content.attachmentRecords.length !== parsed.attachments.length) {
    issue(
      context,
      [...path, "attachmentRecords"],
      "Attachment records must map every accepted Markdown image exactly once."
    );
  }
  for (const [index, attachment] of parsed.attachments.entries()) {
    const record = content.attachmentRecords[index];
    const kind = attachment.target.startsWith("ipfs://")
      ? "direct_ipfs"
      : "relative_manifest_path";
    if (
      !record ||
      record.kind !== kind ||
      record.target !== attachment.target ||
      record.manifestPath !== attachment.asset.path ||
      record.assetCid !== attachment.cid ||
      record.gatewayUrl !== attachment.gatewayUrl ||
      (kind === "relative_manifest_path" &&
        record.target !== record.manifestPath) ||
      (kind === "direct_ipfs" && record.target !== `ipfs://${record.assetCid}`)
    ) {
      issue(
        context,
        [...path, "attachmentRecords", index],
        "Attachment provenance must preserve its exact relative path or direct raw CID and suffix-free gateway binding."
      );
    }
  }
}

function validateDiscussion(
  proposal: FeedProposal,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const discussion = proposal.discussion;
  if (discussion.url !== null) {
    validateHttpsUrl(discussion.url, context, [...path, "url"], "Discussion URL");
  }
  if (
    proposal.content.state === "available" &&
    discussion.url !== null &&
    proposal.content.value.discussionUrl !== discussion.url
  ) {
    issue(context, [...path, "url"], "Discussion provenance must match the immutable content URL.");
  }
}

function validateScript(
  proposal: FeedProposal,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const script = proposal.script;
  if (script.bytes === null) {
    if (
      script.structure.state !== "unavailable" ||
      script.hashVerification.state !== "unavailable" ||
      script.retention.state !== "missing"
    ) {
      issue(context, path, "Missing exact event bytes require explicit script retention, structure, and hash-unavailable states.");
    }
    return;
  }

  if (script.retention.state !== "retained") {
    issue(context, [...path, "retention"], "Available event script bytes must be retained by the producer.");
  }
  const computedHash = keccak256(script.bytes as Hex);
  const expectedVerification = computedHash === script.hash ? "verified" : "mismatch";
  if (
    script.hashVerification.state !== expectedVerification ||
    script.hashVerification.computedHash !== computedHash
  ) {
    issue(context, [...path, "hashVerification"], "Script hash verification must truthfully compare exact event bytes with the stored hash.");
  }
  const structure = checkDaoExecutorScript(script.bytes, proposal.type);
  const expectedStructure = structure.state;
  if (script.structure.state !== expectedStructure) {
    issue(context, [...path, "structure"], "Script structure state must match the bounded Executor frame parser.");
  }
  if (structure.state === "invalid") {
    if (
      script.structure.errorCode !== structure.error?.code ||
      script.structure.errorOffset !== structure.error?.offset
    ) {
      issue(context, [...path, "structure"], "Malformed direct-contract scripts must retain the exact parser failure and offset.");
    }
  } else if (
    script.structure.errorCode !== null ||
    script.structure.errorOffset !== null
  ) {
    issue(context, [...path, "structure"], "Valid or empty scripts cannot carry a parser error.");
  }
  if (
    proposal.type === "signal" &&
    (script.bytes !== "0x" || script.hash !== DAO_EMPTY_SCRIPT_HASH)
  ) {
    issue(context, path, "Signal proposals must retain the empty script and fixed empty-script hash.");
  }
  if (
    proposal.type === "executable" &&
    (script.bytes === "0x" || script.hash === DAO_EMPTY_SCRIPT_HASH)
  ) {
    issue(context, path, "Executable proposals cannot use the empty script identity.");
  }
}

function validateVoteAccounting(
  proposal: FeedProposal,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const votes = proposal.events.filter(
    (event): event is Extract<FeedEvent, { type: "vote" }> => event.type === "vote"
  );
  const latestByActor = new Map<string, (typeof votes)[number]>();
  let humanParticipationCount = 0;
  for (const vote of votes) {
    if (vote.data.actorKind === "human") humanParticipationCount += 1;
    if (vote.actor.address !== null) {
      latestByActor.set(vote.actor.address.toLowerCase(), vote);
    }
  }
  if (proposal.voteAccounting.humanParticipationCount !== humanParticipationCount) {
    issue(context, [...path, "humanParticipationCount"], "Human participation counts must exclude aggregate rewrite events.");
  }
  let total = 0n;
  let yea = 0n;
  for (const vote of latestByActor.values()) {
    const weight = toUint(vote.data.weight) ?? 0n;
    total += weight;
    yea += (weight * BigInt(vote.data.yeaBps)) / BigInt(DAO_BPS);
  }
  if (total !== toUint(proposal.totalWeight) || yea !== toUint(proposal.yeaWeight)) {
    issue(context, path, "Vote totals must use the last absolute contribution per human or aggregate actor, never incremental aggregate events.");
  }
}

function validateProposeBindings(
  proposal: FeedProposal,
  event: Extract<FeedEvent, { type: "propose" }>,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const eventPath = [...path, "events", proposal.events.indexOf(event)] as PropertyKey[];
  if (event.data.proposalId !== proposal.ref.proposalId) {
    issue(context, [...eventPath, "data", "proposalId"], "Propose event proposal ID must match the composite proposal identity.");
  }
  if (!sameAddress(event.data.proposer, proposal.proposer)) {
    issue(context, [...eventPath, "data", "proposer"], "Propose event proposer must match the proposal record.");
  }
  if (event.data.votingEpoch !== proposal.votingEpoch) {
    issue(context, [...eventPath, "data", "votingEpoch"], "Propose event voting epoch must match the proposal record.");
  }
  if (event.data.contentDigest !== proposal.content.digest) {
    issue(context, [...eventPath, "data", "contentDigest"], "Propose event content digest must match the onchain proposal digest.");
  }
  if (event.data.script !== proposal.script.bytes) {
    issue(context, [...eventPath, "data", "script"], "Propose event script must equal the exact retained event script.");
  }
  if ((event.data.script === null) !== (event.data.scriptFailure !== null)) {
    issue(context, [...eventPath, "data", "scriptFailure"], "Missing Propose script bytes require an explicit retention failure.");
  }
  if (proposal.script.retention.proposeEventId !== event.eventId) {
    issue(
      context,
      [...path, "script", "retention", "proposeEventId"],
      "Script retention must bind the proposal's one exact Propose event."
    );
  }
  if (
    (event.data.script === null && event.data.abi.state !== "unavailable") ||
    (event.data.script !== null && event.data.abi.state !== "available")
  ) {
    issue(
      context,
      [...eventPath, "data", "abi"],
      "Raw Propose ABI evidence must be explicitly available with exact script bytes or unavailable with a failure."
    );
  }
  if (event.log.timestamp !== null && event.log.timestamp !== proposal.createdAt) {
    issue(context, [...eventPath, "log", "timestamp"], "Proposal creation time must use the producer-owned Propose event timestamp without substitution.");
  }
  const observation = proposal.rules.mutableConfiguration.observedAt;
  if (comparePositions(observation, event.log) > 0) {
    issue(
      context,
      [...path, "rules", "mutableConfiguration", "observedAt"],
      "Mutable rule configuration must be observed no later than the Propose event."
    );
  }
  if (
    observation.blockNumber === event.log.blockNumber &&
    observation.blockHash !== event.log.blockHash
  ) {
    issue(
      context,
      [...path, "rules", "mutableConfiguration", "observedAt", "blockHash"],
      "Rule observation block hash must match the Propose block at the same height."
    );
  }

  if (event.data.script !== null && event.data.abi.state === "available") {
    const canonical = encodeDaoProposeLog({
      address: proposal.ref.votingAddress as Address,
      contentDigest: event.data.contentDigest as Hex,
      logIndex: event.log.logIndex,
      proposalId: BigInt(event.data.proposalId),
      proposer: event.data.proposer as Address,
      script: event.data.script as Hex,
      votingEpoch: BigInt(event.data.votingEpoch),
    });
    const raw = event.data.abi;
    if (
      !sameAddress(raw.address, proposal.ref.votingAddress) ||
      canonical.topics.length !== raw.topics.length ||
      canonical.topics.some((topic, index) => topic !== raw.topics[index]) ||
      canonical.data !== raw.data
    ) {
      issue(context, [...eventPath, "data", "abi"], "Propose receipt evidence must retain one exact canonical four-topic log and byte-for-byte ABI data.");
    }
  }
}

function validateCreation(
  proposal: FeedProposal,
  propose: Extract<FeedEvent, { type: "propose" }>,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const creation = proposal.creation;
  if (creation.proposeEventId !== propose.eventId) {
    issue(context, [...path, "proposeEventId"], "Creation evidence must identify the proposal's one exact Propose event.");
  }
  if (creation.state === "historical_incomplete") {
    if (
      creation.transactionHash !== propose.log.transactionHash ||
      (propose.log.transactionHash !== null &&
        propose.data.abi.state === "available" &&
        propose.data.script !== null)
    ) {
      issue(context, path, "Historical incomplete creation requires missing receipt, ABI, or exact script provenance without substituting the known transaction hash.");
    }
    return;
  }
  if (propose.data.script === null || propose.data.abi.state !== "available") {
    issue(
      context,
      path,
      "Indexed creation requires retained exact script bytes and available canonical Propose ABI evidence."
    );
  }
  if (
    propose.log.transactionHash === null ||
    creation.transactionHash !== propose.log.transactionHash ||
    creation.receipt.transactionHash !== propose.log.transactionHash
  ) {
    issue(context, [...path, "transactionHash"], "Creation transaction hash must match the successful receipt and Propose log.");
  }
  if (
    creation.receipt.blockNumber !== propose.log.blockNumber ||
    creation.receipt.blockHash !== propose.log.blockHash ||
    creation.receipt.blockTimestamp !== propose.log.timestamp ||
    creation.receipt.transactionIndex !== propose.log.transactionIndex
  ) {
    issue(context, [...path, "receipt"], "Creation receipt block and transaction identity must match the Propose log.");
  }
}

function validateStatus(
  feed: StructuralFeed,
  proposal: FeedProposal,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const eventTypes = new Set(proposal.events.map((event) => event.type));
  const terminalEvents = proposal.events.filter((event) =>
    ["retract", "flag", "veto", "execute"].includes(event.type)
  );
  if (terminalEvents.length > 1) {
    issue(context, [...path, "events"], "A proposal cannot carry contradictory terminal lifecycle events.");
  }
  const votes = proposal.events.filter((event) => event.type === "vote");
  if (
    (eventTypes.has("retract") || eventTypes.has("flag")) &&
    votes.length > 0
  ) {
    issue(
      context,
      [...path, "events"],
      "Retracted or flagged proposals cannot contain Vote history."
    );
  }
  for (const [index, event] of proposal.events.entries()) {
    if (
      event.type === "vote" &&
      event.log.timestamp !== null &&
      (event.log.timestamp < proposal.voteStartsAt ||
        event.log.timestamp >= proposal.voteEndsAt)
    ) {
      issue(
        context,
        [...path, "events", index, "log", "timestamp"],
        "Vote event time must fall inside the proposal voting window."
      );
    }
    if (
      (event.type === "retract" || event.type === "flag") &&
      event.log.timestamp !== null &&
      event.log.timestamp >= proposal.voteEndsAt
    ) {
      issue(
        context,
        [...path, "events", index, "log", "timestamp"],
        "Retraction and flagging cannot occur after the assigned voting epoch."
      );
    }
    if (event.type === "execute") {
      if (
        proposal.type !== "executable" ||
        proposal.executionStartsAt === null ||
        proposal.executionEndsAt === null ||
        (event.log.timestamp !== null &&
          (event.log.timestamp < proposal.executionStartsAt ||
            event.log.timestamp >= proposal.executionEndsAt))
      ) {
        issue(
          context,
          [...path, "events", index],
          "Voting Execute must belong to an executable proposal inside its execution window."
        );
      }
    }
  }
  const postVoteEpochEndsAt =
    proposal.executionEndsAt ??
    proposal.voteEndsAt + proposal.rules.mutableConfiguration.votingPeriodSeconds;
  const expectedProtocolStatus = deriveDaoProtocolStatus({
    exists: true,
    now: feed.canonicalBlock.timestamp,
    voteStartsAt: proposal.voteStartsAt,
    voteEndsAt: proposal.voteEndsAt,
    postVoteEpochEndsAt,
    type: proposal.type,
    thresholdBps: proposal.thresholdBps,
    totalWeight: BigInt(proposal.totalWeight),
    yeaWeight: BigInt(proposal.yeaWeight),
    retracted: eventTypes.has("retract"),
    executed: eventTypes.has("execute"),
    flagged: eventTypes.has("flag"),
    vetoed: eventTypes.has("veto"),
  });
  if (proposal.protocolStatus !== expectedProtocolStatus) {
    issue(context, [...path, "protocolStatus"], "Protocol status must match event flags, chain time, vote result, and signal auto-execution semantics.");
  }
  const expectedDisplay = deriveDaoDisplayStatus(
    proposal.protocolStatus,
    proposal.type
  );
  if (proposal.displayStatus !== expectedDisplay) {
    issue(context, [...path, "displayStatus"], "Display status must match protocol status and proposal type.");
  }
  const expectedGroup = deriveDaoDisplayGroup(expectedDisplay, proposal.type);
  if (proposal.displayGroup !== expectedGroup) {
    issue(context, [...path, "displayGroup"], "Display group must match the supplied display status and proposal type.");
  }
}

function validateModeration(
  proposal: FeedProposal,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const flags = proposal.events.filter(
    (event): event is Extract<FeedEvent, { type: "flag" }> => event.type === "flag"
  );
  const vetoes = proposal.events.filter(
    (event): event is Extract<FeedEvent, { type: "veto" }> => event.type === "veto"
  );
  const flagReason = flags[0]?.data.reason ?? null;
  const vetoReason = vetoes[0]?.data.reason ?? null;
  if (proposal.moderation.flagReason !== flagReason) {
    issue(context, [...path, "flagReason"], "Stored flag reason must preserve the exact onchain event string.");
  }
  if (proposal.moderation.vetoReason !== vetoReason) {
    issue(context, [...path, "vetoReason"], "Stored veto reason must preserve the exact onchain event string.");
  }
  for (const [kind, value] of [
    ["flag", proposal.moderation.flagReason],
    ["veto", proposal.moderation.vetoReason],
  ] as const) {
    if (
      value !== null &&
      new TextEncoder().encode(value).byteLength >
        DAO_FEED_MAX_MODERATION_REASON_BYTES
    ) {
      issue(context, [...path, `${kind}Reason`], `${kind} reasons may contain at most 256 UTF-8 bytes while preserving empty and untrimmed onchain strings.`);
    }
  }
}

function validateAnalysis(
  feed: StructuralFeed,
  proposal: FeedProposal,
  contract: StructuralFeed["contracts"][number] | undefined,
  propose: Extract<FeedEvent, { type: "propose" }>,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const analysis = proposal.analysis;
  const simulation = analysis.proposalSimulation;
  if (analysis.state === "pending") {
    if (simulation.state !== "pending") {
      issue(context, [...path, "proposalSimulation"], "Pending analysis requires a pending simulation record.");
    }
    return;
  }
  if (
    analysis.generatedAt !== null &&
    Date.parse(analysis.generatedAt) > Date.parse(feed.generatedAt)
  ) {
    issue(
      context,
      [...path, "generatedAt"],
      "Analysis generation cannot follow its containing feed snapshot."
    );
  }
  if (analysis.state === "unavailable" && simulation.state !== "unavailable") {
    issue(context, [...path, "proposalSimulation"], "Unavailable analysis requires an explicit unavailable simulation state.");
  }
  if (analysis.state === "failed" && simulation.state !== "failed" && !analysis.calls.some((call) => call.decodeStatus === "failed")) {
    issue(context, path, "Failed analysis must identify a failed decode or failed atomic simulation.");
  }
  if (analysis.state === "complete" && analysis.calls.some((call) => call.decodeStatus !== "verified")) {
    issue(context, [...path, "calls"], "Complete analysis cannot contain unknown or failed decoding.");
  }
  if (analysis.state === "partial") {
    if (
      !analysis.calls.some((call) => call.decodeStatus === "verified") ||
      !analysis.calls.some((call) => call.decodeStatus !== "verified")
    ) {
      issue(context, [...path, "calls"], "Partial analysis requires both verified and unknown or failed calls.");
    }
  }

  for (const [index, call] of analysis.calls.entries()) {
    if (call.decodeStatus === "verified") {
      validateSource(call.verifiedSource, context, [...path, "calls", index, "verifiedSource"]);
    }
    if (call.decodeStatus === "unknown" && call.verifiedSource !== null) {
      issue(context, [...path, "calls", index, "verifiedSource"], "Unknown calls cannot claim a verified source.");
    }
  }

  if (proposal.script.bytes !== null) {
    const structure = checkDaoExecutorScript(proposal.script.bytes, proposal.type);
    if (structure.state === "valid") {
      if (!["pending", "unavailable"].includes(analysis.state)) {
        if (analysis.calls.length !== structure.frames.length) {
          issue(context, [...path, "calls"], "Decoded calls must retain every parsed script frame in exact order.");
        }
        for (const [index, frame] of structure.frames.entries()) {
          const call = analysis.calls[index];
          if (
            !call ||
            call.index !== frame.index ||
            call.offset !== frame.offset ||
            !sameAddress(call.target, frame.target) ||
            call.calldata !== frame.calldata ||
            call.calldataBytes !== frame.calldataBytes ||
            call.selector !== frame.selector
          ) {
            issue(context, [...path, "calls", index], "Decoded and raw calls must preserve parsed script frame identity and order.");
          }
        }
      }
    } else if (analysis.calls.length !== 0 || simulation.state !== "unavailable") {
      issue(context, path, "Structurally malformed direct-contract scripts require empty decoding and unavailable simulation without rejecting feed history.");
    }
  } else if (analysis.calls.length !== 0 || simulation.state !== "unavailable") {
    issue(context, path, "Missing exact event script bytes require empty decoding and unavailable simulation.");
  }

  if (simulation.state === "succeeded" || simulation.state === "failed") {
    if (!contract) return;
    if (
      simulation.blockNumber !== propose.log.blockNumber ||
      simulation.blockHash !== propose.log.blockHash
    ) {
      issue(context, [...path, "proposalSimulation", "blockHash"], "Proposal simulation must use the exact Propose event block and hash.");
    }
    if (propose.log.timestamp === null || simulation.stateTimestamp !== propose.log.timestamp) {
      issue(context, [...path, "proposalSimulation", "stateTimestamp"], "Proposal simulation block-time treatment must use the producer-owned Propose block timestamp.");
    }
    if (!sameAddress(simulation.caller, proposal.ref.votingAddress)) {
      issue(context, [...path, "proposalSimulation", "caller"], "The execution-equivalent caller must be the proposal Voting contract.");
    }
    if (!sameAddress(simulation.executorAddress, contract.executorAddress)) {
      issue(context, [...path, "proposalSimulation", "executorAddress"], "Proposal simulation must call the generation's exact Executor.");
    }
    if (
      proposal.script.hashVerification.state === "unavailable" ||
      simulation.scriptHash !== proposal.script.hashVerification.computedHash
    ) {
      issue(context, [...path, "proposalSimulation", "scriptHash"], "Proposal simulation must bind the exact retained event script hash.");
    }
    const simulatedAt = Date.parse(simulation.simulatedAt) / 1_000;
    const generatedAt = Date.parse(feed.generatedAt) / 1_000;
    if (
      !Number.isFinite(simulatedAt) ||
      simulatedAt < simulation.stateTimestamp ||
      simulatedAt > generatedAt
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "simulatedAt"],
        "Simulation time must follow its proposal block and cannot follow feed generation."
      );
    }
    const override = simulation.stateOverrides[0];
    if (
      !sameAddress(override.votingAddress, proposal.ref.votingAddress) ||
      override.proposalId !== proposal.ref.proposalId
    ) {
      issue(context, [...path, "proposalSimulation", "stateOverrides"], "REVM simulation must model Voting setting this proposal's executed flag before Executor calls.");
    }
    validatePinnedVotingSource(override.source, context, [...path, "proposalSimulation", "stateOverrides", 0, "source"]);
  }
}

function validateEvent(
  feed: StructuralFeed,
  proposal: FeedProposal,
  contract: StructuralFeed["contracts"][number] | undefined,
  event: FeedEvent,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  if (proposalRefKey(event.proposalRef) !== proposalRefKey(proposal.ref)) {
    issue(context, [...path, "proposalRef"], "Every event must retain the complete parent proposal identity.");
  }
  if (event.contractGeneration !== proposal.contractGeneration) {
    issue(context, [...path, "contractGeneration"], "Every event must bind the proposal contract generation.");
  }
  const eventBlock = toUint(event.log.blockNumber);
  const canonical = toUint(feed.canonicalBlock.number);
  const contractStart = contract ? toUint(contract.startBlock) : null;
  if (eventBlock === null || canonical === null || eventBlock > canonical) {
    issue(context, [...path, "log", "blockNumber"], "Event blocks cannot follow the canonical snapshot block.");
  }
  if (contractStart !== null && eventBlock !== null && eventBlock < contractStart) {
    issue(
      context,
      [...path, "log", "blockNumber"],
      "Lifecycle events cannot precede their contract generation's producer start block."
    );
  }
  if (event.log.blockNumber === feed.canonicalBlock.number && event.log.blockHash !== feed.canonicalBlock.hash) {
    issue(context, [...path, "log", "blockHash"], "An event at the canonical height must use the canonical block hash.");
  }
  if (event.log.timestamp !== null && event.log.timestamp > feed.canonicalBlock.timestamp) {
    issue(context, [...path, "log", "timestamp"], "Producer-owned event time cannot follow the canonical snapshot time.");
  }
  validateEventAbi(proposal, event, context, [...path, "data", "abi"]);
  validateActorEvidence(proposal, event, context, [...path, "actor"]);

  if (event.type === "vote") {
    const expectedRole =
      event.data.actorKind === "human"
        ? "voter"
        : event.data.actorKind;
    if (event.actor.role !== expectedRole || event.actor.address === null) {
      issue(context, [...path, "actor"], "Vote actor role must match historical human, delegated-staking aggregate, or YBC aggregate classification.");
    }
    if (event.data.actorKind === "human") {
      if (
        event.data.direction === null ||
        (event.data.direction === "yea" && event.data.yeaBps !== DAO_BPS) ||
        (event.data.direction === "nay" && event.data.yeaBps !== 0) ||
        !event.data.countsAsHumanParticipation
      ) {
        issue(context, [...path, "data"], "Human vote direction, binary basis points, and participation classification must agree.");
      }
    } else if (event.data.direction !== null || event.data.countsAsHumanParticipation) {
      issue(context, [...path, "data", "direction"], "Aggregate vote direction must stay null and cannot count as extra human participation.");
    }
    if (contract && !sameAddress(event.data.classification.voterAddress, contract.voterAddress)) {
      issue(context, [...path, "data", "classification", "voterAddress"], "Vote classification evidence must use the generation's Voter.");
    }
    const aggregateAddress =
      event.data.actorKind === "delegated_staking_aggregate"
        ? event.data.classification.delegatedStakingAddress
        : event.data.actorKind === "ybc_aggregate"
          ? event.data.classification.ybcAddress
          : null;
    if (
      event.actor.address !== null &&
      ((aggregateAddress !== null &&
        !sameAddress(event.actor.address, aggregateAddress)) ||
        (aggregateAddress === null &&
          (sameAddress(
            event.actor.address,
            event.data.classification.delegatedStakingAddress
          ) ||
            sameAddress(
              event.actor.address,
              event.data.classification.ybcAddress
            ))))
    ) {
      issue(
        context,
        [...path, "data", "classification"],
        "Vote actor classification must match the delegated-staking and YBC addresses effective at this log."
      );
    }
    if (comparePositions(event.data.classification.observedAt, event.log) > 0) {
      issue(context, [...path, "data", "classification", "observedAt"], "Vote actor classification must be observed no later than the event log.");
    }
    if (
      event.data.classification.observedAt.blockNumber === event.log.blockNumber &&
      event.data.classification.observedAt.blockHash !== event.log.blockHash
    ) {
      issue(
        context,
        [...path, "data", "classification", "observedAt", "blockHash"],
        "Vote classification observed in the event block must use that canonical block hash."
      );
    }
  }
  if (event.type === "flag" || event.type === "veto") {
    if (new TextEncoder().encode(event.data.reason).byteLength > DAO_FEED_MAX_MODERATION_REASON_BYTES) {
      issue(context, [...path, "data", "reason"], "Historical moderation reasons may be empty or untrimmed but cannot exceed String[256] UTF-8 bytes.");
    }
  }
}

function validateEventAbi(
  proposal: FeedProposal,
  event: FeedEvent,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  let expected: { address: Address; topics: Hex[]; data: Hex };
  if (event.type === "propose") {
    expected = encodeDaoFeedLifecycleEventAbi({
      type: "propose",
      votingAddress: proposal.ref.votingAddress as Address,
      proposalId: BigInt(event.data.proposalId),
      proposer: event.data.proposer as Address,
      votingEpoch: BigInt(event.data.votingEpoch),
      contentDigest: event.data.contentDigest as Hex,
      script: (event.data.script ?? "0x") as Hex,
    });
  } else if (event.type === "vote") {
    if (event.actor.address === null) {
      issue(context, path, "Vote ABI evidence requires the emitted account address.");
      return;
    }
    expected = encodeDaoFeedLifecycleEventAbi({
      type: "vote",
      votingAddress: proposal.ref.votingAddress as Address,
      proposalId: BigInt(proposal.ref.proposalId),
      account: event.actor.address as Address,
      weight: BigInt(event.data.weight),
      yeaBps: BigInt(event.data.yeaBps),
    });
  } else if (event.type === "retract") {
    expected = encodeDaoFeedLifecycleEventAbi({
      type: "retract",
      votingAddress: proposal.ref.votingAddress as Address,
      proposalId: BigInt(proposal.ref.proposalId),
    });
  } else if (event.type === "flag" || event.type === "veto") {
    expected = encodeDaoFeedLifecycleEventAbi({
      type: event.type,
      votingAddress: proposal.ref.votingAddress as Address,
      proposalId: BigInt(proposal.ref.proposalId),
      reason: event.data.reason,
    });
  } else {
    if (event.actor.address === null) {
      issue(context, path, "Voting Execute ABI evidence requires its emitted external caller.");
      return;
    }
    expected = encodeDaoFeedLifecycleEventAbi({
      type: "execute",
      votingAddress: proposal.ref.votingAddress as Address,
      proposalId: BigInt(proposal.ref.proposalId),
      executionCaller: event.actor.address as Address,
    });
  }

  const raw = event.data.abi;
  if (
    !sameAddress(raw.address, expected.address) ||
    raw.topics.length !== expected.topics.length ||
    raw.topics.some((topic, index) => topic !== expected.topics[index])
  ) {
    issue(
      context,
      path,
      "Lifecycle event ABI evidence must retain the exact Voting emitter and canonically ordered topics."
    );
  }
  if (raw.state === "available" && raw.data !== expected.data) {
    issue(
      context,
      path,
      "Lifecycle event ABI data must equal the canonical re-encoding with no dirty padding, alternate offsets, or trailing bytes."
    );
  }
  if (raw.state === "unavailable" && event.type !== "propose") {
    issue(
      context,
      path,
      "Only an explicitly incomplete historical Propose data record may lack raw ABI data."
    );
  }
}

function validateActorEvidence(
  proposal: FeedProposal,
  event: FeedEvent,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const actor = event.actor;
  if (actor.evidence.state === "unavailable") {
    if (actor.address !== null || actor.role !== "unknown") {
      issue(context, path, "Unavailable actor evidence must not guess an address or role.");
    }
    if (!["flag", "veto"].includes(event.type)) {
      issue(context, path, "Only historical Flag or Veto actor evidence may be unavailable.");
    }
    return;
  }
  if (actor.address === null) {
    issue(context, [...path, "address"], "Verified actor evidence requires an address.");
    return;
  }
  if (["propose", "vote", "execute"].includes(event.type)) {
    if (actor.evidence.method !== "event_argument" || actor.evidence.observedAt !== null) {
      issue(context, [...path, "evidence"], "Propose, Vote, and Execute actors must come from their event argument.");
    }
  } else if (event.type === "retract") {
    if (
      actor.evidence.method !== "proposal_proposer" ||
      !sameAddress(actor.address, proposal.proposer) ||
      actor.role !== "proposer"
    ) {
      issue(context, path, "Retract actor must be explicitly inferred from the proposal proposer.");
    }
  } else {
    const expectedRole = event.type === "flag" ? "operator" : "guardian";
    if (
      actor.evidence.method !== "historical_role_and_transaction_sender" ||
      actor.role !== expectedRole ||
      !sameAddress(actor.address, actor.evidence.transactionSender) ||
      !sameAddress(actor.address, actor.evidence.configuredRoleAddress) ||
      comparePositions(actor.evidence.observedAt, event.log) > 0 ||
      (actor.evidence.observedAt.blockNumber === event.log.blockNumber &&
        actor.evidence.observedAt.blockHash !== event.log.blockHash)
    ) {
      issue(context, path, "Flag and Veto actors require historical role or transaction-sender evidence effective at the event.");
    }
  }
  if (event.type === "propose" && (!sameAddress(actor.address, proposal.proposer) || actor.role !== "proposer")) {
    issue(context, path, "Propose actor must equal the proposal proposer event argument.");
  }
  if (event.type === "execute" && actor.role !== "execution_caller") {
    issue(context, path, "Voting Execute actor must retain the emitted external caller without substituting the configured Executor contract.");
  }
}

function validateCreationIdentityStage(
  stage: z.infer<typeof DaoCreationIdentityStageStructuralSchema>,
  context: RefinementContext
): void {
  if ((stage.stage === "indexed") !== (stage.indexedSnapshotId !== null)) {
    issue(context, ["indexedSnapshotId"], "Only an indexed identity stage may name its atomic feed snapshot.");
  }
  if (stage.transactionHash !== stage.identity.log.transactionHash) {
    issue(context, ["transactionHash"], "Receipt-stage transaction hash must match its decoded Propose log.");
  }
  if (!sameAddress(stage.ref.votingAddress, stage.identity.abi.address)) {
    issue(context, ["identity", "abi", "address"], "Receipt-stage ABI evidence must come from the exact Voting address.");
  }
  const canonical = encodeDaoProposeLog({
    address: stage.ref.votingAddress as Address,
    contentDigest: stage.identity.contentDigest as Hex,
    logIndex: stage.identity.log.logIndex,
    proposalId: BigInt(stage.ref.proposalId),
    proposer: stage.identity.proposer as Address,
    script: stage.identity.script as Hex,
    votingEpoch: BigInt(stage.identity.votingEpoch),
  });
  if (
    canonical.topics.some(
      (topic, index) => topic !== stage.identity.abi.topics[index]
    ) || canonical.data !== stage.identity.abi.data
  ) {
    issue(context, ["identity", "abi"], "Receipt-stage identity must decode and canonically re-encode one exact four-topic Propose log.");
  }
}

function validatePinnedVotingSource(
  source: z.infer<typeof VerifiedSourceSchema>,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  validateSource(source, context, path);
  if (
    source.kind !== "github" ||
    source.revision !== DAO_PINNED_VOTING_REVISION ||
    source.sourcePath !== PINNED_VOTING_SOURCE_PATH ||
    !source.url.includes(`/${DAO_PINNED_VOTING_REVISION}/${PINNED_VOTING_SOURCE_PATH}`)
  ) {
    issue(context, path, "Voting provenance must use the pinned Voting revision and exact source path.");
  }
}

function validateSource(
  source: z.infer<typeof VerifiedSourceSchema>,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  if (!source.label.trim() || !source.revision.trim() || !source.sourcePath.trim()) {
    issue(context, path, "Verified source kind, label, revision, and source path must be complete.");
  }
  const sourceSegments = source.sourcePath.split("/");
  if (
    source.sourcePath.startsWith("/") ||
    source.sourcePath.includes("\\") ||
    sourceSegments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    issue(
      context,
      [...path, "sourcePath"],
      "Verified source paths must be normalized repository-relative paths without traversal."
    );
  }
  validateHttpsUrl(source.url, context, [...path, "url"], "Verified source URL");
}

function validateHttpsUrl(
  value: string,
  context: RefinementContext,
  path: readonly PropertyKey[],
  label: string
): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      issue(context, path, `${label} must use HTTPS.`);
    }
    if (url.username || url.password) {
      issue(context, path, `${label} must not contain credentials.`);
    }
  } catch {
    issue(context, path, `${label} must be a complete HTTPS URL.`);
  }
}

function validateRetryRecord(
  retry: {
    attempts: number;
    maxAttempts: number;
    lastAttemptAt: string | null;
    nextRetryAt: string | null;
  },
  failed: boolean,
  retryable: boolean,
  context: RefinementContext,
  path: readonly PropertyKey[],
  label: string
): void {
  if (retry.attempts > retry.maxAttempts) {
    issue(context, [...path, "attempts"], `${label} retry attempts cannot exceed the bounded maximum.`);
  }
  if (retry.attempts === 0 && retry.lastAttemptAt !== null) {
    issue(context, [...path, "lastAttemptAt"], `${label} retry timestamps require at least one attempt.`);
  }
  if (retry.attempts > 0 && retry.lastAttemptAt === null) {
    issue(context, [...path, "lastAttemptAt"], `${label} retry attempts require the exact last-attempt timestamp.`);
  }
  const shouldRetry = failed && retryable && retry.attempts < retry.maxAttempts;
  if ((retry.nextRetryAt !== null) !== shouldRetry) {
    issue(
      context,
      [...path, "nextRetryAt"],
      `${label} next-retry time must exist exactly while a retryable failure has attempts remaining.`
    );
  }
  if (
    retry.nextRetryAt !== null &&
    retry.lastAttemptAt !== null &&
    Date.parse(retry.nextRetryAt) <= Date.parse(retry.lastAttemptAt)
  ) {
    issue(
      context,
      [...path, "nextRetryAt"],
      `${label} next-retry time must follow the last bounded attempt.`
    );
  }
}

function assertPayloadBound(
  feed: StructuralFeed,
  context: RefinementContext
): void {
  const bytes = new TextEncoder().encode(JSON.stringify(feed)).byteLength;
  if (bytes > DAO_FEED_MAX_PAYLOAD_BYTES) {
    issue(context, [], "DAO feed payload exceeds the 64 MiB consumer admission bound.");
  }
}

function assertIsoUtc(
  value: string,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  if (!isCanonicalIsoUtc(value)) {
    issue(context, path, "Timestamp must be a real canonical UTC instant.");
  }
}

function isCanonicalIsoUtc(value: string): boolean {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  const canonical = parsed.toISOString();
  return value === canonical || value === canonical.replace(".000Z", "Z");
}

function assetRecordsMatch(
  asset: z.infer<typeof ProposalAssetSchema>,
  record: z.infer<typeof AssetRecordSchema>
): boolean {
  return (
    asset.path === record.path &&
    asset.mediaType === record.mediaType &&
    asset.byteLength === record.byteLength &&
    asset.digest === record.digest &&
    asset.width === record.width &&
    asset.height === record.height
  );
}

function hasExactlyOneFinalLf(value: string): boolean {
  return value.endsWith("\n") && !value.endsWith("\n\n");
}

function proposalRefKey(ref: z.infer<typeof ProposalRefSchema>): string {
  return `${ref.chainId}:${ref.votingAddress.toLowerCase()}:${ref.proposalId}`;
}

function comparePositions(
  left: Pick<z.infer<typeof EventPositionSchema>, "blockNumber" | "transactionIndex" | "logIndex">,
  right: Pick<z.infer<typeof EventPositionSchema>, "blockNumber" | "transactionIndex" | "logIndex">
): number {
  const leftBlock = BigInt(left.blockNumber);
  const rightBlock = BigInt(right.blockNumber);
  if (leftBlock < rightBlock) return -1;
  if (leftBlock > rightBlock) return 1;
  if (left.transactionIndex < right.transactionIndex) return -1;
  if (left.transactionIndex > right.transactionIndex) return 1;
  return left.logIndex - right.logIndex;
}

function toUint(value: string): bigint | null {
  if (!UINT_PATTERN.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= UINT256_MAX ? parsed : null;
  } catch {
    return null;
  }
}

function sameAddress(left: string, right: string): boolean {
  try {
    return isAddressEqual(left as Address, right as Address);
  } catch {
    return false;
  }
}

function issue(
  context: RefinementContext,
  path: readonly PropertyKey[],
  message: string
): void {
  context.addIssue({ code: "custom", path: [...path], message });
}
