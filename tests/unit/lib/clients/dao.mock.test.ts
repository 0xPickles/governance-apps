import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  sha256,
  toHex,
  type Address,
} from "viem";
import {
  assertDaoProposalInvariants,
  createMockDaoClient,
  DAO_BLOCKED_REASONS,
  DAO_EMPTY_SCRIPT_HASH,
  DAO_MOCK_ACCOUNT_ADDRESS,
  DAO_MOCK_CURRENT_EPOCH,
  DAO_MOCK_EPOCH_LENGTH_SECONDS,
  DAO_MOCK_EXECUTION_DELAY_SECONDS,
  DAO_MOCK_FEED,
  DAO_MOCK_FEED_JSON,
  DAO_MOCK_FIXTURE_IDS,
  DAO_MOCK_GENESIS,
  DAO_MOCK_NOW,
  DAO_MOCK_VOTE_START_OFFSET_SECONDS,
  DAO_SNAPSHOT_CLIENT_READ_ONLY_ERROR,
  canonicalizeDaoProposalContent,
  createDaoRawSha256Cid,
  deriveDaoProposalContentIdentity,
  deriveDaoProposerState,
  deriveDaoProposalTiming,
  getDaoMockFixture,
  parseDaoBigInt,
  parseDaoFeedJson,
  parseDaoProposalContent,
  serializeDaoFeedJson,
  type DaoSnapshotJson,
  type DaoMockFixtureId,
  type DaoProposalContent,
} from "@/lib/clients/dao";

const requiredFixtures: DaoMockFixtureId[] = [
  "discussion",
  "voting",
  "late-voting",
  "approved-signal",
  "approved-executable",
  "executed",
  "rejected",
  "no-votes",
  "expired",
  "retracted",
  "flagged",
  "early-veto",
  "post-vote-veto",
  "content-unavailable",
  "content-invalid",
  "script-missing",
  "partial-decode",
  "script-malformed",
  "hash-mismatch",
  "direct-proposal",
  "guarded-execution",
  "permissionless-execution",
  "proposal-capacity-full",
];

const CANONICAL_CONTENT_DIGEST =
  "0x3c67b58a3ea4c8fd5d6c9a56dfa7322853967b4b85c700c4592e3cf68bb2f867";
const CANONICAL_CONTENT_CID =
  "bafkreib4m62yupvezd6v23e2k3p2omrikolhws4fy4amiwjoht3ixmxym4";
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function decodeBase32(value: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bufferedBits = 0;

  for (const character of value) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error(`Invalid Base32 character: ${character}`);
    buffer = (buffer << 5) | digit;
    bufferedBits += 5;

    while (bufferedBits >= 8) {
      bufferedBits -= 8;
      bytes.push((buffer >> bufferedBits) & 0xff);
    }
    buffer &= (1 << bufferedBits) - 1;
  }

  return Uint8Array.from(bytes);
}

function decodeRawSha256Cid(cid: string): `0x${string}` {
  if (!cid.startsWith("b")) throw new Error("Expected a Base32 CID.");
  const bytes = decodeBase32(cid.slice(1));
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x01, 0x55, 0x12, 0x20]);
  expect(bytes).toHaveLength(36);
  return toHex(bytes.slice(4));
}

