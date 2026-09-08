import { createDaoExecuteCall } from "./execute-call";
import { analyzeDaoScript } from "./script-analysis";
import { keccak256, sha256, toBytes, type Address, type Hex } from "viem";
import { parseDaoFeedJson, serializeDaoFeedJson } from "./client";
import {
  createDaoRawSha256Cid,
  deriveDaoProposalContentIdentity,
  parseDaoProposalContent,
  validateDaoVerifiedSource,
} from "./content";
import { DAO_PINNED_VOTING_SOURCE } from "./provenance";
import {
  assertDaoProposalInvariants,
  DAO_EMPTY_SCRIPT_HASH,
  deriveDaoDisplayGroup,
  deriveDaoDisplayStatus,
  deriveDaoProposalTiming,
  deriveDaoProtocolStatus,
  deriveDaoVotingWeight,
} from "./domain";
import { DAO_EXECUTOR_VALID_SCRIPT_VECTORS } from "./script-vectors";
import type {
  DaoAccountProposalFacts,
  DaoAffectedBoostEpoch,
  DaoSnapshot,
  DaoMockFixture,
  DaoMockFixtureId,
  DaoProposal,
  DaoProposalAsset,
  DaoProposalContent,
  DaoProposalEvent,
  DaoProposalRef,
  DaoProposalType,
  DaoProposerEligibilityInput,
} from "./types";

export const DAO_MOCK_NOW = 1_787_054_400;
export const DAO_MOCK_EPOCH_LENGTH_SECONDS = 14 * 86_400;
export const DAO_MOCK_VOTE_START_OFFSET_SECONDS =
  DAO_MOCK_EPOCH_LENGTH_SECONDS / 2;
export const DAO_MOCK_EXECUTION_DELAY_SECONDS = 86_400;
export const DAO_MOCK_CURRENT_EPOCH = 200;
const DAO_MOCK_CURRENT_EPOCH_OFFSET = 13 * 86_400 + 18 * 60 * 60;
export const DAO_MOCK_GENESIS =
  DAO_MOCK_NOW -
  DAO_MOCK_CURRENT_EPOCH * DAO_MOCK_EPOCH_LENGTH_SECONDS -
  DAO_MOCK_CURRENT_EPOCH_OFFSET;
export const DAO_MOCK_CHAIN_ID = 1;
export const DAO_MOCK_VOTING_ADDRESS =
  "0x1111111111111111111111111111111111111111" as Address;
export const DAO_MOCK_VOTER_ADDRESS =
  "0x2222222222222222222222222222222222222222" as Address;
export const DAO_MOCK_EXECUTOR_ADDRESS =
  "0x3333333333333333333333333333333333333333" as Address;
export const DAO_MOCK_ACCOUNT_ADDRESS =
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Address;
export const DAO_MOCK_PROPOSER_ADDRESS =
  "0x4444444444444444444444444444444444444444" as Address;
export const DAO_MOCK_OPERATOR_ADDRESS =
  "0x5555555555555555555555555555555555555555" as Address;
export const DAO_MOCK_GUARDIAN_ADDRESS =
  "0x6666666666666666666666666666666666666666" as Address;
export const DAO_MOCK_YBC_AGGREGATE_ADDRESS =
  "0x7777777777777777777777777777777777777777" as Address;
export const DAO_MOCK_STYFIX_AGGREGATE_ADDRESS =
  "0x8888888888888888888888888888888888888888" as Address;
export const DAO_MOCK_GOVERNANCE_FLOW_ASSET_DIGEST =
  "0x63786be28dedc9bab6de44a52c8124dc237dfc650e203779da5a03aed873a209" as Hex;
export const DAO_MOCK_GOVERNANCE_FLOW_ASSET_CID = createDaoRawSha256Cid(
  DAO_MOCK_GOVERNANCE_FLOW_ASSET_DIGEST
);

const DAO_MOCK_GOVERNANCE_FLOW_ASSET: DaoProposalAsset = {
  path: "./assets/governance-flow.svg",
  mediaType: "image/svg+xml",
  byteLength: 660,
  digest: DAO_MOCK_GOVERNANCE_FLOW_ASSET_DIGEST,
  width: 1_280,
  height: 720,
};

