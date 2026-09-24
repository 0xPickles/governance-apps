import type { Address, Hex } from "viem";

export type DaoUnixSeconds = number;
export type DaoProposalType = "signal" | "executable";
export type DaoVoteDirection = "yea" | "nay";
export type DaoActionType = "vote" | "retract" | "flag" | "veto" | "execute";

export type DaoProposalRef = {
  chainId: number;
  votingAddress: Address;
  proposalId: bigint;
};

export type DaoProtocolStatus =
  | "proposed"
  | "retracted"
  | "voting"
  | "passed"
  | "failed"
  | "executed"
  | "expired"
  | "invalid"
  | "flagged"
  | "vetoed";

export type DaoDisplayStatus =
  | "discussion"
  | "voting"
  | "approved"
  | "rejected"
  | "executed"
  | "expired"
  | "retracted"
  | "flagged"
  | "vetoed"
  | "not_found";

export type DaoDisplayGroup = "active" | "upcoming" | "closed";
export type DaoVotePurpose = "decision" | "participation_only";
export type DaoExecutionGuard = "guarded" | "permissionless";

export type DaoCapabilities = {
  canVote: boolean;
  votePurpose: DaoVotePurpose | null;
  voteBlockedReason: string | null;
  canRetract: boolean;
  retractBlockedReason: string | null;
  canFlag: boolean;
  flagBlockedReason: string | null;
  canVeto: boolean;
  vetoBlockedReason: string | null;
  canExecute: boolean;
  executeBlockedReason: string | null;
};

export type DaoProposalAsset = {
  path: string;
  mediaType: string;
  byteLength: number;
  digest: Hex;
  width: number | null;
  height: number | null;
};

export type DaoProposalContent = {
  schema: "yearn.dao.proposal.v1";
  markdown: string;
  discussionUrl: string;
  proposalType: DaoProposalType;
  createdBy: Address;
  createdAt: string;
  assets: DaoProposalAsset[];
};

export type DaoVerifiedSource = {
  kind: "github" | "sourcify" | "explorer";
  label: string;
  url: string;
  revision: string | null;
};

export type DaoScriptFrame = {
  index: number;
  offset: number;
  target: Address;
  calldata: Hex;
  calldataBytes: number;
  selector: Hex | null;
};

export type DaoScriptErrorCode =
  | "INVALID_HEX"
  | "ODD_HEX_LENGTH"
  | "SCRIPT_TOO_LARGE"
  | "TRUNCATED_HEADER"
  | "CALLDATA_OUT_OF_BOUNDS"
  | "TOO_MANY_CALLS"
  | "TRAILING_BYTES"
  | "EMPTY_EXECUTABLE_SCRIPT"
  | "NON_EMPTY_SIGNAL_SCRIPT";

export type DaoScriptError = {
  code: DaoScriptErrorCode;
  message: string;
  offset: number | null;
};

/**
 * Raw author input remains a string until syntax validation succeeds. Byte count
 * and hash are therefore unavailable for malformed or odd-length input.
 */
export type DaoScriptCheck = {
  state: "empty" | "valid" | "invalid";
  script: string;
  scriptBytes: number | null;
  scriptHash: Hex | null;
  frames: DaoScriptFrame[];
  error: DaoScriptError | null;
};

export type DaoDecodedCall = DaoScriptFrame & {
  decodeStatus: "verified" | "unknown" | "failed";
  contractName: string | null;
  functionSignature: string | null;
  arguments: Array<{ name: string; type: string; value: string }>;
  verifiedSource: DaoVerifiedSource | null;
  sourcePath: string | null;
};

export type DaoAnalysis = {
  calls: DaoDecodedCall[];
  error: string | null;
};

export type DaoStateObservation = { number: bigint; hash: Hex; timestamp: DaoUnixSeconds };

