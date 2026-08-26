import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { keccak256, sha256 } from "viem";
import feedExample from "@/docs/apps/dao/examples/feed-v1/dao-feed-v1.example.json";
import identityStages from "@/docs/apps/dao/examples/feed-v1/dao-creation-stages-v1.example.json";
import mockStateMap from "@/docs/apps/dao/examples/feed-v1/dao-mock-state-map-v1.example.json";
import rejectionVectors from "@/docs/apps/dao/examples/feed-v1/dao-feed-v1.rejections.json";
import jsonSchema from "@/docs/apps/dao/feed-schema-v1.schema.json";
import {
  DAO_FEED_SCHEMA_ID,
  DAO_FEED_SCHEMA_VERSION,
  DaoCreationIdentityStageV1Schema,
  DaoFeedV1Schema,
  createDaoFeedEventId,
  parseDaoCreationIdentityStageV1,
  parseDaoFeedV1,
} from "@/lib/schemas/dao-feed";

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
      "lib/schemas/dao-feed.ts#parseDaoFeedV1"
    );
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
    }, /next retry/i);
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "reorg", "state"], "recovered");
    }, /recovered reorg/i);
    expectRejected((feed) => {
      setAtPath(feed, ["publication", "counts", "events"], 999);
    }, /event count/i);
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
    }, /pinned voting revision/i);
    expectRejected((feed) => {
      setAtPath(feed, ["contracts", 0, "source", "url"], "https://user@example.com/source");
    }, /credentials/i);
  });
});

describe("DaoFeedV1Schema proposal identities and rules", () => {
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
      setAtPath(feed, ["proposals", 0, "voteEndsAt"], 1_787_680_800);
    }, /voting period/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "createdAt"], 1_787_054_401);
    }, /propose event timestamp/i);
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
});

describe("DaoFeedV1Schema content and script integrity", () => {
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

    expect(relative.content.canonicalJson.endsWith("\n")).toBe(true);
    expect(relative.content.canonicalJson.endsWith("\n\n")).toBe(false);
    expect(sha256(new TextEncoder().encode(relative.content.canonicalJson))).toBe(
      relative.content.digest
    );
    expect(relative.content.value.markdown).toContain("./assets/governance-flow.svg");
    expect(direct.content.value.markdown).toContain("ipfs://bafkrei");
    expect(relative.content.value.assets[0]?.digest).toBe(
      direct.content.value.assets[0]?.digest
    );
  });

  it("rejects canonical-byte, digest, CID, source, and manifest substitutions", () => {
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "content", "canonicalJson"], "{}\n");
    }, /fixed-order canonical json/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 0, "content", "digest"],
        `0x${"aa".repeat(32)}`
      );
    }, /content digest/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "content", "cid"], "bafk-invalid");
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
    }, /image dimensions/i);
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
      expect(keccak256(executable.script.bytes)).toBe(executable.script.hash);
    }

    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "script", "hashVerification", "state"], "mismatch");
    }, /hash verification/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 0, "script", "bytes"], null);
    }, /script retention/i);
  });
});

describe("DaoFeedV1Schema event, receipt, and actor provenance", () => {
  it("retains full event identity and nullable transaction/time provenance", () => {
    const parsed = parseDaoFeedV1(feedExample);
    const events = parsed.proposals.flatMap((proposal) => proposal.events);
    for (const event of events) {
      expect(event.eventId).toBe(
        createDaoFeedEventId(parsed.chainId, event.proposalRef.votingAddress, event.log)
      );
    }
    expect(
      events.some(
        (event) =>
          event.log.timestamp === null && event.log.transactionHash === null
      )
    ).toBe(true);
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
      setAtPath(feed, ["proposals", 10, "moderation", "flagReason"], "Substituted");
    }, /flag reason/i);
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
    }, /creation propose event/i);
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
    }, /unknown calls.*verified source/i);
  });

  it("rejects time-gated Voting.execute and incomplete or contradictory simulation provenance", () => {
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "method"],
        "voting_execute_at_proposal_block"
      );
    }, /direct executor\.execute/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "blockHash"],
        `0x${"dd".repeat(32)}`
      );
    }, /proposal event block/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "caller"],
        "0x9999999999999999999999999999999999999999"
      );
    }, /execution-equivalent caller/i);
    expectRejected((feed) => {
      setAtPath(feed, ["proposals", 17, "analysis", "proposalSimulation", "state"], "unavailable");
    }, /unavailable simulation provenance/i);
    expectRejected((feed) => {
      setAtPath(
        feed,
        ["proposals", 4, "analysis", "proposalSimulation", "timestampOverride"],
        1_787_054_401
      );
    }, /timestamp override/i);
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
      const proposal = parsed.proposals.find(
        (candidate) =>
          candidate.ref.chainId === entry.proposalRef.chainId &&
          candidate.ref.votingAddress.toLowerCase() ===
            entry.proposalRef.votingAddress.toLowerCase() &&
          candidate.ref.proposalId === entry.proposalRef.proposalId
      );
      expect(proposal, entry.fixture).toBeDefined();
      if (entry.fixture === "proposal-capacity-full") {
        expect(entry.representation).toBe("consumer_wallet_overlay");
      } else {
        expect(entry.representation).toBe("feed_proposal");
      }
    }
  });
});

describe("DAO schema artifact integrity", () => {
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
