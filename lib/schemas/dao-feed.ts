import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  isAddressEqual,
  keccak256,
  sha256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { z } from "@/lib/schemas/zod";
import { deriveDaoPinnedVoterConstructorArtifacts } from "@/lib/schemas/dao-voter-build";
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

export const DAO_FEED_CONFIGURATION_SETTER_SELECTORS = {
  setProposeParameters: "0xff6df1ac",
  setVoteParameters: "0xf182b394",
  setExecuteParameters: "0xdcfec72c",
  setHooks: "0x0c360521",
  setWeightMeasure: "0x80ad61a3",
  setOperator: "0x30c7be72",
  acceptGuardian: "0x831352f4",
  setDecayLength: "0xe4c341fa",
  setDelegatedStaking: "0xa1275ce1",
  setYbc: "0x58007401",
  setYbcWeightAggregator: "0x6265d619",
} as const;

export const DAO_FEED_CONFIGURATION_SETTER_TOPICS = {
  setProposeParameters:
    "0xfab3227f78255cd593ef6859519102d5fb7ad8f773deb32a3464ce696f0020fa",
  setVoteParameters:
    "0x559116557c3a62b0f633fca41b82c45045bd81575f2ffdb29b3b6a8a6ecb34bb",
  setExecuteParameters:
    "0xbcd64841ac721e268f925c3209cfd0b682bf2586bf932242b82c33df319a8ed6",
  setHooks:
    "0xdb0670e174c4203280e70166db52920a0ddc53923128a7e0e964c5350de54f1f",
  setWeightMeasure:
    "0x89f0256426a7eb0b05f11201574bca64c364ad351205803c24ace8d86da8798f",
  setOperator:
    "0xdbebfba65bd6398fb722063efc10c99f624f9cd8ba657201056af918a676d5ee",
  acceptGuardian:
    "0x31845eceb9cde510c7e8b37f76301c688feb70bc9653aa4c28a3734999840fd8",
  setDecayLength:
    "0xbe2521cc0bf1d6a1506707fc3ab6beef8f2762765d9f3225eb6a0b5d5deca60f",
  setDelegatedStaking:
    "0x4496eefeccfc48b5cd0fa817b69dec275ec2bbb52c30814103e57e1b8912b8f8",
  setYbc:
    "0xa2db453907b40a335339c283751d2fec56404ede4a7afb005cc5db2dfeb35c71",
  setYbcWeightAggregator:
    "0x3469dc7f2a84fbbd6baa33558d5887880fa272c9b35ba89f97e8831dd677f2de",
} as const;

const PINNED_VOTING_SOURCE_PATH = "contracts/governance/Voting.vy";
const PINNED_VOTING_SOURCE_LABEL =
  "Voting.vy at pinned stYFI revision" as const;
const PINNED_VOTING_SOURCE_URL = `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${PINNED_VOTING_SOURCE_PATH}`;
const PINNED_VOTER_SOURCE_PATH = "contracts/governance/Voter.vy";
const PINNED_VOTER_SOURCE_LABEL =
  "Voter.vy at pinned stYFI revision" as const;
const PINNED_VOTER_SOURCE_URL = `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${PINNED_VOTER_SOURCE_PATH}`;
const PINNED_EXECUTOR_SOURCE_PATH = "contracts/governance/Executor.vy";
const PINNED_EXECUTOR_SOURCE_LABEL =
  "Executor.vy at pinned stYFI revision" as const;
const PINNED_EXECUTOR_SOURCE_URL = `https://github.com/yearn/stYFI/blob/${DAO_PINNED_VOTING_REVISION}/${PINNED_EXECUTOR_SOURCE_PATH}`;
const PINNED_VOTING_SOURCE_SHA256 =
  "0x6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e" as const;
const PINNED_VOTER_SOURCE_SHA256 =
  "0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab" as const;
const PINNED_EXECUTOR_SOURCE_SHA256 =
  "0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1" as const;
const PINNED_EXECUTOR_SOURCE_INTEGRITY_SHA256 =
  "0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b" as const;
const PINNED_VOTER_SOURCE_INTEGRITY_SHA256 =
  "0x90d458df8321d2c845ad1a153b21fea3eeb6fa746feecc57d15beec3ae5f192d" as const;
const PINNED_VYPER_COMPILER_ARTIFACT_NAME =
  "vyper.0.4.2+commit.c216787f.linux" as const;
const PINNED_VYPER_COMPILER_ARTIFACT_URI =
  "https://github.com/vyperlang/vyper/releases/download/v0.4.2/vyper.0.4.2%2Bcommit.c216787f.linux" as const;
const PINNED_VYPER_COMPILER_ARTIFACT_BYTE_LENGTH = 23_495_192 as const;
const PINNED_VYPER_COMPILER_ARTIFACT_SHA256 =
  "0x7cc4214671dc78db8a3962f103bead22dd76b55ee370d6d333122e7f3368f4fa" as const;
const PINNED_VYPER_RELEASE_COMMIT =
  "c216787f5e355478733a05fa5f0fce93fa9a7126" as const;
const PINNED_VYPER_LONG_VERSION = "0.4.2+commit.c216787f" as const;
const PINNED_VOTER_CREATION_BYTECODE_COMMAND =
  "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f bytecode contracts/governance/Voter.vy" as const;
const PINNED_VOTER_CREATION_BYTECODE_STDOUT_SHA256 =
  "0x25ca8e7899a40c5ae221fa5d8075816f7b36650b3ef6ef285b60fc5dcce362cc" as const;
const PINNED_VOTER_CREATION_STDOUT_BYTE_LENGTH = 4_123 as const;
const PINNED_VOTER_RUNTIME_TEMPLATE_COMMAND =
  "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f bytecode_runtime contracts/governance/Voter.vy" as const;
const PINNED_VOTER_CREATION_BYTE_LENGTH = 2_060 as const;
const PINNED_VOTER_CREATION_SHA256 =
  "0xbcb72ccd8fec2d904ecd867503481abc4d841d4b1ef7d5104b6017ff15a93839" as const;
const PINNED_VOTER_INITCODE_WITH_ARGUMENT_BYTE_LENGTH = 2_092 as const;
const PINNED_VOTER_RUNTIME_TEMPLATE_BYTE_LENGTH = 1_957 as const;
const PINNED_VOTER_RUNTIME_STDOUT_BYTE_LENGTH = 3_917 as const;
const PINNED_VOTER_RUNTIME_STDOUT_SHA256 =
  "0x461f3f38e239d707be52a4c89d57d887c4c8e60b42b2032ebe6ed99b41e9cd54" as const;
const PINNED_VOTER_LAYOUT_COMMAND =
  "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f layout contracts/governance/Voter.vy" as const;
const PINNED_VOTER_LAYOUT_STDOUT_BYTE_LENGTH = 578 as const;
const PINNED_VOTER_LAYOUT_STDOUT_SHA256 =
  "0x6486152f25f1fa13ac03681a2b2779d035577906cee90f6ebba302a28b460681" as const;
const PINNED_VOTER_RUNTIME_TEMPLATE_SHA256 =
  "0x452dcaf7aa5c7d647c694a424121737e691ab229ee33744e0773d8581d9eea8b" as const;
const PINNED_VOTER_RUNTIME_TEMPLATE_KECCAK256 =
  "0xdfc74b9ef65aba002169200841461f60261aa1e66380e0b867b085266f16acaf" as const;
const PINNED_VOTER_DEPLOYED_RUNTIME_BYTE_LENGTH = 1_989 as const;
const PINNED_VOTER_DEPLOYED_RUNTIME_SHA256 =
  "0xb5de901445a5744788a6979108d95eba59c98fe4602ae2ded0ec087c19fc6e0b" as const;
const PINNED_EXECUTOR_CREATION_BYTECODE_COMMAND =
  "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f bytecode contracts/governance/Executor.vy" as const;
const PINNED_EXECUTOR_RUNTIME_COMMAND =
  "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f bytecode_runtime contracts/governance/Executor.vy" as const;
const PINNED_EXECUTOR_CREATION_STDOUT_SHA256 =
  "0x48dbf262a5e31ccdb52119174854e136d8070bbd67140e8b11f72d7b7b169f23" as const;
const PINNED_EXECUTOR_CREATION_STDOUT_BYTE_LENGTH = 2_483 as const;
const PINNED_EXECUTOR_CREATION_BYTE_LENGTH = 1_240 as const;
const PINNED_EXECUTOR_RUNTIME_STDOUT_BYTE_LENGTH = 2_317 as const;
const PINNED_EXECUTOR_RUNTIME_STDOUT_SHA256 =
  "0x9c50f7eb47e09e8349e896e0843f41c96a6b15c48c53c2855e4db709510e021b" as const;
const PINNED_EXECUTOR_CREATION_SHA256 =
  "0xccb991a4222b9576e42f6d0da4e655069a4882532bf088e22c8a95b629862a60" as const;
const PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH = 1_157 as const;
const PINNED_EXECUTOR_RUNTIME_KECCAK256 =
  "0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151" as const;
const PINNED_EXECUTOR_RUNTIME_SHA256 =
  "0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c" as const;
const PINNED_VOTING_LAYOUT_SHA256 =
  "0x0f963a37d02adeb6a34fabb98ab37b118031ac9b7380e4ad65ac2765b4b6db26" as const;
const VOTING_PROPOSALS_MAPPING_SLOT = 17n;
const EXECUTOR_OPERATORS_MAPPING_SLOT = 2n;
const EXECUTOR_SET_OPERATOR_EVENT_TOPIC =
  "0x1618a22a3b00b9ac70fd5a82f1f5cdd8cb272bd0f1b740ddf7c26ab05881dd5b" as const;
const VOTING_PROPOSAL_THRESHOLD_SLOT_OFFSET = 4n;
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
  /^[0-9]+:0x[0-9a-f]{40}:0x[0-9a-f]{64}:(?:root|(?:[0-9]+)(?:\.[0-9]+)*)$/u;
