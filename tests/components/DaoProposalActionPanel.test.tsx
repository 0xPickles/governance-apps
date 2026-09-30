import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DaoProposalActionPanelView } from "@/app/dao/proposals/[id]/DaoProposalActionPanel";
import {
  applyDaoMockFixture,
  DAO_BLOCKED_REASONS,
  DAO_MOCK_ACCOUNT_ADDRESS,
  DAO_MOCK_NOW,
  getDaoMockSnapshot,
  readDaoMockAccountProposalState,
  resetDaoMockStore,
  setDaoMockAccountState,
  setDaoMockRole,
  type DaoAccountProposalState,
  type DaoActionType,
  type DaoExecutionGuard,
  type DaoMockFixtureId,
  type DaoPendingAction,
  type DaoProposal,
} from "@/lib/clients/dao";
import type { TxState } from "@/lib/tx/types";

const handlers = {
  onRetryReceipt: vi.fn(async () => undefined),
  onExecute: vi.fn(async () => undefined),
  onFlag: vi.fn(async () => undefined),
  onRetract: vi.fn(async () => undefined),
  onVeto: vi.fn(async () => undefined),
  onVote: vi.fn(async () => undefined),
};

describe("DAO proposal action panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDaoMockStore({ now: DAO_MOCK_NOW });
  });

  it("shows a known hash and confirmation retry while locking an unresolved action", () => {
    applyDaoMockFixture("voting");
    const proposal = selectedProposal();
    const hash = ("0x" + "ab".repeat(32)) as `0x${string}`;
    renderSelected({ pendingAction: { action: "vote", ref: proposal.ref, actor: DAO_MOCK_ACCOUNT_ADDRESS,
      transactionHash: hash, submittedAt: DAO_MOCK_NOW, direction: "yea", effectiveVotingWeight: null, reason: null, receiptState: "unknown" },
      txState: { status: "error", hash, errorType: "network", errorMessage: "Receipt timeout" } });
    expect(screen.getByText("Transaction submitted · receipt not confirmed")).toBeVisible();
    expect(screen.getByRole("link", { name: "View transaction" })).toHaveAttribute("href", "https://etherscan.io/tx/" + hash);
    expect(screen.getByRole("button", { name: "Review vote" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry receipt confirmation" }));
    expect(handlers.onRetryReceipt).toHaveBeenCalledOnce();
    expect(handlers.onVote).not.toHaveBeenCalled();
  });

  it("requires an explicit direction and confirms proposal, weight, and Voter irreversibility", async () => {
    const { account } = renderFixture("voting");
    const yea = screen.getByRole("radio", { name: "Yea" });
    const nay = screen.getByRole("radio", { name: "Nay" });
    const review = screen.getByRole("button", { name: "Review vote" });

    expect(yea).not.toBeChecked();
    expect(nay).not.toBeChecked();
    expect(review).toBeDisabled();

    fireEvent.click(nay);
    expect(nay).toBeChecked();
    fireEvent.click(review);

    const dialog = screen.getByRole("dialog", { name: "Confirm your vote" });
    expect(within(dialog).getByText("Nay", { exact: true })).toBeVisible();
    expect(within(dialog).getByText("Fund protocol research")).toBeVisible();
    expect(
      within(dialog).getByText(
        /submitted through the public Voter and cannot be changed/i
      )
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        formatWeight(account.effectiveVotingWeight),
        { exact: true }
      )
    ).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Vote Nay" }));
    expect(handlers.onVote).toHaveBeenCalledWith("nay");
  });

  it("shows original, effective, and decay facts for a late vote", () => {
    const { account } = renderFixture("late-voting");
    expect(account.decayBps).toBeGreaterThan(0);
    expect(account.decayBps).toBeLessThan(10_000);

    fireEvent.click(screen.getByRole("radio", { name: "Yea" }));
    fireEvent.click(screen.getByRole("button", { name: "Review vote" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm your vote" });

    expect(within(dialog).getByText("Original weight")).toBeVisible();
    expect(within(dialog).getByText("Effective weight now")).toBeVisible();
    expect(
      within(dialog).getByText(formatWeight(account.votingWeight), {
        exact: true,
      })
    ).toBeVisible();
    expect(
      within(dialog).getByText(formatWeight(account.effectiveVotingWeight), {
        exact: true,
      })
    ).toBeVisible();
    expect(within(dialog).getByText(/of original weight remains/)).toBeVisible();
  });

  it("uses one acknowledgement for unavailable content and two for invalid content", () => {
    renderFixture("content-unavailable");
    openYeaVote();
    let dialog = screen.getByRole("dialog", { name: "Confirm your vote" });
    let confirm = within(dialog).getByRole("button", { name: "Vote Yea" });
    expect(confirm).toBeDisabled();
    const unavailable = within(dialog).getByRole("checkbox", {
      name: /could not be retrieved/i,
    });
    fireEvent.click(unavailable);
    expect(confirm).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    renderFixture("content-invalid");
    openYeaVote();
    const dialogs = screen.getAllByRole("dialog", { name: "Confirm your vote" });
    dialog = dialogs.at(-1)!;
    confirm = within(dialog).getByRole("button", { name: "Vote Yea" });
    const invalid = within(dialog).getByRole("checkbox", {
      name: /did not pass validation/i,
    });
    const onchain = within(dialog).getByRole("checkbox", {
      name: /reviewed the available onchain record/i,
    });
    fireEvent.click(invalid);
    expect(confirm).toBeDisabled();
    fireEvent.click(onchain);
    expect(confirm).toBeEnabled();
  });

  it("uses a dark-safe foreground for account load errors", () => {
    renderFixture("voting", { account: null, accountError: true });

    expect(
      screen.getByText("Proposal actions are unavailable. Try again.")
    ).toHaveClass("dark:text-red-300");
  });

  it("uses a dark-safe foreground for moderation errors", () => {
    applyDaoMockFixture("discussion");
    setDaoMockRole("operator", true);
    renderSelected();

    openLifecycleAction("Flag proposal");
    expect(
      within(screen.getByRole("dialog")).getByText("Enter a reason.", {
        exact: true,
      })
    ).toHaveClass("dark:text-red-300");
  });

  it("keeps participation voting open after veto and blocks an early veto", () => {
    renderFixture("post-vote-veto");
    expect(screen.getByText(/still vote to record your participation/i)).toBeVisible();
    expect(screen.getByRole("radio", { name: "Yea" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Nay" })).toBeEnabled();

    renderFixture("early-veto");
    expect(screen.getAllByText(DAO_BLOCKED_REASONS.voteVetoed).at(-1)).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("shows exact duplicate, zero-weight, wallet, and network reasons", () => {
    setDaoMockAccountState("already-voted");
    renderSelected();
    expect(
      screen.getByText(DAO_BLOCKED_REASONS.voteAlreadySubmitted)
    ).toBeVisible();

    setDaoMockAccountState("no-weight");
    renderSelected();
    expect(screen.getByText(DAO_BLOCKED_REASONS.zeroVotingWeight)).toBeVisible();

    setDaoMockAccountState("disconnected");
    renderSelected();
    expect(
      screen.getAllByText(DAO_BLOCKED_REASONS.walletDisconnected).at(-1)
    ).toBeVisible();

    setDaoMockAccountState("wrong-network");
    renderSelected();
    expect(
      screen.getAllByText(DAO_BLOCKED_REASONS.wrongNetwork).at(-1)
    ).toBeVisible();
  });

  it("confirms retract, flag, and both veto branches with their contract effects", () => {
    renderFixture("discussion");
    openLifecycleAction("Retract proposal");
    let dialog = screen.getByRole("dialog", {
      name: "Confirm proposal retraction",
    });
    expect(within(dialog).getByText(/does not reset the proposal cooldown/i)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    applyDaoMockFixture("discussion");
    setDaoMockRole("operator", true);
    renderSelected();
    openLifecycleAction("Flag proposal");
    dialog = screen.getByRole("dialog", { name: "Confirm proposal flag" });
    expect(
      within(dialog).getByText(/removes it from participation accounting/i)
    ).toBeVisible();
    const flagConfirm = within(dialog).getByRole("button", {
      name: "Flag proposal",
    });
    expect(flagConfirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Malformed metadata" },
    });
    expect(flagConfirm).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    applyDaoMockFixture("discussion");
    setDaoMockRole("guardian", true);
    renderSelected();
    openLifecycleAction("Veto proposal");
    dialog = screen.getByRole("dialog", { name: "Confirm proposal veto" });
    expect(within(dialog).getByText(/also retracts it, disables voting/i)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    applyDaoMockFixture("voting");
    setDaoMockRole("guardian", true);
    renderSelected();
    openLifecycleAction("Veto proposal");
    dialog = screen.getByRole("dialog", { name: "Confirm proposal veto" });
    expect(
      within(dialog).getByText(/participation voting stays open/i)
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    applyDaoMockFixture("approved-executable");
    setDaoMockRole("guardian", true);
    renderSelected();
    openLifecycleAction("Veto proposal");
    dialog = screen.getByRole("dialog", { name: "Confirm proposal veto" });
    expect(
      within(dialog).getByText(/voting window has ended/i)
    ).toBeVisible();
    expect(
      within(dialog).queryByText(/participation voting stays open/i)
    ).not.toBeInTheDocument();
  });

  it("confirms only eligible executable proposals and never gives a signal an execute CTA", () => {
    const votingView = renderFixture("voting");
    expect(
      screen.getByRole("button", { name: "Execute proposal" })
    ).toBeDisabled();
    expect(
      screen.getByText(DAO_BLOCKED_REASONS.executeLifecycle)
    ).toBeVisible();
    votingView.unmount();

    const executionView = renderFixture("permissionless-execution");
    const { proposal } = executionView;
    fireEvent.click(screen.getByRole("button", { name: "Execute proposal" }));
    const dialog = screen.getByRole("dialog", {
      name: "Confirm proposal execution",
    });
    expect(within(dialog).getByText(/run in order and atomically/i)).toBeVisible();
    expect(within(dialog).getByText(proposal.script.hash)).toBeVisible();
    expect(within(dialog).getByText(/Any eligible connected account/)).toBeVisible();

    executionView.unmount();
    renderFixture("approved-signal");
    expect(
      screen.queryByRole("button", { name: "Execute proposal" })
    ).not.toBeInTheDocument();
  });

  it.each([
    ["signing", "Confirm in wallet"],
    ["submitted", "Transaction pending"],
    ["mining", "Transaction pending"],
    ["success", "Transaction confirmed"],
  ] as const)("presents the shared %s transaction state", (status, text) => {
    renderFixture("voting", { txState: { status } });
    expect(screen.getByText(text)).toBeVisible();
  });

  it("distinguishes failure and awaiting-index states", () => {
    renderFixture("voting", {
      activeAction: "vote",
      txState: {
        status: "error",
        errorType: "revert",
        errorMessage: "Transaction reverted.",
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Transaction reverted.");

    const proposal = selectedProposal();
    const pendingAction: DaoPendingAction = {
      action: "vote",
      ref: proposal.ref,
      actor: DAO_MOCK_ACCOUNT_ADDRESS,
      transactionHash: `0x${"aa".repeat(32)}`,
      submittedAt: DAO_MOCK_NOW,
      direction: "yea",
      effectiveVotingWeight: 100n * 10n ** 18n,
      reason: null,
    };
    renderSelected({ pendingAction, txState: { status: "success" } });
    expect(
      screen.getByText("Transaction confirmed · awaiting proposal indexing")
    ).toBeVisible();
    expect(screen.getByText(/history will update after.*indexed/i)).toBeVisible();
  });

  it("restores focus to the vote trigger when a dialog closes", async () => {
    renderFixture("voting");
    fireEvent.click(screen.getByRole("radio", { name: "Yea" }));
    const trigger = screen.getByRole("button", { name: "Review vote" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

type RenderOverrides = Partial<{
  account: DaoAccountProposalState | null;
  accountError: boolean;
  accountLoading: boolean;
  activeAction: DaoActionType | null;
  executionGuard: DaoExecutionGuard;
  pendingAction: DaoPendingAction | null;
  txState: TxState;
}>;

function renderFixture(fixture: DaoMockFixtureId, overrides: RenderOverrides = {}) {
  applyDaoMockFixture(fixture);
  return renderSelected(overrides);
}

function renderSelected(overrides: RenderOverrides = {}) {
  const runtime = getDaoMockSnapshot();
  const proposal = selectedProposal();
  const account =
    overrides.account === undefined
      ? readDaoMockAccountProposalState(
          proposal.ref,
          runtime.account.address
        )
      : overrides.account;
  const view = render(
    <DaoProposalActionPanelView
      account={account}
      accountError={overrides.accountError ?? false}
      accountLoading={overrides.accountLoading ?? false}
      activeAction={overrides.activeAction ?? null}
      executionGuard={overrides.executionGuard ?? runtime.executionGuard}
      pendingAction={overrides.pendingAction ?? null}
      proposal={proposal}
      txState={overrides.txState ?? { status: "idle" }}
      {...handlers}
    />
  );
  return { ...view, account: account!, proposal };
}

function selectedProposal(): DaoProposal {
  const runtime = getDaoMockSnapshot();
  const proposal = runtime.feed.proposals.find(
    (candidate) => candidate.ref.proposalId === runtime.selectedProposalId
  );
  if (!proposal) throw new Error("Selected DAO proposal is unavailable.");
  return proposal;
}

function openYeaVote() {
  const radios = screen.getAllByRole("radio", { name: "Yea" });
  fireEvent.click(radios.at(-1)!);
  const reviewButtons = screen.getAllByRole("button", { name: "Review vote" });
  fireEvent.click(reviewButtons.at(-1)!);
}

function openLifecycleAction(name: string) {
  const summaries = screen.getAllByText("Lifecycle actions", { exact: true });
  fireEvent.click(summaries.at(-1)!);
  const buttons = screen.getAllByRole("button", { name });
  fireEvent.click(buttons.at(-1)!);
}

function formatWeight(value: bigint) {
  const whole = value / 10n ** 18n;
  return whole.toString();
}
