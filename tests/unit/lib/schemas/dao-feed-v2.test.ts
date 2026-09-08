import { describe, expect, it } from "vitest";
import { sha256 } from "viem";
import Ajv from "ajv";
import acceptance from "@/docs/apps/dao/examples/feed-v2/acceptance-cases.json";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";
import jsonSchema from "@/docs/apps/dao/feed-schema-v2.schema.json";
import { parseDaoFeed, parseDaoFeedResponse, DAO_FEED_MAX_PAYLOAD_BYTES, type DaoFeedWire } from "@/lib/schemas/dao-feed";
import { parseDaoDeployments } from "@/lib/clients/dao/deployment";
import { adaptDaoFeed } from "@/lib/clients/dao/feed-adapter";
import { deriveDaoLifecycleFacts, deriveDaoProposalExecutionReadiness } from "@/lib/clients/dao/domain";
import { V2_DEPLOYMENTS, V2_ACCOUNT, v2Base64, v2Content } from "@/tests/fixtures/dao-feed-v2";

const accepts = new Ajv({ allErrors: true }).compile(jsonSchema);
const wire = () => structuredClone(saved) as DaoFeedWire;
const snapshot = () => adaptDaoFeed(parseDaoFeed(wire()), V2_DEPLOYMENTS);

describe("DAO V2 public acceptance", () => {
  it("accepts saved bytes through ordinary JSON Schema and the actual consumer", () => {
    expect(accepts(saved), JSON.stringify(accepts.errors)).toBe(true);
    expect(parseDaoFeedResponse(JSON.stringify(saved)).proposals).toHaveLength(27);
    expect(snapshot().proposals[0].ref.proposalId).toBe(0n);
    expect(snapshot().proposals[24].totalWeight).toBe(10n ** 40n);
  });
  it("accepts empty history and two configured deployments with ID zero", () => {
    const empty = wire(); empty.proposals = []; empty.deployments[0].proposalCount = "0";
    expect(accepts(empty)).toBe(true);
    expect(parseDaoFeed(empty).proposals).toEqual([]);
    const multi = wire();
    const second = "0x9999999999999999999999999999999999999999" as const;
    multi.proposals = [multi.proposals[0], { ...structuredClone(multi.proposals[0]), votingAddress: second }];
    multi.proposals[1].events = [{ type: "propose", log: { ...multi.proposals[1].events[0].log, logIndex: 999, transactionIndex: 999 } }];
    multi.deployments[0].proposalCount = "1";
    multi.deployments.push({ ...structuredClone(multi.deployments[0]), votingAddress: second });
    expect(accepts(multi)).toBe(true);
    const adapted = adaptDaoFeed(parseDaoFeed(multi), [...V2_DEPLOYMENTS, { ...V2_DEPLOYMENTS[0], votingAddress: second, active: false }]);
    expect(adapted.proposals.map((p) => p.ref.proposalId)).toEqual([0n, 0n]);
    expect(new Set(adapted.proposals.map((p) => p.ref.votingAddress)).size).toBe(2);
  });
  it.each(["00", "-1", "1.0", "1e18", " 1", ""])("rejects malformed numeric string %j in both validators", (value) => {
    const feed = wire(); feed.proposals[0].votes = value;
    expect(accepts(feed)).toBe(false);
    expect(() => parseDaoFeed(feed)).toThrow();
  });
  it("rejects uint256 overflow through the documented semantic check", () => {
    const feed = wire(); feed.proposals[0].votes = (2n ** 256n).toString();
    expect(accepts(feed)).toBe(true);
    expect(() => parseDaoFeed(feed)).toThrow(/uint256/);
  });
  it("accepts only app-supported mainnet deployment configuration", () => {
    expect(parseDaoDeployments(JSON.stringify(V2_DEPLOYMENTS))).toHaveLength(1);
    expect(() => parseDaoDeployments(JSON.stringify(V2_DEPLOYMENTS.map(d => ({ ...d, chainId: 10 }))))).toThrow();
  });
  it("rejects unknown deployments, wrong chain, duplicate identities and incomplete coverage", () => {
    const unknown = wire(); unknown.proposals[0].votingAddress = "0x9999999999999999999999999999999999999999";
    expect(() => parseDaoFeed(unknown)).toThrow();
    const chain = wire(); chain.chainId = 10;
    expect(() => adaptDaoFeed(parseDaoFeed(chain), V2_DEPLOYMENTS)).toThrow(/configured chain/);
    const duplicate = wire(); duplicate.proposals[1].id = "0";
    expect(() => parseDaoFeed(duplicate)).toThrow(/identities/);
    const incomplete = wire(); incomplete.proposals.pop();
    expect(() => parseDaoFeed(incomplete)).toThrow(/Incomplete/);
  });
  it("rejects V1 explicitly and enforces payload and content bounds", () => {
    expect(() => parseDaoFeed({ schema: "yearn.dao.feed.v1" })).toThrow(/Unsupported DAO feed version/);
    expect(() => parseDaoFeedResponse(" ".repeat(DAO_FEED_MAX_PAYLOAD_BYTES + 1))).toThrow(/budget/);
    const feed = wire(); feed.proposals[0].contentBytes = "A".repeat(200_000);
    expect(accepts(feed)).toBe(false);
    expect(() => parseDaoFeed(feed)).toThrow(/envelope/);
  });
  it("separates structural acceptance from lifecycle flag consistency", () => {
    const feed = wire(); feed.proposals[6].status = "PASSED";
    expect(accepts(feed)).toBe(true);
    expect(() => parseDaoFeed(feed)).toThrow(/flags/);
    feed.proposals[6].status = "FLAGGED"; feed.proposals[6].retracted = false;
    expect(() => parseDaoFeed(feed)).toThrow(/Flag/);
  });
});

