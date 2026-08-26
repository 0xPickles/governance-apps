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
export const DAO_FEED_EPOCH_LENGTH_SECONDS = 1_209_600 as const;
export const DAO_FEED_MAX_CONTRACTS = 64;
export const DAO_FEED_MAX_PROPOSALS = 100_000;
export const DAO_FEED_MAX_EVENTS_PER_PROPOSAL = 100_000;
export const DAO_FEED_MAX_CALLS = 64;
export const DAO_FEED_MAX_FAILURE_MESSAGE_BYTES = 2_048;
export const DAO_FEED_MAX_MODERATION_REASON_BYTES = 256;
export const DAO_FEED_MAX_RETRY_ATTEMPTS = 16;
export const DAO_FEED_MAX_CONTENT_RETRIES = 8;
export const DAO_FEED_MAX_ASSET_RETRIES = 8;
export const DAO_FEED_RETRY_BACKOFF_SECONDS = 120 as const;
export const DAO_FEED_MAX_RETRY_BACKOFF_SECONDS = 3_600 as const;

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
const PINNED_VOTING_SOURCE_URL = `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${PINNED_VOTING_SOURCE_PATH}`;
const PINNED_VOTER_SOURCE_PATH = "contracts/governance/Voter.vy";
const PINNED_VOTER_SOURCE_URL = `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${PINNED_VOTER_SOURCE_PATH}`;
const PINNED_EXECUTOR_SOURCE_PATH = "contracts/governance/Executor.vy";
const PINNED_EXECUTOR_SOURCE_URL = `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${PINNED_EXECUTOR_SOURCE_PATH}`;
const PINNED_VOTING_SOURCE_SHA256 =
  "0x6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e" as const;
const PINNED_VOTER_SOURCE_SHA256 =
  "0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab" as const;
const PINNED_EXECUTOR_SOURCE_SHA256 =
  "0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1" as const;
const PINNED_EXECUTOR_COMPILER_INTEGRITY_SHA256 =
  "0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b" as const;
const PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH = 1_157 as const;
const PINNED_EXECUTOR_RUNTIME_KECCAK256 =
  "0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151" as const;
const PINNED_EXECUTOR_RUNTIME_SHA256 =
  "0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c" as const;
const PINNED_VOTING_LAYOUT_SHA256 =
  "0x0f963a37d02adeb6a34fabb98ab37b118031ac9b7380e4ad65ac2765b4b6db26" as const;
const VOTING_PROPOSALS_MAPPING_SLOT = 17n;
const VOTING_PROPOSAL_EXECUTED_SLOT_OFFSET = 8n;
const UINT_PATTERN = /^(0|[1-9]\d*)$/u;
const POSITIVE_UINT_PATTERN = /^[1-9]\d*$/u;
const LOWER_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const LOWER_NONZERO_ADDRESS_PATTERN = /^0x(?=[0-9a-f]{40}$)(?=.*[1-9a-f])[0-9a-f]{40}$/u;
const LOWER_HASH_PATTERN = /^0x[0-9a-f]{64}$/u;
const LOWER_NONZERO_HASH_PATTERN = /^0x(?=[0-9a-f]{64}$)(?=.*[1-9a-f])[0-9a-f]{64}$/u;
const LOWER_BYTES_PATTERN = /^0x(?:[0-9a-f]{2})*$/u;
const SELECTOR_PATTERN = /^0x[0-9a-f]{8}$/u;
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,95}$/u;
const SNAPSHOT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const EVENT_ID_PATTERN = /^[0-9]+:0x[0-9a-f]{40}:0x[0-9a-f]{64}:[0-9]+:[0-9]+$/u;
const CONFIGURATION_ID_PATTERN = /^config-[1-9]\d*$/u;
const VOTER_INVOCATION_ID_PATTERN =
  /^[0-9]+:0x[0-9a-f]{40}:0x[0-9a-f]{64}:(?:[0-9]+)(?:\.[0-9]+)*$/u;
const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const GITHUB_REVISION_PATTERN = /^[0-9a-f]{40}$/u;
const SOURCE_PATH_PATTERN = /^[A-Za-z0-9_.\/-]+$/u;
const CANONICAL_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const ZERO_ADDRESS = `0x${"00".repeat(20)}`;
const DAO_FORUM_PROPOSAL_CATEGORIES = new Map<
  number,
  { name: string; slug: string }
>([
  [5, { name: "Proposals", slug: "proposals" }],
  [9, { name: "Vaults", slug: "vaults" }],
  [18, { name: "Other Products (Labs)", slug: "labs" }],
  [17, { name: "Finance", slug: "finance" }],
  [21, { name: "Protocol and Governance", slug: "protocol-and-governance" }],
  [10, { name: "YIPs", slug: "yips" }],
  [29, { name: "veYFI", slug: "veyfi" }],
]);

const zUint = z.string().max(78).regex(UINT_PATTERN);
const zPositiveUint = z.string().max(78).regex(POSITIVE_UINT_PATTERN);
const zPositiveU64 = z.string().max(20).regex(POSITIVE_UINT_PATTERN);
const zSafeUint = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const zPositiveSafeUint = zSafeUint.min(1);
const zUnixSeconds = zSafeUint.max(4_294_967_295);
const zAddress = z.string().regex(LOWER_ADDRESS_PATTERN);
const zNonZeroAddress = z.string().regex(LOWER_NONZERO_ADDRESS_PATTERN);
const zHash = z.string().regex(LOWER_HASH_PATTERN);
const zNonZeroHash = z.string().regex(LOWER_NONZERO_HASH_PATTERN);
const zBytes = z.string().max(4_098).regex(LOWER_BYTES_PATTERN);
const zContentBase64 = z
  .string()
  .max(174_764)
  .regex(CANONICAL_BASE64_PATTERN);
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
const InvalidContentFailureSchema = z.strictObject({
  code: z.enum([
    "CONTENT_DIGEST_MISMATCH",
    "CONTENT_UTF8_INVALID",
    "CONTENT_JSON_INVALID",
    "CONTENT_SCHEMA_INVALID",
    "CONTENT_FINAL_LF_INVALID",
    "CONTENT_CANONICAL_INVALID",
  ]),
  message: z.string().min(1).max(DAO_FEED_MAX_FAILURE_MESSAGE_BYTES),
  retryable: z.literal(false),
  observedAt: zIsoUtc.nullable(),
  source: z.literal("content"),
});
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
  kind: z.literal("github"),
  label: z.string().min(1).max(256),
  url: z.string().min(1).max(2_048),
  repository: z.string().regex(GITHUB_REPOSITORY_PATTERN),
  revision: z.string().regex(GITHUB_REVISION_PATTERN),
  sourcePath: z.string().min(1).max(512).regex(SOURCE_PATH_PATTERN),
});

const ProposalRefSchema = z.strictObject({
  chainId: zPositiveSafeUint,
  votingAddress: zNonZeroAddress,
  proposalId: zUint,
});

const CanonicalBlockSchema = z.strictObject({
  number: zUint,
  hash: zNonZeroHash,
  timestamp: zUnixSeconds,
});

const NullableBlockTimeSchema = z.strictObject({
  number: zUint,
  hash: zNonZeroHash,
  timestamp: zUnixSeconds.nullable(),
});

const EventPositionSchema = z.strictObject({
  blockNumber: zUint,
  blockHash: zNonZeroHash,
  transactionIndex: zSafeUint,
  logIndex: zSafeUint,
});

const LogRefSchema = EventPositionSchema.extend({
  timestamp: zUnixSeconds.nullable(),
  transactionHash: zNonZeroHash.nullable(),
}).strict();

const ActorEvidenceSchema = z.union([
  z.strictObject({
    state: z.literal("verified"),
    method: z.literal("event_argument"),
    observedAt: z.null(),
    configurationId: z.null(),
    transactionSender: z.null(),
    configuredRoleAddress: z.null(),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("verified"),
    method: z.literal("proposal_proposer"),
    observedAt: z.null(),
    configurationId: z.null(),
    transactionSender: z.null(),
    configuredRoleAddress: z.null(),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("verified"),
    method: z.literal("historical_role_and_transaction_sender"),
    observedAt: EventPositionSchema,
    configurationId: z.string().regex(CONFIGURATION_ID_PATTERN),
    transactionSender: zNonZeroAddress,
    configuredRoleAddress: zNonZeroAddress,
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    method: z.null(),
    observedAt: z.null(),
    configurationId: z.null(),
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
  address: zNonZeroAddress,
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
    address: zNonZeroAddress,
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
    proposer: zNonZeroAddress,
    votingEpoch: zUint,
    contentDigest: zHash,
    script: zBytes.nullable(),
    scriptFailure: ProvenanceFailureSchema.nullable(),
    abi: ProposeEventAbiSchema,
  }),
});

const VoterAggregatorResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("skipped_non_member"),
    weight: z.null(),
  }),
  z.strictObject({
    state: z.literal("returned_zero"),
    weight: z.literal("0"),
  }),
  z.strictObject({
    state: z.literal("returned_positive"),
    weight: zPositiveUint,
  }),
]);

const VoteClassificationCommonShape = {
  configurationId: z.string().regex(CONFIGURATION_ID_PATTERN),
  voterAddress: zNonZeroAddress,
  observedAt: EventPositionSchema,
  observationSemantics: z.literal("effective_at_event"),
};

const PinnedVoterTraceSchema = z.strictObject({
  invocationId: z.string().max(512).regex(VOTER_INVOCATION_ID_PATTERN),
  transactionHash: zNonZeroHash,
  voterCallTraceAddress: z.array(zSafeUint).min(1).max(64),
  votingCallTraceAddress: z.array(zSafeUint).min(2).max(65),
  voterCallDepth: zPositiveSafeUint.max(64),
  votingCallDepth: zPositiveSafeUint.max(65),
  voterSelector: z.enum(["0x69586e2e", "0xff855dde"]),
  voterCaller: zNonZeroAddress,
  votingTarget: zNonZeroAddress,
  proposalId: zUint,
  votingCallOrdinal: zSafeUint.max(2),
  emittedAccount: zAddress,
  ybcMembership: z.boolean(),
  aggregatePathExecuted: z.boolean(),
  aggregatorResult: VoterAggregatorResultSchema,
});

const VoteEventSchema = z.strictObject({
  ...EventBaseShape,
  type: z.literal("vote"),
  data: z.strictObject({
    actorKind: z.enum([
      "human",
      "delegated_staking_aggregate",
      "ybc_aggregate",
      "unclassified",
    ]),
    yeaBps: z.number().int().min(0).max(DAO_BPS),
    direction: z.enum(["yea", "nay"]).nullable(),
    weight: zUint,
    weightSemantics: z.literal("absolute_actor_contribution"),
    countsAsHumanParticipation: z.boolean(),
    classification: z.discriminatedUnion("method", [
      z.strictObject({
        method: z.literal("pinned_voter_call_trace"),
        ...VoteClassificationCommonShape,
        delegatedStakingAddress: zAddress,
        ybcAddress: zAddress,
        ybcWeightAggregatorAddress: zAddress,
        voterImplementationState: z.literal("verified_pinned"),
        trace: PinnedVoterTraceSchema,
        error: z.null(),
      }),
      z.strictObject({
        method: z.literal("pinned_voter_trace_unavailable"),
        ...VoteClassificationCommonShape,
        delegatedStakingAddress: zAddress,
        ybcAddress: zAddress,
        ybcWeightAggregatorAddress: zAddress,
        voterImplementationState: z.literal("verified_pinned"),
        trace: z.null(),
        error: ProvenanceFailureSchema,
      }),
      z.strictObject({
        method: z.literal("unverified_voter_unclassified"),
        ...VoteClassificationCommonShape,
        delegatedStakingAddress: z.null(),
        ybcAddress: z.null(),
        ybcWeightAggregatorAddress: z.null(),
        voterImplementationState: z.literal("unverified"),
        trace: z.null(),
        error: ProvenanceFailureSchema,
      }),
    ]),
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
  data: z.strictObject({
    reason: z.string().max(256),
    branch: z.enum(["early_no_votes", "post_participation"]),
    voteTotalsAtVeto: z.strictObject({
      totalWeight: zUint,
      yeaWeight: zUint,
      nayWeight: zUint,
      aggregateSemantics: z.literal("last_event_per_actor_at_event_position"),
    }),
    abi: ReasonEventAbiSchema,
  }),
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
  createdBy: zNonZeroAddress,
  createdAt: zIsoUtc,
  assets: z.array(ProposalAssetSchema).max(16),
});

const RetryAttemptBaseShape = {
  attempts: zPositiveSafeUint.max(DAO_FEED_MAX_CONTENT_RETRIES),
  maxAttempts: z.literal(DAO_FEED_MAX_CONTENT_RETRIES),
  lastAttemptAt: zIsoUtc,
  policy: z.literal("fixed_120_seconds"),
};

const ContentRetrySchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...RetryAttemptBaseShape,
    state: z.literal("succeeded"),
    nextRetryAt: z.null(),
    backoffSeconds: z.null(),
  }),
  z.strictObject({
    ...RetryAttemptBaseShape,
    state: z.literal("scheduled"),
    nextRetryAt: zIsoUtc,
    backoffSeconds: z.literal(DAO_FEED_RETRY_BACKOFF_SECONDS),
  }),
  z.strictObject({
    ...RetryAttemptBaseShape,
    state: z.literal("non_retryable"),
    nextRetryAt: z.null(),
    backoffSeconds: z.null(),
  }),
  z.strictObject({
    ...RetryAttemptBaseShape,
    state: z.literal("exhausted"),
    attempts: z.literal(DAO_FEED_MAX_CONTENT_RETRIES),
    nextRetryAt: z.null(),
    backoffSeconds: z.null(),
  }),
]);

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
  retry: ContentRetrySchema,
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
  expectedCid: z.string().min(1).max(128),
  expectedDigest: zHash,
  computedCid: z.string().min(1).max(128).nullable(),
  computedDigest: zHash.nullable(),
  digestComparison: z.enum(["verified", "mismatch", "unavailable"]),
  retry: ContentRetrySchema,
  assetRecords: z.array(AssetRecordSchema).max(16),
  attachmentRecords: z.array(AttachmentRecordSchema).max(4_096),
};

export const DaoFeedContentV1Schema = z.discriminatedUnion("state", [
  z.strictObject({
    ...ContentCommonShape,
    state: z.literal("available"),
    canonicalJson: z.string().min(2).max(131_072),
    rawBytesBase64: z.null(),
    byteLength: zSafeUint.max(131_072),
    value: ProposalContentValueSchema,
    error: z.null(),
  }),
  z.strictObject({
    ...ContentCommonShape,
    state: z.literal("invalid"),
    canonicalJson: z.null(),
    rawBytesBase64: zContentBase64,
    byteLength: zSafeUint.max(131_072),
    value: z.null(),
    error: InvalidContentFailureSchema,
  }),
  z.strictObject({
    ...ContentCommonShape,
    state: z.literal("unavailable"),
    canonicalJson: z.null(),
    rawBytesBase64: z.null(),
    byteLength: z.null(),
    value: z.null(),
    error: ContentFailureSchema,
  }),
]);

const DiscussionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("verified"),
    url: z.string().min(1).max(2_048),
    title: z.string().min(1).max(512),
    rootCategoryId: z.literal(5),
    categoryId: z.union([
      z.literal(5),
      z.literal(9),
      z.literal(18),
      z.literal(17),
      z.literal(21),
      z.literal(10),
      z.literal(29),
    ]),
    category: z.string().min(1).max(128),
    categorySlugPath: z.array(z.string().min(1).max(128)).min(1).max(16),
    categoryAncestryIds: z.array(zSafeUint).min(1).max(2),
    membership: z.enum(["root", "descendant"]),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unverified"),
    url: z.string().min(1).max(2_048),
    title: z.null(),
    rootCategoryId: z.null(),
    categoryId: z.null(),
    category: z.null(),
    categorySlugPath: z.tuple([]),
    categoryAncestryIds: z.tuple([]),
    membership: z.null(),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    url: z.string().max(2_048).nullable(),
    title: z.null(),
    rootCategoryId: z.null(),
    categoryId: z.null(),
    category: z.null(),
    categorySlugPath: z.tuple([]),
    categoryAncestryIds: z.tuple([]),
    membership: z.null(),
    error: DiscussionFailureSchema,
  }),
]);

