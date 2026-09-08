import type { Address } from "viem";
import type { PreparedTransaction } from "@/lib/tx/types";
import type { DaoClient } from "./client";
import {
  deriveDaoCapabilities,
  deriveDaoProposerState,
  serializeDaoProposalRef,
} from "./domain";
import {
  createDaoMockFeed,
  DAO_MOCK_FIXTURE_IDS,
  getDaoMockFixture,
} from "./fixtures";
import {
  readDaoMockAccountProposalState,
  readDaoMockFeed,
  readDaoMockProposal,
  readDaoMockProposerState,
  prepareDaoMockExecute,
  prepareDaoMockFlag,
  prepareDaoMockRetract,
  prepareDaoMockVeto,
  prepareDaoMockVote,
} from "./store";
import type {
  DaoAccountProposalState,
  DaoSnapshot,
  DaoMockFixture,
  DaoMockFixtureId,
  DaoProposal,
  DaoProposalLookup,
  DaoProposalRef,
  DaoProposerState,
  DaoVoteDirection,
} from "./types";

export type DaoMockFixtureCatalogEntry = {
  id: DaoMockFixtureId;
  label: string;
  proposalRef: DaoProposalRef;
};

export const DAO_SNAPSHOT_CLIENT_READ_ONLY_ERROR =
  "Snapshot DAO mock clients are read-only and cannot prepare transactions.";

/**
 * Immutable fixture reader for deterministic domain snapshots. It implements
 * the shared client shape for read consumers, but deliberately rejects every
 * prepared write because it has no mutable authorization or indexing state.
 */
export class MockDaoClient implements DaoClient {
  private readonly fixtureId: DaoMockFixtureId;
  private readonly latencyMs: number;

  constructor(
    options: { fixtureId?: DaoMockFixtureId; latencyMs?: number } = {}
  ) {
    this.fixtureId = options.fixtureId ?? "voting";
    this.latencyMs = options.latencyMs ?? 250;
  }

  listFixtureCatalog(): DaoMockFixtureCatalogEntry[] {
    return DAO_MOCK_FIXTURE_IDS.map((id) => {
      const fixture = getDaoMockFixture(id);
      return {
        id,
        label: fixture.label,
        proposalRef: { ...fixture.proposalRef },
      };
    });
  }

  getFixture(): DaoMockFixture {
    return structuredClone(getDaoMockFixture(this.fixtureId));
  }

  async getFeed(): Promise<DaoSnapshot> {
    await this.waitForLatency();
    return createDaoMockFeed();
  }

  async getProposal(ref: DaoProposalRef): Promise<DaoProposalLookup> {
    await this.waitForLatency();
    const proposal = findProposal(createDaoMockFeed(), ref);
    if (proposal) return { state: "found", proposal };
    return {
      state: "not_found",
      ref: { ...ref },
      protocolStatus: "invalid",
      displayStatus: "not_found",
    };
  }

  async getAccountProposalState(
    ref: DaoProposalRef,
    address: Address
  ): Promise<DaoAccountProposalState> {
    await this.waitForLatency();
    return createImmutableAccountProposalState(this.fixtureId, ref, address);
  }

  async getProposerState(address: Address): Promise<DaoProposerState> {
    await this.waitForLatency();
    const fixture = getDaoMockFixture(this.fixtureId);
    return deriveDaoProposerState({
      ...structuredClone(fixture.proposer),
      address,
    });
  }

  async prepareVote(
    ref: DaoProposalRef,
    address: Address,
    direction: DaoVoteDirection
  ): Promise<PreparedTransaction> {
    void ref;
    void address;
    void direction;
    await this.waitForLatency();
    return rejectSnapshotClientWrite();
  }

  async prepareRetract(
    ref: DaoProposalRef,
    address: Address
  ): Promise<PreparedTransaction> {
    void ref;
    void address;
    await this.waitForLatency();
    return rejectSnapshotClientWrite();
  }

  async prepareFlag(
    ref: DaoProposalRef,
    address: Address,
    reason: string
  ): Promise<PreparedTransaction> {
    void ref;
    void address;
    void reason;
    await this.waitForLatency();
    return rejectSnapshotClientWrite();
  }

  async prepareVeto(
    ref: DaoProposalRef,
    address: Address,
    reason: string
  ): Promise<PreparedTransaction> {
    void ref;
    void address;
    void reason;
    await this.waitForLatency();
    return rejectSnapshotClientWrite();
  }

  async prepareExecute(
    ref: DaoProposalRef,
    address: Address
  ): Promise<PreparedTransaction> {
    void ref;
    void address;
    await this.waitForLatency();
    return rejectSnapshotClientWrite();
  }

