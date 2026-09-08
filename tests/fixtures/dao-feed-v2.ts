// Synthetic scenarios derived from the pinned source, not producer or node output.
// The saved response and evidence README are the cross-language review artifacts.
import { keccak256, sha256, type Hex } from "viem";
import { canonicalizeDaoProposalContent } from "@/lib/clients/dao/content";
import type { DaoDeployment } from "@/lib/clients/dao/deployment";
import type { DaoFeedWire, DaoProposalWire, DaoTimelineEventWire } from "@/lib/schemas/dao-feed";

export const V2_NOW = 1_787_054_400;
export const V2_GENESIS = 1_543_946_400;
export const V2_VOTING = "0x1111111111111111111111111111111111111111";
export const V2_VOTER = "0x2222222222222222222222222222222222222222";
export const V2_EXECUTOR = "0x3333333333333333333333333333333333333333";
export const V2_ACCOUNT = "0x4444444444444444444444444444444444444444";
export const V2_SCRIPT = ("0x" + "aa".repeat(20) + "000000000000000000000004" + "deadbeef") as Hex;
export const V2_DEPLOYMENTS: DaoDeployment[] = [{
  chainId: 1, votingAddress: V2_VOTING, deploymentBlock: "23000000",
  genesis: V2_GENESIS, active: true,
  supportedVoters: [V2_VOTER], supportedExecutors: [V2_EXECUTOR],
}];
export function v2Hash(number: number): Hex { return ("0x" + number.toString(16).padStart(64, "0")) as Hex; }
export function v2Base64(bytes: Uint8Array): string { return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")); }

export function v2Content(markdown = "# Review the treasury policy\n\nA proposal to document treasury decisions.\n\n## Details\n\nRecord the approved policy in the public forum.\n"): Uint8Array {
  return canonicalizeDaoProposalContent({
    schema: "yearn.dao.proposal.v1", markdown, discussionUrl: "https://gov.yearn.fi/t/treasury-policy/1234",
    proposalType: "executable", createdBy: V2_ACCOUNT, createdAt: "2026-07-01T00:00:00Z", assets: [],
  });
}

function event(type: DaoTimelineEventWire["type"], id: number, order: number, timestamp: number): DaoTimelineEventWire {
  const blockNumber = 23_000_000 + Math.floor((timestamp - V2_GENESIS) / 12);
  const log = { blockNumber: String(blockNumber), blockHash: v2Hash(blockNumber), timestamp,
    transactionHash: v2Hash(1000 + id * 20 + order), transactionIndex: id, logIndex: id * 20 + order };
  if (type === "vote") return { type, log, account: V2_ACCOUNT, weight: "250000000000000000000", yea: "6000" };
  if (type === "flag" || type === "veto") return { type, log, reason: "Recorded moderation reason" };
  if (type === "execute") return { type, log, executor: V2_ACCOUNT };
  return { type, log };
}

const CASES = [
  "voting", "proposed", "passed", "failed", "expired", "retracted", "flagged",
  "early-veto", "votable-veto", "signal-complete", "executed", "empty-script",
  "missing-script", "mismatch-script", "malformed-script", "unknown-call",
  "content-unavailable", "content-malformed", "content-mismatch", "content-unsafe",
  "zero-vote", "replacement-votes", "threshold-6000", "veto-zero-after-replacement",
  "large-weight", "direct-content", "signal-passed",
] as const;

export function createV2Example(): DaoFeedWire {
  const proposals = CASES.map((scenario, id): DaoProposalWire => {
    const future = scenario === "proposed" || scenario === "retracted" || scenario === "flagged" || scenario === "early-veto";
    const old = ["expired", "signal-complete", "executed"].includes(scenario);
    const afterVoting = old || ["passed", "failed", "signal-passed"].includes(scenario);
    const epoch = future ? 201 : old ? 198 : afterVoting ? 199 : 200;
    const createdAt = V2_GENESIS + (epoch - 1) * 1_209_600 + 172_800;
    const voteTime = V2_GENESIS + epoch * 1_209_600 + 691_200;
    let status: DaoProposalWire["status"] = future ? "PROPOSED" : "VOTING";
    if (scenario === "passed" || scenario === "signal-passed") status = "PASSED";
    if (scenario === "failed") status = "FAILED";
    if (scenario === "expired") status = "EXPIRED";
    if (scenario === "executed" || scenario === "signal-complete") status = "EXECUTED";
    if (scenario === "retracted") status = "RETRACTED";
    if (scenario === "flagged") status = "FLAGGED";
    if (scenario.includes("veto")) status = "VETOED";
    const signal = scenario.startsWith("signal") || scenario === "empty-script";
    const scriptBytes = scenario === "missing-script" ? null : signal ? "0x" : scenario === "malformed-script" ? "0x01" : V2_SCRIPT;
    let content = v2Content(scenario === "content-unsafe" ? "# Unsafe proposal\n\nUnsafe example.\n\n<script>alert(1)</script>\n" : undefined);
    if (scenario === "direct-content") {
      const direct = JSON.parse(new TextDecoder().decode(content));
      direct.discussionUrl = "https://example.org/a-direct-proposal";
      content = canonicalizeDaoProposalContent(direct);
    }
    const events: DaoTimelineEventWire[] = [event("propose", id, 0, createdAt)];
    const hasVotes = !future;
    if (hasVotes) events.push(event("vote", id, 1, voteTime));
    if (["zero-vote", "replacement-votes", "veto-zero-after-replacement"].includes(scenario)) {
      if (scenario === "veto-zero-after-replacement") events.push(event("veto", id, 2, voteTime + 12));
      events.push({ ...event("vote", id, 3, voteTime + 24), type: "vote", account: scenario === "zero-vote" ? "0x0000000000000000000000000000000000000000" : V2_ACCOUNT, weight: "0", yea: "0" });
    }
    if (scenario === "retracted") events.push(event("retract", id, 3, createdAt + 12));
    if (scenario === "flagged") events.push(event("flag", id, 3, createdAt + 12));
    if (scenario.includes("veto") && scenario !== "veto-zero-after-replacement") events.push(event("veto", id, 3, future ? createdAt + 12 : voteTime + 12));
    if (scenario === "executed") events.push(event("execute", id, 3, voteTime + 1_209_600));
    const votes = !hasVotes || ["replacement-votes", "veto-zero-after-replacement"].includes(scenario) ? "0" : scenario === "large-weight" ? "10000000000000000000000000000000000000000" : "250000000000000000000";
    return {
      votingAddress: V2_VOTING, id: String(id), proposer: V2_ACCOUNT, epoch: String(epoch),
      contentDigest: scenario === "content-malformed" ? sha256(new TextEncoder().encode("{bad JSON")) : sha256(content),
      scriptHash: scenario === "mismatch-script" ? v2Hash(99) : keccak256(scriptBytes ?? V2_SCRIPT),
      threshold: scenario === "threshold-6000" ? "6000" : "5000",
      votes, yea: votes === "0" ? "0" : scenario === "failed" ? "100000000000000000000" : (BigInt(votes) * 3n / 5n).toString(),
      retracted: scenario === "retracted" || scenario === "flagged" || scenario === "early-veto",
      flagged: scenario === "flagged", vetoed: scenario.includes("veto"), executed: scenario === "executed", status,
      scriptBytes,
      contentBytes: scenario === "content-unavailable" ? null : scenario === "content-malformed" ? v2Base64(new TextEncoder().encode("{bad JSON")) : scenario === "content-mismatch" ? v2Base64(v2Content("# Different\n\nDifferent content.\n\nBody.\n")) : v2Base64(content),
      events,
    };
  });
  const blockNumber = 23_000_000 + Math.floor((V2_NOW - V2_GENESIS) / 12);
  return {
    schema: "yearn.dao.feed.v2", chainId: 1, observedAt: V2_NOW + 12,
    block: { number: String(blockNumber), hash: v2Hash(blockNumber), timestamp: V2_NOW },
    deployments: [{ votingAddress: V2_VOTING, proposalCount: String(proposals.length), configuration: {
      voteStart: "604800", executeDelay: "86400", executeGuard: true, threshold: "7000", voter: V2_VOTER, executor: V2_EXECUTOR,
    } }],
    proposals,
  };
}

function growthContent(id: number, bytes: Uint8Array) {
  const content = JSON.parse(new TextDecoder().decode(bytes));
  content.markdown = content.markdown.replace("# Growth case policy", "# Growth case policy " + id);
  const exact = canonicalizeDaoProposalContent(content);
  return { contentBytes: v2Base64(exact), contentDigest: sha256(exact) };
}

export function createV2GrowthExample(count = 1000): DaoFeedWire {
  const feed = createV2Example();
  const original = feed.proposals[0];
  const bytes = v2Content("# Growth case policy\n\nA representative longer proposal.\n\n" + "The policy records a treasury decision and its rationale. ".repeat(65) + "\n");
  feed.proposals = Array.from({ length: count }, (_, id) => ({
    ...structuredClone(original), id: String(id), ...growthContent(id, bytes),
    events: [event("propose", id, 0, original.events[0].log.timestamp),
      ...Array.from({ length: 10 }, (_, offset) => event("vote", id, offset + 1, V2_GENESIS + 200 * 1_209_600 + 691_200 + offset * 12))],
  }));
  feed.deployments[0].proposalCount = String(count);
  return feed;
}