export function deriveDaoMockBlockHash(
  blockNumber: bigint,
  timestamp: number
): Hex {
  return keccak256(
    toBytes(`dao-mock-block:${blockNumber.toString()}:${timestamp}`)
  );
}

const DAO_PINNED_VOTING_SOURCE_PATH = "contracts/governance/Voting.vy";


const DAY = 86_400;
const UNIT = 10n ** 18n;
const VALID_SCRIPT = DAO_EXECUTOR_VALID_SCRIPT_VECTORS.twoCalls.script as Hex;
const VALID_SCRIPT_HASH = keccak256(VALID_SCRIPT);
const MISMATCHED_SCRIPT_HASH = `0x${"ff".repeat(32)}` as Hex;
const DAO_MOCK_LONG_MARKDOWN_TOKEN =
  "governance-verification-evidence-" + "a".repeat(192);

type ProposalTimingFixture = {
  createdAt: number;
  votingEpoch: bigint;
  voteStartsAt: number;
  voteEndsAt: number;
  executionStartsAt: number;
  executionEndsAt: number;
};

const TIMING = {
  discussion: createProposalTiming(
    DAO_MOCK_CURRENT_EPOCH,
    DAO_MOCK_CURRENT_EPOCH_OFFSET
  ),
  voting: createProposalTiming(DAO_MOCK_CURRENT_EPOCH - 1, 10 * DAY),
  lateVoting: createProposalTiming(DAO_MOCK_CURRENT_EPOCH - 1, 9 * DAY),
  decision: createProposalTiming(
    DAO_MOCK_CURRENT_EPOCH - 2,
    10 * DAY,
    13 * DAY + 21 * 60 * 60
  ),
  execution: createProposalTiming(DAO_MOCK_CURRENT_EPOCH - 2, 8 * DAY),
  expired: createProposalTiming(DAO_MOCK_CURRENT_EPOCH - 3, 8 * DAY),
} satisfies Record<string, ProposalTimingFixture>;

function createProposalTiming(
  createdEpoch: number,
  createdEpochOffset: number,
  executionDelaySeconds = DAO_MOCK_EXECUTION_DELAY_SECONDS
): ProposalTimingFixture {
  const createdAt =
    DAO_MOCK_GENESIS +
    createdEpoch * DAO_MOCK_EPOCH_LENGTH_SECONDS +
    createdEpochOffset;
  return {
    createdAt,
    ...deriveDaoProposalTiming({
      genesis: DAO_MOCK_GENESIS,
      createdAt,
      epochLengthSeconds: DAO_MOCK_EPOCH_LENGTH_SECONDS,
      voteStartOffsetSeconds: DAO_MOCK_VOTE_START_OFFSET_SECONDS,
      executionDelaySeconds,
    }),
  };
}

type ProposalFixtureOptions = {
  id: bigint;
  title: string;
  type?: DaoProposalType;
  timing: ProposalTimingFixture;
  thresholdBps?: number;
  totalWeight?: bigint;
  yeaWeight?: bigint;
  retracted?: boolean;
  executed?: boolean;
  flagged?: boolean;
  vetoed?: boolean;
  contentState?: DaoProposal["content"]["state"];
  discussionState?: DaoProposal["discussion"]["state"];
  scriptState?: "default" | "missing" | "partial" | "malformed";
  hashMismatch?: boolean;
  aggregateVoteBlend?: boolean;
  executionGuard?: "guarded" | "permissionless";
  unavailableProposeProvenance?: boolean;
};

