import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProposalBoard } from "@/app/dao/components/ProposalBoard";
import { DAO_MOCK_FEED, type DaoDisplayGroup } from "@/lib/clients/dao";

const now = DAO_MOCK_FEED.canonicalBlock.timestamp;

describe("DAO proposal board", () => {
  it("renders domain-provided active proposals with scanning facts", () => {
    render(<ProposalBoard now={now} proposals={DAO_MOCK_FEED.proposals} />);

    const activeTab = screen.getByRole("tab", { name: /Active/ });
    expect(activeTab).toHaveAttribute("aria-selected", "true");

    const activePanel = screen.getByRole("tabpanel", {
      name: /Active/,
    });
    const activeCount = countFor("active");
    expect(within(activePanel).getAllByRole("article")).toHaveLength(activeCount);

    const proposal = within(activePanel).getByRole("article", {
      name: /Fund protocol research/,
    });
    expect(within(proposal).getByText("Voting", { exact: true })).toBeVisible();
    expect(within(proposal).getByText("Executable", { exact: true })).toBeVisible();
    expect(within(proposal).getByText("Voting ends in 6 hours")).toBeVisible();
    expect(within(proposal).getByText("68.2% Yea · 31.8% Nay")).toBeVisible();
    expect(
      within(proposal).getByText("of votes cast · 50% approval threshold")
    ).toBeVisible();
  });

  it("puts proposal #19 integrity failure first and removes misleading action copy", () => {
    render(
      <ProposalBoard
        now={now}
        proposals={DAO_MOCK_FEED.proposals}
        selectedGroup="active"
      />
    );

    const blocked = screen.getByRole("article", {
      name: /Proposal with a script hash mismatch/,
    });
    const facts = within(blocked).getByTestId("dao-proposal-heading-facts");
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
      within(blocked).queryByText("Executable actions", { exact: true })
    ).not.toBeInTheDocument();
    expect(within(blocked).queryByRole("alert")).not.toBeInTheDocument();

    const normal = screen.getByRole("article", {
      name: /Guarded executable proposal/,
    });
    expect(
      within(normal).getByText("Executable actions", { exact: true })
    ).toBeVisible();
    expect(
      within(normal).queryByText("Execution blocked", { exact: true })
    ).not.toBeInTheDocument();
  });

  it("switches Upcoming and Closed with mouse and keyboard tab semantics", () => {
    render(<ProposalBoard now={now} proposals={DAO_MOCK_FEED.proposals} />);

    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())
    ).toEqual([
      `Upcoming${countFor("upcoming")}`,
      `Active${countFor("active")}`,
      `Closed${countFor("closed")}`,
    ]);

    const activeTab = screen.getByRole("tab", { name: /Active/ });
    activeTab.focus();
    fireEvent.keyDown(activeTab, { key: "ArrowLeft" });

    const upcomingTab = screen.getByRole("tab", { name: /Upcoming/ });
    expect(upcomingTab).toHaveFocus();
    expect(upcomingTab).toHaveAttribute("aria-selected", "true");
    const upcomingPanel = screen.getByRole("tabpanel", { name: /Upcoming/ });
    expect(within(upcomingPanel).getAllByRole("article")).toHaveLength(
      countFor("upcoming")
    );
    expect(
      within(upcomingPanel).getByRole("link", {
        name: /Adopt the contributor budget policy/,
      })
    ).toHaveAttribute("href", "/dao/proposals/1?from=upcoming&chain=1&voting=0x1111111111111111111111111111111111111111");

    fireEvent.click(screen.getByRole("tab", { name: /Closed/ }));
    const closedPanel = screen.getByRole("tabpanel", { name: /Closed/ });
    expect(within(closedPanel).getAllByRole("article")).toHaveLength(
      countFor("closed")
    );
    const approvedSignal = within(closedPanel).getByRole("article", {
      name: /Approve the contributor charter/,
    });
    expect(
      within(approvedSignal).getByText("Approved", { exact: true })
    ).toBeVisible();
    expect(
      within(approvedSignal).getByText("No executable actions")
    ).toBeVisible();
  });

  it("keeps failed content records visible and names each failure", () => {
    render(<ProposalBoard now={now} proposals={DAO_MOCK_FEED.proposals} />);

    const unavailable = screen.getByRole("article", {
      name: /Proposal #14/,
    });
    expect(
      within(unavailable).getByText(
        "Content unavailable · onchain record shown"
      )
    ).toBeVisible();
    expect(
      within(unavailable).getByRole("link", {
        name: /Open proposal #14/,
      })
    ).toHaveAttribute("href", "/dao/proposals/14?from=active&chain=1&voting=0x1111111111111111111111111111111111111111");

    const invalid = screen.getByRole("article", {
      name: /Proposal #15/,
    });
    expect(
      within(invalid).getByText("Content invalid · onchain record shown")
    ).toBeVisible();
  });

  it("covers every proposal display status without using color alone", () => {
    render(<ProposalBoard now={now} proposals={DAO_MOCK_FEED.proposals} />);

    for (const filter of ["Active", "Upcoming", "Closed"]) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(filter) }));
      const panel = screen.getByRole("tabpanel", { name: new RegExp(filter) });
      for (const article of within(panel).queryAllByRole("article")) {
        expect(within(article).getAllByText(/Proposal #\d+/).length).toBeGreaterThan(
          0
        );
      }
      const group = filter.toLowerCase() as DaoDisplayGroup;
      for (const proposal of DAO_MOCK_FEED.proposals.filter(
        (entry) => entry.displayGroup === group
      )) {
        const status = statusLabel(proposal.displayStatus);
        expect(within(panel).getAllByText(status, { exact: true }).length).toBeGreaterThan(
          0
        );
      }
    }
  });

  it("offers keyboard-operable lifecycle shortcuts when Active is empty", async () => {
    const user = userEvent.setup();
    const onSelectGroup = vi.fn();
    const proposals = DAO_MOCK_FEED.proposals.filter(
      (proposal) => proposal.displayGroup !== "active"
    );
    render(
      <ProposalBoard
        now={now}
        proposals={proposals}
        selectedGroup="active"
        onSelectGroup={onSelectGroup}
      />
    );

    expect(
      screen.getByRole("heading", { name: "No active proposals" })
    ).toBeVisible();
    const upcoming = screen.getByRole("button", {
      name: /View upcoming proposals/,
    });
    const closed = screen.getByRole("button", {
      name: /View closed proposals/,
    });
    expect(upcoming).toHaveClass("min-h-11");
    expect(closed).toHaveClass("min-h-11");
    expect(
      screen.getByRole("group", { name: "View another proposal group" })
    ).toBeVisible();
    expect(
      screen.getByText("Next scheduled vote", { exact: true })
    ).toBeVisible();
    expect(
      document.querySelector(
        `time[datetime="${new Date(
          Math.min(
            ...proposals
              .filter((proposal) => proposal.displayGroup === "upcoming")
              .map((proposal) => proposal.voteStartsAt)
          ) * 1_000
        ).toISOString()}"]`
      )
    ).not.toBeNull();

    upcoming.focus();
    await user.keyboard("{Enter}");
    expect(onSelectGroup).toHaveBeenCalledWith("upcoming");

    const refreshedClosed = screen.getByRole("button", {
      name: /View closed proposals/,
    });
    refreshedClosed.focus();
    await user.keyboard("[Space]");
    expect(onSelectGroup).toHaveBeenCalledWith("closed");
  });

  it("omits next-vote timing when no upcoming proposal supplies one", () => {
    render(
      <ProposalBoard
        now={now}
        proposals={DAO_MOCK_FEED.proposals.filter(
          (proposal) => proposal.displayGroup === "closed"
        )}
        selectedGroup="active"
      />
    );

    expect(
      screen.getByRole("button", { name: /View upcoming proposals/ })
    ).toBeVisible();
    expect(screen.queryByText("Next scheduled vote")).not.toBeInTheDocument();
  });

  it("defaults to the first populated fallback when Active is absent", () => {
    render(
      <ProposalBoard
        now={now}
        proposals={DAO_MOCK_FEED.proposals.filter(
          (proposal) => proposal.displayGroup !== "active"
        )}
      />
    );

    expect(screen.getByRole("tab", { name: /Upcoming/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("uses a stretched native row link while nested address controls stay independent", () => {
    render(
      <ProposalBoard
        now={now}
        proposals={DAO_MOCK_FEED.proposals}
        selectedGroup="active"
      />
    );

    const openLink = screen.getByRole("link", {
      name: /Open proposal #2: Fund protocol research/,
    });
    const row = openLink.closest("article");
    expect(row).not.toBeNull();
    expect(row).toHaveClass("relative", "cursor-pointer");
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabindex");
    expect(openLink).toHaveAttribute(
      "href",
      "/dao/proposals/2?from=active&chain=1&voting=0x1111111111111111111111111111111111111111"
    );
    expect(openLink.className).toContain("after:absolute");

    const explorerLink = within(row!).getByRole("link", {
      name: /View Ethereum address .* on Etherscan/,
    });
    expect(explorerLink.closest("span.relative.z-10")).not.toBeNull();
    expect(
      within(row!).getByRole("button", { name: "Copy proposed by" })
    ).toBeEnabled();
  });

  it("uses clean proposal paths on the guarded DAO beta host", () => {
    render(
      <ProposalBoard
        hostname="dao-beta.dao-ops.com"
        now={now}
        proposals={DAO_MOCK_FEED.proposals}
        selectedGroup="active"
      />
    );

    expect(
      screen.getByRole("link", {
        name: /Open proposal #2: Fund protocol research/,
      })
    ).toHaveAttribute("href", "/proposals/2?from=active&chain=1&voting=0x1111111111111111111111111111111111111111");
  });
});

function countFor(group: DaoDisplayGroup) {
  return DAO_MOCK_FEED.proposals.filter(
    (proposal) => proposal.displayGroup === group
  ).length;
}

function statusLabel(status: string) {
  return status === "not_found"
    ? "Not found"
    : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function expectTextOrder(element: HTMLElement, labels: string[]) {
  let previousIndex = -1;
  for (const label of labels) {
    const index = element.textContent?.indexOf(label) ?? -1;
    expect(index, label).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}
