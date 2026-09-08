import * as mockServices from "@/app/dao/propose/mock-services";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAO_EXECUTOR_VALID_SCRIPT_VECTORS,
  DAO_CREATED_PROPOSALS_STORAGE_KEY,
  deriveDaoProposerState,
  getDaoMockSnapshot,
  getDaoMockFixture,
  readDaoCreatedProposals,
  resetDaoMockStore,
  serializeDaoProposalRef,
  type DaoMockTransactionOutcome,
  type DaoProposerEligibilityInput,
} from "@/lib/clients/dao";
import {
  DaoProposalAuthoringForm,
  DaoProposalEligibility,
} from "@/app/dao/propose/DaoProposalAuthoringForm";

const NOW = getDaoMockFixture("discussion").now;

describe("DAO proposal authoring form", () => {
  beforeEach(() => {
    resetDaoMockStore();
  });

  it("connects accessible field errors and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    renderAuthoring();

    await user.click(screen.getByRole("button", { name: "Review proposal" }));

    expect(screen.getByText("Review the highlighted fields")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Forum discussion" })
      ).toHaveFocus()
    );
    expect(
      screen.getByRole("textbox", { name: "Forum discussion" })
    ).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(
      screen.getByRole("textbox", { name: "Proposal Markdown" })
    ).toHaveAttribute(
      "aria-describedby",
      "dao-markdown-byte-count dao-markdown-grammar dao-markdown-validation"
    );

    await user.type(
      screen.getByRole("textbox", { name: "Forum discussion" }),
      "https://gov.yearn.fi/t/topic/1001"
    );
    await user.click(screen.getByRole("button", { name: "Validate topic" }));
    await screen.findByText("Forum topic accepted", {
      selector: "#dao-forum-status p",
    });
    const markdown = screen.getByRole("textbox", { name: "Proposal Markdown" });
    await user.clear(markdown);
    await user.type(markdown, "Summary without a title.");
    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    await waitFor(() => expect(markdown).toHaveFocus());
    expect(markdown).toHaveProperty("selectionStart", 0);
  });

  it("returns Preview to Write before focusing the located Markdown error", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    renderAuthoring();

    await user.type(
      screen.getByRole("textbox", { name: "Forum discussion" }),
      "https://gov.yearn.fi/t/topic/1001"
    );
    await user.click(screen.getByRole("button", { name: "Validate topic" }));
    await screen.findByText("Forum topic accepted", {
      selector: "#dao-forum-status p",
    });
    await user.click(
      screen.getByRole("radio", { name: /^ExecutableIncludes/i })
    );
    const script = screen.getByRole("textbox", {
      name: "Full Executor script",
    });
    await user.clear(script);
    await user.type(script, "not-hex");
    const markdown = screen.getByRole("textbox", { name: "Proposal Markdown" });
    await user.clear(markdown);
    await user.type(markdown, "Summary without a title.");
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await user.click(screen.getByRole("button", { name: "Review proposal" }));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Write" })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );
    const mountedMarkdown = screen.getByRole("textbox", {
      name: "Proposal Markdown",
    });
    await waitFor(() => expect(mountedMarkdown).toHaveFocus());
    expect(mountedMarkdown).toHaveProperty("selectionStart", 0);
    expect(mountedMarkdown).toHaveProperty("selectionEnd", 0);
    expect(screen.getByText("MISSING_H1")).toBeVisible();
    expect(screen.getByText("INVALID_HEX")).toBeVisible();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("shows fixed parser code, byte offset, counts, targets, and hash", async () => {
    const user = userEvent.setup();
    renderAuthoring();

    await user.click(
      screen.getByRole("radio", { name: /^ExecutableIncludes/i })
    );
    const script = screen.getByRole("textbox", {
      name: "Full Executor script",
    });
    await user.clear(script);
    await user.type(script, `0x${"00".repeat(31)}`);

    expect(screen.getByText("TRUNCATED_HEADER")).toBeVisible();
    expect(screen.getByText("Byte offset")).toBeVisible();
    expect(screen.getByText("Byte offset").parentElement).toHaveTextContent(
      "Byte offset0"
    );

    await user.clear(script);
    await user.type(script, DAO_EXECUTOR_VALID_SCRIPT_VECTORS.twoCalls.script);

    expect(screen.getByText("Script structure is valid")).toBeVisible();
    expect(screen.getByText("Call 1")).toBeVisible();
    expect(screen.getByText("Call 2")).toBeVisible();
    expect(screen.getAllByText(/0x[0-9a-f]{40}/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Script hash")).toBeVisible();
  });

  it("publishes a Signal snapshot before starting the wallet step", async () => {
    const user = userEvent.setup();
    renderAuthoring();
    await fillDraft(user, 1001);

    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    expect(
      screen.getByRole("heading", { name: "Review the exact proposal" })
    ).toBeVisible();
    expect(screen.getByText("No executable actions")).toBeVisible();
    expect(screen.getByText("Exact proposal title")).toBeVisible();
    expect(screen.getByText("Exact summary")).toBeVisible();
    expect(screen.getByText("Exact specification")).toBeVisible();
    const submissionSteps = screen.getByRole("region", {
      name: "Submission steps",
    });
    expect(within(submissionSteps).getByText("Current")).toBeVisible();
    expect(within(submissionSteps).getByText("Upcoming")).toBeVisible();
    expect(
      within(submissionSteps).getByText(/Two actions are required/i)
    ).toBeVisible();
    expect(
      within(submissionSteps).getByText(
        /does not create the proposal or open your wallet/i
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Create onchain proposal" })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );
    expect(
      screen.getByText("Confirm the exact review before publication.")
    ).toBeVisible();

    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the exact immutable content/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );

    expect(
      await screen.findByRole("heading", {
        name: "Immutable content published",
      })
    ).toBeVisible();
    const proposalStep = await screen.findByRole("heading", {
      name: "Content published — proposal not created yet",
    });
    expect(proposalStep).toHaveFocus();
    const proposalStepRegion = proposalStep.closest("section");
    expect(proposalStepRegion).not.toBeNull();
    expect(
      within(proposalStepRegion!).getByText(/does not require republishing/i)
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Create onchain proposal" })
    );
    const completionHeading = await screen.findByRole("heading", {
      name: "Proposal ready",
    });
    expect(completionHeading).toBeVisible();
    expect(completionHeading).toHaveFocus();
    expect(
      screen.getByText("Proposal indexed")
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Proposal ready"
    );
    expect(screen.getByRole("link", { name: "Open proposal" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/dao\/proposals\/\d+\?from=upcoming&chain=1&voting=0x1111111111111111111111111111111111111111$/)
    );
    expect(
      screen.getByRole("link", { name: "View transaction" })
    ).toHaveAttribute("target", "_blank");
  });

  it("shows the transaction before receipt identity and preserves the decoded route through indexing", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    let releaseReceipt!: () => void;
    const receiptGate = new Promise<void>(resolve => { releaseReceipt = resolve; });
    const confirm = mockServices.confirmMockDaoProposalReceipt;
    const receiptSpy = vi.spyOn(mockServices, "confirmMockDaoProposalReceipt")
      .mockImplementationOnce(async (...args) => {
        await receiptGate;
        return confirm(...args);
      });
    renderAuthoring(0);
    await fillDraft(user, 1001);
    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the exact immutable content/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );
    await screen.findByRole("heading", {
      name: "Immutable content published",
    });
    await user.click(
      screen.getByRole("button", { name: "Create onchain proposal" })
    );

    const transaction = await screen.findByRole("link", {
      name: "View transaction",
    });
    expect(transaction).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/etherscan\.io\/tx\/0x[0-9a-f]{64}$/)
    );
    expect(
      screen.queryByRole("link", { name: "Open proposal" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy proposal link" })
    ).not.toBeInTheDocument();

    await act(async () => releaseReceipt());
    receiptSpy.mockRestore();
    const open = await screen.findByRole("link", { name: "Open proposal" });
    const decodedHref = open.getAttribute("href");
    expect(decodedHref).toMatch(/^\/dao\/proposals\/\d+\?from=upcoming&chain=1&voting=0x1111111111111111111111111111111111111111$/);
    await user.click(
      screen.getByRole("button", { name: "Copy proposal link" })
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        new URL(decodedHref!, window.location.origin).toString()
      )
    );

    await screen.findByRole("heading", { name: "Proposal ready" });
    expect(screen.getByRole("link", { name: "Open proposal" })).toHaveAttribute(
      "href",
      decodedHref
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("retries delayed indexing idempotently with the same visible proposal identity", async () => {
    const user = userEvent.setup();
    renderAuthoring(150);
    await fillDraft(user, 1001);
    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the exact immutable content/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );
    await screen.findByRole("heading", {
      name: "Immutable content published",
    });
    await user.click(
      screen.getByRole("button", { name: "Create onchain proposal" })
    );

    const open = await screen.findByRole("link", { name: "Open proposal" });
    const proposalHref = open.getAttribute("href");
    expect(proposalHref).toMatch(/^\/dao\/proposals\/\d+\?from=upcoming&chain=1&voting=0x1111111111111111111111111111111111111111$/);
    await screen.findByText("Awaiting proposal indexing");
    resetDaoMockStore();

    expect(
      await screen.findByRole("heading", {
        name: "Proposal indexing is delayed",
      })
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry indexing" }));

    expect(
      await screen.findByRole("heading", { name: "Proposal ready" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Open proposal" })).toHaveAttribute(
      "href",
      proposalHref
    );
    const [created] = readDaoCreatedProposals();
    expect(created?.stage).toBe("indexed");
    const refKey = serializeDaoProposalRef(created!.proposal.ref);
    const matching = getDaoMockSnapshot().feed.proposals.filter(
      (proposal) => serializeDaoProposalRef(proposal.ref) === refKey
    );
    expect(matching).toHaveLength(1);
    expect(
      matching[0]?.events.filter((event) => event.type === "propose")
    ).toHaveLength(1);
  });

  it("keeps the transaction link and hides proposal actions when identity decoding fails", async () => {
    const user = userEvent.setup();
    renderAuthoring();
    await fillDraft(user, 1005);
    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the exact immutable content/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );
    await screen.findByRole("heading", {
      name: "Immutable content published",
    });
    await user.click(
      screen.getByRole("button", { name: "Create onchain proposal" })
    );

    expect(
      await screen.findByRole("heading", {
        name: "Proposal identity unavailable",
      })
    ).toBeVisible();
    expect(screen.getByText("PROPOSE_LOG_MISSING")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View transaction" })
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Open proposal" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy proposal link" })
    ).not.toBeInTheDocument();
  });

  it("locks the exact review throughout publication and exposes complete forum facts", async () => {
    const user = userEvent.setup();
    const exactTitle = "  Exact   proposal title  ";
    renderAuthoring(80);
    await fillDraft(user, 1001, exactTitle);

    const acceptedTopic = screen
      .getByText("Forum topic accepted", { selector: "#dao-forum-status p" })
      .closest("div");
    expect(acceptedTopic).not.toBeNull();
    expect(within(acceptedTopic!).getByText("Fund protocol research")).toBeVisible();
    expect(within(acceptedTopic!).getByText("Proposals · ID 5")).toBeVisible();
    expect(within(acceptedTopic!).getByText("yearn-contributor")).toBeVisible();
    expect(within(acceptedTopic!).getByText("Aug 1, 2024, 12:00 AM UTC")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Review proposal" }));

    const immutable = screen.getByRole("region", { name: "Immutable content" });
    const sourceDisclosure = within(immutable).getByText("View Markdown source");
    await user.click(sourceDisclosure);
    const exactSource = `# ${exactTitle}\n\nExact summary\n\n## Specification\n\nExact specification\n`;
    const exactSourceCode = within(immutable).getByText(
      (_, element) => element?.tagName === "CODE" && element.textContent === exactSource
    );
    expect(exactSourceCode).toBeVisible();

    const forum = screen.getByRole("region", { name: "Forum topic" });
    expect(within(forum).getByText("Fund protocol research")).toBeVisible();
    expect(within(forum).getByText("Proposals · ID 5")).toBeVisible();
    expect(within(forum).getByText("yearn-contributor")).toBeVisible();
    expect(within(forum).getByText("Aug 1, 2024, 12:00 AM UTC")).toBeVisible();
    expect(
      within(forum).getByRole("link", { name: /opens in a new tab/i })
    ).toHaveAttribute("target", "_blank");

    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the exact immutable content/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );

    expect(
      screen.getByRole("button", { name: "Publishing immutable content" })
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
      "Publishing immutable content"
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
    const edit = screen.getByRole("button", { name: "Edit proposal" });
    expect(edit).toBeDisabled();

    edit.removeAttribute("disabled");
    fireEvent.click(edit);
    expect(
      screen.getByRole("heading", { name: "Review the exact proposal" })
    ).toBeVisible();

    expect(
      await screen.findByRole("heading", {
        name: "Immutable content published",
      })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit proposal" })).toBeDisabled();
    expect(exactSourceCode.textContent).toBe(exactSource);
  });

  it("supports keyboard navigation between Write and Preview", async () => {
    const user = userEvent.setup();
    renderAuthoring();

    const writeTab = screen.getByRole("tab", { name: "Write" });
    const previewTab = screen.getByRole("tab", { name: "Preview" });
    await user.click(writeTab);
    await user.keyboard("{ArrowRight}");

    await waitFor(() => expect(previewTab).toHaveFocus());
    expect(previewTab).toHaveAttribute("aria-selected", "true");
    expect(writeTab).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "dao-markdown-preview-tab"
    );

    await user.keyboard("{Home}");
    await waitFor(() => expect(writeTab).toHaveFocus());
    expect(writeTab).toHaveAttribute("aria-selected", "true");
  });

  it("preserves every draft field when publication fails and never starts a wallet step", async () => {
    const user = userEvent.setup();
    renderAuthoring();
    await fillDraft(user, 1002);
    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the exact immutable content/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );

    expect(
      await screen.findByText("Proposal content was not published")
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Create onchain proposal" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit proposal" }));
    expect(
      screen.getByRole("textbox", { name: "Proposal Markdown" })
    ).toHaveValue(
      "# Exact proposal title\n\nExact summary\n\n## Specification\n\nExact specification\n"
    );
    expect(
      screen.getByRole("textbox", { name: "Forum discussion" })
    ).toHaveValue(
      "https://gov.yearn.fi/t/improve-treasury-reporting/1002"
    );
  });

  it.each([
    ["user-rejected", "Wallet request cancelled"],
    ["revert", "Proposal creation failed"],
    ["network-error", "Network request failed"],
  ] as const)("keeps publication and all proposal state clean after %s", async (outcome, title) => {
    const user = userEvent.setup();
    const before = getDaoMockSnapshot();
    const beforeEventCount = countFeedEvents(before);
    renderAuthoring(0, outcome);
    await fillDraft(user, 1001);
    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the exact immutable content/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );
    await screen.findByRole("heading", {
      name: "Immutable content published",
    });
    await user.click(
      screen.getByRole("button", { name: "Create onchain proposal" })
    );

    expect(await screen.findByText(title)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Immutable content published" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry proposal creation" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("link", { name: "View transaction" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open proposal" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy proposal link" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Transaction hash")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Awaiting proposal indexing")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Proposal indexed")).not.toBeInTheDocument();
    expect(readDaoCreatedProposals()).toEqual([]);
    expect(
      sessionStorage.getItem(DAO_CREATED_PROPOSALS_STORAGE_KEY)
    ).toBeNull();

    const after = getDaoMockSnapshot();
    expect(after.feed.proposals).toHaveLength(before.feed.proposals.length);
    expect(countFeedEvents(after)).toBe(beforeEventCount);
    expect(after.pendingAction).toBeNull();
  });

  it("reuses the completed publication when a rejected request retries as Success", async () => {
    const user = userEvent.setup();
    const view = renderAuthoring(0, "user-rejected");
    await fillDraft(user, 1001);
    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the exact immutable content/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Publish immutable content" })
    );
    await screen.findByRole("heading", {
      name: "Immutable content published",
    });
    const fingerprint = screen.getByText("Content fingerprint").parentElement
      ?.textContent;

    await user.click(
      screen.getByRole("button", { name: "Create onchain proposal" })
    );
    await screen.findByText("Wallet request cancelled");

    view.rerender(authoringElement(0, "success"));
    expect(
      screen.getByRole("heading", { name: "Immutable content published" })
    ).toBeVisible();
    expect(screen.getByText("Content fingerprint").parentElement).toHaveTextContent(
      fingerprint ?? ""
    );
    await user.click(
      screen.getByRole("button", { name: "Retry proposal creation" })
    );

    expect(
      await screen.findByRole("heading", { name: "Proposal ready" })
    ).toBeVisible();
    expect(readDaoCreatedProposals()).toHaveLength(1);
  });
});