describe("DAO deterministic mock feed", () => {
  it("exposes every required fixture in stable order", () => {
    expect(DAO_MOCK_FIXTURE_IDS).toEqual(requiredFixtures);
    expect(new Set(DAO_MOCK_FIXTURE_IDS).size).toBe(requiredFixtures.length);
  });

  it("keeps every feed proposal inside the domain invariants", () => {
    expect(DAO_MOCK_FEED.schemaVersion).toBe(2);
    expect(DAO_MOCK_FEED.proposals).toHaveLength(22);
    for (const proposal of DAO_MOCK_FEED.proposals) {
      expect(() => assertDaoProposalInvariants(proposal)).not.toThrow();
    }
    const thresholds = new Set(
      DAO_MOCK_FEED.proposals.map((proposal) => proposal.thresholdBps)
    );
    expect(thresholds.size).toBeGreaterThan(1);
  });

  it("uses one coherent 14-day epoch geometry for proposal creation and voting", () => {
    const epochLength = DAO_MOCK_EPOCH_LENGTH_SECONDS;
    const genesisLowerBounds: number[] = [];
    const genesisUpperBounds: number[] = [];
    const votingEpochsByWindow = new Map<string, Set<bigint>>();

    for (const proposal of DAO_MOCK_FEED.proposals) {
      const createdEpoch = Number(proposal.votingEpoch - 1n);
      genesisLowerBounds.push(
        proposal.createdAt - (createdEpoch + 1) * epochLength + 1
      );
      genesisUpperBounds.push(proposal.createdAt - createdEpoch * epochLength);

      const windowKey = `${proposal.voteStartsAt}:${proposal.voteEndsAt}`;
      const epochs = votingEpochsByWindow.get(windowKey) ?? new Set<bigint>();
      epochs.add(proposal.votingEpoch);
      votingEpochsByWindow.set(windowKey, epochs);
    }

    expect(Math.max(...genesisLowerBounds)).toBeLessThanOrEqual(
      Math.min(...genesisUpperBounds)
    );
    for (const epochs of votingEpochsByWindow.values()) {
      expect(epochs.size).toBe(1);
    }

    const discussion = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 1n
    );
    expect(discussion).toBeDefined();
    expect(discussion!.voteStartsAt - discussion!.createdAt).toBeGreaterThanOrEqual(
      epochLength / 2
    );

    for (const proposal of DAO_MOCK_FEED.proposals) {
      const createdEpoch = Math.floor(
        (proposal.createdAt - DAO_MOCK_GENESIS) / epochLength
      );
      expect(proposal.votingEpoch).toBe(BigInt(createdEpoch + 1));
      expect(proposal.voteStartsAt).toBe(
        DAO_MOCK_GENESIS +
          Number(proposal.votingEpoch) * epochLength +
          DAO_MOCK_VOTE_START_OFFSET_SECONDS
      );
      expect(proposal.voteEndsAt).toBe(
        DAO_MOCK_GENESIS +
          (Number(proposal.votingEpoch) + 1) * epochLength
      );
    }

    const expectedAuthoringEpoch = deriveDaoProposalTiming({
      genesis: DAO_MOCK_GENESIS,
      createdAt: DAO_MOCK_NOW,
      epochLengthSeconds: DAO_MOCK_EPOCH_LENGTH_SECONDS,
      voteStartOffsetSeconds: DAO_MOCK_VOTE_START_OFFSET_SECONDS,
      executionDelaySeconds: DAO_MOCK_EXECUTION_DELAY_SECONDS,
    }).votingEpoch;
    expect(expectedAuthoringEpoch).toBe(BigInt(DAO_MOCK_CURRENT_EPOCH + 1));
    expect(getDaoMockFixture("discussion").proposer.expectedVotingEpoch).toBe(
      expectedAuthoringEpoch
    );
  });

  it("pins the early-veto and post-vote-veto distinctions", () => {
    const early = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 12n
    );
    const afterVotes = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 13n
    );

    expect(early).toMatchObject({
      protocolStatus: "vetoed",
      totalWeight: 0n,
    });
    expect(afterVotes).toMatchObject({
      protocolStatus: "vetoed",
      totalWeight: 250n * 10n ** 18n,
    });
    expect(early?.events.at(-1)?.reason).toMatch(/before the first vote/i);
    expect(afterVotes?.events.at(-1)?.reason).toMatch(/after participation/i);
  });

  it("pins lifecycle, timing, and vote distinctions in the selected proposals", () => {
    const byId = new Map(
      DAO_MOCK_FEED.proposals.map((proposal) => [
        proposal.ref.proposalId,
        proposal,
      ])
    );

    expect(byId.get(1n)).toMatchObject({
      createdAt: DAO_MOCK_FEED.canonicalBlock.timestamp,
      protocolStatus: "proposed",
      displayGroup: "upcoming",
      totalWeight: 0n,
    });
    expect(byId.get(2n)?.protocolStatus).toBe("voting");
    expect(byId.get(5n)).toMatchObject({
      protocolStatus: "passed",
      displayStatus: "approved",
      displayGroup: "active",
    });
    expect(byId.get(5n)!.executionStartsAt).toBeGreaterThan(
      DAO_MOCK_FEED.canonicalBlock.timestamp
    );
    expect(byId.get(6n)?.protocolStatus).toBe("executed");
    expect(byId.get(6n)?.events.some((event) => event.type === "execute")).toBe(
      true
    );
    expect(byId.get(7n)).toMatchObject({
      protocolStatus: "failed",
      thresholdBps: 6_000,
      totalWeight: 100n,
      yeaWeight: 49n,
    });
    expect(byId.get(8n)).toMatchObject({
      protocolStatus: "failed",
      totalWeight: 0n,
    });
    expect(byId.get(9n)?.protocolStatus).toBe("expired");
    expect(byId.get(10n)?.protocolStatus).toBe("retracted");
    expect(byId.get(11n)?.moderation.flagReason).toMatch(/malformed/i);
  });

  it("derives a decayed effective weight in the late-voting fixture", () => {
    const late = getDaoMockFixture("late-voting");

    expect(late.account.decayBps).toBeGreaterThan(0);
    expect(late.account.decayBps).toBeLessThan(10_000);
    expect(late.account.effectiveVotingWeight).toBeLessThan(
      late.account.votingWeight
    );
  });

  it("represents terminal signal approval without executable actions", () => {
    const signal = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 4n
    );

    expect(signal).toMatchObject({
      type: "signal",
      protocolStatus: "executed",
      displayStatus: "approved",
      displayGroup: "closed",
      script: {
        bytes: "0x",
        hash: DAO_EMPTY_SCRIPT_HASH,
        hashVerified: true,
      },
    });
  });

  it("keeps content and analysis failure states distinct", () => {
    const byId = new Map(
      DAO_MOCK_FEED.proposals.map((proposal) => [
        proposal.ref.proposalId,
        proposal,
      ])
    );

    expect(byId.get(14n)?.content.state).toBe("unavailable");
    expect(byId.get(14n)?.discussion).toMatchObject({
      state: "verified",
      url: expect.stringContaining("gov.yearn.fi"),
    });
    expect(byId.get(15n)?.content.state).toBe("invalid");
    expect(byId.get(16n)?.script.bytes).toBeNull();
    expect(byId.get(17n)?.analysis.error).toBeNull();
    expect(
      byId.get(17n)?.analysis.calls.map((call) => call.decodeStatus)
    ).toEqual(["unknown", "unknown"]);
    expect(byId.get(18n)?.analysis.error).toMatch(/incomplete/i);
    expect(byId.get(19n)?.script.hashVerified).toBe(false);
    expect(byId.get(20n)?.discussion.state).toBe("unverified");
  });

  it("retains exact raw frames without claiming semantic verification", () => {
    const calls = DAO_MOCK_FEED.proposals.find((p) => p.ref.proposalId === 2n)!.analysis.calls;
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.decodeStatus)).toEqual(["unknown", "unknown"]);
    expect(calls.every((call) => call.verifiedSource === null && call.calldata.startsWith("0x"))).toBe(true);
  });
  it("carries proposal-specific rule snapshots and mutable-fact observation blocks", () => {
    const normal = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 2n
    );
    const alternate = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 7n
    );
    const permissionless = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 22n
    );

    expect(normal?.rules).toMatchObject({
      approvalThresholdBps: 5_000,
      thresholdSnapshottedAtCreation: true,
      minimumTurnout: null,
      passageRequiresPositiveTotal: true,
      executionGuard: "guarded",
      observationBlockNumber: 24_000_000n,
    });
    expect(alternate?.rules.approvalThresholdBps).toBe(6_000);
    expect(permissionless?.rules.executionGuard).toBe("permissionless");
  });

  it("keeps missing event time and transaction availability explicit", () => {
    const direct = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 20n
    );
    const event = direct?.events.find((candidate) => candidate.type === "propose");
    expect(event?.log.timestamp).toBeNull();
    expect(event?.log.transactionHash).toBeNull();

    const canonicalEvents = DAO_MOCK_FEED.proposals
      .filter((proposal) => proposal.ref.proposalId !== 20n)
      .flatMap((proposal) => proposal.events);
    expect(canonicalEvents.every((candidate) => candidate.log.timestamp !== null)).toBe(
      true
    );
  });

  it("keeps every available content CID, digest, and byte sequence consistent", () => {
    const available = DAO_MOCK_FEED.proposals.filter(
      (proposal) => proposal.content.state === "available"
    );

    expect(available.length).toBeGreaterThan(1);
    for (const proposal of available) {
      expect(proposal.content.value).not.toBeNull();
      const bytes = canonicalizeDaoProposalContent(proposal.content.value!);
      expect(sha256(bytes)).toBe(proposal.content.digest);
      expect(decodeRawSha256Cid(proposal.content.cid!)).toBe(
        proposal.content.digest
      );
    }
  });

  it("pins the deterministic asset manifest to exact committed raw bytes", () => {
    const assetBytes = new Uint8Array(
      readFileSync(
        resolve(
          process.cwd(),
          "docs/apps/dao/examples/assets/governance-flow.svg"
        )
      )
    );
    const proposal = DAO_MOCK_FEED.proposals.find(
      (candidate) => candidate.ref.proposalId === 1n
    );
    const manifestAsset = proposal?.content.value?.assets[0];

    expect(manifestAsset).toMatchObject({
      path: "./assets/governance-flow.svg",
      mediaType: "image/svg+xml",
      width: 1_280,
      height: 720,
    });
    expect(manifestAsset?.byteLength).toBe(assetBytes.byteLength);
    expect(manifestAsset?.digest).toBe(sha256(assetBytes));
    expect(createDaoRawSha256Cid(manifestAsset!.digest)).toBe(
      "bafkreiddpbv6fdpnzg5lnxseuuwicjg4en67yzioea3xtws2aoxnq45cbe"
    );
  });

  it("keeps direct raw-CID attachments reachable through a typed fixture", () => {
    const proposal = DAO_MOCK_FEED.proposals.find(
      (candidate) => candidate.ref.proposalId === 2n
    );
    const asset = proposal?.content.value?.assets[0];
    const assetCid = asset ? createDaoRawSha256Cid(asset.digest) : null;

    expect(assetCid).not.toBeNull();
    expect(proposal?.content.value?.markdown).toContain(`ipfs://${assetCid}`);
  });

  it("pins the canonical trailing-LF CIDv1 raw SHA-256 vector", () => {
    const contentBytes = new Uint8Array(
      readFileSync(
        resolve(
          process.cwd(),
          "docs/apps/dao/examples/proposal-content.example.json"
        )
      )
    );

    const content = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(contentBytes)
    ) as DaoProposalContent;
    const identity = deriveDaoProposalContentIdentity(content);

    expect(parseDaoProposalContent(content).errors).toEqual([]);
    expect(canonicalizeDaoProposalContent(content)).toEqual(contentBytes);
    expect(identity.digest).toBe(CANONICAL_CONTENT_DIGEST);
    expect(identity.cid).toBe(CANONICAL_CONTENT_CID);
    expect(sha256(contentBytes)).toBe(CANONICAL_CONTENT_DIGEST);
    expect(decodeRawSha256Cid(CANONICAL_CONTENT_CID)).toBe(
      CANONICAL_CONTENT_DIGEST
    );
  });

  it("round-trips the committed internal mock snapshot (separate from public V2 acceptance)", () => {
    const example = readFileSync(
      resolve(process.cwd(), "docs/apps/dao/examples/mock-data.example.json"),
      "utf8"
    );
    const feed = parseDaoFeedJson(JSON.parse(example) as DaoSnapshotJson);

    expect(feed.proposals).toHaveLength(22);
    expect(feed.proposals[0]?.thresholdBps).toBe(5_000);
    expect(feed.proposals[0]?.rules.approvalThresholdBps).toBe(5_000);
    expect(feed.proposals[0]?.events[0]?.log.timestamp).toBe(1_787_054_400);
  });

  it("retains invalid content as a distinct fixture", () => {
    const invalid = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 15n
    );

    expect(invalid?.content).toMatchObject({
      state: "invalid",
      value: null,
      cid: expect.stringMatching(/^bafk/),
      error: expect.stringMatching(/does not match/i),
    });
  });

  it("retains raw replacement vote events without summing their weights", () => {
    const voting = DAO_MOCK_FEED.proposals.find((p) => p.ref.proposalId === 2n)!;
    const events = voting.events.filter((e) => e.type === "vote");
    expect(events).toHaveLength(6);
    expect(events.map((e) => e.yeaBps)).toEqual([10000, 10000, 10000, 0, 7500, 7500]);
    expect(events.every((e) => !("voteActorKind" in e))).toBe(true);
    expect(voting.totalWeight).toBe(11n * 10n ** 18n);
    expect(events.reduce((sum, e) => sum + e.weight!, 0n)).toBeGreaterThan(voting.totalWeight);
  });
  it("groups each human vote and its aggregate rewrites in one transaction", () => {
    const voting = DAO_MOCK_FEED.proposals.find(
      (proposal) => proposal.ref.proposalId === 2n
    );
    const voteEvents = voting?.events.filter((event) => event.type === "vote") ?? [];
    const transactionGroups = [voteEvents.slice(0, 3), voteEvents.slice(3, 6)];

    expect(voteEvents.map((event) => event.log.logIndex)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(
      transactionGroups.map((group) => group[0]?.log.transactionIndex)
    ).toEqual([1, 2]);
    expect(
      new Set(
        transactionGroups.map((group) => group[0]?.log.transactionHash)
      )
    ).toHaveLength(2);

    for (const group of transactionGroups) {
      expect(group).toHaveLength(3);
      expect(new Set(group.map((event) => event.log.blockNumber))).toHaveLength(1);
      expect(new Set(group.map((event) => event.log.blockHash))).toHaveLength(1);
      expect(new Set(group.map((event) => event.log.timestamp))).toHaveLength(1);
      expect(new Set(group.map((event) => event.log.transactionHash))).toHaveLength(
        1
      );
      expect(new Set(group.map((event) => event.log.transactionIndex))).toHaveLength(
        1
      );
      for (const event of group) {
        expect(event.log.blockNumber).toBeGreaterThan(0n);
        expect(event.log.blockHash).toMatch(/^0x[0-9a-f]{64}$/);
        expect(event.log.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
      }
    }

    expect(
      new Set(
        voteEvents.map(
          (event) =>
            `${event.log.blockHash}:${event.log.transactionHash}:${event.log.transactionIndex}`
        )
      )
    ).toHaveLength(2);
  });

  it("round-trips every bigint through canonical decimal JSON strings", () => {
    const parsed = parseDaoFeedJson(DAO_MOCK_FEED_JSON);

    expect(parsed).toEqual(DAO_MOCK_FEED);
    expect(serializeDaoFeedJson(parsed)).toEqual(DAO_MOCK_FEED_JSON);
    expect(typeof DAO_MOCK_FEED_JSON.proposals[0].ref.proposalId).toBe("string");
    expect(typeof DAO_MOCK_FEED_JSON.proposals[0].events[0].log.blockNumber).toBe(
      "string"
    );
  });

  it("rejects non-canonical bigint JSON syntax", () => {
    for (const value of ["01", "-1", " 1", "1 ", "+1", "1.0", "1e3"]) {
      expect(() => parseDaoBigInt(value)).toThrow(
        /canonical unsigned decimals/i
      );
    }
  });

  it("rejects unvalidated verified-source URLs at the feed boundary", () => {
    const invalid = structuredClone(DAO_MOCK_FEED_JSON);
    invalid.proposals[0].rules.votingSource.url = "ipfs://not-an-https-source";
    expect(() => parseDaoFeedJson(invalid)).toThrow(/complete HTTPS URL/i);
  });
});

