import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { keccak256, sha256, type Address, type Hex } from "viem";
import feedExample from "@/docs/apps/dao/examples/feed-v1/dao-feed-v1.example.json";
import identityStages from "@/docs/apps/dao/examples/feed-v1/dao-creation-stages-v1.example.json";
import mockStateMap from "@/docs/apps/dao/examples/feed-v1/dao-mock-state-map-v1.example.json";
import rejectionVectors from "@/docs/apps/dao/examples/feed-v1/dao-feed-v1.rejections.json";
import jsonSchema from "@/docs/apps/dao/feed-schema-v1.schema.json";
import {
  canonicalizeDaoProposalContent,
  createDaoRawSha256Cid,
} from "@/lib/clients/dao/content";
import {
  DAO_MOCK_FEED,
  getDaoMockFixture,
} from "@/lib/clients/dao/fixtures";
import {
  DAO_CREATION_IDENTITY_STAGES_V1_EXAMPLE,
  createDaoFeedV1Example,
} from "@/tests/fixtures/dao-feed-v1";
import type {
  DaoMockFixtureId,
  DaoProposalContent,
} from "@/lib/clients/dao/types";
import {
  DAO_FEED_EPOCH_LENGTH_SECONDS,
  DAO_FEED_LIFECYCLE_EVENT_TOPICS,
  DAO_FEED_SCHEMA_ID,
  DAO_FEED_SCHEMA_VERSION,
  DaoCreationIdentityStageV1Schema,
  DaoFeedV1Schema,
  createDaoFeedEventId,
  encodeDaoFeedLifecycleEventAbi,
  parseDaoCreationIdentityStageV1,
  parseDaoFeedJsonV1,
  parseDaoFeedV1,
  safeParseDaoFeedV1,
} from "@/lib/schemas/dao-feed";
import { z } from "@/lib/schemas/zod";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const EXPECTED_MOCK_STATES = [
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
  "analysis-pending",
  "partial-decode",
  "simulation-failed",
  "hash-mismatch",
  "direct-proposal",
  "guarded-execution",
  "permissionless-execution",
  "proposal-capacity-full",
] as const;

const PINNED_CONTRACT_COMMIT =
  "9395d5e6fffdfe21fda32af94d32fca1a4f7840b";
const EMPTY_SCRIPT_HASH =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";

function cloneFeed(): JsonValue {
  return structuredClone(feedExample) as JsonValue;
}

function setAtPath(root: JsonValue, path: readonly (string | number)[], value: JsonValue) {
  let cursor = root;
  for (const segment of path.slice(0, -1)) {
    if (typeof segment === "number") {
      if (!Array.isArray(cursor)) throw new Error("Expected an array path segment.");
      cursor = cursor[segment] as JsonValue;
    } else {
      if (cursor === null || Array.isArray(cursor) || typeof cursor !== "object") {
        throw new Error("Expected an object path segment.");
      }
      cursor = cursor[segment] as JsonValue;
    }
  }

  const finalSegment = path.at(-1);
  if (finalSegment === undefined) throw new Error("Mutation paths cannot be empty.");
  if (typeof finalSegment === "number") {
    if (!Array.isArray(cursor)) throw new Error("Expected an array mutation target.");
    cursor[finalSegment] = value;
  } else {
    if (cursor === null || Array.isArray(cursor) || typeof cursor !== "object") {
      throw new Error("Expected an object mutation target.");
    }
    cursor[finalSegment] = value;
  }
}

function expectRejected(
  mutate: (feed: JsonValue) => void,
  message: RegExp
): void {
  const feed = cloneFeed();
  mutate(feed);
  const result = DaoFeedV1Schema.safeParse(feed);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.message).join("\n")).toMatch(
      message
    );
  }
}

function getAtPath(
  root: JsonValue,
  path: readonly (string | number)[]
): JsonValue {
  let cursor = root;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(cursor)) throw new Error("Expected an array path segment.");
      cursor = cursor[segment] as JsonValue;
    } else {
      if (cursor === null || Array.isArray(cursor) || typeof cursor !== "object") {
        throw new Error("Expected an object path segment.");
      }
      cursor = cursor[segment] as JsonValue;
    }
  }
  return cursor;
}

function expectFeedRejected(feed: JsonValue, message: RegExp): void {
  const result = DaoFeedV1Schema.safeParse(feed);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.message).join("\n")).toMatch(
      message
    );
  }
}

function keepOnlyProposal(feed: JsonValue, proposalIndex: number): void {
  const proposal = structuredClone(
    getAtPath(feed, ["proposals", proposalIndex])
  );
  const events = getAtPath(feed, ["proposals", proposalIndex, "events"]);
  if (!Array.isArray(events)) throw new Error("Expected proposal events.");
  setAtPath(feed, ["proposals"], [proposal]);
  setAtPath(feed, ["publication", "counts", "proposals"], 1);
  setAtPath(feed, ["publication", "counts", "events"], events.length);
}