export type DaoExecutionPreflight = {
  call: import("./execute-call").DaoExecuteCall | null;
  scriptHash: Hex;
  error: string | null;
} & ({
  state: "succeeded";
  observation: DaoStateObservation;
  contextKey: string;
  simulatedAt: string;
} | {
  state: "idle" | "simulating" | "failed";
  observation: DaoStateObservation | null;
  contextKey: string | null;
  simulatedAt: string | null;
});

export type DaoLogRef = {
  blockNumber: bigint;
  blockHash: Hex;
  timestamp: DaoUnixSeconds | null;
  transactionHash: Hex | null;
  transactionIndex: number;
  logIndex: number;
};

export type DaoReceiptLog = {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
  logIndex: number;
};

/**
 * Chain identity is deliberately absent. A caller must supply trusted chain
 * context separately when decoding a receipt.
 */
export type DaoTransactionReceipt = {
  status: "success" | "reverted";
  transactionHash: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  blockTimestamp: DaoUnixSeconds | null;
  transactionIndex: number;
  logs: DaoReceiptLog[];
};

export type DaoProposeReceiptExpectation = {
  chainId: number;
  votingAddress: Address;
  transactionHash: Hex;
  proposer: Address;
  votingEpoch: bigint;
  contentDigest: Hex;
  script: Hex;
};

export type DaoDecodedProposeIdentity = {
  ref: DaoProposalRef;
  proposer: Address;
  votingEpoch: bigint;
  contentDigest: Hex;
  script: Hex;
  blockTimestamp: DaoUnixSeconds | null;
  log: DaoLogRef;
};

export type DaoProposeReceiptErrorCode =
  | "INVALID_CHAIN_CONTEXT"
  | "TRANSACTION_HASH_MISMATCH"
  | "RECEIPT_REVERTED"
  | "PROPOSE_LOG_MISSING"
  | "PROPOSE_LOG_WRONG_CONTRACT"
  | "PROPOSE_LOG_DUPLICATE"
  | "PROPOSE_LOG_MALFORMED"
  | "PROPOSER_MISMATCH"
  | "VOTING_EPOCH_MISMATCH"
  | "CONTENT_DIGEST_MISMATCH"
  | "SCRIPT_MISMATCH";

export type DaoProposeReceiptDecodeResult =
  | { state: "decoded"; identity: DaoDecodedProposeIdentity }
  | {
      state: "invalid";
      error: {
        code: DaoProposeReceiptErrorCode;
        message: string;
      };
    };

export type DaoProposalEvent = {
  type: "propose" | "vote" | "retract" | "flag" | "veto" | "execute";
  log: DaoLogRef;
  actor: Address | null;
  yeaBps: number | null;
  direction: DaoVoteDirection | null;
  weight: bigint | null;
  reason: string | null;
};

export type DaoVoteResult = "approved" | "rejected";
export type DaoLifecycleFacts = {
  status: DaoProtocolStatus;
  voteResult: DaoVoteResult | null;
  moderation: {
    kind: "flagged" | "vetoed" | null;
    reason: string | null;
    votingAvailable: boolean;
    executionBlocked: boolean;
  };
  execution: {
    state:
      | "no_actions"
      | "scheduled"
      | "executable"
      | "executed"
      | "blocked"
      | "expired";
    guard: DaoExecutionGuard | null;
  };
};

export type DaoProposalExecutionReadiness =
  | { state: "not_applicable"; blocker: null; reason: null }
  | { state: "integrity_ready"; blocker: null; reason: null }
  | {
      state: "integrity_blocked";
      blocker:
        | "exact_script_unavailable"
        | "stored_script_hash_mismatch"
        | "malformed_script";
      reason: string;
    };

export type DaoProposalRules = {
  approvalThresholdBps: number;
  snapshotThresholdBps: number;
  thresholdSnapshottedAtCreation: true;
  minimumTurnout: null;
  passageRequiresPositiveTotal: true;
  proposalType: DaoProposalType;
  votingPeriodSeconds: number;
  executionDelaySeconds: number | null;
  executionGuard: DaoExecutionGuard | null;
  votingAddress: Address;
  votingSource: DaoVerifiedSource;
  votingSourcePath: string;
  observationBlockNumber: bigint;
};

