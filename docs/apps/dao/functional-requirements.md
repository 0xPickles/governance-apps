# DAO Governance Functional Requirements

## 1. Goal

DAO Governance lets users find Yearn proposals, review their immutable content
and onchain actions, vote, create proposals, and perform permitted lifecycle
actions without hiding the contract's timing or trust boundaries.

The first accepted product is deterministic and mock-backed. Backend feeds,
onchain clients, fork proof, and production rollout follow in separate
milestones.

## 2. Roles

- Observer: browses proposals without a wallet.
- Voter: reviews current weight and submits one Yea or Nay vote.
- Proposer: meets the live weight, cooldown, and blacklist rules and creates a
  signal or executable proposal.
- Proposal author: retracts their own no-vote proposal when the contract permits.
- Execution caller: submits an approved script when execution is permissionless
  or the account is the guarded operator.
- Operator: flags a malformed no-vote proposal and may execute when guard mode
  requires it.
- Guardian: vetoes a proposal before execution.

A wallet can have more than one role. The UI derives permissions from live facts;
it does not grant authority based on labels from the feed.

## 3. Launch scope

### Included

- proposal directory and filtering;
- proposal detail, immutable content, forum discussion, vote totals, timeline,
  threshold, and technical metadata;
- wallet voting weight and effective late-vote weight;
- one Yea or Nay vote through the configured Voter;
- post-veto participation voting when the contract still accepts it;
- signal and executable proposal creation;
- full Executor-script hex input with structural browser checks;
- proposer retraction;
- execution review and execution when eligible;
- flag and veto reason display;
- role-gated flag and veto controls in mock and fork coverage;
- IPFS, decode, analysis, simulation, and feed failure states;
- shared debug controls and deterministic time travel;
- path-first and feature-gated rollout.

### Not included in the first production scope

- comments or discussion hosted in the app;
- automatic creation of a forum topic;
- a generic ABI transaction builder;
- an importable execution-bundle format;
- arbitrary proposer-supplied ABIs treated as verified;
- changing a submitted vote through the public Voter;
- historical Snapshot proposal ingestion;
- vote-boost claiming, which belongs to the existing reward flow;
- automatic execution;
- automatic network switching.

## 4. Proposal discovery

### DAO-FR-001: public list

`/dao` renders proposal history without requiring a wallet. Each list item shows:

- title and numeric ID;
- signal or executable type;
- display status;
- proposal author;
- vote timing or terminal time;
- Yea/Nay percentages of votes cast;
- a quiet indication when a proposal has executable actions;
- verified discussion availability or its absence.

Each item has one stretched native proposal link so the full row is the primary
target. Nested address explorer and copy controls remain independent. Proposal
links carry the selected source group for contextual detail navigation.

### DAO-FR-002: filters

The list orders `Upcoming`, `Active`, and `Closed`. A valid `?group=` selection
wins even when empty. Otherwise it defaults to populated `Active`, then
`Upcoming`, then `Closed`, and finally `Active` when all are empty. Filtering
uses domain-provided display groups, not duplicate status math in the component.
Selection replaces URL state without growing history. Reload and browser Back
preserve the board group. Detail breadcrumbs use
`Proposals / <Group> / <proposal title>` and reject invalid origin values.

### DAO-FR-003: stable identity

Internal identity always includes chain ID and Voting contract address. Routes
may use the numeric ID while one active contract is unambiguous, but clients,
queries, feeds, and analytics must not.

### DAO-FR-004: unavailable content

Missing or invalid IPFS content does not hide the onchain proposal. The list and
detail page render the available onchain record and identify the content failure.

## 5. Proposal detail

### DAO-FR-010: proposal record

The detail page separates:

- immutable proposal content;
- live or indexed onchain state;
- connected-wallet state;
- backend decoding and simulation analysis;
- unverified proposer descriptions.

### DAO-FR-011: lifecycle

The page presents raw lifecycle status, community vote result, moderation, and
execution as separate facts. It must represent retracted, flagged, vetoed,
rejected, expired, and executed outcomes without forcing them into a single
happy-path timeline. Flagged proposals have no community result. Early and
post-participation vetoes state their different voting effects.

### DAO-FR-012: threshold and no quorum

Vote percentages use `of votes cast`. Proposal rules say `No minimum turnout is
required`. The detail page shows the proposal's snapshotted approval threshold,
not the current global threshold. Rules also show the supplied proposal type,
voting period, execution delay and guard where applicable, Voting contract,
verified source, and the block where mutable configuration was observed. The
normal fixture uses 5,000 basis points and an alternate fixture retains 6,000.
That proposal-rule configuration remains the historical disclosure effective at
Propose. Feed admission checks each Vote against its event-effective live
window, while raw snapshot status and timing use the configuration effective at
the end of the canonical block.

