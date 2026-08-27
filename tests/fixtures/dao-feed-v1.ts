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
  canonicalizeDaoExecutorOperatorSetterManifest,
  canonicalizeDaoConfigurationBootstrapSetterManifest,
  canonicalizeDaoConfigurationSetterHistoryManifest,
  createDaoFeedEventId,
  deriveDaoConfigurationBootstrapProjectionSha256,
  deriveDaoConfigurationBootstrapScanProjectionSha256,
  deriveDaoConfigurationSetterTraceProjectionSha256,
  deriveDaoConfigurationSetterStateProjectionSha256,
  deriveDaoConfigurationValuesSha256,
  deriveDaoCreationStageReceiptProjectionSha256,
  deriveDaoExecutorExecuteCalldata,
  deriveDaoExecutorOperatorReplayProjectionSha256,
  deriveDaoExecutorOperatorStorageProjectionSha256,
  deriveDaoExecutorOperatorStorageSlot,
  deriveDaoProposalThresholdProjectionSha256,
  deriveDaoSimulationContextInputsSha256,
  deriveDaoSyntheticEvidenceSha256,
  deriveDaoVoterTraceProjectionSha256,
  deriveDaoVoterBuildEvidenceSha256,
  deriveDaoVotingExecutedStorageSlots,
  deriveDaoVotingThresholdStorageSlots,
  encodeDaoFeedConfigurationSetterAbi,
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
const PINNED_EXECUTOR_SOURCE_INTEGRITY_SHA256 =
  "0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b" as const;
const PINNED_VOTER_SOURCE_INTEGRITY_SHA256 =
  "0x90d458df8321d2c845ad1a153b21fea3eeb6fa746feecc57d15beec3ae5f192d" as const;
const PINNED_COMPILER_DISTRIBUTION = {
  kind: "github_release_pyinstaller_onefile",
  releaseTag: "v0.4.2",
  artifactName: "vyper.0.4.2+commit.c216787f.linux",
  releaseCommit: "c216787f5e355478733a05fa5f0fce93fa9a7126",
  longVersion: "0.4.2+commit.c216787f",
  platform: "linux-x86_64-gnu",
  buildRunner: "github-actions-ubuntu-22.04",
  uri: "https://github.com/vyperlang/vyper/releases/download/v0.4.2/vyper.0.4.2%2Bcommit.c216787f.linux",
  byteLength: 23_495_192,
  sha256:
    "0x7cc4214671dc78db8a3962f103bead22dd76b55ee370d6d333122e7f3368f4fa",
  derivation: "sha256_exact_download_bytes",
} as const;
const PINNED_VOTER_GENESIS_WORD =
  "0x000000000000000000000000000000000000000000000000000000005bf44ba0" as const;
const PINNED_VOTER_DEPLOYED_RUNTIME_SHA256 =
  "0xb5de901445a5744788a6979108d95eba59c98fe4602ae2ded0ec087c19fc6e0b" as const;
const PINNED_VOTER_DEPLOYED_RUNTIME_KECCAK256 =
  "0xef209e54f557183eb15a068121c3668d349d2f245893345d747b4e09bb55826e" as const;
const PINNED_MAINNET_CHAIN_SPEC_SOURCE = {
  kind: "github",
  label: "go-ethereum mainnet chain config at pinned revision",
  repository: "ethereum/go-ethereum",
  revision: "9621c6ad10934a01b5514886fb6fbd87640b6c05",
  sourcePath: "params/config.go",
  url: "https://github.com/ethereum/go-ethereum/blob/9621c6ad10934a01b5514886fb6fbd87640b6c05/params/config.go",
} as const;
const OSAKA_PRECOMPILE_ADDRESSES = [
  ...Array.from(
    { length: 17 },
    (_, index) =>
      `0x${(index + 1).toString(16).padStart(40, "0")}` as Address
  ),
  `0x${(256).toString(16).padStart(40, "0")}` as Address,
] as const;
const SYNTHETIC_BLOCK_BENEFICIARY =
  "0x4242424242424242424242424242424242424242" as const;
const SYNTHETIC_BLOCK_PREV_RANDAO =
  "0xabababababababababababababababababababababababababababababababab" as const;
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
const PRODUCER_START_BLOCK = 23_900_001n;
const DEPLOYMENT_BLOCK = 23_900_000n;
const CONFIGURATION_CHANGE_TRANSACTION_HASH =
  "0x00000000000000000000000000000000000000000000000000000000016cda58" as const;
const CONFIGURATION_SETTER_SENDER =
  "0x1919191919191919191919191919191919191919" as const;
const CHANGED_VOTER_DECAY_LENGTH_SECONDS = 86_400;
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

type FixtureBlockAllocation = {
  blockNumber: bigint;
  timestamp: number | null;
};

type FixtureConfiguration =
  DaoFeedV1["contracts"][number]["configurationHistory"][number];
type FixtureSetterBoundary = Extract<
  FixtureConfiguration["boundary"],
  { kind: "setter_trace_observation" }
>;
type FixtureSetterCall = FixtureSetterBoundary["setterCalls"][number];

function configurationSetterCall(input: {
  abi: Parameters<typeof encodeDaoFeedConfigurationSetterAbi>[0];
  target: Address;
  sourceContract: "Voting" | "Voter";
  caller?: Address;
  traceAddress: number[];
  logIndex: number;
}): FixtureSetterCall {
  const encoded = encodeDaoFeedConfigurationSetterAbi(input.abi);
  const { setter } = input.abi;
  const values = (() => {
    if (input.abi.setter === "set_propose_parameters") {
      return {
        minWeight: input.abi.minWeight.toString(),
        cooldownSeconds: input.abi.cooldownSeconds.toString(),
        blacklistAddress: input.abi.blacklistAddress,
      };
    }
    if (input.abi.setter === "set_vote_parameters") {
      return {
        votingPeriodSeconds: Number(input.abi.votingPeriodSeconds),
        voterAddress: input.abi.voterAddress,
      };
    }
    if (input.abi.setter === "set_execute_parameters") {
      return {
        executionDelaySeconds: Number(input.abi.executionDelaySeconds),
        executionGuard: input.abi.executionGuard,
        executorAddress: input.abi.executorAddress,
      };
    }
    if (input.abi.setter === "set_decay_length") {
      return {
        voterDecayLengthSeconds: Number(
          input.abi.voterDecayLengthSeconds
        ),
      };
    }
    const { setter: ignoredSetter, ...rest } = input.abi;
    void ignoredSetter;
    return rest;
  })();
  const args = setter === "accept_guardian" ? {} : values;
  const decoded =
    setter === "accept_guardian"
      ? { guardianAddress: input.abi.guardianAddress }
      : values;
  return {
    target: input.target,
    sourceContract: input.sourceContract,
    caller: input.caller ?? CONFIGURATION_SETTER_SENDER,
    traceAddress: input.traceAddress,
    setter,
    selector: encoded.selector,
    calldata: encoded.calldata,
    result: "success",
    arguments: args,
    log: {
      emitter: input.target,
      logIndex: input.logIndex,
      topics: encoded.topics,
      data: encoded.data,
      matchingLogCount: 1,
      canonicalReencodingMatched: true,
      decoded,
    },
  } as FixtureSetterCall;
}