export const DaoRetainedScriptV1Schema = z.strictObject({
  bytes: zBytes.nullable(),
  hash: zNonZeroHash,
  structure: z.strictObject({
    state: z.enum([
      "empty",
      "valid",
      "invalid",
      "implementation_unverified",
      "unavailable",
    ]),
    errorCode: z.string().max(96).nullable(),
    errorOffset: zSafeUint.nullable(),
  }),
  hashVerification: z.discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("verified"),
      computedHash: zNonZeroHash,
    }),
    z.strictObject({
      state: z.literal("mismatch"),
      computedHash: zNonZeroHash,
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
  votingAddress: zNonZeroAddress,
  proposalId: zUint,
  fromValue: z.literal(false),
  toValue: z.literal(true),
  proof: z.strictObject({
    source: VerifiedSourceSchema,
    storageLayout: z.strictObject({
      compiler: z.literal("vyper@0.4.2"),
      sourceSha256: z.literal(PINNED_VOTING_SOURCE_SHA256),
      derivation: z.literal(
        "keccak256(bytes32(mapping_base_slot) || bytes32(proposal_id)) + executed_field_slot_offset"
      ),
      layoutArtifactSha256: zNonZeroHash,
      mappingBaseSlot: z.literal(VOTING_PROPOSALS_MAPPING_SLOT.toString()),
      mappingKey: zUint,
      mappingHashInputOrder: z.literal("slot_then_key"),
      proposalStorageBaseSlot: zNonZeroHash,
      executedFieldSlotOffset: z.literal(
        Number(VOTING_PROPOSAL_EXECUTED_SLOT_OFFSET)
      ),
      resolvedStorageSlot: zNonZeroHash,
      preStorageWord: zHash,
      postStorageWord: zNonZeroHash,
    }),
    bytecode: z.strictObject({
      evidenceKind: z.literal("archive_rpc"),
      rpcMethod: z.literal("eth_getCode"),
      hashMethod: z.literal("keccak256"),
      address: zNonZeroAddress,
      blockNumber: zUint,
      blockHash: zNonZeroHash,
      blockHashVerification: z.literal("canonical_hash_at_height"),
      codeByteLength: zPositiveSafeUint,
      deployedBytecodeHash: zNonZeroHash,
      derivation: z.literal(
        "keccak256(eth_getCode(voting_address, propose_block_number))"
      ),
    }),
  }),
});

const SimulationCompleteShape = {
  method: z.literal("revm_engine_injected_executor_frame_conditional_origin"),
  engine: z.literal("revm@34"),
  executorAddress: zNonZeroAddress,
  scriptHash: zNonZeroHash,
  blockNumber: zUint,
  blockHash: zNonZeroHash,
  simulatedAt: zIsoUtc,
  stateTimestamp: zUnixSeconds,
  timestampMode: z.literal("block"),
  timestampOverride: z.null(),
  caller: zNonZeroAddress,
  transactionOrigin: zNonZeroAddress,
  originPolicy: z.strictObject({
    state: z.literal("frozen_hypothetical_scenario"),
    source: z.literal("propose_transaction_sender"),
    semantics: z.literal(
      "conditional_on_recorded_origin_block_gas_frame_and_state"
    ),
    proposalTransactionHash: zNonZeroHash,
  }),
  frameContext: z.strictObject({
    entry: z.literal("engine_injected"),
    outerVotingCall: z.literal("not_simulated"),
    executorCaller: zNonZeroAddress,
    executorCodeAddress: zNonZeroAddress,
    targetCaller: zNonZeroAddress,
    callValue: z.literal("0"),
    noCodeOverrides: z.literal(true),
    operatorCheckExecuted: z.literal(true),
    executorImplementation: z.lazy(() => ExecutorImplementationSchema),
    harness: z.strictObject({
      name: z.literal("gov-apps-stats-revm-frame-injector"),
      revision: z.string().min(1).max(128),
      artifactSha256: zNonZeroHash,
    }),
    gasContext: z.strictObject({
      derivationPolicy: z.literal(
        "min_propose_block_gas_limit_and_30000000"
      ),
      gasPricePolicy: z.literal("propose_receipt_effective_gas_price"),
      executorFrameGasCap: z.literal("30000000"),
      executorFrameInitialGas: zPositiveU64,
      effectiveGasPriceWei: zUint,
      blockHeader: z.strictObject({
        evidenceKind: z.literal("archive_rpc"),
        rpcMethod: z.literal("eth_getBlockByHash"),
        blockNumber: zUint,
        blockHash: zNonZeroHash,
        gasLimit: zPositiveU64,
        baseFeePerGasWei: zPositiveU64,
      }),
      proposeReceipt: z.strictObject({
        evidenceKind: z.literal("archive_rpc"),
        rpcMethod: z.literal("eth_getTransactionReceipt"),
        transactionHash: zNonZeroHash,
        transactionSender: zNonZeroAddress,
        blockNumber: zUint,
        blockHash: zNonZeroHash,
        status: z.literal("success"),
        effectiveGasPriceWei: zUint,
      }),
      transactionEnvelope: z.literal("synthetic_legacy_no_blobs"),
      accessList: z.tuple([]),
      initialWarmSetPolicy: z.literal(
        "cancun_frame_entry_origin_voting_executor_and_precompiles_no_storage"
      ),
      contextInputsSha256: zNonZeroHash,
    }),
  }),
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
    transactionOrigin: z.null(),
    originPolicy: z.null(),
    frameContext: z.null(),
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
    transactionOrigin: z.null(),
    originPolicy: z.null(),
    frameContext: z.null(),
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

const VoterImplementationSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("verified_pinned"),
    address: zNonZeroAddress,
    source: VerifiedSourceSchema,
    sourceSha256: z.literal(PINNED_VOTER_SOURCE_SHA256),
    compiler: z.literal("vyper@0.4.2"),
    optimization: z.literal("gas"),
    evmVersion: z.literal("cancun"),
    immutableGenesisTimestamp: zUnixSeconds,
    compiledRuntimeBytecodeHash: zNonZeroHash,
    bytecode: z.strictObject({
      evidenceKind: z.literal("archive_rpc_and_reproducible_build"),
      rpcMethod: z.literal("eth_getCode"),
      hashMethod: z.literal("keccak256"),
      address: zNonZeroAddress,
      blockNumber: zUint,
      blockHash: zNonZeroHash,
      codeByteLength: zPositiveSafeUint,
      deployedBytecodeHash: zNonZeroHash,
      buildArtifactSha256: zNonZeroHash,
      buildEvidenceSha256: zNonZeroHash,
      constructorGenesisTimestamp: zUnixSeconds,
    }),
    classificationSemantics: z.literal(
      "pinned_voter_trace_required_for_human_and_aggregate_labels"
    ),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("disabled_zero_address"),
    address: z.literal(ZERO_ADDRESS),
    source: z.null(),
    sourceSha256: z.null(),
    compiler: z.null(),
    optimization: z.null(),
    evmVersion: z.null(),
    immutableGenesisTimestamp: z.null(),
    compiledRuntimeBytecodeHash: z.null(),
    bytecode: z.null(),
    classificationSemantics: z.literal("voting_disabled"),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unverified"),
    address: zNonZeroAddress,
    source: z.null(),
    sourceSha256: z.null(),
    compiler: z.null(),
    optimization: z.null(),
    evmVersion: z.null(),
    immutableGenesisTimestamp: z.null(),
    compiledRuntimeBytecodeHash: z.null(),
    bytecode: z.null(),
    classificationSemantics: z.literal("unclassified"),
    error: ProvenanceFailureSchema,
  }),
]);

const ExecutorImplementationSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("verified_pinned"),
    address: zNonZeroAddress,
    source: VerifiedSourceSchema,
    sourceSha256: z.literal(PINNED_EXECUTOR_SOURCE_SHA256),
    compiler: z.literal("vyper@0.4.2"),
    compilerIntegritySha256: z.literal(
      PINNED_EXECUTOR_COMPILER_INTEGRITY_SHA256
    ),
    optimization: z.literal("gas"),
    evmVersion: z.literal("cancun"),
    experimentalCodegen: z.literal(false),
    compiledRuntimeByteLength: z.literal(
      PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH
    ),
    compiledRuntimeBytecodeHash: z.literal(
      PINNED_EXECUTOR_RUNTIME_KECCAK256
    ),
    compiledRuntimeArtifactSha256: z.literal(
      PINNED_EXECUTOR_RUNTIME_SHA256
    ),
    bytecode: z.strictObject({
      evidenceKind: z.literal("archive_rpc_and_reproducible_build"),
      rpcMethod: z.literal("eth_getCode"),
      hashMethod: z.literal("keccak256"),
      address: zNonZeroAddress,
      blockNumber: zUint,
      blockHash: zNonZeroHash,
      blockHashVerification: z.literal("canonical_hash_at_height"),
      codeByteLength: z.literal(PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH),
      deployedBytecodeHash: z.literal(PINNED_EXECUTOR_RUNTIME_KECCAK256),
      buildArtifactSha256: z.literal(PINNED_EXECUTOR_RUNTIME_SHA256),
    }),
    executionSemantics: z.literal(
      "pinned_executor_32_byte_header_96_bit_length_max_64_calls"
    ),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("uninitialized_zero_address"),
    address: z.literal(ZERO_ADDRESS),
    source: z.null(),
    sourceSha256: z.null(),
    compiler: z.null(),
    compilerIntegritySha256: z.null(),
    optimization: z.null(),
    evmVersion: z.null(),
    experimentalCodegen: z.null(),
    compiledRuntimeByteLength: z.null(),
    compiledRuntimeBytecodeHash: z.null(),
    compiledRuntimeArtifactSha256: z.null(),
    bytecode: z.null(),
    executionSemantics: z.literal("executor_uninitialized"),
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unverified"),
    address: zNonZeroAddress,
    source: z.null(),
    sourceSha256: z.null(),
    compiler: z.null(),
    compilerIntegritySha256: z.null(),
    optimization: z.null(),
    evmVersion: z.null(),
    experimentalCodegen: z.null(),
    compiledRuntimeByteLength: z.null(),
    compiledRuntimeBytecodeHash: z.null(),
    compiledRuntimeArtifactSha256: z.null(),
    bytecode: z.null(),
    executionSemantics: z.literal("custom_executor_unclassified"),
    error: ProvenanceFailureSchema,
  }),
]);

const HistoricalConfigurationValuesShape = {
  contractGeneration: zPositiveUint,
  configurationId: z.string().regex(CONFIGURATION_ID_PATTERN),
  voteStartOffsetSeconds: zSafeUint.max(DAO_FEED_EPOCH_LENGTH_SECONDS),
  votingPeriodSeconds: zSafeUint.max(DAO_FEED_EPOCH_LENGTH_SECONDS),
  votingWindowState: z.enum(["enabled", "disabled_zero_length"]),
  executionDelaySeconds: zSafeUint.max(DAO_FEED_EPOCH_LENGTH_SECONDS - 1),
  executionGuard: z.enum(["guarded", "permissionless"]),
  voterAddress: zAddress,
  voterState: z.enum(["configured", "disabled_zero_address"]),
  voterImplementation: VoterImplementationSchema,
  delegatedStakingAddress: zAddress,
  delegatedStakingState: z.enum(["configured", "zero_address"]),
  ybcAddress: zAddress,
  ybcState: z.enum(["configured", "zero_address"]),
  ybcWeightAggregatorAddress: zAddress,
  ybcWeightAggregatorState: z.enum(["configured", "zero_address"]),
  executorAddress: zAddress,
  executorState: z.enum(["configured", "uninitialized_zero_address"]),
  executorImplementation: ExecutorImplementationSchema,
  votingHookAddress: zAddress,
  votingHookState: z.enum(["configured", "zero_address"]),
  weightMeasureAddress: zAddress,
  weightMeasureState: z.enum(["configured", "zero_address"]),
  proposalBlacklistAddress: zAddress,
  proposalBlacklistState: z.enum([
    "configured",
    "uninitialized_zero_address",
  ]),
  operatorAddress: zAddress,
  operatorState: z.enum(["configured", "zero_address"]),
  guardianAddress: zNonZeroAddress,
};

const HistoricalConfigurationSchema = z.strictObject({
  ...HistoricalConfigurationValuesShape,
  effectiveAt: EventPositionSchema,
  source: VerifiedSourceSchema,
});

const MutableConfigurationSchema = z.strictObject({
  ...HistoricalConfigurationValuesShape,
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
  votingAddress: zNonZeroAddress,
  votingSource: VerifiedSourceSchema,
  mutableConfiguration: MutableConfigurationSchema,
});

const IndexedCreationSchema = z.strictObject({
  state: z.literal("indexed"),
  transactionHash: zNonZeroHash,
  proposeEventId: z.string().regex(EVENT_ID_PATTERN),
  receipt: z.strictObject({
    status: z.literal("success"),
    transactionHash: zNonZeroHash,
    transactionSender: zNonZeroAddress,
    blockNumber: zUint,
    blockHash: zNonZeroHash,
    blockTimestamp: zUnixSeconds.nullable(),
    transactionIndex: zSafeUint,
    effectiveGasPriceWei: zUint,
    matchingProposeLogCount: z.literal(1),
  }),
  error: z.null(),
});

const HistoricalCreationSchema = z.strictObject({
  state: z.literal("historical_incomplete"),
  transactionHash: zNonZeroHash.nullable(),
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

const ChainCreatedAtSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    timestamp: zUnixSeconds,
    source: z.literal("propose_block_timestamp"),
    observedAt: EventPositionSchema,
    error: z.null(),
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    timestamp: z.null(),
    source: z.null(),
    observedAt: z.null(),
    error: ProvenanceFailureSchema,
  }),
]);

const StatusConfigurationSchema = z.strictObject({
  configurationId: z.string().regex(CONFIGURATION_ID_PATTERN),
  effectiveAt: EventPositionSchema,
  observationSemantics: z.literal("effective_at_end_of_canonical_block"),
});

const ProposalSchema = z.strictObject({
  ref: ProposalRefSchema,
  contractGeneration: zPositiveUint,
  proposer: zNonZeroAddress,
  votingEpoch: zUint,
  chainCreatedAt: ChainCreatedAtSchema,
  statusConfiguration: StatusConfigurationSchema,
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
    humanParticipation: z.discriminatedUnion("state", [
      z.strictObject({
        state: z.literal("complete"),
        classifiedHumanCount: zSafeUint,
        unclassifiedVoteEventCount: z.literal(0),
        error: z.null(),
      }),
      z.strictObject({
        state: z.literal("lower_bound"),
        classifiedHumanCount: zSafeUint,
        unclassifiedVoteEventCount: zPositiveSafeUint,
        error: ProvenanceFailureSchema,
      }),
    ]),
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
  votingAddress: zNonZeroAddress,
  deploymentBlock: NullableBlockTimeSchema,
  deployedBytecodeHash: zNonZeroHash,
  startBlock: zUint,
  genesisTimestamp: zUnixSeconds,
  epochLengthSeconds: z.literal(DAO_FEED_EPOCH_LENGTH_SECONDS),
  configurationHistory: z.array(HistoricalConfigurationSchema).min(1).max(10_000),
  active: z.boolean(),
  retiredAtBlock: NullableBlockTimeSchema.nullable(),
  replacedByVotingAddress: zNonZeroAddress.nullable(),
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
    lastBlockHash: zNonZeroHash,
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
      lastAttemptAt: zIsoUtc,
      policy: z.literal("fixed_120_seconds"),
      lastFailure: z.null(),
      nextRetryAt: z.null(),
      backoffSeconds: z.null(),
    }),
    z.strictObject({
      state: z.literal("succeeded_after_retry"),
      attempt: zPositiveSafeUint.min(2).max(DAO_FEED_MAX_RETRY_ATTEMPTS),
      maxAttempts: z.literal(DAO_FEED_MAX_RETRY_ATTEMPTS),
      lastAttemptAt: zIsoUtc,
      policy: z.literal("fixed_120_seconds"),
      lastFailure: PublicationFailureSchema,
      nextRetryAt: z.null(),
      backoffSeconds: z.literal(DAO_FEED_RETRY_BACKOFF_SECONDS),
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
    rawContentBytes: z.literal("indefinite"),
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
  proposer: zNonZeroAddress,
  votingEpoch: zUint,
  contentDigest: zHash,
  script: zBytes,
  log: LogRefSchema,
  abi: z.strictObject({
    address: zNonZeroAddress,
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
  transactionHash: zNonZeroHash,
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
  const result = safeParseDaoFeedV1(value);
  if (!result.success) throw result.error;
  return result.data;
}

export function safeParseDaoFeedV1(value: unknown) {
  const admissionError = getDaoFeedAdmissionError(value);
  if (admissionError !== null) {
    return {
      success: false,
      error: new z.ZodError([
        { code: "custom", path: [], message: admissionError },
      ]),
    } as const;
  }
  return DaoFeedV1Schema.safeParse(value);
}

export function parseDaoFeedJsonV1(json: string): DaoFeedV1 {
  const result = safeParseDaoFeedJsonV1(json);
  if (!result.success) throw result.error;
  return result.data;
}

export function safeParseDaoFeedJsonV1(json: string) {
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > DAO_FEED_MAX_PAYLOAD_BYTES) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom",
          path: [],
          message: "DAO feed payload exceeds the 64 MiB consumer admission bound.",
        },
      ]),
    } as const;
  }
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom",
          path: [],
          message: "DAO feed payload is not valid JSON.",
        },
      ]),
    } as const;
  }
  return safeParseDaoFeedV1(value);
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