### DAO-FR-013: signal display

A passed empty-script proposal displays:

- type `Signal`;
- status `Approved`;
- `No executable actions`.

The technical disclosure may show the raw contract status.

### DAO-FR-014: analysis provenance

Decoded actions use a structured, exact GitHub source record with kind,
repository, label, canonical blob URL, 40-hex revision, and normalized source
path. Other hosts, credentials, query, fragment, controls, and noncanonical
paths are invalid. A source can prove the pinned decoder input but cannot prove
a mock deployment. Unknown calls remain visible as target, selector, calldata,
and size. A proposal-time simulation shows its reference block and never claims
to guarantee execution.

### DAO-FR-015: event provenance

Each retained event exposes the producer-owned canonical block time, actor and
role, block number and hash, transaction hash when available, transaction
index, and log index. User-facing time never substitutes the browser clock.
Missing time or transaction data has an explicit fallback; Technical details
still retains every available raw identity field.

### DAO-FR-016: execution integrity readiness

The client derives proposal type from the stored script hash: Signal iff it is
`keccak256(0x)`, otherwise Executable, even when event bytes are unavailable.
Signal proposals are not applicable to execution readiness. Executable
proposals are integrity-ready when the exact retained event bytes hash to the
stored value. Missing bytes and a hash mismatch are the only hard integrity
blockers; content `proposalType` never overrides the stored hash.

Board and detail show `Execution blocked` before status and type, followed by a
static reason. They do not infer this badge from lifecycle, moderation, guard,
schedule, account, or simulation state. Detail retains the lower live integrity
explanation, and the board omits `Executable actions` only for a hard blocker.

## 6. Voting

### DAO-FR-020: eligibility

The client supplies `canVote` and a reason when false. The UI does not infer
eligibility from display status alone.

### DAO-FR-021: weight

Before confirmation, show the estimated effective weight for the current time.
When late-vote decay applies, show the original weight, effective weight, and a
short explanation. Dynamic weight and countdown values use tabular numerals.

### DAO-FR-022: direction

The user explicitly chooses Yea or Nay. The app never defaults a vote direction
and never replaces the two choices with a directionless participation button.

### DAO-FR-023: one vote

After a successful public-Voter submission, the account cannot vote again on the
proposal. Feed lag may show a pending indexed state, but the live voted read is
authoritative for blocking a duplicate submission.

### DAO-FR-024: post-veto participation

If the proposal was vetoed after votes existed and the voting window remains
open, the page keeps Yea and Nay available and says:

> This proposal has been vetoed and cannot be approved or executed. You may
> still vote to record your participation.

If it was vetoed before the first vote, voting is unavailable.

### DAO-FR-025: content failure

Voting remains available when the protocol permits it even if content or
analysis is unavailable. The app requires an explicit confirmation that the
full proposal could not be reviewed.

## 7. Proposal creation

### DAO-FR-029: author eligibility

The client supplies `canPropose`, one primary blocked reason, current and minimum
weight, blacklist state, last proposal time, next eligible time, expected voting
epoch, and the current proposal count for each of the six affected reward
epochs. Proposal capacity is shared across all authors and is full if any
affected epoch already contains 64 proposals.

Normal UI shows the expected voting epoch and one `Affected reward epochs
N–N+5` range, not six capacity rows or a success notice. The six epoch counts
remain available to domain logic and debug tooling. Only a capacity block names
the exact full epoch, shows `64 / 64`, repeats the range, and states that the
limit is system-wide rather than a per-user quota.

Wallet and network failures take priority, followed by blacklist, weight,
cooldown, and shared capacity. The review may show every relevant fact even when
one primary reason controls the action.

### DAO-FR-030: forum discussion

The app requires a public `gov.yearn.fi` topic in the configured forum
`Proposals` category. A same-origin server endpoint validates and normalizes the
topic. Eligibility uses stable category IDs, not display labels. Descendants are
accepted only when their IDs are explicitly configured. Version 1 fixes the
authoritative root to `5 / Proposals / proposals` and permits descendants `9`,
`18`, `17`, `21`, `10`, and `29` only with exact root ancestry and metadata.
Minimum topic age and poll rules remain informational until an updated DAO policy
defines them.

Direct-contract proposals that bypass this rule still appear in history with
`No verified forum discussion`.

### DAO-FR-031: immutable content