function pinnedVoterImplementation(
  address: string,
  effectiveAt: { blockNumber: string; blockHash: Hex }
) {
  const sourceSha256 =
    "0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab" as const;
  const buildArtifactSha256 =
    "0x25ca8e7899a40c5ae221fa5d8075816f7b36650b3ef6ef285b60fc5dcce362cc" as const;
  const voterCodeProjection = {
    address,
    blockNumber: effectiveAt.blockNumber,
    blockHash: effectiveAt.blockHash,
    codeByteLength: 1_989,
    deployedBytecodeHash: PINNED_VOTER_DEPLOYED_RUNTIME_KECCAK256,
  } as const;
  return {
    state: "verified_pinned" as const,
    address,
    source: PINNED_VOTER_SOURCE,
    sourceSha256,
    sourceIntegrity: {
      algorithm: "vyper_0_4_2_sha256_import_tree",
      preimageEncoding: "lowercase_ascii_hex_without_0x",
      preimage: sourceSha256.slice(2),
      digest: PINNED_VOTER_SOURCE_INTEGRITY_SHA256,
      derivation: "vyper_0_4_2_integrity_for_import_free_source",
    },
    compiler: "vyper@0.4.2" as const,
    compilerDistribution: PINNED_COMPILER_DISTRIBUTION,
    optimization: "gas" as const,
    evmVersion: "cancun" as const,
    buildArtifact: {
      outputKind: "vyper_creation_bytecode_hex_stdout",
      exactBytesEncoding: "utf8_lowercase_0x_hex_with_final_lf",
      command:
        "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f bytecode contracts/governance/Voter.vy",
      stdoutByteLength: 4_123,
      sha256: buildArtifactSha256,
      derivation: "sha256_exact_stdout_bytes",
      decodedCreationByteLength: 2_060,
      decodedCreationSha256:
        "0xbcb72ccd8fec2d904ecd867503481abc4d841d4b1ef7d5104b6017ff15a93839",
      constructorInputEncoding: "abi_uint256_big_endian_word",
      initcodeWithArgumentByteLength: 2_092,
      initcodeWithArgumentSha256:
        "0x2b17e0d55f428eaad1e1bcb6af7631a727c7bfd7d0803e68ed900ae7a3b273a4",
    },
    runtimeTemplate: {
      outputKind: "vyper_runtime_template_raw_bytes",
      compilerStdoutDecoding:
        "strip_exact_0x_prefix_and_one_final_lf_then_lowercase_hex_decode",
      command:
        "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f bytecode_runtime contracts/governance/Voter.vy",
      stdoutByteLength: 3_917,
      stdoutSha256:
        "0x461f3f38e239d707be52a4c89d57d887c4c8e60b42b2032ebe6ed99b41e9cd54",
      byteLength: 1_957,
      sha256:
        "0x452dcaf7aa5c7d647c694a424121737e691ab229ee33744e0773d8581d9eea8b",
      keccak256:
        "0xdfc74b9ef65aba002169200841461f60261aa1e66380e0b867b085266f16acaf",
      immutableLayout: {
        evidenceCommand:
          "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f layout contracts/governance/Voter.vy",
        evidenceStdoutByteLength: 578,
        evidenceStdoutSha256:
          "0x6486152f25f1fa13ac03681a2b2779d035577906cee90f6ebba302a28b460681",
        field: "genesis",
        codeOffset: 0,
        byteLength: 32,
        encoding: "abi_uint256_big_endian_word_appended_to_template",
      },
    },
    immutableGenesisTimestamp: VOTER_GENESIS_TIMESTAMP,
    compiledRuntimeBytecodeHash: PINNED_VOTER_DEPLOYED_RUNTIME_KECCAK256,
    bytecode: {
      evidenceKind:
        "committed_synthetic_fixture_and_reproducible_build" as const,
      rpcMethod: null,
      fixturePath: "tests/fixtures/dao-feed-v1.ts" as const,
      fixtureProjectionSha256: deriveDaoSyntheticEvidenceSha256(
        "voter_eth_getCode_projection",
        voterCodeProjection
      ),
      rawResultSha256: null,
      rawResultObjectKey: null,
      hashMethod: "keccak256" as const,
      address,
      blockNumber: effectiveAt.blockNumber,
      blockHash: effectiveAt.blockHash,
      codeByteLength: 1_989,
      deployedBytecodeHash: PINNED_VOTER_DEPLOYED_RUNTIME_KECCAK256,
      deployedRuntimeSha256: PINNED_VOTER_DEPLOYED_RUNTIME_SHA256,
      buildArtifactSha256,
      buildEvidenceSha256: deriveDaoVoterBuildEvidenceSha256({
        constructorGenesisTimestamp: VOTER_GENESIS_TIMESTAMP,
        compiledRuntimeBytecodeHash:
          PINNED_VOTER_DEPLOYED_RUNTIME_KECCAK256,
        codeByteLength: 1_989,
        deployedBytecodeHash: PINNED_VOTER_DEPLOYED_RUNTIME_KECCAK256,
        buildArtifactSha256,
        deployedRuntimeSha256: PINNED_VOTER_DEPLOYED_RUNTIME_SHA256,
        immutableGenesisWord: PINNED_VOTER_GENESIS_WORD,
      }),
      constructorGenesisTimestamp: VOTER_GENESIS_TIMESTAMP,
      immutableGenesisWord: PINNED_VOTER_GENESIS_WORD,
      runtimeDerivation:
        "compiled_runtime_template_append_abi_uint256_genesis",
    },
    classificationSemantics:
      "pinned_voter_trace_required_for_human_and_aggregate_labels" as const,
    error: null,
  } as const;
}

function pinnedExecutorImplementation(
  address: string,
  effectiveAt: { blockNumber: string; blockHash: Hex }
) {
  const executorCodeProjection = {
    address,
    blockNumber: effectiveAt.blockNumber,
    blockHash: effectiveAt.blockHash,
    codeByteLength: PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH,
    deployedBytecodeHash: PINNED_EXECUTOR_RUNTIME_KECCAK256,
  } as const;
  return {
    state: "verified_pinned" as const,
    address,
    source: PINNED_EXECUTOR_SOURCE,
    sourceSha256: PINNED_EXECUTOR_SOURCE_SHA256,
    sourceIntegrity: {
      algorithm: "vyper_0_4_2_sha256_import_tree",
      preimageEncoding: "lowercase_ascii_hex_without_0x",
      preimage: PINNED_EXECUTOR_SOURCE_SHA256.slice(2),
      digest: PINNED_EXECUTOR_SOURCE_INTEGRITY_SHA256,
      derivation: "vyper_0_4_2_integrity_for_import_free_source",
    },
    compiler: "vyper@0.4.2" as const,
    compilerDistribution: PINNED_COMPILER_DISTRIBUTION,
    optimization: "gas" as const,
    evmVersion: "cancun" as const,
    experimentalCodegen: false as const,
    buildArtifact: {
      creationOutputKind: "vyper_creation_bytecode_hex_stdout",
      runtimeOutputKind: "vyper_runtime_bytecode_hex_stdout",
      compilerStdoutDecoding:
        "strip_exact_0x_prefix_and_one_final_lf_then_lowercase_hex_decode",
      creationCommand:
        "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f bytecode contracts/governance/Executor.vy",
      runtimeCommand:
        "./vyper.0.4.2+commit.c216787f.linux -Werror -O gas --evm-version cancun -f bytecode_runtime contracts/governance/Executor.vy",
      creationStdoutSha256:
        "0x48dbf262a5e31ccdb52119174854e136d8070bbd67140e8b11f72d7b7b169f23",
      creationStdoutByteLength: 2_483,
      runtimeStdoutByteLength: 2_317,
      runtimeStdoutSha256:
        "0x9c50f7eb47e09e8349e896e0843f41c96a6b15c48c53c2855e4db709510e021b",
      creationByteLength: 1_240,
      creationSha256:
        "0xccb991a4222b9576e42f6d0da4e655069a4882532bf088e22c8a95b629862a60",
      runtimeByteLength: PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH,
      runtimeSha256: PINNED_EXECUTOR_RUNTIME_SHA256,
      runtimeKeccak256: PINNED_EXECUTOR_RUNTIME_KECCAK256,
      immutableLayout: "none",
    },
    compiledRuntimeByteLength: PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH,
    compiledRuntimeBytecodeHash: PINNED_EXECUTOR_RUNTIME_KECCAK256,
    compiledRuntimeArtifactSha256: PINNED_EXECUTOR_RUNTIME_SHA256,
    bytecode: {
      evidenceKind:
        "committed_synthetic_fixture_and_reproducible_build" as const,
      rpcMethod: null,
      fixturePath: "tests/fixtures/dao-feed-v1.ts" as const,
      fixtureProjectionSha256: deriveDaoSyntheticEvidenceSha256(
        "executor_eth_getCode_projection",
        executorCodeProjection
      ),
      rawResultSha256: null,
      rawResultObjectKey: null,
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
  } as const;
}

const BOOTSTRAP_SETTER_TRANSACTION_HASH = fixedHex32(23_900_901n);
const BOOTSTRAP_SETTER_CALLS = [
  configurationSetterCall({
    abi: {
      setter: "set_vote_parameters",
      votingPeriodSeconds: 604_800n,
      voterAddress: DAO_MOCK_VOTER_ADDRESS,
    },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [0],
    logIndex: 0,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_execute_parameters",
      executionDelaySeconds: 86_400n,
      executionGuard: "guarded",
      executorAddress: DAO_MOCK_EXECUTOR_ADDRESS,
    },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [1],
    logIndex: 1,
  }),
  configurationSetterCall({
    abi: { setter: "set_hooks", hooksAddress: VOTING_HOOK_ADDRESS },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [2],
    logIndex: 2,
  }),
  configurationSetterCall({
    abi: { setter: "set_weight_measure", measureAddress: WEIGHT_MEASURE_ADDRESS },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [3],
    logIndex: 3,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_propose_parameters",
      minWeight: 1_000_000_000_000_000_000n,
      cooldownSeconds: 86_400n,
      blacklistAddress: PROPOSAL_BLACKLIST_ADDRESS,
    },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [4],
    logIndex: 4,
  }),
  configurationSetterCall({
    abi: { setter: "set_operator", operatorAddress: DAO_MOCK_OPERATOR_ADDRESS },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [5],
    logIndex: 5,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_delegated_staking",
      delegatedStakingAddress: DAO_MOCK_STYFIX_AGGREGATE_ADDRESS,
    },
    target: DAO_MOCK_VOTER_ADDRESS,
    sourceContract: "Voter",
    traceAddress: [6],
    logIndex: 6,
  }),
  configurationSetterCall({
    abi: { setter: "set_ybc", ybcAddress: DAO_MOCK_YBC_AGGREGATE_ADDRESS },
    target: DAO_MOCK_VOTER_ADDRESS,
    sourceContract: "Voter",
    traceAddress: [7],
    logIndex: 7,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_ybc_weight_aggregator",
      ybcWeightAggregatorAddress: YBC_WEIGHT_AGGREGATOR_ADDRESS,
    },
    target: DAO_MOCK_VOTER_ADDRESS,
    sourceContract: "Voter",
    traceAddress: [8],
    logIndex: 8,
  }),
] satisfies FixtureSetterCall[];