const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const GITHUB_REVISION_PATTERN = /^[0-9a-f]{40}$/u;
const SOURCE_PATH_PATTERN = /^[A-Za-z0-9_.\/-]+$/u;
const CANONICAL_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const ZERO_ADDRESS = `0x${"00".repeat(20)}`;
const OSAKA_PRECOMPILE_ADDRESSES = [
  ...Array.from(
    { length: 17 },
    (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`
  ),
  `0x${(256).toString(16).padStart(40, "0")}`,
] as const;
const PINNED_MAINNET_CHAIN_SPEC = {
  kind: "github",
  label: "go-ethereum mainnet chain config at pinned revision",
  repository: "ethereum/go-ethereum",
  revision: "9621c6ad10934a01b5514886fb6fbd87640b6c05",
  sourcePath: "params/config.go",
  url: "https://github.com/ethereum/go-ethereum/blob/9621c6ad10934a01b5514886fb6fbd87640b6c05/params/config.go",
} as const;
const PINNED_MAINNET_CHAIN_SPEC_SHA256 =
  "0xbd6759b0b0d4e4f8191f25870e40abad46ef5fb70aacdd31bdf220b5212de361" as const;
const PINNED_REVM_CARGO_LOCK_SHA256 =
  "0x6edd1b9a62f867205f9fb59aef137aa0fb0d08def83a0932fc84f67efe32de19" as const;
const PINNED_REVM_CRATE_SHA256 =
  "0xc2aabdebaa535b3575231a88d72b642897ae8106cf6b0d12eafc6bfdf50abfc7" as const;
const MAINNET_OSAKA_ACTIVATION_TIMESTAMP = 1_764_798_551 as const;
const MAINNET_BPO2_ACTIVATION_TIMESTAMP = 1_767_747_671 as const;
const MAINNET_BPO2_BLOB_BASE_FEE_UPDATE_FRACTION = 11_684_671n;
const UINT64_MAX = (1n << 64n) - 1n;
const MAX_BPS_SAFE_WEIGHT = ((1n << 256n) - 1n) / BigInt(DAO_BPS);
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
const zUint256 = zUint.refine(
  (value) => toUint(value) !== null,
  "Value must fit in an unsigned 256-bit integer."
);
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
const zSimulationCalldata = z
  .string()
  .max(4_500)
  .regex(LOWER_BYTES_PATTERN);
const zContentBase64 = z
  .string()
  .max(174_764)
  .regex(CANONICAL_BASE64_PATTERN);
const zProposeLogData = z.string().max(4_290).regex(LOWER_BYTES_PATTERN);
const zVoteLogData = z.string().length(130).regex(LOWER_BYTES_PATTERN);
const zReasonLogData = z.string().max(642).regex(LOWER_BYTES_PATTERN);
const zSelector = z.string().regex(SELECTOR_PATTERN);
const zIsoUtc = z.string().max(32).regex(ISO_UTC_PATTERN);
const RawRpcResultEvidenceShape = {
  rawResultSha256: zNonZeroHash.nullable(),
  rawResultObjectKey: z.string().min(1).max(1_024).nullable(),
};

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

const PinnedCompilerDistributionSchema = z.strictObject({
  kind: z.literal("github_release_pyinstaller_onefile"),
  releaseTag: z.literal("v0.4.2"),
  artifactName: z.literal(PINNED_VYPER_COMPILER_ARTIFACT_NAME),
  releaseCommit: z.literal(PINNED_VYPER_RELEASE_COMMIT),
  longVersion: z.literal(PINNED_VYPER_LONG_VERSION),
  platform: z.literal("linux-x86_64-gnu"),
  buildRunner: z.literal("github-actions-ubuntu-22.04"),
  uri: z.literal(PINNED_VYPER_COMPILER_ARTIFACT_URI),
  byteLength: z.literal(PINNED_VYPER_COMPILER_ARTIFACT_BYTE_LENGTH),
  sha256: z.literal(PINNED_VYPER_COMPILER_ARTIFACT_SHA256),
  derivation: z.literal("sha256_exact_download_bytes"),
});

function pinnedSourceIntegritySchema(
  preimage: string,
  digest: string
) {
  return z.strictObject({
    algorithm: z.literal("vyper_0_4_2_sha256_import_tree"),
    preimageEncoding: z.literal("lowercase_ascii_hex_without_0x"),
    preimage: z.literal(preimage),
    digest: z.literal(digest),
    derivation: z.literal(
      "vyper_0_4_2_integrity_for_import_free_source"
    ),
  });
}

const PinnedVoterSourceIntegritySchema = pinnedSourceIntegritySchema(
  PINNED_VOTER_SOURCE_SHA256.slice(2),
  PINNED_VOTER_SOURCE_INTEGRITY_SHA256
);
const PinnedExecutorSourceIntegritySchema = pinnedSourceIntegritySchema(
  PINNED_EXECUTOR_SOURCE_SHA256.slice(2),
  PINNED_EXECUTOR_SOURCE_INTEGRITY_SHA256
);

const PinnedVoterBuildArtifactSchema = z.strictObject({
  outputKind: z.literal("vyper_creation_bytecode_hex_stdout"),
  exactBytesEncoding: z.literal("utf8_lowercase_0x_hex_with_final_lf"),
  command: z.literal(PINNED_VOTER_CREATION_BYTECODE_COMMAND),
  stdoutByteLength: z.literal(PINNED_VOTER_CREATION_STDOUT_BYTE_LENGTH),
  sha256: z.literal(PINNED_VOTER_CREATION_BYTECODE_STDOUT_SHA256),
  derivation: z.literal("sha256_exact_stdout_bytes"),
  decodedCreationByteLength: z.literal(PINNED_VOTER_CREATION_BYTE_LENGTH),
  decodedCreationSha256: z.literal(PINNED_VOTER_CREATION_SHA256),
  constructorInputEncoding: z.literal("abi_uint256_big_endian_word"),
  initcodeWithArgumentByteLength: z.literal(
    PINNED_VOTER_INITCODE_WITH_ARGUMENT_BYTE_LENGTH
  ),
  initcodeWithArgumentSha256: zNonZeroHash,
});

const PinnedVoterRuntimeTemplateSchema = z.strictObject({
  outputKind: z.literal("vyper_runtime_template_raw_bytes"),
  compilerStdoutDecoding: z.literal(
    "strip_exact_0x_prefix_and_one_final_lf_then_lowercase_hex_decode"
  ),
  command: z.literal(PINNED_VOTER_RUNTIME_TEMPLATE_COMMAND),
  stdoutByteLength: z.literal(PINNED_VOTER_RUNTIME_STDOUT_BYTE_LENGTH),
  stdoutSha256: z.literal(PINNED_VOTER_RUNTIME_STDOUT_SHA256),
  byteLength: z.literal(PINNED_VOTER_RUNTIME_TEMPLATE_BYTE_LENGTH),
  sha256: z.literal(PINNED_VOTER_RUNTIME_TEMPLATE_SHA256),
  keccak256: z.literal(PINNED_VOTER_RUNTIME_TEMPLATE_KECCAK256),
  immutableLayout: z.strictObject({
    evidenceCommand: z.literal(PINNED_VOTER_LAYOUT_COMMAND),
    evidenceStdoutByteLength: z.literal(
      PINNED_VOTER_LAYOUT_STDOUT_BYTE_LENGTH
    ),
    evidenceStdoutSha256: z.literal(PINNED_VOTER_LAYOUT_STDOUT_SHA256),
    field: z.literal("genesis"),
    codeOffset: z.literal(0),
    byteLength: z.literal(32),
    encoding: z.literal("abi_uint256_big_endian_word_appended_to_template"),
  }),
});

const PinnedExecutorBuildArtifactSchema = z.strictObject({
  creationOutputKind: z.literal("vyper_creation_bytecode_hex_stdout"),
  runtimeOutputKind: z.literal("vyper_runtime_bytecode_hex_stdout"),
  compilerStdoutDecoding: z.literal(
    "strip_exact_0x_prefix_and_one_final_lf_then_lowercase_hex_decode"
  ),
  creationCommand: z.literal(PINNED_EXECUTOR_CREATION_BYTECODE_COMMAND),
  runtimeCommand: z.literal(PINNED_EXECUTOR_RUNTIME_COMMAND),
  creationStdoutSha256: z.literal(
    PINNED_EXECUTOR_CREATION_STDOUT_SHA256
  ),
  creationStdoutByteLength: z.literal(
    PINNED_EXECUTOR_CREATION_STDOUT_BYTE_LENGTH
  ),
  runtimeStdoutByteLength: z.literal(
    PINNED_EXECUTOR_RUNTIME_STDOUT_BYTE_LENGTH
  ),
  runtimeStdoutSha256: z.literal(PINNED_EXECUTOR_RUNTIME_STDOUT_SHA256),
  creationByteLength: z.literal(PINNED_EXECUTOR_CREATION_BYTE_LENGTH),
  creationSha256: z.literal(PINNED_EXECUTOR_CREATION_SHA256),
  runtimeByteLength: z.literal(PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH),
  runtimeSha256: z.literal(PINNED_EXECUTOR_RUNTIME_SHA256),
  runtimeKeccak256: z.literal(PINNED_EXECUTOR_RUNTIME_KECCAK256),
  immutableLayout: z.literal("none"),
});

const MainnetChainSpecEvidenceSchema = z.strictObject({
  source: VerifiedSourceSchema,
  sourceSha256: z.literal(PINNED_MAINNET_CHAIN_SPEC_SHA256),
  schedule: z.strictObject({
    derivation: z.literal("ethereum_mainnet_timestamp_schedule_v1"),
    osakaActivationTimestamp: z.literal(
      MAINNET_OSAKA_ACTIVATION_TIMESTAMP
    ),
    bpo2ActivationTimestamp: z.literal(MAINNET_BPO2_ACTIVATION_TIMESTAMP),
    bpo2BlobBaseFeeUpdateFraction: z.literal(
      MAINNET_BPO2_BLOB_BASE_FEE_UPDATE_FRACTION.toString()
    ),
    targetBlobsPerBlock: z.literal(14),
    maxBlobsPerBlock: z.literal(21),
  }),
});

const RevmEngineEvidenceSchema = z.strictObject({
  engine: z.literal("revm@34.0.0"),
  explicitSpecSelection: z.literal("SpecId::OSAKA"),
  defaultSpecRejected: z.literal("PRAGUE"),
  producerCargoLockSha256: z.literal(PINNED_REVM_CARGO_LOCK_SHA256),
  crate: z.literal("revm-34.0.0.crate"),
  crateUri: z.literal(
    "https://crates.io/api/v1/crates/revm/34.0.0/download"
  ),
  crateSha256: z.literal(PINNED_REVM_CRATE_SHA256),
  crateHashDerivation: z.literal("sha256_exact_download_bytes"),
  implicitPragueBlobFractionRejected: z.literal("5007716"),
  bpo2FractionOverride: z.literal("11684671"),
  blobEnvironmentInitialization: z.literal(
    "cfg_blob_base_fee_update_fraction_then_block_set_blob_excess_gas_and_price"
  ),
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

const ConfigurationEffectivePositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("start_of_block"),
    blockNumber: zUint,
    blockHash: zNonZeroHash,
  }),
  z.strictObject({
    kind: z.literal("canonical_setter_log"),
    blockNumber: zUint,
    blockHash: zNonZeroHash,
    transactionIndex: zSafeUint,
    logIndex: zSafeUint,
  }),
]);

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
    observedAt: ConfigurationEffectivePositionSchema,
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
  observedAt: ConfigurationEffectivePositionSchema,
  observationSemantics: z.literal("effective_at_event"),
};

const PinnedVoterTraceSchema = z.strictObject({
  traceEvidence: z.discriminatedUnion("sourceKind", [
    z.strictObject({
      sourceKind: z.literal("committed_synthetic_fixture"),
      rpcMethod: z.literal("debug_traceTransaction"),
      tracer: z.literal("callTracer"),
      fixtureMethod: z.literal(
        "committed_synthetic_geth_call_tracer_fixture_v1"
      ),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts"),
      fixtureProjectionSha256: zNonZeroHash,
      clientVersion: z.null(),
      rawTraceSha256: z.null(),
      tracerConfig: z.strictObject({
        onlyTopCall: z.literal(false),
        withLog: z.literal(true),
      }),
      reexec: z.literal(0),
      normalization: z.literal(
        "root_empty_array_then_zero_based_full_call_tree_child_indices"
      ),
    }),
    z.strictObject({
      sourceKind: z.literal("archive_rpc"),
      rpcMethod: z.literal("debug_traceTransaction"),
      tracer: z.literal("callTracer"),
      fixtureMethod: z.null(),
      fixturePath: z.null(),
      fixtureProjectionSha256: z.null(),
      clientVersion: z.string().min(1).max(256),
      rawTraceSha256: zNonZeroHash,
      tracerConfig: z.strictObject({
        onlyTopCall: z.literal(false),
        withLog: z.literal(true),
      }),
      reexec: z.literal(0),
      normalization: z.literal(
        "root_empty_array_then_zero_based_full_call_tree_child_indices"
      ),
    }),
  ]),
  pathSemantics: z.literal("full_call_tree_child_indices"),
  invocationId: z.string().max(512).regex(VOTER_INVOCATION_ID_PATTERN),
  transactionHash: zNonZeroHash,
  voterCallTraceAddress: z.array(zSafeUint).max(64),
  votingCallTraceAddress: z.array(zSafeUint).min(1).max(65),
  voterCallDepth: zSafeUint.max(64),
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
      evidenceKind: z.enum(["archive_rpc", "committed_synthetic_fixture"]),
      rpcMethod: z.literal("eth_getCode").nullable(),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
      fixtureProjectionSha256: zNonZeroHash.nullable(),
      ...RawRpcResultEvidenceShape,
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

const ExecutorOperatorAuthorizationProofSchema = z.strictObject({
  state: z.literal("verified_at_propose_position"),
  executorAddress: zNonZeroAddress,
  votingAddress: zNonZeroAddress,
  blockNumber: zUint,
  blockHash: zNonZeroHash,
  blockHashVerification: z.literal("canonical_hash_at_height"),
  getterSelector: z.literal("0x13e7c9d8"),
  blockEndEvidence: z.strictObject({
    evidenceKind: z.enum(["archive_rpc", "committed_synthetic_fixture"]),
    rpcMethod: z.literal("eth_getStorageAt").nullable(),
    fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
    fixtureProjectionSha256: zNonZeroHash.nullable(),
    ...RawRpcResultEvidenceShape,
    storageLayout: z.strictObject({
      compiler: z.literal("vyper@0.4.2"),
      sourceSha256: z.literal(PINNED_EXECUTOR_SOURCE_SHA256),
      derivation: z.literal(
        "keccak256(bytes32(mapping_base_slot) || bytes32(uint256(voting_address)))"
      ),
      mappingBaseSlot: z.literal(EXECUTOR_OPERATORS_MAPPING_SLOT.toString()),
      mappingKey: zNonZeroAddress,
      mappingHashInputOrder: z.literal("slot_then_key"),
      resolvedStorageSlot: zNonZeroHash,
    }),
    storageWord: zHash,
    decodedAuthorized: z.boolean(),
  }),
  positionReplay: z.strictObject({
    method: z.literal(
      "canonical_executor_set_operator_log_replay_to_propose_position"
    ),
    proposeTransactionIndex: zSafeUint,
    proposeLogIndex: zSafeUint,
    relevantSetterLogCount: zSafeUint.max(100_000),
    appliedThroughProposeLogCount: zSafeUint.max(100_000),
    laterSetterLogCount: z.literal(0),
    relevantSetterLogs: z
      .array(
        z.strictObject({
          blockNumber: zUint,
          blockHash: zNonZeroHash,
          transactionHash: zNonZeroHash,
          transactionIndex: zSafeUint,
          logIndex: zSafeUint,
          emitter: zNonZeroAddress,
          topics: z.tuple([zHash, zHash]),
          data: zHash,
          operatorAddress: zNonZeroAddress,
          authorized: z.boolean(),
        })
      )
      .max(100_000),
    canonicalManifestEncoding: z.literal(
      "canonical_json_utf8_lexicographic_keys_no_whitespace_one_final_lf"
    ),
    canonicalManifestByteLength: zPositiveSafeUint.max(16 * 1024 * 1024),
    canonicalManifestSha256: zNonZeroHash,
    evidenceKind: z.enum(["archive_rpc", "committed_synthetic_fixture"]),
    rpcMethod: z.literal("eth_getLogs").nullable(),
    fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
    fixtureProjectionSha256: zNonZeroHash.nullable(),
    rawLogsSha256: zNonZeroHash.nullable(),
    rawLogsObjectKey: z.string().min(1).max(1_024).nullable(),
    semantics: z.literal(
      "block_end_state_equals_propose_position_only_after_zero_later_relevant_setter_logs"
    ),
  }),
  authorizedAtPropose: z.boolean(),
});

const SimulationCompleteShape = {
  method: z.literal("revm_engine_injected_executor_frame_conditional_origin"),
  engine: z.literal("revm@34.0.0"),
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
    operatorCheckOutcome: z.enum(["passed", "reverted"]),
    scriptEntered: z.boolean(),
    executionResultStage: z.enum([
      "script_completed",
      "executor_script_revert",
      "executor_operator_check_revert",
    ]),
    executorOperatorAuthorization: ExecutorOperatorAuthorizationProofSchema,
    executionInput: z.strictObject({
      functionSignature: z.literal("execute(bytes)"),
      calldata: zSimulationCalldata,
      calldataSha256: zNonZeroHash,
      derivation: z.literal(
        "abi_encode_execute_bytes_from_exact_retained_script"
      ),
    }),
    executorImplementation: z.lazy(() => ExecutorImplementationSchema),
    harness: z.strictObject({
      name: z.literal("gov-apps-stats-revm-frame-injector"),
      revision: z.string().min(1).max(128),
      artifactSha256: zNonZeroHash,
    }),
    gasContext: z.strictObject({
      chainId: zPositiveSafeUint,
      chainSpec: MainnetChainSpecEvidenceSchema,
      engineEvidence: RevmEngineEvidenceSchema,
      blockTimestamp: zUnixSeconds,
      runtimeSpecId: z.literal("OSAKA"),
      runtimeSpecDerivation: z.literal(
        "ethereum_mainnet_timestamp_schedule_v1"
      ),
      runtimeSpecActivationTimestamp: z.literal(1_764_798_551),
      blobScheduleId: z.literal("BPO2"),
      blobScheduleActivationTimestamp: z.literal(1_767_747_671),
      blobBaseFeeUpdateFraction: z.literal("11684671"),
      frameSemantics: z.literal(
        "engine_injected_executor_child_frame_before_first_opcode_after_voting_gate"
      ),
      executorFrameDepth: z.literal(1),
      omittedVotingParentDepth: z.literal(0),
      targetCallDepth: z.literal(2),
      callScheme: z.literal("CALL"),
      injectionPoint: z.literal("before_executor_first_opcode"),
      parentEip150GasDeductionApplied: z.literal(false),
      outerTransactionValidation: z.literal("bypassed"),
      osakaTransactionGasLimitCap: z.literal("16777216"),
      gasScenario: z.literal("non_transactional_gas_overapproximation"),
      resultScope: z.literal(
        "recorded_injected_frame_script_behavior_not_future_execution_feasibility"
      ),
      parentEip150Forwarding: z.literal("not_modeled"),
      beneficiary: zAddress,
      difficulty: z.literal("0"),
      prevRandao: zHash,
      excessBlobGas: zUint,
      blobBaseFeeWei: zPositiveUint,
      blobBaseFeeDerivation: z.literal(
        "revm_context_interface_14_fake_exponential"
      ),
      coinbaseWarm: z.literal(true),
      warmSet: z.strictObject({
        stage: z.literal("immediately_before_executor_first_opcode"),
        warmAddresses: z.array(zAddress).min(18).max(22),
        precompileAddresses: z.array(zAddress).length(18),
        warmStorageKeys: z.tuple([]),
      }),
      derivationPolicy: z.literal(
        "min_propose_block_gas_limit_and_30000000"
      ),
      gasPricePolicy: z.literal("propose_receipt_effective_gas_price"),
      executorFrameGasCap: z.literal("30000000"),
      executorFrameInitialGas: zPositiveU64,
      effectiveGasPriceWei: zUint,
      blockHeader: z.strictObject({
        evidenceKind: z.enum(["archive_rpc", "committed_synthetic_fixture"]),
        rpcMethod: z.literal("eth_getBlockByHash").nullable(),
        fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
        fixtureProjectionSha256: zNonZeroHash.nullable(),
        ...RawRpcResultEvidenceShape,
        blockNumber: zUint,
        blockHash: zNonZeroHash,
        timestamp: zUnixSeconds,
        gasLimit: zPositiveU64,
        baseFeePerGasWei: zPositiveU64,
        beneficiary: zAddress,
        difficulty: z.literal("0"),
        prevRandao: zHash,
        excessBlobGas: zUint,
      }),
      proposeReceipt: z.strictObject({
        evidenceKind: z.enum(["archive_rpc", "committed_synthetic_fixture"]),
        rpcMethod: z.literal("eth_getTransactionReceipt").nullable(),
        fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
        fixtureProjectionSha256: zNonZeroHash.nullable(),
        ...RawRpcResultEvidenceShape,
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
        "osaka_frame_entry_origin_voting_executor_coinbase_precompiles_0x01_through_0x11_and_0x0100_no_storage"
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
    sourceIntegrity: PinnedVoterSourceIntegritySchema,
    compiler: z.literal("vyper@0.4.2"),
    compilerDistribution: PinnedCompilerDistributionSchema,
    optimization: z.literal("gas"),
    evmVersion: z.literal("cancun"),
    buildArtifact: PinnedVoterBuildArtifactSchema,
    runtimeTemplate: PinnedVoterRuntimeTemplateSchema,
    immutableGenesisTimestamp: zUnixSeconds,
    compiledRuntimeBytecodeHash: zNonZeroHash,
    bytecode: z.strictObject({
      evidenceKind: z.enum([
        "archive_rpc_and_reproducible_build",
        "committed_synthetic_fixture_and_reproducible_build",
      ]),
      rpcMethod: z.literal("eth_getCode").nullable(),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
      fixtureProjectionSha256: zNonZeroHash.nullable(),
      ...RawRpcResultEvidenceShape,
      hashMethod: z.literal("keccak256"),
      address: zNonZeroAddress,
      blockNumber: zUint,
      blockHash: zNonZeroHash,
      codeByteLength: z.literal(PINNED_VOTER_DEPLOYED_RUNTIME_BYTE_LENGTH),
      deployedBytecodeHash: zNonZeroHash,
      deployedRuntimeSha256: zNonZeroHash,
      buildArtifactSha256: z.literal(
        PINNED_VOTER_CREATION_BYTECODE_STDOUT_SHA256
      ),
      buildEvidenceSha256: zNonZeroHash,
      constructorGenesisTimestamp: zUnixSeconds,
      immutableGenesisWord: zNonZeroHash,
      runtimeDerivation: z.literal(
        "compiled_runtime_template_append_abi_uint256_genesis"
      ),
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
    sourceIntegrity: z.null(),
    compiler: z.null(),
    compilerDistribution: z.null(),
    optimization: z.null(),
    evmVersion: z.null(),
    buildArtifact: z.null(),
    runtimeTemplate: z.null(),
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
    sourceIntegrity: z.null(),
    compiler: z.null(),
    compilerDistribution: z.null(),
    optimization: z.null(),
    evmVersion: z.null(),
    buildArtifact: z.null(),
    runtimeTemplate: z.null(),
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
    sourceIntegrity: PinnedExecutorSourceIntegritySchema,
    compiler: z.literal("vyper@0.4.2"),
    compilerDistribution: PinnedCompilerDistributionSchema,
    optimization: z.literal("gas"),
    evmVersion: z.literal("cancun"),
    experimentalCodegen: z.literal(false),
    buildArtifact: PinnedExecutorBuildArtifactSchema,
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
      evidenceKind: z.enum([
        "archive_rpc_and_reproducible_build",
        "committed_synthetic_fixture_and_reproducible_build",
      ]),
      rpcMethod: z.literal("eth_getCode").nullable(),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
      fixtureProjectionSha256: zNonZeroHash.nullable(),
      ...RawRpcResultEvidenceShape,
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
    sourceIntegrity: z.null(),
    compiler: z.null(),
    compilerDistribution: z.null(),
    optimization: z.null(),
    evmVersion: z.null(),
    experimentalCodegen: z.null(),
    buildArtifact: z.null(),
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
    sourceIntegrity: z.null(),
    compiler: z.null(),
    compilerDistribution: z.null(),
    optimization: z.null(),
    evmVersion: z.null(),
    experimentalCodegen: z.null(),
    buildArtifact: z.null(),
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
  voterDecayLengthSeconds: zSafeUint.max(
    DAO_FEED_EPOCH_LENGTH_SECONDS / 2 - 1
  ),
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

const ConfigurationSetterLogBaseShape = {
  emitter: zNonZeroAddress,
  logIndex: zSafeUint,
  topics: z.array(zHash).min(1).max(2),
  data: zBytes,
  matchingLogCount: z.literal(1),
  canonicalReencodingMatched: z.literal(true),
};

const ConfigurationSetterCallBaseShape = {
  target: zNonZeroAddress,
  sourceContract: z.enum(["Voting", "Voter"]),
  caller: zNonZeroAddress,
  traceAddress: z.array(zSafeUint).max(64),
  calldata: zBytes,
  result: z.literal("success"),
};

const ConfigurationSetterCallSchema = z.discriminatedUnion("setter", [
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_propose_parameters"),
    selector: z.literal(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setProposeParameters
    ),
    arguments: z.strictObject({
      minWeight: zUint256,
      cooldownSeconds: zUint256,
      blacklistAddress: zNonZeroAddress,
    }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({
        minWeight: zUint256,
        cooldownSeconds: zUint256,
        blacklistAddress: zNonZeroAddress,
      }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_vote_parameters"),
    selector: z.literal(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setVoteParameters
    ),
    arguments: z.strictObject({
      votingPeriodSeconds: zSafeUint.max(
        DAO_FEED_EPOCH_LENGTH_SECONDS
      ),
      voterAddress: zAddress,
    }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({
        votingPeriodSeconds: zSafeUint.max(
          DAO_FEED_EPOCH_LENGTH_SECONDS
        ),
        voterAddress: zAddress,
      }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_execute_parameters"),
    selector: z.literal(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setExecuteParameters
    ),
    arguments: z.strictObject({
      executionDelaySeconds: zSafeUint.max(
        DAO_FEED_EPOCH_LENGTH_SECONDS - 1
      ),
      executionGuard: z.enum(["guarded", "permissionless"]),
      executorAddress: zNonZeroAddress,
    }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({
        executionDelaySeconds: zSafeUint.max(
          DAO_FEED_EPOCH_LENGTH_SECONDS - 1
        ),
        executionGuard: z.enum(["guarded", "permissionless"]),
        executorAddress: zNonZeroAddress,
      }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_hooks"),
    selector: z.literal(DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setHooks),
    arguments: z.strictObject({ hooksAddress: zAddress }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({ hooksAddress: zAddress }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_weight_measure"),
    selector: z.literal(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setWeightMeasure
    ),
    arguments: z.strictObject({ measureAddress: zAddress }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({ measureAddress: zAddress }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_operator"),
    selector: z.literal(DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setOperator),
    arguments: z.strictObject({ operatorAddress: zAddress }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({ operatorAddress: zAddress }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("accept_guardian"),
    selector: z.literal(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.acceptGuardian
    ),
    arguments: z.strictObject({}),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({ guardianAddress: zNonZeroAddress }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_decay_length"),
    selector: z.literal(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setDecayLength
    ),
    arguments: z.strictObject({
      voterDecayLengthSeconds: zSafeUint.max(
        DAO_FEED_EPOCH_LENGTH_SECONDS / 2 - 1
      ),
    }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({
        voterDecayLengthSeconds: zSafeUint.max(
          DAO_FEED_EPOCH_LENGTH_SECONDS / 2 - 1
        ),
      }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_delegated_staking"),
    selector: z.literal(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setDelegatedStaking
    ),
    arguments: z.strictObject({ delegatedStakingAddress: zAddress }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({ delegatedStakingAddress: zAddress }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_ybc"),
    selector: z.literal(DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setYbc),
    arguments: z.strictObject({ ybcAddress: zAddress }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({ ybcAddress: zAddress }),
    }),
  }),
  z.strictObject({
    ...ConfigurationSetterCallBaseShape,
    setter: z.literal("set_ybc_weight_aggregator"),
    selector: z.literal(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setYbcWeightAggregator
    ),
    arguments: z.strictObject({ ybcWeightAggregatorAddress: zAddress }),
    log: z.strictObject({
      ...ConfigurationSetterLogBaseShape,
      decoded: z.strictObject({ ybcWeightAggregatorAddress: zAddress }),
    }),
  }),
]);

const ConfigurationSetterTraceEvidenceSchema = z.discriminatedUnion(
  "sourceKind",
  [
    z.strictObject({
      sourceKind: z.literal("committed_synthetic_fixture"),
      rpcMethod: z.literal("debug_traceTransaction"),
      tracer: z.literal("callTracer"),
      fixtureMethod: z.literal(
        "committed_synthetic_configuration_setter_trace_fixture_v1"
      ),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts"),
      fixtureProjectionSha256: zNonZeroHash,
      clientVersion: z.null(),
      rawTraceSha256: z.null(),
      tracerConfig: z.strictObject({
        onlyTopCall: z.literal(false),
        withLog: z.literal(true),
      }),
      reexec: z.literal(0),
      normalization: z.literal(
        "root_empty_array_then_zero_based_full_call_tree_child_indices"
      ),
    }),
    z.strictObject({
      sourceKind: z.literal("archive_rpc"),
      rpcMethod: z.literal("debug_traceTransaction"),
      tracer: z.literal("callTracer"),
      fixtureMethod: z.null(),
      fixturePath: z.null(),
      fixtureProjectionSha256: z.null(),
      clientVersion: z.string().min(1).max(256),
      rawTraceSha256: zNonZeroHash,
      tracerConfig: z.strictObject({
        onlyTopCall: z.literal(false),
        withLog: z.literal(true),
      }),
      reexec: z.literal(0),
      normalization: z.literal(
        "root_empty_array_then_zero_based_full_call_tree_child_indices"
      ),
    }),
  ]
);

const ConfigurationBootstrapEvidenceCommonShape = {
  parentBlockNumber: zUint,
  parentBlockHash: zNonZeroHash,
  statePosition: z.literal("end_of_parent_block_for_start_of_next_block"),
  configurationValuesSha256: zNonZeroHash,
};

const ConfigurationBootstrapTrackedSetterLogSchema = z.strictObject({
  blockNumber: zUint,
  blockHash: zNonZeroHash,
  blockTimestamp: zUnixSeconds.nullable(),
  transactionHash: zNonZeroHash,
  transactionSender: zNonZeroAddress,
  transactionIndex: zSafeUint,
  receiptStatus: z.literal("success"),
  call: ConfigurationSetterCallSchema,
});

const ConfigurationSetterTransactionEvidenceSchema = z.discriminatedUnion(
  "sourceKind",
  [
    z.strictObject({
      sourceKind: z.literal("committed_synthetic_fixture"),
      projectionKind: z.enum([
        "bootstrap_configuration_setter_transaction",
        "preconfigured_voter_setter_transaction",
      ]),
      transactionHash: zNonZeroHash,
      transactionSender: zNonZeroAddress,
      blockNumber: zUint,
      blockHash: zNonZeroHash,
      transactionIndex: zSafeUint,
      receiptStatus: z.literal("success"),
      retainedSetterCallCount: zPositiveSafeUint.max(64),
      retainedSetterLogIndices: z.array(zSafeUint).min(1).max(64),
      transactionRpcMethod: z.literal("eth_getTransactionByHash"),
      receiptRpcMethod: z.literal("eth_getTransactionReceipt"),
      traceRpcMethod: z.literal("debug_traceTransaction"),
      tracer: z.literal("callTracer"),
      tracerConfig: z.strictObject({
        onlyTopCall: z.literal(false),
        withLog: z.literal(true),
      }),
      reexec: z.literal(0),
      normalization: z.literal(
        "root_empty_array_then_zero_based_full_call_tree_child_indices"
      ),
      fixtureMethod: z.literal(
        "committed_synthetic_configuration_setter_transaction_fixture_v1"
      ),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts"),
      fixtureProjectionSha256: zNonZeroHash,
      clientVersion: z.null(),
      rawTransactionSha256: z.null(),
      rawReceiptSha256: z.null(),
      rawTraceSha256: z.null(),
      transactionObjectKey: z.null(),
      receiptObjectKey: z.null(),
      traceObjectKey: z.null(),
    }),
    z.strictObject({
      sourceKind: z.literal("archive_rpc"),
      projectionKind: z.enum([
        "bootstrap_configuration_setter_transaction",
        "preconfigured_voter_setter_transaction",
      ]),
      transactionHash: zNonZeroHash,
      transactionSender: zNonZeroAddress,
      blockNumber: zUint,
      blockHash: zNonZeroHash,
      transactionIndex: zSafeUint,
      receiptStatus: z.literal("success"),
      retainedSetterCallCount: zPositiveSafeUint.max(64),
      retainedSetterLogIndices: z.array(zSafeUint).min(1).max(64),
      transactionRpcMethod: z.literal("eth_getTransactionByHash"),
      receiptRpcMethod: z.literal("eth_getTransactionReceipt"),
      traceRpcMethod: z.literal("debug_traceTransaction"),
      tracer: z.literal("callTracer"),
      tracerConfig: z.strictObject({
        onlyTopCall: z.literal(false),
        withLog: z.literal(true),
      }),
      reexec: z.literal(0),
      normalization: z.literal(
        "root_empty_array_then_zero_based_full_call_tree_child_indices"
      ),
      fixtureMethod: z.null(),
      fixturePath: z.null(),
      fixtureProjectionSha256: z.null(),
      clientVersion: z.string().min(1).max(256),
      rawTransactionSha256: zNonZeroHash,
      rawReceiptSha256: zNonZeroHash,
      rawTraceSha256: zNonZeroHash,
      transactionObjectKey: z.string().min(1).max(1_024),
      receiptObjectKey: z.string().min(1).max(1_024),
      traceObjectKey: z.string().min(1).max(1_024),
    }),
  ]
);

const VoterCodeBirthEvidenceSchema = z.discriminatedUnion("evidenceKind", [
  z.strictObject({
    evidenceKind: z.literal("committed_synthetic_fixture"),
    address: zNonZeroAddress,
    deploymentBlockNumber: zUint,
    deploymentBlockHash: zNonZeroHash,
    deploymentTransactionHash: zNonZeroHash,
    deploymentTransactionIndex: zSafeUint,
    receiptStatus: z.literal("success"),
    receiptContractAddress: zNonZeroAddress,
    previousBlockNumber: zUint,
    previousBlockHash: zNonZeroHash,
    previousCodeByteLength: z.literal(0),
    deployedCodeByteLength: z.literal(
      PINNED_VOTER_DEPLOYED_RUNTIME_BYTE_LENGTH
    ),
    deployedBytecodeHash: zNonZeroHash,
    deployedRuntimeSha256: zNonZeroHash,
    rpcMethods: z.null(),
    fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts"),
    fixtureProjectionSha256: zNonZeroHash,
    rawReceiptSha256: z.null(),
    rawPreviousCodeSha256: z.null(),
    rawDeployedCodeSha256: z.null(),
    receiptObjectKey: z.null(),
    previousCodeObjectKey: z.null(),
    deployedCodeObjectKey: z.null(),
  }),
  z.strictObject({
    evidenceKind: z.literal("archive_rpc"),
    address: zNonZeroAddress,
    deploymentBlockNumber: zUint,
    deploymentBlockHash: zNonZeroHash,
    deploymentTransactionHash: zNonZeroHash,
    deploymentTransactionIndex: zSafeUint,
    receiptStatus: z.literal("success"),
    receiptContractAddress: zNonZeroAddress,
    previousBlockNumber: zUint,
    previousBlockHash: zNonZeroHash,
    previousCodeByteLength: z.literal(0),
    deployedCodeByteLength: z.literal(
      PINNED_VOTER_DEPLOYED_RUNTIME_BYTE_LENGTH
    ),
    deployedBytecodeHash: zNonZeroHash,
    deployedRuntimeSha256: zNonZeroHash,
    rpcMethods: z.tuple([
      z.literal("eth_getTransactionReceipt"),
      z.literal("eth_getCode"),
    ]),
    fixturePath: z.null(),
    fixtureProjectionSha256: z.null(),
    rawReceiptSha256: zNonZeroHash,
    rawPreviousCodeSha256: zNonZeroHash,
    rawDeployedCodeSha256: zNonZeroHash,
    receiptObjectKey: z.string().min(1).max(1_024),
    previousCodeObjectKey: z.string().min(1).max(1_024),
    deployedCodeObjectKey: z.string().min(1).max(1_024),
  }),
]);

const ConfigurationBootstrapEvidenceSchema = z.discriminatedUnion(
  "evidenceKind",
  [
    z.strictObject({
      evidenceKind: z.literal("archive_rpc"),
      rpcMethods: z.tuple([
        z.literal("eth_call"),
        z.literal("eth_getCode"),
      ]),
      fixturePath: z.null(),
      fixtureProjectionSha256: z.null(),
      ...ConfigurationBootstrapEvidenceCommonShape,
    }),
    z.strictObject({
      evidenceKind: z.literal("committed_synthetic_fixture"),
      rpcMethods: z.null(),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts"),
      fixtureProjectionSha256: zNonZeroHash,
      ...ConfigurationBootstrapEvidenceCommonShape,
    }),
  ]
);

const ConfigurationBootstrapScanManifestCommonShape = {
  fromBlockNumber: zUint,
  toBlockNumber: zUint,
  toBlockHash: zNonZeroHash,
  coveredBlocks: z.array(NullableBlockTimeSchema).min(1).max(100_000),
  votingAddress: zNonZeroAddress,
  lifecycleLogCount: z.literal(0),
  trackedSetterLogCount: zSafeUint.max(100_000),
  trackedSetterLogs: z
    .array(ConfigurationBootstrapTrackedSetterLogSchema)
    .max(100_000),
  transactionEvidence: z
    .array(ConfigurationSetterTransactionEvidenceSchema)
    .max(100_000),
  canonicalManifestEncoding: z.literal(
    "canonical_json_utf8_lexicographic_keys_no_whitespace_one_final_lf"
  ),
  canonicalManifestByteLength: zPositiveSafeUint.max(16 * 1024 * 1024),
  canonicalManifestSha256: zNonZeroHash,
  replayedConfigurationValuesSha256: zNonZeroHash,
  coverage: z.literal(
    "contract_creation_through_end_of_parent_block_inclusive"
  ),
  replaySemantics: z.literal(
    "canonical_tracked_setter_log_replay_equals_start_state_snapshot"
  ),
};

const ConfigurationVoterTargetStateEvidenceSchema = z.discriminatedUnion(
  "state",
  [
    z.strictObject({
      state: z.literal("inherited_unchanged_pointer"),
      voterAddress: zAddress,
      priorConfigurationId: z.string().regex(CONFIGURATION_ID_PATTERN),
      semantics: z.literal(
        "prior_nested_state_with_no_voter_setter_in_boundary_row"
      ),
    }),
    z.strictObject({
      state: z.literal("same_pointer_prior_state_plus_row_setter_replay"),
      voterAddress: zAddress,
      priorConfigurationId: z.string().regex(CONFIGURATION_ID_PATTERN),
      semantics: z.literal(
        "prior_nested_state_then_canonical_same_pointer_row_setters"
      ),
    }),
    z.strictObject({
      state: z.literal("established_by_post_pointer_setters"),
      voterAddress: zNonZeroAddress,
      pointerSetterLogIndex: zSafeUint,
      decayLengthSetterLogIndex: zSafeUint,
      delegatedStakingSetterLogIndex: zSafeUint,
      ybcSetterLogIndex: zSafeUint,
      ybcWeightAggregatorSetterLogIndex: zSafeUint,
      semantics: z.literal(
        "all_nested_voter_values_established_after_pointer_setter"
      ),
    }),
    z.strictObject({
      state: z.literal("disabled_zero_pointer"),
      voterAddress: z.literal(ZERO_ADDRESS),
      pointerSetterLogIndex: zSafeUint,
      nestedState: z.literal(
        "not_applicable_canonical_zero_addresses_and_zero_decay"
      ),
    }),
    z.strictObject({
      state: z.literal("authenticated_preconfigured_voter_state"),
      voterAddress: zNonZeroAddress,
      blockNumber: zUint,
      blockHash: zNonZeroHash,
      transactionIndex: zSafeUint,
      logIndex: zSafeUint,
      statePosition: z.literal(
        "exact_boundary_from_block_end_state_and_zero_later_same_block_setters"
      ),
      values: z.strictObject({
        voterDecayLengthSeconds: zSafeUint.max(
          DAO_FEED_EPOCH_LENGTH_SECONDS / 2 - 1
        ),
        delegatedStakingAddress: zAddress,
        ybcAddress: zAddress,
        ybcWeightAggregatorAddress: zAddress,
      }),
      valuesSha256: zNonZeroHash,
      codeBirthEvidence: VoterCodeBirthEvidenceSchema,
      historyFromBlockNumber: zUint,
      historyToBlockNumber: zUint,
      historyToBlockHash: zNonZeroHash,
      historicalSetterLogCount: zSafeUint.max(100_000),
      historicalSetterManifestEncoding: z.literal(
        "canonical_json_utf8_lexicographic_keys_no_whitespace_one_final_lf"
      ),
      historicalSetterManifestByteLength: zPositiveSafeUint.max(
        16 * 1024 * 1024
      ),
      historicalSetterManifestSha256: zNonZeroHash,
      historicalSetterLogs: z
        .array(ConfigurationBootstrapTrackedSetterLogSchema)
        .max(100_000),
      transactionEvidence: z
        .array(ConfigurationSetterTransactionEvidenceSchema)
        .max(100_000),
      laterSameBlockRelevantSetterLogCount: z.literal(0),
      evidenceKind: z.enum([
        "archive_rpc",
        "committed_synthetic_fixture",
      ]),
      rpcMethods: z
        .tuple([z.literal("eth_call"), z.literal("eth_getLogs")])
        .nullable(),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
      fixtureProjectionSha256: zNonZeroHash.nullable(),
      rawLogsSha256: zNonZeroHash.nullable(),
      manifestObjectKey: z.string().min(1).max(1_024).nullable(),
    }),
  ]
);

const ConfigurationSetterStateEvidenceCommonShape = {
  blockNumber: zUint,
  blockHash: zNonZeroHash,
  transactionIndex: zSafeUint,
  logIndex: zSafeUint,
  statePosition: z.literal("immediately_after_final_canonical_setter_log"),
  configurationValuesSha256: zNonZeroHash,
  trackedSetterHistoryLogCount: zSafeUint.max(100_000),
  trackedSetterHistoryManifestSha256: zNonZeroHash,
  voterTargetStateEvidence: ConfigurationVoterTargetStateEvidenceSchema,
  replayCoverage: z.literal(
    "voting_creation_and_effective_voter_history_through_final_setter_log"
  ),
  replaySemantics: z.literal(
    "canonical_voting_and_effective_voter_setter_replay_equals_configuration"
  ),
};

const ConfigurationSetterStateEvidenceSchema = z.discriminatedUnion(
  "evidenceKind",
  [
    z.strictObject({
      evidenceKind: z.literal("archive_rpc"),
      rpcMethods: z.tuple([z.literal("eth_call"), z.literal("eth_getCode")]),
      fixturePath: z.null(),
      fixtureProjectionSha256: z.null(),
      manifestObjectKey: z.string().min(1).max(1_024),
      ...ConfigurationSetterStateEvidenceCommonShape,
    }),
    z.strictObject({
      evidenceKind: z.literal("committed_synthetic_fixture"),
      rpcMethods: z.null(),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts"),
      fixtureProjectionSha256: zNonZeroHash,
      manifestObjectKey: z.null(),
      ...ConfigurationSetterStateEvidenceCommonShape,
    }),
  ]
);

const ConfigurationBootstrapScanManifestSchema = z.discriminatedUnion(
  "evidenceKind",
  [
    z.strictObject({
      evidenceKind: z.literal("archive_rpc"),
      rpcMethod: z.literal("eth_getLogs"),
      fixturePath: z.null(),
      fixtureProjectionSha256: z.null(),
      manifestObjectKey: z.string().min(1).max(1_024),
      ...ConfigurationBootstrapScanManifestCommonShape,
    }),
    z.strictObject({
      evidenceKind: z.literal("committed_synthetic_fixture"),
      rpcMethod: z.null(),
      fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts"),
      fixtureProjectionSha256: zNonZeroHash,
      manifestObjectKey: z.null(),
      ...ConfigurationBootstrapScanManifestCommonShape,
    }),
  ]
);

const ConfigurationBoundarySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("producer_start_state_snapshot_sentinel"),
    positionSemantics: z.literal(
      "logical_start_of_scan_after_authenticated_prestart_setter_replay"
    ),
    stateSnapshot: ConfigurationBootstrapEvidenceSchema,
    scanManifest: ConfigurationBootstrapScanManifestSchema,
    effectiveness: z.literal(
      "effective_for_all_included_positions_at_or_after_producer_start"
    ),
    setterCalls: z.tuple([]),
  }),
  z.strictObject({
    kind: z.literal("setter_trace_observation"),
    positionSemantics: z.literal(
      "last_canonical_setter_log_after_successful_setter_calls"
    ),
    receipt: z.strictObject({
      status: z.literal("success"),
      transactionHash: zNonZeroHash,
      transactionSender: zNonZeroAddress,
      blockNumber: zUint,
      blockHash: zNonZeroHash,
      blockTimestamp: zUnixSeconds.nullable(),
      transactionIndex: zSafeUint,
      totalMatchingSetterLogCount: zPositiveSafeUint.max(64),
      retainedBoundarySetterLogCount: zPositiveSafeUint.max(64),
    }),
    traceEvidence: ConfigurationSetterTraceEvidenceSchema,
    stateSnapshot: ConfigurationSetterStateEvidenceSchema,
    effectiveness: z.literal(
      "effective_at_and_after_last_canonical_setter_log"
    ),
    setterCalls: z.array(ConfigurationSetterCallSchema).min(1).max(64),
  }),
]);

const HistoricalConfigurationSchema = z.strictObject({
  ...HistoricalConfigurationValuesShape,
  effectiveAt: ConfigurationEffectivePositionSchema,
  boundary: ConfigurationBoundarySchema,
  source: VerifiedSourceSchema,
});

const MutableConfigurationSchema = z.strictObject({
  ...HistoricalConfigurationValuesShape,
  observedAt: ConfigurationEffectivePositionSchema,
  observationSemantics: z.literal("effective_at_propose_event"),
  valuesAreSnapshotted: z.literal(false),
});

const ProposalThresholdEvidenceSchema = z.strictObject({
  state: z.literal("verified_stored_proposal_threshold"),
  source: VerifiedSourceSchema,
  evidenceKind: z.enum(["archive_rpc", "committed_synthetic_fixture"]),
  rpcMethod: z.literal("eth_getStorageAt").nullable(),
  fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
  fixtureProjectionSha256: zNonZeroHash.nullable(),
  ...RawRpcResultEvidenceShape,
  votingAddress: zNonZeroAddress,
  proposalId: zUint,
  blockNumber: zUint,
  blockHash: zNonZeroHash,
  blockHashVerification: z.literal("canonical_hash_at_height"),
  storageLayout: z.strictObject({
    compiler: z.literal("vyper@0.4.2"),
    sourceSha256: z.literal(PINNED_VOTING_SOURCE_SHA256),
    layoutArtifactSha256: z.literal(PINNED_VOTING_LAYOUT_SHA256),
    derivation: z.literal(
      "keccak256(bytes32(mapping_base_slot) || bytes32(proposal_id)) + threshold_field_slot_offset"
    ),
    mappingBaseSlot: z.literal(VOTING_PROPOSALS_MAPPING_SLOT.toString()),
    mappingKey: zUint,
    mappingHashInputOrder: z.literal("slot_then_key"),
    proposalStorageBaseSlot: zNonZeroHash,
    thresholdFieldSlotOffset: z.literal(
      Number(VOTING_PROPOSAL_THRESHOLD_SLOT_OFFSET)
    ),
    resolvedStorageSlot: zNonZeroHash,
  }),
  storageWord: zHash,
  decodedThresholdBps: z.number().int().min(0).max(DAO_BPS),
});

const ProposalRulesSchema = z.strictObject({
  approvalThresholdBps: z.number().int().min(0).max(DAO_BPS),
  thresholdSnapshottedAtCreation: z.literal(true),
  thresholdEvidence: ProposalThresholdEvidenceSchema,
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
  effectiveAt: ConfigurationEffectivePositionSchema,
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
  z.strictObject({
    state: z.literal("recovered_before_first_stable_snapshot"),
    replayFromBlock: zUint,
    commonAncestor: NullableBlockTimeSchema,
    replacedSnapshotId: z.null(),
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
    z.strictObject({
      state: z.literal("succeeded_after_bootstrap_retry"),
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
    transactionHash: zNonZeroHash,
    transactionSender: zNonZeroAddress,
    blockNumber: zUint,
    blockHash: zNonZeroHash,
    transactionIndex: zSafeUint,
    matchingProposeLogCount: z.literal(1),
    evidenceKind: z.enum(["archive_rpc", "committed_synthetic_fixture"]),
    rpcMethod: z.literal("eth_getTransactionReceipt").nullable(),
    fixturePath: z.literal("tests/fixtures/dao-feed-v1.ts").nullable(),
    fixtureProjectionSha256: zNonZeroHash.nullable(),
    ...RawRpcResultEvidenceShape,
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

export function deriveDaoVoterTraceProjectionSha256(input: {
  transactionHash: Hex;
  voterCallTraceAddress: readonly number[];
  voterSelector: "0x69586e2e" | "0xff855dde";
  voterCaller: Address;
  votingTarget: Address;
  proposalId: string;
  ybcMembership: boolean;
  aggregatePathExecuted: boolean;
  aggregatorResult:
    | { state: "skipped_non_member"; weight: null }
    | { state: "returned_zero"; weight: "0" }
    | { state: "returned_positive"; weight: string };
}): Hex {
  return sha256(
    new TextEncoder().encode(
      JSON.stringify({
        schema: "yearn.dao.synthetic-geth-call-tracer-projection.v1",
        rpcMethod: "debug_traceTransaction",
        tracer: "callTracer",
        tracerConfig: { onlyTopCall: false, withLog: true },
        reexec: 0,
        normalization:
          "root_empty_array_then_zero_based_full_call_tree_child_indices",
        transactionHash: input.transactionHash,
        voterCallTraceAddress: input.voterCallTraceAddress,
        voterSelector: input.voterSelector,
        voterCaller: input.voterCaller,
        votingTarget: input.votingTarget,
        proposalId: input.proposalId,
        ybcMembership: input.ybcMembership,
        aggregatePathExecuted: input.aggregatePathExecuted,
        aggregatorResult: input.aggregatorResult,
      })
    )
  );
}

export function deriveDaoSyntheticEvidenceSha256(
  evidenceType: string,
  payload: unknown
): Hex {
  return sha256(
    new TextEncoder().encode(
      JSON.stringify({
        schema: "yearn.dao.committed-synthetic-evidence.v1",
        fixturePath: "tests/fixtures/dao-feed-v1.ts",
        evidenceType,
        payload,
      })
    )
  );
}

export function deriveDaoCreationStageReceiptProjectionSha256(input: {
  transactionHash: Hex;
  transactionSender: Address;
  blockNumber: string;
  blockHash: Hex;
  transactionIndex: number;
  status: "success";
  matchingProposeLogCount: 1;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "creation_stage_eth_getTransactionReceipt_projection",
    {
      transactionHash: input.transactionHash,
      transactionSender: input.transactionSender,
      blockNumber: input.blockNumber,
      blockHash: input.blockHash,
      transactionIndex: input.transactionIndex,
      status: input.status,
      matchingProposeLogCount: input.matchingProposeLogCount,
    }
  );
}

export function deriveDaoExecutorExecuteCalldata(script: Hex): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "execute",
        stateMutability: "nonpayable",
        inputs: [{ name: "script", type: "bytes" }],
        outputs: [],
      },
    ] as const,
    functionName: "execute",
    args: [script],
  });
}

function encodeUint256Word(value: bigint): Hex {
  if (value < 0n || value > (1n << 256n) - 1n) {
    throw new RangeError("Value is outside uint256.");
  }
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function deriveExpectedOsakaWarmAddresses(input: {
  transactionOrigin: Address;
  votingAddress: Address;
  executorAddress: Address;
  beneficiary: Address;
}): Address[] {
  return [
    input.transactionOrigin,
    input.votingAddress,
    input.executorAddress,
    input.beneficiary,
    ...OSAKA_PRECOMPILE_ADDRESSES,
  ]
    .map((address) => address.toLowerCase() as Address)
    .filter((address, index, values) => values.indexOf(address) === index)
    .sort();
}

export function deriveDaoSimulationContextInputsSha256(input: {
  chainId: number;
  blockNumber: string;
  blockHash: Hex;
  blockTimestamp: number;
  blockGasLimit: string;
  blockBaseFeePerGasWei: string;
  blockBeneficiary: Address;
  blockPrevRandao: Hex;
  blockExcessBlobGas: string;
  blobBaseFeeWei: string;
  blockHeaderEvidenceKind: "archive_rpc" | "committed_synthetic_fixture";
  blockHeaderFixtureProjectionSha256: Hex | null;
  blockHeaderRawResultSha256: Hex | null;
  blockHeaderRawResultObjectKey: string | null;
  proposeTransactionHash: Hex;
  proposeTransactionSender: Address;
  proposeReceiptBlockNumber: string;
  proposeReceiptBlockHash: Hex;
  proposeReceiptEffectiveGasPriceWei: string;
  proposeReceiptEvidenceKind: "archive_rpc" | "committed_synthetic_fixture";
  proposeReceiptFixtureProjectionSha256: Hex | null;
  proposeReceiptRawResultSha256: Hex | null;
  proposeReceiptRawResultObjectKey: string | null;
  transactionOrigin: Address;
  votingCaller: Address;
  executorAddress: Address;
  executorCaller: Address;
  executorCodeAddress: Address;
  targetCaller: Address;
  harnessRevision: string;
  harnessArtifactSha256: Hex;
  scriptHash: Hex;
  executeCalldataSha256: Hex;
  executorSourceRevision: string;
  executorSourcePath: string;
  executorSourceSha256: Hex;
  executorRuntimeByteLength: number;
  executorRuntimeBytecodeHash: Hex;
  executorRuntimeArtifactSha256: Hex;
  executorEvidenceAddress: Address;
  executorEvidenceBlockNumber: string;
  executorEvidenceBlockHash: Hex;
  executorEvidenceCodeByteLength: number;
  executorEvidenceDeployedBytecodeHash: Hex;
  executorEvidenceKind:
    | "archive_rpc_and_reproducible_build"
    | "committed_synthetic_fixture_and_reproducible_build";
  executorEvidenceFixtureProjectionSha256: Hex | null;
  executorEvidenceRawResultSha256: Hex | null;
  executorEvidenceRawResultObjectKey: string | null;
  executorOperatorStorageSlot: Hex;
  executorOperatorBlockEndStorageWord: Hex;
  executorOperatorAuthorizedAtPropose: boolean;
  executorOperatorBlockEndEvidenceKind:
    | "archive_rpc"
    | "committed_synthetic_fixture";
  executorOperatorBlockEndFixtureProjectionSha256: Hex | null;
  executorOperatorBlockEndRawResultSha256: Hex | null;
  executorOperatorBlockEndRawResultObjectKey: string | null;
  executorOperatorReplayManifestSha256: Hex;
  executorOperatorReplayRelevantSetterLogCount: number;
  executorOperatorReplayAppliedSetterLogCount: number;
  executorOperatorReplayEvidenceKind:
    | "archive_rpc"
    | "committed_synthetic_fixture";
  executorOperatorReplayFixtureProjectionSha256: Hex | null;
  executorOperatorReplayRawLogsSha256: Hex | null;
  executorOperatorReplayRawLogsObjectKey: string | null;
  executorFrameInitialGas: string;
  effectiveGasPriceWei: string;
  overrideVotingAddress: Address;
  overrideProposalId: string;
  overrideResolvedStorageSlot: Hex;
  overridePreStorageWord: Hex;
  overridePostStorageWord: Hex;
  overrideVotingCodeHash: Hex;
  overrideVotingEvidenceKind: "archive_rpc" | "committed_synthetic_fixture";
  overrideVotingFixtureProjectionSha256: Hex | null;
  overrideVotingRawResultSha256: Hex | null;
  overrideVotingRawResultObjectKey: string | null;
}): Hex {
  const warmAddresses = deriveExpectedOsakaWarmAddresses({
    transactionOrigin: input.transactionOrigin,
    votingAddress: input.votingCaller,
    executorAddress: input.executorAddress,
    beneficiary: input.blockBeneficiary,
  });
  const canonicalInputs = JSON.stringify({
    schema: "yearn.dao.simulation-context-inputs.v4",
    chainId: input.chainId,
    blockNumber: input.blockNumber,
    blockHash: input.blockHash,
    blockTimestamp: input.blockTimestamp,
    blockGasLimit: input.blockGasLimit,
    blockBaseFeePerGasWei: input.blockBaseFeePerGasWei,
    blockBeneficiary: input.blockBeneficiary,
    blockDifficulty: "0",
    blockPrevRandao: input.blockPrevRandao,
    blockExcessBlobGas: input.blockExcessBlobGas,
    blobBaseFeeWei: input.blobBaseFeeWei,
    blobBaseFeeDerivation: "revm_context_interface_14_fake_exponential",
    blobScheduleId: "BPO2",
    blobBaseFeeUpdateFraction:
      MAINNET_BPO2_BLOB_BASE_FEE_UPDATE_FRACTION.toString(),
    blockHeaderEvidenceKind: input.blockHeaderEvidenceKind,
    blockHeaderRpcMethod:
      input.blockHeaderEvidenceKind === "archive_rpc"
        ? "eth_getBlockByHash"
        : null,
    blockHeaderFixtureProjectionSha256:
      input.blockHeaderFixtureProjectionSha256,
    blockHeaderRawResultSha256: input.blockHeaderRawResultSha256,
    blockHeaderRawResultObjectKey: input.blockHeaderRawResultObjectKey,
    chainSpecRepository: PINNED_MAINNET_CHAIN_SPEC.repository,
    chainSpecRevision: PINNED_MAINNET_CHAIN_SPEC.revision,
    chainSpecPath: PINNED_MAINNET_CHAIN_SPEC.sourcePath,
    chainSpecSha256: PINNED_MAINNET_CHAIN_SPEC_SHA256,
    runtimeSpecId: "OSAKA",
    runtimeSpecActivationTimestamp: MAINNET_OSAKA_ACTIVATION_TIMESTAMP,
    runtimeSpecDerivation: "ethereum_mainnet_timestamp_schedule_v1",
    blobScheduleActivationTimestamp: MAINNET_BPO2_ACTIVATION_TIMESTAMP,
    targetBlobsPerBlock: 14,
    maxBlobsPerBlock: 21,
    engine: "revm@34.0.0",
    engineExplicitSpecSelection: "SpecId::OSAKA",
    producerCargoLockSha256: PINNED_REVM_CARGO_LOCK_SHA256,
    revmCrateSha256: PINNED_REVM_CRATE_SHA256,
    implicitPragueBlobFractionRejected: "5007716",
    bpo2FractionOverride: "11684671",
    blobEnvironmentInitialization:
      "cfg_blob_base_fee_update_fraction_then_block_set_blob_excess_gas_and_price",
    proposeTransactionHash: input.proposeTransactionHash,
    proposeTransactionSender: input.proposeTransactionSender,
    proposeReceiptEvidenceKind: input.proposeReceiptEvidenceKind,
    proposeReceiptRpcMethod:
      input.proposeReceiptEvidenceKind === "archive_rpc"
        ? "eth_getTransactionReceipt"
        : null,
    proposeReceiptFixtureProjectionSha256:
      input.proposeReceiptFixtureProjectionSha256,
    proposeReceiptRawResultSha256: input.proposeReceiptRawResultSha256,
    proposeReceiptRawResultObjectKey: input.proposeReceiptRawResultObjectKey,
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
    executorOperatorGetterSelector: "0x13e7c9d8",
    executorOperatorMappingBaseSlot:
      EXECUTOR_OPERATORS_MAPPING_SLOT.toString(),
    executorOperatorMappingHashInputOrder: "slot_then_key",
    executorOperatorStorageSlot: input.executorOperatorStorageSlot,
    executorOperatorBlockEndStorageWord:
      input.executorOperatorBlockEndStorageWord,
    executorOperatorAuthorizedAtPropose:
      input.executorOperatorAuthorizedAtPropose,
    executorOperatorBlockEndEvidenceKind:
      input.executorOperatorBlockEndEvidenceKind,
    executorOperatorBlockEndFixtureProjectionSha256:
      input.executorOperatorBlockEndFixtureProjectionSha256,
    executorOperatorBlockEndRawResultSha256:
      input.executorOperatorBlockEndRawResultSha256,
    executorOperatorBlockEndRawResultObjectKey:
      input.executorOperatorBlockEndRawResultObjectKey,
    executorOperatorReplayManifestSha256:
      input.executorOperatorReplayManifestSha256,
    executorOperatorReplayRelevantSetterLogCount:
      input.executorOperatorReplayRelevantSetterLogCount,
    executorOperatorReplayAppliedSetterLogCount:
      input.executorOperatorReplayAppliedSetterLogCount,
    executorOperatorReplayLaterSetterLogCount: 0,
    executorOperatorReplayEvidenceKind:
      input.executorOperatorReplayEvidenceKind,
    executorOperatorReplayFixtureProjectionSha256:
      input.executorOperatorReplayFixtureProjectionSha256,
    executorOperatorReplayRawLogsSha256:
      input.executorOperatorReplayRawLogsSha256,
    executorOperatorReplayRawLogsObjectKey:
      input.executorOperatorReplayRawLogsObjectKey,
    harnessName: "gov-apps-stats-revm-frame-injector",
    harnessRevision: input.harnessRevision,
    harnessArtifactSha256: input.harnessArtifactSha256,
    scriptHash: input.scriptHash,
    executeFunctionSignature: "execute(bytes)",
    executeCalldataSha256: input.executeCalldataSha256,
    executeCalldataDerivation:
      "abi_encode_execute_bytes_from_exact_retained_script",
    executorSourceRepository: "yearn/stYFI",
    executorSourceRevision: input.executorSourceRevision,
    executorSourcePath: input.executorSourcePath,
    executorSourceSha256: input.executorSourceSha256,
    executorCompiler: "vyper@0.4.2",
    executorSourceIntegritySha256:
      PINNED_EXECUTOR_SOURCE_INTEGRITY_SHA256,
    compilerDistributionUri: PINNED_VYPER_COMPILER_ARTIFACT_URI,
    compilerDistributionByteLength:
      PINNED_VYPER_COMPILER_ARTIFACT_BYTE_LENGTH,
    compilerDistributionSha256: PINNED_VYPER_COMPILER_ARTIFACT_SHA256,
    executorOptimization: "gas",
    executorEvmVersion: "cancun",
    executorExperimentalCodegen: false,
    executorRuntimeByteLength: input.executorRuntimeByteLength,
    executorRuntimeBytecodeHash: input.executorRuntimeBytecodeHash,
    executorRuntimeArtifactSha256: input.executorRuntimeArtifactSha256,
    executorCreationCommand: PINNED_EXECUTOR_CREATION_BYTECODE_COMMAND,
    executorRuntimeCommand: PINNED_EXECUTOR_RUNTIME_COMMAND,
    executorCreationStdoutSha256:
      PINNED_EXECUTOR_CREATION_STDOUT_SHA256,
    executorCreationRawSha256: PINNED_EXECUTOR_CREATION_SHA256,
    executorEvidenceKind: input.executorEvidenceKind,
    executorEvidenceRpcMethod:
      input.executorEvidenceKind === "archive_rpc_and_reproducible_build"
        ? "eth_getCode"
        : null,
    executorEvidenceFixtureProjectionSha256:
      input.executorEvidenceFixtureProjectionSha256,
    executorEvidenceRawResultSha256: input.executorEvidenceRawResultSha256,
    executorEvidenceRawResultObjectKey: input.executorEvidenceRawResultObjectKey,
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
    frameSemantics:
      "engine_injected_executor_child_frame_before_first_opcode_after_voting_gate",
    executorFrameDepth: 1,
    omittedVotingParentDepth: 0,
    scriptTargetFrameDepth: 2,
    callScheme: "CALL",
    injectionPoint: "before_executor_first_opcode",
    parentEip150GasDeductionApplied: false,
    outerTransactionValidation: "bypassed",
    osakaTransactionGasLimitCap: "16777216",
    gasScenario: "non_transactional_gas_overapproximation",
    resultScope:
      "recorded_injected_frame_script_behavior_not_future_execution_feasibility",
    parentEip150Forwarding: "not_modeled",
    coinbaseWarm: true,
    warmAddresses,
    precompileAddresses: [...OSAKA_PRECOMPILE_ADDRESSES],
    warmStorageKeys: [],
    initialWarmSetPolicy:
      "osaka_frame_entry_origin_voting_executor_coinbase_precompiles_0x01_through_0x11_and_0x0100_no_storage",
    stateOverrideKind: "voting_proposal_executed_flag",
    overrideVotingAddress: input.overrideVotingAddress,
    overrideProposalId: input.overrideProposalId,
    overrideResolvedStorageSlot: input.overrideResolvedStorageSlot,
    overridePreStorageWord: input.overridePreStorageWord,
    overridePostStorageWord: input.overridePostStorageWord,
    overrideVotingCodeHash: input.overrideVotingCodeHash,
    overrideVotingEvidenceKind: input.overrideVotingEvidenceKind,
    overrideVotingFixtureProjectionSha256:
      input.overrideVotingFixtureProjectionSha256,
    overrideVotingRawResultSha256: input.overrideVotingRawResultSha256,
    overrideVotingRawResultObjectKey: input.overrideVotingRawResultObjectKey,
  });
  return sha256(new TextEncoder().encode(canonicalInputs));
}

export function deriveDaoVoterBuildEvidenceSha256(input: {
  constructorGenesisTimestamp: number;
  compiledRuntimeBytecodeHash: Hex;
  codeByteLength: number;
  deployedBytecodeHash: Hex;
  buildArtifactSha256: Hex;
  deployedRuntimeSha256?: Hex;
  immutableGenesisWord?: Hex;
}): Hex {
  const canonicalEvidence = JSON.stringify({
    schema: "yearn.dao.voter-build-evidence.v2",
    sourceRepository: "yearn/stYFI",
    sourceRevision: DAO_PINNED_VOTING_REVISION,
    sourcePath: PINNED_VOTER_SOURCE_PATH,
    sourceSha256: PINNED_VOTER_SOURCE_SHA256,
    sourceIntegritySha256: PINNED_VOTER_SOURCE_INTEGRITY_SHA256,
    compiler: "vyper@0.4.2",
    compilerDistributionUri: PINNED_VYPER_COMPILER_ARTIFACT_URI,
    compilerDistributionByteLength:
      PINNED_VYPER_COMPILER_ARTIFACT_BYTE_LENGTH,
    compilerDistributionSha256: PINNED_VYPER_COMPILER_ARTIFACT_SHA256,
    optimization: "gas",
    evmVersion: "cancun",
    constructorGenesisTimestamp: input.constructorGenesisTimestamp,
    compiledRuntimeBytecodeHash: input.compiledRuntimeBytecodeHash,
    codeByteLength: input.codeByteLength,
    deployedBytecodeHash: input.deployedBytecodeHash,
    buildArtifactSha256: input.buildArtifactSha256,
    creationCommand: PINNED_VOTER_CREATION_BYTECODE_COMMAND,
    creationStdoutByteLength: PINNED_VOTER_CREATION_STDOUT_BYTE_LENGTH,
    creationRawByteLength: PINNED_VOTER_CREATION_BYTE_LENGTH,
    creationRawSha256: PINNED_VOTER_CREATION_SHA256,
    runtimeTemplateCommand: PINNED_VOTER_RUNTIME_TEMPLATE_COMMAND,
    runtimeTemplateStdoutByteLength:
      PINNED_VOTER_RUNTIME_STDOUT_BYTE_LENGTH,
    runtimeTemplateStdoutSha256: PINNED_VOTER_RUNTIME_STDOUT_SHA256,
    runtimeTemplateByteLength: PINNED_VOTER_RUNTIME_TEMPLATE_BYTE_LENGTH,
    runtimeTemplateSha256: PINNED_VOTER_RUNTIME_TEMPLATE_SHA256,
    runtimeTemplateKeccak256: PINNED_VOTER_RUNTIME_TEMPLATE_KECCAK256,
    immutableLayoutCommand: PINNED_VOTER_LAYOUT_COMMAND,
    immutableLayoutStdoutByteLength:
      PINNED_VOTER_LAYOUT_STDOUT_BYTE_LENGTH,
    immutableLayoutStdoutSha256: PINNED_VOTER_LAYOUT_STDOUT_SHA256,
    immutableGenesisWord:
      input.immutableGenesisWord ??
      encodeUint256Word(BigInt(input.constructorGenesisTimestamp)),
    deployedRuntimeSha256:
      input.deployedRuntimeSha256 ?? PINNED_VOTER_DEPLOYED_RUNTIME_SHA256,
    deployedRuntimeByteLength: PINNED_VOTER_DEPLOYED_RUNTIME_BYTE_LENGTH,
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

export type DaoConfigurationSetterAbiInput =
  | {
      setter: "set_propose_parameters";
      minWeight: bigint;
      cooldownSeconds: bigint;
      blacklistAddress: Address;
    }
  | {
      setter: "set_vote_parameters";
      votingPeriodSeconds: bigint;
      voterAddress: Address;
    }
  | {
      setter: "set_execute_parameters";
      executionDelaySeconds: bigint;
      executionGuard: "guarded" | "permissionless";
      executorAddress: Address;
    }
  | { setter: "set_hooks"; hooksAddress: Address }
  | { setter: "set_weight_measure"; measureAddress: Address }
  | { setter: "set_operator"; operatorAddress: Address }
  | { setter: "accept_guardian"; guardianAddress: Address }
  | { setter: "set_decay_length"; voterDecayLengthSeconds: bigint }
  | { setter: "set_delegated_staking"; delegatedStakingAddress: Address }
  | { setter: "set_ybc"; ybcAddress: Address }
  | {
      setter: "set_ybc_weight_aggregator";
      ybcWeightAggregatorAddress: Address;
    };

function prefixSelector(selector: Hex, encodedArguments: Hex): Hex {
  return `${selector}${encodedArguments.slice(2)}` as Hex;
}

function indexedAddressTopic(address: Address): Hex {
  return encodeAbiParameters([{ name: "value", type: "address" }], [address]);
}

export function encodeDaoFeedConfigurationSetterAbi(
  input: DaoConfigurationSetterAbiInput
): { selector: Hex; calldata: Hex; topics: Hex[]; data: Hex } {
  if (input.setter === "set_propose_parameters") {
    const selector =
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setProposeParameters;
    const encoded = encodeAbiParameters(
      [
        { name: "minWeight", type: "uint256" },
        { name: "cooldownSeconds", type: "uint256" },
        { name: "blacklistAddress", type: "address" },
      ],
      [input.minWeight, input.cooldownSeconds, input.blacklistAddress]
    );
    return {
      selector,
      calldata: prefixSelector(selector, encoded),
      topics: [DAO_FEED_CONFIGURATION_SETTER_TOPICS.setProposeParameters],
      data: encoded,
    };
  }
  if (input.setter === "set_vote_parameters") {
    const selector = DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setVoteParameters;
    const encoded = encodeAbiParameters(
      [
        { name: "votingPeriodSeconds", type: "uint256" },
        { name: "voterAddress", type: "address" },
      ],
      [input.votingPeriodSeconds, input.voterAddress]
    );
    return {
      selector,
      calldata: prefixSelector(selector, encoded),
      topics: [DAO_FEED_CONFIGURATION_SETTER_TOPICS.setVoteParameters],
      data: encoded,
    };
  }
  if (input.setter === "set_execute_parameters") {
    const selector =
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setExecuteParameters;
    const encoded = encodeAbiParameters(
      [
        { name: "executionDelaySeconds", type: "uint256" },
        { name: "executionGuard", type: "bool" },
        { name: "executorAddress", type: "address" },
      ],
      [
        input.executionDelaySeconds,
        input.executionGuard === "guarded",
        input.executorAddress,
      ]
    );
    return {
      selector,
      calldata: prefixSelector(selector, encoded),
      topics: [DAO_FEED_CONFIGURATION_SETTER_TOPICS.setExecuteParameters],
      data: encoded,
    };
  }

  const indexed = (
    selector: Hex,
    topic: Hex,
    address: Address
  ): { selector: Hex; calldata: Hex; topics: Hex[]; data: Hex } => ({
    selector,
    calldata: prefixSelector(
      selector,
      encodeAbiParameters([{ name: "value", type: "address" }], [address])
    ),
    topics: [topic, indexedAddressTopic(address)],
    data: "0x",
  });

  if (input.setter === "set_hooks") {
    return indexed(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setHooks,
      DAO_FEED_CONFIGURATION_SETTER_TOPICS.setHooks,
      input.hooksAddress
    );
  }
  if (input.setter === "set_weight_measure") {
    return indexed(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setWeightMeasure,
      DAO_FEED_CONFIGURATION_SETTER_TOPICS.setWeightMeasure,
      input.measureAddress
    );
  }
  if (input.setter === "set_operator") {
    return indexed(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setOperator,
      DAO_FEED_CONFIGURATION_SETTER_TOPICS.setOperator,
      input.operatorAddress
    );
  }
  if (input.setter === "accept_guardian") {
    const selector = DAO_FEED_CONFIGURATION_SETTER_SELECTORS.acceptGuardian;
    return {
      selector,
      calldata: selector,
      topics: [
        DAO_FEED_CONFIGURATION_SETTER_TOPICS.acceptGuardian,
        indexedAddressTopic(input.guardianAddress),
      ],
      data: "0x",
    };
  }
  if (input.setter === "set_decay_length") {
    const selector = DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setDecayLength;
    const encoded = encodeAbiParameters(
      [{ name: "voterDecayLengthSeconds", type: "uint256" }],
      [input.voterDecayLengthSeconds]
    );
    return {
      selector,
      calldata: prefixSelector(selector, encoded),
      topics: [DAO_FEED_CONFIGURATION_SETTER_TOPICS.setDecayLength],
      data: encoded,
    };
  }
  if (input.setter === "set_delegated_staking") {
    return indexed(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setDelegatedStaking,
      DAO_FEED_CONFIGURATION_SETTER_TOPICS.setDelegatedStaking,
      input.delegatedStakingAddress
    );
  }
  if (input.setter === "set_ybc") {
    return indexed(
      DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setYbc,
      DAO_FEED_CONFIGURATION_SETTER_TOPICS.setYbc,
      input.ybcAddress
    );
  }
  return indexed(
    DAO_FEED_CONFIGURATION_SETTER_SELECTORS.setYbcWeightAggregator,
    DAO_FEED_CONFIGURATION_SETTER_TOPICS.setYbcWeightAggregator,
    input.ybcWeightAggregatorAddress
  );
}

export function deriveDaoConfigurationSetterTraceProjectionSha256(input: {
  receipt: {
    transactionHash: Hex;
    transactionSender: Address;
    blockNumber: string;
    blockHash: Hex;
    transactionIndex: number;
  };
  setterCalls: readonly {
    setter: string;
    target: string;
    sourceContract: string;
    caller: string;
    traceAddress: readonly number[];
    selector: string;
    calldata: string;
    arguments: unknown;
    log: {
      emitter: string;
      logIndex: number;
      topics: readonly string[];
      data: string;
      decoded: unknown;
    };
  }[];
}): Hex {
  return sha256(
    new TextEncoder().encode(
      canonicalHashJson({
        schema: "yearn.dao.synthetic-configuration-setter-trace-projection.v1",
        rpcMethod: "debug_traceTransaction",
        tracer: "callTracer",
        tracerConfig: { onlyTopCall: false, withLog: true },
        reexec: 0,
        normalization:
          "root_empty_array_then_zero_based_full_call_tree_child_indices",
        receipt: input.receipt,
        setterCalls: input.setterCalls,
      })
    )
  );
}

export function deriveDaoConfigurationValuesSha256(input: {
  voteStartOffsetSeconds: number;
  votingPeriodSeconds: number;
  executionDelaySeconds: number;
  executionGuard: "guarded" | "permissionless";
  voterDecayLengthSeconds: number;
  voterAddress: string;
  voterImplementation: unknown;
  delegatedStakingAddress: string;
  ybcAddress: string;
  ybcWeightAggregatorAddress: string;
  executorAddress: string;
  executorImplementation: unknown;
  votingHookAddress: string;
  weightMeasureAddress: string;
  proposalBlacklistAddress: string;
  operatorAddress: string;
  guardianAddress: string;
}): Hex {
  return sha256(
    new TextEncoder().encode(
      canonicalHashJson({
        schema: "yearn.dao.configuration-values.v1",
        voteStartOffsetSeconds: input.voteStartOffsetSeconds,
        votingPeriodSeconds: input.votingPeriodSeconds,
        executionDelaySeconds: input.executionDelaySeconds,
        executionGuard: input.executionGuard,
        voterDecayLengthSeconds: input.voterDecayLengthSeconds,
        voterAddress: input.voterAddress,
        voterImplementation: input.voterImplementation,
        delegatedStakingAddress: input.delegatedStakingAddress,
        ybcAddress: input.ybcAddress,
        ybcWeightAggregatorAddress: input.ybcWeightAggregatorAddress,
        executorAddress: input.executorAddress,
        executorImplementation: input.executorImplementation,
        votingHookAddress: input.votingHookAddress,
        weightMeasureAddress: input.weightMeasureAddress,
        proposalBlacklistAddress: input.proposalBlacklistAddress,
        operatorAddress: input.operatorAddress,
        guardianAddress: input.guardianAddress,
      })
    )
  );
}

export function deriveDaoConfigurationBootstrapProjectionSha256(input: {
  startBlockNumber: string;
  startBlockHash: Hex;
  parentBlockNumber: string;
  parentBlockHash: Hex;
  votingAddress: Address;
  configurationValuesSha256: Hex;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "configuration_start_state_snapshot_projection",
    input
  );
}

export function deriveDaoConfigurationBootstrapScanProjectionSha256(input: {
  fromBlockNumber: string;
  toBlockNumber: string;
  toBlockHash: Hex;
  coveredBlocks: readonly {
    number: string;
    hash: Hex;
    timestamp: number | null;
  }[];
  votingAddress: Address;
  lifecycleLogCount: 0;
  trackedSetterLogCount: number;
  canonicalManifestByteLength: number;
  canonicalManifestSha256: Hex;
  replayedConfigurationValuesSha256: Hex;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "configuration_bootstrap_setter_replay_scan_projection",
    input
  );
}

export function deriveDaoConfigurationSetterStateProjectionSha256(input: {
  votingAddress: Address;
  blockNumber: string;
  blockHash: Hex;
  transactionIndex: number;
  logIndex: number;
  configurationValuesSha256: Hex;
  trackedSetterHistoryLogCount: number;
  trackedSetterHistoryManifestSha256: Hex;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "configuration_setter_state_projection",
    input
  );
}

export function deriveDaoVoterTargetStateValuesSha256(input: {
  voterDecayLengthSeconds: number;
  delegatedStakingAddress: string;
  ybcAddress: string;
  ybcWeightAggregatorAddress: string;
}): Hex {
  return sha256(
    new TextEncoder().encode(
      canonicalHashJson({
        schema: "yearn.dao.voter-target-state-values.v1",
        ...input,
      })
    )
  );
}

export function deriveDaoConfigurationSetterTransactionProjectionSha256(
  input: {
    projectionKind:
      | "bootstrap_configuration_setter_transaction"
      | "preconfigured_voter_setter_transaction";
    transactionHash: Hex;
    transactionSender: Address;
    blockNumber: string;
    blockHash: Hex;
    transactionIndex: number;
    receiptStatus: "success";
    setterCalls: readonly unknown[];
  }
): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "configuration_setter_transaction_trace_projection",
    input
  );
}

export function deriveDaoVoterCodeBirthProjectionSha256(input: {
  address: Address;
  deploymentBlockNumber: string;
  deploymentBlockHash: Hex;
  deploymentTransactionHash: Hex;
  deploymentTransactionIndex: number;
  receiptStatus: "success";
  receiptContractAddress: Address;
  previousBlockNumber: string;
  previousBlockHash: Hex;
  previousCodeByteLength: 0;
  deployedCodeByteLength: number;
  deployedBytecodeHash: Hex;
  deployedRuntimeSha256: Hex;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "voter_code_birth_receipt_and_code_projection",
    input
  );
}

export function canonicalizeDaoPreconfiguredVoterSetterManifest(input: {
  chainId: number;
  voterAddress: Address;
  historyFromBlockNumber: string;
  historyToBlockNumber: string;
  historyToBlockHash: Hex;
  codeBirthEvidence: unknown;
  historicalSetterLogs: readonly unknown[];
  transactionEvidence: readonly unknown[];
  historyEvidence: {
    evidenceKind: "archive_rpc" | "committed_synthetic_fixture";
    rpcMethods: readonly ["eth_call", "eth_getLogs"] | null;
    fixturePath: "tests/fixtures/dao-feed-v1.ts" | null;
    rawLogsSha256: Hex | null;
    manifestObjectKey: string | null;
  };
}): string {
  return `${canonicalHashJson({
    schema: "yearn.dao.preconfigured-voter-setter-manifest.v1",
    ...input,
  })}\n`;
}

export function deriveDaoVoterTargetStateProjectionSha256(input: {
  voterAddress: Address;
  blockNumber: string;
  blockHash: Hex;
  transactionIndex: number;
  logIndex: number;
  valuesSha256: Hex;
  historyFromBlockNumber: string;
  historyToBlockNumber: string;
  historyToBlockHash: Hex;
  historicalSetterLogCount: number;
  historicalSetterManifestByteLength: number;
  historicalSetterManifestSha256: Hex;
  laterSameBlockRelevantSetterLogCount: 0;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "preconfigured_voter_exact_boundary_state_projection",
    input
  );
}

export function canonicalizeDaoConfigurationSetterHistoryManifest(input: {
  priorTrackedSetterHistoryLogCount: number;
  priorTrackedSetterHistoryManifestSha256: Hex;
  receipt: {
    status: "success";
    transactionHash: Hex;
    transactionSender: Address;
    blockNumber: string;
    blockHash: Hex;
    blockTimestamp: number | null;
    transactionIndex: number;
    totalMatchingSetterLogCount: number;
    retainedBoundarySetterLogCount: number;
  };
  setterCalls: readonly unknown[];
}): string {
  return `${canonicalHashJson({
    schema: "yearn.dao.configuration-setter-history-chain.v1",
    priorTrackedSetterHistoryLogCount:
      input.priorTrackedSetterHistoryLogCount,
    priorTrackedSetterHistoryManifestSha256:
      input.priorTrackedSetterHistoryManifestSha256,
    receipt: input.receipt,
    setterCalls: input.setterCalls,
  })}\n`;
}

export function canonicalizeDaoConfigurationBootstrapSetterManifest(input: {
  chainId: number;
  votingAddress: Address;
  fromBlockNumber: string;
  toBlockNumber: string;
  coveredBlocks: readonly {
    number: string;
    hash: Hex;
    timestamp: number | null;
  }[];
  trackedSetterLogs: readonly {
    blockNumber: string;
    blockHash: Hex;
    blockTimestamp: number | null;
    transactionHash: Hex;
    transactionSender: Address;
    transactionIndex: number;
    receiptStatus: "success";
    call: unknown;
  }[];
  transactionEvidence: readonly unknown[];
}): string {
  return `${canonicalHashJson({
    schema: "yearn.dao.configuration-bootstrap-setter-manifest.v1",
    chainId: input.chainId,
    votingAddress: input.votingAddress,
    fromBlockNumber: input.fromBlockNumber,
    toBlockNumber: input.toBlockNumber,
    coveredBlocks: input.coveredBlocks,
    trackedSetterLogs: input.trackedSetterLogs,
    transactionEvidence: input.transactionEvidence,
  })}\n`;
}

function canonicalHashJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalHashJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalHashJson(record[key])}`
    )
    .join(",")}}`;
}

export function deriveDaoProposalThresholdProjectionSha256(input: {
  votingAddress: Address;
  proposalId: string;
  blockNumber: string;
  blockHash: Hex;
  resolvedStorageSlot: Hex;
  storageWord: Hex;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "proposal_threshold_eth_getStorageAt_projection",
    input
  );
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

export function deriveDaoVotingThresholdStorageSlots(proposalId: bigint): {
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
      VOTING_PROPOSAL_THRESHOLD_SLOT_OFFSET) &
    UINT256_MAX;
  return {
    proposalStorageBaseSlot,
    resolvedStorageSlot: `0x${resolved.toString(16).padStart(64, "0")}`,
  };
}

export function deriveDaoExecutorOperatorStorageSlot(
  votingAddress: Address
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "mappingBaseSlot", type: "uint256" },
        { name: "votingAddress", type: "address" },
      ],
      [EXECUTOR_OPERATORS_MAPPING_SLOT, votingAddress]
    )
  );
}

export function deriveDaoExecutorOperatorStorageProjectionSha256(input: {
  executorAddress: Address;
  votingAddress: Address;
  blockNumber: string;
  blockHash: Hex;
  resolvedStorageSlot: Hex;
  storageWord: Hex;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "executor_operator_eth_getStorageAt_projection",
    input
  );
}

export function deriveDaoExecutorOperatorReplayProjectionSha256(input: {
  executorAddress: Address;
  votingAddress: Address;
  blockNumber: string;
  blockHash: Hex;
  proposeTransactionIndex: number;
  proposeLogIndex: number;
  relevantSetterLogCount: number;
  appliedThroughProposeLogCount: number;
  laterSetterLogCount: 0;
  canonicalManifestSha256: Hex;
}): Hex {
  return deriveDaoSyntheticEvidenceSha256(
    "executor_operator_same_block_setter_replay_projection",
    input
  );
}

export function canonicalizeDaoExecutorOperatorSetterManifest(input: {
  executorAddress: Address;
  votingAddress: Address;
  blockNumber: string;
  blockHash: Hex;
  relevantSetterLogs: readonly unknown[];
}): string {
  return `${canonicalHashJson({
    schema: "yearn.dao.executor-operator-setter-manifest.v1",
    executorAddress: input.executorAddress,
    votingAddress: input.votingAddress,
    blockNumber: input.blockNumber,
    blockHash: input.blockHash,
    relevantSetterLogs: input.relevantSetterLogs,
  })}\n`;
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
      priorHeight.path = path;
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
    for (const [numberKey, hashKey] of [
      ["parentBlockNumber", "parentBlockHash"],
      ["toBlockNumber", "toBlockHash"],
      ["historyToBlockNumber", "historyToBlockHash"],
      ["deploymentBlockNumber", "deploymentBlockHash"],
      ["previousBlockNumber", "previousBlockHash"],
    ] as const) {
      if (
        typeof record[numberKey] === "string" &&
        typeof record[hashKey] === "string"
      ) {
        register(
          record[numberKey] as string,
          record[hashKey] as string,
          null,
          [...path, numberKey]
        );
      }
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

  const knownTimestamps = [...byHeight.entries()]
    .map(([heightKey, evidence]) => ({
      number: BigInt(heightKey.slice(heightKey.indexOf(":") + 1)),
      timestamp: evidence.timestamp,
      path: evidence.path,
    }))
    .filter(
      (
        evidence
      ): evidence is { number: bigint; timestamp: number; path: PropertyKey[] } =>
        evidence.timestamp !== null
    )
    .sort((left, right) =>
      left.number < right.number ? -1 : left.number > right.number ? 1 : 0
    );
  for (let index = 1; index < knownTimestamps.length; index += 1) {
    const previous = knownTimestamps[index - 1]!;
    const current = knownTimestamps[index]!;
    if (current.number > previous.number && current.timestamp <= previous.timestamp) {
      issue(
        context,
        current.path,
        "Known canonical block timestamps must increase strictly with chain height across every retained provenance record."
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

  if (
    publication.retry.state === "succeeded_after_retry" ||
    publication.retry.state === "succeeded_after_bootstrap_retry"
  ) {
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
    if (
      (publication.retry.state === "succeeded_after_bootstrap_retry") !==
      (publication.previousSnapshotId === null)
    ) {
      issue(
        context,
        ["publication", "retry", "state"],
        "Bootstrap retry is used exactly when no prior stable snapshot identity exists; ordinary retry requires the prior identity."
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
    const bootstrapRecovery =
      publication.reorg.state ===
      "recovered_before_first_stable_snapshot";
    if (
      bootstrapRecovery
        ? publication.previousSnapshotId !== null ||
          publication.reorg.replacedSnapshotId !== null
        : publication.previousSnapshotId === null ||
          publication.reorg.replacedSnapshotId !==
            publication.previousSnapshotId
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
    if (
      contract.deploymentBlock.timestamp !== null &&
      contract.deploymentBlock.timestamp <
        contract.genesisTimestamp + contract.epochLengthSeconds
    ) {
      issue(
        context,
        [...path, "deploymentBlock", "timestamp"],
        "Known Voting deployment time must satisfy the pinned constructor precondition deployment >= genesis + one full epoch."
      );
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
      validateConfigurationBoundary(
        feed,
        contract,
        configuration,
        previousConfiguration,
        configurationIndex,
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
        compareConfigurationEffectivePositions(
          previousConfiguration.effectiveAt,
          configuration.effectiveAt
        ) >= 0
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
    const setterTransactions = new Map<
      string,
      {
        blockNumber: string;
        blockHash: string;
        transactionIndex: number;
        transactionSender: string;
        totalMatchingSetterLogCount: number;
        logIndices: Set<number>;
        tracePaths: Map<string, string>;
        path: readonly PropertyKey[];
        sourceKind: "archive_rpc" | "committed_synthetic_fixture";
        clientVersion: string | null;
        rawTraceSha256: string | null;
      }
    >();
    for (const [configurationIndex, configuration] of
      contract.configurationHistory.entries()) {
      if (configuration.boundary.kind !== "setter_trace_observation") {
        continue;
      }
      const boundary = configuration.boundary;
      const boundaryPath = [
        ...path,
        "configurationHistory",
        configurationIndex,
        "boundary",
      ] as const;
      const existing = setterTransactions.get(
        boundary.receipt.transactionHash
      );
      if (!existing) {
        setterTransactions.set(boundary.receipt.transactionHash, {
          blockNumber: boundary.receipt.blockNumber,
          blockHash: boundary.receipt.blockHash,
          transactionIndex: boundary.receipt.transactionIndex,
          transactionSender: boundary.receipt.transactionSender,
          totalMatchingSetterLogCount:
            boundary.receipt.totalMatchingSetterLogCount,
          logIndices: new Set(
            boundary.setterCalls.map((call) => call.log.logIndex)
          ),
          tracePaths: new Map(
            boundary.setterCalls.map((call) => [
              JSON.stringify(call.traceAddress),
              canonicalHashJson({
                target: call.target,
                caller: call.caller,
                calldata: call.calldata,
                result: call.result,
                log: call.log,
              }),
            ])
          ),
          path: boundaryPath,
          sourceKind: boundary.traceEvidence.sourceKind,
          clientVersion: boundary.traceEvidence.clientVersion,
          rawTraceSha256: boundary.traceEvidence.rawTraceSha256,
        });
        continue;
      }
      if (
        existing.blockNumber !== boundary.receipt.blockNumber ||
        existing.blockHash !== boundary.receipt.blockHash ||
        existing.transactionIndex !== boundary.receipt.transactionIndex ||
        !sameAddress(
          existing.transactionSender,
          boundary.receipt.transactionSender
        ) ||
        existing.totalMatchingSetterLogCount !==
          boundary.receipt.totalMatchingSetterLogCount ||
        existing.sourceKind !== boundary.traceEvidence.sourceKind ||
        (existing.sourceKind === "archive_rpc" &&
          (existing.clientVersion !== boundary.traceEvidence.clientVersion ||
            existing.rawTraceSha256 !==
              boundary.traceEvidence.rawTraceSha256))
      ) {
        issue(
          context,
          [...boundaryPath, "receipt"],
          "Configuration rows split across one setter transaction must retain one exact receipt, total tracked-setter count, and archive trace identity."
        );
      }
      for (const call of boundary.setterCalls) {
        const tracePath = JSON.stringify(call.traceAddress);
        const traceIdentity = canonicalHashJson({
          target: call.target,
          caller: call.caller,
          calldata: call.calldata,
          result: call.result,
          log: call.log,
        });
        if (existing.tracePaths.has(tracePath)) {
          issue(
            context,
            [...boundaryPath, "setterCalls"],
            "One transaction-wide full call-tree trace path must map to one exact setter call and cannot be reused across split configuration rows."
          );
        } else {
          existing.tracePaths.set(tracePath, traceIdentity);
        }
        if (existing.logIndices.has(call.log.logIndex)) {
          issue(
            context,
            [...boundaryPath, "setterCalls"],
            "Split configuration rows must partition, never duplicate, the retained setter logs in their shared transaction."
          );
        }
        existing.logIndices.add(call.log.logIndex);
      }
    }
    for (const transaction of setterTransactions.values()) {
      if (
        transaction.logIndices.size !==
        transaction.totalMatchingSetterLogCount
      ) {
        issue(
          context,
          [...transaction.path, "receipt", "totalMatchingSetterLogCount"],
          "All configuration rows for one setter transaction must collectively retain every matching tracked setter log exactly once."
        );
      }
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
      const canonical = toUint(feed.canonicalBlock.number);
      if (retired === null || start === null || retired < start) {
        issue(
          context,
          [...path, "retiredAtBlock"],
          "A contract generation cannot retire before its producer start block."
        );
      }
      if (retired !== null && canonical !== null && retired > canonical) {
        issue(
          context,
          [...path, "retiredAtBlock"],
          "A retired Voting generation must retire at or before the canonical snapshot block."
        );
      }
      if (
        retired !== null &&
        contract.configurationHistory.some(
          (configuration) =>
            (toUint(configuration.effectiveAt.blockNumber) ??
              UINT256_MAX) > retired
        )
      ) {
        issue(
          context,
          [...path, "configurationHistory"],
          "A retired Voting generation cannot retain configuration effective after its inclusive retirement block."
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
    const currentDeployment = toUint(current.deploymentBlock.number);
    const currentStart = toUint(current.startBlock);
    const retirement =
      current.retiredAtBlock === null
        ? null
        : toUint(current.retiredAtBlock.number);
    const nextDeployment = toUint(next.deploymentBlock.number);
    const nextStart = toUint(next.startBlock);
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
    if (
      current.retiredAtBlock === null ||
      retirement === null ||
      nextDeployment === null ||
      nextStart === null ||
      currentDeployment === null ||
      currentStart === null ||
      retirement !== nextDeployment ||
      current.retiredAtBlock.hash !== next.deploymentBlock.hash ||
      nextDeployment <= currentDeployment ||
      nextDeployment <= currentStart ||
      nextStart !== nextDeployment + 1n
    ) {
      issue(
        context,
        ["contracts", index, "retiredAtBlock"],
        "Each generation cutover requires the predecessor retirement and successor deployment to share one canonical block/hash, with the successor producer start exactly one block later and strictly after predecessor deployment/start."
      );
    }
  }
  return byGeneration;
}

type HistoricalConfiguration = z.infer<typeof HistoricalConfigurationSchema>;
type ConfigurationSetterCall = z.infer<typeof ConfigurationSetterCallSchema>;
type ConfigurationTrackedSetterLog = z.infer<
  typeof ConfigurationBootstrapTrackedSetterLogSchema
>;
type ConfigurationSetterTransactionEvidence = z.infer<
  typeof ConfigurationSetterTransactionEvidenceSchema
>;

function configurationValuesSha256(
  configuration: HistoricalConfiguration
): Hex {
  return deriveDaoConfigurationValuesSha256({
    voteStartOffsetSeconds: configuration.voteStartOffsetSeconds,
    votingPeriodSeconds: configuration.votingPeriodSeconds,
    executionDelaySeconds: configuration.executionDelaySeconds,
    executionGuard: configuration.executionGuard,
    voterDecayLengthSeconds: configuration.voterDecayLengthSeconds,
    voterAddress: configuration.voterAddress,
    voterImplementation: configuration.voterImplementation,
    delegatedStakingAddress: configuration.delegatedStakingAddress,
    ybcAddress: configuration.ybcAddress,
    ybcWeightAggregatorAddress: configuration.ybcWeightAggregatorAddress,
    executorAddress: configuration.executorAddress,
    executorImplementation: configuration.executorImplementation,
    votingHookAddress: configuration.votingHookAddress,
    weightMeasureAddress: configuration.weightMeasureAddress,
    proposalBlacklistAddress: configuration.proposalBlacklistAddress,
    operatorAddress: configuration.operatorAddress,
    guardianAddress: configuration.guardianAddress,
  });
}

function setterAbiInput(
  call: ConfigurationSetterCall
): DaoConfigurationSetterAbiInput {
  switch (call.setter) {
    case "set_propose_parameters":
      return {
        setter: call.setter,
        minWeight: BigInt(call.arguments.minWeight),
        cooldownSeconds: BigInt(call.arguments.cooldownSeconds),
        blacklistAddress: call.arguments.blacklistAddress as Address,
      };
    case "set_vote_parameters":
      return {
        setter: call.setter,
        votingPeriodSeconds: BigInt(call.arguments.votingPeriodSeconds),
        voterAddress: call.arguments.voterAddress as Address,
      };
    case "set_execute_parameters":
      return {
        setter: call.setter,
        executionDelaySeconds: BigInt(call.arguments.executionDelaySeconds),
        executionGuard: call.arguments.executionGuard,
        executorAddress: call.arguments.executorAddress as Address,
      };
    case "set_hooks":
      return {
        setter: call.setter,
        hooksAddress: call.arguments.hooksAddress as Address,
      };
    case "set_weight_measure":
      return {
        setter: call.setter,
        measureAddress: call.arguments.measureAddress as Address,
      };
    case "set_operator":
      return {
        setter: call.setter,
        operatorAddress: call.arguments.operatorAddress as Address,
      };
    case "accept_guardian":
      return {
        setter: call.setter,
        guardianAddress: call.log.decoded.guardianAddress as Address,
      };
    case "set_decay_length":
      return {
        setter: call.setter,
        voterDecayLengthSeconds: BigInt(
          call.arguments.voterDecayLengthSeconds
        ),
      };
    case "set_delegated_staking":
      return {
        setter: call.setter,
        delegatedStakingAddress:
          call.arguments.delegatedStakingAddress as Address,
      };
    case "set_ybc":
      return {
        setter: call.setter,
        ybcAddress: call.arguments.ybcAddress as Address,
      };
    case "set_ybc_weight_aggregator":
      return {
        setter: call.setter,
        ybcWeightAggregatorAddress:
          call.arguments.ybcWeightAggregatorAddress as Address,
      };
  }
}

function validateConfigurationSetterCall(
  call: ConfigurationSetterCall,
  contract: StructuralFeed["contracts"][number],
  effectiveVoterAddress: string,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  if (
    call.setter === "set_propose_parameters" &&
    (toUint(call.arguments.minWeight) === null ||
      toUint(call.arguments.cooldownSeconds) === null)
  ) {
    issue(
      context,
      [...path, "arguments"],
      "set_propose_parameters uint arguments must fit unsigned 256-bit ABI words before canonical re-encoding."
    );
    return;
  }
  const expected = encodeDaoFeedConfigurationSetterAbi(setterAbiInput(call));
  const voterSetter =
    call.setter === "set_decay_length" ||
    call.setter === "set_delegated_staking" ||
    call.setter === "set_ybc" ||
    call.setter === "set_ybc_weight_aggregator";
  const expectedSourceContract = voterSetter ? "Voter" : "Voting";
  const expectedTarget = voterSetter
    ? effectiveVoterAddress
    : contract.votingAddress;
  const proposeCooldown =
    call.setter === "set_propose_parameters"
      ? toUint(call.arguments.cooldownSeconds)
      : null;
  if (
    call.sourceContract !== expectedSourceContract ||
    !sameAddress(call.target, expectedTarget) ||
    !sameAddress(call.log.emitter, call.target) ||
    call.selector !== expected.selector ||
    call.calldata !== expected.calldata ||
    !stringArraysEqual(call.log.topics, expected.topics) ||
    call.log.data !== expected.data ||
    JSON.stringify(call.arguments) !==
      JSON.stringify(
        call.setter === "accept_guardian" ? {} : call.log.decoded
      ) ||
    (call.setter === "accept_guardian" &&
      !sameAddress(call.caller, call.log.decoded.guardianAddress)) ||
    (call.setter === "set_propose_parameters" &&
      (proposeCooldown === null ||
        proposeCooldown < 86_400n ||
        proposeCooldown > BigInt(DAO_FEED_EPOCH_LENGTH_SECONDS)))
  ) {
    issue(
      context,
      path,
      "Each tracked setter call must bind its exact target, caller-dependent semantics, selector, full ABI calldata, canonical Set* log, decoded mutation, and re-encoding."
    );
  }
}

function validateConfigurationSetterTransactionEvidence(input: {
  retainedLogs: readonly ConfigurationTrackedSetterLog[];
  evidence: readonly ConfigurationSetterTransactionEvidence[];
  projectionKind:
    | "bootstrap_configuration_setter_transaction"
    | "preconfigured_voter_setter_transaction";
  context: RefinementContext;
  path: readonly PropertyKey[];
}): void {
  const groups = new Map<string, ConfigurationTrackedSetterLog[]>();
  for (const retained of input.retainedLogs) {
    const group = groups.get(retained.transactionHash) ?? [];
    group.push(retained);
    groups.set(retained.transactionHash, group);
  }
  const seen = new Set<string>();
  for (const [evidenceIndex, evidence] of input.evidence.entries()) {
    const evidencePath = [...input.path, evidenceIndex] as const;
    const group = groups.get(evidence.transactionHash);
    if (!group || seen.has(evidence.transactionHash)) {
      issue(
        input.context,
        evidencePath,
        "Each retained setter transaction must have exactly one trace/receipt evidence record and no orphan or duplicate evidence."
      );
      continue;
    }
    seen.add(evidence.transactionHash);
    const first = group[0]!;
    const setterCalls = group.map((entry) => entry.call);
    const expectedLogIndices = setterCalls.map((call) => call.log.logIndex);
    const expectedProjection =
      deriveDaoConfigurationSetterTransactionProjectionSha256({
        projectionKind: input.projectionKind,
        transactionHash: first.transactionHash as Hex,
        transactionSender: first.transactionSender as Address,
        blockNumber: first.blockNumber,
        blockHash: first.blockHash as Hex,
        transactionIndex: first.transactionIndex,
        receiptStatus: "success",
        setterCalls,
      });
    const groupIdentityMatches = group.every(
      (entry) =>
        entry.transactionHash === first.transactionHash &&
        sameAddress(entry.transactionSender, first.transactionSender) &&
        entry.blockNumber === first.blockNumber &&
        entry.blockHash === first.blockHash &&
        entry.transactionIndex === first.transactionIndex &&
        entry.receiptStatus === "success"
    );
    if (
      !groupIdentityMatches ||
      evidence.projectionKind !== input.projectionKind ||
      !sameAddress(evidence.transactionSender, first.transactionSender) ||
      evidence.blockNumber !== first.blockNumber ||
      evidence.blockHash !== first.blockHash ||
      evidence.transactionIndex !== first.transactionIndex ||
      evidence.receiptStatus !== "success" ||
      evidence.retainedSetterCallCount !== setterCalls.length ||
      !numberArraysEqual(
        evidence.retainedSetterLogIndices,
        expectedLogIndices
      )
    ) {
      issue(
        input.context,
        evidencePath,
        "Setter transaction evidence must bind one exact successful transaction/receipt and partition every retained Set* call and log in canonical order."
      );
    }
    if (
      evidence.sourceKind === "committed_synthetic_fixture" &&
      evidence.fixtureProjectionSha256 !== expectedProjection
    ) {
      issue(
        input.context,
        evidencePath,
        `Synthetic setter transaction evidence must reproduce the exact committed sender, receipt, full callTracer paths/calldata, and retained log projection (expected ${expectedProjection}, retained ${evidence.fixtureProjectionSha256}).`
      );
    }
  }
  if (seen.size !== groups.size) {
    issue(
      input.context,
      input.path,
      "Every unique retained setter transaction must carry authenticated transaction, receipt, and callTracer evidence."
    );
  }
}

function applyConfigurationMutationAssertions(
  configuration: HistoricalConfiguration,
  previous: HistoricalConfiguration | null,
  calls: readonly ConfigurationSetterCall[],
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const mutated = new Set<string>();
  const lastMutationByField = new Map<
    keyof HistoricalConfiguration,
    { value: unknown; address: boolean }
  >();
  const recordMutation = (
    field: keyof HistoricalConfiguration,
    value: unknown,
    address = false
  ) => {
    mutated.add(field as string);
    lastMutationByField.set(field, { value, address });
  };

  for (const call of calls) {
    switch (call.setter) {
      case "set_propose_parameters":
        recordMutation(
          "proposalBlacklistAddress",
          call.arguments.blacklistAddress,
          true
        );
        break;
      case "set_vote_parameters":
        recordMutation(
          "votingPeriodSeconds",
          call.arguments.votingPeriodSeconds
        );
        recordMutation(
          "voteStartOffsetSeconds",
          DAO_FEED_EPOCH_LENGTH_SECONDS -
            call.arguments.votingPeriodSeconds
        );
        recordMutation("voterAddress", call.arguments.voterAddress, true);
        break;
      case "set_execute_parameters":
        recordMutation(
          "executionDelaySeconds",
          call.arguments.executionDelaySeconds
        );
        recordMutation("executionGuard", call.arguments.executionGuard);
        recordMutation("executorAddress", call.arguments.executorAddress, true);
        break;
      case "set_hooks":
        recordMutation("votingHookAddress", call.arguments.hooksAddress, true);
        break;
      case "set_weight_measure":
        recordMutation(
          "weightMeasureAddress",
          call.arguments.measureAddress,
          true
        );
        break;
      case "set_operator":
        recordMutation("operatorAddress", call.arguments.operatorAddress, true);
        break;
      case "accept_guardian":
        recordMutation("guardianAddress", call.log.decoded.guardianAddress, true);
        break;
      case "set_decay_length":
        recordMutation(
          "voterDecayLengthSeconds",
          call.arguments.voterDecayLengthSeconds
        );
        break;
      case "set_delegated_staking":
        recordMutation(
          "delegatedStakingAddress",
          call.arguments.delegatedStakingAddress,
          true
        );
        break;
      case "set_ybc":
        recordMutation("ybcAddress", call.arguments.ybcAddress, true);
        break;
      case "set_ybc_weight_aggregator":
        recordMutation(
          "ybcWeightAggregatorAddress",
          call.arguments.ybcWeightAggregatorAddress,
          true
        );
        break;
    }
  }

  for (const [field, mutation] of lastMutationByField) {
    const actual = configuration[field];
    const matches =
      mutation.address &&
      typeof actual === "string" &&
      typeof mutation.value === "string"
        ? sameAddress(actual, mutation.value)
        : actual === mutation.value;
    if (!matches) {
      issue(
        context,
        [...path, field],
        `Configuration field ${String(field)} must equal its final canonical setter mutation.`
      );
    }
  }

  if (previous === null) return;
  const voterChanged = !sameAddress(
    previous.voterAddress,
    configuration.voterAddress
  );
  const executorChanged = !sameAddress(
    previous.executorAddress,
    configuration.executorAddress
  );
  if (voterChanged && !mutated.has("voterAddress")) {
    issue(
      context,
      [...path, "voterAddress"],
      "A Voter pointer change requires an exact successful Voting.set_vote_parameters mutation in the retained boundary."
    );
  }
  if (executorChanged && !mutated.has("executorAddress")) {
    issue(
      context,
      [...path, "executorAddress"],
      "An Executor pointer change requires an exact successful Voting.set_execute_parameters mutation in the retained boundary."
    );
  }
  const inheritedFields: readonly (keyof HistoricalConfiguration)[] = [
    "voteStartOffsetSeconds",
    "votingPeriodSeconds",
    "executionDelaySeconds",
    "executionGuard",
    "votingHookAddress",
    "weightMeasureAddress",
    "proposalBlacklistAddress",
    "operatorAddress",
    "guardianAddress",
  ];
  const additionalVoterFields: readonly (keyof HistoricalConfiguration)[] = [
    "voterDecayLengthSeconds",
    "delegatedStakingAddress",
    "ybcAddress",
    "ybcWeightAggregatorAddress",
  ];
  const fields = [
    ...inheritedFields,
    ...(voterChanged ? [] : additionalVoterFields),
  ];
  for (const field of fields) {
    if (mutated.has(field as string)) continue;
    const left = previous[field];
    const right = configuration[field];
    const equal =
      typeof left === "string" &&
      typeof right === "string" &&
      left.startsWith("0x") &&
      right.startsWith("0x")
        ? left.toLowerCase() === right.toLowerCase()
        : JSON.stringify(left) === JSON.stringify(right);
    if (!equal) {
      issue(
        context,
        [...path, field],
        `Configuration field ${String(field)} changed without a canonical tracked setter mutation or a pointer change to independently replayed state.`
      );
    }
  }
  if (
    !voterChanged &&
    stableImplementationIdentity(previous.voterImplementation) !==
      stableImplementationIdentity(configuration.voterImplementation)
  ) {
    issue(
      context,
      [...path, "voterImplementation"],
      "An unchanged Voter pointer must preserve its source/build/runtime identity while refreshing only boundary-specific code evidence."
    );
  }
  if (
    !executorChanged &&
    stableImplementationIdentity(previous.executorImplementation) !==
      stableImplementationIdentity(configuration.executorImplementation)
  ) {
    issue(
      context,
      [...path, "executorImplementation"],
      "An unchanged Executor pointer must preserve its source/build/runtime identity while refreshing only boundary-specific code evidence."
    );
  }
}

function stableImplementationIdentity(
  implementation:
    | HistoricalConfiguration["voterImplementation"]
    | HistoricalConfiguration["executorImplementation"]
): string {
  const stable = Object.fromEntries(
    Object.entries(implementation).filter(([key]) => key !== "bytecode")
  );
  return canonicalHashJson(stable);
}

function validateConfigurationBoundary(
  feed: StructuralFeed,
  contract: StructuralFeed["contracts"][number],
  configuration: HistoricalConfiguration,
  previous: HistoricalConfiguration | null,
  configurationIndex: number,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const configurationHash = configurationValuesSha256(configuration);
  const deployment = toUint(contract.deploymentBlock.number);
  const start = toUint(contract.startBlock);
  if (configurationIndex === 0) {
    if (configuration.boundary.kind !== "producer_start_state_snapshot_sentinel") {
      issue(context, [...path, "boundary"], "The first configuration must be an authenticated producer-start state snapshot sentinel.");
      return;
    }
    const boundary = configuration.boundary;
    const parent = toUint(boundary.stateSnapshot.parentBlockNumber);
    if (
      deployment === null ||
      start === null ||
      start !== deployment + 1n ||
      parent !== deployment ||
      boundary.stateSnapshot.parentBlockHash !== contract.deploymentBlock.hash ||
      configuration.effectiveAt.blockNumber !== contract.startBlock ||
      configuration.effectiveAt.kind !== "start_of_block" ||
      boundary.stateSnapshot.configurationValuesSha256 !== configurationHash
    ) {
      issue(context, [...path, "boundary"], `The v1 producer-start sentinel must begin exactly one block after deployment and bind parent-end state to the complete initial configuration, including implementation evidence (expected ${configurationHash}, retained ${boundary.stateSnapshot.configurationValuesSha256}).`);
    }
    if (boundary.stateSnapshot.evidenceKind === "committed_synthetic_fixture") {
      const expected = deriveDaoConfigurationBootstrapProjectionSha256({
        startBlockNumber: contract.startBlock,
        startBlockHash: configuration.effectiveAt.blockHash as Hex,
        parentBlockNumber: boundary.stateSnapshot.parentBlockNumber,
        parentBlockHash: boundary.stateSnapshot.parentBlockHash as Hex,
        votingAddress: contract.votingAddress as Address,
        configurationValuesSha256: configurationHash,
      });
      if (
        boundary.stateSnapshot.rpcMethods !== null ||
        boundary.stateSnapshot.fixturePath !== "tests/fixtures/dao-feed-v1.ts" ||
        boundary.stateSnapshot.fixtureProjectionSha256 !== expected
      ) {
        issue(context, [...path, "boundary", "stateSnapshot"], `Synthetic producer-start state evidence must reproduce its exact complete-configuration projection (expected ${expected}, retained ${boundary.stateSnapshot.fixtureProjectionSha256}).`);
      }
    } else if (
      boundary.stateSnapshot.fixturePath !== null ||
      boundary.stateSnapshot.fixtureProjectionSha256 !== null
    ) {
      issue(context, [...path, "boundary", "stateSnapshot"], "Live producer-start state evidence must use only the exact archive-RPC branch.");
    }

    const scan = boundary.scanManifest;
    const tracked = scan.trackedSetterLogs;
    const manifest = canonicalizeDaoConfigurationBootstrapSetterManifest({
      chainId: feed.chainId,
      votingAddress: contract.votingAddress as Address,
      fromBlockNumber: scan.fromBlockNumber,
      toBlockNumber: scan.toBlockNumber,
      coveredBlocks: scan.coveredBlocks as Parameters<
        typeof canonicalizeDaoConfigurationBootstrapSetterManifest
      >[0]["coveredBlocks"],
      trackedSetterLogs: tracked as Parameters<typeof canonicalizeDaoConfigurationBootstrapSetterManifest>[0]["trackedSetterLogs"],
      transactionEvidence:
        scan.transactionEvidence as Parameters<
          typeof canonicalizeDaoConfigurationBootstrapSetterManifest
        >[0]["transactionEvidence"],
    });
    const manifestBytes = toBytes(manifest);
    const manifestSha256 = sha256(manifestBytes);
    const actualLifecycleLogs = feed.proposals.reduce(
      (count, proposal) =>
        count +
        proposal.events.filter((event) => {
          const block = toUint(event.log.blockNumber);
          return (
            block !== null &&
            block >= deployment! &&
            block <= parent! &&
            sameAddress(event.data.abi.address, scan.votingAddress)
          );
        }).length,
      0
    );
    const coveredFrom = toUint(scan.fromBlockNumber);
    const coveredTo = toUint(scan.toBlockNumber);
    const coveredBlocksAreComplete =
      coveredFrom !== null &&
      coveredTo !== null &&
      coveredTo >= coveredFrom &&
      BigInt(scan.coveredBlocks.length) === coveredTo - coveredFrom + 1n &&
      scan.coveredBlocks.every(
        (block, blockIndex) =>
          toUint(block.number) === coveredFrom + BigInt(blockIndex)
      ) &&
      scan.coveredBlocks.at(-1)?.hash === scan.toBlockHash;
    if (
      scan.fromBlockNumber !== contract.deploymentBlock.number ||
      scan.toBlockNumber !== boundary.stateSnapshot.parentBlockNumber ||
      scan.toBlockHash !== boundary.stateSnapshot.parentBlockHash ||
      !sameAddress(scan.votingAddress, contract.votingAddress) ||
      scan.lifecycleLogCount !== actualLifecycleLogs ||
      actualLifecycleLogs !== 0 ||
      scan.trackedSetterLogCount !== tracked.length ||
      scan.canonicalManifestByteLength !== manifestBytes.length ||
      scan.canonicalManifestSha256 !== manifestSha256 ||
      scan.replayedConfigurationValuesSha256 !== configurationHash ||
      !coveredBlocksAreComplete
    ) {
      issue(context, [...path, "boundary", "scanManifest"], `The bootstrap scan must cover deployment through the parent block, prove zero omitted lifecycle logs, retain every tracked setter log, and replay exactly to config-1 (expected config ${configurationHash}, retained ${scan.replayedConfigurationValuesSha256}; expected manifest ${manifestSha256}, retained ${scan.canonicalManifestSha256}).`);
    }
    let previousBootstrapSetterPosition:
      | {
          blockNumber: string;
          transactionIndex: number;
          logIndex: number;
        }
      | null = null;
    const bootstrapTracePathsByTransaction = new Map<string, Set<string>>();
    for (const [setterIndex, retained] of tracked.entries()) {
      validateConfigurationSetterCall(
        retained.call,
        contract,
        configuration.voterAddress,
        context,
        [...path, "boundary", "scanManifest", "trackedSetterLogs", setterIndex, "call"]
      );
      const retainedBlock = toUint(retained.blockNumber);
      const retainedPosition = {
        blockNumber: retained.blockNumber,
        transactionIndex: retained.transactionIndex,
        logIndex: retained.call.log.logIndex,
      };
      const traceTransactionKey = `${retained.blockHash}:${retained.transactionIndex}:${retained.transactionHash}`;
      const tracePaths =
        bootstrapTracePathsByTransaction.get(traceTransactionKey) ??
        new Set<string>();
      const tracePath = JSON.stringify(retained.call.traceAddress);
      if (
        retainedBlock === null ||
        retainedBlock < deployment! ||
        retainedBlock > parent! ||
        retained.receiptStatus !== "success" ||
        (previousBootstrapSetterPosition !== null &&
          comparePositions(
            previousBootstrapSetterPosition,
            retainedPosition
          ) >= 0) ||
        tracePaths.has(tracePath) ||
        (retained.call.traceAddress.length === 0 &&
          !sameAddress(
            retained.call.caller,
            retained.transactionSender
          ))
      ) {
        issue(context, [...path, "boundary", "scanManifest", "trackedSetterLogs", setterIndex], "Every retained bootstrap setter log must be a successful canonical log in strict block/transaction/log order inside the scan range, with a unique full call-tree path per transaction; a root trace binds its caller to the transaction sender.");
      }
      tracePaths.add(tracePath);
      bootstrapTracePathsByTransaction.set(
        traceTransactionKey,
        tracePaths
      );
      previousBootstrapSetterPosition = retainedPosition;
    }
    validateConfigurationSetterTransactionEvidence({
      retainedLogs: tracked,
      evidence: scan.transactionEvidence,
      projectionKind: "bootstrap_configuration_setter_transaction",
      context,
      path: [...path, "boundary", "scanManifest", "transactionEvidence"],
    });
    applyConfigurationMutationAssertions(
      configuration,
      null,
      tracked.map((entry) => entry.call),
      context,
      path
    );
    if (scan.evidenceKind === "committed_synthetic_fixture") {
      const expectedScan = deriveDaoConfigurationBootstrapScanProjectionSha256({
        fromBlockNumber: scan.fromBlockNumber,
        toBlockNumber: scan.toBlockNumber,
        toBlockHash: scan.toBlockHash as Hex,
        coveredBlocks: scan.coveredBlocks as Parameters<
          typeof deriveDaoConfigurationBootstrapScanProjectionSha256
        >[0]["coveredBlocks"],
        votingAddress: scan.votingAddress as Address,
        lifecycleLogCount: 0,
        trackedSetterLogCount: scan.trackedSetterLogCount,
        canonicalManifestByteLength: scan.canonicalManifestByteLength,
        canonicalManifestSha256: scan.canonicalManifestSha256 as Hex,
        replayedConfigurationValuesSha256: scan.replayedConfigurationValuesSha256 as Hex,
      });
      if (
        scan.rpcMethod !== null ||
        scan.fixturePath !== "tests/fixtures/dao-feed-v1.ts" ||
        scan.fixtureProjectionSha256 !== expectedScan ||
        scan.manifestObjectKey !== null
      ) {
        issue(context, [...path, "boundary", "scanManifest"], "Synthetic bootstrap scan evidence must reproduce the canonical manifest projection without archive claims.");
      }
    } else if (
      scan.fixturePath !== null ||
      scan.fixtureProjectionSha256 !== null ||
      scan.manifestObjectKey === null
    ) {
      issue(context, [...path, "boundary", "scanManifest"], "Live bootstrap scans must retain the archive manifest object and omit synthetic fixture fields.");
    }
    return;
  }

  if (configuration.boundary.kind !== "setter_trace_observation") {
    issue(context, [...path, "boundary"], "Every later configuration must bind a successful real canonical setter-log boundary.");
    return;
  }
  const boundary = configuration.boundary;
  if (configuration.effectiveAt.kind !== "canonical_setter_log") {
    issue(
      context,
      [...path, "effectiveAt"],
      "Every post-start configuration must use a real canonical setter-log position."
    );
    return;
  }
  const sortedCalls = [...boundary.setterCalls].sort(
    (left, right) => left.log.logIndex - right.log.logIndex
  );
  const finalCall = sortedCalls.at(-1)!;
  const tracePaths = new Set<string>();
  const logIndices = new Set<number>();
  for (const [setterIndex, call] of boundary.setterCalls.entries()) {
    validateConfigurationSetterCall(
      call,
      contract,
      configuration.voterAddress,
      context,
      [...path, "boundary", "setterCalls", setterIndex]
    );
    const traceKey = JSON.stringify(call.traceAddress);
    if (tracePaths.has(traceKey) || logIndices.has(call.log.logIndex)) {
      issue(context, [...path, "boundary", "setterCalls", setterIndex], "Setter trace paths and canonical log indices must be unique within one boundary transaction; a root [] path is valid only once.");
    }
    tracePaths.add(traceKey);
    logIndices.add(call.log.logIndex);
    if (
      setterIndex > 0 &&
      call.log.logIndex <= boundary.setterCalls[setterIndex - 1]!.log.logIndex
    ) {
      issue(
        context,
        [...path, "boundary", "setterCalls", setterIndex, "log", "logIndex"],
        "Setter calls must be retained in strict canonical log order."
      );
    }
    if (
      call.traceAddress.length === 0 &&
      !sameAddress(call.caller, boundary.receipt.transactionSender)
    ) {
      issue(
        context,
        [...path, "boundary", "setterCalls", setterIndex, "caller"],
        "A root setter trace must bind its immediate caller to the authenticated transaction sender."
      );
    }
  }
  if (
    boundary.receipt.transactionHash === null ||
    boundary.receipt.blockNumber !== configuration.effectiveAt.blockNumber ||
    boundary.receipt.blockHash !== configuration.effectiveAt.blockHash ||
    boundary.receipt.transactionIndex !== configuration.effectiveAt.transactionIndex ||
    boundary.receipt.retainedBoundarySetterLogCount !==
      boundary.setterCalls.length ||
    boundary.receipt.totalMatchingSetterLogCount <
      boundary.receipt.retainedBoundarySetterLogCount ||
    finalCall.log.logIndex !== configuration.effectiveAt.logIndex
  ) {
    issue(context, [...path, "boundary"], "The configuration effective position must equal the final retained Set* log in its successful canonical receipt.");
  }
  const interleavedLifecycle = feed.proposals.some((proposal) =>
    proposal.events.some(
      (event) =>
        event.log.blockHash === boundary.receipt.blockHash &&
        event.log.transactionIndex === boundary.receipt.transactionIndex &&
        event.log.logIndex >= sortedCalls[0]!.log.logIndex &&
        event.log.logIndex <= finalCall.log.logIndex
    )
  );
  if (interleavedLifecycle) {
    issue(context, [...path, "boundary", "setterCalls"], "A configuration row cannot batch setter logs around an intervening lifecycle log; split history at every such event-effective boundary.");
  }
  if (boundary.traceEvidence.sourceKind === "committed_synthetic_fixture") {
    const expectedTrace = deriveDaoConfigurationSetterTraceProjectionSha256({
      receipt: {
        transactionHash: boundary.receipt.transactionHash as Hex,
        transactionSender: boundary.receipt.transactionSender as Address,
        blockNumber: boundary.receipt.blockNumber,
        blockHash: boundary.receipt.blockHash as Hex,
        transactionIndex: boundary.receipt.transactionIndex,
      },
      setterCalls: boundary.setterCalls,
    });
    if (
      boundary.traceEvidence.fixtureProjectionSha256 !== expectedTrace ||
      boundary.traceEvidence.clientVersion !== null ||
      boundary.traceEvidence.rawTraceSha256 !== null
    ) {
      issue(context, [...path, "boundary", "traceEvidence"], "Synthetic setter traces must reproduce the exact committed callTracer projection and cannot claim archive bytes.");
    }
  } else if (
    boundary.traceEvidence.fixturePath !== null ||
    boundary.traceEvidence.fixtureProjectionSha256 !== null ||
    boundary.traceEvidence.clientVersion === null ||
    boundary.traceEvidence.rawTraceSha256 === null
  ) {
    issue(context, [...path, "boundary", "traceEvidence"], "Live setter traces must retain exact archive client and raw-result-byte evidence without synthetic fixture fields.");
  }
  const state = boundary.stateSnapshot;
  const priorHistory =
    previous?.boundary.kind === "producer_start_state_snapshot_sentinel"
      ? {
          count: previous.boundary.scanManifest.trackedSetterLogCount,
          sha256: previous.boundary.scanManifest
            .canonicalManifestSha256 as Hex,
        }
      : previous?.boundary.kind === "setter_trace_observation"
        ? {
            count:
              previous.boundary.stateSnapshot
                .trackedSetterHistoryLogCount,
            sha256: previous.boundary.stateSnapshot
              .trackedSetterHistoryManifestSha256 as Hex,
          }
        : null;
  const historyManifest =
    priorHistory === null
      ? null
      : canonicalizeDaoConfigurationSetterHistoryManifest({
          priorTrackedSetterHistoryLogCount: priorHistory.count,
          priorTrackedSetterHistoryManifestSha256: priorHistory.sha256,
          receipt: boundary.receipt as Parameters<
            typeof canonicalizeDaoConfigurationSetterHistoryManifest
          >[0]["receipt"],
          setterCalls: boundary.setterCalls,
        });
  const expectedHistoryManifestSha256 =
    historyManifest === null ? null : sha256(toBytes(historyManifest));
  const voterChanged =
    previous !== null &&
    !sameAddress(previous.voterAddress, configuration.voterAddress);
  const voterTargetEvidence = state.voterTargetStateEvidence;
  if (!voterChanged) {
    const hasRowLocalNestedSetter = boundary.setterCalls.some(
      (call) =>
        call.setter === "set_decay_length" ||
        call.setter === "set_delegated_staking" ||
        call.setter === "set_ybc" ||
        call.setter === "set_ybc_weight_aggregator"
    );
    const expectedEvidenceState = hasRowLocalNestedSetter
      ? "same_pointer_prior_state_plus_row_setter_replay"
      : "inherited_unchanged_pointer";
    if (
      previous === null ||
      voterTargetEvidence.state !== expectedEvidenceState ||
      !sameAddress(
        voterTargetEvidence.voterAddress,
        configuration.voterAddress
      ) ||
      voterTargetEvidence.priorConfigurationId !==
        previous.configurationId
    ) {
      issue(
        context,
        [...path, "boundary", "stateSnapshot", "voterTargetStateEvidence"],
        hasRowLocalNestedSetter
          ? "An unchanged Voter pointer with nested setters must start from the immediately prior authenticated state and replay those canonical same-pointer setters."
          : "An unchanged Voter pointer without nested setters must explicitly inherit the immediately prior authenticated nested state."
      );
    }
  } else if (
    voterTargetEvidence.state ===
    "established_by_post_pointer_setters"
  ) {
    const finalCallFor = (setter: ConfigurationSetterCall["setter"]) =>
      [...boundary.setterCalls]
        .filter((call) => call.setter === setter)
        .sort((left, right) => left.log.logIndex - right.log.logIndex)
        .at(-1);
    const pointerCall = finalCallFor("set_vote_parameters");
    const decayCall = finalCallFor("set_decay_length");
    const delegatedCall = finalCallFor("set_delegated_staking");
    const ybcCall = finalCallFor("set_ybc");
    const aggregatorCall = finalCallFor("set_ybc_weight_aggregator");
    if (
      !pointerCall ||
      !decayCall ||
      !delegatedCall ||
      !ybcCall ||
      !aggregatorCall ||
      !sameAddress(
        voterTargetEvidence.voterAddress,
        configuration.voterAddress
      ) ||
      voterTargetEvidence.pointerSetterLogIndex !==
        pointerCall.log.logIndex ||
      voterTargetEvidence.decayLengthSetterLogIndex !==
        decayCall.log.logIndex ||
      voterTargetEvidence.delegatedStakingSetterLogIndex !==
        delegatedCall.log.logIndex ||
      voterTargetEvidence.ybcSetterLogIndex !== ybcCall.log.logIndex ||
      voterTargetEvidence.ybcWeightAggregatorSetterLogIndex !==
        aggregatorCall.log.logIndex ||
      [decayCall, delegatedCall, ybcCall, aggregatorCall].some(
        (call) =>
          call.log.logIndex <= pointerCall.log.logIndex ||
          !sameAddress(call.target, configuration.voterAddress)
      )
    ) {
      issue(
        context,
        [...path, "boundary", "stateSnapshot", "voterTargetStateEvidence"],
        "A changed Voter pointer using row-local state must retain all four canonical Voter setters after the final set_vote_parameters log and target the new Voter."
      );
    }
  } else if (
    voterTargetEvidence.state ===
    "authenticated_preconfigured_voter_state"
  ) {
    const expectedValuesSha256 = deriveDaoVoterTargetStateValuesSha256({
      voterDecayLengthSeconds: configuration.voterDecayLengthSeconds,
      delegatedStakingAddress: configuration.delegatedStakingAddress,
      ybcAddress: configuration.ybcAddress,
      ybcWeightAggregatorAddress:
        configuration.ybcWeightAggregatorAddress,
    });
    const expectedProjection =
      deriveDaoVoterTargetStateProjectionSha256({
        voterAddress: configuration.voterAddress as Address,
        blockNumber: state.blockNumber,
        blockHash: state.blockHash as Hex,
        transactionIndex: state.transactionIndex,
        logIndex: state.logIndex,
        valuesSha256: expectedValuesSha256,
        historyFromBlockNumber:
          voterTargetEvidence.historyFromBlockNumber,
        historyToBlockNumber:
          voterTargetEvidence.historyToBlockNumber,
        historyToBlockHash: voterTargetEvidence.historyToBlockHash as Hex,
        historicalSetterLogCount:
          voterTargetEvidence.historicalSetterLogCount,
        historicalSetterManifestByteLength:
          voterTargetEvidence.historicalSetterManifestByteLength,
        historicalSetterManifestSha256:
          voterTargetEvidence.historicalSetterManifestSha256 as Hex,
        laterSameBlockRelevantSetterLogCount: 0,
      });
    const hasRowLocalNestedSetter = boundary.setterCalls.some(
      (call) =>
        call.setter === "set_decay_length" ||
        call.setter === "set_delegated_staking" ||
        call.setter === "set_ybc" ||
        call.setter === "set_ybc_weight_aggregator"
    );
    const historyFrom = toUint(
      voterTargetEvidence.historyFromBlockNumber
    );
    const historyTo = toUint(voterTargetEvidence.historyToBlockNumber);
    const codeBirth = voterTargetEvidence.codeBirthEvidence;
    const deploymentBlock = toUint(codeBirth.deploymentBlockNumber);
    const previousBlock = toUint(codeBirth.previousBlockNumber);
    const historicalLogs = voterTargetEvidence.historicalSetterLogs;
    const stateBlock = toUint(state.blockNumber);
    const voterHistoryManifest =
      canonicalizeDaoPreconfiguredVoterSetterManifest({
        chainId: feed.chainId,
        voterAddress: configuration.voterAddress as Address,
        historyFromBlockNumber:
          voterTargetEvidence.historyFromBlockNumber,
        historyToBlockNumber: voterTargetEvidence.historyToBlockNumber,
        historyToBlockHash: voterTargetEvidence.historyToBlockHash as Hex,
        codeBirthEvidence: codeBirth,
        historicalSetterLogs: historicalLogs,
        transactionEvidence: voterTargetEvidence.transactionEvidence,
        historyEvidence: {
          evidenceKind: voterTargetEvidence.evidenceKind,
          rpcMethods: voterTargetEvidence.rpcMethods,
          fixturePath: voterTargetEvidence.fixturePath,
          rawLogsSha256: voterTargetEvidence.rawLogsSha256 as Hex | null,
          manifestObjectKey: voterTargetEvidence.manifestObjectKey,
        },
      });
    const voterHistoryManifestBytes = toBytes(voterHistoryManifest);
    const expectedVoterHistoryManifestSha256 = sha256(
      voterHistoryManifestBytes
    );
    const expectedCodeBirthProjection =
      deriveDaoVoterCodeBirthProjectionSha256({
        address: codeBirth.address as Address,
        deploymentBlockNumber: codeBirth.deploymentBlockNumber,
        deploymentBlockHash: codeBirth.deploymentBlockHash as Hex,
        deploymentTransactionHash:
          codeBirth.deploymentTransactionHash as Hex,
        deploymentTransactionIndex: codeBirth.deploymentTransactionIndex,
        receiptStatus: "success",
        receiptContractAddress: codeBirth.receiptContractAddress as Address,
        previousBlockNumber: codeBirth.previousBlockNumber,
        previousBlockHash: codeBirth.previousBlockHash as Hex,
        previousCodeByteLength: 0,
        deployedCodeByteLength: codeBirth.deployedCodeByteLength,
        deployedBytecodeHash: codeBirth.deployedBytecodeHash as Hex,
        deployedRuntimeSha256: codeBirth.deployedRuntimeSha256 as Hex,
      });
    let replayedDecayLengthSeconds = 0;
    let replayedDelegatedStakingAddress = ZERO_ADDRESS;
    let replayedYbcAddress = ZERO_ADDRESS;
    let replayedAggregatorAddress = ZERO_ADDRESS;
    let previousHistoricalSetterPosition:
      | {
          blockNumber: string;
          transactionIndex: number;
          logIndex: number;
        }
      | null = null;
    let laterSameBlockRelevantSetterLogCount = 0;
    const historicalTracePathsByTransaction = new Map<
      string,
      Set<string>
    >();
    for (const [setterIndex, retained] of historicalLogs.entries()) {
      const setterPath = [
        ...path,
        "boundary",
        "stateSnapshot",
        "voterTargetStateEvidence",
        "historicalSetterLogs",
        setterIndex,
      ] as const;
      validateConfigurationSetterCall(
        retained.call,
        contract,
        configuration.voterAddress,
        context,
        [...setterPath, "call"]
      );
      const retainedBlock = toUint(retained.blockNumber);
      const retainedAfterCodeBirth =
        retainedBlock !== null &&
        deploymentBlock !== null &&
        (retainedBlock > deploymentBlock ||
          (retainedBlock === deploymentBlock &&
            retained.transactionIndex >
              codeBirth.deploymentTransactionIndex));
      const position = {
        blockNumber: retained.blockNumber,
        transactionIndex: retained.transactionIndex,
        logIndex: retained.call.log.logIndex,
      };
      const isPinnedVoterSetter =
        retained.call.setter === "set_decay_length" ||
        retained.call.setter === "set_delegated_staking" ||
        retained.call.setter === "set_ybc" ||
        retained.call.setter === "set_ybc_weight_aggregator";
      const historicalTransactionKey = `${retained.blockHash}:${retained.transactionIndex}:${retained.transactionHash}`;
      const historicalTracePaths =
        historicalTracePathsByTransaction.get(historicalTransactionKey) ??
        new Set<string>();
      const historicalTracePath = JSON.stringify(
        retained.call.traceAddress
      );
      if (
        !isPinnedVoterSetter ||
        retainedBlock === null ||
        historyFrom === null ||
        historyTo === null ||
        retainedBlock < historyFrom ||
        retainedBlock > historyTo ||
        retained.receiptStatus !== "success" ||
        (previousHistoricalSetterPosition !== null &&
          comparePositions(previousHistoricalSetterPosition, position) >= 0) ||
        !sameAddress(retained.call.target, configuration.voterAddress) ||
        historicalTracePaths.has(historicalTracePath) ||
        (retained.call.traceAddress.length === 0 &&
          !sameAddress(
            retained.call.caller,
            retained.transactionSender
          ))
      ) {
        issue(
          context,
          setterPath,
          "A preconfigured Voter manifest must retain every successful pinned Voter setter in strict canonical order from code birth through the exact boundary."
        );
      }
      if (!retainedAfterCodeBirth) {
        issue(
          context,
          setterPath,
          "Every retained preconfigured-Voter setter must be strictly after the authenticated Voter code-birth transaction position."
        );
      }
      historicalTracePaths.add(historicalTracePath);
      historicalTracePathsByTransaction.set(
        historicalTransactionKey,
        historicalTracePaths
      );
      if (
        retained.blockNumber === state.blockNumber &&
        (retained.transactionIndex > state.transactionIndex ||
          (retained.transactionIndex === state.transactionIndex &&
            retained.call.log.logIndex > state.logIndex))
      ) {
        laterSameBlockRelevantSetterLogCount += 1;
      }
      switch (retained.call.setter) {
        case "set_decay_length":
          replayedDecayLengthSeconds =
            retained.call.arguments.voterDecayLengthSeconds;
          break;
        case "set_delegated_staking":
          replayedDelegatedStakingAddress =
            retained.call.arguments.delegatedStakingAddress;
          break;
        case "set_ybc":
          replayedYbcAddress = retained.call.arguments.ybcAddress;
          break;
        case "set_ybc_weight_aggregator":
          replayedAggregatorAddress =
            retained.call.arguments.ybcWeightAggregatorAddress;
          break;
        default:
          break;
      }
      previousHistoricalSetterPosition = position;
    }
    validateConfigurationSetterTransactionEvidence({
      retainedLogs: historicalLogs,
      evidence: voterTargetEvidence.transactionEvidence,
      projectionKind: "preconfigured_voter_setter_transaction",
      context,
      path: [
        ...path,
        "boundary",
        "stateSnapshot",
        "voterTargetStateEvidence",
        "transactionEvidence",
      ],
    });
    const codeBirthBeforePointerBoundary =
      deploymentBlock !== null &&
      stateBlock !== null &&
      (deploymentBlock < stateBlock ||
        (deploymentBlock === stateBlock &&
          codeBirth.deploymentTransactionIndex < state.transactionIndex));
    if (!codeBirthBeforePointerBoundary) {
      issue(
        context,
        [
          ...path,
          "boundary",
          "stateSnapshot",
          "voterTargetStateEvidence",
          "codeBirthEvidence",
        ],
        "Authenticated Voter code birth must be strictly before the Voting pointer boundary that selects the Voter."
      );
    }
    if (
      !sameAddress(
        voterTargetEvidence.voterAddress,
        configuration.voterAddress
      ) ||
      voterTargetEvidence.blockNumber !== state.blockNumber ||
      voterTargetEvidence.blockHash !== state.blockHash ||
      voterTargetEvidence.transactionIndex !== state.transactionIndex ||
      voterTargetEvidence.logIndex !== state.logIndex ||
      voterTargetEvidence.values.voterDecayLengthSeconds !==
        configuration.voterDecayLengthSeconds ||
      !sameAddress(
        voterTargetEvidence.values.delegatedStakingAddress,
        configuration.delegatedStakingAddress
      ) ||
      !sameAddress(
        voterTargetEvidence.values.ybcAddress,
        configuration.ybcAddress
      ) ||
      !sameAddress(
        voterTargetEvidence.values.ybcWeightAggregatorAddress,
        configuration.ybcWeightAggregatorAddress
      ) ||
      voterTargetEvidence.valuesSha256 !== expectedValuesSha256 ||
      historyFrom === null ||
      historyTo === null ||
      deploymentBlock === null ||
      previousBlock === null ||
      historyFrom !== deploymentBlock ||
      previousBlock + 1n !== deploymentBlock ||
      historyFrom > historyTo ||
      voterTargetEvidence.historyToBlockNumber !== state.blockNumber ||
      voterTargetEvidence.historyToBlockHash !== state.blockHash ||
      !sameAddress(codeBirth.address, configuration.voterAddress) ||
      !sameAddress(
        codeBirth.receiptContractAddress,
        configuration.voterAddress
      ) ||
      configuration.voterImplementation.state !== "verified_pinned" ||
      !sameAddress(
        configuration.voterImplementation.address,
        codeBirth.address
      ) ||
      codeBirth.deployedCodeByteLength !==
        configuration.voterImplementation.bytecode.codeByteLength ||
      codeBirth.deployedBytecodeHash !==
        configuration.voterImplementation.bytecode.deployedBytecodeHash ||
      codeBirth.deployedRuntimeSha256 !==
        configuration.voterImplementation.bytecode.deployedRuntimeSha256 ||
      voterTargetEvidence.historicalSetterLogCount !==
        historicalLogs.length ||
      voterTargetEvidence.historicalSetterManifestByteLength !==
        voterHistoryManifestBytes.length ||
      voterTargetEvidence.historicalSetterManifestSha256 !==
        expectedVoterHistoryManifestSha256 ||
      laterSameBlockRelevantSetterLogCount !== 0 ||
      replayedDecayLengthSeconds !==
        configuration.voterDecayLengthSeconds ||
      !sameAddress(
        replayedDelegatedStakingAddress,
        configuration.delegatedStakingAddress
      ) ||
      !sameAddress(replayedYbcAddress, configuration.ybcAddress) ||
      !sameAddress(
        replayedAggregatorAddress,
        configuration.ybcWeightAggregatorAddress
      ) ||
      hasRowLocalNestedSetter
    ) {
      issue(
        context,
        [...path, "boundary", "stateSnapshot", "voterTargetStateEvidence"],
        "A pointer to a preconfigured Voter must bind all four nested values to an independent exact-boundary history/state projection, not guess them from the new address or mix the proof with row-local initialization."
      );
    }
    if (
      codeBirth.evidenceKind === "committed_synthetic_fixture" &&
      codeBirth.fixtureProjectionSha256 !== expectedCodeBirthProjection
    ) {
      issue(
        context,
        [
          ...path,
          "boundary",
          "stateSnapshot",
          "voterTargetStateEvidence",
          "codeBirthEvidence",
        ],
        "Synthetic Voter code-birth evidence must reproduce the exact deployment receipt and zero-before/nonzero-after code projection."
      );
    }
    if (
      voterTargetEvidence.evidenceKind ===
      "committed_synthetic_fixture"
    ) {
      if (
        voterTargetEvidence.rpcMethods !== null ||
        voterTargetEvidence.fixturePath !==
          "tests/fixtures/dao-feed-v1.ts" ||
        voterTargetEvidence.fixtureProjectionSha256 !==
          expectedProjection ||
        voterTargetEvidence.rawLogsSha256 !== null ||
        voterTargetEvidence.manifestObjectKey !== null
      ) {
        issue(
          context,
          [...path, "boundary", "stateSnapshot", "voterTargetStateEvidence"],
          "Synthetic preconfigured-Voter state evidence must reproduce its exact committed history/state projection without archive claims."
        );
      }
    } else if (
      voterTargetEvidence.rpcMethods === null ||
      voterTargetEvidence.fixturePath !== null ||
      voterTargetEvidence.fixtureProjectionSha256 !== null ||
      voterTargetEvidence.rawLogsSha256 === null ||
      voterTargetEvidence.manifestObjectKey === null
    ) {
      issue(
        context,
        [...path, "boundary", "stateSnapshot", "voterTargetStateEvidence"],
        "Live preconfigured-Voter evidence must retain exact eth_call/eth_getLogs provenance and raw log bytes without synthetic fields."
      );
    }
  } else if (voterTargetEvidence.state === "disabled_zero_pointer") {
    const pointerCall = [...boundary.setterCalls]
      .filter((call) => call.setter === "set_vote_parameters")
      .sort((left, right) => left.log.logIndex - right.log.logIndex)
      .at(-1);
    const hasNestedSetter = boundary.setterCalls.some(
      (call) =>
        call.setter === "set_decay_length" ||
        call.setter === "set_delegated_staking" ||
        call.setter === "set_ybc" ||
        call.setter === "set_ybc_weight_aggregator"
    );
    if (
      !pointerCall ||
      pointerCall.log.logIndex !==
        voterTargetEvidence.pointerSetterLogIndex ||
      pointerCall.arguments.voterAddress !== ZERO_ADDRESS ||
      configuration.voterAddress !== ZERO_ADDRESS ||
      configuration.voterState !== "disabled_zero_address" ||
      configuration.voterImplementation.state !==
        "disabled_zero_address" ||
      configuration.voterDecayLengthSeconds !== 0 ||
      configuration.delegatedStakingAddress !== ZERO_ADDRESS ||
      configuration.delegatedStakingState !== "zero_address" ||
      configuration.ybcAddress !== ZERO_ADDRESS ||
      configuration.ybcState !== "zero_address" ||
      configuration.ybcWeightAggregatorAddress !== ZERO_ADDRESS ||
      configuration.ybcWeightAggregatorState !== "zero_address" ||
      hasNestedSetter
    ) {
      issue(
        context,
        [...path, "boundary", "stateSnapshot", "voterTargetStateEvidence"],
        "A contract-valid zero Voter pointer transition requires the exact set_vote_parameters log and an explicitly non-applicable canonical-zero nested Voter state without impossible calls to address zero."
      );
    }
  } else {
    issue(
      context,
      [...path, "boundary", "stateSnapshot", "voterTargetStateEvidence"],
      "A changed Voter pointer cannot inherit nested state from the prior pointer."
    );
  }
  if (
    state.blockNumber !== configuration.effectiveAt.blockNumber ||
    state.blockHash !== configuration.effectiveAt.blockHash ||
    state.transactionIndex !== configuration.effectiveAt.transactionIndex ||
    state.logIndex !== configuration.effectiveAt.logIndex ||
    state.configurationValuesSha256 !== configurationHash ||
    priorHistory === null ||
    state.trackedSetterHistoryLogCount !==
      priorHistory.count + boundary.setterCalls.length ||
    state.trackedSetterHistoryManifestSha256 !==
      expectedHistoryManifestSha256
  ) {
    issue(context, [...path, "boundary", "stateSnapshot"], `Post-setter state evidence must bind the exact final setter log, chain the prior canonical setter manifest plus this receipt/call batch, and reproduce the complete configuration projection (expected config ${configurationHash}, retained ${state.configurationValuesSha256}; expected history ${expectedHistoryManifestSha256}, retained ${state.trackedSetterHistoryManifestSha256}).`);
  }
  if (state.evidenceKind === "committed_synthetic_fixture") {
    const expectedState = deriveDaoConfigurationSetterStateProjectionSha256({
      votingAddress: contract.votingAddress as Address,
      blockNumber: state.blockNumber,
      blockHash: state.blockHash as Hex,
      transactionIndex: state.transactionIndex,
      logIndex: state.logIndex,
      configurationValuesSha256: state.configurationValuesSha256 as Hex,
      trackedSetterHistoryLogCount: state.trackedSetterHistoryLogCount,
      trackedSetterHistoryManifestSha256:
        state.trackedSetterHistoryManifestSha256 as Hex,
    });
    if (
      state.fixtureProjectionSha256 !== expectedState ||
      state.rpcMethods !== null ||
      state.fixturePath !== "tests/fixtures/dao-feed-v1.ts" ||
      state.manifestObjectKey !== null
    ) {
      issue(context, [...path, "boundary", "stateSnapshot"], "Synthetic post-setter state evidence must reproduce its complete canonical history/state projection.");
    }
  } else if (
    state.fixturePath !== null ||
    state.fixtureProjectionSha256 !== null ||
    state.manifestObjectKey === null
  ) {
    issue(context, [...path, "boundary", "stateSnapshot"], "Live post-setter state evidence must retain its canonical replay manifest and omit synthetic fixture fields.");
  }
  applyConfigurationMutationAssertions(
    configuration,
    previous,
    boundary.setterCalls,
    context,
    path
  );
}

function validateProposals(
  feed: StructuralFeed,
  contracts: Map<string, StructuralFeed["contracts"][number]>,
  context: RefinementContext
): void {
  const proposalKeys = new Set<string>();
  const eventIds = new Set<string>();
  const logCoordinates = new Set<string>();
  const blockGlobalLogIndices = new Map<
    string,
    {
      category:
        | "configuration"
        | "voter_history"
        | "authorization"
        | "lifecycle";
      identity: string;
    }
  >();
  const retainedSetterTransactions = new Map<
    string,
    {
      blockNumber: string;
      blockHash: string;
      transactionIndex: number;
      transactionSender: string;
      tracePaths: Map<string, string>;
    }
  >();
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

  const registerRetainedCanonicalLog = (input: {
    chainId: number;
    blockNumber: string;
    blockHash: string;
    timestamp: number | null;
    transactionHash: string;
    transactionIndex: number;
    logIndex: number;
    category: "configuration" | "voter_history" | "authorization";
    identity: unknown;
    setterReference?: {
      transactionSender: string;
      call: ConfigurationSetterCall;
    };
    path: PropertyKey[];
  }): void => {
    const blockGlobalLogIndex = `${input.chainId}:${input.blockHash}:${input.logIndex}`;
    const identity = canonicalHashJson(input.identity);
    const priorLog = blockGlobalLogIndices.get(blockGlobalLogIndex);
    if (priorLog) {
      if (
        priorLog.identity === identity
      ) {
        // One physical Set* log may be referenced by multiple configuration,
        // Voter-history, or authorization proofs. Reconcile the transaction
        // and trace identity below, but enroll its global ordering only once.
      } else {
        issue(
          context,
          [...input.path, "logIndex"],
          "Ethereum logIndex must be block-global across lifecycle, configuration-setter, and retained Executor-authorization logs."
        );
      }
    } else {
      blockGlobalLogIndices.set(blockGlobalLogIndex, {
        category: input.category,
        identity,
      });
      const orderedLogs = orderedLogsByBlock.get(input.blockHash) ?? [];
      orderedLogs.push({
        transactionIndex: input.transactionIndex,
        logIndex: input.logIndex,
        path: input.path,
      });
      orderedLogsByBlock.set(input.blockHash, orderedLogs);
    }

    if (input.setterReference) {
      const transaction = retainedSetterTransactions.get(
        input.transactionHash
      );
      const tracePath = JSON.stringify(
        input.setterReference.call.traceAddress
      );
      const callIdentity = canonicalHashJson({
        transactionSender: input.setterReference.transactionSender,
        caller: input.setterReference.call.caller,
        target: input.setterReference.call.target,
        traceAddress: input.setterReference.call.traceAddress,
        setter: input.setterReference.call.setter,
        selector: input.setterReference.call.selector,
        calldata: input.setterReference.call.calldata,
        arguments: input.setterReference.call.arguments,
        log: input.setterReference.call.log,
      });
      if (!transaction) {
        retainedSetterTransactions.set(input.transactionHash, {
          blockNumber: input.blockNumber,
          blockHash: input.blockHash,
          transactionIndex: input.transactionIndex,
          transactionSender: input.setterReference.transactionSender,
          tracePaths: new Map([[tracePath, callIdentity]]),
        });
      } else {
        if (
          transaction.blockNumber !== input.blockNumber ||
          transaction.blockHash !== input.blockHash ||
          transaction.transactionIndex !== input.transactionIndex ||
          !sameAddress(
            transaction.transactionSender,
            input.setterReference.transactionSender
          )
        ) {
          issue(
            context,
            input.path,
            "Every retained setter transaction reference must agree on one canonical position and authenticated transaction sender feed-wide."
          );
        }
        const priorCall = transaction.tracePaths.get(tracePath);
        if (priorCall && priorCall !== callIdentity) {
          issue(
            context,
            [...input.path, "traceAddress"],
            "One feed-wide setter transaction trace path must identify one exact caller, target, calldata, decoded mutation, and canonical log."
          );
        } else if (!priorCall) {
          transaction.tracePaths.set(tracePath, callIdentity);
        }
      }
    }

    const blockGroup = blockGroups.get(input.blockNumber);
    if (
      blockGroup &&
      (blockGroup.blockHash !== input.blockHash ||
        (blockGroup.timestamp !== null &&
          input.timestamp !== null &&
          blockGroup.timestamp !== input.timestamp))
    ) {
      issue(
        context,
        input.path,
        "Retained canonical logs at one block height must share its hash and known timestamp."
      );
    } else if (!blockGroup) {
      blockGroups.set(input.blockNumber, {
        blockHash: input.blockHash,
        timestamp: input.timestamp,
      });
    } else if (blockGroup.timestamp === null && input.timestamp !== null) {
      blockGroup.timestamp = input.timestamp;
    }

    const blockHashGroup = blockHashGroups.get(input.blockHash);
    if (
      blockHashGroup &&
      (blockHashGroup.blockNumber !== input.blockNumber ||
        (blockHashGroup.timestamp !== null &&
          input.timestamp !== null &&
          blockHashGroup.timestamp !== input.timestamp))
    ) {
      issue(
        context,
        [...input.path, "blockHash"],
        "One retained canonical block hash must map to exactly one height and known timestamp."
      );
    } else if (!blockHashGroup) {
      blockHashGroups.set(input.blockHash, {
        blockNumber: input.blockNumber,
        timestamp: input.timestamp,
      });
    } else if (
      blockHashGroup.timestamp === null &&
      input.timestamp !== null
    ) {
      blockHashGroup.timestamp = input.timestamp;
    }

    const transactionKey = `${input.blockHash}:${input.transactionIndex}`;
    const transactionGroup = transactionGroups.get(transactionKey);
    if (
      transactionGroup &&
      (transactionGroup.blockNumber !== input.blockNumber ||
        transactionGroup.blockHash !== input.blockHash ||
        (transactionGroup.timestamp !== null &&
          input.timestamp !== null &&
          transactionGroup.timestamp !== input.timestamp) ||
        transactionGroup.transactionHash !== input.transactionHash)
    ) {
      issue(
        context,
        input.path,
        "One canonical transaction position must bind exactly one transaction hash, block, and known timestamp across all retained logs."
      );
    } else if (!transactionGroup) {
      transactionGroups.set(transactionKey, {
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        timestamp: input.timestamp,
        transactionHash: input.transactionHash,
      });
    } else if (
      transactionGroup.timestamp === null &&
      input.timestamp !== null
    ) {
      transactionGroup.timestamp = input.timestamp;
    }

    const reverse = transactionHashGroups.get(input.transactionHash);
    if (
      reverse &&
      (reverse.blockNumber !== input.blockNumber ||
        reverse.blockHash !== input.blockHash ||
        reverse.transactionIndex !== input.transactionIndex)
    ) {
      issue(
        context,
        [...input.path, "transactionHash"],
        "One retained transaction hash must map back to exactly one canonical block and transaction position."
      );
    } else if (!reverse) {
      transactionHashGroups.set(input.transactionHash, {
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        transactionIndex: input.transactionIndex,
      });
    }
  };

  for (const [contractIndex, contract] of feed.contracts.entries()) {
    for (const [configurationIndex, configuration] of
      contract.configurationHistory.entries()) {
      if (
        configuration.boundary.kind ===
        "producer_start_state_snapshot_sentinel"
      ) {
        for (const [setterIndex, retained] of
          configuration.boundary.scanManifest.trackedSetterLogs.entries()) {
          registerRetainedCanonicalLog({
            chainId: feed.chainId,
            blockNumber: retained.blockNumber,
            blockHash: retained.blockHash,
            timestamp: retained.blockTimestamp,
            transactionHash: retained.transactionHash,
            transactionIndex: retained.transactionIndex,
            logIndex: retained.call.log.logIndex,
            category: "configuration",
            identity: {
              transactionHash: retained.transactionHash,
              emitter: retained.call.log.emitter,
              topics: retained.call.log.topics,
              data: retained.call.log.data,
            },
            setterReference: {
              transactionSender: retained.transactionSender,
              call: retained.call,
            },
            path: [
              "contracts",
              contractIndex,
              "configurationHistory",
              configurationIndex,
              "boundary",
              "scanManifest",
              "trackedSetterLogs",
              setterIndex,
              "call",
              "log",
            ],
          });
        }
      } else {
        for (const [setterIndex, call] of
          configuration.boundary.setterCalls.entries()) {
          registerRetainedCanonicalLog({
            chainId: feed.chainId,
            blockNumber: configuration.boundary.receipt.blockNumber,
            blockHash: configuration.boundary.receipt.blockHash,
            timestamp: configuration.boundary.receipt.blockTimestamp,
            transactionHash:
              configuration.boundary.receipt.transactionHash,
            transactionIndex:
              configuration.boundary.receipt.transactionIndex,
            logIndex: call.log.logIndex,
            category: "configuration",
            identity: {
              transactionHash:
                configuration.boundary.receipt.transactionHash,
              emitter: call.log.emitter,
              topics: call.log.topics,
              data: call.log.data,
            },
            setterReference: {
              transactionSender:
                configuration.boundary.receipt.transactionSender,
              call,
            },
            path: [
              "contracts",
              contractIndex,
              "configurationHistory",
              configurationIndex,
              "boundary",
              "setterCalls",
              setterIndex,
              "log",
            ],
          });
        }
        const voterTargetEvidence =
          configuration.boundary.stateSnapshot.voterTargetStateEvidence;
        if (
          voterTargetEvidence.state ===
          "authenticated_preconfigured_voter_state"
        ) {
          for (const [setterIndex, retained] of
            voterTargetEvidence.historicalSetterLogs.entries()) {
            registerRetainedCanonicalLog({
              chainId: feed.chainId,
              blockNumber: retained.blockNumber,
              blockHash: retained.blockHash,
              timestamp: retained.blockTimestamp,
              transactionHash: retained.transactionHash,
              transactionIndex: retained.transactionIndex,
              logIndex: retained.call.log.logIndex,
              category: "voter_history",
              identity: {
                transactionHash: retained.transactionHash,
                emitter: retained.call.log.emitter,
                topics: retained.call.log.topics,
                data: retained.call.log.data,
              },
              setterReference: {
                transactionSender: retained.transactionSender,
                call: retained.call,
              },
              path: [
                "contracts",
                contractIndex,
                "configurationHistory",
                configurationIndex,
                "boundary",
                "stateSnapshot",
                "voterTargetStateEvidence",
                "historicalSetterLogs",
                setterIndex,
                "call",
                "log",
              ],
            });
          }
        }
      }
    }
  }

  for (const [proposalIndex, proposal] of feed.proposals.entries()) {
    const simulation = proposal.analysis.proposalSimulation;
    if (
      simulation.state !== "succeeded" &&
      simulation.state !== "failed"
    ) {
      continue;
    }
    for (const [setterIndex, setterLog] of
      simulation.frameContext.executorOperatorAuthorization.positionReplay
        .relevantSetterLogs.entries()) {
      registerRetainedCanonicalLog({
        chainId: feed.chainId,
        blockNumber: setterLog.blockNumber,
        blockHash: setterLog.blockHash,
        // SetOperator evidence carries no authenticated block timestamp.
        // Never borrow the later Propose timestamp for an earlier setter log.
        timestamp: null,
        transactionHash: setterLog.transactionHash,
        transactionIndex: setterLog.transactionIndex,
        logIndex: setterLog.logIndex,
        category: "authorization",
        identity: {
          transactionHash: setterLog.transactionHash,
          emitter: setterLog.emitter,
          topics: setterLog.topics,
          data: setterLog.data,
        },
        path: [
          "proposals",
          proposalIndex,
          "analysis",
          "proposalSimulation",
          "frameContext",
          "executorOperatorAuthorization",
          "positionReplay",
          "relevantSetterLogs",
          setterIndex,
        ],
      });
    }
  }

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
      blockGlobalLogIndices.set(blockGlobalLogIndex, {
        category: "lifecycle",
        identity: canonicalHashJson({
          transactionHash: event.log.transactionHash,
          votingAddress: proposal.ref.votingAddress,
          eventId: event.eventId,
        }),
      });
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

  validateRules(feed, proposal, contract, context, [...path, "rules"]);
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
  feed: StructuralFeed,
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
  validateProposalThresholdEvidence(
    proposal,
    propose,
    context,
    [...path, "thresholdEvidence"]
  );
  const effective =
    contract && propose
      ? getEffectiveConfiguration(contract, propose.log)
      : null;
  if (!effective || !configurationValuesMatch(mutable, effective)) {
    issue(context, [...path, "mutableConfiguration"], "Proposal rules must equal the effective historical configuration at the Propose event.");
  }
  if (
    effective &&
    (compareConfigurationEffectivePositions(
      mutable.observedAt,
      effective.effectiveAt
    ) !== 0 ||
      mutable.observedAt.blockHash !== effective.effectiveAt.blockHash)
  ) {
    issue(context, [...path, "mutableConfiguration", "observedAt"], "Proposal configuration block hash and position must match its effective lifecycle provenance.");
  }

  if (contract) {
    const votingEpoch = toUint(proposal.votingEpoch);
    const snapshotConfiguration = getSnapshotConfiguration(
      contract,
      feed.canonicalBlock.number
    );
    if (
      !snapshotConfiguration ||
      proposal.statusConfiguration.configurationId !==
        snapshotConfiguration.configurationId ||
      compareConfigurationEffectivePositions(
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

function validateProposalThresholdEvidence(
  proposal: FeedProposal,
  propose: FeedEvent | undefined,
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  const evidence = proposal.rules.thresholdEvidence;
  validatePinnedVotingSource(evidence.source, context, [...path, "source"]);
  const proposalId = toUint(proposal.ref.proposalId);
  const storedWord = toUint256Hex(evidence.storageWord);
  const slots =
    proposalId === null
      ? null
      : deriveDaoVotingThresholdStorageSlots(proposalId);
  if (
    !propose ||
    proposalId === null ||
    storedWord === null ||
    slots === null ||
    !sameAddress(evidence.votingAddress, proposal.ref.votingAddress) ||
    evidence.proposalId !== proposal.ref.proposalId ||
    evidence.blockNumber !== propose.log.blockNumber ||
    evidence.blockHash !== propose.log.blockHash ||
    evidence.storageLayout.mappingKey !== proposal.ref.proposalId ||
    evidence.storageLayout.proposalStorageBaseSlot !==
      slots.proposalStorageBaseSlot ||
    evidence.storageLayout.resolvedStorageSlot !== slots.resolvedStorageSlot ||
    evidence.storageWord !== encodeUint256Word(storedWord) ||
    storedWord > BigInt(DAO_BPS) ||
    Number(storedWord) !== evidence.decodedThresholdBps ||
    evidence.decodedThresholdBps !== proposal.thresholdBps ||
    evidence.decodedThresholdBps !== proposal.rules.approvalThresholdBps
  ) {
    issue(
      context,
      path,
      "Stored proposal-threshold evidence must bind the exact Voting address, Propose block, Vyper slot-then-key mapping base plus threshold offset, canonical storage word, and both threshold copies."
    );
  }
  validateRpcOrSyntheticEvidence(
    evidence,
    {
      archiveKind: "archive_rpc",
      syntheticKind: "committed_synthetic_fixture",
      rpcMethod: "eth_getStorageAt",
      projectionType: "proposal_threshold_eth_getStorageAt_projection",
      projection: {
        votingAddress: evidence.votingAddress,
        proposalId: evidence.proposalId,
        blockNumber: evidence.blockNumber,
        blockHash: evidence.blockHash,
        resolvedStorageSlot: evidence.storageLayout.resolvedStorageSlot,
        storageWord: evidence.storageWord,
      },
    },
    context,
    path
  );
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
  if (!isCanonicalIsoUtc(structural.data.createdAt)) {
    return "CONTENT_SCHEMA_INVALID";
  }
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
        discussion.url !== `${url.origin}${url.pathname}` ||
        !/^\/t\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[1-9]\d*$/u.test(
          url.pathname
        )
      ) {
        issue(context, [...path, "url"], "Verified discussion provenance must use one canonical gov.yearn.fi /t/<slug>/<id> topic without query, fragment, port, trailing slash, or ambiguous path.");
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
  const opaquePositivePinnedVotes: Array<{ event: Vote; index: number }> = [];
  for (const [index, candidate] of proposal.events.entries()) {
    if (candidate.type !== "vote") {
      continue;
    }
    if (
      candidate.data.classification.method ===
        "pinned_voter_trace_unavailable" &&
      (toUint(candidate.data.weight) ?? 0n) > 0n
    ) {
      opaquePositivePinnedVotes.push({ event: candidate, index });
      continue;
    }
    if (candidate.data.classification.method !== "pinned_voter_call_trace") {
      continue;
    }
    const invocationId = candidate.data.classification.trace.invocationId;
    const group = groups.get(invocationId) ?? [];
    group.push({ event: candidate, index });
    groups.set(invocationId, group);
  }

  const cumulativeAggregates = new Map<
    string,
    { total: bigint; scaledYea: bigint }
  >();
  const orderedGroups = [...groups.values()].sort((left, right) =>
    comparePositions(left[0]!.event.log, right[0]!.event.log)
  );
  for (const group of orderedGroups) {
    const first = group[0]!;
    const classification = first.event.data.classification;
    if (classification.method !== "pinned_voter_call_trace") continue;
    const trace = classification.trace;
    const normalizedVoterPath =
      trace.voterCallTraceAddress.length === 0
        ? "root"
        : trace.voterCallTraceAddress.join(".");
    const expectedInvocationId = `${proposal.ref.chainId}:${proposal.ref.votingAddress.toLowerCase()}:${trace.transactionHash.toLowerCase()}:${normalizedVoterPath}`;
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
        (value, pathIndex) =>
          itemTrace.votingCallTraceAddress[pathIndex] === value
      );
      const expectedChildIndex =
        itemTrace.votingCallOrdinal === 0
          ? 1
          : itemTrace.votingCallOrdinal === 1
            ? 4
            : 5;
      const expectedVotingPath = [
        ...itemTrace.voterCallTraceAddress,
        expectedChildIndex,
      ];
      const expectedTraceProjection = deriveDaoVoterTraceProjectionSha256({
        transactionHash: itemTrace.transactionHash as Hex,
        voterCallTraceAddress: itemTrace.voterCallTraceAddress,
        voterSelector: itemTrace.voterSelector,
        voterCaller: itemTrace.voterCaller as Address,
        votingTarget: itemTrace.votingTarget as Address,
        proposalId: itemTrace.proposalId,
        ybcMembership: itemTrace.ybcMembership,
        aggregatePathExecuted: itemTrace.aggregatePathExecuted,
        aggregatorResult: itemTrace.aggregatorResult,
      });
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
        itemTrace.pathSemantics !== "full_call_tree_child_indices" ||
        JSON.stringify(itemTrace.traceEvidence) !==
          JSON.stringify(trace.traceEvidence) ||
        JSON.stringify(itemTrace.aggregatorResult) !==
          JSON.stringify(trace.aggregatorResult) ||
        itemTrace.voterCallDepth !== itemTrace.voterCallTraceAddress.length ||
        itemTrace.votingCallDepth !== itemTrace.votingCallTraceAddress.length ||
        itemTrace.votingCallDepth !== itemTrace.voterCallDepth + 1 ||
        !hasVoterPrefix ||
        !numberArraysEqual(
          itemTrace.votingCallTraceAddress,
          expectedVotingPath
        ) ||
        (itemTrace.traceEvidence.sourceKind ===
          "committed_synthetic_fixture" &&
          itemTrace.traceEvidence.fixtureProjectionSha256 !==
            expectedTraceProjection) ||
        seenTracePaths.has(tracePath) ||
        (previousPosition !== null &&
          comparePositions(previousPosition, event.log) >= 0)
      ) {
        issue(
          context,
          [...proposalPath, "events", index, "data", "classification", "trace"],
          "Pinned Voter invocation events must share one reproducible, unambiguous parent trace and use unique child frame paths [1]/[4]/[5] in strict emitted-log order."
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
      if (
        opaquePositivePinnedVotes.some(
          ({ event }) =>
            event.actor.address !== null &&
            sameAddress(event.actor.address, trace.voterCaller) &&
            comparePositions(event.log, human.event.log) < 0
        )
      ) {
        issue(
          context,
          [
            ...proposalPath,
            "events",
            first.index,
            "data",
            "classification",
            "trace",
            "voterCaller",
          ],
          "The caller already voted: a complete pinned Voter call must reject an account with a prior positive trace-unavailable raw Vote because Voting.voted permits one submission."
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
      const hasOpaquePriorAggregateState = opaquePositivePinnedVotes.some(
        ({ event }) =>
          event.data.classification.method ===
            "pinned_voter_trace_unavailable" &&
          sameAddress(
            event.data.classification.voterAddress,
            classification.voterAddress
          ) &&
          comparePositions(event.log, first.event.log) < 0
      );
      if (hasOpaquePriorAggregateState) {
        issue(
          context,
          [
            ...proposalPath,
            "events",
            first.index,
            "data",
            "classification",
            "trace",
            "aggregatorResult",
          ],
          "Pinned Voter aggregate replay cannot resume after an opaque earlier invocation: later aggregate-bearing events must cascade to raw/unclassified until authenticated cumulative state is available."
        );
      }
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
      const aggregateWeight = toUint(trace.aggregatorResult.weight);
      const aggregateKey = classification.voterAddress.toLowerCase();
      const prior = cumulativeAggregates.get(aggregateKey) ?? {
        total: 0n,
        scaledYea: 0n,
      };
      const scaledIncrement =
        aggregateWeight !== null && trace.voterSelector === "0x69586e2e"
          ? aggregateWeight * BigInt(DAO_BPS)
          : 0n;
      const nextTotal =
        aggregateWeight === null ? UINT256_MAX + 1n : prior.total + aggregateWeight;
      const nextScaledYea = prior.scaledYea + scaledIncrement;
      if (
        aggregateWeight === null ||
        (trace.voterSelector === "0x69586e2e" &&
          aggregateWeight > MAX_BPS_SAFE_WEIGHT) ||
        nextTotal > UINT256_MAX ||
        nextScaledYea > UINT256_MAX
      ) {
        issue(
          context,
          [
            ...proposalPath,
            "events",
            first.index,
            "data",
            "classification",
            "trace",
            "aggregatorResult",
          ],
          "Pinned Voter ybc_votes cumulative Voter weight overflow or 10000-scaled cumulative Yea overflow is invalid under checked uint256 arithmetic."
        );
      } else {
        cumulativeAggregates.set(aggregateKey, {
          total: nextTotal,
          scaledYea: nextScaledYea,
        });
        const expectedAggregateBps = Number(nextScaledYea / nextTotal);
        if (
          delegated?.event.data.yeaBps !== expectedAggregateBps ||
          ybc?.event.data.yeaBps !== expectedAggregateBps
        ) {
          issue(
            context,
            [
              ...proposalPath,
              "events",
              first.index,
              "data",
              "classification",
              "trace",
              "aggregatorResult",
            ],
            `Pinned Voter ybc_votes cumulative aggregator basis points must equal ${expectedAggregateBps} for both aggregate Vote logs.`
          );
        }
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

function deriveCheckedPassage(
  total: bigint,
  yea: bigint,
  thresholdBps: number
): { arithmeticValid: boolean; passed: boolean } {
  const threshold = BigInt(thresholdBps);
  if (
    total < 0n ||
    yea < 0n ||
    total > UINT256_MAX ||
    yea > UINT256_MAX ||
    yea > MAX_BPS_SAFE_WEIGHT ||
    (threshold > 0n && total > UINT256_MAX / threshold)
  ) {
    return { arithmeticValid: false, passed: false };
  }
  return {
    arithmeticValid: true,
    passed:
      total > 0n &&
      yea * BigInt(DAO_BPS) >= total * threshold,
  };
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
  if (compareConfigurationToEventPosition(observation, event.log) > 0) {
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
  if (!sameAddress(creation.receipt.transactionSender, proposal.proposer)) {
    issue(
      context,
      [...path, "receipt", "transactionSender"],
      "Creation receipt transaction sender must equal the canonical Propose proposer."
    );
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
      const passage = deriveCheckedPassage(
        totals.total,
        totals.yea,
        proposal.thresholdBps
      );
      const passes = passage.passed;
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
      if (!passage.arithmeticValid) {
        issue(
          context,
          [...path, "events", index],
          "Execute passage proof is impossible when checked yea * 10000 or total * threshold uint256 arithmetic would overflow."
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
  const finalTotals = calculateVoteTotals(proposal.events);
  const checkedPassage = deriveCheckedPassage(
    finalTotals.total,
    finalTotals.yea,
    proposal.thresholdBps
  );
  const passageEvaluationRequired =
    feed.canonicalBlock.timestamp >= proposal.voteEndsAt &&
    !eventTypes.has("retract") &&
    !eventTypes.has("flag") &&
    !eventTypes.has("veto");
  if (passageEvaluationRequired && !checkedPassage.arithmeticValid) {
    issue(
      context,
      [...path, "protocolStatus"],
      "Protocol passage cannot be derived when checked yea * 10000 or total * threshold uint256 arithmetic would overflow."
    );
  }
  if (
    derivationPrerequisitesValid &&
    (!passageEvaluationRequired || checkedPassage.arithmeticValid) &&
    postVoteEpochEnd !== null &&
    postVoteEpochEnd <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    const postVoteEpochEndsAt = Number(postVoteEpochEnd);
    const statusConfiguration = contract
      ? getSnapshotConfiguration(contract, feed.canonicalBlock.number)
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
  if (analysis.state === "failed") {
    const hasFailedDecode = analysis.calls.some(
      (call) => call.decodeStatus === "failed"
    );
    const simulationFailed = simulation.state === "failed";
    const expectedSource = hasFailedDecode ? "decoder" : "simulation";
    if (
      analysis.error.source !== expectedSource ||
      (hasFailedDecode && !analysis.error.code.includes("DECODE")) ||
      (!hasFailedDecode &&
        simulationFailed &&
        analysis.error.code !== "SIMULATION_REVERTED")
    ) {
      issue(
        context,
        [...path, "error"],
        `Failed analysis summary must name the actual failed component ${expectedSource} with its canonical code.`
      );
    }
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
    if (call.decodeStatus === "failed" && call.verifiedSource !== null) {
      validateSource(
        call.verifiedSource,
        context,
        [...path, "calls", index, "verifiedSource"]
      );
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
      validateRpcOrSyntheticEvidence(
        simulationExecutor.bytecode,
        {
          archiveKind: "archive_rpc_and_reproducible_build",
          syntheticKind:
            "committed_synthetic_fixture_and_reproducible_build",
          rpcMethod: "eth_getCode",
          projectionType: "executor_eth_getCode_projection",
          projection: {
            address: simulationExecutor.bytecode.address,
            blockNumber: simulationExecutor.bytecode.blockNumber,
            blockHash: simulationExecutor.bytecode.blockHash,
            codeByteLength: simulationExecutor.bytecode.codeByteLength,
            deployedBytecodeHash:
              simulationExecutor.bytecode.deployedBytecodeHash,
          },
        },
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "executorImplementation",
          "bytecode",
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
    const excessBlobGas = toUint(gasContext.blockHeader.excessBlobGas);
    const blobBaseFeeWei = toUint(gasContext.blobBaseFeeWei);
    const expectedExecutorFrameInitialGas =
      headerGasLimit === null
        ? null
        : headerGasLimit < 30_000_000n
          ? headerGasLimit
          : 30_000_000n;
    const creation =
      proposal.creation.state === "indexed" ? proposal.creation : null;
    if (gasContext.chainId !== 1) {
      issue(
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "chainId",
        ],
        "Completed v1 simulations use the pinned Ethereum mainnet schedule and therefore require chainId 1."
      );
    }
    validateSource(
      gasContext.chainSpec.source,
      context,
      [
        ...path,
        "proposalSimulation",
        "frameContext",
        "gasContext",
        "chainSpec",
        "source",
      ]
    );
    const chainSpecSource = gasContext.chainSpec.source;
    if (
      chainSpecSource.kind !== PINNED_MAINNET_CHAIN_SPEC.kind ||
      chainSpecSource.label !== PINNED_MAINNET_CHAIN_SPEC.label ||
      chainSpecSource.repository !== PINNED_MAINNET_CHAIN_SPEC.repository ||
      chainSpecSource.revision !== PINNED_MAINNET_CHAIN_SPEC.revision ||
      chainSpecSource.sourcePath !== PINNED_MAINNET_CHAIN_SPEC.sourcePath ||
      chainSpecSource.url !== PINNED_MAINNET_CHAIN_SPEC.url
    ) {
      issue(
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "chainSpec",
          "source",
        ],
        "Completed simulation must bind the exact pinned go-ethereum mainnet chain-spec source, revision, path, label, and URL."
      );
    }

    validateRpcOrSyntheticEvidence(
      gasContext.blockHeader,
      {
        archiveKind: "archive_rpc",
        syntheticKind: "committed_synthetic_fixture",
        rpcMethod: "eth_getBlockByHash",
        projectionType: "block_header_projection",
        projection: {
          blockNumber: gasContext.blockHeader.blockNumber,
          blockHash: gasContext.blockHeader.blockHash,
          timestamp: gasContext.blockHeader.timestamp,
          gasLimit: gasContext.blockHeader.gasLimit,
          baseFeePerGasWei: gasContext.blockHeader.baseFeePerGasWei,
          beneficiary: gasContext.blockHeader.beneficiary,
          difficulty: gasContext.blockHeader.difficulty,
          prevRandao: gasContext.blockHeader.prevRandao,
          excessBlobGas: gasContext.blockHeader.excessBlobGas,
        },
      },
      context,
      [
        ...path,
        "proposalSimulation",
        "frameContext",
        "gasContext",
        "blockHeader",
      ]
    );
    validateRpcOrSyntheticEvidence(
      gasContext.proposeReceipt,
      {
        archiveKind: "archive_rpc",
        syntheticKind: "committed_synthetic_fixture",
        rpcMethod: "eth_getTransactionReceipt",
        projectionType: "propose_receipt_projection",
        projection: {
          transactionHash: gasContext.proposeReceipt.transactionHash,
          transactionSender: gasContext.proposeReceipt.transactionSender,
          blockNumber: gasContext.proposeReceipt.blockNumber,
          blockHash: gasContext.proposeReceipt.blockHash,
          status: gasContext.proposeReceipt.status,
          effectiveGasPriceWei:
            gasContext.proposeReceipt.effectiveGasPriceWei,
        },
      },
      context,
      [
        ...path,
        "proposalSimulation",
        "frameContext",
        "gasContext",
        "proposeReceipt",
      ]
    );

    const expectedBlobBaseFeeWei =
      excessBlobGas === null
        ? null
        : deriveFakeExponential(
            1n,
            excessBlobGas,
            MAINNET_BPO2_BLOB_BASE_FEE_UPDATE_FRACTION
          );
    const expectedWarmAddresses = deriveExpectedOsakaWarmAddresses({
      transactionOrigin: simulation.transactionOrigin as Address,
      votingAddress: proposal.ref.votingAddress as Address,
      executorAddress: simulation.executorAddress as Address,
      beneficiary: gasContext.blockHeader.beneficiary as Address,
    });
    const expectedExecutionCalldata =
      proposal.script.bytes === null
        ? null
        : deriveDaoExecutorExecuteCalldata(proposal.script.bytes as Hex);
    const expectedExecutionCalldataSha256 =
      expectedExecutionCalldata === null
        ? null
        : sha256(toBytes(expectedExecutionCalldata));
    if (
      gasContext.chainId !== feed.chainId ||
      gasContext.chainId !== proposal.ref.chainId ||
      gasContext.blockTimestamp !== propose.log.timestamp ||
      gasContext.blockHeader.timestamp !== propose.log.timestamp ||
      gasContext.blockTimestamp !== gasContext.blockHeader.timestamp ||
      gasContext.blockTimestamp < MAINNET_OSAKA_ACTIVATION_TIMESTAMP ||
      gasContext.blockTimestamp < MAINNET_BPO2_ACTIVATION_TIMESTAMP ||
      gasContext.beneficiary !== gasContext.blockHeader.beneficiary ||
      gasContext.difficulty !== gasContext.blockHeader.difficulty ||
      gasContext.prevRandao !== gasContext.blockHeader.prevRandao ||
      gasContext.excessBlobGas !== gasContext.blockHeader.excessBlobGas ||
      excessBlobGas === null ||
      excessBlobGas > UINT64_MAX ||
      blobBaseFeeWei === null ||
      expectedBlobBaseFeeWei === null ||
      blobBaseFeeWei !== expectedBlobBaseFeeWei ||
      !stringArraysEqual(
        gasContext.warmSet.precompileAddresses,
        OSAKA_PRECOMPILE_ADDRESSES
      ) ||
      !stringArraysEqual(
        gasContext.warmSet.warmAddresses,
        expectedWarmAddresses
      ) ||
      expectedExecutionCalldata === null ||
      simulation.frameContext.executionInput.calldata !==
        expectedExecutionCalldata ||
      simulation.frameContext.executionInput.calldataSha256 !==
        expectedExecutionCalldataSha256
    ) {
      issue(
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "gasContext",
        ],
        "Completed simulation must bind the chain, exact Propose block opcode context, OSAKA/BPO2 schedule and derived blob fee, exact coinbase/precompile warm set, and ABI-encoded retained execute(bytes) input."
      );
    }
    if (
      headerGasLimit === null ||
      headerGasLimit === 0n ||
      headerGasLimit > UINT64_MAX ||
      executorFrameInitialGas === null ||
      executorFrameInitialGas === 0n ||
      executorFrameInitialGas > UINT64_MAX ||
      executorFrameInitialGas !== expectedExecutorFrameInitialGas ||
      blockBaseFeePerGasWei === null ||
      blockBaseFeePerGasWei === 0n ||
      blockBaseFeePerGasWei > UINT64_MAX ||
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

    const operatorAuthorization =
      simulation.frameContext.executorOperatorAuthorization;
    const operatorStorage = operatorAuthorization.blockEndEvidence;
    const operatorReplay = operatorAuthorization.positionReplay;
    const expectedOperatorStorageSlot =
      deriveDaoExecutorOperatorStorageSlot(
        proposal.ref.votingAddress as Address
      );
    const operatorStorageWord = toUint256Hex(operatorStorage.storageWord);
    const expectedOperatorAuthorized = operatorStorageWord === 1n;
    const operatorManifest =
      canonicalizeDaoExecutorOperatorSetterManifest({
        executorAddress: simulation.executorAddress as Address,
        votingAddress: proposal.ref.votingAddress as Address,
        blockNumber: propose.log.blockNumber,
        blockHash: propose.log.blockHash as Hex,
        relevantSetterLogs: operatorReplay.relevantSetterLogs,
      });
    const operatorManifestBytes = toBytes(operatorManifest);
    const expectedOperatorManifestSha256 = sha256(operatorManifestBytes);
    let appliedOperatorSetterLogCount = 0;
    let laterOperatorSetterLogCount = 0;
    let replayedOperatorAuthorizationAtPropose: boolean | null = null;
    let previousOperatorSetterPosition: {
      transactionIndex: number;
      logIndex: number;
    } | null = null;
    for (const [setterIndex, setterLog] of
      operatorReplay.relevantSetterLogs.entries()) {
      const expectedOperatorTopic = encodeAbiParameters(
        [{ name: "operator", type: "address" }],
        [proposal.ref.votingAddress as Address]
      );
      const expectedAuthorizedData = encodeAbiParameters(
        [{ name: "authorized", type: "bool" }],
        [setterLog.authorized]
      );
      if (
        setterLog.blockNumber !== propose.log.blockNumber ||
        setterLog.blockHash !== propose.log.blockHash ||
        !sameAddress(setterLog.emitter, simulation.executorAddress) ||
        setterLog.topics[0] !== EXECUTOR_SET_OPERATOR_EVENT_TOPIC ||
        setterLog.topics[1] !== expectedOperatorTopic ||
        setterLog.data !== expectedAuthorizedData ||
        !sameAddress(
          setterLog.operatorAddress,
          proposal.ref.votingAddress
        )
      ) {
        issue(
          context,
          [
            ...path,
            "proposalSimulation",
            "frameContext",
            "executorOperatorAuthorization",
            "positionReplay",
            "relevantSetterLogs",
            setterIndex,
          ],
          "Every retained same-block Executor SetOperator log must bind the effective Executor, Voting operator, exact canonical topic/data re-encoding, block, and position."
        );
      }
      if (
        previousOperatorSetterPosition !== null &&
        (setterLog.transactionIndex <
          previousOperatorSetterPosition.transactionIndex ||
          (setterLog.transactionIndex ===
            previousOperatorSetterPosition.transactionIndex &&
            setterLog.logIndex <= previousOperatorSetterPosition.logIndex))
      ) {
        issue(
          context,
          [
            ...path,
            "proposalSimulation",
            "frameContext",
            "executorOperatorAuthorization",
            "positionReplay",
            "relevantSetterLogs",
            setterIndex,
          ],
          "Retained same-block Executor SetOperator logs must be in strict canonical transaction/log order."
        );
      }
      previousOperatorSetterPosition = {
        transactionIndex: setterLog.transactionIndex,
        logIndex: setterLog.logIndex,
      };
      if (
        setterLog.transactionIndex < propose.log.transactionIndex ||
        (setterLog.transactionIndex === propose.log.transactionIndex &&
          setterLog.logIndex < propose.log.logIndex)
      ) {
        appliedOperatorSetterLogCount += 1;
        replayedOperatorAuthorizationAtPropose = setterLog.authorized;
      } else {
        laterOperatorSetterLogCount += 1;
      }
    }
    const expectedOperatorReplayProjection =
      deriveDaoExecutorOperatorReplayProjectionSha256({
        executorAddress: simulation.executorAddress as Address,
        votingAddress: proposal.ref.votingAddress as Address,
        blockNumber: propose.log.blockNumber,
        blockHash: propose.log.blockHash as Hex,
        proposeTransactionIndex: propose.log.transactionIndex,
        proposeLogIndex: propose.log.logIndex,
        relevantSetterLogCount: operatorReplay.relevantSetterLogs.length,
        appliedThroughProposeLogCount: appliedOperatorSetterLogCount,
        laterSetterLogCount: 0,
        canonicalManifestSha256: expectedOperatorManifestSha256,
      });
    if (
      !sameAddress(
        operatorAuthorization.executorAddress,
        simulation.executorAddress
      ) ||
      !sameAddress(
        operatorAuthorization.votingAddress,
        proposal.ref.votingAddress
      ) ||
      operatorAuthorization.blockNumber !== propose.log.blockNumber ||
      operatorAuthorization.blockHash !== propose.log.blockHash ||
      !sameAddress(
        operatorStorage.storageLayout.mappingKey,
        proposal.ref.votingAddress
      ) ||
      operatorStorage.storageLayout.resolvedStorageSlot !==
        expectedOperatorStorageSlot ||
      operatorStorageWord === null ||
      operatorStorageWord > 1n ||
      operatorStorage.decodedAuthorized !== expectedOperatorAuthorized ||
      operatorAuthorization.authorizedAtPropose !==
        expectedOperatorAuthorized ||
      operatorReplay.proposeTransactionIndex !==
        propose.log.transactionIndex ||
      operatorReplay.proposeLogIndex !== propose.log.logIndex ||
      operatorReplay.relevantSetterLogCount !==
        operatorReplay.relevantSetterLogs.length ||
      operatorReplay.appliedThroughProposeLogCount !==
        appliedOperatorSetterLogCount ||
      (replayedOperatorAuthorizationAtPropose !== null &&
        replayedOperatorAuthorizationAtPropose !==
          expectedOperatorAuthorized) ||
      laterOperatorSetterLogCount !== 0 ||
      operatorReplay.canonicalManifestByteLength !==
        operatorManifestBytes.length ||
      operatorReplay.canonicalManifestSha256 !==
        expectedOperatorManifestSha256
    ) {
      issue(
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "executorOperatorAuthorization",
        ],
        "Completed simulation must prove Executor.operators[Voting] at the exact Propose position from the pinned Vyper slot, canonical block-end word, the last applied SetOperator value, and a complete same-block manifest with no later relevant log."
      );
    }
    validateRpcOrSyntheticEvidence(
      operatorStorage,
      {
        archiveKind: "archive_rpc",
        syntheticKind: "committed_synthetic_fixture",
        rpcMethod: "eth_getStorageAt",
        projectionType: "executor_operator_eth_getStorageAt_projection",
        projection: {
          executorAddress: simulation.executorAddress,
          votingAddress: proposal.ref.votingAddress,
          blockNumber: propose.log.blockNumber,
          blockHash: propose.log.blockHash,
          resolvedStorageSlot: expectedOperatorStorageSlot,
          storageWord: operatorStorage.storageWord,
        },
      },
      context,
      [
        ...path,
        "proposalSimulation",
        "frameContext",
        "executorOperatorAuthorization",
        "blockEndEvidence",
      ]
    );
    if (operatorReplay.evidenceKind === "committed_synthetic_fixture") {
      if (
        operatorReplay.rpcMethod !== null ||
        operatorReplay.fixturePath !== "tests/fixtures/dao-feed-v1.ts" ||
        operatorReplay.fixtureProjectionSha256 !==
          expectedOperatorReplayProjection ||
        operatorReplay.rawLogsSha256 !== null ||
        operatorReplay.rawLogsObjectKey !== null
      ) {
        issue(
          context,
          [
            ...path,
            "proposalSimulation",
            "frameContext",
            "executorOperatorAuthorization",
            "positionReplay",
          ],
          "Synthetic Executor authorization replay evidence must reproduce the complete canonical SetOperator projection without archive claims."
        );
      }
    } else if (
      operatorReplay.rpcMethod !== "eth_getLogs" ||
      operatorReplay.fixturePath !== null ||
      operatorReplay.fixtureProjectionSha256 !== null ||
      operatorReplay.rawLogsSha256 === null ||
      operatorReplay.rawLogsObjectKey === null
    ) {
      issue(
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "executorOperatorAuthorization",
          "positionReplay",
        ],
        "Live Executor authorization replay evidence must retain the exact eth_getLogs response-byte digest and immutable object key, and omit synthetic fixture fields."
      );
    }
    if (
      (simulation.state === "succeeded" &&
        (!operatorAuthorization.authorizedAtPropose ||
          simulation.frameContext.operatorCheckOutcome !== "passed" ||
          !simulation.frameContext.scriptEntered ||
          simulation.frameContext.executionResultStage !==
            "script_completed")) ||
      (simulation.state === "failed" &&
        simulation.frameContext.executionResultStage ===
          "script_completed") ||
      (simulation.state === "failed" &&
        simulation.frameContext.executionResultStage ===
          "executor_operator_check_revert" &&
        (operatorAuthorization.authorizedAtPropose ||
          simulation.frameContext.operatorCheckOutcome !== "reverted" ||
          simulation.frameContext.scriptEntered ||
          simulation.error.code !==
            "EXECUTOR_OPERATOR_CHECK_REVERTED")) ||
      (simulation.state === "failed" &&
        simulation.frameContext.executionResultStage ===
          "executor_script_revert" &&
        (!operatorAuthorization.authorizedAtPropose ||
          simulation.frameContext.operatorCheckOutcome !== "passed" ||
          !simulation.frameContext.scriptEntered ||
          simulation.error.code !== "TARGET_CALL_REVERTED"))
    ) {
      issue(
        context,
        [
          ...path,
          "proposalSimulation",
          "frameContext",
          "executionResultStage",
        ],
        "Simulation result stages must distinguish a false Executor operator-gate revert before script entry from an authorized script result after the gate passes."
      );
    }

    const override = simulation.stateOverrides[0];
    validateRpcOrSyntheticEvidence(
      override.proof.bytecode,
      {
        archiveKind: "archive_rpc",
        syntheticKind: "committed_synthetic_fixture",
        rpcMethod: "eth_getCode",
        projectionType: "voting_eth_getCode_projection",
        projection: {
          address: override.proof.bytecode.address,
          blockNumber: override.proof.bytecode.blockNumber,
          blockHash: override.proof.bytecode.blockHash,
          codeByteLength: override.proof.bytecode.codeByteLength,
          deployedBytecodeHash: override.proof.bytecode.deployedBytecodeHash,
        },
      },
      context,
      [
        ...path,
        "proposalSimulation",
        "stateOverrides",
        0,
        "proof",
        "bytecode",
      ]
    );

    const expectedContextInputsSha256 =
      simulationExecutor.state === "verified_pinned"
        ? deriveDaoSimulationContextInputsSha256({
            chainId: gasContext.chainId,
            blockNumber: simulation.blockNumber,
            blockHash: simulation.blockHash as Hex,
            blockTimestamp: gasContext.blockTimestamp,
            blockGasLimit: gasContext.blockHeader.gasLimit,
            blockBaseFeePerGasWei:
              gasContext.blockHeader.baseFeePerGasWei,
            blockBeneficiary: gasContext.blockHeader.beneficiary as Address,
            blockPrevRandao: gasContext.blockHeader.prevRandao as Hex,
            blockExcessBlobGas: gasContext.blockHeader.excessBlobGas,
            blobBaseFeeWei: gasContext.blobBaseFeeWei,
            blockHeaderEvidenceKind:
              gasContext.blockHeader.evidenceKind,
            blockHeaderFixtureProjectionSha256:
              gasContext.blockHeader.fixtureProjectionSha256 as Hex | null,
            blockHeaderRawResultSha256:
              gasContext.blockHeader.rawResultSha256 as Hex | null,
            blockHeaderRawResultObjectKey:
              gasContext.blockHeader.rawResultObjectKey,
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
            proposeReceiptEvidenceKind:
              gasContext.proposeReceipt.evidenceKind,
            proposeReceiptFixtureProjectionSha256:
              gasContext.proposeReceipt.fixtureProjectionSha256 as Hex | null,
            proposeReceiptRawResultSha256:
              gasContext.proposeReceipt.rawResultSha256 as Hex | null,
            proposeReceiptRawResultObjectKey:
              gasContext.proposeReceipt.rawResultObjectKey,
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
            executeCalldataSha256: simulation.frameContext.executionInput
              .calldataSha256 as Hex,
            executorSourceRevision: simulationExecutor.source.revision,
            executorSourcePath: simulationExecutor.source.sourcePath,
            executorSourceSha256: simulationExecutor.sourceSha256,
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
            executorEvidenceKind:
              simulationExecutor.bytecode.evidenceKind,
            executorEvidenceFixtureProjectionSha256:
              simulationExecutor.bytecode.fixtureProjectionSha256 as
                | Hex
                | null,
            executorEvidenceRawResultSha256:
              simulationExecutor.bytecode.rawResultSha256 as Hex | null,
            executorEvidenceRawResultObjectKey:
              simulationExecutor.bytecode.rawResultObjectKey,
            executorOperatorStorageSlot:
              operatorStorage.storageLayout.resolvedStorageSlot as Hex,
            executorOperatorBlockEndStorageWord:
              operatorStorage.storageWord as Hex,
            executorOperatorAuthorizedAtPropose:
              operatorAuthorization.authorizedAtPropose,
            executorOperatorBlockEndEvidenceKind:
              operatorStorage.evidenceKind,
            executorOperatorBlockEndFixtureProjectionSha256:
              operatorStorage.fixtureProjectionSha256 as Hex | null,
            executorOperatorBlockEndRawResultSha256:
              operatorStorage.rawResultSha256 as Hex | null,
            executorOperatorBlockEndRawResultObjectKey:
              operatorStorage.rawResultObjectKey,
            executorOperatorReplayManifestSha256:
              operatorReplay.canonicalManifestSha256 as Hex,
            executorOperatorReplayRelevantSetterLogCount:
              operatorReplay.relevantSetterLogCount,
            executorOperatorReplayAppliedSetterLogCount:
              operatorReplay.appliedThroughProposeLogCount,
            executorOperatorReplayEvidenceKind:
              operatorReplay.evidenceKind,
            executorOperatorReplayFixtureProjectionSha256:
              operatorReplay.fixtureProjectionSha256 as Hex | null,
            executorOperatorReplayRawLogsSha256:
              operatorReplay.rawLogsSha256 as Hex | null,
            executorOperatorReplayRawLogsObjectKey:
              operatorReplay.rawLogsObjectKey,
            executorFrameInitialGas:
              gasContext.executorFrameInitialGas,
            effectiveGasPriceWei: gasContext.effectiveGasPriceWei,
            overrideVotingAddress: override.votingAddress as Address,
            overrideProposalId: override.proposalId,
            overrideResolvedStorageSlot: override.proof.storageLayout
              .resolvedStorageSlot as Hex,
            overridePreStorageWord: override.proof.storageLayout
              .preStorageWord as Hex,
            overridePostStorageWord: override.proof.storageLayout
              .postStorageWord as Hex,
            overrideVotingCodeHash: override.proof.bytecode
              .deployedBytecodeHash as Hex,
            overrideVotingEvidenceKind:
              override.proof.bytecode.evidenceKind,
            overrideVotingFixtureProjectionSha256: override.proof.bytecode
              .fixtureProjectionSha256 as Hex | null,
            overrideVotingRawResultSha256:
              override.proof.bytecode.rawResultSha256 as Hex | null,
            overrideVotingRawResultObjectKey:
              override.proof.bytecode.rawResultObjectKey,
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
        "Simulation context input commitment must bind the exact block, provenance projections, OSAKA/BPO2 execution context, origin, caller chain, injector artifact, gas scenario, envelope, access list, and warm-set policy."
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
  const contractRetirement =
    contract?.retiredAtBlock === null || contract?.retiredAtBlock === undefined
      ? null
      : toUint(contract.retiredAtBlock.number);
  if (
    contractRetirement !== null &&
    eventBlock !== null &&
    eventBlock > contractRetirement
  ) {
    issue(
      context,
      [...path, "log", "blockNumber"],
      "Lifecycle events for a retired Voting generation cannot follow its inclusive retirement block."
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
    if (voteWeight === null || voteWeight > MAX_BPS_SAFE_WEIGHT) {
      issue(
        context,
        [...path, "data", "weight"],
        "Pinned Voting Vote weight must not exceed floor(UINT256_MAX / 10000) so basis-point multiplication cannot overflow."
      );
    }
    const voterImplementation =
      effectiveConfiguration?.voterImplementation;
    if (
      voterImplementation?.state === "verified_pinned" &&
      event.log.timestamp !== null &&
      voterImplementation.immutableGenesisTimestamp > event.log.timestamp
    ) {
      issue(
        context,
        [...path, "data", "classification"],
        "Verified pinned Voter genesis must not follow any Vote event or invocation it could emit."
      );
    }
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
      compareConfigurationEffectivePositions(
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
    if (
      compareConfigurationToEventPosition(
        event.data.classification.observedAt,
        event.log
      ) > 0
    ) {
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
      compareConfigurationEffectivePositions(
        actor.evidence.observedAt,
        effectiveConfiguration.effectiveAt
      ) !== 0 ||
      actor.evidence.observedAt.blockHash !==
        effectiveConfiguration.effectiveAt.blockHash ||
      compareConfigurationToEventPosition(actor.evidence.observedAt, event.log) > 0 ||
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
  if (
    stage.receipt.transactionHash !== stage.transactionHash ||
    stage.receipt.blockNumber !== stage.identity.log.blockNumber ||
    stage.receipt.blockHash !== stage.identity.log.blockHash ||
    stage.receipt.transactionIndex !== stage.identity.log.transactionIndex ||
    !sameAddress(stage.receipt.transactionSender, stage.identity.proposer)
  ) {
    issue(
      context,
      ["receipt"],
      "Receipt-stage provenance must bind the exact successful Propose transaction position and authenticate transaction sender equal to the decoded proposer."
    );
  }
  validateRpcOrSyntheticEvidence(
    stage.receipt,
    {
      archiveKind: "archive_rpc",
      syntheticKind: "committed_synthetic_fixture",
      rpcMethod: "eth_getTransactionReceipt",
      projectionType: "creation_stage_eth_getTransactionReceipt_projection",
      projection: {
        transactionHash: stage.receipt.transactionHash,
        transactionSender: stage.receipt.transactionSender,
        blockNumber: stage.receipt.blockNumber,
        blockHash: stage.receipt.blockHash,
        transactionIndex: stage.receipt.transactionIndex,
        status: stage.receipt.status,
        matchingProposeLogCount: stage.receipt.matchingProposeLogCount,
      },
    },
    context,
    ["receipt"]
  );
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
    source.label !== PINNED_VOTING_SOURCE_LABEL ||
    source.repository !== "yearn/stYFI" ||
    source.revision !== DAO_PINNED_VOTING_REVISION ||
    source.sourcePath !== PINNED_VOTING_SOURCE_PATH ||
    source.url !== PINNED_VOTING_SOURCE_URL
  ) {
    issue(context, path, "Voting provenance must use the exact pinned Voting GitHub blob URL, revision, source path, and canonical label.");
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
    source.label !== PINNED_VOTER_SOURCE_LABEL ||
    source.repository !== "yearn/stYFI" ||
    source.revision !== DAO_PINNED_VOTING_REVISION ||
    source.sourcePath !== PINNED_VOTER_SOURCE_PATH ||
    source.url !== PINNED_VOTER_SOURCE_URL
  ) {
    issue(
      context,
      path,
      "Voter provenance must use the exact pinned Voter GitHub blob URL, repository, revision, source path, and canonical label."
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
    source.label !== PINNED_EXECUTOR_SOURCE_LABEL ||
    source.repository !== "yearn/stYFI" ||
    source.revision !== DAO_PINNED_VOTING_REVISION ||
    source.sourcePath !== PINNED_EXECUTOR_SOURCE_PATH ||
    source.url !== PINNED_EXECUTOR_SOURCE_URL
  ) {
    issue(
      context,
      path,
      "Executor provenance must use the exact pinned Executor GitHub blob URL, repository, revision, source path, and canonical label."
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
      "Verified source GitHub provenance must bind repository, revision, source path, and the exact canonical GitHub source URL."
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

type RpcOrSyntheticEvidence = {
  evidenceKind: string;
  rpcMethod: string | null;
  fixturePath: string | null;
  fixtureProjectionSha256: string | null;
  rawResultSha256: string | null;
  rawResultObjectKey: string | null;
};

function validateRpcOrSyntheticEvidence(
  evidence: RpcOrSyntheticEvidence,
  expected: {
    archiveKind: string;
    syntheticKind: string;
    rpcMethod: string;
    projectionType: string;
    projection: unknown;
  },
  context: RefinementContext,
  path: readonly PropertyKey[]
): void {
  if (evidence.evidenceKind === expected.archiveKind) {
    if (
      evidence.rpcMethod !== expected.rpcMethod ||
      evidence.fixturePath !== null ||
      evidence.fixtureProjectionSha256 !== null ||
      evidence.rawResultSha256 === null ||
      evidence.rawResultObjectKey === null
    ) {
      issue(
        context,
        path,
        `Archive evidence must use exact ${expected.rpcMethod} provenance, retain the successful non-null raw JSON-RPC result-token SHA-256 and immutable object key, and cannot claim committed synthetic fixture fields.`
      );
    }
    return;
  }

  if (evidence.evidenceKind === expected.syntheticKind) {
    const expectedProjectionSha256 = deriveDaoSyntheticEvidenceSha256(
      expected.projectionType,
      expected.projection
    );
    if (
      evidence.rpcMethod !== null ||
      evidence.fixturePath !== "tests/fixtures/dao-feed-v1.ts" ||
      evidence.fixtureProjectionSha256 !== expectedProjectionSha256 ||
      evidence.rawResultSha256 !== null ||
      evidence.rawResultObjectKey !== null
    ) {
      issue(
        context,
        path,
        "Committed synthetic evidence must name the exact fixture path, omit live raw JSON-RPC claims, and reproduce the canonical projection digest."
      );
    }
    return;
  }

  issue(
    context,
    [...path, "evidenceKind"],
    "Evidence must use one exact archive-RPC or committed-synthetic provenance branch."
  );
}

function deriveFakeExponential(
  factor: bigint,
  numerator: bigint,
  denominator: bigint
): bigint | null {
  if (
    factor < 0n ||
    numerator < 0n ||
    denominator <= 0n ||
    numerator > denominator * 512n
  ) {
    return null;
  }
  let accumulator = factor * denominator;
  let output = 0n;
  let iteration = 1n;
  while (accumulator > 0n && iteration <= 4_096n) {
    output += accumulator;
    accumulator = (accumulator * numerator) / (denominator * iteration);
    iteration += 1n;
  }
  return accumulator === 0n ? output / denominator : null;
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
  const implementationEvidencePosition =
    configuration.boundary.kind ===
    "producer_start_state_snapshot_sentinel"
      ? {
          blockNumber: configuration.boundary.stateSnapshot.parentBlockNumber,
          blockHash: configuration.boundary.stateSnapshot.parentBlockHash,
        }
      : {
          blockNumber: configuration.effectiveAt.blockNumber,
          blockHash: configuration.effectiveAt.blockHash,
        };
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
    const constructorArtifacts = deriveDaoPinnedVoterConstructorArtifacts(
      implementation.bytecode.constructorGenesisTimestamp
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
        deployedRuntimeSha256:
          implementation.bytecode.deployedRuntimeSha256 as Hex,
        immutableGenesisWord:
          implementation.bytecode.immutableGenesisWord as Hex,
      });
    validateRpcOrSyntheticEvidence(
      implementation.bytecode,
      {
        archiveKind: "archive_rpc_and_reproducible_build",
        syntheticKind:
          "committed_synthetic_fixture_and_reproducible_build",
        rpcMethod: "eth_getCode",
        projectionType: "voter_eth_getCode_projection",
        projection: {
          address: implementation.bytecode.address,
          blockNumber: implementation.bytecode.blockNumber,
          blockHash: implementation.bytecode.blockHash,
          codeByteLength: implementation.bytecode.codeByteLength,
          deployedBytecodeHash:
            implementation.bytecode.deployedBytecodeHash,
        },
      },
      context,
      [...path, "voterImplementation", "bytecode"]
    );
    if (
      configuration.voterState !== "configured" ||
      implementation.immutableGenesisTimestamp !==
        implementation.bytecode.constructorGenesisTimestamp ||
      !sameAddress(implementation.bytecode.address, configuration.voterAddress) ||
      implementation.bytecode.blockNumber !==
        implementationEvidencePosition.blockNumber ||
      implementation.bytecode.blockHash !== implementationEvidencePosition.blockHash ||
      implementation.compiledRuntimeBytecodeHash !==
        implementation.bytecode.deployedBytecodeHash ||
      implementation.compiledRuntimeBytecodeHash !==
        constructorArtifacts.deployedRuntimeKeccak256 ||
      implementation.bytecode.immutableGenesisWord !==
        constructorArtifacts.immutableGenesisWord ||
      implementation.bytecode.deployedRuntimeSha256 !==
        constructorArtifacts.deployedRuntimeSha256 ||
      implementation.buildArtifact.initcodeWithArgumentByteLength !==
        constructorArtifacts.initcodeWithArgumentByteLength ||
      implementation.buildArtifact.initcodeWithArgumentSha256 !==
        constructorArtifacts.initcodeWithArgumentSha256 ||
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
    validateRpcOrSyntheticEvidence(
      executorImplementation.bytecode,
      {
        archiveKind: "archive_rpc_and_reproducible_build",
        syntheticKind:
          "committed_synthetic_fixture_and_reproducible_build",
        rpcMethod: "eth_getCode",
        projectionType: "executor_eth_getCode_projection",
        projection: {
          address: executorImplementation.bytecode.address,
          blockNumber: executorImplementation.bytecode.blockNumber,
          blockHash: executorImplementation.bytecode.blockHash,
          codeByteLength: executorImplementation.bytecode.codeByteLength,
          deployedBytecodeHash:
            executorImplementation.bytecode.deployedBytecodeHash,
        },
      },
      context,
      [...path, "executorImplementation", "bytecode"]
    );
    if (
      configuration.executorState !== "configured" ||
      !sameAddress(
        executorImplementation.bytecode.address,
        configuration.executorAddress
      ) ||
      executorImplementation.bytecode.blockNumber !==
        implementationEvidencePosition.blockNumber ||
      executorImplementation.bytecode.blockHash !==
        implementationEvidencePosition.blockHash ||
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
    if (compareConfigurationToEventPosition(candidate.effectiveAt, position) > 0)
      break;
    effective = candidate;
  }
  return effective;
}

function compareConfigurationEffectivePositions(
  left: z.infer<typeof ConfigurationEffectivePositionSchema>,
  right: z.infer<typeof ConfigurationEffectivePositionSchema>
): number {
  const blockComparison = compareUintStrings(
    left.blockNumber,
    right.blockNumber
  );
  if (blockComparison !== 0) return blockComparison;
  if (left.kind === "start_of_block") {
    return right.kind === "start_of_block" ? 0 : -1;
  }
  if (right.kind === "start_of_block") return 1;
  if (left.transactionIndex !== right.transactionIndex) {
    return left.transactionIndex < right.transactionIndex ? -1 : 1;
  }
  if (left.logIndex === right.logIndex) return 0;
  return left.logIndex < right.logIndex ? -1 : 1;
}

function compareConfigurationToEventPosition(
  left: z.infer<typeof ConfigurationEffectivePositionSchema>,
  right: Pick<
    z.infer<typeof EventPositionSchema>,
    "blockNumber" | "transactionIndex" | "logIndex"
  >
): number {
  const blockComparison = compareUintStrings(
    left.blockNumber,
    right.blockNumber
  );
  if (blockComparison !== 0) return blockComparison;
  if (left.kind === "start_of_block") return -1;
  if (left.transactionIndex !== right.transactionIndex) {
    return left.transactionIndex < right.transactionIndex ? -1 : 1;
  }
  if (left.logIndex === right.logIndex) return 0;
  return left.logIndex < right.logIndex ? -1 : 1;
}

function compareUintStrings(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

function getSnapshotConfiguration(
  contract: z.infer<typeof FeedContractSchema>,
  canonicalBlockNumber: string
): z.infer<typeof HistoricalConfigurationSchema> | null {
  return getEffectiveConfiguration(contract, {
    blockNumber: canonicalBlockNumber,
    transactionIndex: Number.MAX_SAFE_INTEGER,
    logIndex: Number.MAX_SAFE_INTEGER,
  });
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
    observed.voterDecayLengthSeconds === historical.voterDecayLengthSeconds &&
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

function toUint256Hex(value: string): bigint | null {
  if (!/^0x[0-9a-f]{64}$/.test(value)) return null;
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