function recordAt(
  root: JsonValue,
  path: readonly (string | number)[]
): Record<string, JsonValue> {
  const value = getAtPath(root, path);
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Expected object at ${path.join(".")}.`);
  }
  return value;
}

function rebindAvailableContent(feed: JsonValue, proposalIndex: number): void {
  const proposal = getAtPath(feed, ["proposals", proposalIndex]) as Record<
    string,
    JsonValue
  >;
  const content = proposal.content as Record<string, JsonValue>;
  const value = content.value as unknown as DaoProposalContent;
  const canonicalJson = new TextDecoder().decode(
    canonicalizeDaoProposalContent(value)
  );
  const digest = sha256(new TextEncoder().encode(canonicalJson));
  content.canonicalJson = canonicalJson;
  content.byteLength = new TextEncoder().encode(canonicalJson).byteLength;
  content.expectedDigest = digest;
  content.expectedCid = createDaoRawSha256Cid(digest);
  content.computedDigest = digest;
  content.computedCid = createDaoRawSha256Cid(digest);
  content.digestComparison = "verified";

  const propose = (proposal.events as JsonValue[]).find(
    (candidate) =>
      !Array.isArray(candidate) &&
      candidate !== null &&
      typeof candidate === "object" &&
      candidate.type === "propose"
  ) as Record<string, JsonValue> | undefined;
  if (!propose) throw new Error("Expected a Propose event.");
  const data = propose.data as Record<string, JsonValue>;
  data.contentDigest = digest;
  if (typeof data.script === "string") {
    const ref = proposal.ref as Record<string, JsonValue>;
    const raw = encodeDaoFeedLifecycleEventAbi({
      type: "propose",
      votingAddress: ref.votingAddress as Address,
      proposalId: BigInt(ref.proposalId as string),
      proposer: proposal.proposer as Address,
      votingEpoch: BigInt(proposal.votingEpoch as string),
      contentDigest: digest,
      script: data.script as Hex,
    });
    const abi = data.abi as Record<string, JsonValue>;
    abi.topics = raw.topics;
    abi.data = raw.data;
  }
}

function rebindVoteAbi(
  feed: JsonValue,
  proposalIndex: number,
  eventIndex: number
): void {
  const proposal = getAtPath(feed, ["proposals", proposalIndex]) as Record<
    string,
    JsonValue
  >;
  const event = getAtPath(feed, [
    "proposals",
    proposalIndex,
    "events",
    eventIndex,
  ]) as Record<string, JsonValue>;
  const ref = proposal.ref as Record<string, JsonValue>;
  const actor = event.actor as Record<string, JsonValue>;
  const data = event.data as Record<string, JsonValue>;
  const raw = encodeDaoFeedLifecycleEventAbi({
    type: "vote",
    votingAddress: ref.votingAddress as Address,
    proposalId: BigInt(ref.proposalId as string),
    account: actor.address as Address,
    weight: BigInt(data.weight as string),
    yeaBps: BigInt(data.yeaBps as number),
  });
  const abi = data.abi as Record<string, JsonValue>;
  abi.topics = raw.topics;
  abi.data = raw.data;
}

function rebindProposeAbi(feed: JsonValue, proposalIndex: number): void {
  const proposal = getAtPath(feed, ["proposals", proposalIndex]) as Record<
    string,
    JsonValue
  >;
  const events = proposal.events as JsonValue[];
  const propose = events.find(
    (candidate) =>
      candidate !== null &&
      !Array.isArray(candidate) &&
      typeof candidate === "object" &&
      candidate.type === "propose"
  ) as Record<string, JsonValue> | undefined;
  if (!propose) throw new Error("Expected a Propose event.");
  const data = propose.data as Record<string, JsonValue>;
  const ref = proposal.ref as Record<string, JsonValue>;
  const raw = encodeDaoFeedLifecycleEventAbi({
    type: "propose",
    votingAddress: ref.votingAddress as Address,
    proposalId: BigInt(ref.proposalId as string),
    proposer: proposal.proposer as Address,
    votingEpoch: BigInt(proposal.votingEpoch as string),
    contentDigest: data.contentDigest as Hex,
    script: data.script as Hex,
  });
  const abi = data.abi as Record<string, JsonValue>;
  abi.topics = raw.topics;
  abi.data = raw.data;
}

function rebindReasonAbi(
  feed: JsonValue,
  proposalIndex: number,
  eventIndex: number,
  type: "flag" | "veto"
): void {
  const proposal = getAtPath(feed, ["proposals", proposalIndex]) as Record<
    string,
    JsonValue
  >;
  const event = getAtPath(feed, [
    "proposals",
    proposalIndex,
    "events",
    eventIndex,
  ]) as Record<string, JsonValue>;
  const ref = proposal.ref as Record<string, JsonValue>;
  const data = event.data as Record<string, JsonValue>;
  const raw = encodeDaoFeedLifecycleEventAbi({
    type,
    votingAddress: ref.votingAddress as Address,
    proposalId: BigInt(ref.proposalId as string),
    reason: data.reason as string,
  });
  const abi = data.abi as Record<string, JsonValue>;
  abi.topics = raw.topics;
  abi.data = raw.data;
}

function rebindExecuteAbi(
  feed: JsonValue,
  proposalIndex: number,
  eventIndex: number
): void {
  const proposal = getAtPath(feed, ["proposals", proposalIndex]) as Record<
    string,
    JsonValue
  >;
  const event = getAtPath(feed, [
    "proposals",
    proposalIndex,
    "events",
    eventIndex,
  ]) as Record<string, JsonValue>;
  const ref = proposal.ref as Record<string, JsonValue>;
  const actor = event.actor as Record<string, JsonValue>;
  const data = event.data as Record<string, JsonValue>;
  const abi = data.abi as Record<string, JsonValue>;
  const raw = encodeDaoFeedLifecycleEventAbi({
    type: "execute",
    votingAddress: ref.votingAddress as Address,
    proposalId: BigInt(ref.proposalId as string),
    executionCaller: actor.address as Address,
  });
  abi.topics = raw.topics;
  abi.data = raw.data;
}

describe("DaoFeedV1Schema structural contract", () => {
  it("accepts the complete committed v1 payload through the unknown-input boundary", () => {
    const parsed = parseDaoFeedV1(feedExample);

    expect(parsed.schemaVersion).toBe(DAO_FEED_SCHEMA_VERSION);
    expect(parsed.schemaId).toBe(DAO_FEED_SCHEMA_ID);
    expect(parsed.chainId).toBe(1);
    expect(parsed.contracts).not.toHaveLength(0);
    expect(parsed.proposals).not.toHaveLength(0);
    expect(parsed.publication.mode).toBe("atomic_snapshot");
    expect(parsed.publication.counts.proposals).toBe(parsed.proposals.length);
    expect(parsed.publication.counts.events).toBe(
      parsed.proposals.reduce((sum, proposal) => sum + proposal.events.length, 0)
    );
  });

  it("publishes a draft-2020-12 JSON Schema with the same root identity", () => {
    expect(jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: DAO_FEED_SCHEMA_ID,
      title: "Yearn DAO feed v1",
      type: "object",
      additionalProperties: false,
    });
    expect(jsonSchema.required).toEqual(
      expect.arrayContaining([
        "schemaId",
        "schemaVersion",
        "chainId",
        "generatedAt",
        "publication",
        "canonicalBlock",
        "contracts",
        "proposals",
      ])
    );
    expect(jsonSchema["x-semantic-validator"]).toBe(
      "lib/schemas/dao-feed.ts#parseDaoFeedJsonV1"
    );
  });

  it("keeps the committed JSON Schema structurally identical to the Zod input boundary", () => {
    const generated = z.toJSONSchema(DaoFeedV1Schema, {
      target: "draft-2020-12",
      io: "input",
    }) as Record<string, unknown>;
    const committed = structuredClone(jsonSchema) as Record<string, unknown>;
    for (const key of [
      "$id",
      "title",
      "description",
      "x-semantic-validator",
      "x-semantic-invariants",
    ]) {
      delete generated[key];
      delete committed[key];
    }
    expect(committed).toEqual(generated);
  });

  it("keeps committed accepted payloads byte-structurally aligned with the generator", () => {
    expect(feedExample).toEqual(createDaoFeedV1Example());
    expect(identityStages).toEqual(DAO_CREATION_IDENTITY_STAGES_V1_EXAMPLE);
  });

  it("rejects unknown fields at every security-sensitive boundary", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "cursor", "producerGuess"], true);
    }, /unrecognized key/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "rules", "quorumBps"], 1);
    }, /unrecognized key/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "creation", "guessedProposalId"], "2");
    }, /unrecognized key/i);
  });

  it("runs every committed negative fixture through semantic validation", () => {
    expect(rejectionVectors.length).toBeGreaterThanOrEqual(16);
    for (const vector of rejectionVectors) {
      const feed = cloneFeed();
      setAtPath(feed, vector.path, vector.value as JsonValue);
      const result = DaoFeedV1Schema.safeParse(feed);
      expect(result.success, vector.name).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.map((issue) => issue.message).join("\n"),
          vector.name
        ).toContain(vector.expectedMessage);
      }
    }
  });
});

describe("DaoFeedV1Schema publication and contract semantics", () => {
  it("binds the cursor, finality, counts, and atomic publication metadata", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const through = BigInt(parsed.publication.cursor.lastBlockNumber);
    const next = BigInt(parsed.publication.cursor.nextBlockNumber);
    const head = BigInt(parsed.publication.finality.headBlock.number);

    expect(parsed.publication.cursor.chainId).toBe(parsed.chainId);
    expect(parsed.publication.cursor.lastBlockHash).toBe(
      parsed.canonicalBlock.hash
    );
    expect(through).toBe(BigInt(parsed.canonicalBlock.number));
    expect(next).toBe(through + 1n);
    expect(parsed.publication.finality.observedConfirmations).toBe(
      Number(head - through)
    );
    expect(parsed.publication.finality.observedConfirmations).toBeGreaterThanOrEqual(
      parsed.publication.finality.requiredConfirmations
    );
    expect(parsed.publication.finality.requiredConfirmations).toBe(8);
    expect(parsed.publication.retention.eventScripts).toBe("indefinite");
    expect(parsed.publication.retention.rawContentBytes).toBe("indefinite");
    expect(parsed.publication.atomicity).toMatchObject({
      localWrite: "temp_then_rename",
      remoteWrite: "immutable_then_stable_put",
      singleWriter: true,
      retainLastGood: true,
    });
  });

  it("rejects cursors, confirmation claims, retry states, and reorg records that disagree", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "cursor", "nextBlockNumber"], "24000009");
    }, /next block/i);
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "finality", "observedConfirmations"], 99);
    }, /observed confirmations/i);
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "retry", "nextRetryAt"], "2026-08-18T12:01:00Z");
    }, /expected null/i);
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "reorg"], {
        state: "recovered",
        replayFromBlock: "24000000",
        commonAncestor: {
          number: "23999999",
          hash: `0x${"ee".repeat(32)}`,
          timestamp: 1_787_054_388,
        },
        replacedSnapshotId: "dao-mainnet-23999999-replaced",
      });
    }, /recovered reorg/i);
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "counts", "events"], 999);
    }, /event count/i);
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "atomicity", "retainLastGood"], false);
    }, /expected true/i);
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "publishedAt"], "2026-08-18T12:00:00Z");
    }, /generation and publication timestamp|confirmation-head/i);
  });

  it("accepts exact recovered-reorg and successful-publication-retry records", () => {
    const recovered = cloneFeed();
    setAtPath(recovered, ["publication", "previousSnapshotId"], "dao-mainnet-23999999-old");
    setAtPath(recovered, ["publication", "reorg"], {
      state: "recovered",
      replayFromBlock: "24000000",
      commonAncestor: {
        number: "23999999",
        hash: `0x${"ee".repeat(32)}`,
        timestamp: 1_787_054_388,
      },
      replacedSnapshotId: "dao-mainnet-23999999-old",
    });
    expect(DaoFeedV1Schema.safeParse(recovered).success).toBe(true);

    const retried = cloneFeed();
    setAtPath(retried, ["publication", "previousSnapshotId"], "dao-mainnet-23999999-old");
    setAtPath(retried, ["publication", "retry"], {
      state: "succeeded_after_retry",
      attempt: 2,
      maxAttempts: 16,
      lastAttemptAt: "2026-08-18T12:02:00Z",
      policy: "fixed_120_seconds",
      lastFailure: {
        code: "R2_STABLE_PUT_FAILED",
        message: "The preceding stable-object publication failed.",
        retryable: true,
        observedAt: "2026-08-18T12:00:00Z",
        source: "publication",
      },
      nextRetryAt: null,
      backoffSeconds: 120,
    });
    expect(DaoFeedV1Schema.safeParse(retried).success).toBe(true);

    setAtPath(
      retried,
      ["publication", "retry", "lastFailure", "retryable"],
      false
    );
    expectFeedRejected(retried, /preceding publication failure.*retryable/i);
  });

  it("requires unique ordered contract generations and producer start blocks", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const generations = parsed.contracts.map((contract) =>
      BigInt(contract.generation)
    );
    expect(generations).toEqual([...generations].sort((a, b) => (a < b ? -1 : 1)));
    expect(parsed.contracts.filter((contract) => contract.active)).toHaveLength(1);
    for (const contract of parsed.contracts) {
      expect(BigInt(contract.startBlock)).toBeGreaterThanOrEqual(
        BigInt(contract.deploymentBlock.number)
      );
      expect(contract.source.revision).toBe(PINNED_CONTRACT_COMMIT);
      expect(contract.source.sourcePath).toBe("contracts/governance/Voting.vy");
    }
  });

  it("rejects contract generation, address, block, and source inconsistencies", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["contracts", 0, "generation"], "0");
    }, /generation/i);
    expectRejected((feed) => {
      setAtPath(feed, ["contracts", 0, "startBlock"], "23899999");
    }, /start block/i);
    expectRejected((feed) => {
      setAtPath(feed, ["contracts", 0, "source", "revision"], "main");
    }, /exact pinned voting github blob url/i);
    expectRejected((feed) => {
      setAtPath(feed, ["contracts", 0, "source", "url"], "https://user@example.com/source");
    }, /credentials/i);
  });
});

describe("DaoFeedV1Schema proposal identities and rules", () => {
  it("binds proposal and vote behavior to ordered same-Voting configuration history", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const contract = parsed.contracts[0];
    expect(contract?.epochLengthSeconds).toBe(DAO_FEED_EPOCH_LENGTH_SECONDS);
    expect(contract?.configurationHistory.length).toBeGreaterThanOrEqual(2);
    expect(new Set(contract?.configurationHistory.map((entry) => entry.voterAddress)).size)
      .toBeGreaterThanOrEqual(2);
    expect(new Set(contract?.configurationHistory.map((entry) => entry.executorAddress)).size)
      .toBeGreaterThanOrEqual(2);
    expect(new Set(contract?.configurationHistory.map((entry) => entry.voteStartOffsetSeconds)).size)
      .toBeGreaterThanOrEqual(2);
    expect(new Set(contract?.configurationHistory.map((entry) => entry.votingPeriodSeconds)).size)
      .toBeGreaterThanOrEqual(2);
    for (const field of [
      "executionDelaySeconds",
      "executionGuard",
      "votingHookAddress",
      "operatorAddress",
      "guardianAddress",
    ] as const) {
      expect(
        new Set(contract?.configurationHistory.map((entry) => entry[field]))
          .size
      ).toBeGreaterThanOrEqual(2);
    }

    const changed = parsed.proposals.find(
      (proposal) => proposal.rules.mutableConfiguration.configurationId === "config-2"
    );
    expect(changed).toBeDefined();
    expect(changed?.rules.mutableConfiguration.executorAddress).toBe(
      contract?.configurationHistory[1]?.executorAddress
    );
    for (const vote of changed?.events.filter((event) => event.type === "vote") ?? []) {
      expect(vote.data.classification.configurationId).toBe("config-2");
      expect(vote.data.classification.voterAddress).toBe(
        contract?.configurationHistory[1]?.voterAddress
      );
    }
    const changedSimulation = parsed.proposals.find(
      (proposal) =>
        proposal.rules.mutableConfiguration.configurationId === "config-2" &&
        proposal.analysis.proposalSimulation.state === "succeeded"
    )?.analysis.proposalSimulation;
    expect(changedSimulation?.executorAddress).toBe(
      contract?.configurationHistory[1]?.executorAddress
    );

    expectRejected((feed) => {
      setAtPath(
        feed,
        ["contracts", 0, "configurationHistory", 1, "voterAddress"],
        "0x7777777777777777777777777777777777777777"
      );
    }, /effective historical configuration/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "rules", "mutableConfiguration", "voteStartOffsetSeconds"],
        604_700
      );
    }, /epoch formula|effective historical configuration/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["contracts", 0, "configurationHistory", 1, "effectiveAt", "blockHash"],
        `0x${"ab".repeat(32)}`
      );
    }, /configuration.*block hash.*lifecycle provenance/i);
  });

  it("pins genesis and enforces the fixed epoch schedule formulas", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const contract = parsed.contracts[0]!;
    expect(contract.genesisTimestamp).toBe(1_543_946_400);
    expect(contract.epochLengthSeconds).toBe(1_209_600);
    for (const proposal of parsed.proposals) {
      const config = contract.configurationHistory.find(
        (entry) =>
          entry.configurationId === proposal.statusConfiguration.configurationId
      )!;
      expect(proposal.voteStartsAt).toBe(
        contract.genesisTimestamp +
          Number(BigInt(proposal.votingEpoch)) * contract.epochLengthSeconds +
          config.voteStartOffsetSeconds
      );
      expect(proposal.voteEndsAt).toBe(
        proposal.voteStartsAt + config.votingPeriodSeconds
      );
    }
    expectRejected((feed) => {
      setAtPath(feed, ["contracts", 0, "genesisTimestamp"], 1_543_946_401);
    }, /epoch formula|snapshot-effective|Pinned Voter semantics/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["contracts", 0, "configurationHistory", 0, "votingPeriodSeconds"],
        604_799
      );
    }, /vote-start offset.*voting window.*fixed epoch/i);
  });

  it("retains 5,000 and 6,000 basis-point proposal snapshots", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const thresholds = new Set(
      parsed.proposals.map((proposal) => proposal.rules.approvalThresholdBps)
    );
    expect(thresholds).toContain(5_000);
    expect(thresholds).toContain(6_000);
    for (const proposal of parsed.proposals) {
      expect(proposal.rules.minimumTurnout).toBeNull();
      expect(proposal.rules.passageRequiresPositiveTotal).toBe(true);
      expect(proposal.rules.thresholdSnapshottedAtCreation).toBe(true);
    }
  });

  it("rejects composite identity, generation, rule, and timestamp substitutions", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "ref", "chainId"], 10);
    }, /feed chain/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "ref", "votingAddress"],
        "0x9999999999999999999999999999999999999999"
      );
    }, /contract generation/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "rules", "approvalThresholdBps"], 6_000);
    }, /snapshotted threshold/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "rules", "proposalType"], "executable");
    }, /proposal type/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        [
          "proposals",
          0,
          "rules",
          "mutableConfiguration",
          "votingPeriodSeconds",
        ],
        604_799
      );
    }, /effective historical configuration|voting period/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "chainCreatedAt", "timestamp"],
        1_787_054_401
      );
    }, /chain creation time|Propose block timestamp/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "rules", "mutableConfiguration", "voteStartOffsetSeconds"],
        604_799
      );
    }, /epoch formula|effective historical configuration/i);
    expectRejected((feed) => {
      const proposeLog = getAtPath(feed, ["proposals", 0, "events", 0, "log"]);
      if (proposeLog === null || Array.isArray(proposeLog) || typeof proposeLog !== "object") {
        throw new Error("Expected the Propose log.");
      }
      setAtPath(
        feed,
        ["proposals", 0, "rules", "mutableConfiguration", "observedAt"],
        {
          blockNumber: proposeLog.blockNumber,
          blockHash: `0x${"dd".repeat(32)}`,
          transactionIndex: 0,
          logIndex: 0,
        }
      );
    }, /rule observation block hash/i);
  });

  it("rejects invalid feed histories and display projections", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "totalWeight"], "1");
    }, /vote totals/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "protocolStatus"], "voting");
    }, /protocol status/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "displayGroup"], "active");
    }, /display group/i);
  });

  it("represents signal raw EXECUTED status without inventing a Voting Execute event", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const signal = parsed.proposals.find(
      (proposal) =>
        proposal.type === "signal" && proposal.protocolStatus === "executed"
    );
    expect(signal).toBeDefined();
    expect(signal?.displayStatus).toBe("approved");
    expect(signal?.events.some((event) => event.type === "execute")).toBe(false);

    const followingEpoch = cloneFeed();
    const signalIndex = feedExample.proposals.findIndex(
      (proposal) => proposal.ref.proposalId === "4"
    );
    const selected = structuredClone(
      getAtPath(followingEpoch, ["proposals", signalIndex])
    );
    setAtPath(followingEpoch, ["proposals"], [selected]);
    setAtPath(followingEpoch, ["publication", "counts", "proposals"], 1);
    setAtPath(
      followingEpoch,
      ["publication", "counts", "events"],
      feedExample.proposals[signalIndex]!.events.length
    );
    const epochStart =
      feedExample.contracts[0]!.genesisTimestamp +
      (Number(feedExample.proposals[signalIndex]!.votingEpoch) + 1) *
        DAO_FEED_EPOCH_LENGTH_SECONDS;
    setAtPath(followingEpoch, ["canonicalBlock", "timestamp"], epochStart + 100);
    setAtPath(
      followingEpoch,
      ["publication", "finality", "headBlock", "timestamp"],
      epochStart + 196
    );
    setAtPath(followingEpoch, ["proposals", 0, "protocolStatus"], "passed");
    expect(DaoFeedV1Schema.safeParse(followingEpoch).success).toBe(true);
  });
});

describe("DaoFeedV1Schema content and script integrity", () => {
  it("retains expected and computed content identities for digest-invalid bytes", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const invalid = parsed.proposals.find(
      (proposal) => proposal.content.state === "invalid" &&
        proposal.content.digestComparison === "mismatch"
    );
    expect(invalid?.content.canonicalJson).toBeNull();
    expect(invalid?.content.rawBytesBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(invalid?.content.expectedDigest).not.toBe(
      invalid?.content.computedDigest
    );
    expect(invalid?.content.expectedCid).not.toBe(invalid?.content.computedCid);
    expectRejected((feed) => {
      const candidate = getAtPath(feed, ["proposals", 14, "content", "computedDigest"]);
      setAtPath(feed, ["proposals", 14, "content", "expectedDigest"], candidate);
    }, /digest comparison|Propose event content digest/i);
    expectRejected((feed) => {
      const digest = getAtPath(
        feed,
        ["proposals", 14, "content", "computedDigest"]
      );
      const cid = getAtPath(
        feed,
        ["proposals", 14, "content", "computedCid"]
      );
      setAtPath(feed, ["proposals", 14, "content", "expectedDigest"], digest);
      setAtPath(feed, ["proposals", 14, "content", "expectedCid"], cid);
      setAtPath(feed, ["proposals", 14, "content", "digestComparison"], "verified");
      setAtPath(
        feed,
        ["proposals", 14, "events", 0, "data", "contentDigest"],
        digest
      );
      rebindProposeAbi(feed, 14);
    }, /CONTENT_DIGEST_MISMATCH.*only represent.*mismatch/i);
  });

  it("preserves a contract-valid zero content digest when bytes are unavailable", () => {
    const feed = cloneFeed();
    const proposalIndex = feedExample.proposals.findIndex(
      (proposal) => proposal.content.state === "unavailable"
    );
    const zeroDigest = `0x${"00".repeat(32)}`;
    setAtPath(feed, ["proposals", proposalIndex, "content", "expectedDigest"], zeroDigest);
    setAtPath(
      feed,
      ["proposals", proposalIndex, "content", "expectedCid"],
      createDaoRawSha256Cid(zeroDigest as Hex)
    );
    setAtPath(
      feed,
      ["proposals", proposalIndex, "events", 0, "data", "contentDigest"],
      zeroDigest
    );
    rebindProposeAbi(feed, proposalIndex);
    const result = DaoFeedV1Schema.safeParse(feed);
    expect(
      result.success,
      result.success
        ? undefined
        : result.error.issues.map((issue) => issue.message).join("\n")
    ).toBe(true);
  });

  it("retains exact canonical JSON bytes, final LF, digest, CID, and both attachment forms", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const relative = parsed.proposals.find(
      (proposal) => proposal.ref.proposalId === "1"
    );
    const direct = parsed.proposals.find(
      (proposal) => proposal.ref.proposalId === "2"
    );
    expect(relative?.content.state).toBe("available");
    expect(direct?.content.state).toBe("available");
    if (relative?.content.state !== "available" || direct?.content.state !== "available") {
      throw new Error("Expected the attachment examples to be available.");
    }

    expect(
      Math.floor(Date.parse(relative.content.value.createdAt) / 1_000)
    ).not.toBe(
      relative.chainCreatedAt.state === "available"
        ? relative.chainCreatedAt.timestamp
        : null
    );
    expect(relative.content.canonicalJson.endsWith("\n")).toBe(true);
    expect(relative.content.canonicalJson.endsWith("\n\n")).toBe(false);
    expect(sha256(new TextEncoder().encode(relative.content.canonicalJson))).toBe(
      relative.content.expectedDigest
    );
    expect(relative.content.value.markdown).toContain("./assets/governance-flow.svg");
    expect(direct.content.value.markdown).toContain("ipfs://bafkrei");
    expect(relative.content.value.assets[0]?.digest).toBe(
      direct.content.value.assets[0]?.digest
    );
    expect(relative.content.attachmentRecords[0]).toMatchObject({
      kind: "relative_manifest_path",
      target: "./assets/governance-flow.svg",
      manifestPath: "./assets/governance-flow.svg",
    });
    expect(direct.content.attachmentRecords[0]).toMatchObject({
      kind: "direct_ipfs",
      target: `ipfs://${direct.content.assetRecords[0]?.cid}`,
      manifestPath: "./assets/governance-flow.svg",
      gatewayUrl: `https://ipfs.io/ipfs/${direct.content.assetRecords[0]?.cid}`,
    });
  });

  it("enforces every frozen manifest maximum at the feed boundary", () => {
    const exact = cloneFeed();
    const exactPath = `./assets/${"a".repeat(499)}.svg`;
    const exactMediaType = `${"a".repeat(125)}/b`;
    setAtPath(exact, ["proposals", 0, "content", "value", "markdown"],
      (getAtPath(exact, ["proposals", 0, "content", "value", "markdown"]) as string)
        .replace("./assets/governance-flow.svg", exactPath));
    for (const base of [
      ["proposals", 0, "content", "value", "assets", 0],
      ["proposals", 0, "content", "assetRecords", 0],
    ] as const) {
      setAtPath(exact, [...base, "path"], exactPath);
      setAtPath(exact, [...base, "mediaType"], exactMediaType);
      setAtPath(exact, [...base, "byteLength"], 2_097_152);
      setAtPath(exact, [...base, "width"], null);
      setAtPath(exact, [...base, "height"], null);
    }
    setAtPath(exact, ["proposals", 0, "content", "attachmentRecords", 0, "target"], exactPath);
    setAtPath(exact, ["proposals", 0, "content", "attachmentRecords", 0, "manifestPath"], exactPath);
    rebindAvailableContent(exact, 0);
    expect(DaoFeedV1Schema.safeParse(exact).success).toBe(true);

    const exactPixels = cloneFeed();
    for (const base of [
      ["proposals", 0, "content", "value", "assets", 0],
      ["proposals", 0, "content", "assetRecords", 0],
    ] as const) {
      setAtPath(exactPixels, [...base, "width"], 8_192);
      setAtPath(exactPixels, [...base, "height"], 4_096);
    }
    rebindAvailableContent(exactPixels, 0);
    expect(DaoFeedV1Schema.safeParse(exactPixels).success).toBe(true);

    const overflowVectors: Array<{
      field: "path" | "mediaType" | "byteLength" | "width" | "height";
      value: JsonValue;
      message: RegExp;
    }> = [
      { field: "path", value: `./assets/${"é".repeat(252)}`, message: /ASSET_PATH_TOO_LONG/i },
      { field: "mediaType", value: `${"a".repeat(126)}/b`, message: /(?:ASSET_MEDIA_TYPE_TOO_LONG|127)/i },
      { field: "byteLength", value: 2_097_153, message: /(?:ASSET_TOO_LARGE|2097152)/i },
      { field: "width", value: 8_193, message: /(?:ASSET_DIMENSIONS_INVALID|8192)/i },
      { field: "height", value: 8_193, message: /(?:ASSET_DIMENSIONS_INVALID|8192)/i },
    ];
    for (const vector of overflowVectors) {
      const feed = cloneFeed();
      setAtPath(feed, ["proposals", 0, "content", "value", "assets", 0, vector.field], vector.value);
      setAtPath(feed, ["proposals", 0, "content", "assetRecords", 0, vector.field], vector.value);
      rebindAvailableContent(feed, 0);
      expectFeedRejected(feed, vector.message);
    }
    const pixels = cloneFeed();
    for (const base of [
      ["proposals", 0, "content", "value", "assets", 0],
      ["proposals", 0, "content", "assetRecords", 0],
    ] as const) {
      setAtPath(pixels, [...base, "width"], 8_192);
      setAtPath(pixels, [...base, "height"], 4_097);
    }
    rebindAvailableContent(pixels, 0);
    expectFeedRejected(pixels, /ASSET_DIMENSIONS_INVALID/i);
  });

  it("accepts the exact aggregate asset bound and rejects one byte over it", () => {
    const feed = cloneFeed();
    const firstAsset = structuredClone(
      getAtPath(feed, ["proposals", 0, "content", "value", "assets", 0])
    ) as Record<string, JsonValue>;
    const firstRecord = structuredClone(
      getAtPath(feed, ["proposals", 0, "content", "assetRecords", 0])
    ) as Record<string, JsonValue>;
    const assets: JsonValue[] = [];
    const records: JsonValue[] = [];
    for (let index = 0; index < 16; index += 1) {
      const digest = index === 0
        ? (firstAsset.digest as string)
        : `0x${index.toString(16).padStart(2, "0").repeat(32)}`;
      const path = index === 0
        ? (firstAsset.path as string)
        : `./assets/bound-${index}.bin`;
      const asset = {
        ...firstAsset,
        path,
        mediaType: "application/octet-stream",
        byteLength: 2_097_152,
        digest,
        width: null,
        height: null,
      };
      const cid = createDaoRawSha256Cid(digest as Hex);
      assets.push(asset);
      records.push({
        ...firstRecord,
        ...asset,
        cid,
        gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
      });
    }
    setAtPath(feed, ["proposals", 0, "content", "value", "assets"], assets);
    setAtPath(feed, ["proposals", 0, "content", "assetRecords"], records);
    rebindAvailableContent(feed, 0);
    expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);

    setAtPath(feed, ["proposals", 0, "content", "value", "assets", 0, "byteLength"], 2_097_153);
    setAtPath(feed, ["proposals", 0, "content", "assetRecords", 0, "byteLength"], 2_097_153);
    rebindAvailableContent(feed, 0);
    expectFeedRejected(feed, /(?:ASSET_TOO_LARGE|ASSET_AGGREGATE_TOO_LARGE|2097152)/i);
  });

  it("rejects attachment suffixes, guessed invalid-content assets, and failure-source substitutions", () => {
    expectRejected((feed) => {
      const cid = getAtPath(feed, ["proposals", 1, "content", "assetRecords", 0, "cid"]);
      setAtPath(
        feed,
        ["proposals", 1, "content", "attachmentRecords", 0, "target"],
        `ipfs://${cid}/descendant`
      );
    }, /attachment provenance/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 14, "content", "assetRecords"], [
        getAtPath(feed, ["proposals", 0, "content", "assetRecords", 0]),
      ]);
    }, /invalid content cannot publish guessed/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 13, "content", "error", "source"], "simulation");
    }, /invalid input/i);
  });

  it("accepts bounded retryable content and asset failures only with an exact next attempt", () => {
    const contentRetry = cloneFeed();
    setAtPath(contentRetry, ["proposals", 13, "content", "error", "retryable"], true);
    setAtPath(contentRetry, ["proposals", 13, "content", "error", "observedAt"], "2026-08-18T12:01:00Z");
    setAtPath(contentRetry, ["proposals", 13, "content", "retry"], {
      state: "scheduled",
      attempts: 1,
      maxAttempts: 8,
      lastAttemptAt: "2026-08-18T12:01:00Z",
      nextRetryAt: "2026-08-18T12:03:00Z",
      policy: "fixed_120_seconds",
      backoffSeconds: 120,
    });
    expect(DaoFeedV1Schema.safeParse(contentRetry).success).toBe(true);

    const assetRetry = cloneFeed();
    setAtPath(assetRetry, ["proposals", 0, "content", "assetRecords", 0, "state"], "unavailable");
    setAtPath(assetRetry, ["proposals", 0, "content", "assetRecords", 0, "retry"], {
      state: "scheduled",
      attempts: 2,
      maxAttempts: 8,
      lastAttemptAt: "2026-08-18T12:01:00Z",
      nextRetryAt: "2026-08-18T12:03:00Z",
      policy: "fixed_120_seconds",
      backoffSeconds: 120,
    });
    setAtPath(assetRetry, ["proposals", 0, "content", "assetRecords", 0, "error"], {
      code: "ASSET_FETCH_FAILED",
      message: "The raw asset fetch failed and will be retried.",
      retryable: true,
      observedAt: "2026-08-18T12:01:00Z",
      source: "asset",
    });
    expect(DaoFeedV1Schema.safeParse(assetRetry).success).toBe(true);

    setAtPath(assetRetry, ["proposals", 0, "content", "assetRecords", 0, "retry", "nextRetryAt"], null);
    expectFeedRejected(assetRetry, /expected string|next-retry time must exist exactly/i);
  });

  it("rejects canonical-byte, digest, CID, source, and manifest substitutions", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "content", "canonicalJson"], "{}\n");
    }, /fixed-order canonical json/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "content", "expectedDigest"],
        `0x${"aa".repeat(32)}`
      );
    }, /content digest/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "content", "expectedCid"], "bafk-invalid");
    }, /content cid/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "content", "value", "proposalType"],
        "executable"
      );
    }, /content proposal type/i);
    expectRejected((feed) => {
      const firstAsset = structuredClone(
        (feed as { proposals: Array<{ content: { value: { assets: JsonValue[] } } }> })
          .proposals[0]!.content.value.assets[0]!
      );
      setAtPath(feed, ["proposals", 0, "content", "value", "assets", 1], firstAsset);
    }, /duplicate asset path/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "content", "value", "assets", 0, "width"], 8_193);
    }, /(?:8192|asset_dimensions_invalid)/i);
  });

  it("retains exact event scripts and rejects claimed hash verification", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const signal = parsed.proposals.find(
      (proposal) => proposal.type === "signal" && proposal.script.bytes === "0x"
    );
    const executable = parsed.proposals.find(
      (proposal) => proposal.type === "executable" && proposal.script.bytes !== null
    );
    expect(signal?.script.hash).toBe(EMPTY_SCRIPT_HASH);
    expect(executable?.script.hashVerification.state).toBe("verified");
    if (executable?.script.bytes) {
      expect(keccak256(executable.script.bytes as `0x${string}`)).toBe(
        executable.script.hash
      );
    }
    const missing = parsed.proposals.find(
      (proposal) => proposal.ref.proposalId === "23"
    );
    const malformed = parsed.proposals.find(
      (proposal) => proposal.ref.proposalId === "24"
    );
    const zeroTarget = parsed.proposals.find(
      (proposal) => proposal.ref.proposalId === "25"
    );
    expect(missing?.script).toMatchObject({
      bytes: null,
      structure: { state: "unavailable" },
      hashVerification: { state: "unavailable" },
      retention: { state: "missing" },
    });
    expect(missing?.analysis.proposalSimulation.state).toBe("unavailable");
    expect(malformed?.script).toMatchObject({
      bytes: "0x01",
      structure: { state: "invalid", errorCode: "TRUNCATED_HEADER", errorOffset: 0 },
      hashVerification: { state: "verified" },
      retention: { state: "retained" },
    });
    expect(malformed?.analysis.calls).toEqual([]);
    expect(malformed?.analysis.proposalSimulation.state).toBe("unavailable");
    expect(zeroTarget?.script.structure.state).toBe("valid");
    expect(zeroTarget?.analysis.proposalSimulation.state).toBe("unavailable");

    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "script", "hashVerification", "state"], "mismatch");
    }, /hash verification/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "script", "bytes"], null);
    }, /script retention/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 22, "script", "retention", "proposeEventId"],
        feedExample.proposals[0]!.events[0]!.eventId
      );
    }, /script retention must bind/i);
  });
});