describe("DAO proposal eligibility presentation", () => {
  it.each([
    ["wrong network", { correctChain: false }, "Switch to the proposal network to continue."],
    ["blacklist", { blacklisted: true }, "This account is blocked from creating proposals."],
    ["weight", { currentWeight: 0n }, "Proposal weight is below the current minimum."],
    ["cooldown", { lastProposedAt: NOW }, "The proposal cooldown is still active."],
  ] as const)("shows the primary %s blocker with all current facts", (_name, patch, reason) => {
    const proposer = proposerState(patch);
    render(<DaoProposalEligibility proposer={proposer} />);

    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.getByText("Current weight")).toBeVisible();
    expect(screen.getByText("Minimum weight")).toBeVisible();
    expect(screen.getByText("Expected voting epoch")).toBeVisible();
    expect(screen.getByText("Affected reward epochs")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/capacity has room/i)
    ).not.toBeInTheDocument();
  });

  it("names full reward capacity as a shared system rule, not a user quota", () => {
    const base = proposerInput();
    const affectedBoostEpochs = base.affectedBoostEpochs.map((epoch, index) => ({
      ...epoch,
      currentProposalCount: index === 2 ? epoch.proposalLimit : epoch.currentProposalCount,
    }));
    render(
      <DaoProposalEligibility
        proposer={deriveDaoProposerState({ ...base, affectedBoostEpochs })}
      />
    );

    expect(
      screen.getByText("Proposal capacity is full in reward epoch 203.")
    ).toBeVisible();
    expect(
      screen.getByText(/shared system-wide; it is not a per-user quota/i)
    ).toHaveTextContent("reward epochs 201–206");
    expect(screen.getByText("64 / 64 proposals")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the authoritative disconnected fact and keeps wallet priority", () => {
    const base = proposerInput();
    const proposer = deriveDaoProposerState({
      ...base,
      connected: false,
      correctChain: false,
      blacklisted: true,
      currentWeight: 0n,
      lastProposedAt: NOW,
      affectedBoostEpochs: base.affectedBoostEpochs.map((epoch, index) => ({
        ...epoch,
        currentProposalCount: index === 0 ? epoch.proposalLimit : 0,
      })),
    });

    render(<DaoProposalEligibility proposer={proposer} />);

    expect(screen.getByText("Connect a wallet to continue.")).toBeVisible();
    expect(screen.getByText("Disconnected")).toBeVisible();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });
});