const BOOTSTRAP_TRACKED_SETTER_LOGS = BOOTSTRAP_SETTER_CALLS.map((call) => ({
  blockNumber: DEPLOYMENT_BLOCK.toString(),
  blockHash: fixedHex32(DEPLOYMENT_BLOCK),
  blockTimestamp: null,
  transactionHash: BOOTSTRAP_SETTER_TRANSACTION_HASH,
  transactionSender: CONFIGURATION_SETTER_SENDER,
  transactionIndex: 1,
  receiptStatus: "success" as const,
  call,
}));

const BOOTSTRAP_TRANSACTION_EVIDENCE = [
  {
    sourceKind: "committed_synthetic_fixture" as const,
    projectionKind: "bootstrap_configuration_setter_transaction" as const,
    transactionHash: BOOTSTRAP_SETTER_TRANSACTION_HASH,
    transactionSender: CONFIGURATION_SETTER_SENDER,
    blockNumber: DEPLOYMENT_BLOCK.toString(),
    blockHash: fixedHex32(DEPLOYMENT_BLOCK),
    transactionIndex: 1,
    receiptStatus: "success" as const,
    retainedSetterCallCount: BOOTSTRAP_SETTER_CALLS.length,
    retainedSetterLogIndices: BOOTSTRAP_SETTER_CALLS.map(
      (call) => call.log.logIndex
    ),
    transactionRpcMethod: "eth_getTransactionByHash" as const,
    receiptRpcMethod: "eth_getTransactionReceipt" as const,
    traceRpcMethod: "debug_traceTransaction" as const,
    tracer: "callTracer" as const,
    tracerConfig: { onlyTopCall: false as const, withLog: true as const },
    reexec: 0 as const,
    normalization:
      "root_empty_array_then_zero_based_full_call_tree_child_indices" as const,
    fixtureMethod:
      "committed_synthetic_configuration_setter_transaction_fixture_v1" as const,
    fixturePath: "tests/fixtures/dao-feed-v1.ts" as const,
    fixtureProjectionSha256:
      "0xc1ac723dbddea514bfbec3b27df45f697829dbfd3e783cefbda5c784f7fbe7db" as const,
    clientVersion: null,
    rawTransactionSha256: null,
    rawReceiptSha256: null,
    rawTraceSha256: null,
    transactionObjectKey: null,
    receiptObjectKey: null,
    traceObjectKey: null,
  },
];

const CONFIGURATION_SETTER_CALLS = [
  configurationSetterCall({
    abi: {
      setter: "set_vote_parameters",
      votingPeriodSeconds: 604_900n,
      voterAddress: CHANGED_VOTER_ADDRESS,
    },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [0],
    logIndex: 0,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_execute_parameters",
      executionDelaySeconds: 172_800n,
      executionGuard: "permissionless",
      executorAddress: CHANGED_EXECUTOR_ADDRESS,
    },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [1],
    logIndex: 1,
  }),
  configurationSetterCall({
    abi: { setter: "set_hooks", hooksAddress: CHANGED_VOTING_HOOK_ADDRESS },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [2],
    logIndex: 2,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_weight_measure",
      measureAddress: CHANGED_WEIGHT_MEASURE_ADDRESS,
    },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [3],
    logIndex: 3,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_propose_parameters",
      minWeight: 1_000_000_000_000_000_000n,
      cooldownSeconds: 86_400n,
      blacklistAddress: CHANGED_PROPOSAL_BLACKLIST_ADDRESS,
    },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [4],
    logIndex: 4,
  }),
  configurationSetterCall({
    abi: { setter: "set_operator", operatorAddress: CHANGED_OPERATOR_ADDRESS },
    target: DAO_MOCK_VOTING_ADDRESS,
    sourceContract: "Voting",
    traceAddress: [5],
    logIndex: 5,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_decay_length",
      voterDecayLengthSeconds: BigInt(CHANGED_VOTER_DECAY_LENGTH_SECONDS),
    },
    target: CHANGED_VOTER_ADDRESS,
    sourceContract: "Voter",
    traceAddress: [6],
    logIndex: 6,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_delegated_staking",
      delegatedStakingAddress: CHANGED_STYFIX_AGGREGATE_ADDRESS,
    },
    target: CHANGED_VOTER_ADDRESS,
    sourceContract: "Voter",
    traceAddress: [7],
    logIndex: 7,
  }),
  configurationSetterCall({
    abi: { setter: "set_ybc", ybcAddress: CHANGED_YBC_AGGREGATE_ADDRESS },
    target: CHANGED_VOTER_ADDRESS,
    sourceContract: "Voter",
    traceAddress: [8],
    logIndex: 8,
  }),
  configurationSetterCall({
    abi: {
      setter: "set_ybc_weight_aggregator",
      ybcWeightAggregatorAddress: CHANGED_YBC_WEIGHT_AGGREGATOR_ADDRESS,
    },
    target: CHANGED_VOTER_ADDRESS,
    sourceContract: "Voter",
    traceAddress: [9],
    logIndex: 9,
  }),
] satisfies FixtureSetterCall[];

const CONFIGURATION_SETTER_RECEIPT = {
  status: "success" as const,
  transactionHash: CONFIGURATION_CHANGE_TRANSACTION_HASH,
  transactionSender: DAO_MOCK_OPERATOR_ADDRESS,
  blockNumber: CONFIGURATION_CHANGE_BLOCK.toString(),
  blockHash: fixedHex32(CONFIGURATION_CHANGE_BLOCK),
  blockTimestamp: null,
  transactionIndex: 0,
  totalMatchingSetterLogCount: CONFIGURATION_SETTER_CALLS.length,
  retainedBoundarySetterLogCount: CONFIGURATION_SETTER_CALLS.length,
};

const CONFIGURATION_SETTER_TRACE_PROJECTION =
  deriveDaoConfigurationSetterTraceProjectionSha256({
    receipt: {
      transactionHash: CONFIGURATION_SETTER_RECEIPT.transactionHash,
      transactionSender: CONFIGURATION_SETTER_RECEIPT.transactionSender,
      blockNumber: CONFIGURATION_SETTER_RECEIPT.blockNumber,
      blockHash: CONFIGURATION_SETTER_RECEIPT.blockHash,
      transactionIndex: CONFIGURATION_SETTER_RECEIPT.transactionIndex,
    },
    setterCalls: CONFIGURATION_SETTER_CALLS,
  });

const INITIAL_CONFIGURATION_EFFECTIVE_AT = {
  kind: "start_of_block" as const,
  blockNumber: PRODUCER_START_BLOCK.toString(),
  blockHash: fixedHex32(PRODUCER_START_BLOCK),
} as const;
const INITIAL_CODE_EVIDENCE_POSITION = {
  blockNumber: DEPLOYMENT_BLOCK.toString(),
  blockHash: fixedHex32(DEPLOYMENT_BLOCK),
  transactionIndex: 1,
  logIndex: 8,
} as const;
const INITIAL_CONFIGURATION_VALUES = {
  contractGeneration: "1",
  configurationId: "config-1",
  voteStartOffsetSeconds: 604_800,
  votingPeriodSeconds: 604_800,
  votingWindowState: "enabled" as const,
  executionDelaySeconds: 86_400,
  executionGuard: "guarded" as const,
  voterDecayLengthSeconds: 0,
  voterAddress: DAO_MOCK_VOTER_ADDRESS,
  voterState: "configured" as const,
  voterImplementation: pinnedVoterImplementation(
    DAO_MOCK_VOTER_ADDRESS,
    INITIAL_CODE_EVIDENCE_POSITION
  ),
  delegatedStakingAddress: DAO_MOCK_STYFIX_AGGREGATE_ADDRESS,
  delegatedStakingState: "configured" as const,
  ybcAddress: DAO_MOCK_YBC_AGGREGATE_ADDRESS,
  ybcState: "configured" as const,
  ybcWeightAggregatorAddress: YBC_WEIGHT_AGGREGATOR_ADDRESS,
  ybcWeightAggregatorState: "configured" as const,
  executorAddress: DAO_MOCK_EXECUTOR_ADDRESS,
  executorState: "configured" as const,
  executorImplementation: pinnedExecutorImplementation(
    DAO_MOCK_EXECUTOR_ADDRESS,
    INITIAL_CODE_EVIDENCE_POSITION
  ),
  votingHookAddress: VOTING_HOOK_ADDRESS,
  votingHookState: "configured" as const,
  weightMeasureAddress: WEIGHT_MEASURE_ADDRESS,
  weightMeasureState: "configured" as const,
  proposalBlacklistAddress: PROPOSAL_BLACKLIST_ADDRESS,
  proposalBlacklistState: "configured" as const,
  operatorAddress: DAO_MOCK_OPERATOR_ADDRESS,
  operatorState: "configured" as const,
  guardianAddress: DAO_MOCK_GUARDIAN_ADDRESS,
};
const INITIAL_CONFIGURATION_VALUES_SHA256 =
  deriveDaoConfigurationValuesSha256(INITIAL_CONFIGURATION_VALUES);