describe("DaoFeedV1Schema event, receipt, and actor provenance", () => {
  it("retains immutable ordered veto branches and post-veto aggregate rewrites", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const early = parsed.proposals.find((proposal) =>
      proposal.events.some(
        (event) => event.type === "veto" && event.data.branch === "early_no_votes"
      )
    );
    const post = parsed.proposals.find((proposal) =>
      proposal.events.some(
        (event) => event.type === "veto" && event.data.branch === "post_participation"
      ) && proposal.events.some(
        (event) => event.type === "vote" && event.data.actorKind !== "human" && event.data.weight === "0"
      )
    );
    expect(early).toBeDefined();
    expect(post).toBeDefined();

    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 11, "events", 1, "data", "branch"], "post_participation");
    }, /veto branch/i);
    expectRejected((feed) => {
      const vote = structuredClone(getAtPath(feed, ["proposals", 12, "events", 1]));
      const events = getAtPath(feed, ["proposals", 11, "events"]);
      if (!Array.isArray(events) || events.length < 2 || vote === null || Array.isArray(vote) || typeof vote !== "object") {
        throw new Error("Expected lifecycle fixture records.");
      }
      const veto = events[1] as Record<string, JsonValue>;
      const log = veto.log as Record<string, JsonValue>;
      const voteRecord = vote as Record<string, JsonValue>;
      const voteLog = voteRecord.log as Record<string, JsonValue>;
      voteRecord.proposalRef = structuredClone(getAtPath(feed, ["proposals", 11, "ref"]));
      voteRecord.contractGeneration = "1";
      voteLog.blockNumber = (BigInt(log.blockNumber as string) + 1n).toString();
      voteLog.blockHash = `0x${"ab".repeat(32)}`;
      voteLog.transactionIndex = 1;
      voteLog.logIndex = 0;
      voteRecord.eventId = createDaoFeedEventId(1, feedExample.contracts[0]!.votingAddress, {
        blockHash: voteLog.blockHash as Hex,
        transactionIndex: 1,
        logIndex: 0,
      });
      events.push(voteRecord);
      setAtPath(feed, ["publication", "counts", "events"], feedExample.publication.counts.events + 1);
    }, /vote after an early veto/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 11, "events", 1, "log", "timestamp"], null);
    }, /Veto.*canonical event time/i);
  });

  it("accepts both explicit and automatic empty-script signal execution", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const automatic = parsed.proposals.find(
      (proposal) => proposal.type === "signal" && proposal.protocolStatus === "executed" &&
        !proposal.events.some((event) => event.type === "execute")
    );
    const explicit = parsed.proposals.find(
      (proposal) => proposal.type === "signal" &&
        proposal.events.some((event) => event.type === "execute")
    );
    expect(automatic).toBeDefined();
    expect(explicit).toBeDefined();
    expect(explicit?.displayStatus).toBe("approved");

    const explicitIndex = feedExample.proposals.findIndex(
      (proposal) => proposal.ref.proposalId === explicit?.ref.proposalId
    );
    const executeIndex = feedExample.proposals[explicitIndex]!.events.findIndex(
      (event) => event.type === "execute"
    );
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", explicitIndex, "events", executeIndex, "log", "timestamp"],
        null
      );
    }, /every Voting Execute must prove/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", explicitIndex, "thresholdBps"], 10_000);
      setAtPath(
        feed,
        ["proposals", explicitIndex, "rules", "approvalThresholdBps"],
        10_000
      );
    }, /positive-total threshold passage/i);
    expectRejected((feed) => {
      const proposal = feedExample.proposals[explicitIndex]!;
      const contract = feedExample.contracts[0]!;
      const followingEpochStart =
        contract.genesisTimestamp +
        (Number(proposal.votingEpoch) + 1) * contract.epochLengthSeconds;
      setAtPath(
        feed,
        ["proposals", explicitIndex, "events", executeIndex, "log", "timestamp"],
        followingEpochStart +
          proposal.rules.mutableConfiguration.executionDelaySeconds -
          1
      );
    }, /effective execution delay/i);
  });

  it("binds guarded Execute callers to the operator effective at the event", () => {
    const executableIndex = feedExample.proposals.findIndex((proposal) =>
      proposal.events.some((event) => event.type === "execute") &&
      proposal.type === "executable"
    );
    const executeIndex = feedExample.proposals[executableIndex]!.events.findIndex(
      (event) => event.type === "execute"
    );
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", executableIndex, "events", executeIndex, "actor", "address"],
        "0x7777777777777777777777777777777777777777"
      );
      rebindExecuteAbi(feed, executableIndex, executeIndex);
    }, /guarded Execute caller.*effective operator/i);
  });

  it("rejects reverse transaction-hash reuse at a different block position", () => {
    expectRejected((feed) => {
      const first = getAtPath(feed, ["proposals", 0, "events", 0, "log", "transactionHash"]);
      setAtPath(feed, ["proposals", 1, "events", 0, "log", "transactionHash"], first);
      setAtPath(feed, ["proposals", 1, "creation", "transactionHash"], first);
      setAtPath(feed, ["proposals", 1, "creation", "receipt", "transactionHash"], first);
    }, /one transaction hash.*one canonical block.*position/i);
  });

  it("retains full event identity and nullable transaction/time provenance", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const events = parsed.proposals.flatMap((proposal) => proposal.events);
    for (const event of events) {
      expect(event.eventId).toBe(
        createDaoFeedEventId(parsed.chainId, event.proposalRef.votingAddress, event.log)
      );
      expect(event.data.abi.address).toBe(event.proposalRef.votingAddress);
      expect(event.data.abi.topics[0]).toBe(
        DAO_FEED_LIFECYCLE_EVENT_TOPICS[event.type]
      );
      if (event.type !== "propose" || event.data.script !== null) {
        expect(event.data.abi.state).toBe("available");
      }
    }
    expect(
      events.some(
        (event) =>
          event.log.timestamp === null && event.log.transactionHash === null
      )
    ).toBe(true);
    const nullable = events.find((event) => event.log.transactionHash === null);
    if (!nullable) throw new Error("Expected nullable transaction provenance.");
    const logWithDifferentTransactionHash = {
      ...nullable.log,
      transactionHash: `0x${"ff".repeat(32)}`,
    };
    expect(
      createDaoFeedEventId(
        parsed.chainId,
        nullable.proposalRef.votingAddress,
        logWithDifferentTransactionHash
      )
    ).toBe(nullable.eventId);
  });

  it("canonically re-encodes every lifecycle event ABI and rejects substitutions", () => {
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 1, "events", 1, "data", "abi", "address"],
        "0x9999999999999999999999999999999999999999"
      );
    }, /exact Voting emitter/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 1, "events", 1, "data", "abi", "topics", 1],
        `0x${"01".repeat(32)}`
      );
    }, /canonically ordered topics/i);
    expectRejected((feed) => {
      const data = getAtPath(feed, [
        "proposals",
        0,
        "events",
        0,
        "data",
        "abi",
        "data",
      ]) as string;
      setAtPath(
        feed,
        ["proposals", 0, "events", 0, "data", "abi", "data"],
        `${data}00`
      );
    }, /no dirty padding.*trailing bytes/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "events", 0, "data", "abi", "matchingLogCount"],
        2
      );
    }, /expected 1/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 5, "events", 3, "data", "scriptHash"],
        `0x${"aa".repeat(32)}`
      );
    }, /unrecognized key/i);
  });

  it("classifies human and aggregate vote actors without binary aggregate guesses", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const votes = parsed.proposals.flatMap((proposal) =>
      proposal.events.filter((event) => event.type === "vote")
    );
    expect(votes.some((event) => event.data.actorKind === "human")).toBe(true);
    expect(votes.some((event) => event.data.actorKind === "ybc_aggregate")).toBe(true);
    expect(
      votes.some(
        (event) => event.data.actorKind === "delegated_staking_aggregate"
      )
    ).toBe(true);
    for (const vote of votes) {
      if (vote.data.actorKind !== "human") expect(vote.data.direction).toBeNull();
    }
    expect(
      parsed.proposals
        .flatMap((proposal) => proposal.events)
        .some((event) => event.actor.evidence.state === "unavailable")
    ).toBe(true);
    for (const proposal of parsed.proposals) {
      for (const execute of proposal.events.filter(
        (event) => event.type === "execute"
      )) {
        expect(execute.actor.role).toBe("execution_caller");
        expect(execute.actor.address).not.toBe(
          proposal.rules.mutableConfiguration.executorAddress
        );
      }
    }
  });

  it("uses overwrite-last aggregate accounting even for zero and repeated aggregate votes", () => {
    const feed = cloneFeed();
    setAtPath(feed, ["proposals", 1, "events", 6, "data", "yeaBps"], 0);
    setAtPath(feed, ["proposals", 1, "yeaWeight"], "6000000000000000000");
    setAtPath(feed, ["proposals", 1, "nayWeight"], "5000000000000000000");
    rebindVoteAbi(feed, 1, 6);
    expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);

    setAtPath(feed, ["proposals", 1, "totalWeight"], "17000000000000000000");
    expectFeedRejected(feed, /last absolute contribution/i);
  });

  it("rejects event IDs, transaction groups, actor roles, and moderation reasons that disagree", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "events", 0, "eventId"], "forged");
    }, /event id/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 1, "events", 1, "actor", "role"], "guardian");
    }, /vote actor role/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 1, "events", 2, "data", "direction"], "yea");
    }, /aggregate vote direction/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 1, "events", 2, "data", "classification", "delegatedStakingAddress"],
        "0x9999999999999999999999999999999999999999"
      );
    }, /classification.*(?:match|provenance)|call-trace resolution/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 10, "moderation", "flagReason"], "Substituted");
    }, /flag reason/i);
  });

  it("preserves exact empty, whitespace, and 256-byte historical moderation reasons", () => {
    for (const reason of ["", "  historical spacing  ", "é".repeat(128)]) {
      const feed = cloneFeed();
      setAtPath(feed, ["proposals", 10, "events", 1, "data", "reason"], reason);
      setAtPath(feed, ["proposals", 10, "moderation", "flagReason"], reason);
      rebindReasonAbi(feed, 10, 1, "flag");
      expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);
    }

    const over = cloneFeed();
    const reason = `${"é".repeat(128)}a`;
    setAtPath(over, ["proposals", 10, "events", 1, "data", "reason"], reason);
    setAtPath(over, ["proposals", 10, "moderation", "flagReason"], reason);
    rebindReasonAbi(over, 10, 1, "flag");
    expectFeedRejected(over, /(?:256 UTF-8 bytes|642)/i);
  });

  it("rejects event collisions, block substitutions, and transaction-group incoherence", () => {
    expectRejected((feed) => {
      const other = getAtPath(feed, ["proposals", 1, "events", 2, "eventId"]);
      setAtPath(feed, ["proposals", 1, "events", 1, "eventId"], other);
    }, /event id.*globally unique|derived/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 1, "events", 2, "log", "transactionHash"],
        null
      );
    }, /transaction group/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 1, "events", 4, "log", "blockHash"],
        `0x${"bb".repeat(32)}`
      );
      const log = getAtPath(feed, ["proposals", 1, "events", 4, "log"]);
      if (log === null || Array.isArray(log) || typeof log !== "object") {
        throw new Error("Expected an event log.");
      }
      setAtPath(
        feed,
        ["proposals", 1, "events", 4, "eventId"],
        createDaoFeedEventId(1, feedExample.proposals[1]!.ref.votingAddress, {
          blockHash: log.blockHash as Hex,
          transactionIndex: log.transactionIndex as number,
          logIndex: log.logIndex as number,
        })
      );
    }, /one block height.*canonical hash/i);
  });

  it("binds indexed creation evidence to one exact successful Propose event", () => {
    const parsed = parseDaoFeedV1(feedExample);
    for (const proposal of parsed.proposals) {
      if (proposal.creation.state !== "indexed") continue;
      const proposeEvents = proposal.events.filter(
        (event) => event.type === "propose"
      );
      expect(proposeEvents).toHaveLength(1);
      expect(proposal.creation.receipt.status).toBe("success");
      expect(proposal.creation.proposeEventId).toBe(proposeEvents[0]?.eventId);
      expect(proposal.creation.transactionHash).toBe(
        proposeEvents[0]?.log.transactionHash
      );
    }
  });

  it("rejects receipt transaction, log, proposer, epoch, digest, and script mismatches", () => {
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "creation", "transactionHash"],
        `0x${"ab".repeat(32)}`
      );
    }, /creation transaction hash/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "creation", "proposeEventId"], "forged");
    }, /(?:must match pattern|creation evidence)/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "events", 0, "data", "proposer"],
        "0x9999999999999999999999999999999999999999"
      );
    }, /propose event proposer/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "events", 0, "data", "votingEpoch"], "202");
    }, /propose event voting epoch/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "events", 0, "data", "contentDigest"],
        `0x${"cc".repeat(32)}`
      );
    }, /propose event content digest/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "events", 0, "data", "script"], "0x00");
    }, /propose event script/i);
  });
});

