# Implement DAO publication through Pinata

Implement this package to completion on `codex/dao/m5/pinata` in the prepared worktree `governance-apps.dao.m5.pinata`.
The application base is `fc81ae0502efe45ed84367062a57df16c6dab46c` from `agent/dao/m5/live`.
Documentation-only setup commits may follow that base. Record the actual implementation-start commit before editing application code.
The user has authorized implementation. Do not stop to seek approval for ordinary local design, code, tests or documentation changes.

## Read first and resolve old instructions

Read repository `AGENTS.md`, [the decision](../experiments/pinata-free/decision.md), [the live review](../experiments/pinata-free/live-review-2026-09-16.md),
the sanitized evidence, [the milestone plan](milestone-plan.md), [live services](../live-services.md) and [the M5 review tracker](evidence/m5-live-review/README.md).
Then inspect the publication route, server modules, authoring hook and current local-fork harness.

The latest user decision supersedes older requirements to complete the entire provider matrix or approve every document before publication.
The missing tests do not block implementation. Small credential checks belong in final staging acceptance.
The current grant policy is an implemented baseline to replace, not a product requirement to retain.
Keep the accepted UI, canonical-content rules, V2 feed, proposal-content V1 and governance transaction safeguards.
Historical evidence stays historical. Update active documentation to describe the resulting code and remaining release checks accurately.

## Intended author experience

An author drafts in the existing editor, uses the standard template and preview, validates the forum link and publishes through the app.
The app stores exact content through Pinata and verifies it before offering the separate onchain proposal transaction.
The author needs no Pinata account, API key, external upload step or per-document operator approval.
Preserve unpublished drafts and successful publication across wallet rejection, transaction failure, reload and feed lag.
Keep real proposer eligibility and transaction checks. Public content upload is not authorization to create or execute a governance proposal.

## Implement one production publication path

1. Use Pinata legacy `POST https://api.pinata.cloud/pinning/pinFileToIPFS` with a private key scoped only to `pinFileToIPFS`.
   Send the existing canonical bytes as a file, with `cidVersion: 1` and no directory wrapping.
   Use fixed server configuration. Never accept caller-selected provider URLs or forward a provider credential to a public gateway.
2. Enforce the existing 131,072-byte limit, strict canonical validation, expected digest and expected raw CID before upload.
   Reject invalid or oversized bodies before forum/provider calls where applicable. Retain bounded reads, deadlines and redirect rejection.
3. Validate the provider response and retrieve the returned content through the configured public gateway without credentials.
   Require expected CID and byte-for-byte equality before reporting success. Bound propagation retries and sanitize provider errors.
4. Replace the exact-content operator grant policy with public, bounded admission.
   Remove the publication-only challenge/signature workflow if it only exists to enforce grants.
   Do not add a wallet signature merely as a substitute for global abuse controls. Preserve signatures and simulation for governance transactions.
5. Keep `DAO_PUBLICATION_ENABLED` independent and false by default. Missing production configuration must fail closed.
   Disabled requests must return before provider access. Stopping uploads must not disable proposal reads or unrelated permitted actions.
6. Keep only the local provider seam necessary for deterministic tests and the disposable fork.
   Replace or adapt existing Kubo-specific production assumptions. Do not add a general provider registry or merge the spike runner.

Use relevant Cloudflare/Workers skills and current official documentation for any new hosting binding.
Keep credentials in the deployment secret facility. Do not put them in client bundles, public variables, logs, URLs or committed fixtures.
No runtime admin, delete, metadata-write or key-generation permission is needed by the publication credential.

## Bound public use with a small amount of state

First inspect available hosting primitives. Use one suitable durable store if existing controls cannot enforce the required semantics.
No process-local counter, eventual-consistency read/update or per-IP-only rule may be presented as a global bound across replicas.

The minimal record should support digest deduplication, admission reservation, publication status, byte accounting and recovery.
Reuse it to retain canonical bytes and the CID inventory if practical. Do not introduce separate infrastructure for each concern.

- Concurrent requests for the same digest must not create an uncontrolled set of provider uploads.
- Distinct digests must compete atomically for global and cumulative allowances.
- Count provider attempts separately from successful distinct documents. Bound retries after timeout and ambiguous provider outcomes.
- Use recoverable reservations. Crashes must neither permanently strand every slot nor repeatedly refund uncertain uploads into unlimited retries.
- Retry the same bytes and digest. Avoid reupload when publication and exact retrieval have already been verified.
- Include admitted unpublished/abandoned documents in storage accounting. Do not delete historical proposal pins automatically.
- Bound public retrieval and error retries too. Normal proposal reads should continue to use producer-embedded content.

Initial application defaults for implementation review: two new documents per hour, ten per day and forty per month globally.
Use cumulative ceilings of 300 distinct documents and 39,321,600 bytes, with at most two concurrent provider uploads.
Apply a separate finite provider-attempt allowance and explain its retry accounting; 500 attempts is a starting proposal, not a verified provider-use formula.
Make limits server-configurable and visible in the operator runbook. Explain any adjustment needed for legitimate revisions or multi-replica correctness.
These are app limits, not Pinata plan facts. Per-IP throttling can supplement them; do not build an identity or quota platform.
Do not add mandatory CAPTCHA, wallet allowlists, author approvals, token gates or paid services without a concrete need and user decision.