function renderAuthoring(
  serviceLatencyMs = 0,
  transactionOutcome: DaoMockTransactionOutcome = "success"
) {
  return render(authoringElement(serviceLatencyMs, transactionOutcome));
}

function authoringElement(
  serviceLatencyMs: number,
  transactionOutcome: DaoMockTransactionOutcome
) {
  const proposer = deriveDaoProposerState(proposerInput());
  return (
    <DaoProposalAuthoringForm
      address={proposer.address}
      now={NOW}
      proposer={proposer}
      serviceLatencyMs={serviceLatencyMs}
      transactionOutcome={transactionOutcome}
    />
  );
}

function countFeedEvents(snapshot: ReturnType<typeof getDaoMockSnapshot>) {
  return snapshot.feed.proposals.reduce(
    (count, proposal) => count + proposal.events.length,
    0
  );
}

async function fillDraft(
  user: ReturnType<typeof userEvent.setup>,
  topicId: number,
  title = "Exact proposal title"
) {
  await user.type(
    screen.getByRole("textbox", { name: "Forum discussion" }),
    `https://gov.yearn.fi/t/topic/${topicId}`
  );
  await user.click(screen.getByRole("button", { name: "Validate topic" }));
  await screen.findByText("Forum topic accepted", {
    selector: "#dao-forum-status p",
  });
  const markdown = screen.getByRole("textbox", { name: "Proposal Markdown" });
  await user.clear(markdown);
  await user.type(
    markdown,
    `# ${title}\n\nExact summary\n\n## Specification\n\nExact specification\n`
  );
}

function proposerInput(): DaoProposerEligibilityInput {
  return structuredClone(getDaoMockFixture("discussion").proposer);
}

function proposerState(patch: Partial<DaoProposerEligibilityInput>) {
  return deriveDaoProposerState({ ...proposerInput(), ...patch });
}