The author supplies one Markdown document, discussion URL, and declared proposal
type. The first and only H1 is the title, the next paragraph is the summary,
and body content follows. Title, summary, AST, and attachment resolutions are
derived results and are never copied into the wire object. The editor preserves
the exact Markdown source, including whitespace, line endings, and its trailing
newline. There is one in-place `yearn.dao.proposal.v1` contract and no legacy or
compatibility parser.

Only CommonMark plus GFM tables are enabled. Raw HTML, unsupported nodes,
unsafe links, unpaired surrogates, NUL/control characters, and invalid or
ambiguous attachments fail closed with located errors. Markdown is limited to
32,768 UTF-8 bytes, 4,096 nodes, depth 32, and 1,024 table cells. Title and
summary limits count graphemes with `Intl.Segmenter`. Source bytes are bounded
before parsing; iterative validation checks every heading and work bound. A
work-limit failure exposes an empty safe AST. The only accepted image context is
one sole image in a top-level body paragraph after the summary.

The canonical content JSON uses the fixed field order and one final LF. Its
SHA-256 digest is the onchain `bytes32`; its CID is CIDv1/raw/SHA-256/Base32.
The linked forum may continue changing.

An image token renders an informative attachment card, never an image-producing
element. A relative `./assets/...` target matches one exact authenticated
manifest entry; a direct `ipfs://` target contains one exact canonical raw CID
and matches one unique digest. Both derive the same suffix-free trusted gateway
URL and make no request until Open is activated. Images nested in headings,
links, emphasis, lists, quotes, tables, or mixed inline content are rejected.
SVG is never rendered inline.

### DAO-FR-032: signal

Choosing `Signal` submits an empty execution script. The review step states that
the proposal contains no executable actions.

### DAO-FR-033: executable script input

Choosing `Executable` reveals one multiline input for the full hex-encoded
Executor script. The app does not require a secondary bundle format.

### DAO-FR-034: browser script checks

Before submission, the browser validates hex syntax, framing, declared lengths,
call count, total bytes, and script hash. It shows call targets and calldata
sizes. A successful result says `Script structure is valid`; it never says
`Safe` or `Verified`.

### DAO-FR-035: final review

The final confirmation uses the same validated AST renderer as Preview and
detail. It shows:

- normalized forum topic;
- exact immutable proposal content;
- proposal type;
- exact script and hash;
- call count and byte count;
- current proposer weight and cooldown eligibility;
- expected voting epoch;
- publication and transaction steps.

The review states that two separate actions are required. Step 2 stays visibly
upcoming and unavailable until immutable content is published, and publication
copy says it neither creates a proposal nor opens a wallet. After publication,
Step 1 retains its fingerprint receipt and focus moves to a distinct current
Step 2 surface. When the transaction hash is known, View transaction appears
before any proposal action. A successful receipt must bind the exact expected
Voting address, transaction hash, proposer, voting epoch, content digest, and
script to exactly one matching `Propose` log. That log must have four canonical
topics, and its decoded topics and non-indexed data must re-encode byte for byte
with no trailing or dirty padding. Open proposal and Copy link appear only after
that receipt supplies the composite identity. Receipt confirmation,
awaiting-index, and indexed states retain the same identity. Publication failure
never exposes Step 2. The typed review outcome controls proposal creation.
Wallet rejection, onchain revert, and network failure preserve the published
content and retry without republishing. They produce no hash, receipt, proposal
identity, created record, pending action, feed event, proposal link, or index
state. Registration applies its delay before persistence. An indexing delay
shows `Retry indexing`, which re-registers and indexes the same receipt-derived
reference without duplicate records or events.

### DAO-FR-036: backend analysis

After the proposal event is indexed, the detail page may show `Analysis pending`,
then the stored decode and proposal-time simulation. A proposal submission does
not wait for semantic backend analysis unless a later product decision adds a
preflight endpoint keyed by script hash.

### DAO-FR-037: proposal-time simulation semantics

The backend runs the complete ordered script atomically in an explicitly
conditional proposal-time Executor-frame scenario. It does not treat a
time-gated `Voting.execute` call at the proposal block or a bare top-level
Executor call with caller set to Voting as useful evidence: the latter changes
`tx.origin`. A completed record must prove the authenticated hypothetical
origin, an engine-injected nested frame with real Executor code and
`CALLER = Voting`, target `CALLER = Executor`, the operator check, no code
overrides, exact initial frame gas/effective gas price/envelope/access/warm-set
inputs with their commitment, the exact block/time/script, and the typed Voting
`executed` false-to-true transition. Its success or revert applies only to that
recorded scenario, not an unknown future execution transaction.

