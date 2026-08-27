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
the end of the canonical block. The initial configuration is a logical
`start_of_block` reducer boundary, ordered before transaction zero/log zero. It
authenticates end-of-parent-block state and replays every tracked setter from
contract creation through that parent while proving no lifecycle log was
skipped. Each later row binds a successful setter transaction, sender, exact
calldata, unfiltered trace path, canonical Set* log, and becomes effective at
its final real Set* log. Same-transaction lifecycle logs on opposite sides of a
setter use old and new rows; an intervening lifecycle log forces split rows.
Repeated setters for one field replay in canonical call/log order and the row
uses the final mutation. Adjacent Voting generations use an inclusive old
retirement block equal to the successor deployment block/hash; the successor
starts one block later. Old events/configurations stop at retirement, new
events start at successor start, and bootstrap lifecycle counts are scoped to
the exact Voting emitter so the shared cutover block cannot cross-contaminate
generations.
The retained `set_propose_parameters` minimum-weight and cooldown arguments are
bounded to uint256 before ABI re-encoding, and all safe consumer entry points
return typed rejection rather than exposing an encoder exception.
The feed also authenticates the stored proposal threshold at Propose from the
pinned Vyper slot-then-key mapping layout, exact 32-byte word, and archive or
committed-synthetic evidence. Both displayed threshold copies must equal that
decoded word.

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

The feed records Voter and Executor implementation evidence for every
historical configuration. Human and aggregate Vote labels require pinned Voter
source, reproducible bytecode, and one transaction-and-trace-path invocation.
Pinned code without a usable trace and custom Voter code preserve the raw Vote
as unclassified, with a provenance failure and lower-bound human participation.
A Voter constructor genesis is proved from that Voter build and may differ from
the Voting contract genesis, but cannot follow a Vote it could emit. The
`yearn.dao.voter-build-evidence.v2` commitment binds that constructor input to
the exact official compiler distribution, source-integrity preimage, build
commands/output, runtime template/immutable, deployed code, and artifact
hashes. Full geth
call-trace paths are unfiltered: root is `[]`, and direct-root pinned Voter
human/delegated/YBC calls use child paths `[1]`, `[4]`, and `[5]`. Complete
invocation identities are feed-wide, ordinals follow canonical log order, and
one pinned caller submits at most once per proposal. The consumer replays
cumulative pinned `ybc_votes` with checked uint256 arithmetic and derives the
shared aggregate basis points from cumulative Yea and weight.
The immutable word, initcode, and deployed runtime are derived for the recorded
constructor genesis from the frozen creation bytes and runtime template; v1
does not hardcode the fixture genesis or its constructor-bound hashes. After a
positive trace-unavailable invocation, later aggregate-bearing events cannot
restart cumulative replay at zero and must cascade to raw/unclassified unless
an authenticated cumulative seed is supplied.
The exact public methods are `vote_yea(address,uint256)` / `0x69586e2e` and
`vote_nay(address,uint256)` / `0xff855dde`. Compiler distribution,
source-integrity preimages, commands, stdout/raw-byte hashes, immutable layout,
and final Voter/Executor runtime pins are normative in
`contract-reference.md`, `feed-schema-v1.md`, and the generated JSON Schema.

Configuration history also records Voter decay. A pointer to a preconfigured
Voter requires direct code-birth evidence, complete authenticated Voter-setter
history from birth through the pointer boundary, exact replay of decay,
delegated-staking, YBC, and aggregator values, strict post-birth setter order,
and zero later same-block relevant setters when block-end state is used. The
logical producer-start boundary similarly retains every pre-start setter and
authenticates each unique transaction with a receipt and full geth
`callTracer`. Exact physical Set* logs can be shared by proofs only when the
feed-wide transaction sender, caller, trace path, calldata, decoded mutation,
and log bytes match.

For an arbitrary outer Voter trace path `P`, the three emitted pinned Vote
frames are `P+[1]`, `P+[4]`, and `P+[5]`; `[1]/[4]/[5]` alone applies only to
the direct-root fixture. Live `rawTraceSha256` hashes the exact retained UTF-8
bytes of the successful top-level JSON-RPC result object from opening `{` to
matching `}`, excluding the envelope, ID, and surrounding whitespace, before
decoding or reserialization. Synthetic examples use a separate projection.
Every other live transaction, receipt, code, storage, header, and log-result
hash uses the same
exact JSON-RPC result-token byte rule from `feed-schema-v1.md`; synthetic
records keep exposed live hash/key fields null. Generic archive branches retain
`rawResultSha256` with `rawResultObjectKey`; Executor log replay retains
`rawLogsSha256` with `rawLogsObjectKey`. Object or manifest keys are
required only where the selected union branch exposes them.

