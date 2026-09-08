import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProposalDetail } from "@/app/dao/proposals/[id]/ProposalDetail";
import { formatUtcDateTime } from "@/lib/date";
import {
  DAO_MOCK_FEED,
  type DaoDisplayStatus,
  type DaoProposal,
  type DaoProposalReadEnvelope,
} from "@/lib/clients/dao";

const PINNED_VOTING_SOURCE_URL =
  "https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy";

describe("DAO proposal detail", () => {
  it.each([
    [4n, "approved"],
    [6n, "executed"],
    [7n, "rejected"],
    [8n, "rejected"],
    [9n, "expired"],
    [10n, "retracted"],
    [11n, "flagged"],
    [12n, "vetoed"],
    [13n, "vetoed"],
  ] satisfies Array<[bigint, DaoDisplayStatus]>) (
    "renders terminal proposal #%s as %s with lifecycle and results",
    (proposalId, displayStatus) => {
      const value = proposal(proposalId);
      const { unmount } = render(
        <ProposalDetail envelope={envelope(value)} />
      );

      expect(
        screen.getAllByText(statusLabel(displayStatus), { exact: true }).length
      ).toBeGreaterThan(0);
      expect(
        screen.getByRole("heading", { name: "Vote results" })
      ).toBeVisible();
      expect(screen.getByText(/of votes cast · \d/)).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "Lifecycle" })
      ).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "Immutable proposal content" })
      ).toBeVisible();
      unmount();
    }
  );

  it("presents an approved signal without implying execution", () => {
    render(
      <ProposalDetail envelope={envelope(proposal(4n))} />
    );

    expect(screen.getAllByText("Approved", { exact: true }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("No executable actions", { exact: true }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Signal proposals contain no executable calls."
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Ordered calls" })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Vote result", { exact: true }).length).toBe(1);
    expect(
      screen.getAllByText("No executable actions", { exact: true }).length
    ).toBeGreaterThan(1);
  });

  it("presents flagging as moderation without inventing a community result", () => {
    render(<ProposalDetail envelope={envelope(proposal(11n))} />);

    expect(screen.getByText("Moderation", { exact: true })).toBeVisible();
    expect(screen.getAllByText("Flagged", { exact: true })[0]).toBeVisible();
    expect(
      screen.getByText(
        "Flagging retracts the proposal and blocks voting and execution. No community vote result is implied."
      )
    ).toBeVisible();
    expect(
      screen.getAllByText("No community result", { exact: true }).length
    ).toBe(2);
  });

  it.each([
    [12n, "This proposal is retracted and vetoed. Voting and execution are blocked."],
    [13n, "Participation voting remains available until the voting window closes, but approval and execution are blocked."],
  ])("explains stored veto eligibility for proposal #%s", (proposalId, explanation) => {
    render(<ProposalDetail envelope={envelope(proposal(proposalId))} />);

    expect(screen.getAllByText("Vetoed", { exact: true })[0]).toBeVisible();
    expect(screen.getByText(explanation, { exact: true })).toBeVisible();
    expect(
      screen.getAllByText("No community result", { exact: true }).length
    ).toBe(2);
  });

  it("exposes the vote breakdown once to assistive technology", () => {
    render(<ProposalDetail envelope={envelope(proposal(2n))} />);

    expect(screen.queryByRole("img", { name: /Yea.*Nay/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Yea.*Nay/i)).toBeVisible();
  });

  it.each([
    [14n, "Immutable content could not be retrieved", "Content gateway"],
    [
      15n,
      "Immutable content did not pass validation",
      "yearn.dao.proposal.v1",
    ],
  ])(
    "keeps the onchain record visible for content failure #%s",
    (proposalId, warningTitle, errorFragment) => {
      render(
        <ProposalDetail envelope={envelope(proposal(proposalId))} />
      );

      expect(screen.getAllByText(warningTitle).length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(/The onchain proposal remains visible/).length
      ).toBeGreaterThan(0);
      expect(screen.getByText(new RegExp(errorFragment, "i"))).toBeVisible();
      expect(
        screen.getAllByText(`Proposal #${proposalId.toString()}`).length
      ).toBeGreaterThan(0);
      expect(screen.getAllByText("Voting contract").length).toBeGreaterThan(0);
    }
  );

  it("keeps missing script bytes distinct from an empty signal", () => {
    render(<ProposalDetail envelope={envelope(proposal(16n))} />);
    expect(screen.getByRole("heading", { name: "Proposed script" })).toBeVisible();
    expect(screen.getAllByText(/script.*unavailable|missing script/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Analysis pending|simulation succeeded/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Unknown call")).not.toBeInTheDocument();
  });

  it("retains raw unknown calls and the configured source reference", () => {
    render(<ProposalDetail envelope={envelope(proposal(17n))} />);
    expect(screen.getAllByText("Unknown call").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Calldata").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Voting.vy at pinned stYFI revision" })
      .every((link) => link.getAttribute("href") === PINNED_VOTING_SOURCE_URL)).toBe(true);
    expect(screen.queryByText(/simulation succeeded|Verified decoding/)).not.toBeInTheDocument();
  });

  it("shows malformed framing without historical simulation claims", () => {
    render(<ProposalDetail envelope={envelope(proposal(18n))} />);
    expect(screen.getAllByText(/header|frame|malformed/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Simulation failed|proposal-time simulation/i)).not.toBeInTheDocument();
  });

  it("renders optional locally reviewed decoding without synthesizing a source URL", () => {
    const feed = structuredClone(DAO_MOCK_FEED);
    const value = feed.proposals.find(
      (entry) => entry.ref.proposalId === 2n
    );
    if (!value) throw new Error("Missing proposal #2.");
    value.analysis.calls[0] = {
      ...value.analysis.calls[0],
      contractName: "vaultFactory.v2",
      functionSignature: "rebalance_v2()",
      verifiedSource: {
        kind: "sourcify",
        label: "Verified Vault source",
        url: "https://repo.sourcify.dev/contracts/full_match/1/0x0000000000000000000000000000000000000001/",
        revision: null,
      },
    };

    render(<ProposalDetail envelope={envelope(value, feed)} />);

    expect(screen.getByText("vaultFactory.v2", { exact: true })).toBeVisible();
    expect(screen.getByText("rebalance_v2()", { exact: true })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Verified Vault source" })
    ).toHaveAttribute(
      "href",
      "https://repo.sourcify.dev/contracts/full_match/1/0x0000000000000000000000000000000000000001/"
    );
  });

  it("uses canonical event time and truthful transaction fallbacks", () => {
    const value = structuredClone(proposal(6n));
    const execute = value.events.find((event) => event.type === "execute");
    if (!execute) throw new Error("Missing execute event.");
    execute.log.timestamp = 1_776_513_840;

    render(<ProposalDetail envelope={envelope(value)} />);

    expect(
      screen
        .getAllByText("Apr 18, 2026, 12:04 PM UTC", { exact: true })
        .some((time) => time.parentElement?.textContent?.startsWith("Executed"))
    ).toBe(true);
    expect(
      screen.getAllByRole("link", { name: /View Ethereum transaction/ }).length
    ).toBeGreaterThan(0);

    const unavailable = structuredClone(proposal(20n));
    const proposed = unavailable.events.find((event) => event.type === "propose");
    if (!proposed) throw new Error("Missing propose event.");
    proposed.log.timestamp = null;
    proposed.log.transactionHash = null;
    const { unmount } = render(<ProposalDetail envelope={envelope(unavailable)} />);
    expect(
      screen
        .getAllByText("Time unavailable", { exact: true })
        .some((time) => time.parentElement?.textContent?.startsWith("Proposed"))
    ).toBe(true);
    expect(screen.getByText("Transaction unavailable", { exact: true })).toBeVisible();
    unmount();
  });

  it("labels canonical block time as the feed snapshot instead of generatedAt", () => {
    const feed = structuredClone(DAO_MOCK_FEED);
    feed.generatedAt = "2030-01-02T03:04:05Z";
    feed.canonicalBlock.timestamp = DAO_MOCK_FEED.canonicalBlock.timestamp - 3_600;
    const value = feed.proposals.find(
      (entry) => entry.ref.proposalId === 17n
    );
    if (!value) throw new Error("Missing proposal #17.");

    render(<ProposalDetail envelope={envelope(value, feed)} />);
    fireEvent.click(screen.getByText("Technical details", { exact: true }));

    expect(
      screen.getByText(formatUtcDateTime(feed.canonicalBlock.timestamp), {
        exact: true,
      })
    ).toBeVisible();
    expect(screen.queryByText(feed.generatedAt)).not.toBeInTheDocument();
  });

  it("uses runtime time for lifecycle copy without rewriting snapshot provenance", () => {
    const feed = structuredClone(DAO_MOCK_FEED);
    const value = feed.proposals.find(
      (entry) => entry.ref.proposalId === 2n
    );
    if (!value) throw new Error("Missing proposal #2.");

    render(
      <ProposalDetail
        envelope={envelope(value, feed)}
        now={feed.canonicalBlock.timestamp + 3_600}
      />
    );

    expect(screen.getByText("Voting ends in 5 hours")).toBeVisible();
    fireEvent.click(screen.getByText("Technical details", { exact: true }));
    expect(
      screen.getByText(formatUtcDateTime(feed.canonicalBlock.timestamp), {
        exact: true,
      })
    ).toBeVisible();
  });

  it("makes a script hash mismatch explicit", () => {
    render(
      <ProposalDetail envelope={envelope(proposal(19n))} />
    );

    const facts = screen.getByTestId("dao-proposal-heading-facts");
    expectTextOrder(facts, [
      "Execution blocked",
      "Approved",
      "Executable",
      "Stored script hash does not match the proposed event script.",
    ]);
    expect(
      within(facts).getByText("Execution blocked", { exact: true })
    ).toHaveClass("bg-red-700", "text-white");
    expect(
      within(facts).getByText(
        "Stored script hash does not match the proposed event script.",
        { exact: true }
      )
    ).toBeVisible();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Event script does not match the stored script hash"
    );
  });

  it("provides accessible rules and technical disclosures with copy controls", () => {
    const value = proposal(17n);
    render(<ProposalDetail envelope={envelope(value)} />);

    const rulesSummary = screen.getByText("Proposal rules").closest("summary");
    expect(rulesSummary).not.toBeNull();
    expect(rulesSummary).toHaveClass("transition-[color,scale]");
    expect(rulesSummary).toHaveClass("motion-reduce:transition-none");
    fireEvent.click(rulesSummary!);
    expect(screen.getByText("No minimum turnout is required.")).toBeVisible();
    expect(screen.getByText("50% of votes cast", { exact: true })).toBeVisible();
    expect(screen.getByText("Passage requires at least one non-zero vote.")).toBeVisible();
    expect(screen.getByText("Guarded execution", { exact: true })).toBeVisible();
    expect(
      screen
        .getAllByRole("link", {
          name: "Voting.vy at pinned stYFI revision",
        })
        .every((link) => link.getAttribute("href") === PINNED_VOTING_SOURCE_URL)
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", {
          name: "Voting.vy at pinned stYFI revision",
        })
        .every(
          (link) =>
            link.classList.contains("transition-[color,scale]") &&
            link.classList.contains("motion-reduce:transition-none")
        )
    ).toBe(true);

    const technicalSummary = screen
      .getByText("Technical details")
      .closest("summary");
    expect(technicalSummary).not.toBeNull();
    fireEvent.click(technicalSummary!);

    const details = technicalSummary!.closest("details");
    expect(details).not.toBeNull();
    expect(within(details!).getByText("Proposal identity")).toBeVisible();
    expect(within(details!).getByText("Raw contract status")).toBeVisible();
    expect(within(details!).getByText("Content CID")).toBeVisible();
    expect(within(details!).getByText("Content digest")).toBeVisible();
    expect(within(details!).getByText("Script hash")).toBeVisible();
    expect(within(details!).getByText("Event script")).toBeVisible();
    expect(within(details!).getByText("Feed snapshot block")).toBeVisible();
    expect(
      within(details!).getByRole("button", { name: "Copy script hash" })
    ).toHaveClass("size-10");
  });

  it("reads an alternate threshold from proposal rules", () => {
    render(<ProposalDetail envelope={envelope(proposal(7n))} />);
    fireEvent.click(screen.getByText("Proposal rules", { exact: true }));
    expect(screen.getByText("60% of votes cast", { exact: true })).toBeVisible();
  });
});

function proposal(id: bigint): DaoProposal {
  const value = DAO_MOCK_FEED.proposals.find(
    (entry) => entry.ref.proposalId === id
  );
  if (!value) throw new Error(`Missing DAO proposal #${id.toString()}.`);
  return value;
}

function envelope(
  value: DaoProposal,
  feed = DAO_MOCK_FEED
): DaoProposalReadEnvelope {
  return { feed, proposal: value };
}

function statusLabel(status: DaoDisplayStatus) {
  if (status === "approved") return "Approved";
  if (status === "executed") return "Executed";
  if (status === "rejected") return "Rejected";
  if (status === "expired") return "Expired";
  if (status === "retracted") return "Retracted";
  if (status === "flagged") return "Flagged";
  if (status === "vetoed") return "Vetoed";
  if (status === "discussion") return "Discussion";
  if (status === "voting") return "Voting";
  return "Not found";
}

function expectTextOrder(element: HTMLElement, labels: string[]) {
  let previousIndex = -1;
  for (const label of labels) {
    const index = element.textContent?.indexOf(label) ?? -1;
    expect(index, label).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}