describe("DaoFeedV1Schema decoding and proposal-time simulation", () => {
  it("requires a proven false-to-true proposal storage transition", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const completed = parsed.proposals
      .map((proposal) => proposal.analysis.proposalSimulation)
      .find((simulation) => simulation.state === "succeeded");
    expect(completed?.stateOverrides[0]).toMatchObject({
      kind: "voting_proposal_executed_flag",
      fromValue: false,
      toValue: true,
    });
    if (completed?.state === "succeeded") {
      const storage = completed.stateOverrides[0].proof.storageLayout;
      expect(storage.compiler).toBe("vyper@0.4.2");
      expect(storage.proposalStorageBaseSlot).toBe(
        "0xa4e0f4432e44d027a7b3f953940f096bca7a9bd910297cad2ba7c703c2b799d3"
      );
      expect(storage.resolvedStorageSlot).toBe(
        "0xa4e0f4432e44d027a7b3f953940f096bca7a9bd910297cad2ba7c703c2b799db"
      );
      expect(completed.stateOverrides[0].proof.bytecode.deployedBytecodeHash).toMatch(/^0x(?=[0-9a-f]{64}$)(?=.*[1-9a-f])[0-9a-f]{64}$/);
    }
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "stateOverrides", 0, "fromValue"],
        true
      );
    }, /false.*true|expected false/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "stateOverrides", 0, "proof", "storageLayout", "postStorageWord"],
        `0x${"00".repeat(31)}02`
      );
    }, /false-to-true storage word/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "stateOverrides", 0, "proof", "bytecode", "deployedBytecodeHash"],
        `0x${"ab".repeat(32)}`
      );
    }, /deployment bytecode/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "stateOverrides", 0, "proof", "storageLayout", "resolvedStorageSlot"],
        `0x${"ab".repeat(32)}`
      );
    }, /mapping base.*proposal ID.*executed field/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "stateOverrides", 0, "proof", "storageLayout", "layoutArtifactSha256"],
        `0x${"cd".repeat(32)}`
      );
    }, /pinned Vyper storage-layout artifact/i);
  });

  it("keeps decoding independent from atomic simulation outcomes", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const partial = parsed.proposals.find(
      (proposal) => proposal.analysis.state === "partial"
    );
    const failed = parsed.proposals.find(
      (proposal) => proposal.analysis.proposalSimulation.state === "failed"
    );
    const unavailable = parsed.proposals.find(
      (proposal) => proposal.analysis.proposalSimulation.state === "unavailable"
    );

    expect(partial?.analysis.calls.some((call) => call.decodeStatus === "unknown")).toBe(
      true
    );
    expect(partial?.analysis.proposalSimulation.state).toBe("succeeded");
    expect(failed?.analysis.proposalSimulation.state).toBe("failed");
    expect(unavailable?.analysis.proposalSimulation.state).toBe("unavailable");
    const mismatch = parsed.proposals.find(
      (proposal) => proposal.script.hashVerification.state === "mismatch"
    );
    expect(mismatch?.analysis.proposalSimulation.scriptHash).toBe(
      mismatch?.script.hashVerification.computedHash
    );
    expect(mismatch?.analysis.proposalSimulation.scriptHash).not.toBe(
      mismatch?.script.hash
    );
  });

  it("requires complete structured source provenance only for verified calls", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const calls = parsed.proposals.flatMap((proposal) => proposal.analysis.calls);
    for (const call of calls) {
      if (call.decodeStatus === "verified") {
        expect(call.verifiedSource?.url).toMatch(/^https:\/\//);
        expect(call.verifiedSource?.revision).toBe(PINNED_CONTRACT_COMMIT);
        expect(call.verifiedSource?.sourcePath).not.toBe("");
      }
      if (call.decodeStatus === "unknown") expect(call.verifiedSource).toBeNull();
    }
    const unknown = calls.find((call) => call.decodeStatus === "unknown");
    expect(unknown).toMatchObject({
      contractName: null,
      functionSignature: null,
      arguments: [],
      verifiedSource: null,
      error: null,
    });
    expect(unknown?.target).toMatch(/^0x[0-9a-f]{40}$/);
    expect(unknown?.calldata).toMatch(/^0x(?:[0-9a-f]{2})*$/);
  });

  it("rejects unsafe source records and decode/source contradictions", () => {
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "calls", 0, "verifiedSource", "url"],
        "http://example.com/Voting.vy"
      );
    }, /https/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 4, "analysis", "calls", 0, "decodeStatus"], "unknown");
    }, /expected null/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "calls", 0, "verifiedSource", "sourcePath"],
        "../Voting.vy"
      );
    }, /repository-relative paths/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "calls", 0, "calldata"],
        "0x12345678"
      );
    }, /raw calls must preserve.*order/i);
  });

  it("rejects time-gated Voting.execute and incomplete or contradictory simulation provenance", () => {
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "method"],
        "voting_execute_at_proposal_block"
      );
    }, /revm_engine_injected_executor_frame_conditional_origin/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "blockHash"],
        `0x${"dd".repeat(32)}`
      );
    }, /propose event block/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "caller"],
        "0x9999999999999999999999999999999999999999"
      );
    }, /injected Executor frame caller/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "timestampOverride"],
        1_787_054_401
      );
    }, /expected null/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 24, "analysis", "proposalSimulation", "method"],
        "revm_voting_transition_then_executor_execute"
      );
    }, /expected null/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "stateOverrides", 0, "toValue"],
        false
      );
    }, /expected true/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "simulatedAt"],
        "2026-08-18T12:03:00Z"
      );
    }, /cannot follow feed generation/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 17, "analysis", "proposalSimulation", "error", "source"],
        "content"
      );
    }, /invalid input/i);
  });
});