Be explicit that these controls bound public application use, not direct abuse of a stolen provider credential.

## Preserve integration and recovery

Reuse `app/api/dao-content/route.ts`, `lib/server/dao-content.ts`, `lib/server/dao-publication-policy.ts`,
`lib/hooks/useDaoAuthoring.ts` and their tests where useful. Remove obsolete production grant code, settings and documentation.
Keep route error states actionable: disabled, temporarily unavailable, budget reached, retryable verification, and already published.
Do not expose provider internals or operator approval steps in the author flow.

Keep receipt-confirmed identity, ID zero, identical-call replacement handling, cancellation handling and pending-index recovery.
Do not change contract ABIs, trusted deployment values, execution simulation rules, feed V2 or immutable proposal-content V1.
No producer source change is expected. If a real interoperability issue appears, isolate it and report it before expanding repository scope.
Do not reconcile master, merge into integration or rebuild unrelated application features in this package.

## Validation

Use focused tests for meaningful risks: exact bytes/CID, no-directory configuration, disabled routes with zero upstream calls,
malformed/oversized input, sanitized errors, retry/timeout handling, concurrent same/different digests, finite provider attempts,
restart recovery, exhausted budgets and production secret isolation.
Test durable admission through its real local storage/runtime implementation, not only a mock that mirrors the code.
Exercise the actual editor-to-publication flow and ensure a failed publication never enables an invalid create transaction.

Run the repository's required typecheck, lint and unit tests. Run smoke E2E and the complete full suite serially.
Run generated-feed integrity, production build, applicable Worker build/size and enabled/disabled production-route checks.
Use the package's Node/npm versions and lockfile. Add dependencies only when required and validate dependency policy.
Keep a failed attempt and successful rerun in the evidence; do not claim a whole suite passed from a partial rerun.

Perform local fork UAT through proposal creation, receipt, producer retrieval/indexing and the real application route.
Use the existing released producer unchanged and disposable local state. Confine transaction RPC to the fork.
No permanent fork or continuously operated test producer is required.

## Small final staging session

Prepare a short operator-run session for the implemented app, not another standalone research matrix.
Supply the exact private setup steps and small request/upload bounds only after the implementation is reviewable.
The agent must not request or inspect provider credentials, clipboard contents or private terminal state.
The operator privately provisions a fresh scoped key. Do not reuse the spike's revoked keys or copy its private configuration.

The session should establish:

1. Publication through the actual app preserves the expected CID and exact bytes.
2. The upload-only key cannot delete an existing disposable test document. Use an authorized deletion control so a generic failure is not mistaken for scope enforcement.
3. After a successful upload, revocation makes a subsequent upload fail. Existing content remains retrievable.
4. A replacement upload-only key restores publication without changing document bytes or identity.
5. The published content is consumed through the local-fork/producer/application path. Record separately which parts are live-provider, local-contract or fixture evidence.

Use hidden private input or existing secret tooling, with sanitized output only. Do not retain admin authority in the running application.
Do not depend on dashboard USED counters or explicit pin badges. Numeric counts remain unknown when unavailable.
Confirmation prompts must reject empty or invalid answers and explain any skipped check.
Include cleanup of disposable keys and pins. If prior experiment infrastructure is reused, its aggregate ledger must not be reset.
Do not run authenticated provider requests or create remote infrastructure in this implementation task without the user's explicit live-session authorization.
Missing credentials must not block code, local tests, build checks or the complete operator procedure.

Signed uploads, modern resource-permission comparisons, broad key-escalation matrices, account exhaustion and long-duration retention experiments are outside this package.
The small credential checks are release acceptance items, not prerequisites for writing the code.

## Documentation and completion

Update the DAO README, milestone plan, status, live-services guide, WP13 requirements, local UAT instructions and affected configuration examples.
Make current behavior and planned/release-gated behavior easy to distinguish. Retain old test evidence without turning old gates into current requirements.
Document key provisioning/replacement, disabling publication, limits, durable data backup/export, retrieval recovery and rollback.
Preserve the state needed to avoid reopening spent allowances after a rollback or redeployment.
Do not claim that a leaked key is harmless or that Free service guarantees ten-year retention.

Return a clean review branch with small Conventional Commits, exact base/final/range, implementation summary, actual checks and remaining operator inputs.
Record both the incremental publication range and the inherited M5 dependency for review.
The intended integration order is M5 live followed by this package, or a reviewed combined merge preserving that history.
Keep `agent/integration`, master, the spike and gov-apps-stats unchanged during implementation.
Do not push, merge, tag, deploy, expose the public host, post to the forum or submit production blockchain transactions.
Finish all local authorized work before asking for any final live-session or rollout input.