Only a verified pinned Executor permits pinned script framing, decoded calls,
or a completed proposal-time simulation. Exact bytes and hash comparison remain
visible for a custom or uninitialized Executor, but executable framing and
analysis/simulation stay explicitly unavailable with implementation-specific
provenance rather than borrowing pinned semantics.
The empty signal identity remains independently knowable.

### DAO-FR-015: event provenance

Each retained event exposes the producer-owned canonical block time, actor and
role, block number and hash, transaction hash when available, transaction
index, and log index. User-facing time never substitutes the browser clock.
Missing time or transaction data has an explicit fallback; Technical details
still retains every available raw identity field.

The feed uses one canonical block registry across deployment, configuration,
event, receipt, bytecode, simulation, cursor, and finality evidence. One chain
height has one hash and one value for every known timestamp; one hash maps to
one height. Known timestamps increase strictly with block height; equal or
decreasing time at a higher block rejects. Within a block, `logIndex` is unique and rises strictly as
transaction order advances across proposals and Voting generations. Real
bootstrap, configuration, preconfigured-Voter, and Executor-authorization logs
occupy that same namespace. Repeated references to one physical setter log are
ordered once and retain identical position, transaction hash, emitter, topics,
and data. Configuration and preconfigured-Voter references additionally retain
one feed-wide authenticated transaction sender and exact call identity per full
trace path; Executor authorization does not invent sender or trace fields.

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

If the proposal was vetoed with a positive last-write-per-account running total
and the voting window remains open, the page keeps Yea and Nay available and
says:

> This proposal has been vetoed and cannot be approved or executed. You may
> still vote to record your participation.

If it was vetoed at a zero running total, voting is unavailable. Zero-weight
Vote history alone does not change that early branch.

### DAO-FR-025: content failure

Voting remains available when the protocol permits it even if content or
analysis is unavailable. The app requires an explicit confirmation that the
full proposal could not be reviewed.

### DAO-FR-026: historical vote classification

A complete pinned-Voter invocation has one nonzero, positive-weight binary
human Vote at ordinal `0`. A nonmember or a member whose configured aggregator
returns zero emits that human-only outcome. A positive aggregate result emits
the exact ordered `{human, delegated staking, YBC}` triplet at ordinals
`{0,1,2}` in one transaction and trace invocation. Aggregate weights remain
absolute `Voting.vote` contributions and are not inferred from the aggregator
return value.

The consumer rejects standalone aggregate labels, mixed invocation identities,
missing ordinals, wrong configured accounts, selector/direction conflicts, and
trace/account substitutions. If a pinned trace is unavailable, or the Voter is
custom and unverified, the raw event remains visible as unclassified. It cannot
claim direction, aggregate role, or human participation. A zero-address Voter
cannot produce an accepted Vote.

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
topic to the exact `/t/<slug>/<id>` URL without a trailing slash, query,
fragment, port, ambiguous path, or terminal bare `?` or `#` delimiter. The
original serialized URL must equal `${url.origin}${url.pathname}` exactly.
Eligibility uses stable category IDs, not display labels. Descendants are
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

When retrieval yields invalid content, the feed retains the exact bytes and the
consumer reproduces one non-retryable failure in this order: digest, UTF-8,
JSON, proposal schema/domain parse, final LF, then canonical field order. A
producer cannot substitute the failure code or label fully valid canonical
bytes as invalid. Timestamp fields must parse as real RFC 3339 instants;
regex-shaped impossible calendar dates are invalid.

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
script to exactly one matching `Propose` log, and the receipt sender must equal
the Propose proposer. That log must have four canonical
topics, and its decoded topics and non-indexed data must re-encode byte for byte
with no trailing or dirty padding. Open proposal and Copy link appear only after
that receipt supplies the composite identity. Receipt confirmation,
awaiting-index, and indexed states retain the same identity. The creation-stage
receipt uses exact archive-RPC or committed-synthetic provenance. Live
`eth_getTransactionReceipt` retains the raw successful result-token SHA-256 and
immutable object key; synthetic evidence keeps both live fields null and binds
its fixture projection. Publication failure
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
origin, an engine-injected nested frame with proposal-effective verified-pinned
Executor code and `CALLER = Voting`, target `CALLER = Executor`, the operator
check, no code overrides, the exact block/time/script, and the typed Voting
`executed` false-to-true transition. It authenticates the Propose block header
and successful receipt. Initial frame gas is
`min(Propose block gasLimit, 30,000,000)` and `GASPRICE` is the receipt's
effective gas price. The recorded header base fee is not a substitute, and the
receipt effective price cannot be below it. Exact mainnet timestamp-schedule
evidence selects REVM `SpecId::OSAKA` and BPO2, whose authenticated excess blob
gas determines the blob base fee. The frame binds block beneficiary, zero
difficulty, PREVRANDAO, exact `execute(bytes)` calldata, and the Osaka warm set
including coinbase and all Osaka precompiles.
Completed v1 simulation is mainnet-only: feed and frame context require
`chainId = 1`. Every live header, receipt, Executor code, authorization storage,
authorization log replay, and Voting override code branch retains its raw
result digest and immutable object key, and v4 binds each pair; synthetic
branches bind projections and require the live pair to be null.