describe("DAO receipt-derived identity stages", () => {
  it("accepts receipt-confirmed, awaiting-index, and indexed records with one exact ref", () => {
    const parsed = identityStages.map((stage) =>
      parseDaoCreationIdentityStageV1(stage)
    );
    expect(parsed.map((stage) => stage.stage)).toEqual([
      "receipt_confirmed",
      "awaiting_index",
      "indexed",
    ]);
    expect(new Set(parsed.map((stage) => JSON.stringify(stage.ref)))).toHaveLength(1);
    expect(new Set(parsed.map((stage) => stage.transactionHash))).toHaveLength(1);
    expect(parsed[2]?.indexedSnapshotId).toBe(feedExample.publication.snapshotId);
    for (const stage of parsed) {
      expect(stage.receipt).toEqual({
        status: "success",
        matchingProposeLogCount: 1,
      });
      expect(stage.identity.abi.topics).toHaveLength(4);
      expect(stage.identity.abi.matchingLogCount).toBe(1);
    }
  });

  it("rejects stages with receipt/log mismatches or an impossible index marker", () => {
    const mismatch = structuredClone(identityStages[0]);
    mismatch.identity.proposer = "0x9999999999999999999999999999999999999999";
    expect(DaoCreationIdentityStageV1Schema.safeParse(mismatch).success).toBe(false);

    const prematureIndex = structuredClone(identityStages[1]);
    prematureIndex.indexedSnapshotId = feedExample.publication.snapshotId;
    expect(DaoCreationIdentityStageV1Schema.safeParse(prematureIndex).success).toBe(
      false
    );

    const reverted = structuredClone(identityStages[0]) as unknown as JsonValue;
    setAtPath(reverted, ["receipt", "status"], "reverted");
    expect(DaoCreationIdentityStageV1Schema.safeParse(reverted).success).toBe(false);

    const wrongContract = structuredClone(identityStages[0]) as unknown as JsonValue;
    setAtPath(
      wrongContract,
      ["identity", "abi", "address"],
      "0x9999999999999999999999999999999999999999"
    );
    expect(DaoCreationIdentityStageV1Schema.safeParse(wrongContract).success).toBe(
      false
    );

    const duplicate = structuredClone(identityStages[0]) as unknown as JsonValue;
    setAtPath(duplicate, ["receipt", "matchingProposeLogCount"], 2);
    expect(DaoCreationIdentityStageV1Schema.safeParse(duplicate).success).toBe(
      false
    );

    const trailing = structuredClone(identityStages[0]) as unknown as JsonValue;
    const rawData = getAtPath(trailing, ["identity", "abi", "data"]);
    setAtPath(trailing, ["identity", "abi", "data"], `${rawData}00`);
    expect(DaoCreationIdentityStageV1Schema.safeParse(trailing).success).toBe(
      false
    );
  });
});

