import { createDaoExecuteCall } from "./execute-call";
import { keccak256, stringToHex, type Address } from "viem";
import type { DaoTestBridgeAdapter } from "@/lib/test-bridge";
import { nowSeconds } from "@/lib/mocks/time";
import type { PreparedTransaction, TransactionHash } from "@/lib/tx/types";
import {
  assertDaoProposalInvariants,
  DAO_BLOCKED_REASONS,
  deriveDaoCapabilities,
  deriveDaoDisplayGroup,
  deriveDaoDisplayStatus,
  deriveDaoProtocolStatus,
  deriveDaoProposerState,
  deriveDaoVotingWeight,
  serializeDaoProposalRef,
  validateDaoModerationReason,
} from "./domain";
import {
  clearDaoCreatedProposals,
  indexDaoCreatedProposal,
  persistDaoCreatedProposal,
  readDaoCreatedProposals,
} from "./created-proposals";
import {
  createDaoMockFeed,
  DAO_MOCK_NOW,
  deriveDaoMockBlockHash,
  deriveDaoMockExpectedVotingEpoch,
  getDaoMockFixture,
} from "./fixtures";
import {
  DAO_EXECUTOR_SCRIPT_ERROR_VECTORS,
  DAO_EXECUTOR_VALID_SCRIPT_VECTORS,
} from "./script-vectors";
import { checkDaoExecutorScript } from "./script";
import type {
  DaoAccountProposalFacts,
  DaoAccountProposalState,
  DaoActionType,
  DaoCreatedProposalRecord,
  DaoExecutionGuard,
  DaoMockAccountState,
  DaoMockScriptState,
  DaoMockAuthoring,
  DaoMockAuthoringState,
  DaoMockContentState,
  DaoMockExecutionState,
  DaoMockFixtureId,
  DaoMockLifecycleState,
  DaoMockPersona,
  DaoMockProposalFlagsPatch,
  DaoMockProposalTimingPatch,
  DaoMockProposerState,
  DaoMockRole,
  DaoMockRuntimeSnapshot,
  DaoMockSurfaceState,
  DaoMockTransactionOutcome,
  DaoMockVetoState,
  DaoPendingAction,
  DaoProposal,
  DaoProposalEvent,
  DaoProposalLookup,
  DaoProposalRef,
  DaoProposerEligibilityInput,
  DaoProposerState,
  DaoVoteDirection,
} from "./types";

const DAY_SECONDS = 86_400;
const DEFAULT_FIXTURE_ID: DaoMockFixtureId = "voting";
const DEFAULT_WEIGHT = 100n * 10n ** 18n;

type Listener = () => void;

type DaoMockProposalRuntime = {
  proposal: DaoProposal;
  retracted: boolean;
  executed: boolean;
  flagged: boolean;
  vetoed: boolean;
  postVoteEpochEndsAt: number;
  vetoEndsAt: number;
};

type DaoMockStoreState = {
  surface: DaoMockSurfaceState;
  selectedFixtureId: DaoMockFixtureId | null;
  selectedProposalId: bigint;
  persona: DaoMockPersona;
  now: number;
  feed: ReturnType<typeof createDaoMockFeed>;
  proposals: DaoMockProposalRuntime[];
  account: DaoAccountProposalFacts;
  accountDecayLengthSeconds: number;
  proposer: DaoProposerEligibilityInput;
  executionGuard: DaoExecutionGuard;
  authoring: DaoMockAuthoring;
  transactionOutcome: DaoMockTransactionOutcome;
  pendingAction: DaoPendingAction | null;
  baselineVotes: Record<string, DaoVoteDirection>;
  submittedVotes: Record<string, DaoVoteDirection>;
  nextTransactionNonce: bigint;
};

const listeners = new Set<Listener>();
let state: DaoMockStoreState | null = null;
let snapshot: DaoMockRuntimeSnapshot | null = null;

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function emit() {
  listeners.forEach((listener) => listener());
}

function getState(): DaoMockStoreState {
  if (state === null) {
    commit(createStoreState(DAO_MOCK_NOW, DEFAULT_FIXTURE_ID), false);
  }
  return state as DaoMockStoreState;
}

function commit(next: DaoMockStoreState, shouldEmit = true) {
  state = normalizeStoreState(next);
  snapshot = createSnapshot(state);
  if (shouldEmit) emit();
}

function updateStore(transform: (current: DaoMockStoreState) => void) {
  const next = cloneValue(getState());
  transform(next);
  commit(next);
  return getDaoMockSnapshot();
}

function createStoreState(
  now: number,
  fixtureId: DaoMockFixtureId
): DaoMockStoreState {
  const fixture = getDaoMockFixture(fixtureId);
  const feed = createRuntimeFeed(now);
  const createdRecords = readDaoCreatedProposals();
  feed.proposals = mergeCreatedProposals(feed.proposals, createdRecords);
  for (const record of createdRecords) {
    advanceFeedToCreatedProposal(feed, record.proposal);
  }
  const proposals = createProposalRuntimes(feed.proposals);
  const delta = now - fixture.now;
  const proposer = cloneValue(fixture.proposer);
  proposer.now = now;
  if (proposer.lastProposedAt !== null) {
    proposer.lastProposedAt += delta;
  }
  const baselineVotes: Record<string, DaoVoteDirection> = {};
  if (fixture.account.hasVoted) {
    baselineVotes[daoVoteIdentity(fixture.proposalRef, fixture.account.address)] =
      fixture.account.voteDirection ?? "yea";
  }

  return {
    surface: "ready",
    selectedFixtureId: fixtureId,
    selectedProposalId: fixture.proposalRef.proposalId,
    persona: resolveFixturePersona(fixtureId),
    now,
    feed,
    proposals,
    account: cloneValue(fixture.account),
    accountDecayLengthSeconds: fixtureId === "late-voting" ? DAY_SECONDS : 0,
    proposer,
    executionGuard: fixture.executionGuard,
    authoring: createAuthoringState("valid-signal"),
    transactionOutcome: "success",
    pendingAction: null,
    baselineVotes,
    submittedVotes: {},
    nextTransactionNonce: 0n,
  };
}