Unknown call decoding does not force simulation failure. If an
origin and frame-equivalent context cannot be established, analysis is
`Unavailable` rather than successful.

## 8. Lifecycle actions

### DAO-FR-040: retract

Show retraction only to the proposer when the client reports it is permitted.
Explain that a proposal with votes cannot be retracted and that retraction does
not reset the proposal cooldown.

### DAO-FR-041: flag

The operator may flag only when the client reports it is permitted. The form
requires a reason within the contract limit. Flagging is presented as invalid or
spam moderation, not an ordinary vote outcome.

### DAO-FR-042: veto

The guardian may veto only when the client reports it is permitted. The form
requires a reason. The confirmation explains whether the proposal has votes and
whether participation voting will remain open.

### DAO-FR-043: execute

An executable proposal enables execution only when:

- the execution epoch and delay permit it;
- the proposal passed and is not vetoed, retracted, or executed;
- the account satisfies guard mode;
- the exact event script is available;
- its hash matches the stored script hash;
- a fresh current-state simulation succeeds.

The transaction uses the shared `useTx` pipeline. One call failure reverts the
whole script.

## 9. Content and execution failure policy

| Condition | Voting | Execution |
| --- | --- | --- |
| Content and script verified | Normal | Normal when eligible |
| IPFS unavailable | Allowed with warning | Allowed only with exact hash-valid event script |
| Content schema or digest invalid | Allowed with strong warning | Same exact-script rule |
| Event script unavailable | Allowed | Unavailable because the transaction cannot be built |
| Script hash mismatch | Allowed with warning | Blocked |
| Post-vote veto | Participation vote while open | Blocked |
| Pre-vote veto | Blocked by contract | Blocked |

The UI never submits a mismatched script. It does not turn a gateway outage into
a voting veto.

## 10. Data and trust boundaries

- `gov-apps-stats` owns historical logs, IPFS retrieval, script retention,
  decoding, proposal-time simulation, and the global feed.
- The frontend owns schema validation, presentation, live wallet overlays,
  capability derivation from current reads, transaction preparation, and a fresh
  execution simulation.
- The UI does not own protocol math.
- Feed-provided action labels are hints, not wallet authorization.
- Backend decoding uses a maintained address/source registry. Structured source
  provenance can establish the pinned decoder input; proposer metadata and mock
  fixtures cannot establish a deployed contract identity.

## 11. Runtime and rollout

- Mock mode uses deterministic state, shared time controls, reset, and typed test
  bridge methods.
- Production mode instantiates DAO mock state only for the temporary,
  route-local M2 review exception when `NEXT_PUBLIC_ENABLE_DAO=true`. This does
  not enable global mocks, E2E, or debug UI.
- `/dao` ships on shared hosts before subdomain exposure.
- The preproduction workflow reads `NEXT_PUBLIC_ENABLE_DAO` from its protected
  environment and defaults it false. The production workflow hardcodes it
  false. `dao-beta.dao-ops.com` is noncanonical and `noindex`. It and the other
  five governance beta hosts require exact-host Cloudflare Access entries with
  the approved GitHub organization/team policy on every path. The reserved
  `dao.yearn.fi` hostname exists only in the internal routing registry and
  remains absent from production Wrangler custom domains and discoverability.
- Snapshot-era stYFI links remain unchanged until the production cutover package.

## 12. Quality requirements

- All controls are keyboard accessible and have at least a 40 by 40 pixel hit
  area, with 44 pixels used where practical.
- Status is never communicated by color alone.
- Headings balance cleanly; body copy avoids orphaned words where supported.
- Timers and changing weights use tabular numerals.
- Mobile layouts preserve readable scripts, addresses, and vote controls without
  horizontal page overflow.
- Long Markdown headings and links wrap; tables, fenced code, and exact source
  scroll inside their own labelled regions at 390, 768, and 1,280 pixels and at
  200% root text.
- Attachment cards contain no image-producing element, preload, metadata probe,
  or automatic request. Only user-activated Open navigates to the validated raw
  CID URL.
- Write/Preview tabs use native tab semantics and keyboard navigation. A located
  validation error returns to Write, focuses the textarea, and selects the
  deterministic UTF-16 caret offset.
- Authoring uses one polite atomic live region for asynchronous progress.
- The resolved application label is a native host-aware home link: `/` on its
  branded beta host and the exact app path on shared hosts. It keeps visible
  focus and a 40-pixel desktop or 44-pixel mobile target.
- No component calls raw wagmi writes.
- Tests cover every capability/status mismatch, especially vetoed-but-votable.