export type DaoProposal = {
  retracted: boolean;
  executed: boolean;
  flagged: boolean;
  vetoed: boolean;
  ref: DaoProposalRef;
  proposer: Address;
  votingEpoch: bigint;
  createdAt: DaoUnixSeconds;
  voteStartsAt: DaoUnixSeconds;
  voteEndsAt: DaoUnixSeconds;
  executionStartsAt: DaoUnixSeconds | null;
  executionEndsAt: DaoUnixSeconds | null;
  thresholdBps: number;
  totalWeight: bigint;
  yeaWeight: bigint;
  nayWeight: bigint;
  protocolStatus: DaoProtocolStatus;
  displayStatus: DaoDisplayStatus;
  displayGroup: DaoDisplayGroup;
  type: DaoProposalType;
  rules: DaoProposalRules;
  content: {
    state: "available" | "unavailable" | "invalid";
    cid: string | null;
    digest: Hex;
    value: DaoProposalContent | null;
    error: string | null;
    computedDigest?: Hex | null;
  };
  discussion: {
    state: "verified" | "unverified" | "unavailable";
    url: string | null;
    title: string | null;
    categoryId: number | null;
    category: string | null;
    categorySlugPath: string[];
  };
  script: {
    bytes: Hex | null;
    hash: Hex;
    hashVerified: boolean | null;
    framing?: "supported" | "unsupported";
  };
  analysis: DaoAnalysis;
  events: DaoProposalEvent[];
  moderation: {
    flagReason: string | null;
    vetoReason: string | null;
  };
};

export type DaoAccountProposalFacts = {
  /** Current account/preparation read block, independent of feed observation. */
  observation?: DaoStateObservation;
  address: Address;
  connected: boolean;
  correctChain: boolean;
  votingWeight: bigint;
  effectiveVotingWeight: bigint;
  decayBps: number;
  hasVoted: boolean;
  voteDirection: DaoVoteDirection | null;
  isProposer: boolean;
  isOperator: boolean;
  isGuardian: boolean;
  executionPreflight: DaoExecutionPreflight;
};

export type DaoAccountProposalState = DaoAccountProposalFacts & {
  capabilities: DaoCapabilities;
  liveProposal?: DaoProposal;
  writesEnabled?: boolean;
};

export type DaoAffectedBoostEpoch = {
  epoch: bigint;
  currentProposalCount: number;
  proposalLimit: 64;
};

export type DaoProposerEligibilityInput = {
  address: Address;
  connected: boolean;
  correctChain: boolean;
  now: DaoUnixSeconds;
  currentWeight: bigint;
  minimumWeight: bigint;
  blacklisted: boolean;
  lastProposedAt: DaoUnixSeconds | null;
  cooldownSeconds: number;
  expectedVotingEpoch: bigint;
  affectedBoostEpochs: DaoAffectedBoostEpoch[];
};

export type DaoProposerState = {
  observation?: DaoStateObservation;
  address: Address;
  connected: boolean;
  correctChain: boolean;
  canPropose: boolean;
  proposeBlockedReason: string | null;
  currentWeight: bigint;
  minimumWeight: bigint;
  blacklisted: boolean;
  lastProposedAt: DaoUnixSeconds | null;
  nextEligibleAt: DaoUnixSeconds;
  expectedVotingEpoch: bigint;
  affectedBoostEpochs: DaoAffectedBoostEpoch[];
};

export type DaoFeedContract = {
  votingAddress: Address;
  voterAddress: Address;
  executorAddress: Address;
  deploymentBlock: bigint;
  active: boolean;
};

export type DaoSnapshot = {
  schemaVersion: 2;
  chainId: number;
  generatedAt: string;
  canonicalBlock: {
    number: bigint;
    hash: Hex;
    timestamp: DaoUnixSeconds;
  };
  contracts: DaoFeedContract[];
  proposals: DaoProposal[];
};