export function deriveDaoSimulationContextInputsSha256(input: {
  blockNumber: string;
  blockHash: Hex;
  blockGasLimit: string;
  blockBaseFeePerGasWei: string;
  proposeTransactionHash: Hex;
  proposeTransactionSender: Address;
  proposeReceiptBlockNumber: string;
  proposeReceiptBlockHash: Hex;
  proposeReceiptEffectiveGasPriceWei: string;
  transactionOrigin: Address;
  votingCaller: Address;
  executorAddress: Address;
  executorCaller: Address;
  executorCodeAddress: Address;
  targetCaller: Address;
  harnessRevision: string;
  harnessArtifactSha256: Hex;
  scriptHash: Hex;
  executorSourceRevision: string;
  executorSourcePath: string;
  executorSourceSha256: Hex;
  executorCompilerIntegritySha256: Hex;
  executorRuntimeByteLength: number;
  executorRuntimeBytecodeHash: Hex;
  executorRuntimeArtifactSha256: Hex;
  executorEvidenceAddress: Address;
  executorEvidenceBlockNumber: string;
  executorEvidenceBlockHash: Hex;
  executorEvidenceCodeByteLength: number;
  executorEvidenceDeployedBytecodeHash: Hex;
  executorFrameInitialGas: string;
  effectiveGasPriceWei: string;
}): Hex {
  const canonicalInputs = JSON.stringify({
    schema: "yearn.dao.simulation-context-inputs.v2",
    blockNumber: input.blockNumber,
    blockHash: input.blockHash,
    blockGasLimit: input.blockGasLimit,
    blockBaseFeePerGasWei: input.blockBaseFeePerGasWei,
    blockHeaderEvidenceKind: "archive_rpc",
    blockHeaderRpcMethod: "eth_getBlockByHash",
    proposeTransactionHash: input.proposeTransactionHash,
    proposeTransactionSender: input.proposeTransactionSender,
    proposeReceiptEvidenceKind: "archive_rpc",
    proposeReceiptRpcMethod: "eth_getTransactionReceipt",
    proposeReceiptStatus: "success",
    proposeReceiptBlockNumber: input.proposeReceiptBlockNumber,
    proposeReceiptBlockHash: input.proposeReceiptBlockHash,
    proposeReceiptEffectiveGasPriceWei:
      input.proposeReceiptEffectiveGasPriceWei,
    transactionOrigin: input.transactionOrigin,
    votingCaller: input.votingCaller,
    executorAddress: input.executorAddress,
    executorCaller: input.executorCaller,
    executorCodeAddress: input.executorCodeAddress,
    targetCaller: input.targetCaller,
    callValue: "0",
    noCodeOverrides: true,
    operatorCheckExecuted: true,
    harnessName: "gov-apps-stats-revm-frame-injector",
    harnessRevision: input.harnessRevision,
    harnessArtifactSha256: input.harnessArtifactSha256,
    scriptHash: input.scriptHash,
    executorSourceRepository: "yearn/stYFI",
    executorSourceRevision: input.executorSourceRevision,
    executorSourcePath: input.executorSourcePath,
    executorSourceSha256: input.executorSourceSha256,
    executorCompiler: "vyper@0.4.2",
    executorCompilerIntegritySha256:
      input.executorCompilerIntegritySha256,
    executorOptimization: "gas",
    executorEvmVersion: "cancun",
    executorExperimentalCodegen: false,
    executorRuntimeByteLength: input.executorRuntimeByteLength,
    executorRuntimeBytecodeHash: input.executorRuntimeBytecodeHash,
    executorRuntimeArtifactSha256: input.executorRuntimeArtifactSha256,
    executorEvidenceKind: "archive_rpc_and_reproducible_build",
    executorEvidenceRpcMethod: "eth_getCode",
    executorEvidenceAddress: input.executorEvidenceAddress,
    executorEvidenceBlockNumber: input.executorEvidenceBlockNumber,
    executorEvidenceBlockHash: input.executorEvidenceBlockHash,
    executorEvidenceCodeByteLength: input.executorEvidenceCodeByteLength,
    executorEvidenceDeployedBytecodeHash:
      input.executorEvidenceDeployedBytecodeHash,
    gasDerivationPolicy: "min_propose_block_gas_limit_and_30000000",
    gasPricePolicy: "propose_receipt_effective_gas_price",
    executorFrameGasCap: "30000000",
    executorFrameInitialGas: input.executorFrameInitialGas,
    effectiveGasPriceWei: input.effectiveGasPriceWei,
    transactionEnvelope: "synthetic_legacy_no_blobs",
    accessList: [],
    initialWarmSetPolicy:
      "cancun_frame_entry_origin_voting_executor_and_precompiles_no_storage",
  });
  return sha256(new TextEncoder().encode(canonicalInputs));
}