const BOOTSTRAP_COVERED_BLOCKS = [
  {
    number: DEPLOYMENT_BLOCK.toString(),
    hash: fixedHex32(DEPLOYMENT_BLOCK),
    timestamp: null,
  },
];
const BOOTSTRAP_MANIFEST = canonicalizeDaoConfigurationBootstrapSetterManifest({
  chainId: 1,
  votingAddress: DAO_MOCK_VOTING_ADDRESS,
  fromBlockNumber: DEPLOYMENT_BLOCK.toString(),
  toBlockNumber: DEPLOYMENT_BLOCK.toString(),
  coveredBlocks: BOOTSTRAP_COVERED_BLOCKS,
  trackedSetterLogs: BOOTSTRAP_TRACKED_SETTER_LOGS,
  transactionEvidence: BOOTSTRAP_TRANSACTION_EVIDENCE,
});
const BOOTSTRAP_MANIFEST_BYTES = toBytes(BOOTSTRAP_MANIFEST);
const BOOTSTRAP_MANIFEST_SHA256 = sha256(BOOTSTRAP_MANIFEST_BYTES);
const BOOTSTRAP_SCAN_PROJECTION =
  deriveDaoConfigurationBootstrapScanProjectionSha256({
    fromBlockNumber: DEPLOYMENT_BLOCK.toString(),
    toBlockNumber: DEPLOYMENT_BLOCK.toString(),
    toBlockHash: fixedHex32(DEPLOYMENT_BLOCK),
    coveredBlocks: BOOTSTRAP_COVERED_BLOCKS,
    votingAddress: DAO_MOCK_VOTING_ADDRESS,
    lifecycleLogCount: 0,
    trackedSetterLogCount: BOOTSTRAP_TRACKED_SETTER_LOGS.length,
    canonicalManifestByteLength: BOOTSTRAP_MANIFEST_BYTES.length,
    canonicalManifestSha256: BOOTSTRAP_MANIFEST_SHA256,
    replayedConfigurationValuesSha256:
      INITIAL_CONFIGURATION_VALUES_SHA256,
  });

const CHANGED_CONFIGURATION_EFFECTIVE_AT = {
  kind: "canonical_setter_log" as const,
  blockNumber: CONFIGURATION_CHANGE_BLOCK.toString(),
  blockHash: fixedHex32(CONFIGURATION_CHANGE_BLOCK),
  transactionIndex: 0,
  logIndex: 9,
} as const;
const CHANGED_CONFIGURATION_VALUES = {
  contractGeneration: "1",
  configurationId: "config-2",
  voteStartOffsetSeconds: 604_700,
  votingPeriodSeconds: 604_900,
  votingWindowState: "enabled" as const,
  executionDelaySeconds: 172_800,
  executionGuard: "permissionless" as const,
  voterDecayLengthSeconds: CHANGED_VOTER_DECAY_LENGTH_SECONDS,
  voterAddress: CHANGED_VOTER_ADDRESS,
  voterState: "configured" as const,
  voterImplementation: pinnedVoterImplementation(
    CHANGED_VOTER_ADDRESS,
    CHANGED_CONFIGURATION_EFFECTIVE_AT
  ),
  delegatedStakingAddress: CHANGED_STYFIX_AGGREGATE_ADDRESS,
  delegatedStakingState: "configured" as const,
  ybcAddress: CHANGED_YBC_AGGREGATE_ADDRESS,
  ybcState: "configured" as const,
  ybcWeightAggregatorAddress: CHANGED_YBC_WEIGHT_AGGREGATOR_ADDRESS,
  ybcWeightAggregatorState: "configured" as const,
  executorAddress: CHANGED_EXECUTOR_ADDRESS,
  executorState: "configured" as const,
  executorImplementation: pinnedExecutorImplementation(
    CHANGED_EXECUTOR_ADDRESS,
    CHANGED_CONFIGURATION_EFFECTIVE_AT
  ),
  votingHookAddress: CHANGED_VOTING_HOOK_ADDRESS,
  votingHookState: "configured" as const,
  weightMeasureAddress: CHANGED_WEIGHT_MEASURE_ADDRESS,
  weightMeasureState: "configured" as const,
  proposalBlacklistAddress: CHANGED_PROPOSAL_BLACKLIST_ADDRESS,
  proposalBlacklistState: "configured" as const,
  operatorAddress: CHANGED_OPERATOR_ADDRESS,
  operatorState: "configured" as const,
  guardianAddress: DAO_MOCK_GUARDIAN_ADDRESS,
};
const CHANGED_CONFIGURATION_VALUES_SHA256 =
  deriveDaoConfigurationValuesSha256(CHANGED_CONFIGURATION_VALUES);
const CHANGED_CONFIGURATION_HISTORY_MANIFEST_SHA256 = sha256(
  toBytes(
    canonicalizeDaoConfigurationSetterHistoryManifest({
      priorTrackedSetterHistoryLogCount:
        BOOTSTRAP_TRACKED_SETTER_LOGS.length,
      priorTrackedSetterHistoryManifestSha256: BOOTSTRAP_MANIFEST_SHA256,
      receipt: CONFIGURATION_SETTER_RECEIPT,
      setterCalls: CONFIGURATION_SETTER_CALLS,
    })
  )
);
const CHANGED_CONFIGURATION_STATE_PROJECTION =
  deriveDaoConfigurationSetterStateProjectionSha256({
    votingAddress: DAO_MOCK_VOTING_ADDRESS,
    blockNumber: CHANGED_CONFIGURATION_EFFECTIVE_AT.blockNumber,
    blockHash: CHANGED_CONFIGURATION_EFFECTIVE_AT.blockHash,
    transactionIndex: CHANGED_CONFIGURATION_EFFECTIVE_AT.transactionIndex,
    logIndex: CHANGED_CONFIGURATION_EFFECTIVE_AT.logIndex,
    configurationValuesSha256: CHANGED_CONFIGURATION_VALUES_SHA256,
    trackedSetterHistoryLogCount:
      BOOTSTRAP_TRACKED_SETTER_LOGS.length + CONFIGURATION_SETTER_CALLS.length,
    trackedSetterHistoryManifestSha256:
      CHANGED_CONFIGURATION_HISTORY_MANIFEST_SHA256,
  });

const FIXTURE_CONFIGURATIONS: readonly FixtureConfiguration[] = [
  {
    ...INITIAL_CONFIGURATION_VALUES,
    effectiveAt: INITIAL_CONFIGURATION_EFFECTIVE_AT,
    source: PINNED_SOURCE,
    boundary: {
      kind: "producer_start_state_snapshot_sentinel",
      positionSemantics:
        "logical_start_of_scan_after_authenticated_prestart_setter_replay",
      stateSnapshot: {
        evidenceKind: "committed_synthetic_fixture",
        rpcMethods: null,
        fixturePath: "tests/fixtures/dao-feed-v1.ts",
        fixtureProjectionSha256:
          deriveDaoConfigurationBootstrapProjectionSha256({
            startBlockNumber: PRODUCER_START_BLOCK.toString(),
            startBlockHash: fixedHex32(PRODUCER_START_BLOCK),
            parentBlockNumber: DEPLOYMENT_BLOCK.toString(),
            parentBlockHash: fixedHex32(DEPLOYMENT_BLOCK),
            votingAddress: DAO_MOCK_VOTING_ADDRESS,
            configurationValuesSha256:
              INITIAL_CONFIGURATION_VALUES_SHA256,
          }),
        parentBlockNumber: DEPLOYMENT_BLOCK.toString(),
        parentBlockHash: fixedHex32(DEPLOYMENT_BLOCK),
        statePosition: "end_of_parent_block_for_start_of_next_block",
        configurationValuesSha256: INITIAL_CONFIGURATION_VALUES_SHA256,
      },
      scanManifest: {
        evidenceKind: "committed_synthetic_fixture",
        rpcMethod: null,
        fixturePath: "tests/fixtures/dao-feed-v1.ts",
        fixtureProjectionSha256: BOOTSTRAP_SCAN_PROJECTION,
        manifestObjectKey: null,
        fromBlockNumber: DEPLOYMENT_BLOCK.toString(),
        toBlockNumber: DEPLOYMENT_BLOCK.toString(),
        toBlockHash: fixedHex32(DEPLOYMENT_BLOCK),
        coveredBlocks: BOOTSTRAP_COVERED_BLOCKS,
        votingAddress: DAO_MOCK_VOTING_ADDRESS,
        lifecycleLogCount: 0,
        trackedSetterLogCount: BOOTSTRAP_TRACKED_SETTER_LOGS.length,
        trackedSetterLogs: BOOTSTRAP_TRACKED_SETTER_LOGS,
        transactionEvidence: BOOTSTRAP_TRANSACTION_EVIDENCE,
        canonicalManifestEncoding:
          "canonical_json_utf8_lexicographic_keys_no_whitespace_one_final_lf",
        canonicalManifestByteLength: BOOTSTRAP_MANIFEST_BYTES.length,
        canonicalManifestSha256: BOOTSTRAP_MANIFEST_SHA256,
        replayedConfigurationValuesSha256:
          INITIAL_CONFIGURATION_VALUES_SHA256,
        coverage: "contract_creation_through_end_of_parent_block_inclusive",
        replaySemantics:
          "canonical_tracked_setter_log_replay_equals_start_state_snapshot",
      },
      effectiveness:
        "effective_for_all_included_positions_at_or_after_producer_start",
      setterCalls: [],
    },
  },
  {
    ...CHANGED_CONFIGURATION_VALUES,
    effectiveAt: CHANGED_CONFIGURATION_EFFECTIVE_AT,
    source: PINNED_SOURCE,
    boundary: {
      kind: "setter_trace_observation",
      positionSemantics:
        "last_canonical_setter_log_after_successful_setter_calls",
      receipt: CONFIGURATION_SETTER_RECEIPT,
      traceEvidence: {
        sourceKind: "committed_synthetic_fixture",
        rpcMethod: "debug_traceTransaction",
        tracer: "callTracer",
        fixtureMethod:
          "committed_synthetic_configuration_setter_trace_fixture_v1",
        fixturePath: "tests/fixtures/dao-feed-v1.ts",
        fixtureProjectionSha256: CONFIGURATION_SETTER_TRACE_PROJECTION,
        clientVersion: null,
        rawTraceSha256: null,
        tracerConfig: { onlyTopCall: false, withLog: true },
        reexec: 0,
        normalization:
          "root_empty_array_then_zero_based_full_call_tree_child_indices",
      },
      stateSnapshot: {
        evidenceKind: "committed_synthetic_fixture",
        rpcMethods: null,
        fixturePath: "tests/fixtures/dao-feed-v1.ts",
        fixtureProjectionSha256: CHANGED_CONFIGURATION_STATE_PROJECTION,
        manifestObjectKey: null,
        blockNumber: CHANGED_CONFIGURATION_EFFECTIVE_AT.blockNumber,
        blockHash: CHANGED_CONFIGURATION_EFFECTIVE_AT.blockHash,
        transactionIndex: CHANGED_CONFIGURATION_EFFECTIVE_AT.transactionIndex,
        logIndex: CHANGED_CONFIGURATION_EFFECTIVE_AT.logIndex,
        statePosition: "immediately_after_final_canonical_setter_log",
        configurationValuesSha256: CHANGED_CONFIGURATION_VALUES_SHA256,
        trackedSetterHistoryLogCount:
          BOOTSTRAP_TRACKED_SETTER_LOGS.length +
          CONFIGURATION_SETTER_CALLS.length,
        trackedSetterHistoryManifestSha256:
          CHANGED_CONFIGURATION_HISTORY_MANIFEST_SHA256,
        voterTargetStateEvidence: {
          state: "established_by_post_pointer_setters",
          voterAddress: CHANGED_VOTER_ADDRESS,
          pointerSetterLogIndex: 0,
          decayLengthSetterLogIndex: 6,
          delegatedStakingSetterLogIndex: 7,
          ybcSetterLogIndex: 8,
          ybcWeightAggregatorSetterLogIndex: 9,
          semantics:
            "all_nested_voter_values_established_after_pointer_setter",
        },
        replayCoverage:
          "voting_creation_and_effective_voter_history_through_final_setter_log",
        replaySemantics:
          "canonical_voting_and_effective_voter_setter_replay_equals_configuration",
      },
      effectiveness: "effective_at_and_after_last_canonical_setter_log",
      setterCalls: CONFIGURATION_SETTER_CALLS,
    },
  },
];