export type DaoProposalLookup =
  | { state: "found"; proposal: DaoProposal }
  | {
      state: "not_found";
      ref: DaoProposalRef;
      protocolStatus: "invalid";
      displayStatus: "not_found";
    };

/** Base-10 unsigned integer used only at a JSON boundary. */
export type DaoBigIntJson = `${bigint}`;

export type DaoAnalysisJson = DaoAnalysis;

export type DaoProposalEventJson = Omit<DaoProposalEvent, "log" | "weight"> & {
  log: Omit<DaoLogRef, "blockNumber"> & { blockNumber: DaoBigIntJson };
  weight: DaoBigIntJson | null;
};

export type DaoProposalRulesJson = Omit<
  DaoProposalRules,
  "observationBlockNumber"
> & {
  observationBlockNumber: DaoBigIntJson;
};

export type DaoProposalJson = Omit<
  DaoProposal,
  | "ref"
  | "votingEpoch"
  | "totalWeight"
  | "yeaWeight"
  | "nayWeight"
  | "analysis"
  | "events"
  | "rules"
> & {
  ref: Omit<DaoProposalRef, "proposalId"> & {
    proposalId: DaoBigIntJson;
  };
  votingEpoch: DaoBigIntJson;
  totalWeight: DaoBigIntJson;
  yeaWeight: DaoBigIntJson;
  nayWeight: DaoBigIntJson;
  analysis: DaoAnalysisJson;
  events: DaoProposalEventJson[];
  rules: DaoProposalRulesJson;
};

export type DaoCreatedProposalStage = "awaiting_index" | "indexed";

export type DaoCreatedProposalRecord = {
  stage: DaoCreatedProposalStage;
  proposal: DaoProposal;
};

export type DaoSnapshotJson = Omit<
  DaoSnapshot,
  "canonicalBlock" | "contracts" | "proposals"
> & {
  canonicalBlock: Omit<DaoSnapshot["canonicalBlock"], "number"> & {
    number: DaoBigIntJson;
  };
  contracts: Array<
    Omit<DaoFeedContract, "deploymentBlock"> & {
      deploymentBlock: DaoBigIntJson;
    }
  >;
  proposals: DaoProposalJson[];
};

export type DaoProposalLifecycleInput = {
  exists: boolean;
  now: DaoUnixSeconds;
  voteStartsAt: DaoUnixSeconds;
  voteEndsAt: DaoUnixSeconds;
  postVoteEpochEndsAt: DaoUnixSeconds;
  type: DaoProposalType;
  thresholdBps: number;
  totalWeight: bigint;
  yeaWeight: bigint;
  retracted: boolean;
  executed: boolean;
  flagged: boolean;
  vetoed: boolean;
};

export type DaoProposalTimingInput = {
  genesis: DaoUnixSeconds;
  createdAt: DaoUnixSeconds;
  epochLengthSeconds: number;
  voteStartOffsetSeconds: number;
  executionDelaySeconds: number;
};

export type DaoProposalTiming = {
  votingEpoch: bigint;
  voteStartsAt: DaoUnixSeconds;
  voteEndsAt: DaoUnixSeconds;
  executionStartsAt: DaoUnixSeconds;
  executionEndsAt: DaoUnixSeconds;
};

export type DaoVotingWeightInput = {
  votingWeight: bigint;
  now: DaoUnixSeconds;
  voteEndsAt: DaoUnixSeconds;
  decayLengthSeconds: number;
};

export type DaoVotingWeight = {
  votingWeight: bigint;
  effectiveVotingWeight: bigint;
  decayBps: number;
};

export type DaoCapabilityInput = {
  proposal: DaoProposal;
  account: DaoAccountProposalFacts;
  now: DaoUnixSeconds;
  vetoEndsAt: DaoUnixSeconds;
  executionGuard: DaoExecutionGuard;
};