function normalizeStoreState(next: DaoMockStoreState): DaoMockStoreState {
  next.proposals = next.proposals.map((runtime) => {
    const proposal = runtime.proposal;
    const protocolStatus = deriveDaoProtocolStatus({
      exists: true,
      now: next.now,
      voteStartsAt: proposal.voteStartsAt,
      voteEndsAt: proposal.voteEndsAt,
      postVoteEpochEndsAt: runtime.postVoteEpochEndsAt,
      type: proposal.type,
      thresholdBps: proposal.thresholdBps,
      totalWeight: proposal.totalWeight,
      yeaWeight: proposal.yeaWeight,
      retracted: runtime.retracted,
      executed: runtime.executed,
      flagged: runtime.flagged,
      vetoed: runtime.vetoed,
    });
    const displayStatus = deriveDaoDisplayStatus(protocolStatus, proposal.type);
    const normalizedProposal: DaoProposal = {
      ...proposal,
      retracted: runtime.retracted, executed: runtime.executed,
      flagged: runtime.flagged, vetoed: runtime.vetoed,
      protocolStatus,
      displayStatus,
      displayGroup: deriveDaoDisplayGroup(displayStatus, proposal.type),
      rules: {
        ...proposal.rules,
        approvalThresholdBps: proposal.thresholdBps,
        proposalType: proposal.type,
        votingPeriodSeconds: proposal.voteEndsAt - proposal.voteStartsAt,
        executionDelaySeconds:
          proposal.executionStartsAt === null
            ? null
            : proposal.executionStartsAt - proposal.voteEndsAt,
        executionGuard:
          proposal.type === "signal"
            ? null
            : proposal.rules.executionGuard ?? "guarded",
      },
    };
    assertDaoProposalInvariants(normalizedProposal);
    return { ...runtime, proposal: normalizedProposal };
  });

  synchronizeProposerEpochs(next.proposer, next.now);
  next.feed = {
    ...next.feed,
    generatedAt: new Date(next.now * 1_000).toISOString(),
    proposals: next.proposals.map((runtime) => cloneValue(runtime.proposal)),
  };

  const selected = getSelectedProposalRuntime(next);
  const weight = deriveDaoVotingWeight({
    votingWeight: next.account.votingWeight,
    now: next.now,
    voteEndsAt: selected.proposal.voteEndsAt,
    decayLengthSeconds: next.accountDecayLengthSeconds,
  });
  next.account = {
    ...next.account,
    ...weight,
    ...readVoteFacts(next, selected.proposal.ref, next.account.address),
  };
  return next;
}

function createSnapshot(current: DaoMockStoreState): DaoMockRuntimeSnapshot {
  return cloneValue({
    surface: current.surface,
    selectedFixtureId: current.selectedFixtureId,
    selectedProposalId: current.selectedProposalId,
    persona: current.persona,
    now: current.now,
    feed:
      current.surface === "empty"
        ? { ...current.feed, proposals: [] }
        : current.feed,
    account: current.account,
    proposer: current.proposer,
    executionGuard: current.executionGuard,
    authoring: current.authoring,
    transactionOutcome: current.transactionOutcome,
    pendingAction: current.pendingAction,
  });
}

function createRuntimeFeed(now: number) {
  const feed = createDaoMockFeed();
  return {
    ...feed,
    generatedAt: new Date(now * 1_000).toISOString(),
    canonicalBlock: deriveMockCanonicalBlock(feed.canonicalBlock, now),
  };
}

function deriveMockCanonicalBlock(
  baseline: DaoMockStoreState["feed"]["canonicalBlock"],
  timestamp: number
): DaoMockStoreState["feed"]["canonicalBlock"] {
  const deltaSeconds = timestamp - baseline.timestamp;
  const blockDelta = BigInt(Math.floor(deltaSeconds / 12));
  if (blockDelta === 0n) return cloneValue(baseline);
  const number = baseline.number + blockDelta;
  if (number < 0n) {
    throw new Error("DAO mock canonical block number cannot be negative.");
  }
  const canonicalTimestamp = baseline.timestamp + Number(blockDelta) * 12;
  return {
    number,
    hash: deriveDaoMockBlockHash(number, canonicalTimestamp),
    timestamp: canonicalTimestamp,
  };
}

function synchronizeProposerEpochs(
  proposer: DaoProposerEligibilityInput,
  now: number
) {
  const expectedVotingEpoch = deriveDaoMockExpectedVotingEpoch(now);
  proposer.now = now;
  proposer.expectedVotingEpoch = expectedVotingEpoch;
  proposer.affectedBoostEpochs = proposer.affectedBoostEpochs.map(
    (affected, index) => ({
      ...affected,
      epoch: expectedVotingEpoch + BigInt(index),
    })
  );
}

function createProposalRuntimes(
  proposals: DaoProposal[] = createDaoMockFeed().proposals
): DaoMockProposalRuntime[] {
  return proposals.map((proposal) => ({
    proposal,
    retracted: proposal.retracted,
    executed: proposal.executed,
    flagged: proposal.flagged,
    vetoed: proposal.vetoed,
    postVoteEpochEndsAt:
      proposal.executionEndsAt ?? proposal.voteEndsAt + 14 * DAY_SECONDS,
    vetoEndsAt:
      proposal.executionEndsAt ?? proposal.voteEndsAt + 14 * DAY_SECONDS,
  }));
}

function mergeCreatedProposals(
  proposals: DaoProposal[],
  records: DaoCreatedProposalRecord[]
): DaoProposal[] {
  const createdKeys = new Set(
    records.map((record) => serializeDaoProposalRef(record.proposal.ref))
  );
  return [
    ...proposals.filter(
      (proposal) => !createdKeys.has(serializeDaoProposalRef(proposal.ref))
    ),
    ...records.map((record) => cloneValue(record.proposal)),
  ];
}

function upsertCreatedProposalRuntime(
  current: DaoMockStoreState,
  record: DaoCreatedProposalRecord
): void {
  const key = serializeDaoProposalRef(record.proposal.ref);
  const runtime = createProposalRuntimes([cloneValue(record.proposal)])[0];
  if (!runtime) {
    throw new Error("Created proposal runtime could not be initialized.");
  }
  current.proposals = [
    ...current.proposals.filter(
      (candidate) =>
        serializeDaoProposalRef(candidate.proposal.ref) !== key
    ),
    runtime,
  ];
  current.now = Math.max(current.now, record.proposal.createdAt);
  advanceFeedToCreatedProposal(current.feed, record.proposal);
}