describe("MockDaoClient", () => {
  it("returns clones so callers cannot mutate deterministic source fixtures", async () => {
    const client = createMockDaoClient({ latencyMs: 0 });
    const first = await client.getFeed();
    first.proposals[0].content.error = "mutated";

    const second = await client.getFeed();
    expect(second.proposals[0].content.error).toBeNull();
  });

  it("looks proposals up by composite identity, not numeric id alone", async () => {
    const client = createMockDaoClient({ latencyMs: 0 });
    const ref = DAO_MOCK_FEED.proposals[0].ref;

    await expect(client.getProposal(ref)).resolves.toMatchObject({
      state: "found",
      proposal: { ref: { proposalId: ref.proposalId } },
    });
    await expect(
      client.getProposal({ ...ref, chainId: 10 })
    ).resolves.toMatchObject({ state: "not_found" });
    await expect(
      client.getProposal({
        ...ref,
        votingAddress:
          "0x9999999999999999999999999999999999999999" as Address,
      })
    ).resolves.toMatchObject({ state: "not_found" });
  });

  it("derives post-veto participation through the account overlay", async () => {
    const client = createMockDaoClient({
      fixtureId: "post-vote-veto",
      latencyMs: 0,
    });
    const fixture = client.getFixture();

    const state = await client.getAccountProposalState(
      fixture.proposalRef,
      DAO_MOCK_ACCOUNT_ADDRESS
    );

    expect(state.capabilities).toMatchObject({
      canVote: true,
      votePurpose: "participation_only",
    });
  });

  it("keeps guarded and permissionless execution capability distinct", async () => {
    const guarded = createMockDaoClient({
      fixtureId: "guarded-execution",
      latencyMs: 0,
    });
    const guardedFixture = guarded.getFixture();
    const guardedState = await guarded.getAccountProposalState(
      guardedFixture.proposalRef,
      DAO_MOCK_ACCOUNT_ADDRESS
    );
    const guardedOperatorState = await guarded.getAccountProposalState(
      guardedFixture.proposalRef,
      guardedFixture.account.address
    );

    const permissionless = createMockDaoClient({
      fixtureId: "permissionless-execution",
      latencyMs: 0,
    });
    const permissionlessFixture = permissionless.getFixture();
    const permissionlessState = await permissionless.getAccountProposalState(
      permissionlessFixture.proposalRef,
      permissionlessFixture.account.address
    );

    expect(guardedState.capabilities.executeBlockedReason).toBe(
      DAO_BLOCKED_REASONS.guardedExecution
    );
    expect(guardedOperatorState.capabilities.canExecute).toBe(true);
    expect(permissionlessState.capabilities.canExecute).toBe(true);
  });

  it.each([
    ["vote", "voting"],
    ["retract", "discussion"],
    ["flag", "discussion"],
    ["veto", "discussion"],
    ["execute", "permissionless-execution"],
  ] as const)(
    "rejects snapshot %s preparation with the stable read-only error",
    async (action, fixtureId) => {
      const client = createMockDaoClient({ fixtureId, latencyMs: 0 });
      const fixture = client.getFixture();
      const preparation =
        action === "vote"
          ? client.prepareVote(
              fixture.proposalRef,
              fixture.account.address,
              "yea"
            )
          : action === "retract"
            ? client.prepareRetract(
                fixture.proposalRef,
                fixture.account.address
              )
            : action === "flag"
              ? client.prepareFlag(
                  fixture.proposalRef,
                  fixture.account.address,
                  "é".repeat(129)
                )
              : action === "veto"
                ? client.prepareVeto(
                    fixture.proposalRef,
                    fixture.account.address,
                    " "
                  )
                : client.prepareExecute(
                    fixture.proposalRef,
                    fixture.account.address
                  );

      await expect(preparation).rejects.toThrow(
        DAO_SNAPSHOT_CLIENT_READ_ONLY_ERROR
      );
    }
  );

  it("reports shared proposal capacity from all six affected epochs", async () => {
    const client = createMockDaoClient({
      fixtureId: "proposal-capacity-full",
      latencyMs: 0,
    });

    const state = await client.getProposerState(DAO_MOCK_ACCOUNT_ADDRESS);

    expect(state.affectedBoostEpochs).toHaveLength(6);
    expect(state.affectedBoostEpochs.some((epoch) => epoch.currentProposalCount === 64)).toBe(
      true
    );
    expect(state.canPropose).toBe(false);
    expect(state.proposeBlockedReason).toBe(
      DAO_BLOCKED_REASONS.proposerCapacity
    );
    expect(deriveDaoProposerState(getDaoMockFixture("discussion").proposer).canPropose).toBe(
      true
    );
  });
});