  private async waitForLatency(): Promise<void> {
    if (this.latencyMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}

function rejectSnapshotClientWrite(): never {
  throw new Error(DAO_SNAPSHOT_CLIENT_READ_ONLY_ERROR);
}

function createImmutableAccountProposalState(
  fixtureId: DaoMockFixtureId,
  ref: DaoProposalRef,
  address: Address
): DaoAccountProposalState {
  const proposal = findProposal(createDaoMockFeed(), ref);
  if (!proposal) {
    throw new Error(`Unknown DAO proposal ${serializeDaoProposalRef(ref)}.`);
  }

  const fixture = getDaoMockFixture(fixtureId);
  const sameFixtureActor =
    address.toLowerCase() === fixture.account.address.toLowerCase();
  const account = {
    ...structuredClone(fixture.account),
    address,
    hasVoted: sameFixtureActor && fixture.account.hasVoted,
    voteDirection:
      sameFixtureActor && fixture.account.hasVoted
        ? fixture.account.voteDirection
        : null,
    isProposer: fixture.account.isProposer && sameFixtureActor,
    isOperator: fixture.account.isOperator && sameFixtureActor,
    isGuardian: fixture.account.isGuardian && sameFixtureActor,
  };
  const vetoEndsAt =
    serializeDaoProposalRef(proposal.ref) ===
    serializeDaoProposalRef(fixture.proposalRef)
      ? fixture.vetoEndsAt
      : proposal.executionEndsAt ?? proposal.voteEndsAt + 14 * 86_400;

  return {
    ...account,
    capabilities: deriveDaoCapabilities({
      proposal,
      account,
      now: fixture.now,
      vetoEndsAt,
      executionGuard: fixture.executionGuard,
    }),
  };
}

/** Creates a read-only client over immutable fixture snapshots. */
export function createMockDaoClient(options?: {
  fixtureId?: DaoMockFixtureId;
  latencyMs?: number;
}): MockDaoClient {
  return new MockDaoClient(options);
}

/**
 * Route-facing adapter and the sole mock client with prepared-write support.
 * The instance is safe to cache because every read and write pulls from the
 * mutable DAO runtime store instead of snapshotting a fixture.
 */
export class RuntimeMockDaoClient implements DaoClient {
  private readonly latencyMs: number;

  constructor(options: { latencyMs?: number } = {}) {
    this.latencyMs = options.latencyMs ?? 250;
  }

  async getFeed(): Promise<DaoSnapshot> {
    await this.waitForLatency();
    return readDaoMockFeed();
  }

  async getProposal(ref: DaoProposalRef): Promise<DaoProposalLookup> {
    await this.waitForLatency();
    return readDaoMockProposal(ref);
  }

  async getAccountProposalState(
    ref: DaoProposalRef,
    address: Address
  ): Promise<DaoAccountProposalState> {
    await this.waitForLatency();
    return readDaoMockAccountProposalState(ref, address);
  }

  async getProposerState(address: Address): Promise<DaoProposerState> {
    await this.waitForLatency();
    return readDaoMockProposerState(address);
  }

  async prepareVote(
    ref: DaoProposalRef,
    address: Address,
    direction: DaoVoteDirection
  ): Promise<PreparedTransaction> {
    await this.waitForLatency();
    return prepareDaoMockVote(ref, address, direction);
  }

  async prepareRetract(
    ref: DaoProposalRef,
    address: Address
  ): Promise<PreparedTransaction> {
    await this.waitForLatency();
    return prepareDaoMockRetract(ref, address);
  }

  async prepareFlag(
    ref: DaoProposalRef,
    address: Address,
    reason: string
  ): Promise<PreparedTransaction> {
    await this.waitForLatency();
    return prepareDaoMockFlag(ref, address, reason);
  }

  async prepareVeto(
    ref: DaoProposalRef,
    address: Address,
    reason: string
  ): Promise<PreparedTransaction> {
    await this.waitForLatency();
    return prepareDaoMockVeto(ref, address, reason);
  }

  async prepareExecute(
    ref: DaoProposalRef,
    address: Address
  ): Promise<PreparedTransaction> {
    await this.waitForLatency();
    return prepareDaoMockExecute(ref, address);
  }

  private async waitForLatency(): Promise<void> {
    if (this.latencyMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}

export function createRuntimeMockDaoClient(options?: {
  latencyMs?: number;
}): RuntimeMockDaoClient {
  return new RuntimeMockDaoClient(options);
}

function findProposal(feed: DaoSnapshot, ref: DaoProposalRef): DaoProposal | null {
  const key = serializeDaoProposalRef(ref);
  return (
    feed.proposals.find(
      (proposal) => serializeDaoProposalRef(proposal.ref) === key
    ) ?? null
  );
}