function advanceFeedToCreatedProposal(
  feed: DaoMockStoreState["feed"],
  proposal: DaoProposal
): void {
  const proposeEvent = proposal.events.find((event) => event.type === "propose");
  if (
    !proposeEvent ||
    proposeEvent.log.blockNumber <= feed.canonicalBlock.number
  ) {
    return;
  }
  feed.canonicalBlock = {
    number: proposeEvent.log.blockNumber,
    hash: proposeEvent.log.blockHash,
    timestamp: proposeEvent.log.timestamp ?? feed.canonicalBlock.timestamp,
  };
}

function getSelectedProposalRuntime(
  current: DaoMockStoreState
): DaoMockProposalRuntime {
  const selected = current.proposals.find(
    (runtime) =>
      runtime.proposal.ref.proposalId === current.selectedProposalId
  );
  if (!selected) {
    throw new Error(
      `Unknown selected DAO proposal ${current.selectedProposalId.toString()}.`
    );
  }
  return selected;
}

function getProposalRuntimeByRef(
  current: DaoMockStoreState,
  ref: DaoProposalRef
): DaoMockProposalRuntime | null {
  const key = serializeDaoProposalRef(ref);
  return (
    current.proposals.find(
      (runtime) => serializeDaoProposalRef(runtime.proposal.ref) === key
    ) ?? null
  );
}

function daoVoteIdentity(ref: DaoProposalRef, address: Address): string {
  return `${serializeDaoProposalRef(ref)}:${address.toLowerCase()}`;
}

function readVoteFacts(
  current: DaoMockStoreState,
  ref: DaoProposalRef,
  address: Address
): Pick<DaoAccountProposalFacts, "hasVoted" | "voteDirection"> {
  const identity = daoVoteIdentity(ref, address);
  const direction =
    current.submittedVotes[identity] ??
    current.baselineVotes[identity] ??
    null;
  return {
    hasVoted: direction !== null,
    voteDirection: direction,
  };
}

function setBaselineVote(
  current: DaoMockStoreState,
  hasVoted: boolean,
  direction: DaoVoteDirection | null
) {
  const ref = getSelectedProposalRuntime(current).proposal.ref;
  const identity = daoVoteIdentity(ref, current.account.address);
  if (hasVoted) {
    current.baselineVotes[identity] = direction ?? "yea";
  } else {
    delete current.baselineVotes[identity];
  }
}

function replaceSelectedProposal(
  current: DaoMockStoreState,
  fixtureId: DaoMockFixtureId
) {
  const target = getSelectedProposalRuntime(current);
  const sourceId = getDaoMockFixture(fixtureId).proposalRef.proposalId;
  const source = createProposalRuntimes().find(
    (runtime) => runtime.proposal.ref.proposalId === sourceId
  );
  if (!source) throw new Error(`Unknown DAO fixture proposal: ${fixtureId}.`);
  source.proposal.ref = cloneValue(target.proposal.ref);
  current.proposals = current.proposals.map((runtime) =>
    runtime.proposal.ref.proposalId === current.selectedProposalId
      ? source
      : runtime
  );
  current.selectedFixtureId = null;
}

function updateSelectedProposal(
  current: DaoMockStoreState,
  transform: (runtime: DaoMockProposalRuntime) => void
) {
  const selected = getSelectedProposalRuntime(current);
  transform(selected);
  current.selectedFixtureId = null;
}

function resolveFixturePersona(fixtureId: DaoMockFixtureId): DaoMockPersona {
  if (fixtureId === "discussion" || fixtureId === "retracted") return "proposer";
  if (fixtureId === "early-veto") return "guardian";
  if (fixtureId === "guarded-execution") return "operator";
  return "voter";
}

function createAuthoringState(stateId: DaoMockAuthoringState): DaoMockAuthoring {
  if (stateId === "valid-signal") {
    return {
      state: stateId,
      proposalType: "signal",
      scriptCheck: checkDaoExecutorScript(
        DAO_EXECUTOR_VALID_SCRIPT_VECTORS.emptySignal.script,
        "signal"
      ),
    };
  }
  if (stateId === "valid-script") {
    return {
      state: stateId,
      proposalType: "executable",
      scriptCheck: checkDaoExecutorScript(
        DAO_EXECUTOR_VALID_SCRIPT_VECTORS.twoCalls.script,
        "executable"
      ),
    };
  }

  const errorCode =
    stateId === "invalid-frame"
      ? "TRUNCATED_HEADER"
      : stateId === "too-many-calls"
        ? "TOO_MANY_CALLS"
        : "SCRIPT_TOO_LARGE";
  const vector = DAO_EXECUTOR_SCRIPT_ERROR_VECTORS.find(
    (candidate) => candidate.expectedCode === errorCode
  );
  if (!vector) throw new Error(`Missing DAO authoring vector: ${errorCode}.`);
  return {
    state: stateId,
    proposalType: vector.proposalType ?? "executable",
    scriptCheck: checkDaoExecutorScript(
      vector.script,
      vector.proposalType ?? "executable"
    ),
  };
}