const FIXTURE_BLOCK_ALLOCATION_STEP = 50n;
const FIXTURE_FINAL_LIFECYCLE_BLOCK = 23_906_043n;

const FIXTURE_BLOCK_ALLOCATIONS = createFixtureBlockAllocations();

function createFixtureBlockAllocations(): Map<
  string,
  FixtureBlockAllocation
> {
  type PlannedBlock = {
    key: string;
    orderTimestamp: number;
    timestamp: number | null;
    postConfigurationTimestamp: number | null;
    stableOrder: number;
  };

  const instances: Array<{
    source: DaoProposal;
    blockOffset: bigint;
    variant: Variant | null;
  }> = DAO_MOCK_FEED.proposals.map((source) => ({
    source,
    blockOffset: 0n,
    variant: null,
  }));
  for (const variant of FIXTURE_VARIANTS) {
    const source = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === variant.sourceId
    );
    if (!source) {
      throw new Error(`Missing fixture source ${variant.sourceId}.`);
    }
    instances.push({ source, blockOffset: variant.blockOffset, variant });
  }

  const planned: PlannedBlock[] = [];
  let stableOrder = 0;
  for (const { source, blockOffset, variant } of instances) {
    const sourceBlocks = new Set<bigint>();
    for (const event of source.events) {
      if (sourceBlocks.has(event.log.blockNumber)) continue;
      sourceBlocks.add(event.log.blockNumber);
      const keepDiscussionOnlyCreationTimeUnknown =
        variant === null && source.ref.proposalId === 1n;
      const timestamp = keepDiscussionOnlyCreationTimeUnknown
        ? null
        : EVENT_BLOCK_TIMESTAMPS.get(event.log.blockNumber) ?? null;
      const containsExecute = source.events.some(
        (candidate) =>
          candidate.log.blockNumber === event.log.blockNumber &&
          candidate.type === "execute"
      );
      planned.push({
        key: fixtureBlockKey(blockOffset, event.log.blockNumber),
        orderTimestamp: keepDiscussionOnlyCreationTimeUnknown
          ? DAO_GENESIS_TIMESTAMP - 1
          : timestamp ?? fixtureUnknownBlockOrderTimestamp(source),
        timestamp,
        postConfigurationTimestamp: containsExecute
          ? DAO_GENESIS_TIMESTAMP +
            (Number(source.votingEpoch) + 1) *
              DAO_FEED_EPOCH_LENGTH_SECONDS +
            CHANGED_CONFIGURATION_VALUES.executionDelaySeconds +
            3_600
          : null,
        stableOrder: stableOrder++,
      });
    }

    if (variant?.name === "signal-explicit-execute") {
      const blockNumber = fixtureSignalExecuteSourceBlock(source);
      const timestamp =
        DAO_GENESIS_TIMESTAMP +
        (Number(source.votingEpoch) + 1) * DAO_FEED_EPOCH_LENGTH_SECONDS +
        CHANGED_CONFIGURATION_VALUES.executionDelaySeconds;
      planned.push({
        key: fixtureBlockKey(blockOffset, blockNumber),
        orderTimestamp: timestamp,
        timestamp,
        postConfigurationTimestamp: timestamp,
        stableOrder: stableOrder++,
      });
    }
  }

  planned.sort(
    (left, right) =>
      left.orderTimestamp - right.orderTimestamp ||
      left.stableOrder - right.stableOrder
  );

  const firstPostConfigurationVariant = FIXTURE_VARIANTS.find(
    (variant) => variant.name === "malformed-script"
  );
  const firstPostConfigurationSource =
    firstPostConfigurationVariant === undefined
      ? undefined
      : DAO_MOCK_FEED.proposals.find(
          (proposal) =>
            proposal.ref.proposalId ===
            firstPostConfigurationVariant.sourceId
        );
  const firstPostConfigurationBlock =
    firstPostConfigurationSource?.events[0]?.log.blockNumber;
  if (
    firstPostConfigurationVariant === undefined ||
    firstPostConfigurationBlock === undefined
  ) {
    throw new Error("Missing post-configuration fixture allocation anchor.");
  }
  const firstPostConfigurationKey = fixtureBlockKey(
    firstPostConfigurationVariant.blockOffset,
    firstPostConfigurationBlock
  );
  const postConfigurationIndex = planned.findIndex(
    (entry) => entry.key === firstPostConfigurationKey
  );
  if (postConfigurationIndex <= 0) {
    throw new Error("Invalid post-configuration fixture allocation anchor.");
  }

  let previousKnownTimestamp: number | null = null;
  const latestLifecycleTimestamp =
    DAO_MOCK_FEED.canonicalBlock.timestamp - 2;
  for (const [index, entry] of planned.entries()) {
    if (
      index >= postConfigurationIndex &&
      entry.postConfigurationTimestamp !== null
    ) {
      entry.timestamp = entry.postConfigurationTimestamp;
    }
    if (entry.timestamp === null) continue;
    const timestamp = Math.max(
      Math.min(entry.timestamp, latestLifecycleTimestamp),
      previousKnownTimestamp === null ? 0 : previousKnownTimestamp + 1
    );
    if (timestamp > latestLifecycleTimestamp) {
      throw new Error(
        "Fixture lifecycle timestamps must leave room for a retirement cutover before the canonical block time."
      );
    }
    entry.timestamp = timestamp;
    previousKnownTimestamp = timestamp;
  }

  const allocations = new Map<string, FixtureBlockAllocation>();
  for (const [index, entry] of planned.entries()) {
    const isFinal = index === planned.length - 1;
    const blockNumber = isFinal
      ? FIXTURE_FINAL_LIFECYCLE_BLOCK
      : index < postConfigurationIndex
        ? CONFIGURATION_CHANGE_BLOCK -
          BigInt(postConfigurationIndex - index) *
            FIXTURE_BLOCK_ALLOCATION_STEP
        : CONFIGURATION_CHANGE_BLOCK +
          BigInt(index - postConfigurationIndex + 1) *
            FIXTURE_BLOCK_ALLOCATION_STEP;
    if (
      blockNumber < PRODUCER_START_BLOCK ||
      blockNumber >= 24_000_000n ||
      (!isFinal && blockNumber >= FIXTURE_FINAL_LIFECYCLE_BLOCK)
    ) {
      throw new Error("Fixture lifecycle block allocation is out of range.");
    }
    allocations.set(entry.key, {
      blockNumber,
      timestamp: entry.timestamp,
    });
  }
  return allocations;
}

function fixtureBlockKey(blockOffset: bigint, sourceBlock: bigint): string {
  return `${blockOffset.toString()}:${sourceBlock.toString()}`;
}

function fixtureUnknownBlockOrderTimestamp(source: DaoProposal): number {
  return (
    DAO_GENESIS_TIMESTAMP +
    Number(source.votingEpoch) * DAO_FEED_EPOCH_LENGTH_SECONDS -
    1
  );
}

