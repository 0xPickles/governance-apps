import { describe, expect, it } from "vitest";
import {
  DAO_MOCK_FEED,
  deriveDaoProposalTimingDisplay,
  deriveDaoVoteDisplay,
  parseDaoProposalContent,
  resolveDaoProposalReadEnvelope,
} from "@/lib/clients/dao";

function proposal(id: bigint) {
  const value = DAO_MOCK_FEED.proposals.find(
    (entry) => entry.ref.proposalId === id
  );
  if (!value) throw new Error(`Missing DAO proposal #${id.toString()}.`);
  return value;
}

describe("DAO read display facts", () => {

  it("resolves detail data only through its serialized composite feed identity", () => {
    const value = proposal(2n);
    const envelope = resolveDaoProposalReadEnvelope(
      DAO_MOCK_FEED,
      value.ref
    );
    expect(envelope?.proposal).toBe(value);
    expect(envelope?.feed).toBe(DAO_MOCK_FEED);

    const mismatchedFeed = structuredClone(DAO_MOCK_FEED);
    mismatchedFeed.proposals = mismatchedFeed.proposals.map((entry) =>
      entry.ref.proposalId === value.ref.proposalId
        ? {
            ...entry,
            ref: {
              ...entry.ref,
              votingAddress:
                "0x9999999999999999999999999999999999999999",
            },
          }
        : entry
    );
    expect(
      resolveDaoProposalReadEnvelope(mismatchedFeed, value.ref)
    ).toBeNull();
  });

  it("keeps every public fixture presentation field free of delivery language", () => {
    const presentationValues = DAO_MOCK_FEED.proposals.flatMap((entry) => [
      entry.content.value?.markdown,
      entry.content.value
        ? parseDaoProposalContent(entry.content.value).title
        : null,
      entry.content.value
        ? parseDaoProposalContent(entry.content.value).summary
        : null,
      entry.content.value?.discussionUrl,
      entry.discussion.url,
      entry.discussion.title,
      entry.analysis.error,
      ...entry.analysis.calls.flatMap((call) => [
        call.contractName,
        call.functionSignature,
        call.verifiedSource?.label,
        call.verifiedSource?.url,
        call.verifiedSource?.revision,
        call.sourcePath,
      ]),
    ]);

    expect(presentationValues.filter(Boolean).join("\n")).not.toMatch(
      /\b(mock|fixture|prototype|qa|implementation)\b/i
    );
  });

  it("derives exact vote percentages and snapshotted threshold copy inputs", () => {
    expect(deriveDaoVoteDisplay(proposal(2n))).toMatchObject({
      yeaPercent: "68.2%",
      nayPercent: "31.8%",
      yeaPercentTenths: 682,
      nayPercentTenths: 318,
      thresholdPercent: "50%",
      yeaWeight: "7.5",
      nayWeight: "3.5",
      totalWeight: "11",
    });
  });

  it("keeps a no-vote outcome at zero without inventing quorum math", () => {
    expect(deriveDaoVoteDisplay(proposal(8n))).toMatchObject({
      yeaPercent: "0%",
      nayPercent: "0%",
      yeaPercentTenths: 0,
      nayPercentTenths: 0,
    });
  });

  it("uses display semantics for approved signals even with raw executed state", () => {
    const approvedSignal = proposal(4n);
    expect(approvedSignal.protocolStatus).toBe("executed");
    expect(approvedSignal.displayStatus).toBe("approved");
    expect(
      deriveDaoProposalTimingDisplay(
        approvedSignal,
        DAO_MOCK_FEED.canonicalBlock.timestamp
      )
    ).toMatchObject({
      kind: "approved_on",
      timestamp: approvedSignal.voteEndsAt,
    });
  });

  it("selects the execution deadline for an approved executable in-window", () => {
    const approvedExecutable = proposal(21n);
    expect(
      deriveDaoProposalTimingDisplay(
        approvedExecutable,
        DAO_MOCK_FEED.canonicalBlock.timestamp
      )
    ).toMatchObject({
      kind: "execution_expires",
      timestamp: approvedExecutable.executionEndsAt,
    });
  });

  it("retains canonical terminal event time and provenance", () => {
    const vetoed = proposal(13n);
    const timing = deriveDaoProposalTimingDisplay(
      vetoed,
      DAO_MOCK_FEED.canonicalBlock.timestamp
    );
    expect(timing.kind).toBe("vetoed_recorded");
    expect(timing.timestamp).toBe(timing.event?.log.timestamp);
    expect(timing.timestamp).not.toBeNull();
    expect(timing.event?.type).toBe("veto");
    expect(timing.event?.log.blockNumber).toBeTypeOf("bigint");
  });
});
