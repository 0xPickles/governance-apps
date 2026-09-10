"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { Address, Hex } from "viem";
import { IconCopy } from "@/components/icons/IconCopy";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { Badge } from "@/components/ui/Badge";
import { Button, getButtonClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UtcTime } from "@/components/ui/UtcTime";
import {
  checkDaoExecutorScript,
  DAO_PROPOSAL_MARKDOWN_LIMITS,
  parseDaoProposalContent,
  serializeDaoProposalRef,
  type DaoDecodedProposeIdentity,
  type DaoMockAuthoring,
  type DaoMockTransactionOutcome,
  type DaoProposalType,
  type DaoProposerState,
  type DaoScriptCheck,
} from "@/lib/clients/dao";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/cn";
import { getEtherscanTransactionUrl } from "@/lib/explorer";
import { formatTokenAmount } from "@/lib/format";
import {
  createDaoAuthoringReview,
  DAO_PROPOSAL_MARKDOWN_TEMPLATE,
  findFirstFullDaoCapacityEpoch,
  type DaoAuthoringErrors,
} from "./authoring";
import {
  DaoProposalMarkdown,
  DaoProposalMarkdownSource,
} from "../components/DaoProposalMarkdown";
import {
  completeMockDaoProposalIndex,
  confirmMockDaoProposalReceipt,
  publishMockDaoProposalContent,
  registerMockDaoProposalAwaitingIndex,
  submitMockDaoProposal,
  validateMockDaoForumTopic,
  type DaoAuthoringReview,
  type DaoForumTopic,
  type DaoPublishedContent,
} from "./mock-services";
import type { DaoAuthoringServices, DaoAuthoringRecovery } from "@/lib/clients/dao/authoring-services";
import { daoProposeCopy } from "./messages";
import { createDaoProposalHref } from "../route-state";

const FIELD_CLASS_NAME =
  "w-full rounded-box border border-border bg-surface px-3 text-base text-text-primary shadow-sm transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-text-secondary focus:border-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary focus:ring-offset-2 focus:ring-offset-app motion-reduce:transition-none";
const INPUT_CLASS_NAME = `${FIELD_CLASS_NAME} h-12`;
const TEXTAREA_CLASS_NAME = `${FIELD_CLASS_NAME} min-h-32 py-3`;

type ForumState =
  | { state: "idle" }
  | { state: "validating" }
  | { state: "valid"; topic: DaoForumTopic }
  | { state: "invalid"; code: string; message: string };

type PublicationState =
  | { state: "idle" }
  | { state: "publishing" }
  | { state: "failed"; message: string }
  | { state: "published"; publication: DaoPublishedContent };

type WalletState =
  | { state: "idle" }
  | { state: "waiting" }
  | {
      state: "failed";
      code: "WALLET_REJECTED" | "PROPOSAL_REVERTED" | "NETWORK_ERROR";
      message: string;
    }
  | { state: "receipt_pending"; transactionHash: Hex }
  | {
      state: "receipt_failed";
      transactionHash: Hex;
      code: string;
      message: string;
    }
  | {
      state:
        | "identity_decoded"
        | "awaiting_index"
        | "indexed"
        | "index_failed";
      transactionHash: Hex;
      identity: DaoDecodedProposeIdentity;
      message?: string;
    };

type DaoProposalAuthoringFormProps = {
  services?: DaoAuthoringServices;
  recovery?: DaoAuthoringRecovery | null;
  address: Address;
  authoringPreset?: DaoMockAuthoring | null;
  hostname?: string;
  now: number;
  proposer: DaoProposerState;
  serviceLatencyMs?: number;
  transactionOutcome?: DaoMockTransactionOutcome;
};

export function DaoProposalAuthoringForm(
  props: DaoProposalAuthoringFormProps
) {
  const presetKey = props.authoringPreset
    ? props.authoringPreset.state
    : "default";
  return <DaoProposalAuthoringFormState key={presetKey} {...props} />;
}