function fixtureSignalExecuteSourceBlock(source: DaoProposal): bigint {
  const last = source.events.at(-1);
  if (!last) throw new Error("Signal Execute fixture requires source events.");
  return last.log.blockNumber + 1n;
}

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
        startBlockNumber: PRODUCER_START_BLOCK.toString(),
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
        startBlock: PRODUCER_START_BLOCK.toString(),
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
  const receiptProjection = {
    transactionHash: propose.log.transactionHash as Hex,
    transactionSender: propose.data.proposer as Address,
    blockNumber: propose.log.blockNumber,
    blockHash: propose.log.blockHash as Hex,
    transactionIndex: propose.log.transactionIndex,
    status: "success" as const,
    matchingProposeLogCount: 1 as const,
  };
  const common = {
    schemaVersion: DAO_FEED_SCHEMA_VERSION,
    ref: proposal.ref,
    transactionHash: propose.log.transactionHash,
    receipt: {
      ...receiptProjection,
      evidenceKind: "committed_synthetic_fixture",
      rpcMethod: null,
      fixturePath: "tests/fixtures/dao-feed-v1.ts",
      fixtureProjectionSha256:
        deriveDaoCreationStageReceiptProjectionSha256(receiptProjection),
      rawResultSha256: null,
      rawResultObjectKey: null,
    },
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
  repairPinnedAggregateBasisPoints(events, ref);
  if (variant?.name === "signal-explicit-execute") {
    addSignalExecuteEvent(events, source, ref, variant);
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
    exactScript,
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
  const wireTotals = calculateWireVoteTotals(events);
  const thresholdStorageSlots =
    deriveDaoVotingThresholdStorageSlots(proposalId);
  const thresholdStorageWord = fixedHex32(BigInt(source.thresholdBps));

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
    totalWeight: wireTotals.total.toString(),
    yeaWeight: wireTotals.yea.toString(),
    nayWeight: (wireTotals.total - wireTotals.yea).toString(),
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
      thresholdEvidence: {
        state: "verified_stored_proposal_threshold",
        source: PINNED_SOURCE,
        evidenceKind: "committed_synthetic_fixture",
        rpcMethod: null,
        fixturePath: "tests/fixtures/dao-feed-v1.ts",
        fixtureProjectionSha256:
          deriveDaoProposalThresholdProjectionSha256({
            votingAddress: source.ref.votingAddress,
            proposalId: proposalId.toString(),
            blockNumber: propose.log.blockNumber,
    blockHash: propose.log.blockHash as Hex,
            resolvedStorageSlot: thresholdStorageSlots.resolvedStorageSlot,
            storageWord: thresholdStorageWord,
          }),
        rawResultSha256: null,
        rawResultObjectKey: null,
        votingAddress: source.ref.votingAddress,
        proposalId: proposalId.toString(),
        blockNumber: propose.log.blockNumber,
        blockHash: propose.log.blockHash,
        blockHashVerification: "canonical_hash_at_height",
        storageLayout: {
          compiler: "vyper@0.4.2",
          sourceSha256:
            "0x6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e",
          layoutArtifactSha256:
            "0x0f963a37d02adeb6a34fabb98ab37b118031ac9b7380e4ad65ac2765b4b6db26",
          derivation:
            "keccak256(bytes32(mapping_base_slot) || bytes32(proposal_id)) + threshold_field_slot_offset",
          mappingBaseSlot: "17",
          mappingKey: proposalId.toString(),
          mappingHashInputOrder: "slot_then_key",
          proposalStorageBaseSlot:
            thresholdStorageSlots.proposalStorageBaseSlot,
          thresholdFieldSlotOffset: 4,
          resolvedStorageSlot: thresholdStorageSlots.resolvedStorageSlot,
        },
        storageWord: thresholdStorageWord,
        decodedThresholdBps: source.thresholdBps,
      },
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
  exactScript: Hex | null,
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
  if (exactScript === null) {
    throw new Error("Completed simulation requires exact retained script bytes.");
  }
  if (
    configuration.executorImplementation.state !== "verified_pinned" ||
    configuration.executorImplementation.bytecode === null
  ) {
    throw new Error(
      "Completed simulation fixtures require a verified pinned Executor implementation."
    );
  }
  const storageSlots = deriveDaoVotingExecutedStorageSlots(proposalId);
  const harnessRevision = "dao-feed-v1-fixture";
  const harnessArtifactSha256 = fixedHex32(77_777n);
  const blockGasLimit = "36000000";
  const blockBaseFeePerGasWei = "1";
  const blockExcessBlobGas = "50331648";
  const blobBaseFeeWei = "74";
  const executorFrameInitialGas = "30000000";
  const effectiveGasPriceWei = "1";
  const executeCalldata = deriveDaoExecutorExecuteCalldata(exactScript);
  const executeCalldataSha256 = sha256(toBytes(executeCalldata));
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
  const executorCodeProjection = {
    address: configuration.executorAddress,
    blockNumber: proposeLog.blockNumber,
    blockHash: proposeLog.blockHash,
    codeByteLength: PINNED_EXECUTOR_RUNTIME_BYTE_LENGTH,
    deployedBytecodeHash: PINNED_EXECUTOR_RUNTIME_KECCAK256,
  } as const;
  const executorImplementation = {
    ...configuration.executorImplementation,
    bytecode: {
      ...configuration.executorImplementation.bytecode,
      blockNumber: proposeLog.blockNumber,
      blockHash: proposeLog.blockHash,
      fixtureProjectionSha256: deriveDaoSyntheticEvidenceSha256(
        "executor_eth_getCode_projection",
        executorCodeProjection
      ),
    },
  };
  const blockHeaderProjection = {
    blockNumber: proposeLog.blockNumber,
    blockHash: proposeLog.blockHash,
    timestamp: proposeLog.timestamp,
    gasLimit: blockGasLimit,
    baseFeePerGasWei: blockBaseFeePerGasWei,
    beneficiary: SYNTHETIC_BLOCK_BENEFICIARY,
    difficulty: "0",
    prevRandao: SYNTHETIC_BLOCK_PREV_RANDAO,
    excessBlobGas: blockExcessBlobGas,
  } as const;
  const receiptProjection = {
    transactionHash: proposeLog.transactionHash,
    transactionSender: sourceProposal.proposer,
    blockNumber: proposeLog.blockNumber,
    blockHash: proposeLog.blockHash,
    status: "success",
    effectiveGasPriceWei,
  } as const;
  const votingCodeProjection = {
    address: DAO_MOCK_VOTING_ADDRESS,
    blockNumber: proposeLog.blockNumber,
    blockHash: proposeLog.blockHash,
    codeByteLength: 4_096,
    deployedBytecodeHash: fixedHex32(99_999n),
  } as const;
  const warmAddresses = [
    sourceProposal.proposer,
    DAO_MOCK_VOTING_ADDRESS,
    configuration.executorAddress,
    SYNTHETIC_BLOCK_BENEFICIARY,
    ...OSAKA_PRECOMPILE_ADDRESSES,
  ]
    .map((address) => address.toLowerCase() as Address)
    .filter((address, index, values) => values.indexOf(address) === index)
    .sort();
  const executorOperatorStorageSlot =
    deriveDaoExecutorOperatorStorageSlot(DAO_MOCK_VOTING_ADDRESS);
  const executorOperatorStorageWord = fixedHex32(1n);
  const executorOperatorRelevantSetterLogs = [] as const;
  const executorOperatorReplayManifest =
    canonicalizeDaoExecutorOperatorSetterManifest({
      executorAddress: configuration.executorAddress as Address,
      votingAddress: DAO_MOCK_VOTING_ADDRESS,
      blockNumber: proposeLog.blockNumber,
      blockHash: proposeLog.blockHash,
      relevantSetterLogs: executorOperatorRelevantSetterLogs,
    });
  const executorOperatorReplayManifestBytes = toBytes(
    executorOperatorReplayManifest
  );
  const executorOperatorReplayManifestSha256 = sha256(
    executorOperatorReplayManifestBytes
  );
  const executorOperatorBlockEndProjectionSha256 =
    deriveDaoExecutorOperatorStorageProjectionSha256({
      executorAddress: configuration.executorAddress as Address,
      votingAddress: DAO_MOCK_VOTING_ADDRESS,
      blockNumber: proposeLog.blockNumber,
      blockHash: proposeLog.blockHash,
      resolvedStorageSlot: executorOperatorStorageSlot,
      storageWord: executorOperatorStorageWord,
    });
  const executorOperatorReplayProjectionSha256 =
    deriveDaoExecutorOperatorReplayProjectionSha256({
      executorAddress: configuration.executorAddress as Address,
      votingAddress: DAO_MOCK_VOTING_ADDRESS,
      blockNumber: proposeLog.blockNumber,
      blockHash: proposeLog.blockHash,
      proposeTransactionIndex: proposeLog.transactionIndex,
      proposeLogIndex: proposeLog.logIndex,
      relevantSetterLogCount: 0,
      appliedThroughProposeLogCount: 0,
      laterSetterLogCount: 0,
      canonicalManifestSha256:
        executorOperatorReplayManifestSha256,
    });
  const contextInputsSha256 = deriveDaoSimulationContextInputsSha256({
    chainId: 1,
    blockNumber: proposeLog.blockNumber,
    blockHash: proposeLog.blockHash,
    blockTimestamp: proposeLog.timestamp,
    blockGasLimit,
    blockBaseFeePerGasWei,
    blockBeneficiary: SYNTHETIC_BLOCK_BENEFICIARY,
    blockPrevRandao: SYNTHETIC_BLOCK_PREV_RANDAO,
    blockExcessBlobGas,
    blobBaseFeeWei,
    blockHeaderEvidenceKind: "committed_synthetic_fixture",
    blockHeaderFixtureProjectionSha256: deriveDaoSyntheticEvidenceSha256(
      "block_header_projection",
      blockHeaderProjection
    ),
    blockHeaderRawResultSha256: null,
    blockHeaderRawResultObjectKey: null,
    proposeTransactionHash: proposeLog.transactionHash,
    proposeTransactionSender: sourceProposal.proposer,
    proposeReceiptBlockNumber: proposeLog.blockNumber,
    proposeReceiptBlockHash: proposeLog.blockHash,
    proposeReceiptEffectiveGasPriceWei: effectiveGasPriceWei,
    proposeReceiptEvidenceKind: "committed_synthetic_fixture",
    proposeReceiptFixtureProjectionSha256:
      deriveDaoSyntheticEvidenceSha256(
        "propose_receipt_projection",
        receiptProjection
      ),
    proposeReceiptRawResultSha256: null,
    proposeReceiptRawResultObjectKey: null,
    transactionOrigin: sourceProposal.proposer,
    votingCaller: DAO_MOCK_VOTING_ADDRESS,
    executorAddress: configuration.executorAddress as Address,
    executorCaller: DAO_MOCK_VOTING_ADDRESS,
    executorCodeAddress: configuration.executorAddress as Address,
    targetCaller: configuration.executorAddress as Address,
    harnessRevision,
    harnessArtifactSha256,
    scriptHash,
    executeCalldataSha256,
    executorSourceRevision: executorImplementation.source.revision,
    executorSourcePath: executorImplementation.source.sourcePath,
    executorSourceSha256: executorImplementation.sourceSha256,
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
    executorEvidenceKind:
      "committed_synthetic_fixture_and_reproducible_build",
    executorEvidenceFixtureProjectionSha256:
      executorImplementation.bytecode.fixtureProjectionSha256,
    executorEvidenceRawResultSha256: null,
    executorEvidenceRawResultObjectKey: null,
    executorOperatorStorageSlot,
    executorOperatorBlockEndStorageWord: executorOperatorStorageWord,
    executorOperatorAuthorizedAtPropose: true,
    executorOperatorBlockEndEvidenceKind: "committed_synthetic_fixture",
    executorOperatorBlockEndFixtureProjectionSha256:
      executorOperatorBlockEndProjectionSha256,
    executorOperatorBlockEndRawResultSha256: null,
    executorOperatorBlockEndRawResultObjectKey: null,
    executorOperatorReplayManifestSha256,
    executorOperatorReplayRelevantSetterLogCount: 0,
    executorOperatorReplayAppliedSetterLogCount: 0,
    executorOperatorReplayEvidenceKind: "committed_synthetic_fixture",
    executorOperatorReplayFixtureProjectionSha256:
      executorOperatorReplayProjectionSha256,
    executorOperatorReplayRawLogsSha256: null,
    executorOperatorReplayRawLogsObjectKey: null,
    executorFrameInitialGas,
    effectiveGasPriceWei,
    overrideVotingAddress: DAO_MOCK_VOTING_ADDRESS,
    overrideProposalId: proposalId.toString(),
    overrideResolvedStorageSlot: storageSlots.resolvedStorageSlot,
    overridePreStorageWord: fixedHex32(0n),
    overridePostStorageWord: fixedHex32(1n),
    overrideVotingCodeHash: fixedHex32(99_999n),
    overrideVotingEvidenceKind: "committed_synthetic_fixture",
    overrideVotingFixtureProjectionSha256: deriveDaoSyntheticEvidenceSha256(
      "voting_eth_getCode_projection",
      votingCodeProjection
    ),
    overrideVotingRawResultSha256: null,
    overrideVotingRawResultObjectKey: null,
  });
  return {
    state: sourceAnalysis.state,
    generatedAt: sourceAnalysis.generatedAt,
    registryVersion: sourceAnalysis.registryVersion,
    calls,
    proposalSimulation: {
      state: failed ? "failed" : "succeeded",
      method: "revm_engine_injected_executor_frame_conditional_origin",
      engine: "revm@34.0.0",
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
        operatorCheckOutcome: "passed",
        scriptEntered: true,
        executionResultStage: failed
          ? "executor_script_revert"
          : "script_completed",
        executorOperatorAuthorization: {
          state: "verified_at_propose_position",
          executorAddress: configuration.executorAddress,
          votingAddress: DAO_MOCK_VOTING_ADDRESS,
          blockNumber: proposeLog.blockNumber,
          blockHash: proposeLog.blockHash,
          blockHashVerification: "canonical_hash_at_height",
          getterSelector: "0x13e7c9d8",
          blockEndEvidence: {
            evidenceKind: "committed_synthetic_fixture",
            rpcMethod: null,
            fixturePath: "tests/fixtures/dao-feed-v1.ts",
            fixtureProjectionSha256:
              executorOperatorBlockEndProjectionSha256,
            rawResultSha256: null,
            rawResultObjectKey: null,
            storageLayout: {
              compiler: "vyper@0.4.2",
              sourceSha256: PINNED_EXECUTOR_SOURCE_SHA256,
              derivation:
                "keccak256(bytes32(mapping_base_slot) || bytes32(uint256(voting_address)))",
              mappingBaseSlot: "2",
              mappingKey: DAO_MOCK_VOTING_ADDRESS,
              mappingHashInputOrder: "slot_then_key",
              resolvedStorageSlot: executorOperatorStorageSlot,
            },
            storageWord: executorOperatorStorageWord,
            decodedAuthorized: true,
          },
          positionReplay: {
            method:
              "canonical_executor_set_operator_log_replay_to_propose_position",
            proposeTransactionIndex: proposeLog.transactionIndex,
            proposeLogIndex: proposeLog.logIndex,
            relevantSetterLogCount: 0,
            appliedThroughProposeLogCount: 0,
            laterSetterLogCount: 0,
            relevantSetterLogs: executorOperatorRelevantSetterLogs,
            canonicalManifestEncoding:
              "canonical_json_utf8_lexicographic_keys_no_whitespace_one_final_lf",
            canonicalManifestByteLength:
              executorOperatorReplayManifestBytes.length,
            canonicalManifestSha256:
              executorOperatorReplayManifestSha256,
            evidenceKind: "committed_synthetic_fixture",
            rpcMethod: null,
            fixturePath: "tests/fixtures/dao-feed-v1.ts",
            fixtureProjectionSha256:
              executorOperatorReplayProjectionSha256,
            rawLogsSha256: null,
            rawLogsObjectKey: null,
            semantics:
              "block_end_state_equals_propose_position_only_after_zero_later_relevant_setter_logs",
          },
          authorizedAtPropose: true,
        },
        executionInput: {
          functionSignature: "execute(bytes)",
          calldata: executeCalldata,
          calldataSha256: executeCalldataSha256,
          derivation: "abi_encode_execute_bytes_from_exact_retained_script",
        },
        executorImplementation,
        harness: {
          name: "gov-apps-stats-revm-frame-injector",
          revision: harnessRevision,
          artifactSha256: harnessArtifactSha256,
        },
        gasContext: {
          chainId: 1,
          chainSpec: {
            source: PINNED_MAINNET_CHAIN_SPEC_SOURCE,
            sourceSha256:
              "0xbd6759b0b0d4e4f8191f25870e40abad46ef5fb70aacdd31bdf220b5212de361",
            schedule: {
              derivation: "ethereum_mainnet_timestamp_schedule_v1",
              osakaActivationTimestamp: 1_764_798_551,
              bpo2ActivationTimestamp: 1_767_747_671,
              bpo2BlobBaseFeeUpdateFraction: "11684671",
              targetBlobsPerBlock: 14,
              maxBlobsPerBlock: 21,
            },
          },
          engineEvidence: {
            engine: "revm@34.0.0",
            explicitSpecSelection: "SpecId::OSAKA",
            defaultSpecRejected: "PRAGUE",
            producerCargoLockSha256:
              "0x6edd1b9a62f867205f9fb59aef137aa0fb0d08def83a0932fc84f67efe32de19",
            crate: "revm-34.0.0.crate",
            crateUri: "https://crates.io/api/v1/crates/revm/34.0.0/download",
            crateSha256:
              "0xc2aabdebaa535b3575231a88d72b642897ae8106cf6b0d12eafc6bfdf50abfc7",
            crateHashDerivation: "sha256_exact_download_bytes",
            implicitPragueBlobFractionRejected: "5007716",
            bpo2FractionOverride: "11684671",
            blobEnvironmentInitialization:
              "cfg_blob_base_fee_update_fraction_then_block_set_blob_excess_gas_and_price",
          },
          blockTimestamp: proposeLog.timestamp,
          runtimeSpecId: "OSAKA",
          runtimeSpecDerivation: "ethereum_mainnet_timestamp_schedule_v1",
          runtimeSpecActivationTimestamp: 1_764_798_551,
          blobScheduleId: "BPO2",
          blobScheduleActivationTimestamp: 1_767_747_671,
          blobBaseFeeUpdateFraction: "11684671",
          frameSemantics:
            "engine_injected_executor_child_frame_before_first_opcode_after_voting_gate",
          executorFrameDepth: 1,
          omittedVotingParentDepth: 0,
          targetCallDepth: 2,
          callScheme: "CALL",
          injectionPoint: "before_executor_first_opcode",
          parentEip150GasDeductionApplied: false,
          outerTransactionValidation: "bypassed",
          osakaTransactionGasLimitCap: "16777216",
          gasScenario: "non_transactional_gas_overapproximation",
          resultScope:
            "recorded_injected_frame_script_behavior_not_future_execution_feasibility",
          parentEip150Forwarding: "not_modeled",
          beneficiary: SYNTHETIC_BLOCK_BENEFICIARY,
          difficulty: "0",
          prevRandao: SYNTHETIC_BLOCK_PREV_RANDAO,
          excessBlobGas: blockExcessBlobGas,
          blobBaseFeeWei,
          blobBaseFeeDerivation:
            "revm_context_interface_14_fake_exponential",
          coinbaseWarm: true,
          warmSet: {
            stage: "immediately_before_executor_first_opcode",
            warmAddresses,
            precompileAddresses: [...OSAKA_PRECOMPILE_ADDRESSES],
            warmStorageKeys: [],
          },
          derivationPolicy:
            "min_propose_block_gas_limit_and_30000000",
          gasPricePolicy: "propose_receipt_effective_gas_price",
          executorFrameGasCap: "30000000",
          executorFrameInitialGas,
          effectiveGasPriceWei,
          blockHeader: {
            evidenceKind: "committed_synthetic_fixture",
            rpcMethod: null,
            fixturePath: "tests/fixtures/dao-feed-v1.ts",
            fixtureProjectionSha256: deriveDaoSyntheticEvidenceSha256(
              "block_header_projection",
              blockHeaderProjection
            ),
            rawResultSha256: null,
            rawResultObjectKey: null,
            ...blockHeaderProjection,
          },
          proposeReceipt: {
            evidenceKind: "committed_synthetic_fixture",
            rpcMethod: null,
            fixturePath: "tests/fixtures/dao-feed-v1.ts",
            fixtureProjectionSha256: deriveDaoSyntheticEvidenceSha256(
              "propose_receipt_projection",
              receiptProjection
            ),
            rawResultSha256: null,
            rawResultObjectKey: null,
            ...receiptProjection,
          },
          transactionEnvelope: "synthetic_legacy_no_blobs",
          accessList: [],
          initialWarmSetPolicy:
            "osaka_frame_entry_origin_voting_executor_coinbase_precompiles_0x01_through_0x11_and_0x0100_no_storage",
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
              evidenceKind: "committed_synthetic_fixture",
              rpcMethod: null,
              fixturePath: "tests/fixtures/dao-feed-v1.ts",
              fixtureProjectionSha256: deriveDaoSyntheticEvidenceSha256(
                "voting_eth_getCode_projection",
                votingCodeProjection
              ),
              rawResultSha256: null,
              rawResultObjectKey: null,
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
    const authenticatedRoleActor =
      event.type === "flag"
        ? configuration.operatorAddress
        : configuration.guardianAddress;
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
              address: authenticatedRoleActor,
              role: event.type === "flag" ? "operator" : "guardian",
              evidence: {
                state: "verified",
                method: "historical_role_and_transaction_sender",
                observedAt: configuration.effectiveAt,
                configurationId: configuration.configurationId,
                transactionSender: authenticatedRoleActor,
                configuredRoleAddress: authenticatedRoleActor,
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
  const voterCallTraceAddress: number[] = [];
  const voterSelector =
    voterDirection === "yea" ? "0x69586e2e" : "0xff855dde";
  const fixtureProjectionSha256 = deriveDaoVoterTraceProjectionSha256({
    transactionHash: log.transactionHash,
    voterCallTraceAddress,
    voterSelector,
    voterCaller: voterCaller as Address,
    votingTarget: ref.votingAddress as Address,
    proposalId: ref.proposalId,
    ybcMembership,
    aggregatePathExecuted,
    aggregatorResult,
  });
  const votingChildIndex = ordinal === 0 ? 1 : ordinal === 1 ? 4 : 5;
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
      traceEvidence: {
        sourceKind: "committed_synthetic_fixture",
        rpcMethod: "debug_traceTransaction",
        tracer: "callTracer",
        fixtureMethod: "committed_synthetic_geth_call_tracer_fixture_v1",
        fixturePath: "tests/fixtures/dao-feed-v1.ts",
        fixtureProjectionSha256,
        clientVersion: null,
        rawTraceSha256: null,
        tracerConfig: { onlyTopCall: false, withLog: true },
        reexec: 0,
        normalization:
          "root_empty_array_then_zero_based_full_call_tree_child_indices",
      },
      pathSemantics: "full_call_tree_child_indices",
      invocationId: `${ref.chainId}:${ref.votingAddress.toLowerCase()}:${log.transactionHash}:root`,
      transactionHash: log.transactionHash,
      voterCallTraceAddress,
      votingCallTraceAddress: [...voterCallTraceAddress, votingChildIndex],
      voterCallDepth: voterCallTraceAddress.length,
      votingCallDepth: voterCallTraceAddress.length + 1,
      voterSelector,
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

function repairPinnedAggregateBasisPoints(
  events: WireEventDraft[],
  ref: WireEventDraft["proposalRef"]
): void {
  const groups = new Map<string, WireEventDraft[]>();
  for (const event of events) {
    if (event.type !== "vote") continue;
    const classification = event.data.classification as
      | { method?: string; trace?: { invocationId?: string } }
      | undefined;
    const invocationId = classification?.trace?.invocationId;
    if (
      classification?.method !== "pinned_voter_call_trace" ||
      typeof invocationId !== "string"
    ) {
      continue;
    }
    const group = groups.get(invocationId) ?? [];
    group.push(event);
    groups.set(invocationId, group);
  }
  let cumulativeWeight = 0n;
  let cumulativeScaledYea = 0n;
  for (const group of [...groups.values()].sort(
    (left, right) => left[0]!.log.logIndex - right[0]!.log.logIndex
  )) {
    const classification = group[0]!.data.classification as {
      trace: {
        voterSelector: string;
        aggregatorResult: { state: string; weight: string | null };
      };
    };
    const result = classification.trace.aggregatorResult;
    if (result.state !== "returned_positive" || result.weight === null) {
      continue;
    }
    const weight = BigInt(result.weight);
    cumulativeWeight += weight;
    if (classification.trace.voterSelector === "0x69586e2e") {
      cumulativeScaledYea += weight * 10_000n;
    }
    const yeaBps = Number(cumulativeScaledYea / cumulativeWeight);
    for (const event of group) {
      const eventClassification = event.data.classification as {
        trace: { votingCallOrdinal: number };
      };
      if (eventClassification.trace.votingCallOrdinal === 0) continue;
      event.data.yeaBps = yeaBps;
      const actor = event.actor as { address: Address };
      const raw = encodeDaoFeedLifecycleEventAbi({
        type: "vote",
        votingAddress: ref.votingAddress as Address,
        proposalId: BigInt(ref.proposalId),
        account: actor.address,
        weight: BigInt(event.data.weight as string),
        yeaBps: BigInt(yeaBps),
      });
      event.data.abi = availableAbi(raw);
    }
  }
}

function calculateWireVoteTotals(events: WireEventDraft[]): {
  total: bigint;
  yea: bigint;
} {
  const lastByActor = new Map<string, WireEventDraft>();
  for (const event of events) {
    if (event.type !== "vote") continue;
    const actor = event.actor as { address?: string };
    if (actor.address) lastByActor.set(actor.address.toLowerCase(), event);
  }
  let total = 0n;
  let yea = 0n;
  for (const event of lastByActor.values()) {
    const weight = BigInt(event.data.weight as string);
    total += weight;
    yea += (weight * BigInt(event.data.yeaBps as number)) / 10_000n;
  }
  return { total, yea };
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
  ref: WireEventDraft["proposalRef"],
  variant: Variant
): void {
  if (!events.at(-1)) {
    throw new Error("The signal fixture needs lifecycle history.");
  }
  const sourceBlockNumber = fixtureSignalExecuteSourceBlock(source);
  const sourceTimestamp =
    DAO_GENESIS_TIMESTAMP +
    (Number(source.votingEpoch) + 1) * DAO_FEED_EPOCH_LENGTH_SECONDS +
    CHANGED_CONFIGURATION_VALUES.executionDelaySeconds;
  const log = shiftLog(
    {
      blockNumber: sourceBlockNumber,
      blockHash: fixedHex32(sourceBlockNumber),
      timestamp: sourceTimestamp,
      transactionHash: fixedHex32(sourceBlockNumber * 100n + 93n),
      transactionIndex: 1,
      logIndex: 0,
    },
    variant.blockOffset
  );
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
        (configuration.effectiveAt.kind === "start_of_block" ||
          configuration.effectiveAt.transactionIndex < position.transactionIndex ||
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
    voterDecayLengthSeconds: configuration.voterDecayLengthSeconds,
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
  const allocation = FIXTURE_BLOCK_ALLOCATIONS.get(
    fixtureBlockKey(blockOffset, log.blockNumber)
  );
  if (!allocation) {
    throw new Error(
      `Missing fixture block allocation for ${fixtureBlockKey(blockOffset, log.blockNumber)}.`
    );
  }
  const blockNumber = allocation.blockNumber;
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
    timestamp: allocation.timestamp,
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
