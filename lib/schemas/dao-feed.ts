import { z } from "./zod";

export const DAO_FEED_SCHEMA_ID = "yearn.dao.feed.v2";
export const DAO_FEED_MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
export const DAO_FEED_MAX_PROPOSALS = 10_000;
export const DAO_FEED_MAX_EVENTS = 100_000;
export const DAO_CONTENT_MAX_BYTES = 131_072;
export const DAO_EPOCH_SECONDS = 1_209_600;
export const DAO_MAX_TIMESTAMP = 253_402_300_799; // Last second of year 9999 UTC.
const UINT256_MAX = (2n ** 256n - 1n).toString();

// JSON Schema covers decimal syntax; the uint256 maximum is checked below.
export const DaoUintSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
export const DaoAddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/);
export const DaoHashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const seconds = z.number().int().min(0).max(DAO_MAX_TIMESTAMP);
const index = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const script = z.string().regex(/^0x(?:[0-9a-f]{2})*$/).max(4098);
const position = z.strictObject({
  blockNumber: DaoUintSchema,
  blockHash: DaoHashSchema,
  timestamp: seconds,
  transactionHash: DaoHashSchema,
  transactionIndex: index,
  logIndex: index,
});

export const DaoTimelineEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("propose"), log: position }),
  z.strictObject({ type: z.literal("retract"), log: position }),
  z.strictObject({ type: z.literal("flag"), log: position, reason: z.string().max(256) }),
  z.strictObject({ type: z.literal("veto"), log: position, reason: z.string().max(256) }),
  z.strictObject({ type: z.literal("execute"), log: position, executor: DaoAddressSchema }),
  z.strictObject({
    type: z.literal("vote"), log: position,
    account: DaoAddressSchema, weight: DaoUintSchema, yea: DaoUintSchema,
  }),
]);

export const DaoSnapshotConfigurationSchema = z.strictObject({
  voteStart: DaoUintSchema,
  executeDelay: DaoUintSchema,
  executeGuard: z.boolean(),
  threshold: DaoUintSchema,
  voter: DaoAddressSchema,
  executor: DaoAddressSchema,
});

export const DaoProposalWireSchema = z.strictObject({
  votingAddress: DaoAddressSchema,
  id: DaoUintSchema,
  proposer: DaoAddressSchema,
  epoch: DaoUintSchema,
  contentDigest: DaoHashSchema,
  scriptHash: DaoHashSchema,
  threshold: DaoUintSchema,
  votes: DaoUintSchema,
  yea: DaoUintSchema,
  retracted: z.boolean(),
  executed: z.boolean(),
  flagged: z.boolean(),
  vetoed: z.boolean(),
  status: z.enum(["PROPOSED", "RETRACTED", "VOTING", "PASSED", "FAILED", "EXECUTED", "EXPIRED", "FLAGGED", "VETOED"]),
  scriptBytes: script.nullable(),
  // Exact raw content block bytes. Bad encoding/content is an enrichment
  // failure, not an envelope rejection.
  contentBytes: z.string().max(4 * Math.ceil(DAO_CONTENT_MAX_BYTES / 3)).nullable(),
  events: z.array(DaoTimelineEventSchema).min(1).max(DAO_FEED_MAX_EVENTS),
});

export const DaoFeedSchema = z.strictObject({
  schema: z.literal(DAO_FEED_SCHEMA_ID),
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  observedAt: seconds,
  block: z.strictObject({ number: DaoUintSchema, hash: DaoHashSchema, timestamp: seconds }),
  deployments: z.array(z.strictObject({
    votingAddress: DaoAddressSchema,
    proposalCount: DaoUintSchema,
    configuration: DaoSnapshotConfigurationSchema,
  })).min(1).max(8),
  proposals: z.array(DaoProposalWireSchema).max(DAO_FEED_MAX_PROPOSALS),
});

export type DaoFeedWire = z.infer<typeof DaoFeedSchema>;
export type DaoProposalWire = z.infer<typeof DaoProposalWireSchema>;
export type DaoTimelineEventWire = z.infer<typeof DaoTimelineEventSchema>;

export class DaoFeedError extends Error {
  constructor(public readonly kind: "incompatible" | "invalid" | "unavailable" | "oversized" | "timeout", message: string) {
    super(message);
    this.name = "DaoFeedError";
  }
}

function requireFact(condition: boolean, message: string): asserts condition {
  if (!condition) throw new DaoFeedError("invalid", message);
}

function assertUint(value: string): void {
  requireFact(value.length < 78 || value <= UINT256_MAX, "DAO integer exceeds uint256.");
}

export function validateDaoConfiguration(
  c: DaoFeedWire["deployments"][number]["configuration"],
): void {
  [c.voteStart, c.executeDelay, c.threshold].forEach(assertUint);
  requireFact(
    BigInt(c.voteStart) <= BigInt(DAO_EPOCH_SECONDS) &&
      BigInt(c.executeDelay) < BigInt(DAO_EPOCH_SECONDS) &&
      BigInt(c.threshold) <= 10_000n,
    "Snapshot configuration is out of bounds.",
  );
}