const proposals = [
  createProposal({
    id: 1n,
    title: "Adopt the contributor budget policy",
    type: "signal",
    timing: TIMING.discussion,
    totalWeight: 0n,
    yeaWeight: 0n,
  }),
  createProposal({
    id: 2n,
    title: "Fund protocol research",
    timing: TIMING.voting,
    totalWeight: 11n * UNIT,
    yeaWeight: (15n * UNIT) / 2n,
    aggregateVoteBlend: true,
  }),
  createProposal({ id: 3n, title: "Renew security operations", timing: TIMING.lateVoting }),
  createProposal({
    id: 4n,
    title: "Approve the contributor charter",
    type: "signal",
    timing: TIMING.expired,
  }),
  createProposal({ id: 5n, title: "Update treasury policy", timing: TIMING.decision }),
  createProposal({
    id: 6n,
    title: "Execute the treasury migration",
    timing: TIMING.execution,
    executed: true,
  }),
  createProposal({
    id: 7n,
    title: "Increase the operations budget",
    timing: TIMING.decision,
    thresholdBps: 6_000,
    totalWeight: 100n,
    yeaWeight: 49n,
  }),
  createProposal({
    id: 8n,
    title: "Record a proposal with no votes",
    type: "signal",
    timing: TIMING.decision,
    totalWeight: 0n,
    yeaWeight: 0n,
  }),
  createProposal({ id: 9n, title: "Expired executable proposal", timing: TIMING.expired }),
  createProposal({
    id: 10n,
    title: "Retracted contributor request",
    type: "signal",
    timing: TIMING.voting,
    totalWeight: 0n,
    yeaWeight: 0n,
    retracted: true,
  }),
  createProposal({
    id: 11n,
    title: "Malformed proposal",
    type: "signal",
    timing: TIMING.voting,
    totalWeight: 0n,
    yeaWeight: 0n,
    retracted: true,
    flagged: true,
  }),
  createProposal({
    id: 12n,
    title: "Vetoed before participation",
    type: "signal",
    timing: TIMING.voting,
    totalWeight: 0n,
    yeaWeight: 0n,
    retracted: true,
    vetoed: true,
  }),
  createProposal({
    id: 13n,
    title: "Vetoed after participation began",
    timing: TIMING.voting,
    vetoed: true,
  }),
  createProposal({
    id: 14n,
    title: "Proposal with unavailable content",
    timing: TIMING.voting,
    contentState: "unavailable",
  }),
  createProposal({
    id: 15n,
    title: "Proposal with invalid content",
    timing: TIMING.voting,
    contentState: "invalid",
  }),
  createProposal({
    id: 16n,
    title: "Proposal with missing script bytes",
    timing: TIMING.voting,
    scriptState: "missing",
  }),
  createProposal({
    id: 17n,
    title: "Proposal with a partially decoded script",
    timing: TIMING.execution,
    scriptState: "partial",
  }),
  createProposal({
    id: 18n,
    title: "Proposal with malformed script bytes",
    timing: TIMING.execution,
    scriptState: "malformed",
  }),
  createProposal({
    id: 19n,
    title: "Proposal with a script hash mismatch",
    timing: TIMING.execution,
    hashMismatch: true,
  }),
  createProposal({
    id: 20n,
    title: "Direct-contract proposal",
    type: "signal",
    timing: TIMING.discussion,
    discussionState: "unverified",
    totalWeight: 0n,
    yeaWeight: 0n,
    unavailableProposeProvenance: true,
  }),
  createProposal({ id: 21n, title: "Guarded executable proposal", timing: TIMING.execution }),
  createProposal({
    id: 22n,
    title: "Permissionless executable proposal",
    timing: TIMING.execution,
    executionGuard: "permissionless",
  }),
];

for (const proposal of proposals) assertDaoProposalInvariants(proposal);

export const DAO_MOCK_FEED: DaoSnapshot = {
  schemaVersion: 2,
  chainId: DAO_MOCK_CHAIN_ID,
  generatedAt: "2026-08-18T12:00:00Z",
  canonicalBlock: {
    number: 24_000_000n,
    hash: deriveDaoMockBlockHash(24_000_000n, DAO_MOCK_NOW),
    timestamp: DAO_MOCK_NOW,
  },
  contracts: [
    {
      votingAddress: DAO_MOCK_VOTING_ADDRESS,
      voterAddress: DAO_MOCK_VOTER_ADDRESS,
      executorAddress: DAO_MOCK_EXECUTOR_ADDRESS,
      deploymentBlock: 23_900_000n,
      active: true,
    },
  ],
  proposals,
};

export const DAO_MOCK_FEED_JSON = serializeDaoFeedJson(DAO_MOCK_FEED);
const INTERNAL_DAO_MOCK_FEED_JSON = structuredClone(DAO_MOCK_FEED_JSON);