describe("DAO accepted mock-state mapping", () => {
  it("maps every accepted state without adding wallet eligibility to the feed", () => {
    const parsed = parseDaoFeedV1(feedExample);
    expect(mockStateMap.map((entry) => entry.fixture)).toEqual(
      EXPECTED_MOCK_STATES
    );
    expect(new Set(mockStateMap.map((entry) => entry.fixture)).size).toBe(
      EXPECTED_MOCK_STATES.length
    );

    for (const entry of mockStateMap) {
      const acceptedMock = getDaoMockFixture(
        entry.fixture as DaoMockFixtureId
      );
      const acceptedProposal = DAO_MOCK_FEED.proposals.find(
        (candidate) =>
          candidate.ref.chainId === acceptedMock.proposalRef.chainId &&
          candidate.ref.votingAddress === acceptedMock.proposalRef.votingAddress &&
          candidate.ref.proposalId === acceptedMock.proposalRef.proposalId
      );
      if (!acceptedProposal) {
        throw new Error(`Missing accepted mock proposal ${entry.fixture}.`);
      }
      const proposal = parsed.proposals.find(
        (candidate) =>
          candidate.ref.chainId === entry.proposalRef.chainId &&
          candidate.ref.votingAddress.toLowerCase() ===
            entry.proposalRef.votingAddress.toLowerCase() &&
          candidate.ref.proposalId === entry.proposalRef.proposalId
      );
      expect(proposal, entry.fixture).toBeDefined();
      if (!proposal) throw new Error(`Missing mapped proposal ${entry.fixture}.`);
      expect(proposal.ref).toEqual({
        ...acceptedProposal.ref,
        proposalId: acceptedProposal.ref.proposalId.toString(),
      });
      expect(proposal.protocolStatus).toBe(acceptedProposal.protocolStatus);
      expect(proposal.displayStatus).toBe(acceptedProposal.displayStatus);
      expect(proposal.displayGroup).toBe(acceptedProposal.displayGroup);
      expect(proposal.type).toBe(acceptedProposal.type);
      expect(proposal.content.state).toBe(acceptedProposal.content.state);
      expect(proposal.analysis.state).toBe(acceptedProposal.analysis.state);
      expect(proposal.script.bytes).toBe(acceptedProposal.script.bytes);
      expect(proposal.script.hash).toBe(acceptedProposal.script.hash);
      expect(entry.predicates).toEqual({
        protocolStatus: proposal.protocolStatus,
        displayStatus: proposal.displayStatus,
        displayGroup: proposal.displayGroup,
        proposalType: proposal.type,
        chainCreatedAtState: proposal.chainCreatedAt.state,
        thresholdBps: proposal.thresholdBps,
        contentState: proposal.content.state,
        discussionState: proposal.discussion.state,
        analysisState: proposal.analysis.state,
        simulationState: proposal.analysis.proposalSimulation.state,
        scriptRetentionState: proposal.script.retention.state,
        scriptStructureState: proposal.script.structure.state,
        scriptHashVerificationState: proposal.script.hashVerification.state,
        executionGuard: proposal.rules.mutableConfiguration.executionGuard,
        eventTypes: proposal.events.map((event) => event.type),
        flagReason: proposal.moderation.flagReason,
        vetoReason: proposal.moderation.vetoReason,
        hasUnavailableActorEvidence: proposal.events.some(
          (event) => event.actor.evidence.state === "unavailable"
        ),
        hasNullableEventTimestamp: proposal.events.some(
          (event) => event.log.timestamp === null
        ),
        hasNullableTransactionHash: proposal.events.some(
          (event) => event.log.transactionHash === null
        ),
      });
      if (
        entry.fixture === "proposal-capacity-full" ||
        entry.fixture === "late-voting"
      ) {
        expect(entry.representation).toBe("consumer_wallet_overlay");
        expect(entry.consumerOverlay).toMatchObject({
          owner: "consumer_wallet",
          feedFields: [],
        });
      } else {
        expect(entry.representation).toBe("feed_proposal");
        expect(entry.consumerOverlay).toBeNull();
      }
    }
  });
});

describe("DAO schema artifact integrity", () => {
  it("never throws while rejecting uint256 overflow at feed and receipt-stage boundaries", () => {
    const overflowFeed = cloneFeed();
    setAtPath(overflowFeed, ["proposals", 0, "ref", "proposalId"], (1n << 256n).toString());
    expect(() => safeParseDaoFeedV1(overflowFeed)).not.toThrow();
    expect(safeParseDaoFeedV1(overflowFeed).success).toBe(false);
    expect(() => DaoFeedV1Schema.safeParse(overflowFeed)).not.toThrow();

    const overflowStage = structuredClone(identityStages[0]) as JsonValue;
    setAtPath(overflowStage, ["ref", "proposalId"], (1n << 256n).toString());
    expect(() => DaoCreationIdentityStageV1Schema.safeParse(overflowStage)).not.toThrow();
    expect(DaoCreationIdentityStageV1Schema.safeParse(overflowStage).success).toBe(false);
  });

  it("admits raw JSON under the 64 MiB cap before parsing its deep structure", () => {
    expect(parseDaoFeedJsonV1(JSON.stringify(feedExample)).schemaVersion).toBe(1);
    const oversized = `{"padding":"${"x".repeat(64 * 1024 * 1024)}"}`;
    expect(() => parseDaoFeedJsonV1(oversized)).toThrow(/64 MiB.*admission/i);
  });

  it("rejects ambiguous URLs and requires exact pinned and forum provenance", () => {
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["contracts", 0, "source", "url"],
        `${feedExample.contracts[0]!.source.url}?raw=1`
      );
    }, /exact pinned Voting GitHub blob URL/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "discussion", "url"], "https://example.com/t/dao-proposal/1");
    }, /gov\.yearn\.fi/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "discussion", "url"], "https://gov.yearn.fi/t/dao-proposal/1%0aevil");
    }, /control character|canonical forum topic/i);
    expectRejected((feed) => {
      const ambiguous =
        "https://gov.yearn.fi:443/t/archive/../dao-proposal/1";
      setAtPath(
        feed,
        ["proposals", 0, "discussion", "url"],
        ambiguous
      );
      setAtPath(
        feed,
        ["proposals", 0, "content", "value", "discussionUrl"],
        ambiguous
      );
      rebindAvailableContent(feed, 0);
    }, /canonical URL form/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "discussion", "categoryId"], 43);
    }, /invalid input|Proposals root 5 ancestry/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "discussion", "categorySlugPath"], ["other"]);
    }, /Proposals root 5 ancestry/i);
  });

  it("rejects noncanonical uint256, hex, address, timestamp, and UTF-8 failure primitives", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "totalWeight"], (1n << 256n).toString());
    }, /uint256/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "ref", "proposalId"], "01");
    }, /must match pattern/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "ref", "votingAddress"],
        "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      );
    }, /must match pattern/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 23, "script", "bytes"], "0x0");
    }, /must match pattern/i);
    expectRejected((feed) => {
      setAtPath(feed, ["generatedAt"], "2026-02-30T12:00:00Z");
    }, /real canonical UTC instant/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 13, "content", "error", "message"],
        "é".repeat(1_025)
      );
    }, /2,048 UTF-8 bytes/i);
  });

  it("rejects bounded script, call, topic, and root object overflows without coercion", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 23, "script", "bytes"], `0x${"00".repeat(2_049)}`);
    }, /too big/i);
    expectRejected((feed) => {
      const call = getAtPath(feed, ["proposals", 4, "analysis", "calls", 0]);
      setAtPath(feed, ["proposals", 4, "analysis", "calls"],
        Array.from({ length: 65 }, () => structuredClone(call)));
    }, /too big/i);
    expectRejected((feed) => {
      const topics = structuredClone(
        getAtPath(feed, ["proposals", 1, "events", 1, "data", "abi", "topics"])
      ) as JsonValue[];
      topics.push(`0x${"ff".repeat(32)}`);
      setAtPath(feed, ["proposals", 1, "events", 1, "data", "abi", "topics"], topics);
    }, /too big/i);
    expectRejected((feed) => {
      setAtPath(feed, ["chainId"], "1");
    }, /expected number/i);
  });

  it("retains the exact canonical content example bytes including one final LF", () => {
    const bytes = readFileSync(
      resolve(
        process.cwd(),
        "docs/apps/dao/examples/proposal-content.example.json"
      )
    );
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.at(-2)).not.toBe(0x0a);
  });
});