export type DaoMockFixtureId =
  | "discussion"
  | "voting"
  | "late-voting"
  | "approved-signal"
  | "approved-executable"
  | "executed"
  | "rejected"
  | "no-votes"
  | "expired"
  | "retracted"
  | "flagged"
  | "early-veto"
  | "post-vote-veto"
  | "content-unavailable"
  | "content-invalid"
  | "script-missing"
  | "partial-decode"
  | "script-malformed"
  | "hash-mismatch"
  | "direct-proposal"
  | "guarded-execution"
  | "permissionless-execution"
  | "proposal-capacity-full";

export type DaoMockFixture = {
  id: DaoMockFixtureId;
  label: string;
  now: DaoUnixSeconds;
  vetoEndsAt: DaoUnixSeconds;
  proposalRef: DaoProposalRef;
  account: DaoAccountProposalFacts;
  proposer: DaoProposerEligibilityInput;
  executionGuard: DaoExecutionGuard;
};

export type DaoMockSurfaceState = "ready" | "loading" | "empty" | "error";
export type DaoMockPersona =
  | "observer"
  | "voter"
  | "proposer"
  | "operator"
  | "guardian";
export type DaoMockContentState =
  | "available"
  | "unavailable"
  | "invalid"
  | "unverified-forum";
export type DaoMockLifecycleState =
  | "discussion"
  | "voting"
  | "approved"
  | "rejected"
  | "expired"
  | "retracted"
  | "flagged";
export type DaoMockVetoState = "before-votes" | "after-votes";
export type DaoMockScriptState =
  | "missing"
  | "decoded"
  | "partial"
  | "malformed"
  | "hash-mismatch";
export type DaoMockAccountState =
  | "weight"
  | "no-weight"
  | "already-voted"
  | "late-decayed"
  | "disconnected"
  | "wrong-network";
export type DaoMockExecutionState =
  | "signal"
  | "executable"
  | "guarded"
  | "permissionless"
  | "simulation-failure";
export type DaoMockAuthoringState =
  | "valid-signal"
  | "valid-script"
  | "invalid-frame"
  | "too-many-calls"
  | "too-large";
export type DaoMockProposerState =
  | "eligible"
  | "blacklisted"
  | "insufficient-weight"
  | "cooldown"
  | "capacity-full";
export type DaoMockRole = "proposer" | "operator" | "guardian";
export type DaoMockTransactionOutcome =
  | "success"
  | "user-rejected"
  | "revert"
  | "network-error";

export type DaoPendingAction = {
  receiptState?: "unknown" | "confirmed" | "reverted" | "replaced";
  confirmationError?: string;
  action: DaoActionType;
  ref: DaoProposalRef;
  actor: Address;
  transactionHash: Hex;
  submittedAt: DaoUnixSeconds;
  direction: DaoVoteDirection | null;
  effectiveVotingWeight: bigint | null;
  reason: string | null;
};

export type DaoMockProposalFlagsPatch = Partial<{
  retracted: boolean;
  executed: boolean;
  flagged: boolean;
  vetoed: boolean;
}>;

export type DaoMockProposalTimingPatch = Partial<{
  createdAt: DaoUnixSeconds;
  voteStartsAt: DaoUnixSeconds;
  voteEndsAt: DaoUnixSeconds;
  executionStartsAt: DaoUnixSeconds | null;
  executionEndsAt: DaoUnixSeconds | null;
  postVoteEpochEndsAt: DaoUnixSeconds;
  vetoEndsAt: DaoUnixSeconds;
}>;

export type DaoMockAuthoring = {
  state: DaoMockAuthoringState;
  proposalType: DaoProposalType;
  scriptCheck: DaoScriptCheck;
};

export type DaoMockRuntimeSnapshot = {
  surface: DaoMockSurfaceState;
  selectedFixtureId: DaoMockFixtureId | null;
  selectedProposalId: bigint;
  persona: DaoMockPersona;
  now: DaoUnixSeconds;
  feed: DaoSnapshot;
  account: DaoAccountProposalFacts;
  proposer: DaoProposerEligibilityInput;
  executionGuard: DaoExecutionGuard;
  authoring: DaoMockAuthoring;
  transactionOutcome: DaoMockTransactionOutcome;
  pendingAction: DaoPendingAction | null;
};