const proposalById = new Map(
  proposals.map((proposal) => [proposal.ref.proposalId, proposal])
);

const fixtureProposalIds: Record<DaoMockFixtureId, bigint> = {
  discussion: 1n,
  voting: 2n,
  "late-voting": 3n,
  "approved-signal": 4n,
  "approved-executable": 5n,
  executed: 6n,
  rejected: 7n,
  "no-votes": 8n,
  expired: 9n,
  retracted: 10n,
  flagged: 11n,
  "early-veto": 12n,
  "post-vote-veto": 13n,
  "content-unavailable": 14n,
  "content-invalid": 15n,
  "script-missing": 16n,
  "partial-decode": 17n,
  "script-malformed": 18n,
  "hash-mismatch": 19n,
  "direct-proposal": 20n,
  "guarded-execution": 21n,
  "permissionless-execution": 22n,
  "proposal-capacity-full": 1n,
};

const fixtureLabels: Record<DaoMockFixtureId, string> = {
  discussion: "Discussion",
  voting: "Voting",
  "late-voting": "Late voting",
  "approved-signal": "Approved signal",
  "approved-executable": "Approved executable",
  executed: "Executed",
  rejected: "Rejected",
  "no-votes": "No votes",
  expired: "Expired",
  retracted: "Retracted",
  flagged: "Flagged",
  "early-veto": "Early veto",
  "post-vote-veto": "Post-vote veto",
  "content-unavailable": "Content unavailable",
  "content-invalid": "Content invalid",
  "script-missing": "Missing script",
  "partial-decode": "Partial decode",
  "script-malformed": "Malformed script",
  "hash-mismatch": "Hash mismatch",
  "direct-proposal": "Direct proposal",
  "guarded-execution": "Guarded execution",
  "permissionless-execution": "Permissionless execution",
  "proposal-capacity-full": "Proposal capacity full",
};

export const DAO_MOCK_FIXTURE_IDS = Object.keys(
  fixtureProposalIds
) as DaoMockFixtureId[];

export function createDaoMockFeed(): DaoSnapshot {
  return parseDaoFeedJson(structuredClone(INTERNAL_DAO_MOCK_FEED_JSON));
}

export function getDaoMockFixture(id: DaoMockFixtureId): DaoMockFixture {
  const proposal = getProposalById(fixtureProposalIds[id]);
  const isAuthorFixture = id === "discussion" || id === "retracted";
  const isGuardianFixture = id === "early-veto";
  const isOperatorFixture = id === "guarded-execution";
  const accountAddress = isAuthorFixture
    ? DAO_MOCK_PROPOSER_ADDRESS
    : isGuardianFixture
      ? DAO_MOCK_GUARDIAN_ADDRESS
      : isOperatorFixture
        ? DAO_MOCK_OPERATOR_ADDRESS
        : DAO_MOCK_ACCOUNT_ADDRESS;
  const votingWeight = deriveDaoVotingWeight({
    votingWeight: 100n * 10n ** 18n,
    now: DAO_MOCK_NOW,
    voteEndsAt: proposal.voteEndsAt,
    decayLengthSeconds: id === "late-voting" ? DAY : 0,
  });
  const preflightSucceeded =
    id === "guarded-execution" || id === "permissionless-execution";
  const account: DaoAccountProposalFacts = {
    address: accountAddress,
    connected: true,
    correctChain: true,
    ...votingWeight,
    hasVoted: false,
    voteDirection: null,
    isProposer: isAuthorFixture,
    isOperator: isOperatorFixture,
    isGuardian: isGuardianFixture,
    executionPreflight: {
      call: preflightSucceeded && proposal.script.bytes ? createDaoExecuteCall(proposal.ref, accountAddress, proposal.script.bytes) : null,
      state: preflightSucceeded ? "succeeded" : "idle",
      scriptHash: proposal.script.hash,
      blockNumber: preflightSucceeded ? 24_000_001n : null,
      simulatedAt: preflightSucceeded ? "2026-08-18T12:00:12Z" : null,
      error: null,
    },
  };

  return {
    id,
    label: fixtureLabels[id],
    now: DAO_MOCK_NOW,
    vetoEndsAt: getProposalPostVoteEnd(proposal),
    proposalRef: { ...proposal.ref },
    account,
    proposer: createProposerInput(id === "proposal-capacity-full"),
    executionGuard:
      id === "permissionless-execution" ? "permissionless" : "guarded",
  };
}