describe("DAO feed final audit regressions", () => {
  it("accepts a vote and VOTING snapshot in the new opening interval after a live timing change", () => {
    const feed = cloneFeed();
    keepOnlyProposal(feed, 1);
    const proposeLog = recordAt(feed, ["proposals", 0, "events", 0, "log"]);
    const effectiveAt = {
      blockNumber: proposeLog.blockNumber,
      blockHash: proposeLog.blockHash,
      transactionIndex: (proposeLog.transactionIndex as number) + 1,
      logIndex: (proposeLog.logIndex as number) + 1,
    };
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "effectiveAt"],
      effectiveAt
    );
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "voterImplementation", "bytecode", "blockNumber"],
      effectiveAt.blockNumber
    );
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "voterImplementation", "bytecode", "blockHash"],
      effectiveAt.blockHash
    );
    setAtPath(feed, ["proposals", 0, "statusConfiguration", "effectiveAt"], effectiveAt);

    const config = recordAt(feed, ["contracts", 0, "configurationHistory", 1]);
    const events = getAtPath(feed, ["proposals", 0, "events"]);
    if (!Array.isArray(events)) throw new Error("Expected proposal events.");
    const newVoteStart = getAtPath(feed, ["proposals", 0, "voteStartsAt"]) as number;
    for (let eventIndex = 1; eventIndex < events.length; eventIndex += 1) {
      const event = recordAt(feed, ["proposals", 0, "events", eventIndex]);
      if (event.type !== "vote") continue;
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "log", "timestamp"], newVoteStart + 50);
      for (const field of [
        "configurationId",
        "voterAddress",
        "delegatedStakingAddress",
        "ybcAddress",
        "ybcWeightAggregatorAddress",
      ] as const) {
        setAtPath(
          feed,
          ["proposals", 0, "events", eventIndex, "data", "classification", field],
          config[field]
        );
      }
      setAtPath(
        feed,
        ["proposals", 0, "events", eventIndex, "data", "classification", "observedAt"],
        effectiveAt
      );
      const kind = getAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "actorKind"]);
      if (kind === "delegated_staking_aggregate") {
        setAtPath(feed, ["proposals", 0, "events", eventIndex, "actor", "address"], config.delegatedStakingAddress);
        setAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "classification", "trace", "emittedAccount"], config.delegatedStakingAddress);
        rebindVoteAbi(feed, 0, eventIndex);
      } else if (kind === "ybc_aggregate") {
        setAtPath(feed, ["proposals", 0, "events", eventIndex, "actor", "address"], config.ybcAddress);
        setAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "classification", "trace", "emittedAccount"], config.ybcAddress);
        rebindVoteAbi(feed, 0, eventIndex);
      }
    }
    setAtPath(feed, ["canonicalBlock", "timestamp"], newVoteStart + 50);
    setAtPath(feed, ["publication", "finality", "headBlock", "timestamp"], newVoteStart + 146);
    expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);

    const oldTiming = structuredClone(feed);
    const oldConfig = recordAt(oldTiming, ["contracts", 0, "configurationHistory", 0]);
    const votingEpoch = Number(getAtPath(oldTiming, ["proposals", 0, "votingEpoch"]));
    const oldStart =
      (getAtPath(oldTiming, ["contracts", 0, "genesisTimestamp"]) as number) +
      votingEpoch * DAO_FEED_EPOCH_LENGTH_SECONDS +
      (oldConfig.voteStartOffsetSeconds as number);
    setAtPath(oldTiming, ["proposals", 0, "voteStartsAt"], oldStart);
    setAtPath(
      oldTiming,
      ["proposals", 0, "voteEndsAt"],
      oldStart + (oldConfig.votingPeriodSeconds as number)
    );
    setAtPath(oldTiming, ["proposals", 0, "protocolStatus"], "proposed");
    setAtPath(oldTiming, ["proposals", 0, "displayStatus"], "discussion");
    setAtPath(oldTiming, ["proposals", 0, "displayGroup"], "upcoming");
    expectFeedRejected(oldTiming, /snapshot-effective vote timing|protocol status/i);

    const beforeNewWindow = structuredClone(feed);
    for (let eventIndex = 1; eventIndex < events.length; eventIndex += 1) {
      setAtPath(beforeNewWindow, ["proposals", 0, "events", eventIndex, "log", "timestamp"], newVoteStart - 1);
    }
    expectFeedRejected(beforeNewWindow, /event-effective voting window/i);
  });

  it("uses event-effective vote timing and snapshot-effective raw status", () => {
    const feed = cloneFeed();
    const proposal = structuredClone(getAtPath(feed, ["proposals", 1]));
    setAtPath(feed, ["proposals"], [proposal]);
    setAtPath(feed, ["publication", "counts", "proposals"], 1);
    setAtPath(
      feed,
      ["publication", "counts", "events"],
      feedExample.proposals[1]!.events.length
    );
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "voteStartOffsetSeconds"],
      DAO_FEED_EPOCH_LENGTH_SECONDS
    );
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "votingPeriodSeconds"],
      0
    );
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "votingWindowState"],
      "disabled_zero_length"
    );
    setAtPath(feed, ["canonicalBlock", "timestamp"], 1_786_800_000);
    setAtPath(
      feed,
      ["publication", "finality", "headBlock", "timestamp"],
      1_786_800_096
    );

    expectFeedRejected(feed, /event-effective voting window|snapshot-effective/i);
  });

  it("accepts contract-valid disabling configuration values", () => {
    const feed = cloneFeed();
    const proposal = structuredClone(getAtPath(feed, ["proposals", 0]));
    setAtPath(feed, ["proposals"], [proposal]);
    setAtPath(feed, ["publication", "counts", "proposals"], 1);
    setAtPath(feed, ["publication", "counts", "events"], 1);
    for (const field of [
      "voterAddress",
      "delegatedStakingAddress",
      "ybcAddress",
      "ybcWeightAggregatorAddress",
      "executorAddress",
      "votingHookAddress",
      "weightMeasureAddress",
      "operatorAddress",
    ] as const) {
      setAtPath(
        feed,
        ["contracts", 0, "configurationHistory", 1, field],
        `0x${"00".repeat(20)}`
      );
    }
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "voteStartOffsetSeconds"],
      DAO_FEED_EPOCH_LENGTH_SECONDS
    );
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "votingPeriodSeconds"],
      0
    );
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "votingWindowState"],
      "disabled_zero_length"
    );
    for (const [field, value] of [
      ["voterState", "disabled_zero_address"],
      ["delegatedStakingState", "zero_address"],
      ["ybcState", "zero_address"],
      ["ybcWeightAggregatorState", "zero_address"],
      ["executorState", "uninitialized_zero_address"],
      ["votingHookState", "zero_address"],
      ["weightMeasureState", "zero_address"],
      ["operatorState", "zero_address"],
    ] as const) {
      setAtPath(
        feed,
        ["contracts", 0, "configurationHistory", 1, field],
        value
      );
    }
    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "voterImplementation"],
      {
        state: "disabled_zero_address",
        address: `0x${"00".repeat(20)}`,
        source: null,
        sourceSha256: null,
        compiler: null,
        optimization: null,
        evmVersion: null,
        immutableGenesisTimestamp: null,
        compiledRuntimeBytecodeHash: null,
        bytecode: null,
        classificationSemantics: "voting_disabled",
        error: null,
      }
    );
    const votingEpoch = Number(feedExample.proposals[0]!.votingEpoch);
    const disabledAt =
      feedExample.contracts[0]!.genesisTimestamp +
      (votingEpoch + 1) * DAO_FEED_EPOCH_LENGTH_SECONDS;
    setAtPath(feed, ["proposals", 0, "voteStartsAt"], disabledAt);
    setAtPath(feed, ["proposals", 0, "voteEndsAt"], disabledAt);

    expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);

    setAtPath(
      feed,
      ["contracts", 0, "configurationHistory", 1, "operatorState"],
      "configured"
    );
    expectFeedRejected(feed, /operatorState.*raw configured or zero address/i);
  });

  it("accepts a zero delegated aggregate account only with pinned trace evidence", () => {
    const feed = cloneFeed();
    keepOnlyProposal(feed, 1);
    const zero = `0x${"00".repeat(20)}`;
    setAtPath(feed, ["contracts", 0, "configurationHistory", 0, "delegatedStakingAddress"], zero);
    setAtPath(feed, ["contracts", 0, "configurationHistory", 0, "delegatedStakingState"], "zero_address");
    setAtPath(feed, ["proposals", 0, "rules", "mutableConfiguration", "delegatedStakingAddress"], zero);
    setAtPath(feed, ["proposals", 0, "rules", "mutableConfiguration", "delegatedStakingState"], "zero_address");
    const events = getAtPath(feed, ["proposals", 0, "events"]);
    if (!Array.isArray(events)) throw new Error("Expected proposal events.");
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      if (getAtPath(feed, ["proposals", 0, "events", eventIndex, "type"]) !== "vote") continue;
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "classification", "delegatedStakingAddress"], zero);
      if (getAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "actorKind"]) !== "delegated_staking_aggregate") continue;
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "actor", "address"], zero);
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "classification", "trace", "emittedAccount"], zero);
      rebindVoteAbi(feed, 0, eventIndex);
    }
    const result = DaoFeedV1Schema.safeParse(feed);
    expect(
      result.success,
      result.success
        ? undefined
        : result.error.issues.map((issue) => issue.message).join("\n")
    ).toBe(true);
  });

  it("rejects Vote logs that the effective disabling state makes impossible", () => {
    const zeroYbc = cloneFeed();
    keepOnlyProposal(zeroYbc, 2);
    const zero = `0x${"00".repeat(20)}`;
    setAtPath(
      zeroYbc,
      ["contracts", 0, "configurationHistory", 0, "ybcAddress"],
      zero
    );
    setAtPath(
      zeroYbc,
      ["contracts", 0, "configurationHistory", 0, "ybcState"],
      "zero_address"
    );
    setAtPath(
      zeroYbc,
      ["proposals", 0, "rules", "mutableConfiguration", "ybcAddress"],
      zero
    );
    setAtPath(
      zeroYbc,
      ["proposals", 0, "rules", "mutableConfiguration", "ybcState"],
      "zero_address"
    );
    for (let eventIndex = 1; eventIndex <= 2; eventIndex += 1) {
      setAtPath(
        zeroYbc,
        [
          "proposals",
          0,
          "events",
          eventIndex,
          "data",
          "classification",
          "ybcAddress",
        ],
        zero
      );
    }
    expectFeedRejected(zeroYbc, /zero YBC.*atomic|effective disabling state/i);

    const zeroHook = cloneFeed();
    keepOnlyProposal(zeroHook, 2);
    setAtPath(
      zeroHook,
      ["contracts", 0, "configurationHistory", 0, "votingHookAddress"],
      zero
    );
    setAtPath(
      zeroHook,
      ["contracts", 0, "configurationHistory", 0, "votingHookState"],
      "zero_address"
    );
    setAtPath(
      zeroHook,
      [
        "proposals",
        0,
        "rules",
        "mutableConfiguration",
        "votingHookAddress",
      ],
      zero
    );
    setAtPath(
      zeroHook,
      [
        "proposals",
        0,
        "rules",
        "mutableConfiguration",
        "votingHookState",
      ],
      "zero_address"
    );
    expectFeedRejected(zeroHook, /positive-weight Vote.*zero hook|effective disabling state/i);
  });

  it("keeps non-Vote lifecycle actor arguments nonzero", () => {
    const feed = cloneFeed();
    keepOnlyProposal(feed, 26);
    const zero = `0x${"00".repeat(20)}`;
    setAtPath(feed, ["proposals", 0, "events", 3, "actor", "address"], zero);
    rebindExecuteAbi(feed, 0, 3);
    expectFeedRejected(feed, /only Vote.*zero actor|non-Vote.*nonzero/i);
  });

  it("binds proposal type to the stored script hash when bytes are missing", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 22, "script", "hash"], EMPTY_SCRIPT_HASH);
    }, /stored script hash.*proposal type|executable.*empty-script/i);

    const missingSignal = cloneFeed();
    keepOnlyProposal(missingSignal, 0);
    const propose = recordAt(missingSignal, ["proposals", 0, "events", 0]);
    const eventId = propose.eventId as string;
    setAtPath(missingSignal, ["proposals", 0, "events", 0, "data", "script"], null);
    setAtPath(missingSignal, ["proposals", 0, "events", 0, "data", "scriptFailure"], {
      code: "EVENT_SCRIPT_UNAVAILABLE",
      message: "The exact signal script bytes were not retained.",
      retryable: true,
      observedAt: feedExample.generatedAt,
      source: "provenance",
    });
    setAtPath(missingSignal, ["proposals", 0, "events", 0, "data", "abi"], {
      state: "unavailable",
      address: getAtPath(missingSignal, ["proposals", 0, "ref", "votingAddress"]),
      topics: getAtPath(missingSignal, ["proposals", 0, "events", 0, "data", "abi", "topics"]),
      data: null,
      matchingLogCount: 1,
      canonicalReencodingMatched: null,
      error: {
        code: "PROPOSE_LOG_BYTES_UNAVAILABLE",
        message: "The raw signal Propose data was not retained.",
        retryable: true,
        observedAt: feedExample.generatedAt,
        source: "provenance",
      },
    });
    setAtPath(missingSignal, ["proposals", 0, "script"], {
      bytes: null,
      hash: EMPTY_SCRIPT_HASH,
      structure: { state: "unavailable", errorCode: null, errorOffset: null },
      hashVerification: { state: "unavailable", computedHash: null },
      retention: {
        state: "missing",
        proposeEventId: eventId,
        error: {
          code: "EVENT_SCRIPT_UNAVAILABLE",
          message: "The exact signal script bytes were not retained.",
          retryable: true,
          observedAt: feedExample.generatedAt,
          source: "provenance",
        },
      },
    });
    setAtPath(missingSignal, ["proposals", 0, "creation"], {
      state: "historical_incomplete",
      transactionHash: getAtPath(missingSignal, ["proposals", 0, "events", 0, "log", "transactionHash"]),
      proposeEventId: eventId,
      receipt: null,
      error: {
        code: "RECEIPT_PROVENANCE_INCOMPLETE",
        message: "Exact Propose bytes are unavailable.",
        retryable: false,
        observedAt: feedExample.generatedAt,
        source: "provenance",
      },
    });
    expect(DaoFeedV1Schema.safeParse(missingSignal).success).toBe(true);
  });

  it("rejects a generic HTTPS host masquerading as GitHub provenance", () => {
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "calls", 0, "verifiedSource", "url"],
        `https://evil.example/yearn/stYFI/blob/${PINNED_CONTRACT_COMMIT}/contracts/governance/Voting.vy`
      );
    }, /exact canonical GitHub source URL|github\.com/i);

    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "calls", 0, "verifiedSource", "repository"],
        "attacker/stYFI"
      );
    }, /bind repository.*exact canonical GitHub source URL/i);
  });

  it("rejects guessed numeric creation time when the Propose block time is absent", () => {
    const proposalIndex = feedExample.proposals.findIndex(
      (proposal) => proposal.events[0]?.log.timestamp === null
    );
    expectRejected((feed) => {
      const log = getAtPath(feed, ["proposals", proposalIndex, "events", 0, "log"]);
      if (log === null || Array.isArray(log) || typeof log !== "object") {
        throw new Error("Expected a Propose log.");
      }
      setAtPath(
        feed,
        ["proposals", proposalIndex, "chainCreatedAt"],
        {
          state: "available",
          timestamp: 1_787_054_400,
          source: "propose_block_timestamp",
          observedAt: {
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            transactionIndex: log.transactionIndex,
            logIndex: log.logIndex,
          },
          error: null,
        }
      );
    }, /creation time.*unavailable|must not guess/i);
  });

  it("requires pinned Voter implementation evidence for actor semantics", () => {
    const parsed = parseDaoFeedV1(feedExample) as unknown as {
      contracts: Array<{
        configurationHistory: Array<{ voterImplementation?: unknown }>;
      }>;
    };
    expect(
      parsed.contracts[0]?.configurationHistory[0]?.voterImplementation
    ).toMatchObject({ state: "verified_pinned" });

    expectRejected((feed) => {
      setAtPath(
        feed,
        ["contracts", 0, "configurationHistory", 0, "voterImplementation", "source", "sourcePath"],
        "contracts/governance/Voting.vy"
      );
    }, /exact pinned Voter GitHub blob URL/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["contracts", 0, "configurationHistory", 0, "voterImplementation", "bytecode", "deployedBytecodeHash"],
        `0x${"ab".repeat(32)}`
      );
    }, /reproducible runtime bytecode equality/i);
  });

  it("retains custom-Voter votes only as unclassified raw events", () => {
    const feed = cloneFeed();
    keepOnlyProposal(feed, 2);
    const customVoter = "0xabababababababababababababababababababab";
    const unverified = {
      state: "unverified",
      address: customVoter,
      source: null,
      sourceSha256: null,
      compiler: null,
      optimization: null,
      evmVersion: null,
      immutableGenesisTimestamp: null,
      compiledRuntimeBytecodeHash: null,
      bytecode: null,
      classificationSemantics: "unclassified",
      error: {
        code: "VOTER_IMPLEMENTATION_UNVERIFIED",
        message: "The custom Voter does not match the pinned Voter build.",
        retryable: false,
        observedAt: feedExample.generatedAt,
        source: "provenance",
      },
    };
    setAtPath(feed, ["contracts", 0, "configurationHistory", 0, "voterAddress"], customVoter);
    setAtPath(feed, ["contracts", 0, "configurationHistory", 0, "voterImplementation"], unverified);
    setAtPath(feed, ["proposals", 0, "rules", "mutableConfiguration", "voterAddress"], customVoter);
    setAtPath(feed, ["proposals", 0, "rules", "mutableConfiguration", "voterImplementation"], unverified);
    setAtPath(feed, ["proposals", 0, "voteAccounting", "humanParticipationCount"], 0);
    const events = getAtPath(feed, ["proposals", 0, "events"]);
    if (!Array.isArray(events)) throw new Error("Expected proposal events.");
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      if (getAtPath(feed, ["proposals", 0, "events", eventIndex, "type"]) !== "vote") continue;
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "actor", "role"], "unknown");
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "actorKind"], "unclassified");
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "direction"], null);
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "countsAsHumanParticipation"], false);
      setAtPath(feed, ["proposals", 0, "events", eventIndex, "data", "classification"], {
        method: "unverified_voter_unclassified",
        configurationId: "config-1",
        voterAddress: customVoter,
        delegatedStakingAddress: null,
        ybcAddress: null,
        ybcWeightAggregatorAddress: null,
        voterImplementationState: "unverified",
        observedAt: getAtPath(feed, ["contracts", 0, "configurationHistory", 0, "effectiveAt"]),
        observationSemantics: "effective_at_event",
        trace: null,
      });
    }
    expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);

    setAtPath(feed, ["proposals", 0, "events", 1, "data", "actorKind"], "human");
    expectFeedRejected(feed, /effective historical configuration.*Vote event|Pinned Voter/i);
  });

  it("requires explicit transaction-origin equivalence for completed simulation", () => {
    const parsed = parseDaoFeedV1(feedExample) as unknown as {
      proposals: Array<{
        analysis: {
          proposalSimulation: {
            state: string;
            originPolicy?: unknown;
            frameContext?: { gasContext?: unknown };
          };
        };
      }>;
    };
    const completed = parsed.proposals
      .map((proposal) => proposal.analysis.proposalSimulation)
      .find((simulation) => simulation.state === "succeeded");
    expect(completed?.originPolicy).toMatchObject({
      state: "frozen_hypothetical_scenario",
    });
    expect(completed?.frameContext?.gasContext).toMatchObject({
      transactionEnvelope: "synthetic_legacy_no_blobs",
      accessList: [],
      initialWarmSetPolicy:
        "cancun_frame_entry_origin_voting_executor_and_precompiles_no_storage",
    });

    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "transactionOrigin"],
        "0x9999999999999999999999999999999999999999"
      );
    }, /frozen Propose-sender origin scenario/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "frameContext", "noCodeOverrides"],
        false
      );
    }, /expected true/i);
    expectRejected((feed) => {
      const frameContext = recordAt(feed, [
        "proposals",
        4,
        "analysis",
        "proposalSimulation",
        "frameContext",
      ]);
      delete frameContext.gasContext;
    }, /expected object/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        [
          "proposals",
          4,
          "analysis",
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "executorFrameInitialGas",
        ],
        "0"
      );
    }, /must match pattern/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        [
          "proposals",
          4,
          "analysis",
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "effectiveGasPriceWei",
        ],
        "01"
      );
    }, /must match pattern/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        [
          "proposals",
          4,
          "analysis",
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "transactionEnvelope",
        ],
        "eip1559"
      );
    }, /synthetic_legacy_no_blobs/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        [
          "proposals",
          4,
          "analysis",
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "accessList",
        ],
        ["0x1111111111111111111111111111111111111111"]
      );
    }, /too big/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        [
          "proposals",
          4,
          "analysis",
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "initialWarmSetPolicy",
        ],
        "all_addresses_and_storage"
      );
    }, /cancun_frame_entry_origin_voting_executor_and_precompiles_no_storage/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        [
          "proposals",
          4,
          "analysis",
          "proposalSimulation",
          "frameContext",
          "gasContext",
          "contextInputsSha256",
        ],
        `0x${"ab".repeat(32)}`
      );
    }, /context input commitment/i);
  });

  it("accepts the authoritative Proposals forum root pin", () => {
    const feed = cloneFeed();
    expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);

    setAtPath(feed, ["proposals", 0, "discussion", "categoryId"], 9);
    setAtPath(feed, ["proposals", 0, "discussion", "category"], "Vaults");
    setAtPath(
      feed,
      ["proposals", 0, "discussion", "categorySlugPath"],
      ["proposals", "vaults"]
    );
    setAtPath(
      feed,
      ["proposals", 0, "discussion", "categoryAncestryIds"],
      [5, 9]
    );
    setAtPath(feed, ["proposals", 0, "discussion", "membership"], "descendant");
    expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);

    setAtPath(
      feed,
      ["proposals", 0, "discussion", "categoryAncestryIds"],
      [9]
    );
    expectFeedRejected(feed, /exact Proposals root 5 ancestry/i);
  });

  it("retains schema-invalid fetched bytes without imposing a final LF", () => {
    const feed = cloneFeed();
    const raw = "{";
    const digest = sha256(new TextEncoder().encode(raw));
    setAtPath(
      feed,
      ["proposals", 14, "content", "rawBytesBase64"],
      btoa(raw)
    );
    setAtPath(feed, ["proposals", 14, "content", "byteLength"], 1);
    setAtPath(feed, ["proposals", 14, "content", "computedDigest"], digest);
    setAtPath(
      feed,
      ["proposals", 14, "content", "computedCid"],
      createDaoRawSha256Cid(digest)
    );
    expect(DaoFeedV1Schema.safeParse(feed).success).toBe(true);

    const nonUtf8 = cloneFeed();
    const bytes = Uint8Array.from([0, 255]);
    const byteDigest = sha256(bytes);
    setAtPath(nonUtf8, ["proposals", 14, "content", "rawBytesBase64"], "AP8=");
    setAtPath(nonUtf8, ["proposals", 14, "content", "byteLength"], 2);
    setAtPath(nonUtf8, ["proposals", 14, "content", "computedDigest"], byteDigest);
    setAtPath(nonUtf8, ["proposals", 14, "content", "computedCid"], createDaoRawSha256Cid(byteDigest));
    expect(DaoFeedV1Schema.safeParse(nonUtf8).success).toBe(true);

    setAtPath(nonUtf8, ["proposals", 14, "content", "rawBytesBase64"], "AP8");
    expectFeedRejected(nonUtf8, /canonical RFC 4648 Base64|must match pattern/i);
  });

  it("rejects retry attempts and failures observed after the snapshot", () => {
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 13, "content", "retry", "lastAttemptAt"],
        "2027-08-18T12:02:00Z"
      );
      setAtPath(
        feed,
        ["proposals", 13, "content", "error", "observedAt"],
        "2027-08-18T12:02:00Z"
      );
    }, /snapshot|feed generation|cannot follow/i);

    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 13, "content", "error", "retryable"], true);
      setAtPath(feed, ["proposals", 13, "content", "error", "observedAt"], "2026-08-18T12:01:00Z");
      setAtPath(feed, ["proposals", 13, "content", "retry"], {
        state: "scheduled",
        attempts: 1,
        maxAttempts: 8,
        lastAttemptAt: "2026-08-18T12:01:00Z",
        nextRetryAt: "2026-08-18T12:04:00Z",
        policy: "fixed_120_seconds",
        backoffSeconds: 120,
      });
    }, /lastAttemptAt plus its positive bounded backoff/i);

    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 13, "content", "retry", "lastAttemptAt"], "2026-08-18T12:01:00Z");
    }, /failure observedAt must equal.*last-attempt/i);
  });

  it("enforces block-global logIndex uniqueness across transactions", () => {
    expectRejected((feed) => {
      const log = getAtPath(feed, ["proposals", 1, "events", 4, "log"]);
      if (log === null || Array.isArray(log) || typeof log !== "object") {
        throw new Error("Expected a lifecycle event log.");
      }
      log.logIndex = 1;
      setAtPath(
        feed,
        ["proposals", 1, "events", 4, "eventId"],
        createDaoFeedEventId(1, feedExample.proposals[1]!.ref.votingAddress, {
          blockHash: log.blockHash as Hex,
          transactionIndex: log.transactionIndex as number,
          logIndex: 1,
        })
      );
    }, /logIndex must be block-global|log index.*block/i);
  });
});