function parseUnsignedBigInt(value: string, label: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal.`);
  }
  return BigInt(value);
}

export function subscribeDaoMockStore(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDaoMockSnapshot(): DaoMockRuntimeSnapshot {
  getState();
  return snapshot as DaoMockRuntimeSnapshot;
}

export function resetDaoMockStore(
  options: {
    fixtureId?: DaoMockFixtureId;
    now?: number;
    preserveCreatedProposals?: boolean;
  } = {}
) {
  if (!options.preserveCreatedProposals) {
    clearDaoCreatedProposals();
  }
  commit(
    createStoreState(
      options.now ?? DAO_MOCK_NOW,
      options.fixtureId ?? DEFAULT_FIXTURE_ID
    )
  );
  return getDaoMockSnapshot();
}

export function registerDaoMockCreatedProposal(
  record: DaoCreatedProposalRecord
): DaoMockRuntimeSnapshot {
  const persisted = persistDaoCreatedProposal(record);
  return updateStore((current) => {
    upsertCreatedProposalRuntime(current, persisted);
  });
}

export function indexDaoMockCreatedProposal(
  ref: DaoProposalRef,
  indexedAt: number
): DaoCreatedProposalRecord | null {
  const indexed = indexDaoCreatedProposal(ref, indexedAt);
  if (!indexed) return null;
  updateStore((current) => {
    upsertCreatedProposalRuntime(current, indexed);
  });
  return indexed;
}

export function applyDaoMockFixture(fixtureId: DaoMockFixtureId) {
  const current = getState();
  commit(createStoreState(current.now, fixtureId));
  return getDaoMockSnapshot();
}

export function syncDaoMockStoreToNow(timestamp: number = nowSeconds()) {
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error("DAO mock time must be a safe integer timestamp.");
  }
  return updateStore((current) => {
    current.now = timestamp;
    current.feed.canonicalBlock = deriveMockCanonicalBlock(
      current.feed.canonicalBlock,
      timestamp
    );
  });
}

export function setDaoMockSurface(surface: DaoMockSurfaceState) {
  return updateStore((current) => {
    current.surface = surface;
  });
}

export function setDaoMockLoading(value: boolean) {
  return setDaoMockSurface(value ? "loading" : "ready");
}

export function setDaoMockEmpty(value: boolean) {
  return setDaoMockSurface(value ? "empty" : "ready");
}

export function setDaoMockSelectedProposal(proposalId: string) {
  const parsed = parseUnsignedBigInt(proposalId, "DAO proposal ID");
  return updateStore((current) => {
    if (
      !current.proposals.some(
        (runtime) => runtime.proposal.ref.proposalId === parsed
      )
    ) {
      throw new Error(`Unknown DAO mock proposal ${proposalId}.`);
    }
    current.selectedProposalId = parsed;
    current.selectedFixtureId = null;
  });
}

export function setDaoMockPersona(persona: DaoMockPersona) {
  return updateStore((current) => {
    current.persona = persona;
    current.account.connected = persona !== "observer";
    current.account.correctChain = true;
    current.account.isProposer = persona === "proposer";
    current.account.isOperator = persona === "operator";
    current.account.isGuardian = persona === "guardian";
    setBaselineVote(current, false, null);
    current.account.votingWeight = persona === "observer" ? 0n : DEFAULT_WEIGHT;
    current.accountDecayLengthSeconds = 0;
    current.proposer.connected = persona !== "observer";
    current.proposer.correctChain = true;
    current.proposer.blacklisted = false;
    current.proposer.currentWeight =
      persona === "proposer" ? DEFAULT_WEIGHT : current.proposer.currentWeight;
  });
}

export function setDaoMockRole(role: DaoMockRole, enabled: boolean) {
  return updateStore((current) => {
    if (role === "proposer") current.account.isProposer = enabled;
    if (role === "operator") current.account.isOperator = enabled;
    if (role === "guardian") current.account.isGuardian = enabled;
  });
}

export function setDaoMockContentState(contentState: DaoMockContentState) {
  return updateStore((current) => {
    const sourceFixture =
      contentState === "unavailable"
        ? "content-unavailable"
        : contentState === "invalid"
          ? "content-invalid"
          : contentState === "unverified-forum"
            ? "direct-proposal"
            : "voting";
    const sourceId = getDaoMockFixture(sourceFixture).proposalRef.proposalId;
    const source = createProposalRuntimes().find(
      (runtime) => runtime.proposal.ref.proposalId === sourceId
    );
    if (!source) throw new Error(`Unknown DAO content fixture: ${sourceFixture}.`);
    updateSelectedProposal(current, (selected) => {
      if (contentState !== "unverified-forum") {
        selected.proposal.content = cloneValue(source.proposal.content);
      }
      selected.proposal.discussion = cloneValue(source.proposal.discussion);
    });
  });
}

export function setDaoMockLifecycle(lifecycle: DaoMockLifecycleState) {
  const fixtureByLifecycle: Record<DaoMockLifecycleState, DaoMockFixtureId> = {
    discussion: "discussion",
    voting: "voting",
    approved: "approved-executable",
    rejected: "rejected",
    expired: "expired",
    retracted: "retracted",
    flagged: "flagged",
  };
  return updateStore((current) => {
    replaceSelectedProposal(current, fixtureByLifecycle[lifecycle]);
  });
}

export function setDaoMockVetoState(vetoState: DaoMockVetoState) {
  return updateStore((current) => {
    replaceSelectedProposal(
      current,
      vetoState === "before-votes" ? "early-veto" : "post-vote-veto"
    );
  });
}

export function setDaoMockScriptState(analysisState: DaoMockScriptState) {
  return updateStore((current) => {
    if (analysisState === "hash-mismatch") {
      const sourceId = getDaoMockFixture("hash-mismatch").proposalRef.proposalId;
      const source = createProposalRuntimes().find(
        (runtime) => runtime.proposal.ref.proposalId === sourceId
      );
      if (!source) throw new Error("Missing DAO hash mismatch fixture.");
      updateSelectedProposal(current, (selected) => {
        selected.proposal.type = "executable";
        selected.proposal.script = cloneValue(source.proposal.script);
        selected.proposal.executionStartsAt = source.proposal.executionStartsAt;
        selected.proposal.executionEndsAt = source.proposal.executionEndsAt;
        selected.postVoteEpochEndsAt = source.postVoteEpochEndsAt;
      });
      return;
    }

    const fixtureByAnalysis: Record<
      Exclude<DaoMockScriptState, "hash-mismatch">,
      DaoMockFixtureId
    > = {
      missing: "script-missing",
      decoded: "voting",
      partial: "partial-decode",
      malformed: "script-malformed",
    };
    const sourceId = getDaoMockFixture(
      fixtureByAnalysis[analysisState]
    ).proposalRef.proposalId;
    const source = createProposalRuntimes().find(
      (runtime) => runtime.proposal.ref.proposalId === sourceId
    );
    if (!source) throw new Error(`Unknown DAO analysis state: ${analysisState}.`);
    updateSelectedProposal(current, (selected) => {
      selected.proposal.analysis = cloneValue(source.proposal.analysis);
      if (selected.proposal.type === "executable") selected.proposal.script = cloneValue(source.proposal.script);
    });
  });
}

export function setDaoMockAccountState(accountState: DaoMockAccountState) {
  return updateStore((current) => {
    current.account.connected = accountState !== "disconnected";
    current.account.correctChain = accountState !== "wrong-network";
    setBaselineVote(
      current,
      accountState === "already-voted",
      accountState === "already-voted" ? "yea" : null
    );
    current.account.votingWeight =
      accountState === "no-weight" || accountState === "disconnected"
        ? 0n
        : DEFAULT_WEIGHT;
    current.accountDecayLengthSeconds =
      accountState === "late-decayed" ? DAY_SECONDS : 0;
    if (accountState === "late-decayed") {
      replaceSelectedProposal(current, "late-voting");
    }
  });
}

export function setDaoMockAccountWeight(weight: string) {
  return updateStore((current) => {
    current.account.votingWeight = parseUnsignedBigInt(
      weight,
      "DAO account weight"
    );
  });
}

export function setDaoMockAlreadyVoted(
  hasVoted: boolean,
  direction: "yea" | "nay" | null = hasVoted ? "yea" : null
) {
  return updateStore((current) => {
    setBaselineVote(current, hasVoted, direction);
  });
}

export function setDaoMockExecutionState(executionState: DaoMockExecutionState) {
  return updateStore((current) => {
    if (executionState === "signal") {
      const sourceId = getDaoMockFixture("approved-signal").proposalRef.proposalId;
      const source = createProposalRuntimes().find(
        (runtime) => runtime.proposal.ref.proposalId === sourceId
      );
      if (!source) throw new Error("Missing DAO signal fixture.");
      updateSelectedProposal(current, (selected) => {
        selected.proposal.type = "signal";
        selected.proposal.script = cloneValue(source.proposal.script);
        selected.proposal.analysis = cloneValue(source.proposal.analysis);
        selected.proposal.executionStartsAt = null;
        selected.proposal.executionEndsAt = null;
        selected.postVoteEpochEndsAt = selected.proposal.voteEndsAt + 14 * DAY_SECONDS;
        if (selected.proposal.content.value) {
          selected.proposal.content.value.proposalType = "signal";
        }
      });
      return;
    }

    if (executionState === "executable") {
      const sourceId = getDaoMockFixture("voting").proposalRef.proposalId;
      const source = createProposalRuntimes().find(
        (runtime) => runtime.proposal.ref.proposalId === sourceId
      );
      if (!source) throw new Error("Missing DAO executable fixture.");
      updateSelectedProposal(current, (selected) => {
        selected.proposal.type = "executable";
        selected.proposal.script = cloneValue(source.proposal.script);
        selected.proposal.analysis = cloneValue(source.proposal.analysis);
        selected.proposal.executionStartsAt = selected.proposal.voteEndsAt + DAY_SECONDS;
        selected.proposal.executionEndsAt = selected.proposal.voteEndsAt + 14 * DAY_SECONDS;
        selected.postVoteEpochEndsAt = selected.proposal.executionEndsAt;
        if (selected.proposal.content.value) {
          selected.proposal.content.value.proposalType = "executable";
        }
      });
      return;
    }

    const fixtureId =
      executionState === "permissionless"
        ? "permissionless-execution"
        : "guarded-execution";
    replaceSelectedProposal(current, fixtureId);
    current.executionGuard =
      executionState === "permissionless" ? "permissionless" : "guarded";
    current.account.isOperator = executionState !== "permissionless";
    current.account.executionPreflight = {
      ...current.account.executionPreflight,
      call: createDaoExecuteCall(getSelectedProposalRuntime(current).proposal.ref, current.account.address, getSelectedProposalRuntime(current).proposal.script.bytes ?? "0x"),
      state: executionState === "simulation-failure" ? "failed" : "succeeded",
      scriptHash: getSelectedProposalRuntime(current).proposal.script.hash,
      blockNumber: 24_000_001n,
      simulatedAt: new Date(current.now * 1_000).toISOString(),
      error:
        executionState === "simulation-failure"
          ? "Mock current-state simulation reverted."
          : null,
    };
  });
}

export function setDaoMockExecutionGuard(guard: DaoExecutionGuard) {
  return updateStore((current) => {
    current.executionGuard = guard;
    updateSelectedProposal(current, (selected) => {
      if (selected.proposal.type === "executable") {
        selected.proposal.rules.executionGuard = guard;
      }
    });
  });
}

export function setDaoMockAuthoringState(authoringState: DaoMockAuthoringState) {
  return updateStore((current) => {
    current.authoring = createAuthoringState(authoringState);
  });
}

export function setDaoMockProposerState(proposerState: DaoMockProposerState) {
  return updateStore((current) => {
    current.proposer.connected = true;
    current.proposer.correctChain = true;
    current.proposer.blacklisted = proposerState === "blacklisted";
    current.proposer.currentWeight =
      proposerState === "insufficient-weight"
        ? 0n
        : current.proposer.minimumWeight + 1n;
    current.proposer.lastProposedAt =
      proposerState === "cooldown" ? current.now : null;
    current.proposer.affectedBoostEpochs =
      current.proposer.affectedBoostEpochs.map((affected, index) => ({
        ...affected,
        currentProposalCount:
          proposerState === "capacity-full" && index === 2
            ? affected.proposalLimit
            : Math.min(affected.currentProposalCount, affected.proposalLimit - 1),
      }));
  });
}

export function setDaoMockProposalVotes(totalWeight: string, yeaWeight: string) {
  const total = parseUnsignedBigInt(totalWeight, "DAO total vote weight");
  const yea = parseUnsignedBigInt(yeaWeight, "DAO Yea vote weight");
  if (yea > total) throw new Error("DAO Yea weight cannot exceed total weight.");
  return updateStore((current) => {
    updateSelectedProposal(current, (selected) => {
      selected.proposal.totalWeight = total;
      selected.proposal.yeaWeight = yea;
      selected.proposal.nayWeight = total - yea;
    });
  });
}

export function setDaoMockProposalThreshold(thresholdBps: number) {
  if (!Number.isInteger(thresholdBps) || thresholdBps < 0 || thresholdBps > 10_000) {
    throw new Error("DAO threshold must be an integer from 0 through 10,000.");
  }
  return updateStore((current) => {
    updateSelectedProposal(current, (selected) => {
      selected.proposal.thresholdBps = thresholdBps;
    });
  });
}

export function setDaoMockProposalFlags(flags: DaoMockProposalFlagsPatch) {
  return updateStore((current) => {
    updateSelectedProposal(current, (selected) => {
      if (flags.retracted !== undefined) selected.retracted = flags.retracted;
      if (flags.executed !== undefined) selected.executed = flags.executed;
      if (flags.flagged !== undefined) selected.flagged = flags.flagged;
      if (flags.vetoed !== undefined) selected.vetoed = flags.vetoed;
    });
  });
}

export function setDaoMockProposalTiming(timing: DaoMockProposalTimingPatch) {
  return updateStore((current) => {
    updateSelectedProposal(current, (selected) => {
      if (timing.createdAt !== undefined) {
        selected.proposal.createdAt = timing.createdAt;
      }
      if (timing.voteStartsAt !== undefined) {
        selected.proposal.voteStartsAt = timing.voteStartsAt;
      }
      if (timing.voteEndsAt !== undefined) {
        selected.proposal.voteEndsAt = timing.voteEndsAt;
      }
      if (timing.executionStartsAt !== undefined) {
        selected.proposal.executionStartsAt = timing.executionStartsAt;
      }
      if (timing.executionEndsAt !== undefined) {
        selected.proposal.executionEndsAt = timing.executionEndsAt;
      }
      if (timing.postVoteEpochEndsAt !== undefined) {
        selected.postVoteEpochEndsAt = timing.postVoteEpochEndsAt;
      }
      if (timing.vetoEndsAt !== undefined) {
        selected.vetoEndsAt = timing.vetoEndsAt;
      }
    });
  });
}

export function setDaoMockProposerWeights(currentWeight: string, minimumWeight: string) {
  return updateStore((current) => {
    current.proposer.currentWeight = parseUnsignedBigInt(
      currentWeight,
      "DAO proposer weight"
    );
    current.proposer.minimumWeight = parseUnsignedBigInt(
      minimumWeight,
      "DAO minimum proposer weight"
    );
  });
}

export function setDaoMockProposerBlacklist(blacklisted: boolean) {
  return updateStore((current) => {
    current.proposer.blacklisted = blacklisted;
  });
}

export function setDaoMockProposerCooldown(
  lastProposedAt: number | null,
  cooldownSeconds: number
) {
  return updateStore((current) => {
    current.proposer.lastProposedAt = lastProposedAt;
    current.proposer.cooldownSeconds = cooldownSeconds;
  });
}

export function setDaoMockProposalCapacity(index: number, count: number) {
  if (!Number.isInteger(index) || index < 0 || index >= 6) {
    throw new Error("DAO proposal capacity index must be from 0 through 5.");
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("DAO proposal capacity count must be a non-negative integer.");
  }
  return updateStore((current) => {
    current.proposer.affectedBoostEpochs[index].currentProposalCount = count;
  });
}

export function setDaoMockTransactionOutcome(
  outcome: DaoMockTransactionOutcome
) {
  return updateStore((current) => {
    current.transactionOutcome = outcome;
  });
}

export function clearDaoMockPendingAction() {
  return updateStore((current) => {
    current.pendingAction = null;
  });
}

export function indexDaoMockPendingAction() {
  return updateStore((current) => {
    const pending = current.pendingAction;
    if (!pending) return;
    const runtime = getProposalRuntimeByRef(current, pending.ref);
    if (!runtime) {
      throw new Error(
        `Unknown DAO proposal ${serializeDaoProposalRef(pending.ref)}.`
      );
    }

    if (pending.action === "vote") {
      const weight = pending.effectiveVotingWeight;
      const direction = pending.direction;
      if (weight === null || direction === null) {
        throw new Error("Pending DAO vote is missing its submitted facts.");
      }
      runtime.proposal.totalWeight += weight;
      if (direction === "yea") runtime.proposal.yeaWeight += weight;
      else runtime.proposal.nayWeight += weight;
    } else if (pending.action === "retract") {
      runtime.retracted = true;
    } else if (pending.action === "flag") {
      runtime.flagged = true;
      runtime.retracted = true;
      runtime.proposal.moderation.flagReason = pending.reason;
    } else if (pending.action === "veto") {
      runtime.vetoed = true;
      if (runtime.proposal.totalWeight === 0n) runtime.retracted = true;
      runtime.proposal.moderation.vetoReason = pending.reason;
    } else {
      runtime.executed = true;
    }

    const event = createIndexedActionEvent(current, pending);
    runtime.proposal.events.push(event);
    current.feed.canonicalBlock = {
      number: event.log.blockNumber,
      hash: event.log.blockHash,
      timestamp: event.log.timestamp ?? current.feed.canonicalBlock.timestamp,
    };
    current.selectedFixtureId = null;
    current.pendingAction = null;
  });
}

export function prepareDaoMockVote(
  ref: DaoProposalRef,
  address: Address,
  direction: DaoVoteDirection
): PreparedTransaction {
  assertDaoMockActionAllowed("vote", ref, address);
  return createPreparedDaoMockAction({
    action: "vote",
    ref,
    address,
    direction,
    reason: null,
  });
}

export function prepareDaoMockRetract(
  ref: DaoProposalRef,
  address: Address
): PreparedTransaction {
  assertDaoMockActionAllowed("retract", ref, address);
  return createPreparedDaoMockAction({
    action: "retract",
    ref,
    address,
    direction: null,
    reason: null,
  });
}

export function prepareDaoMockFlag(
  ref: DaoProposalRef,
  address: Address,
  reason: string
): PreparedTransaction {
  const checked = validateDaoModerationReason(reason);
  if (checked.error) throw new Error(checked.error);
  assertDaoMockActionAllowed("flag", ref, address);
  return createPreparedDaoMockAction({
    action: "flag",
    ref,
    address,
    direction: null,
    reason: checked.value,
  });
}

export function prepareDaoMockVeto(
  ref: DaoProposalRef,
  address: Address,
  reason: string
): PreparedTransaction {
  const checked = validateDaoModerationReason(reason);
  if (checked.error) throw new Error(checked.error);
  assertDaoMockActionAllowed("veto", ref, address);
  return createPreparedDaoMockAction({
    action: "veto",
    ref,
    address,
    direction: null,
    reason: checked.value,
  });
}

export function prepareDaoMockExecute(
  ref: DaoProposalRef,
  address: Address
): PreparedTransaction {
  assertDaoMockActionAllowed("execute", ref, address);
  return createPreparedDaoMockAction({
    action: "execute",
    ref,
    address,
    direction: null,
    reason: null,
  });
}

type PreparedDaoMockActionInput = {
  action: DaoActionType;
  ref: DaoProposalRef;
  address: Address;
  direction: DaoVoteDirection | null;
  reason: string | null;
};

function createPreparedDaoMockAction(
  input: PreparedDaoMockActionInput
): PreparedTransaction {
  const ref = cloneValue(input.ref);
  const preparedContext = daoMockPreparationContext(ref, input.address);
  return async () => {
    assertDaoMockActionAllowed(input.action, ref, input.address);
    if (daoMockPreparationContext(ref, input.address) !== preparedContext) throw new Error("DAO preparation changed. Review the current account, proposal and transaction again.");
    const checkedReason = validatePreparedModerationReason(
      input.action,
      input.reason
    );
    const current = getState();
    throwForMockTransactionOutcome(current.transactionOutcome);
    const account = readDaoMockAccountProposalState(ref, input.address);
    const transactionHash = createMockTransactionHash(
      input.action,
      ref,
      input.address,
      current.nextTransactionNonce
    );
    const pending: DaoPendingAction = {
      action: input.action,
      ref,
      actor: input.address,
      transactionHash,
      submittedAt: current.now,
      direction: input.direction,
      effectiveVotingWeight:
        input.action === "vote" ? account.effectiveVotingWeight : null,
      reason: checkedReason,
    };
    updateStore((next) => {
      if (next.pendingAction) {
        throw new Error("A confirmed proposal action is already awaiting indexing.");
      }
      next.pendingAction = pending;
      if (input.action === "vote") {
        if (input.direction === null) {
          throw new Error("A pending DAO vote requires a direction.");
        }
        next.submittedVotes[daoVoteIdentity(ref, input.address)] =
          input.direction;
      }
      next.nextTransactionNonce += 1n;
    });
    return transactionHash;
  };
}

function validatePreparedModerationReason(
  action: DaoActionType,
  reason: string | null
): string | null {
  if (action !== "flag" && action !== "veto") return null;
  const checked = validateDaoModerationReason(reason ?? "");
  if (checked.error) throw new Error(checked.error);
  return checked.value;
}

function createMockTransactionHash(
  action: DaoActionType,
  ref: DaoProposalRef,
  address: Address,
  nonce: bigint
): TransactionHash {
  return keccak256(
    stringToHex(
      [
        serializeDaoProposalRef(ref),
        address.toLowerCase(),
        action,
        nonce.toString(),
      ].join("|")
    )
  ) as TransactionHash;
}

function assertDaoMockActionAllowed(
  action: DaoActionType,
  ref: DaoProposalRef,
  address: Address
) {
  const account = readDaoMockAccountProposalState(ref, address);
  const capability: readonly [boolean, string | null] =
    action === "vote"
      ? [account.capabilities.canVote, account.capabilities.voteBlockedReason]
      : action === "retract"
        ? [
            account.capabilities.canRetract,
            account.capabilities.retractBlockedReason,
          ]
        : action === "flag"
          ? [account.capabilities.canFlag, account.capabilities.flagBlockedReason]
          : action === "veto"
            ? [account.capabilities.canVeto, account.capabilities.vetoBlockedReason]
            : [
                account.capabilities.canExecute,
                account.capabilities.executeBlockedReason,
              ];
  if (!capability[0]) {
    throw new Error(capability[1] ?? "This proposal action is unavailable.");
  }
}

function throwForMockTransactionOutcome(outcome: DaoMockTransactionOutcome) {
  if (outcome === "success") return;
  if (outcome === "user-rejected") {
    const error = new Error("User rejected the request.");
    error.name = "UserRejectedRequestError";
    throw error;
  }
  if (outcome === "revert") {
    throw new Error("Mock proposal transaction reverted.");
  }
  throw new Error("Mock proposal transaction failed because of a network issue.");
}

function createIndexedActionEvent(
  current: DaoMockStoreState,
  pending: DaoPendingAction
): DaoProposalEvent {
  const blockNumber = current.feed.canonicalBlock.number + 1n;
  const timestamp = current.feed.canonicalBlock.timestamp;
  const blockHash = deriveDaoMockBlockHash(blockNumber, timestamp);
  return {
    type: pending.action,
    log: {
      blockNumber,
      blockHash,
      timestamp,
      transactionHash: pending.transactionHash,
      transactionIndex: 0,
      logIndex: 0,
    },
    actor: pending.action === "flag" || pending.action === "veto" || pending.action === "retract" ? null : pending.actor,
    yeaBps:
      pending.action === "vote"
        ? pending.direction === "yea"
          ? 10_000
          : 0
        : null,
    direction: pending.action === "vote" ? pending.direction : null,
    weight:
      pending.action === "vote" ? pending.effectiveVotingWeight : null,
    reason:
      pending.action === "flag" || pending.action === "veto"
        ? pending.reason
        : null,
  };
}

export function readDaoMockFeed() {
  return cloneValue(getDaoMockSnapshot().feed);
}

export function readDaoMockProposal(ref: DaoProposalRef): DaoProposalLookup {
  const current = getState();
  const runtime = getProposalRuntimeByRef(current, ref);
  if (runtime) {
    return { state: "found", proposal: cloneValue(runtime.proposal) };
  }
  return {
    state: "not_found",
    ref: cloneValue(ref),
    protocolStatus: "invalid",
    displayStatus: "not_found",
  };
}

export function readDaoMockAccountProposalState(
  ref: DaoProposalRef,
  address: Address
): DaoAccountProposalState {
  const current = getState();
  const runtime = getProposalRuntimeByRef(current, ref);
  if (!runtime) {
    throw new Error(`Unknown DAO proposal ${serializeDaoProposalRef(ref)}.`);
  }
  const weight = deriveDaoVotingWeight({
    votingWeight: current.account.votingWeight,
    now: current.now,
    voteEndsAt: runtime.proposal.voteEndsAt,
    decayLengthSeconds: current.accountDecayLengthSeconds,
  });
  const account = {
    ...cloneValue(current.account),
    ...weight,
    address,
    ...readVoteFacts(current, ref, address),
    isProposer:
      current.account.isProposer &&
      current.account.address.toLowerCase() === address.toLowerCase(),
    isOperator:
      current.account.isOperator &&
      current.account.address.toLowerCase() === address.toLowerCase(),
    isGuardian:
      current.account.isGuardian &&
      current.account.address.toLowerCase() === address.toLowerCase(),
  };
  const capabilities = deriveDaoCapabilities({
    proposal: runtime.proposal,
    account,
    now: current.now,
    vetoEndsAt: runtime.vetoEndsAt,
    executionGuard: current.executionGuard,
  });
  const pendingMatchesProposal =
    current.pendingAction !== null &&
    serializeDaoProposalRef(current.pendingAction.ref) ===
      serializeDaoProposalRef(ref);
  const pendingBlocksAccount =
    pendingMatchesProposal &&
    (current.pendingAction?.action !== "vote" ||
      current.pendingAction.actor.toLowerCase() === address.toLowerCase());
  return {
    ...account,
    capabilities: pendingBlocksAccount
      ? {
          canVote: false,
          votePurpose: null,
          voteBlockedReason:
            current.pendingAction?.action === "vote"
              ? capabilities.voteBlockedReason
              : DAO_BLOCKED_REASONS.awaitingIndex,
          canRetract: false,
          retractBlockedReason:
            DAO_BLOCKED_REASONS.awaitingIndex,
          canFlag: false,
          flagBlockedReason:
            DAO_BLOCKED_REASONS.awaitingIndex,
          canVeto: false,
          vetoBlockedReason:
            DAO_BLOCKED_REASONS.awaitingIndex,
          canExecute: false,
          executeBlockedReason:
            DAO_BLOCKED_REASONS.awaitingIndex,
        }
      : capabilities,
  };
}

export function readDaoMockProposerState(address: Address): DaoProposerState {
  return deriveDaoProposerState({
    ...cloneValue(getState().proposer),
    address,
  });
}

export function createDaoTestBridgeAdapter(): DaoTestBridgeAdapter {
  return {
    resetDao: async () => {
      resetDaoMockStore();
    },
    getDaoState: async () => {
      const current = getDaoMockSnapshot();
      const proposal = current.feed.proposals.find(
        (candidate) => candidate.ref.proposalId === current.selectedProposalId
      );
      if (!proposal) {
        throw new Error("Selected DAO proposal is unavailable.");
      }
      const account = readDaoMockAccountProposalState(
        proposal.ref,
        current.account.address
      );
      return {
        selectedFixtureId: current.selectedFixtureId,
        selectedProposalId: current.selectedProposalId.toString(),
        account: {
          address: account.address,
          connected: account.connected,
          correctChain: account.correctChain,
          isProposer: account.isProposer,
          isOperator: account.isOperator,
          isGuardian: account.isGuardian,
        },
        proposal: {
          type: proposal.type,
          protocolStatus: proposal.protocolStatus,
          displayStatus: proposal.displayStatus,
          contentState: proposal.content.state,
          scriptHashVerified: proposal.script.hashVerified,
          scriptError: proposal.analysis.error,
        },
        capabilities: {
          canVote: account.capabilities.canVote,
          votePurpose: account.capabilities.votePurpose,
          canExecute: account.capabilities.canExecute,
        },
        proposer: {
          expectedVotingEpoch: current.proposer.expectedVotingEpoch.toString(),
          affectedBoostEpochs: current.proposer.affectedBoostEpochs.map(
            ({ epoch, currentProposalCount, proposalLimit }) => ({
              epoch: epoch.toString(),
              currentProposalCount,
              proposalLimit,
            })
          ),
        },
        executionGuard: current.executionGuard,
        canonicalBlock: {
          number: current.feed.canonicalBlock.number.toString(),
          hash: current.feed.canonicalBlock.hash,
          timestamp: current.feed.canonicalBlock.timestamp,
        },
      };
    },
    setDaoFixture: async (fixtureId) => {
      applyDaoMockFixture(fixtureId);
    },
    setDaoSelectedProposal: async (proposalId) => {
      setDaoMockSelectedProposal(proposalId);
    },
    setDaoLoading: async (value) => {
      setDaoMockLoading(value);
    },
    setDaoEmpty: async (value) => {
      setDaoMockEmpty(value);
    },
    setDaoSurface: async (surface) => {
      setDaoMockSurface(surface);
    },
    setDaoPersona: async (persona) => {
      setDaoMockPersona(persona);
    },
    setDaoRole: async (role, enabled) => {
      setDaoMockRole(role, enabled);
    },
    setDaoContentState: async (contentState) => {
      setDaoMockContentState(contentState);
    },
    setDaoLifecycle: async (lifecycle) => {
      setDaoMockLifecycle(lifecycle);
    },
    setDaoVetoState: async (vetoState) => {
      setDaoMockVetoState(vetoState);
    },
    setDaoAnalysisState: async (analysisState) => {
      setDaoMockScriptState(analysisState);
    },
    setDaoAccountState: async (accountState) => {
      setDaoMockAccountState(accountState);
    },
    setDaoAccountWeight: async (weight) => {
      setDaoMockAccountWeight(weight);
    },
    setDaoAlreadyVoted: async (hasVoted, direction) => {
      setDaoMockAlreadyVoted(hasVoted, direction);
    },
    setDaoExecutionState: async (executionState) => {
      setDaoMockExecutionState(executionState);
    },
    setDaoExecutionGuard: async (guard) => {
      setDaoMockExecutionGuard(guard);
    },
    setDaoAuthoringState: async (authoringState) => {
      setDaoMockAuthoringState(authoringState);
    },
    setDaoProposerState: async (proposerState) => {
      setDaoMockProposerState(proposerState);
    },
    setDaoProposalVotes: async (totalWeight, yeaWeight) => {
      setDaoMockProposalVotes(totalWeight, yeaWeight);
    },
    setDaoProposalThreshold: async (thresholdBps) => {
      setDaoMockProposalThreshold(thresholdBps);
    },
    setDaoProposalFlags: async (flags) => {
      setDaoMockProposalFlags(flags);
    },
    setDaoProposalTiming: async (timing) => {
      setDaoMockProposalTiming(timing);
    },
    setDaoProposerWeights: async (currentWeight, minimumWeight) => {
      setDaoMockProposerWeights(currentWeight, minimumWeight);
    },
    setDaoProposerBlacklist: async (blacklisted) => {
      setDaoMockProposerBlacklist(blacklisted);
    },
    setDaoProposerCooldown: async (lastProposedAt, cooldownSeconds) => {
      setDaoMockProposerCooldown(lastProposedAt, cooldownSeconds);
    },
    setDaoProposalCapacity: async (index, count) => {
      setDaoMockProposalCapacity(index, count);
    },
    setDaoTransactionOutcome: async (outcome) => {
      setDaoMockTransactionOutcome(outcome);
    },
    indexDaoPendingAction: async () => {
      indexDaoMockPendingAction();
    },
    clearDaoPendingAction: async () => {
      clearDaoMockPendingAction();
    },
    onSetNow: async (timestamp) => {
      syncDaoMockStoreToNow(timestamp);
    },
  };
}

function daoMockPreparationContext(ref: DaoProposalRef, address: Address): string {
  const current = getState();
  const proposal = current.feed.proposals.find((p) => serializeDaoProposalRef(p.ref) === serializeDaoProposalRef(ref));
  return JSON.stringify([ref, address.toLowerCase(), current.account, current.executionGuard, current.now, proposal],
    (_key, value) => typeof value === "bigint" ? value.toString() : value);
}