function createProposal(options: ProposalFixtureOptions): DaoProposal {
  const type = options.type ?? "executable";
  const thresholdBps = options.thresholdBps ?? 5_000;
  const totalWeight = options.totalWeight ?? 250n * 10n ** 18n;
  const yeaWeight = options.yeaWeight ?? 155n * 10n ** 18n;
  const scriptBytes = options.scriptState === "missing" ? null : options.scriptState === "malformed" ? "0x01" as Hex : type === "signal" ? ("0x" as Hex) : VALID_SCRIPT;
  const scriptHash =
    type === "signal"
      ? DAO_EMPTY_SCRIPT_HASH
      : options.hashMismatch
        ? MISMATCHED_SCRIPT_HASH
        : scriptBytes === null ? VALID_SCRIPT_HASH : keccak256(scriptBytes);
  const lifecycle = {
    exists: true,
    now: DAO_MOCK_NOW,
    voteStartsAt: options.timing.voteStartsAt,
    voteEndsAt: options.timing.voteEndsAt,
    postVoteEpochEndsAt: options.timing.executionEndsAt,
    type,
    thresholdBps,
    totalWeight,
    yeaWeight,
    retracted: options.retracted ?? false,
    executed: options.executed ?? false,
    flagged: options.flagged ?? false,
    vetoed: options.vetoed ?? false,
  } as const;
  const protocolStatus = deriveDaoProtocolStatus(lifecycle);
  const displayStatus = deriveDaoDisplayStatus(protocolStatus, type);
  const content = createContent(options);
  const analysis = analyzeDaoScript(scriptBytes, true);
  const flagReason = options.flagged ? "Malformed proposal content" : null;
  const vetoReason = options.vetoed
    ? totalWeight === 0n
      ? "Guardian veto before the first vote"
      : "Guardian veto after participation began"
    : null;

  return {
    retracted: Boolean(options.retracted || options.flagged || (options.vetoed && totalWeight === 0n)),
    executed: options.executed ?? false,
    flagged: options.flagged ?? false,
    vetoed: options.vetoed ?? false,
    ref: createProposalRef(options.id),
    proposer: DAO_MOCK_PROPOSER_ADDRESS,
    votingEpoch: options.timing.votingEpoch,
    createdAt: options.timing.createdAt,
    voteStartsAt: options.timing.voteStartsAt,
    voteEndsAt: options.timing.voteEndsAt,
    executionStartsAt:
      type === "signal" ? null : options.timing.executionStartsAt,
    executionEndsAt: type === "signal" ? null : options.timing.executionEndsAt,
    thresholdBps,
    totalWeight,
    yeaWeight,
    nayWeight: totalWeight - yeaWeight,
    protocolStatus,
    displayStatus,
    displayGroup: deriveDaoDisplayGroup(displayStatus, type),
    type,
    rules: {
      snapshotThresholdBps: 5000,
      approvalThresholdBps: thresholdBps,
      thresholdSnapshottedAtCreation: true,
      minimumTurnout: null,
      passageRequiresPositiveTotal: true,
      proposalType: type,
      votingPeriodSeconds:
        options.timing.voteEndsAt - options.timing.voteStartsAt,
      executionDelaySeconds:
        type === "signal"
          ? null
          : options.timing.executionStartsAt - options.timing.voteEndsAt,
      executionGuard:
        type === "signal" ? null : options.executionGuard ?? "guarded",
      votingAddress: DAO_MOCK_VOTING_ADDRESS,
      votingSource: { ...validateDaoVerifiedSource(DAO_PINNED_VOTING_SOURCE) },
      votingSourcePath: DAO_PINNED_VOTING_SOURCE_PATH,
      observationBlockNumber: 24_000_000n,
    },
    content,
    discussion: createDiscussion(
      options.discussionState ?? "verified",
      options.id
    ),
    script: {
      bytes: scriptBytes,
      hash: scriptHash,
      hashVerified: scriptBytes === null ? null : options.hashMismatch ? false : true,
      framing: "supported",
    },
    analysis,
    events: createEvents(options, totalWeight, yeaWeight, flagReason, vetoReason),
    moderation: { flagReason, vetoReason },
  };
}