export function validateDaoStoredFacts(p: DaoProposalWire): void {
  requireFact(
    BigInt(p.threshold) <= 10_000n && BigInt(p.yea) <= BigInt(p.votes),
    "Invalid stored vote facts.",
  );
  requireFact(!p.flagged || p.retracted, "Flag must retain retracted state.");
  const flagStatus = p.executed ? "EXECUTED"
    : p.flagged ? "FLAGGED"
    : p.vetoed ? "VETOED"
    : p.retracted ? "RETRACTED"
    : null;
  requireFact(
    flagStatus ? p.status === flagStatus : !["FLAGGED", "VETOED", "RETRACTED"].includes(p.status),
    "Status contradicts stored lifecycle flags.",
  );
}

/** Concrete consistency checks only. The observed status is not replayed. */
export function validateDaoFeedSemantics(feed: DaoFeedWire): void {
  assertUint(feed.block.number);
  requireFact(feed.observedAt >= feed.block.timestamp, "Observation precedes snapshot block.");
  const deployments = new Map(feed.deployments.map((d) => [d.votingAddress, d]));
  requireFact(deployments.size === feed.deployments.length, "Duplicate DAO deployment.");
  const nextId = new Map<string, bigint>();
  for (const d of feed.deployments) {
    assertUint(d.proposalCount);
    const c = d.configuration;
    validateDaoConfiguration(c);
    nextId.set(d.votingAddress, 0n);
  }
  let eventCount = 0;
  let previousDeployment = -1;
  const logIds = new Set<string>();
  const blocks = new Map<string, string>();
  blocks.set(feed.block.number, feed.block.hash + ":" + feed.block.timestamp);
  for (const p of feed.proposals) {
    const deploymentIndex = feed.deployments.findIndex((d) => d.votingAddress === p.votingAddress);
    requireFact(
      deploymentIndex >= previousDeployment && deployments.has(p.votingAddress),
      "Unknown or unordered proposal deployment.",
    );
    previousDeployment = deploymentIndex;
    [p.id, p.epoch, p.threshold, p.votes, p.yea].forEach(assertUint);
    requireFact(BigInt(p.id) === nextId.get(p.votingAddress), "Proposal identities must be unique and complete from ID zero.");
    nextId.set(p.votingAddress, BigInt(p.id) + 1n);
    validateDaoStoredFacts(p);
    requireFact(
      p.events[0].type === "propose" && p.events.filter((e) => e.type === "propose").length === 1,
      "Timeline needs one initial Propose.",
    );
    let previous: DaoTimelineEventWire["log"] | null = null;
    for (const e of p.events) {
      eventCount++;
      const l = e.log;
      assertUint(l.blockNumber);
      requireFact(
        BigInt(l.blockNumber) <= BigInt(feed.block.number) && l.timestamp <= feed.block.timestamp,
        "Event follows snapshot.",
      );
      const identity = l.blockHash + ":" + l.timestamp;
      requireFact(!blocks.has(l.blockNumber) || blocks.get(l.blockNumber) === identity, "Conflicting event block identity.");
      blocks.set(l.blockNumber, identity);
      const key = l.blockNumber + ":" + l.logIndex;
      requireFact(!logIds.has(key), "Duplicate canonical log.");
      logIds.add(key);
      if (previous) {
        requireFact(
          BigInt(l.blockNumber) > BigInt(previous.blockNumber) ||
            (l.blockNumber === previous.blockNumber &&
              l.logIndex > previous.logIndex &&
              l.transactionIndex >= previous.transactionIndex),
          "Unordered proposal timeline.",
        );
      }
      previous = l;
      if (e.type === "vote") {
        [e.weight, e.yea].forEach(assertUint);
        requireFact(BigInt(e.yea) <= 10_000n, "Vote.yea is basis points.");
      }
      if (e.type === "flag" || e.type === "veto") {
        requireFact(
          new TextEncoder().encode(e.reason).length <= 256,
          "Moderation reason exceeds ABI byte bound.",
        );
      }
    }
  }
  requireFact(eventCount <= DAO_FEED_MAX_EVENTS, "Too many DAO events.");
  for (const d of feed.deployments) {
    requireFact(
      nextId.get(d.votingAddress) === BigInt(d.proposalCount),
      "Incomplete proposal acquisition.",
    );
  }
}

export function parseDaoFeed(value: unknown): DaoFeedWire {
  if (typeof value === "object" && value !== null && "schema" in value && value.schema !== DAO_FEED_SCHEMA_ID) {
    throw new DaoFeedError("incompatible", "Unsupported DAO feed version; expected yearn.dao.feed.v2.");
  }
  const parsed = DaoFeedSchema.safeParse(value);
  if (!parsed.success) throw new DaoFeedError("invalid", "Invalid DAO feed envelope.");
  validateDaoFeedSemantics(parsed.data);
  return parsed.data;
}

export function parseDaoFeedResponse(text: string): DaoFeedWire {
  if (new TextEncoder().encode(text).length > DAO_FEED_MAX_PAYLOAD_BYTES) {
    throw new DaoFeedError("oversized", "DAO feed exceeds the payload budget.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DaoFeedError("invalid", "DAO feed is not JSON.");
  }
  return parseDaoFeed(value);
}