function DaoProposalAuthoringFormState({
  address,
  services,
  recovery,
  authoringPreset,
  hostname,
  now,
  proposer,
  serviceLatencyMs = 140,
  transactionOutcome = "success",
}: DaoProposalAuthoringFormProps) {
  const [markdown, setMarkdown] = useState(DAO_PROPOSAL_MARKDOWN_TEMPLATE);
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [proposalType, setProposalType] = useState<DaoProposalType>(
    authoringPreset?.proposalType ?? "signal"
  );
  const [executableScript, setExecutableScript] = useState(
    authoringPreset?.proposalType === "executable"
      ? authoringPreset.scriptCheck.script
      : "0x"
  );
  const [forumInput, setForumInput] = useState("");
  const [forumState, setForumState] = useState<ForumState>({ state: "idle" });
  const [errors, setErrors] = useState<DaoAuthoringErrors>({});
  const [review, setReview] = useState<DaoAuthoringReview | null>(recovery?.review ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [publication, setPublication] = useState<PublicationState>(recovery ? { state: "published", publication: recovery.publication } : { state: "idle" });
  const [wallet, setWallet] = useState<WalletState>({ state: "idle" });
  const forumRequest = useRef(0);
  const publicationLock = useRef(Boolean(recovery));
  const forumInputRef = useRef<HTMLInputElement>(null);
  const markdownRef = useRef<HTMLTextAreaElement>(null);
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const pendingErrorFocusRef = useRef<{
    field: keyof DaoAuthoringErrors;
    offset: number | null;
  } | null>(null);
  const proposalStepHeadingRef = useRef<HTMLHeadingElement>(null);
  const proposalCompleteHeadingRef = useRef<HTMLHeadingElement>(null);

  const exactScript = proposalType === "signal" ? "0x" : executableScript;
  const scriptCheck = checkDaoExecutorScript(exactScript, proposalType);
  const topic = forumState.state === "valid" ? forumState.topic : null;
  const parsedDraftContent = useMemo(
    () =>
      parseDaoProposalContent({
        schema: "yearn.dao.proposal.v1",
        markdown,
        discussionUrl:
          topic?.normalizedUrl ?? "https://gov.yearn.fi/t/pending/0",
        proposalType,
        createdBy: address,
        createdAt: new Date(now * 1_000).toISOString(),
        assets: [],
      }),
    [address, markdown, now, proposalType, topic?.normalizedUrl]
  );
  const draftAnnouncement =
    forumState.state === "validating"
      ? daoProposeCopy.discussion.validating
      : forumState.state === "valid"
        ? daoProposeCopy.discussion.accepted
        : forumState.state === "invalid"
          ? `${forumState.code}. ${forumState.message}`
          : "";
  const transactionHash = getWalletTransactionHash(wallet);

  useEffect(() => {
    if (publication.state !== "published") return;

    proposalStepHeadingRef.current?.focus({ preventScroll: true });
    proposalStepHeadingRef.current?.scrollIntoView?.({ block: "center" });
  }, [publication.state]);

  useEffect(() => {
    if (transactionHash === null) return;

    proposalCompleteHeadingRef.current?.focus({ preventScroll: true });
    proposalCompleteHeadingRef.current?.scrollIntoView?.({ block: "center" });
  }, [transactionHash]);

  useEffect(() => {
    const pending = pendingErrorFocusRef.current;
    if (!pending || (pending.field === "markdown" && editorMode !== "write")) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const refs = {
        forum: forumInputRef,
        markdown: markdownRef,
        script: scriptRef,
      } as const;
      const control = refs[pending.field].current;
      if (!control) return;

      control.focus({ preventScroll: true });
      if (
        pending.field === "markdown" &&
        control instanceof HTMLTextAreaElement &&
        pending.offset !== null
      ) {
        const offset = Math.min(pending.offset, control.value.length);
        control.setSelectionRange(offset, offset);
      }
      control.scrollIntoView?.({ block: "center" });
      pendingErrorFocusRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [editorMode, errors]);

  const handleForumInput = (value: string) => {
    forumRequest.current += 1;
    setForumInput(value);
    setForumState({ state: "idle" });
    setErrors((current) => ({ ...current, forum: undefined }));
  };

  const handleForumValidation = async () => {
    const request = forumRequest.current + 1;
    forumRequest.current = request;
    setForumState({ state: "validating" });
    const result = await (services?.validateForum ?? validateMockDaoForumTopic)(
      forumInput,
      serviceLatencyMs
    );
    if (request !== forumRequest.current) return;
    if (result.state === "invalid") {
      setForumState({
        state: "invalid",
        code: result.error.code,
        message: result.error.message,
      });
      return;
    }
    setForumInput(result.topic.normalizedUrl);
    setForumState({ state: "valid", topic: result.topic });
    setErrors((current) => ({ ...current, forum: undefined }));
  };

  const handleReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = createDaoAuthoringReview({
      address,
      createdAt: now,
      draft: {
        markdown,
        proposalType,
        executableScript,
      },
      topic,
    });

    if (result.state === "invalid") {
      setErrors(result.errors);
      focusFirstError(result.errors, result.contentValidation.errors[0] ?? null);
      return;
    }

    setErrors({});
    setReview(result.review);
    setConfirmed(false);
    setConfirmationError(null);
    setPublication({ state: "idle" });
    setWallet({ state: "idle" });
    requestAnimationFrame(() => {
      document.getElementById("dao-proposal-final-review")?.focus();
    });
  };

  const focusFirstError = (
    nextErrors: DaoAuthoringErrors,
    contentError: { offset: number | null } | null
  ) => {
    const first = (Object.keys(nextErrors) as (keyof DaoAuthoringErrors)[])[0];
    if (!first) return;
    pendingErrorFocusRef.current = {
      field: first,
      offset: first === "markdown" ? (contentError?.offset ?? null) : null,
    };
    if (first === "markdown") setEditorMode("write");
  };

  const handleEditorTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    mode: "write" | "preview"
  ) => {
    let nextMode: "write" | "preview" | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextMode = mode === "write" ? "preview" : "write";
    } else if (event.key === "Home") {
      nextMode = "write";
    } else if (event.key === "End") {
      nextMode = "preview";
    }
    if (!nextMode) return;

    event.preventDefault();
    setEditorMode(nextMode);
    requestAnimationFrame(() => {
      document.getElementById(`dao-markdown-${nextMode}-tab`)?.focus();
    });
  };

  const handleEdit = () => {
    if (
      publicationLock.current ||
      publication.state === "publishing" ||
      publication.state === "published"
    ) {
      return;
    }
    setReview(null);
    setConfirmed(false);
    setConfirmationError(null);
    setPublication({ state: "idle" });
    setWallet({ state: "idle" });
    requestAnimationFrame(() => markdownRef.current?.focus());
  };

  const handlePublish = async () => {
    if (!review || publicationLock.current) return;
    if (!confirmed) {
      setConfirmationError(daoProposeCopy.review.confirmRequired);
      return;
    }
    if (!proposer.canPropose) return;

    setConfirmationError(null);
    publicationLock.current = true;
    setPublication({ state: "publishing" });
    setWallet({ state: "idle" });
    const result = await (services?.publish ?? publishMockDaoProposalContent)(
      review,
      now,
      serviceLatencyMs
    );
    if (result.state === "failed") {
      publicationLock.current = false;
      setPublication({ state: "failed", message: result.error.message });
      return;
    }
    setPublication({ state: "published", publication: result.publication });
  };

  const handleCreateProposal = async () => {
    if (
      !review ||
      publication.state !== "published" ||
      wallet.state === "waiting" ||
      getWalletTransactionHash(wallet) !== null ||
      !proposer.canPropose
    ) {
      return;
    }

    setWallet({ state: "waiting" });
    const result = await (services?.submit ?? submitMockDaoProposal)({
      onSubmitted: hash => setWallet({ state: "receipt_pending", transactionHash: hash }),
      review,
      publication: publication.publication,
      outcome: transactionOutcome,
      latencyMs: serviceLatencyMs,
    });
    if (result.state === "failed") {
      setWallet({
        state: "failed",
        code: result.error.code,
        message: result.error.message,
      });
      return;
    }
    setWallet({
      state: "receipt_pending",
      transactionHash: result.transactionHash,
    });

    await confirmAndIndex(result.transactionHash);
  };

  const confirmAndIndex = async (hash: Hex) => {
    if (!review || publication.state !== "published") return;
    setWallet({ state: "receipt_pending", transactionHash: hash });
    try {
      const receipt = await (services?.confirm ?? confirmMockDaoProposalReceipt)(
        review,
        publication.publication,
        hash,
        proposer.expectedVotingEpoch,
        serviceLatencyMs
      );
      if (receipt.decoded.state === "invalid") {
        setWallet({
          state: "receipt_failed",
          transactionHash: hash,
          code: receipt.decoded.error.code,
          message: receipt.decoded.error.message,
        });
        return;
      }

      const identity = receipt.decoded.identity;
      setWallet({
        state: "identity_decoded",
        transactionHash: hash,
        identity,
      });

      await indexProposal(
        review,
        publication.publication,
        hash,
        identity
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "DAO_TRANSACTION_REVERTED") {
        setWallet({ state: "failed", code: "PROPOSAL_REVERTED", message: error.message });
      } else {
        setWallet({ state: "receipt_failed", transactionHash: hash, code: "RECEIPT_UNAVAILABLE", message: error instanceof Error ? error.message : "Receipt confirmation failed." });
      }
    }
  };

  const indexProposal = async (
    proposalReview: DaoAuthoringReview,
    publishedContent: DaoPublishedContent,
    transactionHash: Hex,
    identity: DaoDecodedProposeIdentity
  ) => {
    setWallet({
      state: "identity_decoded",
      transactionHash,
      identity,
    });

    try {
      await (services?.register ?? registerMockDaoProposalAwaitingIndex)(
        proposalReview,
        publishedContent,
        identity,
        serviceLatencyMs
      );
      setWallet({
        state: "awaiting_index",
        transactionHash,
        identity,
      });
      const indexed = await (services?.index ?? completeMockDaoProposalIndex)(
        identity.ref,
        now,
        serviceLatencyMs
      );
      if (!indexed) {
        setWallet({
          state: "index_failed",
          transactionHash,
          identity,
          message: daoProposeCopy.proposal.indexingDelayedBody,
        });
        return;
      }
      setWallet({
        state: "indexed",
        transactionHash,
        identity,
      });
    } catch {
      setWallet({
        state: "index_failed",
        transactionHash,
        identity,
        message: daoProposeCopy.proposal.indexingDelayedBody,
      });
    }
  };

  const resumed = useRef(false);
  useEffect(() => {
    if (!resumed.current && recovery?.transactionHash) {
      resumed.current = true;
      void confirmAndIndex(recovery.transactionHash);
    }
  });
  const handleRetryIndexing = async () => {
    if (
      !review ||
      publication.state !== "published" ||
      (wallet.state !== "index_failed" && wallet.state !== "receipt_failed")
    ) {
      return;
    }

    if (wallet.state === "receipt_failed") { await confirmAndIndex(wallet.transactionHash); return; }
    await indexProposal(
      review,
      publication.publication,
      wallet.transactionHash,
      wallet.identity
    );
  };

  if (review) {
    return (
      <DaoFinalReview
        confirmed={confirmed}
        confirmationError={confirmationError}
        onConfirm={(value) => {
          setConfirmed(value);
          if (value) setConfirmationError(null);
        }}
        onCreateProposal={handleCreateProposal}
        onEdit={handleEdit}
        onPublish={handlePublish}
        onRetryIndexing={handleRetryIndexing}
        proposer={proposer}
        publication={publication}
        proposalCompleteHeadingRef={proposalCompleteHeadingRef}
        proposalStepHeadingRef={proposalStepHeadingRef}
        review={review}
        hostname={hostname}
        wallet={wallet}
      />
    );
  }

  return (
    <Card className="min-w-0 space-y-8 overflow-hidden p-4 sm:p-6">
      <AuthoringLiveRegion message={draftAnnouncement} />
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-yearn-blue dark:text-blue-300">
          {daoProposeCopy.form.eyebrow}
        </p>
        <h2
          id="dao-proposal-authoring-heading"
          tabIndex={-1}
          className="w-fit max-w-full scroll-mt-24 rounded-box text-balance text-2xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app md:text-3xl"
        >
          {daoProposeCopy.form.title}
        </h2>
        <p className="max-w-3xl text-pretty text-sm leading-6 text-text-secondary">
          {daoProposeCopy.form.description}
        </p>
      </div>

      {Object.keys(errors).length > 0 ? (
        <div
          role="alert"
          className="rounded-box border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
        >
          <p className="font-bold">{daoProposeCopy.form.validationTitle}</p>
        </div>
      ) : null}

      <form noValidate className="space-y-8" onSubmit={handleReview}>
        <AuthoringSection
          number={daoProposeCopy.discussion.step}
          title={daoProposeCopy.discussion.title}
          description={daoProposeCopy.discussion.description}
        >
          <div className="space-y-2">
            <label htmlFor="dao-forum-topic" className="block text-sm font-bold">
              {daoProposeCopy.discussion.label}
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                ref={forumInputRef}
                id="dao-forum-topic"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={forumInput}
                placeholder={daoProposeCopy.discussion.placeholder}
                aria-invalid={Boolean(errors.forum || forumState.state === "invalid")}
                aria-describedby="dao-forum-help dao-forum-status"
                className={INPUT_CLASS_NAME}
                onChange={(event) => handleForumInput(event.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                isLoading={forumState.state === "validating"}
                className="h-12 w-full motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto"
                onClick={() => {
                  void handleForumValidation();
                }}
              >
                {forumState.state === "validating"
                  ? daoProposeCopy.discussion.validating
                  : daoProposeCopy.discussion.validate}
              </Button>
            </div>
            <p id="dao-forum-help" className="text-pretty text-xs leading-5 text-text-secondary">
              {daoProposeCopy.discussion.placeholder}
            </p>
            <ForumStatus state={forumState} error={errors.forum} />
          </div>
        </AuthoringSection>

        <AuthoringSection
          number={daoProposeCopy.content.step}
          title={daoProposeCopy.content.title}
          description={daoProposeCopy.content.description}
        >
          <div className="min-w-0 space-y-3">
            <div
              role="tablist"
              aria-label="Proposal document mode"
              className="inline-flex min-h-11 rounded-box bg-surface-secondary p-1"
            >
              {(["write", "preview"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  id={`dao-markdown-${mode}-tab`}
                  role="tab"
                  aria-selected={editorMode === mode}
                  aria-controls={`dao-markdown-${mode}-panel`}
                  tabIndex={editorMode === mode ? 0 : -1}
                  className={cn(
                    "min-h-10 rounded-box px-4 text-sm font-bold transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary motion-reduce:transition-none motion-reduce:active:scale-100",
                    editorMode === mode
                      ? "bg-surface text-text-primary shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                  onClick={() => setEditorMode(mode)}
                  onKeyDown={(event) => handleEditorTabKeyDown(event, mode)}
                >
                  {mode === "write"
                    ? daoProposeCopy.content.write
                    : daoProposeCopy.content.preview}
                </button>
              ))}
            </div>

            {editorMode === "write" ? (
              <div
                id="dao-markdown-write-panel"
                role="tabpanel"
                aria-labelledby="dao-markdown-write-tab"
                className="min-w-0 space-y-2"
              >
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <label htmlFor="dao-proposal-markdown" className="text-sm font-bold">
                    {daoProposeCopy.content.markdownLabel}
                  </label>
                  <span
                    id="dao-markdown-byte-count"
                    className="font-number text-xs tabular-nums text-text-secondary"
                  >
                    {daoProposeCopy.content.byteCount(
                      parsedDraftContent.byteLength,
                      DAO_PROPOSAL_MARKDOWN_LIMITS.maxUtf8Bytes
                    )}
                  </span>
                </div>
                <textarea
                  ref={markdownRef}
                  id="dao-proposal-markdown"
                  rows={16}
                  value={markdown}
                  spellCheck
                  aria-invalid={Boolean(errors.markdown)}
                  aria-describedby="dao-markdown-byte-count dao-markdown-grammar dao-markdown-validation"
                  className={cn(
                    TEXTAREA_CLASS_NAME,
                    "min-h-80 resize-y font-number text-sm leading-6"
                  )}
                  onChange={(event) => {
                    setMarkdown(event.target.value);
                    setErrors((current) => ({ ...current, markdown: undefined }));
                  }}
                />
              </div>
            ) : (
              <div
                id="dao-markdown-preview-panel"
                role="tabpanel"
                aria-labelledby="dao-markdown-preview-tab"
                tabIndex={0}
                className="min-w-0 rounded-box border border-border bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-text-primary sm:p-5"
              >
                {parsedDraftContent.errors.length === 0 ? (
                  <DaoProposalMarkdown
                    context="preview"
                    hostname={hostname}
                    parsed={parsedDraftContent}
                  />
                ) : (
                  <p className="text-pretty text-sm leading-6 text-text-secondary">
                    Fix the document errors listed below to see the final preview.
                  </p>
                )}
              </div>
            )}

            <p id="dao-markdown-grammar" className="text-pretty text-xs leading-5 text-text-secondary">
              {daoProposeCopy.content.grammar}
            </p>
            <div
              id="dao-markdown-validation"
              className={cn(
                "space-y-2 rounded-box p-3 text-sm",
                parsedDraftContent.errors.length === 0
                  ? "bg-green-50 text-green-950 dark:bg-green-950/35 dark:text-green-100"
                  : "border border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
              )}
            >
              <p className="font-bold">
                {parsedDraftContent.errors.length === 0
                  ? daoProposeCopy.content.valid
                  : daoProposeCopy.content.validation}
              </p>
              {parsedDraftContent.errors.length > 0 ? (
                <ul className="space-y-1">
                  {parsedDraftContent.errors.map((error) => (
                    <li key={`${error.code}:${error.offset ?? error.manifestIndex ?? "none"}`}>
                      <span className="font-number font-bold">{error.code}</span>
                      {error.line !== null && error.column !== null
                        ? ` · line ${error.line}, column ${error.column}`
                        : ""}
                      {` · ${error.message}`}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </AuthoringSection>

        <AuthoringSection
          number={daoProposeCopy.type.step}
          title={daoProposeCopy.type.title}
          description={daoProposeCopy.type.description}
        >
          <fieldset>
            <legend className="sr-only">{daoProposeCopy.type.title}</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <ProposalTypeChoice
                checked={proposalType === "signal"}
                description={daoProposeCopy.type.signalDescription}
                label={daoProposeCopy.type.signal}
                value="signal"
                onChange={setProposalType}
              />
              <ProposalTypeChoice
                checked={proposalType === "executable"}
                description={daoProposeCopy.type.executableDescription}
                label={daoProposeCopy.type.executable}
                value="executable"
                onChange={setProposalType}
              />
            </div>
          </fieldset>
        </AuthoringSection>

        <AuthoringSection
          number={daoProposeCopy.script.step}
          title={daoProposeCopy.script.title}
          description={
            proposalType === "signal"
              ? daoProposeCopy.script.emptyBody
              : daoProposeCopy.script.description
          }
        >
          {proposalType === "signal" ? (
            <SignalScriptSummary scriptCheck={scriptCheck} />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="dao-executor-script" className="block text-sm font-bold">
                  {daoProposeCopy.script.label}
                </label>
                <textarea
                  ref={scriptRef}
                  id="dao-executor-script"
                  rows={10}
                  value={executableScript}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder={daoProposeCopy.script.placeholder}
                  aria-invalid={scriptCheck.state === "invalid" || Boolean(errors.script)}
                  aria-describedby="dao-script-help dao-script-status"
                  className={cn(TEXTAREA_CLASS_NAME, "font-number text-sm leading-6")}
                  onChange={(event) => {
                    setExecutableScript(event.target.value);
                    setErrors((current) => ({ ...current, script: undefined }));
                  }}
                />
              </div>
              <p id="dao-script-help" className="text-pretty text-xs leading-5 text-text-secondary">
                {daoProposeCopy.script.indexedScript}
              </p>
              <ScriptStatus scriptCheck={scriptCheck} />
            </div>
          )}
        </AuthoringSection>

        <AuthoringSection
          number={daoProposeCopy.eligibility.step}
          title={daoProposeCopy.eligibility.title}
          description={daoProposeCopy.eligibility.description}
        >
          <DaoProposalEligibility proposer={proposer} />
        </AuthoringSection>

        <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-pretty text-sm leading-6 text-text-secondary">
            {daoProposeCopy.script.indexedScript}
          </p>
          <Button
            type="submit"
            className="w-full shrink-0 motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto"
          >
            {daoProposeCopy.form.review}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DaoFinalReview({
  confirmed,
  confirmationError,
  onConfirm,
  onCreateProposal,
  onEdit,
  onPublish,
  onRetryIndexing,
  proposer,
  publication,
  proposalCompleteHeadingRef,
  proposalStepHeadingRef,
  review,
  hostname,
  wallet,
}: {
  confirmed: boolean;
  confirmationError: string | null;
  onConfirm: (value: boolean) => void;
  onCreateProposal: () => Promise<void>;
  onEdit: () => void;
  onPublish: () => Promise<void>;
  onRetryIndexing: () => Promise<void>;
  proposer: DaoProposerState;
  publication: PublicationState;
  proposalCompleteHeadingRef: RefObject<HTMLHeadingElement | null>;
  proposalStepHeadingRef: RefObject<HTMLHeadingElement | null>;
  review: DaoAuthoringReview;
  hostname?: string;
  wallet: WalletState;
}) {
  const [proposalLinkCopied, setProposalLinkCopied] = useState(false);
  const publicationLocked =
    publication.state === "publishing" || publication.state === "published";
  const contentPublished = publication.state === "published";
  const transactionHash = getWalletTransactionHash(wallet);
  const proposalIdentity = getWalletProposalIdentity(wallet);
  const walletFinished = transactionHash !== null;
  const proposalHref = proposalIdentity
    ? createDaoProposalHref(
        proposalIdentity.ref.proposalId,
        "upcoming",
        hostname,
        proposalIdentity.ref
      )
    : null;
  const announcement =
    proposalLinkCopied
      ? daoProposeCopy.proposal.copied
      : publication.state === "publishing"
      ? daoProposeCopy.publication.publishing
      : publication.state === "failed"
        ? publication.message
        : wallet.state === "waiting"
          ? daoProposeCopy.proposal.waiting
          : wallet.state === "failed"
            ? wallet.message
            : wallet.state === "receipt_pending"
              ? daoProposeCopy.proposal.receiptPending
              : wallet.state === "receipt_failed"
                ? wallet.message
                : wallet.state === "identity_decoded"
                  ? daoProposeCopy.proposal.identityConfirmed
                  : wallet.state === "awaiting_index"
                    ? daoProposeCopy.proposal.awaitingIndex
                    : wallet.state === "indexed"
                      ? daoProposeCopy.proposal.indexedTitle
                      : wallet.state === "index_failed"
                        ? daoProposeCopy.proposal.indexingDelayedTitle
              : publication.state === "published"
                ? daoProposeCopy.publication.successTitle
                : "";

  return (
    <Card className="min-w-0 space-y-8 overflow-hidden p-4 sm:p-6">
      <AuthoringLiveRegion message={announcement} />
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-yearn-blue dark:text-blue-300">
          {daoProposeCopy.review.eyebrow}
        </p>
        <h2
          id="dao-proposal-final-review"
          tabIndex={-1}
          className="text-balance text-2xl font-bold outline-none md:text-3xl"
        >
          {daoProposeCopy.review.title}
        </h2>
        <p className="max-w-3xl text-pretty text-sm leading-6 text-text-secondary">
          {daoProposeCopy.review.description}
        </p>
      </div>

      <ReviewSection title={daoProposeCopy.review.forum}>
        <ReviewFact label={daoProposeCopy.discussion.topicTitle}>
          {review.topic.title}
        </ReviewFact>
        <ReviewFact label={daoProposeCopy.discussion.normalizedUrl}>
          <a
            href={review.topic.normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${review.topic.normalizedUrl} (${daoProposeCopy.discussion.newTab})`}
            className="-mx-1 inline-flex min-h-10 max-w-full items-center rounded-box px-1 text-yearn-blue underline decoration-yearn-blue/40 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-text-primary dark:text-blue-300 dark:decoration-blue-300/50"
          >
            <span className="break-all">{review.topic.normalizedUrl}</span>
          </a>
        </ReviewFact>
        <ReviewFact label={daoProposeCopy.discussion.category}>
          {review.topic.category} · ID {review.topic.categoryId}
        </ReviewFact>
        <ReviewFact label={daoProposeCopy.discussion.author}>
          {review.topic.author}
        </ReviewFact>
        <ReviewFact label={daoProposeCopy.discussion.created} mono>
          <UtcTime timestamp={review.topic.createdAt} />
        </ReviewFact>
      </ReviewSection>

      <ReviewSection title={daoProposeCopy.review.immutableContent}>
        <ReviewFact label={daoProposeCopy.review.schema} mono>
          {review.content.schema}
        </ReviewFact>
        <div className="min-w-0 rounded-box border border-border bg-surface p-4 sm:p-5">
          <DaoProposalMarkdown
            context="preview"
            hostname={hostname}
            parsed={review.parsedContent}
          />
        </div>
        <DaoProposalMarkdownSource source={review.content.markdown} />
        <ReviewFact label={daoProposeCopy.review.creator} mono>
          {review.content.createdBy}
        </ReviewFact>
        <ReviewFact label={daoProposeCopy.review.createdAt} mono>
          {review.content.createdAt}
        </ReviewFact>
        <ReviewFact label={daoProposeCopy.review.proposalType}>
          {review.content.proposalType === "signal"
            ? daoProposeCopy.type.signal
            : daoProposeCopy.type.executable}
        </ReviewFact>
      </ReviewSection>

      <ReviewSection title={daoProposeCopy.review.exactScript}>
        {review.content.proposalType === "signal" ? (
          <p className="text-pretty text-sm font-bold">
            {daoProposeCopy.script.emptyTitle}
          </p>
        ) : (
          <p className="text-pretty text-sm font-bold text-green-800 dark:text-green-300">
            {daoProposeCopy.script.valid}
          </p>
        )}
        <CodeValue>{review.scriptCheck.script}</CodeValue>
        <ReviewFact label={daoProposeCopy.script.scriptHash} mono>
          {review.scriptCheck.scriptHash ?? "--"}
        </ReviewFact>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric
            label={daoProposeCopy.script.callCount}
            value={review.scriptCheck.frames.length.toString()}
          />
          <Metric
            label={daoProposeCopy.script.scriptBytes}
            value={(review.scriptCheck.scriptBytes ?? 0).toString()}
          />
        </div>
        {review.scriptCheck.frames.length > 0 ? (
          <ScriptFrames scriptCheck={review.scriptCheck} />
        ) : null}
        <p className="text-pretty text-sm leading-6 text-text-secondary">
          {daoProposeCopy.script.indexedScript}
        </p>
      </ReviewSection>

      <ReviewSection title={daoProposeCopy.eligibility.title}>
        <DaoProposalEligibility proposer={proposer} />
      </ReviewSection>

      <ReviewSection title={daoProposeCopy.review.submissionSteps}>
        <p className="max-w-3xl text-pretty text-sm leading-6 text-text-secondary">
          {daoProposeCopy.review.submissionStepsBody}
        </p>
        <ol className="grid gap-3 text-sm md:grid-cols-2">
          <SubmissionStep
            number="1"
            label={daoProposeCopy.review.publishStep}
            description={daoProposeCopy.review.publishStepBody}
            status={contentPublished ? "complete" : "current"}
          />
          <SubmissionStep
            number="2"
            label={daoProposeCopy.review.proposeStep}
            description={
              contentPublished
                ? daoProposeCopy.review.proposeStepBody
                : daoProposeCopy.review.proposeStepUpcoming
            }
            status={
              walletFinished
                ? "complete"
                : contentPublished
                  ? "current"
                  : "upcoming"
            }
          />
        </ol>
      </ReviewSection>

      {!contentPublished ? (
        <section
          aria-labelledby="dao-publication-step-heading"
          className="space-y-4 rounded-box border border-yearn-blue/40 bg-yearn-blue/5 p-4 sm:p-5 dark:border-blue-700 dark:bg-blue-950/30"
        >
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wide text-yearn-blue dark:text-blue-300">
              {daoProposeCopy.review.current}
            </p>
            <h3
              id="dao-publication-step-heading"
              className="text-balance text-xl font-bold"
            >
              {daoProposeCopy.review.publishStep}
            </h3>
            <p className="max-w-3xl text-pretty text-sm leading-6 text-text-secondary">
              {daoProposeCopy.review.publishStepBody}
            </p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-box bg-surface-secondary p-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={confirmed}
              aria-describedby={confirmationError ? "dao-confirmation-error" : undefined}
              className="mt-1 size-5 shrink-0 accent-yearn-blue focus:outline-none focus:ring-2 focus:ring-text-primary focus:ring-offset-2"
              onChange={(event) => onConfirm(event.target.checked)}
            />
            <span>{daoProposeCopy.review.confirm}</span>
          </label>
          {confirmationError ? (
            <p
              id="dao-confirmation-error"
              role="alert"
              className="text-sm text-red-800 dark:text-red-300"
            >
              {confirmationError}
            </p>
          ) : null}
          {publication.state === "failed" ? (
            <StateNotice
              tone="error"
              title={daoProposeCopy.publication.failedTitle}
              body={publication.message}
            />
          ) : null}
          {!proposer.canPropose ? (
            <StateNotice
              tone="warning"
              title={daoProposeCopy.landing.blockedTitle}
              body={
                proposer.proposeBlockedReason ??
                daoProposeCopy.landing.blockedFallback
              }
            />
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={publicationLocked}
              className="w-full motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto"
              onClick={onEdit}
            >
              {daoProposeCopy.form.edit}
            </Button>
            <Button
              type="button"
              disabled={!proposer.canPropose}
              isLoading={publication.state === "publishing"}
              className="w-full motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto"
              onClick={() => {
                void onPublish();
              }}
            >
              {publication.state === "failed"
                ? daoProposeCopy.publication.retry
                : publication.state === "publishing"
                  ? daoProposeCopy.publication.publishing
                  : daoProposeCopy.publication.publish}
            </Button>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          <section
            aria-labelledby="dao-publication-receipt-heading"
            className="space-y-3 rounded-box border border-green-300 bg-green-50 p-4 text-green-950 sm:p-5 dark:border-green-900 dark:bg-green-950/35 dark:text-green-100"
          >
            <p className="text-xs font-bold uppercase tracking-wide">
              {daoProposeCopy.review.complete}
            </p>
            <h3
              id="dao-publication-receipt-heading"
              className="text-balance text-xl font-bold"
            >
              {daoProposeCopy.publication.successTitle}
            </h3>
            <p className="max-w-3xl text-pretty text-sm leading-6">
              {daoProposeCopy.publication.successBody}
            </p>
            <ReviewFact label={daoProposeCopy.publication.fingerprint} mono>
              {publication.publication.fingerprint}
            </ReviewFact>
          </section>

          {!walletFinished ? (
            <section
              aria-labelledby="dao-proposal-step-heading"
              className="space-y-4 rounded-box border border-yearn-blue/50 bg-surface p-4 shadow-sm sm:p-5 dark:border-blue-700"
            >
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-yearn-blue dark:text-blue-300">
                  {daoProposeCopy.review.current}
                </p>
                <h3
                  ref={proposalStepHeadingRef}
                  id="dao-proposal-step-heading"
                  tabIndex={-1}
                  className="w-fit max-w-full rounded-box text-balance text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app"
                >
                  {daoProposeCopy.review.proposeStepCurrent}
                </h3>
                <p className="text-sm font-bold">
                  {daoProposeCopy.review.proposeStep}
                </p>
                <p className="max-w-3xl text-pretty text-sm leading-6 text-text-secondary">
                  {daoProposeCopy.review.proposeStepBody}
                </p>
              </div>

              {wallet.state === "failed" ? (
                <StateNotice
                  tone="error"
                  title={
                    wallet.code === "WALLET_REJECTED"
                      ? daoProposeCopy.proposal.rejectedTitle
                      : wallet.code === "NETWORK_ERROR"
                        ? daoProposeCopy.proposal.networkErrorTitle
                        : daoProposeCopy.proposal.revertedTitle
                  }
                  body={wallet.message}
                />
              ) : null}

              <div className="space-y-3">
                {!proposer.canPropose ? (
                  <StateNotice
                    tone="warning"
                    title={daoProposeCopy.landing.blockedTitle}
                    body={
                      proposer.proposeBlockedReason ??
                      daoProposeCopy.landing.blockedFallback
                    }
                  />
                ) : null}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled
                    className="w-full motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto"
                    onClick={onEdit}
                  >
                    {daoProposeCopy.form.edit}
                  </Button>
                  <Button
                    type="button"
                    disabled={!proposer.canPropose}
                    isLoading={wallet.state === "waiting"}
                    className="w-full motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto"
                    onClick={() => {
                      void onCreateProposal();
                    }}
                  >
                    {wallet.state === "failed"
                      ? daoProposeCopy.proposal.retry
                      : wallet.state === "waiting"
                        ? daoProposeCopy.proposal.waiting
                        : daoProposeCopy.proposal.create}
                  </Button>
                </div>
              </div>
            </section>
          ) : transactionHash ? (
            <section
              aria-labelledby="dao-proposal-complete-heading"
              className={cn(
                "space-y-4 rounded-box border p-4 sm:p-5",
                wallet.state === "receipt_failed"
                  ? "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/35 dark:text-red-100"
                  : wallet.state === "receipt_pending"
                    ? "border-yearn-blue/50 bg-surface text-text-primary dark:border-blue-700"
                    : "border-green-300 bg-green-50 text-green-950 dark:border-green-900 dark:bg-green-950/35 dark:text-green-100"
              )}
            >
              <p className="text-xs font-bold uppercase tracking-wide">
                {daoProposeCopy.review.complete}
              </p>
              <h3
                ref={proposalCompleteHeadingRef}
                id="dao-proposal-complete-heading"
                tabIndex={-1}
                className="w-fit max-w-full rounded-box text-balance text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app"
              >
                {wallet.state === "receipt_pending"
                  ? daoProposeCopy.proposal.submittedTitle
                  : wallet.state === "receipt_failed"
                    ? daoProposeCopy.proposal.identityUnavailableTitle
                    : wallet.state === "indexed"
                      ? daoProposeCopy.proposal.indexedTitle
                      : wallet.state === "index_failed"
                        ? daoProposeCopy.proposal.indexingDelayedTitle
                        : daoProposeCopy.proposal.identityConfirmed}
              </h3>
              <ReviewFact label={daoProposeCopy.proposal.transaction} mono>
                {transactionHash}
              </ReviewFact>
              {proposalIdentity ? (
                <ReviewFact label={daoProposeCopy.proposal.proposalIdentity} mono>
                  {serializeDaoProposalRef(proposalIdentity.ref)}
                </ReviewFact>
              ) : null}
              {wallet.state === "receipt_failed" ? (
                <StateNotice
                  tone="error"
                  title={wallet.code}
                  body={wallet.message}
                />
              ) : null}
              <div
                className="rounded-box bg-surface p-4 text-text-primary shadow-sm"
              >
                <p className="font-bold">
                  {wallet.state === "receipt_pending"
                    ? daoProposeCopy.proposal.receiptPending
                    : wallet.state === "receipt_failed"
                      ? daoProposeCopy.proposal.identityUnavailableTitle
                      : wallet.state === "indexed"
                        ? daoProposeCopy.review.indexedStatus
                        : wallet.state === "index_failed"
                          ? daoProposeCopy.proposal.indexingDelayedTitle
                          : wallet.state === "awaiting_index"
                            ? daoProposeCopy.review.indexStatus
                            : daoProposeCopy.proposal.identityConfirmed}
                </p>
                <p className="mt-1 max-w-3xl text-pretty text-sm leading-6 text-text-secondary">
                  {wallet.state === "indexed"
                    ? daoProposeCopy.proposal.indexedBody
                    : wallet.state === "index_failed"
                      ? (wallet.message ??
                        daoProposeCopy.proposal.indexingDelayedBody)
                      : daoProposeCopy.proposal.submittedBody}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {wallet.state === "index_failed" || wallet.state === "receipt_failed" ? (
                  <Button
                    type="button"
                    className="w-full motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto"
                    onClick={() => {
                      void onRetryIndexing();
                    }}
                  >
                    {wallet.state === "receipt_failed" ? daoProposeCopy.proposal.retryReceipt : daoProposeCopy.proposal.retryIndexing}
                  </Button>
                ) : null}
                {proposalHref ? (
                  <>
                    <Link
                      href={proposalHref}
                      className={getButtonClassName({
                        className:
                          "w-full gap-2 motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto",
                      })}
                    >
                      {daoProposeCopy.proposal.open}
                    </Link>
                    <button
                      type="button"
                      className={getButtonClassName({
                        variant: "secondary",
                        className:
                          "w-full gap-2 motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto",
                      })}
                      onClick={() => {
                        const absoluteHref = resolveAbsoluteHref(proposalHref);
                        void copyTextToClipboard(absoluteHref).then(
                          (didCopy) => {
                            setProposalLinkCopied(didCopy);
                          }
                        );
                      }}
                    >
                      <IconCopy className="size-4" aria-hidden />
                      {proposalLinkCopied
                        ? daoProposeCopy.proposal.copied
                        : daoProposeCopy.proposal.copy}
                    </button>
                  </>
                ) : null}
                <a
                  href={getEtherscanTransactionUrl(transactionHash) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={getButtonClassName({
                    variant: proposalHref ? "ghost" : "secondary",
                    className:
                      "w-full gap-2 motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto",
                  })}
                >
                  {daoProposeCopy.proposal.viewTransaction}
                  <IconLinkOut className="size-4" aria-hidden />
                </a>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function getWalletTransactionHash(wallet: WalletState): Hex | null {
  return "transactionHash" in wallet ? wallet.transactionHash : null;
}

function getWalletProposalIdentity(
  wallet: WalletState
): DaoDecodedProposeIdentity | null {
  return "identity" in wallet ? wallet.identity : null;
}

function resolveAbsoluteHref(href: string): string {
  if (typeof window === "undefined") return href;
  return new URL(href, window.location.origin).toString();
}

export function DaoProposalEligibility({
  proposer,
}: {
  proposer: DaoProposerState;
}) {
  const fullEpoch = findFirstFullDaoCapacityEpoch(proposer.affectedBoostEpochs);
  const firstAffectedEpoch = proposer.affectedBoostEpochs[0];
  const lastAffectedEpoch = proposer.affectedBoostEpochs.at(-1);
  const firstEpochLabel =
    firstAffectedEpoch?.epoch.toString() ??
    proposer.expectedVotingEpoch.toString();
  const lastEpochLabel = lastAffectedEpoch?.epoch.toString() ?? firstEpochLabel;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={proposer.canPropose ? "success" : "warning"}
          className={
            proposer.canPropose
              ? "dark:bg-green-950 dark:text-green-200"
              : "dark:bg-amber-950 dark:text-amber-200"
          }
        >
          {proposer.canPropose
            ? daoProposeCopy.landing.eligibleLabel
            : daoProposeCopy.landing.unavailableLabel}
        </Badge>
        <p className="text-pretty text-sm font-bold">
          {proposer.canPropose
            ? daoProposeCopy.landing.eligibleFacts
            : proposer.proposeBlockedReason ??
              daoProposeCopy.landing.blockedFallback}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <EligibilityFact
          label={daoProposeCopy.eligibility.connected}
          value={
            proposer.connected
              ? daoProposeCopy.eligibility.connectedValue
              : daoProposeCopy.eligibility.disconnectedValue
          }
        />
        <EligibilityFact
          label={daoProposeCopy.eligibility.network}
          value={
            proposer.correctChain
              ? daoProposeCopy.eligibility.correctNetwork
              : daoProposeCopy.eligibility.wrongNetwork
          }
        />
        <EligibilityFact
          label={daoProposeCopy.eligibility.blacklist}
          value={
            proposer.blacklisted
              ? daoProposeCopy.eligibility.blocked
              : daoProposeCopy.eligibility.clear
          }
        />
        <EligibilityFact
          label={daoProposeCopy.eligibility.currentWeight}
          value={formatTokenAmount(proposer.currentWeight, 18, 2)}
          mono
        />
        <EligibilityFact
          label={daoProposeCopy.eligibility.minimumWeight}
          value={formatTokenAmount(proposer.minimumWeight, 18, 2)}
          mono
        />
        <div className="rounded-box bg-surface-secondary p-3">
          <dt className="text-xs font-bold uppercase tracking-wide text-text-secondary">
            {proposer.nextEligibleAt === 0
              ? daoProposeCopy.eligibility.cooldown
              : daoProposeCopy.eligibility.nextEligible}
          </dt>
          <dd className="mt-1 font-number text-sm tabular-nums">
            {proposer.nextEligibleAt === 0 ? (
              daoProposeCopy.eligibility.cooldownReady
            ) : (
              <UtcTime timestamp={proposer.nextEligibleAt} />
            )}
          </dd>
        </div>
        <EligibilityFact
          label={daoProposeCopy.eligibility.votingEpoch}
          value={proposer.expectedVotingEpoch.toString()}
          mono
        />
        <EligibilityFact
          label={daoProposeCopy.eligibility.affectedEpochs}
          value={daoProposeCopy.eligibility.epochRange(
            firstEpochLabel,
            lastEpochLabel
          )}
          mono
        />
      </dl>

      {fullEpoch ? (
        <div
          role="alert"
          className="rounded-box border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="text-pretty font-bold">
            {daoProposeCopy.eligibility.capacityFullTitle(
              fullEpoch.epoch.toString()
            )}
          </p>
          <p className="mt-1 font-number font-bold tabular-nums">
            {daoProposeCopy.eligibility.capacityCount(
              fullEpoch.currentProposalCount,
              fullEpoch.proposalLimit
            )}
          </p>
          <p className="mt-1 text-pretty">
            {daoProposeCopy.eligibility.capacityFullBody(
              firstEpochLabel,
              lastEpochLabel
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AuthoringSection({
  children,
  description,
  number,
  title,
}: {
  children: ReactNode;
  description: string;
  number: string;
  title: string;
}) {
  const headingId = `dao-authoring-section-${number}`;
  return (
    <section aria-labelledby={headingId} className="space-y-5 border-t border-border pt-8 first:border-0 first:pt-0">
      <div className="grid gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-yearn-blue font-number text-sm font-bold tabular-nums text-white dark:bg-blue-950 dark:text-blue-200"
        >
          {number}
        </span>
        <div className="space-y-1">
          <h3 id={headingId} className="text-balance text-xl font-bold">
            {title}
          </h3>
          <p className="max-w-3xl text-pretty text-sm leading-6 text-text-secondary">
            {description}
          </p>
        </div>
      </div>
      <div className="space-y-5 sm:pl-[3.25rem]">{children}</div>
    </section>
  );
}

function AuthoringLiveRegion({ message }: { message: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </p>
  );
}

function ForumStatus({
  error,
  state,
}: {
  error?: string;
  state: ForumState;
}) {
  if (state.state === "validating") {
    return (
      <p id="dao-forum-status" className="text-sm text-text-secondary">
        {daoProposeCopy.discussion.validating}
      </p>
    );
  }
  if (state.state === "invalid" || error) {
    return (
      <div
        id="dao-forum-status"
        role="alert"
        className="text-sm text-red-800 dark:text-red-300"
      >
        {state.state === "invalid" ? (
          <p>
            <span className="font-number font-bold">{state.code}</span> · {state.message}
          </p>
        ) : (
          <p>{error}</p>
        )}
      </div>
    );
  }
  if (state.state !== "valid") return <span id="dao-forum-status" />;
  return (
    <div id="dao-forum-status" className="space-y-3 rounded-box bg-green-50 p-4 text-sm text-green-950">
      <p className="font-bold">{daoProposeCopy.discussion.accepted}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <ForumFact label={daoProposeCopy.discussion.topicTitle}>
          {state.topic.title}
        </ForumFact>
        <ForumFact label={daoProposeCopy.discussion.normalizedUrl} mono>
          {state.topic.normalizedUrl}
        </ForumFact>
        <ForumFact label={daoProposeCopy.discussion.category}>
          {state.topic.category} · ID {state.topic.categoryId}
        </ForumFact>
        <ForumFact label={daoProposeCopy.discussion.author}>
          {state.topic.author}
        </ForumFact>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-green-800">
            {daoProposeCopy.discussion.created}
          </dt>
          <dd className="mt-1 font-number tabular-nums">
            <UtcTime timestamp={state.topic.createdAt} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ForumFact({
  children,
  label,
  mono = false,
}: {
  children: ReactNode;
  label: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-green-800">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-words",
          mono && "break-all font-number tabular-nums"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function ProposalTypeChoice({
  checked,
  description,
  label,
  onChange,
  value,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (value: DaoProposalType) => void;
  value: DaoProposalType;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-24 cursor-pointer items-start gap-3 rounded-box border bg-surface p-4 shadow-sm transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] focus-within:ring-2 focus-within:ring-text-primary focus-within:ring-offset-2 focus-within:ring-offset-app motion-reduce:transition-none motion-reduce:active:scale-100",
        checked ? "border-yearn-blue bg-yearn-blue/5" : "border-border"
      )}
    >
      <input
        type="radio"
        name="dao-proposal-type"
        value={value}
        checked={checked}
        className="mt-1 size-5 shrink-0 accent-yearn-blue"
        onChange={() => onChange(value)}
      />
      <span className="space-y-1">
        <span className="block font-bold">{label}</span>
        <span className="block text-pretty text-sm leading-6 text-text-secondary">
          {description}
        </span>
      </span>
    </label>
  );
}

function SignalScriptSummary({ scriptCheck }: { scriptCheck: DaoScriptCheck }) {
  return (
    <div className="space-y-3 rounded-box bg-surface-secondary p-4">
      <p className="font-bold">{daoProposeCopy.script.emptyTitle}</p>
      <ReviewFact label={daoProposeCopy.review.exactScript} mono>
        {scriptCheck.script}
      </ReviewFact>
      <ReviewFact label={daoProposeCopy.script.scriptHash} mono>
        {scriptCheck.scriptHash ?? "--"}
      </ReviewFact>
    </div>
  );
}

function ScriptStatus({ scriptCheck }: { scriptCheck: DaoScriptCheck }) {
  if (scriptCheck.state === "invalid") {
    return (
      <div
        id="dao-script-status"
        role="alert"
        className="space-y-2 rounded-box border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
      >
        <p className="font-bold">{scriptCheck.error?.message}</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <ReviewFact label={daoProposeCopy.script.errorCode} mono>
            {scriptCheck.error?.code ?? "--"}
          </ReviewFact>
          <ReviewFact label={daoProposeCopy.script.byteOffset} mono>
            {scriptCheck.error?.offset?.toString() ?? "--"}
          </ReviewFact>
          {scriptCheck.scriptBytes !== null ? (
            <ReviewFact label={daoProposeCopy.script.scriptBytes} mono>
              {scriptCheck.scriptBytes.toString()}
            </ReviewFact>
          ) : null}
          {scriptCheck.scriptHash ? (
            <ReviewFact label={daoProposeCopy.script.scriptHash} mono>
              {scriptCheck.scriptHash}
            </ReviewFact>
          ) : null}
        </dl>
      </div>
    );
  }
  return (
    <div id="dao-script-status" className="space-y-4 rounded-box bg-green-50 p-4 text-green-950">
      <p className="font-bold">{daoProposeCopy.script.valid}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label={daoProposeCopy.script.callCount} value={scriptCheck.frames.length.toString()} />
        <Metric label={daoProposeCopy.script.scriptBytes} value={(scriptCheck.scriptBytes ?? 0).toString()} />
      </div>
      <ReviewFact label={daoProposeCopy.script.scriptHash} mono>
        {scriptCheck.scriptHash ?? "--"}
      </ReviewFact>
      <ScriptFrames scriptCheck={scriptCheck} />
    </div>
  );
}

function ScriptFrames({ scriptCheck }: { scriptCheck: DaoScriptCheck }) {
  if (scriptCheck.frames.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">{daoProposeCopy.script.calls}</p>
      <ol className="space-y-2">
        {scriptCheck.frames.map((frame) => (
          <li key={`${frame.index}:${frame.offset}`} className="min-w-0 rounded-box bg-surface p-3 text-sm shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">{daoProposeCopy.script.call(frame.index)}</span>
              <span className="font-number text-xs tabular-nums text-text-secondary">
                byte {frame.offset} · {frame.calldataBytes} calldata bytes
              </span>
            </div>
            <code className="mt-2 block break-all font-number text-xs leading-5">
              {frame.target}
            </code>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReviewSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section
      aria-label={title}
      className="space-y-4 border-t border-border pt-6 first:border-0 first:pt-0"
    >
      <h3 className="text-balance text-lg font-bold">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ReviewFact({
  children,
  label,
  mono = false,
  preserveWhitespace = false,
}: {
  children: ReactNode;
  label: string;
  mono?: boolean;
  preserveWhitespace?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <div
        className={cn(
          "mt-1 break-words text-sm leading-6",
          mono && "break-all font-number tabular-nums",
          preserveWhitespace && "whitespace-pre-wrap"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function CodeValue({ children }: { children: string }) {
  return (
    <code className="block max-w-full break-all rounded-box bg-neutral-900 p-3 font-number text-xs leading-5 text-neutral-0">
      {children}
    </code>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box bg-surface-secondary p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 font-number text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function EligibilityFact({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-box bg-surface-secondary p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className={cn("mt-1 text-sm", mono && "font-number tabular-nums")}>
        {value}
      </dd>
    </div>
  );
}

function SubmissionStep({
  description,
  label,
  number,
  status,
}: {
  description: string;
  label: string;
  number: string;
  status: "complete" | "current" | "upcoming";
}) {
  const statusLabel =
    status === "complete"
      ? daoProposeCopy.review.complete
      : status === "current"
        ? daoProposeCopy.review.current
        : daoProposeCopy.review.upcoming;
  return (
    <li
      className={cn(
        "flex min-h-24 items-start gap-3 rounded-box border p-4",
        status === "complete" &&
          "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/35",
        status === "current" &&
          "border-yearn-blue/50 bg-yearn-blue/5 dark:border-blue-700 dark:bg-blue-950/30",
        status === "upcoming" && "border-border bg-surface-secondary"
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full font-number text-xs font-bold tabular-nums",
          status === "complete"
            ? "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"
            : status === "current"
              ? "bg-yearn-blue text-white dark:bg-blue-800"
              : "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
        )}
      >
        {number}
      </span>
      <span className="min-w-0 space-y-1">
        <span className="block text-xs font-bold uppercase tracking-wide text-text-secondary">
          {statusLabel}
        </span>
        <span className="block font-bold">{label}</span>
        <span className="block text-pretty text-xs leading-5 text-text-secondary">
          {description}
        </span>
      </span>
    </li>
  );
}

function StateNotice({
  body,
  title,
  tone,
}: {
  body: string;
  title: string;
  tone: "success" | "warning" | "error";
}) {
  const styles = {
    success: "border-green-300 bg-green-50 text-green-950",
    warning:
      "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
    error:
      "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-box border p-4 text-sm", styles[tone])}>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-pretty leading-6">{body}</p>
    </div>
  );
}