function createContent(
  options: ProposalFixtureOptions
): DaoProposal["content"] {
  const state = options.contentState ?? "available";
  const assets: DaoProposalAsset[] =
    options.id === 1n || options.id === 2n
      ? [{ ...DAO_MOCK_GOVERNANCE_FLOW_ASSET }]
      : [];
  const attachment =
    options.id === 1n
      ? "\n\n![Governance flow diagram](./assets/governance-flow.svg)"
      : options.id === 2n
        ? `\n\n![Governance flow diagram](ipfs://${DAO_MOCK_GOVERNANCE_FLOW_ASSET_CID})`
        : "";
  const markdown =
    options.id === 21n
      ? `# ${options.title}\n\nThis proposal records the decision and rationale presented for DAO review.\n\n## Interoperability evidence ${DAO_MOCK_LONG_MARKDOWN_TOKEN}\n\nReview the [${DAO_MOCK_LONG_MARKDOWN_TOKEN}](https://example.com/governance/${DAO_MOCK_LONG_MARKDOWN_TOKEN}) before execution.\n\n| Evidence | Exact value |\n| --- | --- |\n| Canonical manifest | ${DAO_MOCK_LONG_MARKDOWN_TOKEN} |\n\n\`\`\`text\n${DAO_MOCK_LONG_MARKDOWN_TOKEN}\n\`\`\`\n`
      : `# ${options.title}\n\nThis proposal records the decision and rationale presented for DAO review.\n\n## Specification\n\nReview the requested governance outcome, voting record, and any ordered onchain actions before making a decision.${attachment}\n`;
  const value: DaoProposalContent = {
    schema: "yearn.dao.proposal.v1",
    markdown,
    discussionUrl: `https://gov.yearn.fi/t/dao-proposal/${options.id.toString()}`,
    proposalType: options.type ?? "executable",
    createdBy: DAO_MOCK_PROPOSER_ADDRESS,
    createdAt: new Date(options.timing.createdAt * 1_000).toISOString(),
    assets,
  };
  const validation = parseDaoProposalContent(value);
  if (validation.errors.length > 0) {
    throw new Error(
      `Invalid deterministic DAO content: ${validation.errors[0]?.code ?? "UNKNOWN"}`
    );
  }
  const identity = deriveDaoProposalContentIdentity(value);
  const invalidBytes = toBytes(
    `${JSON.stringify({ ...value, schema: "yearn.dao.proposal.invalid" })}\n`
  );
  const digest = state === "invalid" ? sha256(invalidBytes) : identity.digest;

  return {
    state,
    cid: state === "unavailable" ? null : createDaoRawSha256Cid(digest),
    digest,
    value: state === "available" ? value : null,
    error:
      state === "unavailable"
        ? "The content gateway did not return a response."
        : state === "invalid"
          ? "The immutable document does not match yearn.dao.proposal.v1."
          : null,
  };
}

function createDiscussion(
  state: DaoProposal["discussion"]["state"],
  proposalId: bigint
): DaoProposal["discussion"] {
  const url = `https://gov.yearn.fi/t/dao-proposal/${proposalId.toString()}`;
  if (state === "unverified") {
    return {
      state,
      url,
      title: null,
      categoryId: null,
      category: null,
      categorySlugPath: [],
    };
  }
  return {
    state,
    url,
    title: state === "verified" ? "Verified governance discussion" : null,
    categoryId: state === "verified" ? 42 : null,
    category: state === "verified" ? "Proposals" : null,
    categorySlugPath: state === "verified" ? ["proposals"] : [],
  };
}