Completed simulation separately proves `Executor.operators[Voting]` at the
Propose position from pinned mapping base slot `2`, exact zero/one storage word,
and canonical replay of every same-block `SetOperator(Voting,bool)` log through
Propose, with zero later relevant setters. Success requires authorization,
operator-check pass, script entry, and `script_completed`. A false gate failure
does not enter the script and differs from an authorized target/script revert.
The `yearn.dao.simulation-context-inputs.v4` commitment also binds the
chain-spec and REVM 34.0.0 artifacts, source/build/code and synthetic-or-archive
evidence, Executor-authorization storage/replay evidence kind and raw or
projection digest, envelope, empty access list, and warm-set inputs. Version 3
is rejected.
The exact Osaka/BPO2 activation values, Prague-fraction rejection,
initialization order, REVM crate URI/hash, fixture blob-fee comparison, and six
gas-disclosure literals are normative in `feed-schema-v1.md` and the generated
JSON Schema.

The 30,000,000 frame cap is explicitly a non-transactional gas
overapproximation: outer transaction validation is bypassed, Osaka's
16,777,216 transaction cap is disclosed, and parent EIP-150 forwarding is not
modeled. Success or revert applies only to recorded injected-frame behavior,
not an unknown future execution transaction or execution feasibility.

Unknown call decoding does not force simulation failure. If an
origin, pinned Executor implementation, authenticated header/receipt, or
frame-equivalent context cannot be established, analysis is `Unavailable`
rather than successful. Signals, missing or malformed bytes, and hash
mismatches also cannot produce a completed proposal-time simulation. Analysis
and simulation observations cannot precede a known Propose time or follow
analysis generation or feed publication. Failed or
unavailable simulation attempts bind their failure time to the same retained
attempt time; both may be `null` only when that time is unproved. An
analysis-level failure derived from simulation cannot predate it.

## 8. Lifecycle actions

### DAO-FR-040: retract

Show retraction only to the proposer when the client reports it is permitted.
Explain that a proposal with a positive last-write-per-account running vote
total cannot be retracted, that zero-weight Vote history does not block it, and
that retraction does not reset the proposal cooldown.

### DAO-FR-041: flag

The operator may flag only when the client reports it is permitted. The form
requires a reason within the contract limit. The same zero running-total rule
applies, including accepted zero-weight Vote history. Flagging is presented as
invalid or spam moderation, not an ordinary vote outcome.

### DAO-FR-042: veto

The guardian may veto only when the client reports it is permitted. The form
requires a reason. The confirmation explains whether the proposal has a
positive running vote total and whether participation voting will remain open.

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

### DAO-FR-044: historical capability evidence

Feed admission uses the configuration effective at each emitted event.
`Propose` requires nonzero blacklist, weight measure, and hook. Vote requires
nonzero Voter and weight measure; positive weight also requires the hook, and a
pinned-Voter path requires YBC. Retract and Flag require the hook, and Flag also
requires the operator. Early-no-votes Veto requires guardian and hook;
post-participation Veto requires the guardian but does not call the hook. A
nonempty executable Execute requires Executor. An empty signal Execute skips
that call. Guarded Execute requires the operator; permissionless Execute does
not.

Retract and Flag require a zero last-write-per-account running vote total at
their event position. A prior zero-weight Vote is allowed, so the consumer does
not replace this rule with “no Vote logs.” Once Executor or the proposal
blacklist becomes nonzero, its nonzero-only setter cannot return it to zero.
Every Vote multiplication and updated running total must fit checked uint256
arithmetic at the event, even when the final proposal total fits.

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
- Safe feed admission is total. The raw path handles malformed or oversized
  JSON; the in-memory wrapper rejects non-serializable or oversized values
  before traversal; direct schema safe parse returns typed failure for semantic
  mutations without escaping an exception. Throwing parse helpers only rethrow
  the same typed validation error.

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