export function deriveDaoVoterBuildEvidenceSha256(input: {
  constructorGenesisTimestamp: number;
  compiledRuntimeBytecodeHash: Hex;
  codeByteLength: number;
  deployedBytecodeHash: Hex;
  buildArtifactSha256: Hex;
}): Hex {
  const canonicalEvidence = JSON.stringify({
    schema: "yearn.dao.voter-build-evidence.v1",
    sourceRepository: "yearn/stYFI",
    sourceRevision: DAO_PINNED_VOTING_REVISION,
    sourcePath: PINNED_VOTER_SOURCE_PATH,
    sourceSha256: PINNED_VOTER_SOURCE_SHA256,
    compiler: "vyper@0.4.2",
    optimization: "gas",
    evmVersion: "cancun",
    constructorGenesisTimestamp: input.constructorGenesisTimestamp,
    compiledRuntimeBytecodeHash: input.compiledRuntimeBytecodeHash,
    codeByteLength: input.codeByteLength,
    deployedBytecodeHash: input.deployedBytecodeHash,
    buildArtifactSha256: input.buildArtifactSha256,
  });
  return sha256(new TextEncoder().encode(canonicalEvidence));
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
  const uintValues = [input.proposalId];
  if (input.type === "propose") uintValues.push(input.votingEpoch);
  if (input.type === "vote") uintValues.push(input.weight, input.yeaBps);
  if (uintValues.some((value) => value < 0n || value > UINT256_MAX)) {
    throw new RangeError(
      "DAO lifecycle ABI values must be within the uint256 range."
    );
  }
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

export function deriveDaoVotingExecutedStorageSlots(proposalId: bigint): {
  proposalStorageBaseSlot: Hex;
  resolvedStorageSlot: Hex;
} {
  if (proposalId < 0n || proposalId > UINT256_MAX) {
    throw new RangeError("DAO proposal ID must be within the uint256 range.");
  }
  const proposalStorageBaseSlot = keccak256(
    encodeAbiParameters(
      [
        { name: "mappingBaseSlot", type: "uint256" },
        { name: "proposalId", type: "uint256" },
      ],
      [VOTING_PROPOSALS_MAPPING_SLOT, proposalId]
    )
  );
  const resolved =
    (BigInt(proposalStorageBaseSlot) +
      VOTING_PROPOSAL_EXECUTED_SLOT_OFFSET) &
    UINT256_MAX;
  return {
    proposalStorageBaseSlot,
    resolvedStorageSlot: `0x${resolved.toString(16).padStart(64, "0")}`,
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
  validateFailureObservationTimes(feed, feed.generatedAt, context, []);
  validateGlobalBlockIdentity(feed, context);
  validatePublication(feed, context);
  const contracts = validateContracts(feed, context);
  validateProposals(feed, contracts, context);
}

function validateGlobalBlockIdentity(
  feed: StructuralFeed,
  context: RefinementContext
): void {
  const byHeight = new Map<
    string,
    { hash: string; timestamp: number | null; path: PropertyKey[] }
  >();
  const byHash = new Map<string, { number: string; path: PropertyKey[] }>();

  const register = (
    number: string,
    hash: string,
    timestamp: number | null,
    path: PropertyKey[]
  ) => {
    const heightKey = `${feed.chainId}:${number}`;
    const priorHeight = byHeight.get(heightKey);
    if (
      priorHeight &&
      (priorHeight.hash !== hash ||
        (priorHeight.timestamp !== null &&
          timestamp !== null &&
          priorHeight.timestamp !== timestamp))
    ) {
      issue(
        context,
        path,
        "Every block-bearing provenance record at one chain height must use one canonical hash and one consistent known timestamp."
      );
    } else if (!priorHeight) {
      byHeight.set(heightKey, { hash, timestamp, path });
    } else if (priorHeight.timestamp === null && timestamp !== null) {
      priorHeight.timestamp = timestamp;
    }

    const hashKey = `${feed.chainId}:${hash}`;
    const priorHash = byHash.get(hashKey);
    if (priorHash && priorHash.number !== number) {
      issue(
        context,
        path,
        "One canonical block hash must map to exactly one chain height across all provenance records."
      );
    } else if (!priorHash) {
      byHash.set(hashKey, { number, path });
    }
  };

  const visit = (value: unknown, path: PropertyKey[]): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.blockNumber === "string" &&
      typeof record.blockHash === "string"
    ) {
      const timestamp =
        typeof record.timestamp === "number"
          ? record.timestamp
          : typeof record.blockTimestamp === "number"
            ? record.blockTimestamp
            : typeof record.stateTimestamp === "number"
              ? record.stateTimestamp
              : null;
      register(record.blockNumber, record.blockHash, timestamp, path);
    } else if (
      typeof record.number === "string" &&
      typeof record.hash === "string"
    ) {
      register(
        record.number,
        record.hash,
        typeof record.timestamp === "number" ? record.timestamp : null,
        path
      );
    }
    for (const [key, item] of Object.entries(record)) {
      visit(item, [...path, key]);
    }
  };

  visit(feed, []);
  register(
    feed.publication.cursor.lastBlockNumber,
    feed.publication.cursor.lastBlockHash,
    null,
    ["publication", "cursor"]
  );
  for (const [index, proposal] of feed.proposals.entries()) {
    if (proposal.chainCreatedAt.state === "available") {
      register(
        proposal.chainCreatedAt.observedAt.blockNumber,
        proposal.chainCreatedAt.observedAt.blockHash,
        proposal.chainCreatedAt.timestamp,
        ["proposals", index, "chainCreatedAt"]
      );
    }
  }
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
  "executorFrameInitialGas",
  "effectiveGasPriceWei",
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
  const earliestContractStart = feed.contracts.reduce<bigint | null>(
    (earliest, contract) => {
      const candidate = toUint(contract.startBlock);
      if (candidate === null) return earliest;
      return earliest === null || candidate < earliest ? candidate : earliest;
    },
    null
  );
  if (start === null || start !== earliestContractStart) {
    issue(
      context,
      ["publication", "cursor", "startBlockNumber"],
      "The publication cursor must start at the earliest configured contract start block and may never skip it."
    );
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
    const attemptedAt = Date.parse(publication.retry.lastAttemptAt);
    const expectedAttemptedAt =
      failedAt === null
        ? Number.NaN
        : Date.parse(failedAt) +
          publication.retry.backoffSeconds * 1_000;
    if (
      failedAt === null ||
      !publication.retry.lastFailure.retryable ||
      publication.retry.lastAttemptAt !== publication.publishedAt ||
      attemptedAt !== expectedAttemptedAt
    ) {
      issue(
        context,
        ["publication", "retry"],
        "A preceding publication failure must be retryable before a successful retry occurs at publishedAt after the exact bounded backoff."
      );
    }
  } else if (publication.retry.lastAttemptAt !== publication.publishedAt) {
    issue(
      context,
      ["publication", "retry", "lastAttemptAt"],
      "A successful first publication attempt must retain publishedAt as its exact attempt time."
    );
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
    let previousConfiguration: z.infer<typeof HistoricalConfigurationSchema> | null = null;
    const configurationIds = new Set<string>();
    for (const [configurationIndex, configuration] of contract.configurationHistory.entries()) {
      const configurationPath = [...path, "configurationHistory", configurationIndex] as const;
      const effectiveBlock = toUint(configuration.effectiveAt.blockNumber);
      if (configuration.contractGeneration !== contract.generation) {
        issue(context, [...configurationPath, "contractGeneration"], "Historical configuration must bind its Voting generation.");
      }
      if (
        configuration.voteStartOffsetSeconds +
          configuration.votingPeriodSeconds !==
        contract.epochLengthSeconds
      ) {
        issue(
          context,
          [...configurationPath, "votingPeriodSeconds"],
          "The raw vote-start offset plus voting window must equal the fixed epoch length."
        );
      }
      validateConfigurationSemantics(
        configuration,
        context,
        configurationPath
      );
      if (
        previousConfiguration !== null &&
        ((previousConfiguration.executorState === "configured" &&
          configuration.executorState === "uninitialized_zero_address") ||
          (previousConfiguration.proposalBlacklistState === "configured" &&
            configuration.proposalBlacklistState ===
              "uninitialized_zero_address"))
      ) {
        issue(
          context,
          configurationPath,
          "Executor and proposal-blacklist histories may begin at constructor zero but their nonzero-only setters cannot transition back to zero."
        );
      }
      if (
        configuration.configurationId !== `config-${configurationIndex + 1}` ||
        configurationIds.has(configuration.configurationId)
      ) {
        issue(context, [...configurationPath, "configurationId"], "Historical configuration IDs must be unique, ordered, and contiguous from config-1.");
      }
      configurationIds.add(configuration.configurationId);
      if (
        effectiveBlock === null ||
        start === null ||
        deployment === null ||
        effectiveBlock < start ||
        effectiveBlock < deployment ||
        effectiveBlock > toUint(feed.canonicalBlock.number)!
      ) {
        issue(context, [...configurationPath, "effectiveAt"], "Historical configuration evidence must be bounded by deployment, producer start, and canonical block positions.");
      }
      if (
        previousConfiguration !== null &&
        comparePositions(previousConfiguration.effectiveAt, configuration.effectiveAt) >= 0
      ) {
        issue(context, [...configurationPath, "effectiveAt"], "Historical configuration evidence must be strictly ordered by exact block, transaction, and log position.");
      }
      if (
        configuration.effectiveAt.blockNumber === feed.canonicalBlock.number &&
        configuration.effectiveAt.blockHash !== feed.canonicalBlock.hash
      ) {
        issue(context, [...configurationPath, "effectiveAt", "blockHash"], "Configuration evidence at the canonical height must use its canonical block hash.");
      }
      validatePinnedVotingSource(configuration.source, context, [...configurationPath, "source"]);
      previousConfiguration = configuration;
    }
    if (
      start !== null &&
      toUint(contract.configurationHistory[0]!.effectiveAt.blockNumber) !== start
    ) {
      issue(context, [...path, "configurationHistory", 0, "effectiveAt"], "The first historical configuration must begin at the contract producer start block.");
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
  const blockGlobalLogIndices = new Set<string>();
  const transactionGroups = new Map<
    string,
    Pick<FeedEvent["log"], "blockNumber" | "blockHash" | "timestamp" | "transactionHash">
  >();
  const transactionHashGroups = new Map<
    string,
    { blockNumber: string; blockHash: string; transactionIndex: number }
  >();
  const blockGroups = new Map<
    string,
    Pick<FeedEvent["log"], "blockHash" | "timestamp">
  >();
  const blockHashGroups = new Map<
    string,
    Pick<FeedEvent["log"], "blockNumber" | "timestamp">
  >();
  const orderedLogsByBlock = new Map<
    string,
    Array<{
      transactionIndex: number;
      logIndex: number;
      path: PropertyKey[];
    }>
  >();
  const pinnedVoterInvocationIdentities = new Map<string, string>();

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
    let previousKnownTimestamp: number | null = null;
    for (const [eventIndex, event] of proposal.events.entries()) {
      const eventPath = [...path, "events", eventIndex] as PropertyKey[];
      validateEvent(feed, proposal, contract, event, context, eventPath);
      if (
        event.type === "vote" &&
        event.data.classification.method === "pinned_voter_call_trace"
      ) {
        const invocationId =
          event.data.classification.trace.invocationId;
        const priorInvocation =
          pinnedVoterInvocationIdentities.get(invocationId);
        if (
          priorInvocation &&
          priorInvocation !== proposalKey
        ) {
          issue(
            context,
            [...eventPath, "data", "classification", "trace", "invocationId"],
            "A feed-wide pinned Voter invocation identity must bind exactly one proposal; it cannot be reused across proposal IDs."
          );
        } else if (!priorInvocation) {
          pinnedVoterInvocationIdentities.set(invocationId, proposalKey);
        }
      }
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
      const blockGlobalLogIndex = `${proposal.ref.chainId}:${event.log.blockHash}:${event.log.logIndex}`;
      if (blockGlobalLogIndices.has(blockGlobalLogIndex)) {
        issue(
          context,
          [...eventPath, "log", "logIndex"],
          "Ethereum logIndex must be block-global across transactions, proposals, and Voting generations."
        );
      }
      blockGlobalLogIndices.add(blockGlobalLogIndex);
      const orderedLogs = orderedLogsByBlock.get(event.log.blockHash) ?? [];
      orderedLogs.push({
        transactionIndex: event.log.transactionIndex,
        logIndex: event.log.logIndex,
        path: eventPath,
      });
      orderedLogsByBlock.set(event.log.blockHash, orderedLogs);
      if (previousPosition && comparePositions(previousPosition, event.log) >= 0) {
        issue(context, eventPath, "Proposal events must be strictly ordered by block, transaction, and log position.");
      }
      previousPosition = event.log;
      if (
        event.log.timestamp !== null &&
        previousKnownTimestamp !== null &&
        event.log.timestamp < previousKnownTimestamp
      ) {
        issue(context, [...eventPath, "log", "timestamp"], "Producer-owned event timestamps must be monotonic with canonical lifecycle order.");
      }
      if (event.log.timestamp !== null) previousKnownTimestamp = event.log.timestamp;

      const blockGroup = blockGroups.get(event.log.blockNumber);
      if (
        blockGroup &&
        (blockGroup.blockHash !== event.log.blockHash ||
          (blockGroup.timestamp !== null &&
            event.log.timestamp !== null &&
            blockGroup.timestamp !== event.log.timestamp))
      ) {
        issue(
          context,
          [...eventPath, "log"],
          "Events at one block height must share its canonical hash and producer-owned timestamp."
        );
      } else if (!blockGroup) {
        blockGroups.set(event.log.blockNumber, {
          blockHash: event.log.blockHash,
          timestamp: event.log.timestamp,
        });
      } else if (blockGroup.timestamp === null && event.log.timestamp !== null) {
        blockGroup.timestamp = event.log.timestamp;
      }
      const blockHashGroup = blockHashGroups.get(event.log.blockHash);
      if (
        blockHashGroup &&
        (blockHashGroup.blockNumber !== event.log.blockNumber ||
          (blockHashGroup.timestamp !== null &&
            event.log.timestamp !== null &&
            blockHashGroup.timestamp !== event.log.timestamp))
      ) {
        issue(
          context,
          [...eventPath, "log", "blockHash"],
          "One canonical block hash must map to exactly one block number and producer-owned timestamp."
        );
      } else if (!blockHashGroup) {
        blockHashGroups.set(event.log.blockHash, {
          blockNumber: event.log.blockNumber,
          timestamp: event.log.timestamp,
        });
      } else if (
        blockHashGroup.timestamp === null &&
        event.log.timestamp !== null
      ) {
        blockHashGroup.timestamp = event.log.timestamp;
      }

      const transactionKey = `${event.log.blockHash}:${event.log.transactionIndex}`;
      const group = transactionGroups.get(transactionKey);
      if (group) {
        if (
          group.blockNumber !== event.log.blockNumber ||
          group.blockHash !== event.log.blockHash ||
          (group.timestamp !== null &&
            event.log.timestamp !== null &&
            group.timestamp !== event.log.timestamp) ||
          group.transactionHash !== event.log.transactionHash
        ) {
          issue(context, [...eventPath, "log"], "Events in one transaction group must share block, timestamp, and nullable transaction provenance.");
        }
      } else {
        transactionGroups.set(transactionKey, {
          blockNumber: event.log.blockNumber,
          blockHash: event.log.blockHash,
          timestamp: event.log.timestamp,
          transactionHash: event.log.transactionHash,
        });
      }
      if (
        group &&
        group.timestamp === null &&
        event.log.timestamp !== null
      ) {
        group.timestamp = event.log.timestamp;
      }
      if (event.log.transactionHash !== null) {
        const reverse = transactionHashGroups.get(event.log.transactionHash);
        if (
          reverse &&
          (reverse.blockNumber !== event.log.blockNumber ||
            reverse.blockHash !== event.log.blockHash ||
            reverse.transactionIndex !== event.log.transactionIndex)
        ) {
          issue(context, [...eventPath, "log", "transactionHash"], "One transaction hash must map back to exactly one canonical block and transaction position.");
        } else if (!reverse) {
          transactionHashGroups.set(event.log.transactionHash, {
            blockNumber: event.log.blockNumber,
            blockHash: event.log.blockHash,
            transactionIndex: event.log.transactionIndex,
          });
        }
      }
    }
  }

  for (const logs of orderedLogsByBlock.values()) {
    logs.sort(
      (left, right) =>
        left.transactionIndex - right.transactionIndex ||
        left.logIndex - right.logIndex
    );
    for (let index = 1; index < logs.length; index += 1) {
      if (logs[index]!.logIndex <= logs[index - 1]!.logIndex) {
        issue(
          context,
          [...logs[index]!.path, "log", "logIndex"],
          "Block-global logIndex must strictly increase with nondecreasing transactionIndex across all proposals and Voting generations."
        );
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
  const totalsAreCoherent =
    total !== null && yea !== null && nay !== null && total === yea + nay;
  if (!totalsAreCoherent) {
    issue(context, [...path, "totalWeight"], "Proposal vote totals must equal Yea plus Nay weights.");
  }
  const votingTimelineIsCoherent = !(
    (proposal.chainCreatedAt.state === "available" &&
      proposal.chainCreatedAt.timestamp > proposal.voteStartsAt) ||
    proposal.voteStartsAt > proposal.voteEndsAt
  );
  if (!votingTimelineIsCoherent) {
    issue(context, [...path, "voteStartsAt"], "Proposal voting timestamps must be ordered from known chain creation through a possibly disabled zero-length vote window.");
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
  validateContent(feed, proposal, context, [...path, "content"]);
  validateDiscussion(proposal, context, [...path, "discussion"]);
  validateScript(proposal, context, [...path, "script"]);
  validateVoteAccounting(proposal, context, [...path, "voteAccounting"]);
  validatePinnedVoterInvocations(proposal, contract, context, path);

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
  validateStatus(
    feed,
    proposal,
    contract,
    totalsAreCoherent && votingTimelineIsCoherent,
    context,
    path
  );
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
  const propose = proposal.events.find((event) => event.type === "propose");
  const effective =
    contract && propose
      ? getEffectiveConfiguration(contract, propose.log)
      : null;
  if (!effective || !configurationValuesMatch(mutable, effective)) {
    issue(context, [...path, "mutableConfiguration"], "Proposal rules must equal the effective historical configuration at the Propose event.");
  }
  if (
    effective &&
    (comparePositions(mutable.observedAt, effective.effectiveAt) !== 0 ||
      mutable.observedAt.blockHash !== effective.effectiveAt.blockHash)
  ) {
    issue(context, [...path, "mutableConfiguration", "observedAt"], "Proposal configuration block hash and position must match its effective lifecycle provenance.");
  }

  if (contract) {
    const votingEpoch = toUint(proposal.votingEpoch);
    const snapshotConfiguration = getSnapshotConfiguration(contract);
    if (
      !snapshotConfiguration ||
      proposal.statusConfiguration.configurationId !==
        snapshotConfiguration.configurationId ||
      comparePositions(
        proposal.statusConfiguration.effectiveAt,
        snapshotConfiguration.effectiveAt
      ) !== 0 ||
      proposal.statusConfiguration.effectiveAt.blockHash !==
        snapshotConfiguration.effectiveAt.blockHash
    ) {
      issue(
        context,
        [...path, "statusConfiguration"],
        "Raw proposal timing and status must bind the configuration effective at the end of the canonical snapshot block."
      );
    }
    if (votingEpoch !== null && snapshotConfiguration) {
      const epochLength = BigInt(contract.epochLengthSeconds);
      const genesis = BigInt(contract.genesisTimestamp);
      const voteStart =
        genesis +
        votingEpoch * epochLength +
        BigInt(snapshotConfiguration.voteStartOffsetSeconds);
      const voteEnd =
        voteStart + BigInt(snapshotConfiguration.votingPeriodSeconds);
      const proposalEpoch =
        proposal.chainCreatedAt.state !== "available" ||
        proposal.chainCreatedAt.timestamp < contract.genesisTimestamp
          ? null
          : BigInt(
              Math.floor(
                (proposal.chainCreatedAt.timestamp - contract.genesisTimestamp) /
                  contract.epochLengthSeconds
              )
            );
      if (
        voteStart !== BigInt(proposal.voteStartsAt) ||
        voteEnd !== BigInt(proposal.voteEndsAt)
      ) {
        issue(
          context,
          [...path, "statusConfiguration"],
          "Snapshot-effective vote timing must use the generation genesis, fixed epoch, current raw vote-start offset, and current voting period."
        );
      }
      if (
        proposal.chainCreatedAt.state === "available" &&
        (proposalEpoch === null || proposalEpoch + 1n !== votingEpoch)
      ) {
        issue(
          context,
          [...path, "chainCreatedAt"],
          "Known chain creation time must place the proposal in the epoch immediately before its emitted voting epoch."
        );
      }
      const followingEpochStart = genesis + (votingEpoch + 1n) * epochLength;
      const followingEpochEnd = followingEpochStart + epochLength;
      if (proposal.type === "signal") {
        if (proposal.executionStartsAt !== null || proposal.executionEndsAt !== null) {
          issue(context, [...path, "statusConfiguration"], "Signal proposals keep no executable window while their following fixed epoch remains the PASSED interval.");
        }
      } else if (
        proposal.executionStartsAt === null ||
        proposal.executionEndsAt === null ||
        BigInt(proposal.executionStartsAt) !==
          followingEpochStart +
            BigInt(snapshotConfiguration.executionDelaySeconds) ||
        BigInt(proposal.executionEndsAt) !== followingEpochEnd
      ) {
        issue(
          context,
          [...path, "statusConfiguration"],
          "Executable action timing must use the snapshot-effective delay inside the following fixed epoch."
        );
      }
    }
  }
  validatePinnedVotingSource(rules.votingSource, context, [...path, "votingSource"]);
}

function validateContent(
  feed: StructuralFeed,
  proposal: FeedProposal,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const content = proposal.content;
  let expectedCid: string;
  try {
    expectedCid = createDaoRawSha256Cid(content.expectedDigest as Hex);
  } catch {
    issue(context, [...path, "expectedDigest"], "Expected onchain content digest must produce a CIDv1 raw SHA-256 Base32 identity.");
    return;
  }
  if (content.expectedCid !== expectedCid) {
    issue(context, [...path, "expectedCid"], "Expected content CID must be the CIDv1 raw SHA-256 Base32 form of the onchain content digest.");
  }
  validateRetryRecord(
    content.retry,
    content.state,
    content.error,
    feed.generatedAt,
    context,
    [...path, "retry"],
    "content"
  );

  if (content.state === "unavailable") {
    if (
      content.computedDigest !== null ||
      content.computedCid !== null ||
      content.digestComparison !== "unavailable" ||
      content.assetRecords.length !== 0 ||
      content.attachmentRecords.length !== 0
    ) {
      issue(context, path, "Unavailable content cannot guess computed identity, comparison, or asset records.");
    }
    return;
  }

  let rawBytes: Uint8Array;
  if (content.state === "invalid") {
    const decoded = decodeCanonicalBase64(content.rawBytesBase64);
    if (decoded === null) {
      issue(
        context,
        [...path, "rawBytesBase64"],
        "Invalid content bytes must use canonical RFC 4648 Base64."
      );
      return;
    }
    rawBytes = decoded;
    if (rawBytes.byteLength !== content.byteLength) {
      issue(
        context,
        [...path, "byteLength"],
        "Invalid content byteLength must equal the exact decoded fetched bytes."
      );
    }
  } else {
    if (!hasExactlyOneFinalLf(content.canonicalJson)) {
      issue(context, [...path, "canonicalJson"], "Available content JSON must end in exactly one final LF.");
    }
    rawBytes = new TextEncoder().encode(content.canonicalJson);
    if (rawBytes.byteLength !== content.byteLength) {
      issue(
        context,
        [...path, "byteLength"],
        "Available content byteLength must equal its exact canonical UTF-8 bytes."
      );
    }
  }
  if (rawBytes.byteLength > 131_072) {
    issue(context, [...path, "byteLength"], "Retained raw proposal content cannot exceed 131,072 bytes.");
  }
  const rawDigest = sha256(rawBytes);
  const rawCid = createDaoRawSha256Cid(rawDigest);
  const expectedComparison =
    rawDigest === content.expectedDigest ? "verified" : "mismatch";
  if (
    content.computedDigest !== rawDigest ||
    content.computedCid !== rawCid ||
    content.digestComparison !== expectedComparison
  ) {
    issue(context, [...path, "digestComparison"], "Content digest comparison must retain the expected onchain identity, computed fetched-byte identity, and truthful comparison.");
  }

  if (content.state === "invalid") {
    const reproducedFailureCode = reproduceInvalidContentFailureCode(
      rawBytes,
      rawDigest,
      content.expectedDigest
    );
    if (reproducedFailureCode === null) {
      issue(
        context,
        [...path, "state"],
        "Canonical accepted proposal-content bytes cannot be relabeled as invalid."
      );
    } else if (content.error.code !== reproducedFailureCode) {
      issue(
        context,
        [...path, "error", "code"],
        `Invalid content must reproduce its exact typed failure code from retained bytes; expected ${reproducedFailureCode}.`
      );
    }
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
  let canonicalBytes: Uint8Array;
  try {
    canonicalBytes = canonicalizeDaoProposalContent(value);
  } catch {
    issue(
      context,
      [...path, "value"],
      "Available proposal content must be exact round-tripping Unicode before canonical UTF-8 encoding."
    );
    return;
  }
  const canonical = new TextDecoder().decode(canonicalBytes);
  if (canonical !== content.canonicalJson) {
    issue(context, [...path, "canonicalJson"], "Available content must retain the fixed-order canonical JSON without reserialization guesses.");
  }
  const canonicalDigest = sha256(canonicalBytes);
  const identity = {
    digest: canonicalDigest,
    cid: createDaoRawSha256Cid(canonicalDigest),
  };
  if (
    content.digestComparison !== "verified" ||
    identity.digest !== content.expectedDigest ||
    identity.digest !== content.computedDigest ||
    identity.cid !== content.expectedCid ||
    identity.cid !== content.computedCid
  ) {
    issue(context, path, "Available content digest and CID must bind its exact canonical bytes.");
  }
  let parsed: ReturnType<typeof parseDaoProposalContent>;
  try {
    parsed = parseDaoProposalContent(value);
  } catch {
    issue(
      context,
      [...path, "value"],
      "Available proposal content must remain within the bounded nonthrowing Markdown and manifest parser domain."
    );
    return;
  }
  if (parsed.errors.length > 0) {
    issue(context, [...path, "value"], `Available proposal content failed the accepted parser: ${parsed.errors[0]?.code ?? "UNKNOWN"}.`);
  }
  if (value.proposalType !== proposal.type) {
    issue(context, [...path, "value", "proposalType"], "Available content proposal type must match the event script type.");
  }
  if (!sameAddress(value.createdBy, proposal.proposer)) {
    issue(context, [...path, "value", "createdBy"], "Available content author must match the proposal proposer.");
  }
  if (
    proposal.chainCreatedAt.state === "available" &&
    Math.floor(Date.parse(value.createdAt) / 1_000) >
      proposal.chainCreatedAt.timestamp
  ) {
    issue(context, [...path, "value", "createdAt"], "Immutable content creation time may differ from but cannot follow the canonical Propose block time.");
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
      record.state,
      record.error,
      feed.generatedAt,
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

function reproduceInvalidContentFailureCode(
  rawBytes: Uint8Array,
  computedDigest: Hex,
  expectedDigest: string
): string | null {
  if (computedDigest !== expectedDigest) return "CONTENT_DIGEST_MISMATCH";

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  } catch {
    return "CONTENT_UTF8_INVALID";
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    return "CONTENT_JSON_INVALID";
  }
  const structural = ProposalContentValueSchema.safeParse(decoded);
  if (!structural.success) return "CONTENT_SCHEMA_INVALID";
  let parsed: ReturnType<typeof parseDaoProposalContent>;
  try {
    parsed = parseDaoProposalContent(
      structural.data as DaoProposalContent
    );
  } catch {
    return "CONTENT_SCHEMA_INVALID";
  }
  if (parsed.errors.length > 0) return "CONTENT_SCHEMA_INVALID";
  if (!hasExactlyOneFinalLf(text)) return "CONTENT_FINAL_LF_INVALID";

  let canonical: string;
  try {
    canonical = new TextDecoder().decode(
      canonicalizeDaoProposalContent(
        structural.data as DaoProposalContent
      )
    );
  } catch {
    return "CONTENT_SCHEMA_INVALID";
  }
  if (canonical !== text) return "CONTENT_CANONICAL_INVALID";
  return null;
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
  if (discussion.state === "verified") {
    try {
      const url = new URL(discussion.url);
      if (
        url.hostname !== "gov.yearn.fi" ||
        url.port !== "" ||
        url.search !== "" ||
        url.hash !== "" ||
        !/^\/t\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[1-9]\d*\/?$/u.test(
          url.pathname
        )
      ) {
        issue(context, [...path, "url"], "Verified discussion provenance must use one canonical gov.yearn.fi /t/<slug>/<id> topic without query, fragment, port, or ambiguous path.");
      }
    } catch {
      // The shared URL validator reports the structural failure.
    }
    const category = DAO_FORUM_PROPOSAL_CATEGORIES.get(discussion.categoryId);
    const expectedAncestry =
      discussion.categoryId === 5 ? [5] : [5, discussion.categoryId];
    const expectedSlugPath =
      discussion.categoryId === 5
        ? ["proposals"]
        : ["proposals", category?.slug ?? ""];
    if (
      !category ||
      discussion.rootCategoryId !== 5 ||
      discussion.category !== category.name ||
      discussion.membership !==
        (discussion.categoryId === 5 ? "root" : "descendant") ||
      !numberArraysEqual(discussion.categoryAncestryIds, expectedAncestry) ||
      !stringArraysEqual(discussion.categorySlugPath, expectedSlugPath)
    ) {
      issue(
        context,
        path,
        "Verified discussion authorization must retain exact Proposals root 5 ancestry and an allowed root or descendant ID/name/slug tuple."
      );
    }
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
  if (
    (proposal.type === "signal") !==
    (script.hash === DAO_EMPTY_SCRIPT_HASH)
  ) {
    issue(
      context,
      [...path, "hash"],
      "The stored script hash determines proposal type even when exact Propose bytes are unavailable: signal iff keccak256(empty)."
    );
  }
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

  const executorImplementation =
    proposal.rules.mutableConfiguration.executorImplementation;
  if (
    proposal.type === "executable" &&
    executorImplementation.state !== "verified_pinned"
  ) {
    if (
      script.structure.state !== "implementation_unverified" ||
      script.structure.errorCode !== "EXECUTOR_IMPLEMENTATION_UNVERIFIED" ||
      script.structure.errorOffset !== null
    ) {
      issue(
        context,
        [...path, "structure"],
        "Executable script framing is unavailable for an unverified or uninitialized Executor and must not guess pinned Executor.vy call frames."
      );
    }
    if (script.bytes === "0x" || script.hash === DAO_EMPTY_SCRIPT_HASH) {
      issue(context, path, "Executable proposals cannot use the empty script identity.");
    }
    return;
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
  const humanActors = new Set<string>();
  let unclassifiedVoteEventCount = 0;
  for (const vote of votes) {
    if (vote.data.actorKind === "human" && vote.actor.address !== null) {
      humanActors.add(vote.actor.address.toLowerCase());
    }
    if (vote.data.actorKind === "unclassified") {
      unclassifiedVoteEventCount += 1;
    }
  }
  const participation = proposal.voteAccounting.humanParticipation;
  if (
    participation.classifiedHumanCount !== humanActors.size ||
    participation.unclassifiedVoteEventCount !== unclassifiedVoteEventCount ||
    (unclassifiedVoteEventCount === 0
      ? participation.state !== "complete"
      : participation.state !== "lower_bound")
  ) {
    issue(
      context,
      [...path, "humanParticipation"],
      "Human participation must be complete only when every raw Vote is classified; otherwise it is an explicit lower bound with the exact unclassified-event count."
    );
  }
  const totals = calculateVoteTotals(votes);
  if (totals.total !== toUint(proposal.totalWeight) || totals.yea !== toUint(proposal.yeaWeight)) {
    issue(context, path, "Vote totals must use the last absolute contribution per human or aggregate actor, never incremental aggregate events.");
  }
}

function validatePinnedVoterInvocations(
  proposal: FeedProposal,
  contract: StructuralFeed["contracts"][number] | undefined,
  context: RefinementContext,
  proposalPath: readonly PropertyKey[]
): void {
  type Vote = Extract<FeedEvent, { type: "vote" }>;
  const groups = new Map<string, Array<{ event: Vote; index: number }>>();
  const completePinnedHumanCallers = new Set<string>();
  for (const [index, candidate] of proposal.events.entries()) {
    if (
      candidate.type !== "vote" ||
      candidate.data.classification.method !== "pinned_voter_call_trace"
    ) {
      continue;
    }
    const invocationId = candidate.data.classification.trace.invocationId;
    const group = groups.get(invocationId) ?? [];
    group.push({ event: candidate, index });
    groups.set(invocationId, group);
  }

  for (const group of groups.values()) {
    const first = group[0]!;
    const classification = first.event.data.classification;
    if (classification.method !== "pinned_voter_call_trace") continue;
    const trace = classification.trace;
    const expectedInvocationId = `${proposal.ref.chainId}:${proposal.ref.votingAddress.toLowerCase()}:${trace.transactionHash.toLowerCase()}:${trace.voterCallTraceAddress.join(".")}`;
    const expectedOrdinals =
      trace.aggregatorResult.state === "returned_positive"
        ? [0, 1, 2]
        : [0];
    const ordinals = group
      .map(({ event }) =>
        event.data.classification.method === "pinned_voter_call_trace"
          ? event.data.classification.trace.votingCallOrdinal
          : -1
      )
      .sort((left, right) => left - right);
    const eventsInLogOrder = [...group].sort((left, right) =>
      comparePositions(left.event.log, right.event.log)
    );
    const emittedOrdinals = eventsInLogOrder.map(({ event }) =>
      event.data.classification.method === "pinned_voter_call_trace"
        ? event.data.classification.trace.votingCallOrdinal
        : -1
    );
    if (
      trace.invocationId !== expectedInvocationId ||
      !numberArraysEqual(ordinals, expectedOrdinals)
    ) {
      issue(
        context,
        [...proposalPath, "events", first.index, "data", "classification", "trace"],
        "Each pinned Voter invocation must use one transaction-and-trace-path identity and retain exactly the surviving ordinal set: human-only {0}, or complete aggregate triplet {0,1,2}."
      );
    }
    if (!numberArraysEqual(emittedOrdinals, expectedOrdinals)) {
      issue(
        context,
        [...proposalPath, "events", first.index, "data", "classification", "trace"],
        "A pinned Voter invocation must emit its exact ordinal sequence in canonical log order: human-only 0, or aggregate triplet 0,1,2."
      );
    }

    const seenTracePaths = new Set<string>();
    let previousPosition: FeedEvent["log"] | null = null;
    for (const { event, index } of eventsInLogOrder) {
      const item = event.data.classification;
      if (item.method !== "pinned_voter_call_trace") continue;
      const itemTrace = item.trace;
      const tracePath = itemTrace.votingCallTraceAddress.join(".");
      const hasVoterPrefix = itemTrace.voterCallTraceAddress.every(
        (value, pathIndex) => itemTrace.votingCallTraceAddress[pathIndex] === value
      );
      if (
        itemTrace.invocationId !== trace.invocationId ||
        itemTrace.transactionHash !== trace.transactionHash ||
        itemTrace.proposalId !== proposal.ref.proposalId ||
        !sameAddress(itemTrace.votingTarget, proposal.ref.votingAddress) ||
        !sameAddress(itemTrace.voterCaller, trace.voterCaller) ||
        !sameAddress(item.voterAddress, classification.voterAddress) ||
        !numberArraysEqual(itemTrace.voterCallTraceAddress, trace.voterCallTraceAddress) ||
        itemTrace.voterSelector !== trace.voterSelector ||
        itemTrace.ybcMembership !== trace.ybcMembership ||
        itemTrace.aggregatePathExecuted !== trace.aggregatePathExecuted ||
        JSON.stringify(itemTrace.aggregatorResult) !==
          JSON.stringify(trace.aggregatorResult) ||
        itemTrace.voterCallDepth !== itemTrace.voterCallTraceAddress.length ||
        itemTrace.votingCallDepth !== itemTrace.votingCallTraceAddress.length ||
        itemTrace.votingCallDepth !== itemTrace.voterCallDepth + 1 ||
        !hasVoterPrefix ||
        seenTracePaths.has(tracePath) ||
        (previousPosition !== null &&
          comparePositions(previousPosition, event.log) >= 0)
      ) {
        issue(
          context,
          [...proposalPath, "events", index, "data", "classification", "trace"],
          "Pinned Voter invocation events must share one unambiguous parent trace, use unique child frame paths, and preserve strict emitted-log order."
        );
      }
      seenTracePaths.add(tracePath);
      previousPosition = event.log;
    }

    const byOrdinal = new Map<number, { event: Vote; index: number }>();
    for (const item of group) {
      const itemClassification = item.event.data.classification;
      if (itemClassification.method === "pinned_voter_call_trace") {
        byOrdinal.set(itemClassification.trace.votingCallOrdinal, item);
      }
    }
    const human = byOrdinal.get(0);
    const effectiveConfiguration = contract
      ? getEffectiveConfiguration(contract, first.event.log)
      : null;
    const humanWeight = human ? toUint(human.event.data.weight) : null;
    if (
      !human ||
      human.event.data.actorKind !== "human" ||
      human.event.actor.address === null ||
      sameAddress(human.event.actor.address, ZERO_ADDRESS) ||
      humanWeight === null ||
      humanWeight === 0n ||
      !sameAddress(trace.voterCaller, human.event.actor.address) ||
      (trace.voterSelector === "0x69586e2e" &&
        human.event.data.direction !== "yea") ||
      (trace.voterSelector === "0xff855dde" &&
        human.event.data.direction !== "nay")
    ) {
      issue(
        context,
        [...proposalPath, "events", first.index, "data", "classification", "trace"],
        "A complete pinned Voter trace requires a nonzero positive-weight binary human Vote at ordinal zero, bound to the outer Voter caller and selector."
      );
    }
    if (
      human?.event.actor.address !== null &&
      human?.event.actor.address !== undefined &&
      sameAddress(trace.voterCaller, human.event.actor.address)
    ) {
      const callerKey = trace.voterCaller.toLowerCase();
      if (completePinnedHumanCallers.has(callerKey)) {
        issue(
          context,
          [...proposalPath, "events", first.index, "data", "classification", "trace", "voterCaller"],
          "A complete pinned Voter caller has exactly one public submission per proposal; ordinal-zero caller identity must be unique for that proposal."
        );
      }
      completePinnedHumanCallers.add(callerKey);
    }

    const outcome = trace.aggregatorResult.state;
    if (
      (outcome === "skipped_non_member" &&
        (trace.ybcMembership || trace.aggregatePathExecuted)) ||
      (outcome !== "skipped_non_member" &&
        (!trace.ybcMembership || !trace.aggregatePathExecuted)) ||
      (outcome === "returned_zero" &&
        effectiveConfiguration?.ybcWeightAggregatorState !== "configured") ||
      (outcome === "returned_positive" &&
        effectiveConfiguration?.ybcWeightAggregatorState !== "configured")
    ) {
      issue(
        context,
        [...proposalPath, "events", first.index, "data", "classification", "trace", "aggregatorResult"],
        "Pinned Voter membership and aggregator evidence must distinguish a skipped nonmember path from a member zero result or positive aggregate path; a member path cannot survive a zero aggregator."
      );
    }

    if (outcome === "returned_positive") {
      const delegated = byOrdinal.get(1);
      const ybc = byOrdinal.get(2);
      if (
        !delegated ||
        !ybc ||
        delegated.event.data.actorKind !== "delegated_staking_aggregate" ||
        ybc.event.data.actorKind !== "ybc_aggregate" ||
        delegated.event.actor.address === null ||
        ybc.event.actor.address === null ||
        !effectiveConfiguration ||
        !sameAddress(
          delegated.event.actor.address,
          effectiveConfiguration.delegatedStakingAddress
        ) ||
        !sameAddress(ybc.event.actor.address, effectiveConfiguration.ybcAddress) ||
        delegated.event.data.yeaBps !== ybc.event.data.yeaBps
      ) {
        issue(
          context,
          [...proposalPath, "events", first.index, "data", "classification", "trace"],
          "A positive pinned-Voter aggregate result requires the exact same-invocation ordered human, delegated-staking, and YBC Vote triplet with configured accounts and matching basis points."
        );
      }
    }
  }
}

function calculateVoteTotals(events: readonly FeedEvent[]): {
  total: bigint;
  yea: bigint;
  nay: bigint;
} {
  const latestByActor = new Map<
    string,
    Extract<FeedEvent, { type: "vote" }>
  >();
  for (const event of events) {
    if (event.type === "vote" && event.actor.address !== null) {
      latestByActor.set(event.actor.address.toLowerCase(), event);
    }
  }
  let total = 0n;
  let yea = 0n;
  for (const vote of latestByActor.values()) {
    const weight = toUint(vote.data.weight) ?? 0n;
    total += weight;
    yea += (weight * BigInt(vote.data.yeaBps)) / BigInt(DAO_BPS);
  }
  return { total, yea, nay: total - yea };
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
  if (event.data.contentDigest !== proposal.content.expectedDigest) {
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
  if (event.log.timestamp === null) {
    if (proposal.chainCreatedAt.state !== "unavailable") {
      issue(
        context,
        [...path, "chainCreatedAt"],
        "An unavailable Propose block timestamp requires explicit unavailable chain creation time and must not guess a number."
      );
    }
  } else if (
    proposal.chainCreatedAt.state !== "available" ||
    proposal.chainCreatedAt.timestamp !== event.log.timestamp ||
    comparePositions(proposal.chainCreatedAt.observedAt, event.log) !== 0 ||
    proposal.chainCreatedAt.observedAt.blockHash !== event.log.blockHash
  ) {
    issue(
      context,
      [...path, "chainCreatedAt"],
      "Available chain creation time must equal and bind the producer-owned Propose block timestamp and exact event position."
    );
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
    if (
      toUint(event.data.proposalId) === null ||
      toUint(event.data.votingEpoch) === null
    ) {
      issue(context, [...eventPath, "data", "abi"], "Propose receipt uint256 identity fields must be bounded before re-encoding.");
      return;
    }
    let canonical: ReturnType<typeof encodeDaoProposeLog>;
    try {
      canonical = encodeDaoProposeLog({
        address: proposal.ref.votingAddress as Address,
        contentDigest: event.data.contentDigest as Hex,
        logIndex: event.log.logIndex,
        proposalId: BigInt(event.data.proposalId),
        proposer: event.data.proposer as Address,
        script: event.data.script as Hex,
        votingEpoch: BigInt(event.data.votingEpoch),
      });
    } catch {
      issue(context, [...eventPath, "data", "abi"], "Propose receipt evidence could not be re-encoded from bounded validated inputs.");
      return;
    }
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
  contract: StructuralFeed["contracts"][number] | undefined,
  derivationPrerequisitesValid: boolean,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const eventTypes = new Set(proposal.events.map((event) => event.type));
  validateRunningVoteArithmetic(proposal, context, path);
  const terminalEvents = proposal.events.filter((event) =>
    ["retract", "flag", "veto", "execute"].includes(event.type)
  );
  if (terminalEvents.length > 1) {
    issue(context, [...path, "events"], "A proposal cannot carry contradictory terminal lifecycle events.");
  }
  let immutableVetoBranch: "early_no_votes" | "post_participation" | null = null;
  let hardTerminalSeen = false;
  for (const [index, event] of proposal.events.entries()) {
    if (hardTerminalSeen) {
      issue(
        context,
        [...path, "events", index],
        "No lifecycle event may follow Retract, Flag, Execute, or the retracting early-no-votes Veto branch."
      );
    }
    if (event.type === "vote") {
      const eventConfiguration = contract
        ? getEffectiveConfiguration(contract, event.log)
        : null;
      const epochStart = contract
        ? getProposalEpochBoundary(contract, proposal.votingEpoch, 0n)
        : null;
      const eventVoteStart =
        eventConfiguration && epochStart !== null
          ? epochStart + BigInt(eventConfiguration.voteStartOffsetSeconds)
          : null;
      const eventVoteEnd =
        eventConfiguration && eventVoteStart !== null
          ? eventVoteStart + BigInt(eventConfiguration.votingPeriodSeconds)
          : null;
      if (
        event.log.timestamp === null ||
        eventVoteStart === null ||
        eventVoteEnd === null ||
        BigInt(event.log.timestamp) < eventVoteStart ||
        BigInt(event.log.timestamp) >= eventVoteEnd
      ) {
        issue(
          context,
          [...path, "events", index, "log", "timestamp"],
          "Vote event time must be known and fall inside the event-effective voting window."
        );
      }
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
    if (event.type === "retract" || event.type === "flag") {
      const totalsImmediatelyBefore = calculateVoteTotals(
        proposal.events.slice(0, index)
      );
      if (totalsImmediatelyBefore.total !== 0n) {
        issue(
          context,
          [...path, "events", index],
          "Retract and Flag require the last-write-per-account running total immediately before the event to be zero; zero-weight raw Vote history remains valid."
        );
      }
      hardTerminalSeen = true;
    }
    if (event.type === "execute") {
      const totals = calculateVoteTotals(proposal.events.slice(0, index));
      const passes =
        totals.total > 0n &&
        totals.yea * BigInt(DAO_BPS) >=
          totals.total * BigInt(proposal.thresholdBps);
      const precedingTerminal = proposal.events
        .slice(0, index)
        .some((candidate) =>
          ["retract", "flag", "veto", "execute"].includes(candidate.type)
        );
      const followingEpochStart = contract
        ? getProposalEpochBoundary(contract, proposal.votingEpoch, 1n)
        : null;
      const followingEpochEnd = contract
        ? getProposalEpochBoundary(contract, proposal.votingEpoch, 2n)
        : null;
      const effectiveConfiguration = contract
        ? getEffectiveConfiguration(contract, event.log)
        : null;
      const executionEligibleStart =
        followingEpochStart === null || effectiveConfiguration === null
          ? null
          : followingEpochStart +
            BigInt(effectiveConfiguration.executionDelaySeconds);
      const insideExecutionWindow =
        event.log.timestamp !== null &&
        executionEligibleStart !== null &&
        followingEpochEnd !== null &&
        BigInt(event.log.timestamp) >= executionEligibleStart &&
        BigInt(event.log.timestamp) < followingEpochEnd;
      const compatibleScript =
        proposal.script.bytes !== null &&
        proposal.script.hashVerification.state === "verified" &&
        (proposal.type === "signal"
          ? proposal.script.structure.state === "empty"
          : proposal.rules.mutableConfiguration.executorImplementation.state ===
                "verified_pinned"
            ? proposal.script.structure.state === "valid"
            : proposal.script.structure.state ===
              "implementation_unverified");
      if (!insideExecutionWindow) {
        issue(
          context,
          [...path, "events", index, "log", "timestamp"],
          "Every Voting Execute must prove the effective execution delay and remain inside the following fixed epoch."
        );
      }
      if (
        effectiveConfiguration?.executionGuard === "guarded" &&
        (event.actor.address === null ||
          !sameAddress(
            event.actor.address,
            effectiveConfiguration.operatorAddress
          ))
      ) {
        issue(
          context,
          [...path, "events", index, "actor"],
          "A guarded Execute caller must equal the effective operator at the event position."
        );
      }
      if (!passes || precedingTerminal || !compatibleScript) {
        issue(
          context,
          [...path, "events", index],
          "Every Voting Execute must prove positive-total threshold passage, nonterminal eligibility, its exact epoch/delay window, and compatible retained script integrity."
        );
      }
      hardTerminalSeen = true;
    }
    if (event.type === "veto") {
      const totals = calculateVoteTotals(proposal.events.slice(0, index));
      const expectedBranch =
        totals.total === 0n ? "early_no_votes" : "post_participation";
      immutableVetoBranch = expectedBranch;
      if (
        event.data.branch !== expectedBranch ||
        event.data.voteTotalsAtVeto.totalWeight !== totals.total.toString() ||
        event.data.voteTotalsAtVeto.yeaWeight !== totals.yea.toString() ||
        event.data.voteTotalsAtVeto.nayWeight !== totals.nay.toString()
      ) {
        issue(context, [...path, "events", index, "data", "branch"], "The immutable veto branch and retained totals must derive from last-write-per-actor voting state at the Veto position.");
      }
      if (expectedBranch === "early_no_votes") {
        hardTerminalSeen = true;
      }
      if (event.log.timestamp === null) {
        issue(context, [...path, "events", index, "log", "timestamp"], "Veto requires canonical event time to prove its epoch bound.");
      } else if (contract) {
        const endOfFollowingEpoch = getProposalEpochBoundary(
          contract,
          proposal.votingEpoch,
          2n
        );
        if (
          endOfFollowingEpoch === null ||
          BigInt(event.log.timestamp) >= endOfFollowingEpoch
        ) {
          issue(context, [...path, "events", index, "log", "timestamp"], "Veto cannot occur at or after the end of the epoch following the voting epoch.");
        }
      }
    }
    if (
      event.type === "vote" &&
      immutableVetoBranch === "early_no_votes"
    ) {
      issue(context, [...path, "events", index], "A Vote after an early veto is impossible because that branch retracts the proposal.");
    }
  }
  const postVoteEpochEnd = contract
    ? getProposalEpochBoundary(contract, proposal.votingEpoch, 2n)
    : BigInt(proposal.voteEndsAt + DAO_FEED_EPOCH_LENGTH_SECONDS);
  if (
    postVoteEpochEnd === null ||
    postVoteEpochEnd > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    issue(context, [...path, "votingEpoch"], "Proposal status requires an exactly representable fixed epoch boundary.");
  }
  if (
    derivationPrerequisitesValid &&
    postVoteEpochEnd !== null &&
    postVoteEpochEnd <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    const postVoteEpochEndsAt = Number(postVoteEpochEnd);
    const statusConfiguration = contract
      ? getSnapshotConfiguration(contract)
      : null;
    const expectedProtocolStatus =
      statusConfiguration?.votingPeriodSeconds === 0 && contract
        ? deriveZeroLengthVotingStatus(
            feed,
            proposal,
            contract,
            eventTypes
          )
        : deriveDaoProtocolStatus({
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

function validateRunningVoteArithmetic(
  proposal: FeedProposal,
  context: RefinementContext,
  proposalPath: readonly PropertyKey[]
): void {
  const latestByActor = new Map<string, { weight: bigint; yea: bigint }>();
  let runningTotal = 0n;
  let runningYea = 0n;
  for (const [index, event] of proposal.events.entries()) {
    if (event.type !== "vote" || event.actor.address === null) continue;
    const weight = toUint(event.data.weight);
    const yeaBps = BigInt(event.data.yeaBps);
    if (weight === null) continue;
    if (yeaBps !== 0n && weight > UINT256_MAX / yeaBps) {
      issue(
        context,
        [...proposalPath, "events", index, "data", "weight"],
        "Vote weight multiplied by basis points must fit checked uint256 arithmetic before the canonical Vote log can be emitted."
      );
      continue;
    }
    const nextYea = (weight * yeaBps) / BigInt(DAO_BPS);
    const prior = latestByActor.get(event.actor.address.toLowerCase()) ?? {
      weight: 0n,
      yea: 0n,
    };
    const nextTotal = runningTotal - prior.weight + weight;
    const nextRunningYea = runningYea - prior.yea + nextYea;
    if (nextTotal > UINT256_MAX || nextRunningYea > UINT256_MAX) {
      issue(
        context,
        [...proposalPath, "events", index, "data", "weight"],
        "Last-write-per-account running totals must fit checked uint256 arithmetic at every canonical Vote event."
      );
      continue;
    }
    latestByActor.set(event.actor.address.toLowerCase(), {
      weight,
      yea: nextYea,
    });
    runningTotal = nextTotal;
    runningYea = nextRunningYea;
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

function deriveZeroLengthVotingStatus(
  feed: StructuralFeed,
  proposal: FeedProposal,
  contract: StructuralFeed["contracts"][number],
  eventTypes: ReadonlySet<string>
): FeedProposal["protocolStatus"] {
  if (eventTypes.has("execute")) return "executed";
  if (eventTypes.has("flag")) return "flagged";
  if (eventTypes.has("veto")) return "vetoed";
  if (eventTypes.has("retract")) return "retracted";
  if (feed.canonicalBlock.timestamp < proposal.voteStartsAt) return "proposed";

  const currentEpoch = BigInt(
    Math.floor(
      (feed.canonicalBlock.timestamp - contract.genesisTimestamp) /
        contract.epochLengthSeconds
    )
  );
  const votingEpoch = toUint(proposal.votingEpoch);
  if (votingEpoch === null) return "proposed";
  const total = BigInt(proposal.totalWeight);
  const yea = BigInt(proposal.yeaWeight);
  const passed =
    total > 0n &&
    yea * BigInt(DAO_BPS) >= total * BigInt(proposal.thresholdBps);
  if (currentEpoch === votingEpoch) return "voting";
  if (!passed) return "failed";
  if (currentEpoch === votingEpoch + 1n) return "passed";
  return proposal.type === "signal" ? "executed" : "expired";
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
  const proposalExecutorImplementation =
    proposal.rules.mutableConfiguration.executorImplementation;
  if (
    proposal.type === "executable" &&
    proposalExecutorImplementation.state !== "verified_pinned"
  ) {
    const expectedErrorCode =
      proposalExecutorImplementation.state === "unverified"
        ? "EXECUTOR_IMPLEMENTATION_UNVERIFIED"
        : "EXECUTOR_UNINITIALIZED_ZERO_ADDRESS";
    if (
      analysis.state !== "unavailable" ||
      analysis.calls.length !== 0 ||
      analysis.error?.code !== expectedErrorCode ||
      simulation.state !== "unavailable" ||
      simulation.error?.code !== expectedErrorCode
    ) {
      issue(
        context,
        path,
        "A nonempty executable script under a custom or zero Executor forces analysis, pinned framing, decoded calls, and simulation to unavailable with exact implementation provenance."
      );
    }
  }
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
  const feedGeneratedAt = parseCanonicalIsoSeconds(feed.generatedAt);
  const analysisGeneratedAt =
    analysis.generatedAt === null
      ? null
      : parseCanonicalIsoSeconds(analysis.generatedAt);
  const proposeTimestamp = propose.log.timestamp;
  if (
    analysisGeneratedAt !== null &&
    proposeTimestamp !== null &&
    analysisGeneratedAt < proposeTimestamp
  ) {
    issue(
      context,
      [...path, "generatedAt"],
      "Analysis generation cannot precede the known canonical Propose block time."
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
    if (call.error?.observedAt !== null && call.error?.observedAt !== undefined) {
      validateAnalysisObservationTime(
        call.error.observedAt,
        proposeTimestamp,
        analysisGeneratedAt,
        feedGeneratedAt,
        context,
        [...path, "calls", index, "error", "observedAt"]
      );
    }
  }
  if (analysis.error?.observedAt !== null && analysis.error?.observedAt !== undefined) {
    validateAnalysisObservationTime(
      analysis.error.observedAt,
      proposeTimestamp,
      analysisGeneratedAt,
      feedGeneratedAt,
      context,
      [...path, "error", "observedAt"]
    );
  }

  if (proposal.script.bytes !== null) {
    const executorVerified =
      proposal.rules.mutableConfiguration.executorImplementation.state ===
      "verified_pinned";
    const structure =
      proposal.type === "signal" || executorVerified
        ? checkDaoExecutorScript(proposal.script.bytes, proposal.type)
        : null;
    if (structure?.state === "valid") {
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
    } else if (
      structure?.state !== "empty" &&
      (analysis.calls.length !== 0 || simulation.state !== "unavailable")
    ) {
      issue(context, path, "Structurally malformed direct-contract scripts require empty decoding and unavailable simulation without rejecting feed history.");
    }
  } else if (analysis.calls.length !== 0 || simulation.state !== "unavailable") {
    issue(context, path, "Missing exact event script bytes require empty decoding and unavailable simulation.");
  }

  if (simulation.state === "unavailable") {
    const simulatedAt =
      simulation.simulatedAt === null
        ? null
        : parseCanonicalIsoSeconds(simulation.simulatedAt);
    const failureObservedAt =
      simulation.error.observedAt === null
        ? null
        : parseCanonicalIsoSeconds(simulation.error.observedAt);
    if (
      (simulation.simulatedAt === null) !==
        (simulation.error.observedAt === null) ||
      (simulation.simulatedAt !== null &&
        simulation.error.observedAt !== simulation.simulatedAt)
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "error", "observedAt"],
        "An unavailable simulation must either retain one exact shared simulation/failure observation time or use null for both when the time is unproven."
      );
    }
    if (simulation.simulatedAt !== null) {
      validateAnalysisObservationTime(
        simulation.simulatedAt,
        proposeTimestamp,
        analysisGeneratedAt,
        feedGeneratedAt,
        context,
        [...path, "proposalSimulation", "simulatedAt"]
      );
    }
    if (
      simulatedAt !== null &&
      failureObservedAt !== null &&
      simulatedAt !== failureObservedAt
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "error", "observedAt"],
        "Unavailable simulation failure time must equal the retained simulation attempt time."
      );
    }
  }

  if (
    analysis.error?.observedAt !== null &&
    analysis.error?.observedAt !== undefined &&
    simulation.error?.observedAt !== null &&
    simulation.error?.observedAt !== undefined
  ) {
    const analysisFailureAt = parseCanonicalIsoSeconds(
      analysis.error.observedAt
    );
    const simulationFailureAt = parseCanonicalIsoSeconds(
      simulation.error.observedAt
    );
    if (
      analysisFailureAt !== null &&
      simulationFailureAt !== null &&
      analysisFailureAt < simulationFailureAt
    ) {
      issue(
        context,
        [...path, "error", "observedAt"],
        "An analysis failure synthesized from simulation evidence cannot precede the simulation failure it reports."
      );
    }
  }

  if (simulation.state === "succeeded" || simulation.state === "failed") {
    if (!contract) return;
    if (
      proposal.type !== "executable" ||
      proposal.script.bytes === null ||
      proposal.script.structure.state !== "valid" ||
      proposal.script.hashVerification.state !== "verified"
    ) {
      issue(
        context,
        [...path, "proposalSimulation"],
        "A completed conditional simulation requires exact retained, hash-verified executable bytes framed by the verified pinned Executor; signal, malformed, missing, mismatched, and custom-Executor cases remain unavailable."
      );
    }
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
      issue(context, [...path, "proposalSimulation", "caller"], "The injected Executor frame caller must be the proposal Voting contract.");
    }
    const proposalExecutor =
      proposal.rules.mutableConfiguration.executorImplementation;
    const simulationExecutor =
      simulation.frameContext.executorImplementation;
    if (!sameAddress(simulation.executorAddress, proposal.rules.mutableConfiguration.executorAddress)) {
      issue(context, [...path, "proposalSimulation", "executorAddress"], "Proposal simulation must call the Executor effective for this proposal's historical configuration.");
    }
    if (
      proposalExecutor.state !== "verified_pinned" ||
      simulationExecutor.state !== "verified_pinned"
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "frameContext", "executorImplementation"],
        "A completed proposal-time simulation requires verified pinned Executor.vy implementation evidence; custom, missing, or zero Executor evidence must produce a fully unavailable simulation."
      );
    }
    if (simulationExecutor.state === "verified_pinned") {
      validatePinnedExecutorSource(
        simulationExecutor.source,
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "executorImplementation",
          "source",
        ]
      );
    }
    if (
      proposal.rules.mutableConfiguration.executorState !== "configured" ||
      proposal.creation.state !== "indexed" ||
      !sameAddress(
        simulation.transactionOrigin,
        proposal.creation.receipt.transactionSender
      ) ||
      simulation.originPolicy.proposalTransactionHash !==
        proposal.creation.transactionHash ||
      !sameAddress(
        simulation.frameContext.executorCaller,
        proposal.ref.votingAddress
      ) ||
      !sameAddress(
        simulation.frameContext.executorCodeAddress,
        simulation.executorAddress
      ) ||
      !sameAddress(
        simulation.frameContext.targetCaller,
        simulation.executorAddress
      )
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "originPolicy"],
        "Completed proposal-time simulation must disclose a frozen Propose-sender origin scenario and an engine-injected Executor frame with Voting as caller, real code, and Executor as target caller; it is conditional, not future execution-equivalence."
      );
    }
    const gasContext = simulation.frameContext.gasContext;
    const headerGasLimit = toUint(gasContext.blockHeader.gasLimit);
    const executorFrameInitialGas = toUint(
      gasContext.executorFrameInitialGas
    );
    const blockBaseFeePerGasWei = toUint(
      gasContext.blockHeader.baseFeePerGasWei
    );
    const effectiveGasPriceWei = toUint(
      gasContext.effectiveGasPriceWei
    );
    const u64Max = (1n << 64n) - 1n;
    const expectedExecutorFrameInitialGas =
      headerGasLimit === null
        ? null
        : headerGasLimit < 30_000_000n
          ? headerGasLimit
          : 30_000_000n;
    const creation =
      proposal.creation.state === "indexed" ? proposal.creation : null;
    if (
      headerGasLimit === null ||
      headerGasLimit === 0n ||
      headerGasLimit > u64Max ||
      executorFrameInitialGas === null ||
      executorFrameInitialGas === 0n ||
      executorFrameInitialGas > u64Max ||
      executorFrameInitialGas !== expectedExecutorFrameInitialGas ||
      blockBaseFeePerGasWei === null ||
      blockBaseFeePerGasWei === 0n ||
      blockBaseFeePerGasWei > u64Max ||
      effectiveGasPriceWei === null ||
      effectiveGasPriceWei < blockBaseFeePerGasWei ||
      gasContext.blockHeader.blockNumber !== propose.log.blockNumber ||
      gasContext.blockHeader.blockHash !== propose.log.blockHash ||
      gasContext.proposeReceipt.transactionHash !==
        creation?.transactionHash ||
      !sameAddress(
        gasContext.proposeReceipt.transactionSender,
        creation?.receipt.transactionSender ?? ZERO_ADDRESS
      ) ||
      gasContext.proposeReceipt.blockNumber !== propose.log.blockNumber ||
      gasContext.proposeReceipt.blockHash !== propose.log.blockHash ||
      gasContext.proposeReceipt.effectiveGasPriceWei !==
        creation?.receipt.effectiveGasPriceWei ||
      gasContext.effectiveGasPriceWei !==
        gasContext.proposeReceipt.effectiveGasPriceWei
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "frameContext", "gasContext"],
        "Completed simulation gas provenance must use positive u64 block gas and base fee, derive frame gas as min(authenticated Propose block gasLimit, 30,000,000), and derive GASPRICE from the authenticated Propose receipt effective gas price."
      );
    }

    if (
      simulationExecutor.state === "verified_pinned" &&
      (proposalExecutor.state !== "verified_pinned" ||
        !sameAddress(simulationExecutor.address, simulation.executorAddress) ||
        !sameAddress(
          simulationExecutor.bytecode.address,
          simulation.executorAddress
        ) ||
        simulationExecutor.bytecode.blockNumber !== propose.log.blockNumber ||
        simulationExecutor.bytecode.blockHash !== propose.log.blockHash ||
        simulationExecutor.source.revision !== proposalExecutor.source.revision ||
        simulationExecutor.source.sourcePath !==
          proposalExecutor.source.sourcePath ||
        simulationExecutor.sourceSha256 !== proposalExecutor.sourceSha256 ||
        simulationExecutor.compiledRuntimeByteLength !==
          proposalExecutor.compiledRuntimeByteLength ||
        simulationExecutor.compiledRuntimeBytecodeHash !==
          proposalExecutor.compiledRuntimeBytecodeHash ||
        simulationExecutor.compiledRuntimeArtifactSha256 !==
          proposalExecutor.compiledRuntimeArtifactSha256)
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "frameContext", "executorImplementation"],
        "Simulation Executor evidence must reproduce the proposal-effective pinned build and bind archive code at the exact Propose block, address, hash, length, and runtime identity."
      );
    }

    const expectedContextInputsSha256 =
      simulationExecutor.state === "verified_pinned"
        ? deriveDaoSimulationContextInputsSha256({
            blockNumber: simulation.blockNumber,
            blockHash: simulation.blockHash as Hex,
            blockGasLimit: gasContext.blockHeader.gasLimit,
            blockBaseFeePerGasWei:
              gasContext.blockHeader.baseFeePerGasWei,
            proposeTransactionHash:
              gasContext.proposeReceipt.transactionHash as Hex,
            proposeTransactionSender:
              gasContext.proposeReceipt.transactionSender as Address,
            proposeReceiptBlockNumber:
              gasContext.proposeReceipt.blockNumber,
            proposeReceiptBlockHash:
              gasContext.proposeReceipt.blockHash as Hex,
            proposeReceiptEffectiveGasPriceWei:
              gasContext.proposeReceipt.effectiveGasPriceWei,
            transactionOrigin: simulation.transactionOrigin as Address,
            votingCaller: simulation.caller as Address,
            executorAddress: simulation.executorAddress as Address,
            executorCaller: simulation.frameContext.executorCaller as Address,
            executorCodeAddress: simulation.frameContext
              .executorCodeAddress as Address,
            targetCaller: simulation.frameContext.targetCaller as Address,
            harnessRevision: simulation.frameContext.harness.revision,
            harnessArtifactSha256: simulation.frameContext.harness
              .artifactSha256 as Hex,
            scriptHash: simulation.scriptHash as Hex,
            executorSourceRevision: simulationExecutor.source.revision,
            executorSourcePath: simulationExecutor.source.sourcePath,
            executorSourceSha256: simulationExecutor.sourceSha256,
            executorCompilerIntegritySha256:
              simulationExecutor.compilerIntegritySha256,
            executorRuntimeByteLength:
              simulationExecutor.compiledRuntimeByteLength,
            executorRuntimeBytecodeHash:
              simulationExecutor.compiledRuntimeBytecodeHash,
            executorRuntimeArtifactSha256:
              simulationExecutor.compiledRuntimeArtifactSha256,
            executorEvidenceAddress:
              simulationExecutor.bytecode.address as Address,
            executorEvidenceBlockNumber:
              simulationExecutor.bytecode.blockNumber,
            executorEvidenceBlockHash:
              simulationExecutor.bytecode.blockHash as Hex,
            executorEvidenceCodeByteLength:
              simulationExecutor.bytecode.codeByteLength,
            executorEvidenceDeployedBytecodeHash:
              simulationExecutor.bytecode.deployedBytecodeHash,
            executorFrameInitialGas:
              gasContext.executorFrameInitialGas,
            effectiveGasPriceWei: gasContext.effectiveGasPriceWei,
          })
        : null;
    if (
      expectedContextInputsSha256 === null ||
      gasContext.contextInputsSha256 !== expectedContextInputsSha256
    ) {
      issue(
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "contextInputsSha256",
        ],
        "Simulation context input commitment must bind the exact block, origin, caller chain, injector artifact, gas, envelope, access list, and Cancun warm-set policy."
      );
    }
    if (
      proposal.script.hashVerification.state !== "verified" ||
      simulation.scriptHash !== proposal.script.hashVerification.computedHash
    ) {
      issue(context, [...path, "proposalSimulation", "scriptHash"], "Proposal simulation must bind the exact retained event script hash.");
    }
    const simulatedAt = parseCanonicalIsoSeconds(simulation.simulatedAt);
    if (
      simulatedAt === null ||
      simulatedAt < simulation.stateTimestamp ||
      (analysisGeneratedAt !== null && simulatedAt > analysisGeneratedAt) ||
      (analysisGeneratedAt === null && simulatedAt !== null) ||
      (feedGeneratedAt !== null && simulatedAt > feedGeneratedAt)
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "simulatedAt"],
        "Simulation time must follow its proposal block and cannot follow feed generation."
      );
    }
    if (
      simulation.state === "failed" &&
      simulation.error.observedAt !== simulation.simulatedAt
    ) {
      issue(
        context,
        [...path, "proposalSimulation", "error", "observedAt"],
        "A completed reverting simulation must bind its failure observation to the exact simulation attempt time."
      );
    }
    const override = simulation.stateOverrides[0];
    if (
      !sameAddress(override.votingAddress, proposal.ref.votingAddress) ||
      override.proposalId !== proposal.ref.proposalId ||
      override.fromValue !== false ||
      override.toValue !== true
    ) {
      issue(context, [...path, "proposalSimulation", "stateOverrides"], "REVM simulation must prove the proposal-specific Voting executed transition from false to true before Executor calls.");
    }
    validatePinnedVotingSource(override.proof.source, context, [...path, "proposalSimulation", "stateOverrides", 0, "proof", "source"]);
    const bytecode = override.proof.bytecode;
    const storage = override.proof.storageLayout;
    const proposalId = toUint(proposal.ref.proposalId);
    let expectedStorage:
      | ReturnType<typeof deriveDaoVotingExecutedStorageSlots>
      | null = null;
    if (proposalId !== null) {
      try {
        expectedStorage = deriveDaoVotingExecutedStorageSlots(proposalId);
      } catch {
        expectedStorage = null;
      }
    }
    if (
      !sameAddress(bytecode.address, proposal.ref.votingAddress) ||
      bytecode.blockNumber !== propose.log.blockNumber ||
      bytecode.blockHash !== propose.log.blockHash ||
      bytecode.deployedBytecodeHash !== contract.deployedBytecodeHash ||
      storage.mappingKey !== proposal.ref.proposalId ||
      storage.layoutArtifactSha256 !== PINNED_VOTING_LAYOUT_SHA256 ||
      expectedStorage === null ||
      storage.proposalStorageBaseSlot !==
        expectedStorage.proposalStorageBaseSlot ||
      storage.resolvedStorageSlot !== expectedStorage.resolvedStorageSlot ||
      storage.preStorageWord !== `0x${"00".repeat(32)}` ||
      storage.postStorageWord !== `0x${"00".repeat(31)}01`
    ) {
      issue(context, [...path, "proposalSimulation", "stateOverrides", 0, "proof"], "Simulation transition proof must use the pinned Vyper storage-layout artifact, derive the mapping base from slot 17 and the proposal ID, add executed field slot 8, bind exact deployment bytecode from archive state, and prove one false-to-true storage word.");
    }
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
  validateActorEvidence(proposal, contract, event, context, [...path, "actor"]);
  const effectiveConfiguration = contract
    ? getEffectiveConfiguration(contract, event.log)
    : null;
  if (
    event.type !== "vote" &&
    event.actor.address !== null &&
    sameAddress(event.actor.address, ZERO_ADDRESS)
  ) {
    issue(
      context,
      [...path, "actor", "address"],
      "Only a Vote account may preserve a contract-valid zero actor argument; non-Vote lifecycle actors must be nonzero."
    );
  }
  if (
    event.type === "flag" &&
    effectiveConfiguration?.operatorState === "zero_address"
  ) {
    issue(
      context,
      [...path, "actor"],
      "A zero effective operator disables Flag and cannot be represented as an unavailable actor for an emitted Flag log."
    );
  }

  if (
    event.type === "propose" &&
    (!effectiveConfiguration ||
      effectiveConfiguration.proposalBlacklistState ===
        "uninitialized_zero_address" ||
      effectiveConfiguration.weightMeasureState === "zero_address" ||
      effectiveConfiguration.votingHookState === "zero_address")
  ) {
    issue(
      context,
      [...path, "data"],
      "A canonical Propose log requires nonzero event-effective blacklist, weight-measure, and hook interfaces because every one is called before the log is emitted."
    );
  }

  if (
    (event.type === "retract" || event.type === "flag") &&
    effectiveConfiguration?.votingHookState === "zero_address"
  ) {
    issue(
      context,
      [...path, "data"],
      "Retract and Flag call the event-effective hook before emitting and cannot survive a zero hook."
    );
  }

  if (
    event.type === "veto" &&
    event.data.branch === "early_no_votes" &&
    effectiveConfiguration?.votingHookState === "zero_address"
  ) {
    issue(
      context,
      [...path, "data", "branch"],
      "The early-no-votes Veto branch calls the event-effective hook before emitting; the post-participation branch does not."
    );
  }

  if (
    event.type === "execute" &&
    proposal.type === "executable" &&
    (effectiveConfiguration?.executorState !== "configured" ||
      sameAddress(effectiveConfiguration.executorAddress, ZERO_ADDRESS))
  ) {
    issue(
      context,
      [...path, "data"],
      "A nonempty executable script requires a nonzero event-effective Executor; an empty signal Execute skips the Executor call."
    );
  }

  if (event.type === "vote") {
    const voteWeight = toUint(event.data.weight);
    if (
      !effectiveConfiguration ||
      effectiveConfiguration.voterState === "disabled_zero_address" ||
      effectiveConfiguration.weightMeasureState === "zero_address" ||
      (effectiveConfiguration.votingHookState === "zero_address" &&
        voteWeight !== 0n) ||
      (effectiveConfiguration.voterImplementation.state ===
        "verified_pinned" &&
        effectiveConfiguration.ybcState === "zero_address")
    ) {
      issue(
        context,
        [...path, "data", "classification"],
        "The effective disabling state cannot produce this Vote: zero Voter or weight measure disables all votes, a zero hook rejects positive-weight votes, and a zero YBC atomically reverts pinned-Voter submissions."
      );
    }
    const expectedRole =
      event.data.actorKind === "human"
        ? "voter"
        : event.data.actorKind === "unclassified"
          ? "unknown"
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
    const classificationMethod = event.data.classification.method;
    const implementationState =
      effectiveConfiguration?.voterImplementation.state;
    if (
      !effectiveConfiguration ||
      event.data.classification.configurationId !==
        effectiveConfiguration.configurationId ||
      !sameAddress(
        event.data.classification.voterAddress,
        effectiveConfiguration.voterAddress
      ) ||
      comparePositions(
        event.data.classification.observedAt,
        effectiveConfiguration.effectiveAt
      ) !== 0 ||
      event.data.classification.observedAt.blockHash !==
        effectiveConfiguration.effectiveAt.blockHash ||
      (classificationMethod === "pinned_voter_call_trace" &&
        (event.data.actorKind === "unclassified" ||
          implementationState !== "verified_pinned")) ||
      (classificationMethod === "pinned_voter_trace_unavailable" &&
        (event.data.actorKind !== "unclassified" ||
          implementationState !== "verified_pinned")) ||
      (classificationMethod === "unverified_voter_unclassified" &&
        (event.data.actorKind !== "unclassified" ||
          implementationState !== "unverified"))
    ) {
      issue(context, [...path, "data", "classification"], "Vote classification must bind the effective historical configuration at the Vote event.");
    }
    if (event.data.classification.method === "pinned_voter_call_trace") {
      const aggregateAddress =
        event.data.actorKind === "delegated_staking_aggregate"
          ? event.data.classification.delegatedStakingAddress
          : event.data.actorKind === "ybc_aggregate"
            ? event.data.classification.ybcAddress
            : null;
      if (
        !effectiveConfiguration ||
        !sameAddress(
          event.data.classification.delegatedStakingAddress,
          effectiveConfiguration.delegatedStakingAddress
        ) ||
        !sameAddress(
          event.data.classification.ybcAddress,
          effectiveConfiguration.ybcAddress
        ) ||
        !sameAddress(
          event.data.classification.ybcWeightAggregatorAddress,
          effectiveConfiguration.ybcWeightAggregatorAddress
        ) ||
        event.log.transactionHash === null ||
        event.data.classification.trace.transactionHash !==
          event.log.transactionHash ||
        event.actor.address === null ||
        !sameAddress(
          event.data.classification.trace.emittedAccount,
          event.actor.address
        ) ||
        event.data.classification.trace.votingCallDepth !==
          event.data.classification.trace.voterCallDepth + 1 ||
        event.data.classification.trace.aggregatePathExecuted !==
          event.data.classification.trace.ybcMembership ||
        (event.data.actorKind === "human" &&
          event.data.classification.trace.votingCallOrdinal !== 0) ||
        (event.data.actorKind === "delegated_staking_aggregate" &&
          event.data.classification.trace.votingCallOrdinal !== 1) ||
        (event.data.actorKind === "ybc_aggregate" &&
          event.data.classification.trace.votingCallOrdinal !== 2) ||
        (event.data.actorKind !== "human" &&
          (!event.data.classification.trace.aggregatePathExecuted ||
            effectiveConfiguration.ybcState === "zero_address" ||
            effectiveConfiguration.ybcWeightAggregatorState ===
              "zero_address")) ||
        effectiveConfiguration.voterState === "disabled_zero_address" ||
        effectiveConfiguration.weightMeasureState === "zero_address" ||
        (aggregateAddress !== null &&
          !sameAddress(event.actor.address, aggregateAddress))
      ) {
        issue(
          context,
          [...path, "data", "classification"],
          "Pinned Voter actor labels require effective source/code/configuration provenance and transaction-bound call-trace resolution."
        );
      }
    }
    if (
      event.data.classification.method === "pinned_voter_trace_unavailable" &&
      (!effectiveConfiguration ||
        !sameAddress(
          event.data.classification.delegatedStakingAddress,
          effectiveConfiguration.delegatedStakingAddress
        ) ||
        !sameAddress(
          event.data.classification.ybcAddress,
          effectiveConfiguration.ybcAddress
        ) ||
        !sameAddress(
          event.data.classification.ybcWeightAggregatorAddress,
          effectiveConfiguration.ybcWeightAggregatorAddress
        ))
    ) {
      issue(
        context,
        [...path, "data", "classification"],
        "Trace-unavailable pinned Voter evidence must retain the exact effective aggregate addresses while leaving the raw Vote unclassified."
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
  const uintInputs = [proposal.ref.proposalId];
  if (event.type === "propose") {
    uintInputs.push(event.data.proposalId, event.data.votingEpoch);
  } else if (event.type === "vote") {
    uintInputs.push(event.data.weight);
  }
  if (uintInputs.some((value) => toUint(value) === null)) {
    issue(context, path, "Lifecycle ABI uint256 values must be canonical and within the uint256 range before encoding.");
    return;
  }
  let expected: { address: Address; topics: Hex[]; data: Hex };
  try {
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
  } catch {
    issue(context, path, "Lifecycle ABI evidence could not be canonically encoded from bounded validated inputs.");
    return;
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
  contract: StructuralFeed["contracts"][number] | undefined,
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
    const effectiveConfiguration = contract
      ? getEffectiveConfiguration(contract, event.log)
      : null;
    const expectedRoleAddress =
      event.type === "flag"
        ? effectiveConfiguration?.operatorAddress
        : effectiveConfiguration?.guardianAddress;
    if (
      actor.evidence.method !== "historical_role_and_transaction_sender" ||
      actor.role !== expectedRole ||
      effectiveConfiguration === null ||
      actor.evidence.configurationId !==
        effectiveConfiguration?.configurationId ||
      !sameAddress(actor.address, actor.evidence.transactionSender) ||
      !sameAddress(actor.address, actor.evidence.configuredRoleAddress) ||
      expectedRoleAddress === undefined ||
      !sameAddress(actor.address, expectedRoleAddress) ||
      comparePositions(
        actor.evidence.observedAt,
        effectiveConfiguration.effectiveAt
      ) !== 0 ||
      actor.evidence.observedAt.blockHash !==
        effectiveConfiguration.effectiveAt.blockHash ||
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
  if (
    toUint(stage.ref.proposalId) === null ||
    toUint(stage.identity.votingEpoch) === null
  ) {
    issue(context, ["identity"], "Receipt-stage uint256 identity fields must be canonical and bounded before ABI encoding.");
    return;
  }
  if ((stage.stage === "indexed") !== (stage.indexedSnapshotId !== null)) {
    issue(context, ["indexedSnapshotId"], "Only an indexed identity stage may name its atomic feed snapshot.");
  }
  if (stage.transactionHash !== stage.identity.log.transactionHash) {
    issue(context, ["transactionHash"], "Receipt-stage transaction hash must match its decoded Propose log.");
  }
  if (!sameAddress(stage.ref.votingAddress, stage.identity.abi.address)) {
    issue(context, ["identity", "abi", "address"], "Receipt-stage ABI evidence must come from the exact Voting address.");
  }
  let canonical: ReturnType<typeof encodeDaoProposeLog>;
  try {
    canonical = encodeDaoProposeLog({
      address: stage.ref.votingAddress as Address,
      contentDigest: stage.identity.contentDigest as Hex,
      logIndex: stage.identity.log.logIndex,
      proposalId: BigInt(stage.ref.proposalId),
      proposer: stage.identity.proposer as Address,
      script: stage.identity.script as Hex,
      votingEpoch: BigInt(stage.identity.votingEpoch),
    });
  } catch {
    issue(context, ["identity", "abi"], "Receipt-stage identity could not be canonically encoded from bounded validated inputs.");
    return;
  }
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
    source.repository !== "yearn/stYFI" ||
    source.revision !== DAO_PINNED_VOTING_REVISION ||
    source.sourcePath !== PINNED_VOTING_SOURCE_PATH ||
    source.url !== PINNED_VOTING_SOURCE_URL
  ) {
    issue(context, path, "Voting provenance must use the exact pinned Voting GitHub blob URL, revision, and source path.");
  }
}

function validatePinnedVoterSource(
  source: z.infer<typeof VerifiedSourceSchema>,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  validateSource(source, context, path);
  if (
    source.kind !== "github" ||
    source.repository !== "yearn/stYFI" ||
    source.revision !== DAO_PINNED_VOTING_REVISION ||
    source.sourcePath !== PINNED_VOTER_SOURCE_PATH ||
    source.url !== PINNED_VOTER_SOURCE_URL
  ) {
    issue(
      context,
      path,
      "Voter provenance must use the exact pinned Voter GitHub blob URL, repository, revision, and source path."
    );
  }
}

function validatePinnedExecutorSource(
  source: z.infer<typeof VerifiedSourceSchema>,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  validateSource(source, context, path);
  if (
    source.kind !== "github" ||
    source.repository !== "yearn/stYFI" ||
    source.revision !== DAO_PINNED_VOTING_REVISION ||
    source.sourcePath !== PINNED_EXECUTOR_SOURCE_PATH ||
    source.url !== PINNED_EXECUTOR_SOURCE_URL
  ) {
    issue(
      context,
      path,
      "Executor provenance must use the exact pinned Executor GitHub blob URL, repository, revision, and source path."
    );
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
  const expectedUrl = `https://github.com/${source.repository}/blob/${source.revision}/${source.sourcePath}`;
  if (source.url !== expectedUrl) {
    issue(
      context,
      [...path, "url"],
      "Verified GitHub provenance must bind repository, revision, source path, and the exact canonical GitHub source URL."
    );
  }
}

function validateHttpsUrl(
  value: string,
  context: RefinementContext,
  path: readonly PropertyKey[],
  label: string
): void {
  if (
    value !== value.trim() ||
    /[\u0000-\u001f\u007f\\]/u.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(value)
  ) {
    issue(context, path, `${label} must not contain control characters, backslashes, encoded controls, or surrounding whitespace.`);
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      issue(context, path, `${label} must use HTTPS.`);
    }
    if (url.username || url.password) {
      issue(context, path, `${label} must not contain credentials.`);
    }
    if (url.href !== value) {
      issue(
        context,
        path,
        `${label} must use its canonical URL form without normalized ports, hosts, dot segments, or empty query/fragment markers.`
      );
    }
  } catch {
    issue(context, path, `${label} must be a complete HTTPS URL.`);
  }
}

function validateRetryRecord(
  retry: {
    state: "succeeded" | "scheduled" | "non_retryable" | "exhausted";
    attempts: number;
    maxAttempts: number;
    lastAttemptAt: string;
    nextRetryAt: string | null;
    backoffSeconds: number | null;
  },
  resourceState: "available" | "invalid" | "unavailable",
  error:
    | { retryable: boolean; observedAt: string | null }
    | null,
  snapshotAt: string,
  context: RefinementContext,
  path: readonly PropertyKey[],
  label: string
): void {
  if (retry.attempts > retry.maxAttempts) {
    issue(context, [...path, "attempts"], `${label} retry attempts cannot exceed the bounded maximum.`);
  }
  if (Date.parse(retry.lastAttemptAt) > Date.parse(snapshotAt)) {
    issue(
      context,
      [...path, "lastAttemptAt"],
      `${label} last attempt cannot follow feed generation or publication.`
    );
  }
  if (resourceState === "available") {
    if (retry.state !== "succeeded" || error !== null) {
      issue(context, path, `${label} success requires a succeeded retry state and no failure.`);
    }
    return;
  }
  if (
    error === null ||
    error.observedAt === null ||
    error.observedAt !== retry.lastAttemptAt
  ) {
    issue(
      context,
      path,
      `${label} failure observedAt must equal its exact last-attempt timestamp.`
    );
    return;
  }
  const expectedState =
    retry.attempts >= retry.maxAttempts
      ? "exhausted"
      : error.retryable
        ? "scheduled"
        : "non_retryable";
  if (retry.state !== expectedState) {
    issue(
      context,
      [...path, "state"],
      `${label} retry state must exactly reflect retryability and the bounded attempt count.`
    );
  }
  const shouldRetry = expectedState === "scheduled";
  if ((retry.nextRetryAt !== null) !== shouldRetry) {
    issue(context, [...path, "nextRetryAt"], `${label} next-retry time must exist exactly for a scheduled retry.`);
  }
  if (
    retry.nextRetryAt !== null &&
    (retry.backoffSeconds === null ||
      retry.backoffSeconds <= 0 ||
      retry.backoffSeconds > DAO_FEED_MAX_RETRY_BACKOFF_SECONDS ||
      Date.parse(retry.nextRetryAt) !==
        Date.parse(retry.lastAttemptAt) + retry.backoffSeconds * 1_000 ||
      Date.parse(retry.nextRetryAt) <= Date.parse(snapshotAt))
  ) {
    issue(
      context,
      [...path, "nextRetryAt"],
      `${label} next retry must follow the snapshot and equal lastAttemptAt plus its positive bounded backoff.`
    );
  } else if (!shouldRetry && retry.backoffSeconds !== null) {
    issue(context, [...path, "backoffSeconds"], `${label} non-scheduled retry states cannot retain a backoff.`);
  }
}

function validateFailureObservationTimes(
  value: unknown,
  snapshotAt: string,
  context: RefinementContext,
  path: PropertyKey[]
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateFailureObservationTimes(item, snapshotAt, context, [...path, index])
    );
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (
    typeof record.code === "string" &&
    typeof record.retryable === "boolean" &&
    typeof record.source === "string" &&
    typeof record.observedAt === "string" &&
    Date.parse(record.observedAt) > Date.parse(snapshotAt)
  ) {
    issue(
      context,
      [...path, "observedAt"],
      "Failure observation cannot follow feed generation or publication."
    );
  }
  for (const [key, item] of Object.entries(record)) {
    validateFailureObservationTimes(item, snapshotAt, context, [...path, key]);
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

function getDaoFeedAdmissionError(value: unknown): string | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return "DAO feed payload must be JSON-serializable before schema traversal.";
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
    DAO_FEED_MAX_PAYLOAD_BYTES
  ) {
    return "DAO feed payload exceeds the 64 MiB consumer admission bound.";
  }
  return null;
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

function parseCanonicalIsoSeconds(value: string): number | null {
  if (!isCanonicalIsoUtc(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds / 1_000 : null;
}

function validateAnalysisObservationTime(
  value: string,
  proposeTimestamp: number | null,
  analysisGeneratedAt: number | null,
  feedGeneratedAt: number | null,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const observedAt = parseCanonicalIsoSeconds(value);
  if (observedAt === null) return;
  if (
    (proposeTimestamp !== null && observedAt < proposeTimestamp) ||
    (analysisGeneratedAt !== null && observedAt > analysisGeneratedAt) ||
    (analysisGeneratedAt === null && observedAt !== null) ||
    (feedGeneratedAt !== null && observedAt > feedGeneratedAt)
  ) {
    issue(
      context,
      path,
      "Analysis and simulation observations must follow a known Propose time and occur no later than analysis generation and feed publication."
    );
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

function decodeCanonicalBase64(value: string): Uint8Array | null {
  if (!CANONICAL_BASE64_PATTERN.test(value)) return null;
  try {
    const decoded = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0)
    );
    const encoded = btoa(
      Array.from(decoded, (byte) => String.fromCharCode(byte)).join("")
    );
    return encoded === value ? decoded : null;
  } catch {
    return null;
  }
}

function stringArraysEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function numberArraysEqual(
  left: readonly number[],
  right: readonly number[]
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function proposalRefKey(ref: z.infer<typeof ProposalRefSchema>): string {
  return `${ref.chainId}:${ref.votingAddress.toLowerCase()}:${ref.proposalId}`;
}

function validateConfigurationSemantics(
  configuration: z.infer<typeof HistoricalConfigurationSchema>,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const zero = ZERO_ADDRESS;
  if (
    configuration.votingWindowState !==
    (configuration.votingPeriodSeconds === 0
      ? "disabled_zero_length"
      : "enabled")
  ) {
    issue(
      context,
      [...path, "votingWindowState"],
      "Voting window state must distinguish the contract-valid zero-length disabled window from an enabled window."
    );
  }
  for (const [addressField, stateField, configuredState, zeroState] of [
    ["voterAddress", "voterState", "configured", "disabled_zero_address"],
    ["delegatedStakingAddress", "delegatedStakingState", "configured", "zero_address"],
    ["ybcAddress", "ybcState", "configured", "zero_address"],
    ["ybcWeightAggregatorAddress", "ybcWeightAggregatorState", "configured", "zero_address"],
    ["executorAddress", "executorState", "configured", "uninitialized_zero_address"],
    ["votingHookAddress", "votingHookState", "configured", "zero_address"],
    ["weightMeasureAddress", "weightMeasureState", "configured", "zero_address"],
    ["proposalBlacklistAddress", "proposalBlacklistState", "configured", "uninitialized_zero_address"],
    ["operatorAddress", "operatorState", "configured", "zero_address"],
  ] as const) {
    const address = configuration[addressField];
    const expectedState = address === zero ? zeroState : configuredState;
    if (configuration[stateField] !== expectedState) {
      issue(
        context,
        [...path, stateField],
        `${stateField} must truthfully discriminate its raw configured or zero address.`
      );
    }
  }

  const implementation = configuration.voterImplementation;
  if (!sameAddress(implementation.address, configuration.voterAddress)) {
    issue(
      context,
      [...path, "voterImplementation", "address"],
      "Voter implementation evidence must bind the exact effective Voting.voter address."
    );
  }
  if (implementation.state === "verified_pinned") {
    validatePinnedVoterSource(
      implementation.source,
      context,
      [...path, "voterImplementation", "source"]
    );
    const expectedBuildEvidenceSha256 =
      deriveDaoVoterBuildEvidenceSha256({
        constructorGenesisTimestamp:
          implementation.bytecode.constructorGenesisTimestamp,
        compiledRuntimeBytecodeHash:
          implementation.compiledRuntimeBytecodeHash as Hex,
        codeByteLength: implementation.bytecode.codeByteLength,
        deployedBytecodeHash:
          implementation.bytecode.deployedBytecodeHash as Hex,
        buildArtifactSha256:
          implementation.bytecode.buildArtifactSha256 as Hex,
      });
    if (
      configuration.voterState !== "configured" ||
      implementation.immutableGenesisTimestamp !==
        implementation.bytecode.constructorGenesisTimestamp ||
      !sameAddress(implementation.bytecode.address, configuration.voterAddress) ||
      implementation.bytecode.blockNumber !==
        configuration.effectiveAt.blockNumber ||
      implementation.bytecode.blockHash !== configuration.effectiveAt.blockHash ||
      implementation.compiledRuntimeBytecodeHash !==
        implementation.bytecode.deployedBytecodeHash ||
      implementation.bytecode.buildEvidenceSha256 !==
        expectedBuildEvidenceSha256
    ) {
      issue(
        context,
        [...path, "voterImplementation"],
        "Pinned Voter semantics require exact source/compiler settings, immutable genesis, a reproducible build commitment binding constructor genesis to runtime and artifact evidence, and archive code at the configuration position."
      );
    }
  } else if (
    (implementation.state === "disabled_zero_address") !==
    (configuration.voterState === "disabled_zero_address")
  ) {
    issue(
      context,
      [...path, "voterImplementation", "state"],
      "Zero Voter state and disabled implementation evidence must agree; a custom nonzero Voter remains explicitly unverified."
    );
  }

  const executorImplementation = configuration.executorImplementation;
  if (
    !sameAddress(
      executorImplementation.address,
      configuration.executorAddress
    )
  ) {
    issue(
      context,
      [...path, "executorImplementation", "address"],
      "Executor implementation evidence must bind the exact effective Voting.executor address."
    );
  }
  if (executorImplementation.state === "verified_pinned") {
    validatePinnedExecutorSource(
      executorImplementation.source,
      context,
      [...path, "executorImplementation", "source"]
    );
    if (
      configuration.executorState !== "configured" ||
      !sameAddress(
        executorImplementation.bytecode.address,
        configuration.executorAddress
      ) ||
      executorImplementation.bytecode.blockNumber !==
        configuration.effectiveAt.blockNumber ||
      executorImplementation.bytecode.blockHash !==
        configuration.effectiveAt.blockHash ||
      executorImplementation.bytecode.codeByteLength !==
        executorImplementation.compiledRuntimeByteLength ||
      executorImplementation.bytecode.deployedBytecodeHash !==
        executorImplementation.compiledRuntimeBytecodeHash ||
      executorImplementation.bytecode.buildArtifactSha256 !==
        executorImplementation.compiledRuntimeArtifactSha256
    ) {
      issue(
        context,
        [...path, "executorImplementation"],
        "Pinned Executor semantics require exact source/compiler settings, reproducible runtime bytecode equality, and archive code at the configuration position."
      );
    }
  } else if (
    (executorImplementation.state === "uninitialized_zero_address") !==
    (configuration.executorState === "uninitialized_zero_address")
  ) {
    issue(
      context,
      [...path, "executorImplementation", "state"],
      "Zero Executor state and uninitialized implementation evidence must agree; a custom nonzero Executor remains explicitly unverified."
    );
  }
}

function getEffectiveConfiguration(
  contract: z.infer<typeof FeedContractSchema>,
  position: Pick<
    z.infer<typeof EventPositionSchema>,
    "blockNumber" | "transactionIndex" | "logIndex"
  >
): z.infer<typeof HistoricalConfigurationSchema> | null {
  let effective: z.infer<typeof HistoricalConfigurationSchema> | null = null;
  for (const candidate of contract.configurationHistory) {
    if (comparePositions(candidate.effectiveAt, position) > 0) break;
    effective = candidate;
  }
  return effective;
}

function getSnapshotConfiguration(
  contract: z.infer<typeof FeedContractSchema>
): z.infer<typeof HistoricalConfigurationSchema> | null {
  return contract.configurationHistory.at(-1) ?? null;
}

function getProposalEpochBoundary(
  contract: Pick<
    z.infer<typeof FeedContractSchema>,
    "genesisTimestamp" | "epochLengthSeconds"
  >,
  votingEpoch: string,
  epochOffset: bigint
): bigint | null {
  const epoch = toUint(votingEpoch);
  if (epoch === null) return null;
  return (
    BigInt(contract.genesisTimestamp) +
    (epoch + epochOffset) * BigInt(contract.epochLengthSeconds)
  );
}

function configurationValuesMatch(
  observed: z.infer<typeof MutableConfigurationSchema>,
  historical: z.infer<typeof HistoricalConfigurationSchema>
): boolean {
  return (
    observed.contractGeneration === historical.contractGeneration &&
    observed.configurationId === historical.configurationId &&
    observed.voteStartOffsetSeconds === historical.voteStartOffsetSeconds &&
    observed.votingPeriodSeconds === historical.votingPeriodSeconds &&
    observed.votingWindowState === historical.votingWindowState &&
    observed.executionDelaySeconds === historical.executionDelaySeconds &&
    observed.executionGuard === historical.executionGuard &&
    sameAddress(observed.voterAddress, historical.voterAddress) &&
    observed.voterState === historical.voterState &&
    JSON.stringify(observed.voterImplementation) ===
      JSON.stringify(historical.voterImplementation) &&
    sameAddress(
      observed.delegatedStakingAddress,
      historical.delegatedStakingAddress
    ) &&
    observed.delegatedStakingState === historical.delegatedStakingState &&
    sameAddress(observed.ybcAddress, historical.ybcAddress) &&
    observed.ybcState === historical.ybcState &&
    sameAddress(
      observed.ybcWeightAggregatorAddress,
      historical.ybcWeightAggregatorAddress
    ) &&
    observed.ybcWeightAggregatorState ===
      historical.ybcWeightAggregatorState &&
    sameAddress(observed.executorAddress, historical.executorAddress) &&
    observed.executorState === historical.executorState &&
    JSON.stringify(observed.executorImplementation) ===
      JSON.stringify(historical.executorImplementation) &&
    sameAddress(observed.votingHookAddress, historical.votingHookAddress) &&
    observed.votingHookState === historical.votingHookState &&
    sameAddress(observed.weightMeasureAddress, historical.weightMeasureAddress) &&
    observed.weightMeasureState === historical.weightMeasureState &&
    sameAddress(
      observed.proposalBlacklistAddress,
      historical.proposalBlacklistAddress
    ) &&
    observed.proposalBlacklistState === historical.proposalBlacklistState &&
    sameAddress(observed.operatorAddress, historical.operatorAddress) &&
    observed.operatorState === historical.operatorState &&
    sameAddress(observed.guardianAddress, historical.guardianAddress)
  );
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