function createEvents(
  options: ProposalFixtureOptions,
  totalWeight: bigint,
  yeaWeight: bigint,
  flagReason: string | null,
  vetoReason: string | null
): DaoProposalEvent[] {
  const events: DaoProposalEvent[] = [
    createEvent(options, 0, "propose", DAO_MOCK_PROPOSER_ADDRESS),
  ];
  let nextLogIndex = 1;

  if (options.aggregateVoteBlend) {
    if (totalWeight !== 11n * UNIT || yeaWeight !== (15n * UNIT) / 2n) {
      throw new Error("The aggregate vote fixture must retain its pinned totals.");
    }
    const voteBlockNumber = 23_900_000n + options.id * 10n + 1n;
    const voteBlockHash = fixedHex32(Number(options.id) * 10 + 1);
    const yeaTransaction = {
      blockNumber: voteBlockNumber,
      blockHash: voteBlockHash,
      timestamp: options.timing.voteStartsAt + 300,
      transactionHash: fixedHex32(Number(options.id) * 10 + 1_001),
      transactionIndex: 1,
    };
    const nayTransaction = {
      blockNumber: voteBlockNumber,
      blockHash: voteBlockHash,
      timestamp: options.timing.voteStartsAt + 600,
      transactionHash: fixedHex32(Number(options.id) * 10 + 1_002),
      transactionIndex: 2,
    };
    events.push(
      createEvent(options, nextLogIndex++, "vote", DAO_MOCK_ACCOUNT_ADDRESS, {
        log: yeaTransaction,
        yeaBps: 10_000,
        direction: "yea",
        weight: 3n * UNIT,
      }),
      createEvent(
        options,
        nextLogIndex++,
        "vote",
        DAO_MOCK_STYFIX_AGGREGATE_ADDRESS,
        {
          log: yeaTransaction,
          yeaBps: 10_000,
          weight: 4n * UNIT,
        }
      ),
      createEvent(
        options,
        nextLogIndex++,
        "vote",
        DAO_MOCK_YBC_AGGREGATE_ADDRESS,
        {
          log: yeaTransaction,
          yeaBps: 10_000,
          weight: 2n * UNIT,
        }
      ),
      createEvent(options, nextLogIndex++, "vote", DAO_MOCK_OPERATOR_ADDRESS, {
        log: nayTransaction,
        yeaBps: 0,
        direction: "nay",
        weight: 2n * UNIT,
      }),
      createEvent(
        options,
        nextLogIndex++,
        "vote",
        DAO_MOCK_STYFIX_AGGREGATE_ADDRESS,
        {
          log: nayTransaction,
          yeaBps: 7_500,
          weight: 4n * UNIT,
        }
      ),
      createEvent(
        options,
        nextLogIndex++,
        "vote",
        DAO_MOCK_YBC_AGGREGATE_ADDRESS,
        {
          log: nayTransaction,
          yeaBps: 7_500,
          weight: 2n * UNIT,
        }
      )
    );
  } else {
    const nayWeight = totalWeight - yeaWeight;
    if (yeaWeight > 0n) {
      events.push(
        createEvent(options, nextLogIndex++, "vote", DAO_MOCK_ACCOUNT_ADDRESS, {
          yeaBps: 10_000,
          direction: "yea",
          weight: yeaWeight,
        })
      );
    }
    if (nayWeight > 0n) {
      events.push(
        createEvent(options, nextLogIndex++, "vote", DAO_MOCK_OPERATOR_ADDRESS, {
          yeaBps: 0,
          direction: "nay",
          weight: nayWeight,
        })
      );
    }
  }

  if (options.flagged) {
    events.push(
      createEvent(options, nextLogIndex++, "flag", DAO_MOCK_OPERATOR_ADDRESS, {
        reason: flagReason,
      })
    );
  } else if (options.vetoed) {
    events.push(
      createEvent(options, nextLogIndex++, "veto", DAO_MOCK_GUARDIAN_ADDRESS, {
        reason: vetoReason,
      })
    );
  } else if (options.retracted) {
    events.push(
      createEvent(
        options,
        nextLogIndex++,
        "retract",
        DAO_MOCK_PROPOSER_ADDRESS
      )
    );
  }
  if (options.executed) {
    events.push(
      createEvent(
        options,
        nextLogIndex,
        "execute",
        DAO_MOCK_OPERATOR_ADDRESS
      )
    );
  }
  return events;
}