describe("DAO V2 interpretation", () => {
  it("maps observed status and signal completion without inventing execution", () => {
    expect(snapshot().proposals.slice(0, 11).map((p) => p.displayStatus)).toEqual([
      "voting", "discussion", "approved", "rejected", "expired", "retracted",
      "flagged", "vetoed", "vetoed", "approved", "executed",
    ]);
    const signal = snapshot().proposals[9];
    expect(signal.protocolStatus).toBe("executed");
    expect(signal.executed).toBe(false);
    expect(signal.events.some((e) => e.type === "execute")).toBe(false);
    expect(deriveDaoProposalExecutionReadiness(signal).state).toBe("not_applicable");
  });
  it("uses stored flags for Flag and both Veto paths, including zero totals after replacement", () => {
    const feed = snapshot();
    expect(feed.proposals[6]).toMatchObject({ flagged: true, retracted: true });
    expect(deriveDaoLifecycleFacts(feed.proposals[7], saved.block.timestamp).moderation.votingAvailable).toBe(false);
    expect(deriveDaoLifecycleFacts(feed.proposals[8], saved.block.timestamp).moderation.votingAvailable).toBe(true);
    const replaced = feed.proposals[23];
    expect(replaced).toMatchObject({ vetoed: true, retracted: false, totalWeight: 0n });
    expect(deriveDaoLifecycleFacts(replaced, saved.block.timestamp).moderation.votingAvailable).toBe(true);
    expect(deriveDaoLifecycleFacts(replaced, saved.block.timestamp).moderation).not.toHaveProperty("phase");
  });
  it("preserves zero account, zero weight, replacement history and honest event actors", () => {
    const feed = snapshot();
    expect(feed.proposals[20].events[2]).toMatchObject({ actor: "0x0000000000000000000000000000000000000000", weight: 0n, yeaBps: 0 });
    expect(feed.proposals[21].totalWeight).toBe(0n);
    expect(feed.proposals[21].events[1]).toMatchObject({ weight: 250000000000000000000n, yeaBps: 6000 });
    expect(feed.proposals[6].events[1].actor).toBeNull();
    expect(feed.proposals[10].events.at(-1)?.actor).toBe(V2_ACCOUNT);
  });
  it("accepts observed status and config changes without logs while keeping the stored threshold", () => {
    const feed = wire(); const events = structuredClone(feed.proposals[0].events);
    feed.deployments[0].configuration.voteStart = "1209600";
    feed.proposals[0].status = "PROPOSED";
    const updated = adaptDaoFeed(parseDaoFeed(feed), V2_DEPLOYMENTS);
    expect(updated.proposals[0].displayStatus).toBe("discussion");
    expect(updated.proposals[0].rules.votingPeriodSeconds).toBe(0);
    expect(updated.proposals[0].thresholdBps).toBe(5000);
    expect(feed.proposals[0].events).toEqual(events);
  });
  it("distinguishes exact, empty, missing, mismatched, malformed and unknown scripts", () => {
    const feed = snapshot();
    expect(deriveDaoProposalExecutionReadiness(feed.proposals[0]).state).toBe("integrity_ready");
    expect(feed.proposals[11].script.bytes).toBe("0x");
    expect(deriveDaoProposalExecutionReadiness(feed.proposals[12])).toMatchObject({ blocker: "exact_script_unavailable" });
    expect(deriveDaoProposalExecutionReadiness(feed.proposals[13])).toMatchObject({ blocker: "stored_script_hash_mismatch" });
    expect(deriveDaoProposalExecutionReadiness(feed.proposals[14])).toMatchObject({ blocker: "malformed_script" });
    expect(feed.proposals[15].analysis.calls[0]).toMatchObject({ target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", calldata: "0xdeadbeef", decodeStatus: "unknown" });
    expect(adaptDaoFeed(parseDaoFeed(wire()), V2_DEPLOYMENTS.map((d) => ({ ...d, supportedExecutors: [] }))).proposals[0].analysis.calls).toEqual([]);
  });
  it("isolates missing, malformed, digest-mismatched, unsafe and invalid-base64 content", () => {
    const feed = snapshot();
    expect(feed.proposals[0].content.state).toBe("available");
    expect(feed.proposals[16].content.state).toBe("unavailable");
    expect(feed.proposals[17].content.state).toBe("invalid");
    expect(feed.proposals[18].content.error).toMatch(/digest/);
    expect(feed.proposals[19].content.error).toMatch(/HTML/);
    expect(feed.proposals[25].discussion).toMatchObject({ state: "unverified", url: null });
    const bad = wire(); bad.proposals[0].contentBytes = "%%%";
    expect(accepts(bad)).toBe(true);
    const content = adaptDaoFeed(parseDaoFeed(bad), V2_DEPLOYMENTS).proposals[0].content;
    expect(content.state).toBe("invalid");
    expect(content.digest).toBe(bad.proposals[0].contentDigest);
  });

  it.each([false, true])("checks original canonical bytes, including non-ASCII text (BOM: %s)", bom => {
    const canonical = v2Content("# Café governance 日本語\n\nReview the treasury policy.\n\n## Details\n\nRecord the approved policy in the public forum.\n");
    const bytes = bom ? new Uint8Array([0xef, 0xbb, 0xbf, ...canonical]) : canonical;
    const feed = wire();
    feed.proposals[0].contentBytes = v2Base64(bytes);
    feed.proposals[0].contentDigest = sha256(bytes);
    const parsed = adaptDaoFeed(parseDaoFeed(feed), V2_DEPLOYMENTS);
    expect(parsed.proposals).toHaveLength(27);
    expect(parsed.proposals[1].content.state).toBe("available");
    const content = parsed.proposals[0].content;
    expect(content.computedDigest).toBe(feed.proposals[0].contentDigest);
    expect(content.state).toBe(bom ? "invalid" : "available");
    if (bom) expect(content.error).toMatch(/not canonical JSON/);
    else expect(content.value?.markdown).toContain("Café governance 日本語");
  });
});

describe("portable V2 acceptance mutations", () => {
  it.each(acceptance.cases)("$name agrees with shared schema and consumer expectations", testCase => {
    const value = structuredClone(saved);
    for (const mutation of testCase.set) {
      let target: unknown = value;
      for (const key of mutation.path.slice(0, -1)) target = (target as Record<string | number, unknown>)[key];
      (target as Record<string | number, unknown>)[mutation.path.at(-1)!] = mutation.value;
    }
    expect(accepts(value)).toBe(testCase.schema);
    const consume = () => adaptDaoFeed(parseDaoFeed(value), V2_DEPLOYMENTS);
    if (testCase.consumer) expect(consume).not.toThrow();
    else expect(consume).toThrow();
  });
});