function createEvent(
  options: ProposalFixtureOptions,
  logIndex: number,
  type: DaoProposalEvent["type"],
  actor: Address,
  overrides: Partial<
    Pick<
      DaoProposalEvent,
      "yeaBps" | "direction" | "weight" | "reason"
    >
  > & {
    log?: Partial<Omit<DaoProposalEvent["log"], "logIndex">>;
  } = {}
): DaoProposalEvent {
  const proposalId = options.id;
  const seed = Number(proposalId) * 10 + logIndex;
  return {
    type,
    log: {
      blockNumber:
        overrides.log?.blockNumber ??
        23_900_000n + proposalId * 10n + BigInt(logIndex),
      blockHash: overrides.log?.blockHash ?? fixedHex32(seed),
      timestamp:
        options.unavailableProposeProvenance && type === "propose"
          ? null
          : overrides.log?.timestamp ??
            createEventTimestamp(options, type, logIndex),
      transactionHash:
        options.unavailableProposeProvenance && type === "propose"
          ? null
          : overrides.log?.transactionHash ?? fixedHex32(seed + 1_000),
      transactionIndex: overrides.log?.transactionIndex ?? 1,
      logIndex,
    },
    actor: type === "flag" || type === "veto" || type === "retract" ? null : actor,
    yeaBps: overrides.yeaBps ?? null,
    direction: overrides.direction ?? null,
    weight: overrides.weight ?? null,
    reason: overrides.reason ?? null,
  };
}

function createEventTimestamp(
  options: ProposalFixtureOptions,
  type: DaoProposalEvent["type"],
  logIndex: number
): number {
  if (type === "propose") return options.timing.createdAt;
  if (type === "vote") {
    return Math.min(
      options.timing.voteEndsAt - 1,
      options.timing.voteStartsAt + 300 + logIndex * 60
    );
  }
  if (type === "execute") {
    return Math.min(
      DAO_MOCK_NOW - 60,
      options.timing.executionStartsAt + 3_600
    );
  }
  return Math.min(DAO_MOCK_NOW - 60, options.timing.voteEndsAt - 1);
}

export function deriveDaoMockExpectedVotingEpoch(createdAt: number): bigint {
  return deriveDaoProposalTiming({
    genesis: DAO_MOCK_GENESIS,
    createdAt,
    epochLengthSeconds: DAO_MOCK_EPOCH_LENGTH_SECONDS,
    voteStartOffsetSeconds: DAO_MOCK_VOTE_START_OFFSET_SECONDS,
    executionDelaySeconds: DAO_MOCK_EXECUTION_DELAY_SECONDS,
  }).votingEpoch;
}

function createProposerInput(capacityFull: boolean): DaoProposerEligibilityInput {
  const expectedVotingEpoch = deriveDaoMockExpectedVotingEpoch(DAO_MOCK_NOW);
  const affectedBoostEpochs: DaoAffectedBoostEpoch[] = Array.from(
    { length: 6 },
    (_, index) => ({
      epoch: expectedVotingEpoch + BigInt(index),
      currentProposalCount: capacityFull && index === 2 ? 64 : 12 + index,
      proposalLimit: 64,
    })
  );
  return {
    address: DAO_MOCK_ACCOUNT_ADDRESS,
    connected: true,
    correctChain: true,
    now: DAO_MOCK_NOW,
    currentWeight: 10n * 10n ** 18n,
    minimumWeight: 1n * 10n ** 18n,
    blacklisted: false,
    lastProposedAt: null,
    cooldownSeconds: DAY,
    expectedVotingEpoch,
    affectedBoostEpochs,
  };
}

function createProposalRef(proposalId: bigint): DaoProposalRef {
  return {
    chainId: DAO_MOCK_CHAIN_ID,
    votingAddress: DAO_MOCK_VOTING_ADDRESS,
    proposalId,
  };
}

function getProposalById(proposalId: bigint): DaoProposal {
  const proposal = proposalById.get(proposalId);
  if (!proposal) throw new Error(`Unknown DAO mock proposal ${proposalId.toString()}.`);
  return proposal;
}

function getProposalPostVoteEnd(proposal: DaoProposal): number {
  if (proposal.executionEndsAt !== null) return proposal.executionEndsAt;
  return proposal.voteEndsAt + 14 * DAY;
}

function fixedHex32(seed: number): Hex {
  return `0x${BigInt(seed).toString(16).padStart(64, "0")}` as Hex;
}
