# DAO Governance UI Specification

V2 reset: preserve the accepted layout. Production routes read the V2 feed with separately observed wallet facts; production writes remain gated. Preview mock actions keep their existing workflow.

## 1. Design stance

DAO Governance is a reading and decision surface, not an analytics dashboard.
Proposal content and the current action come first. Timing, rules, provenance,
and raw contract data stay available without competing for attention.

Use the established route shell, Yearn blue, neutral surfaces, shared controls,
and route-local messages. Avoid decorative governance imagery, glass effects,
large marketing heroes, and nested cards for every metadata group.

The resolved application label in the shared header is a native home link. It
uses `/` on the application's branded beta host and the exact application path
on shared hosts. Desktop keeps a 40-pixel target; mobile uses 44 pixels and
closes the modal menu after activation. Both expose a visible focus ring.

## 2. Information architecture

```text
/dao
  proposal list
  upcoming/active/closed filters
  proposal creation entry point

/dao/proposals/[id]
  proposal header and outcome
  immutable content and forum discussion
  vote/action panel
  lifecycle and results
  execution analysis
  technical details

/dao/propose
  forum discussion
  immutable content
  signal/executable selection
  full script input and structural checks
  review, publish, and propose
```

## 3. Proposal list

### Header

- Title: `Proposals`
- Supporting copy: `Review proposals and take part in Yearn DAO decisions.`
- Supporting count: total proposals available when the feed is ready
- Quiet action: open the Yearn discussion forum
- Primary action: `Create proposal`
- Product identity stays in global header metadata. Do not repeat a large
  `DAO Governance` hero or permanent local `Proposals` / `Create proposal`
  route toggle.
- Do not call the product `Yearn Governance`; `gov.yearn.fi` already names the
  forum surface.

### Filters

Use a compact segmented control or tabs:

- Upcoming
- Active
- Closed

The order follows future to past. A valid `?group=` value always wins, even when
that group is empty. Without a valid URL value, select populated `Active`, then
populated `Upcoming`, then populated `Closed`; use `Active` when all are empty.
Filter changes update the URL with history replacement, preserve unrelated
query parameters, survive reload, and do not add Back-stack entries.

### Proposal row or card

Each item contains:

- an `Execution blocked` badge and static reason first when exact script bytes
  are missing or do not match the stored hash;
- status badge;
- `Signal` or `Executable` label;
- proposal ID and title;
- proposer identity;
- relevant start/end time;
- Yea/Nay bar and percentages;
- `of votes cast` caption;
- quiet execution indicator for executable proposals;
- content or discussion warning only when needed.

Prefer a dense list on desktop and stacked rows on mobile. Do not create a large
tile grid. Status, title, and timing must scan in that order.

The hard-block order is `Execution blocked · <status> · Executable`, followed
immediately by its reason. Suppress `Executable actions` only in that case.
Lifecycle, moderation, guard, schedule, account, and simulation failures do not
produce this proposal-level badge.

The whole row opens the proposal through a stretched native link. Do not add a
row `onClick` or button role. Address explorer and copy controls remain real,
independent controls above the stretched link. The row focus ring must remain
visible. Proposal hrefs carry `?from=<group>`.

### Empty and error states

- No active proposals: link to upcoming and closed proposals. Show the next
  scheduled vote only when an upcoming proposal supplies that time.
- No proposals at all: show a neutral empty state and proposal CTA.
- Feed unavailable: keep the shell and show retry plus the last-good snapshot
  time when available.

## 4. Proposal detail

### Header block

Start with `Proposals / <Group> / <proposal title>`. The group returns to the
exact board filter. Browser Back restores the prior board URL; a direct detail
visit derives the proposal's display group, and an invalid `from` value is
ignored. Show the proposal title as the route's only H1, followed by:

- proposal ID;
- the same execution-block badge and reason used on the board, when applicable;
- status;
- type;
- proposer;
- primary timing statement;
- forum discussion link;
- IPFS or content warning when applicable.

The primary timing statement uses one clear line such as:

- `Voting opens in 3 days`
- `Voting ends in 18 hours`
- `Approved on 14 August 2026`
- `Execution expires in 2 days`

Countdowns use tabular numerals.

### Desktop layout

Use a main reading column and a narrower action column. The action panel may
remain visible while reading when viewport height permits, but it must not cover
the footer or technical details.

```text
┌─────────────────────────────────────┬──────────────────────┐
│ Header and proposal content         │ Vote/action panel    │
│                                     │                      │
│ Immutable Markdown and attachments │ Weight and choices   │
│                                     │                      │
│ Lifecycle and results               │ Eligibility reason   │
│                                     │                      │
│ Execution analysis                  │ Contextual action    │
└─────────────────────────────────────┴──────────────────────┘
```

On mobile, the action panel follows the header and precedes the long proposal
body. Users should not have to read to the bottom before finding an open vote.

### Vote results

Use one horizontal Yea/Nay bar with exact percentages and weights. Supporting
copy:

```text
62% Yea · 38% Nay
of votes cast · 50% approval threshold
```

The rules disclosure contains:

> No minimum turnout is required.

Do not use a warning banner for the no-quorum rule.

### Vote panel

States:

- wallet disconnected;
- wrong network;
- no voting weight;
- scheduled but not open;
- open and eligible;
- late-weight decay;
- already voted;
- participation-only after veto;
- transaction pending;
- awaiting feed indexing;
- closed.

Yea and Nay are equal-weight choices until selected. Neither is preselected.
Confirmation shows direction, effective weight, proposal title, and that the vote
cannot be changed through the public Voter.

Post-veto participation uses a restrained persistent notice, not an alarming
full-page banner:

> This proposal has been vetoed and cannot be approved or executed. You may
> still vote to record your participation.

### Signal outcome

Show:

```text
Approved
No executable actions
```

Do not display `Executed` as the primary outcome for an empty script.

### Immutable content

The parsed title is the route's only H1 and the parsed summary appears once as
lead copy. The immutable-content section starts at H2. Source H2 through H4 map
to H3 through H5; source H1 and the summary node are omitted there because the
header already owns them. Tables, fenced code, long links, and exact source are
contained within their own scroll or wrap regions.

One image token, alone in a top-level body paragraph after the summary, renders
a semantic attachment card at that AST position. Images in title, summary,
heading, link, styled-inline, mixed, or nested contexts fail validation. The
card shows alt-text title, media type, byte size, Open, and Copy. It contains no
`img`, `picture`, CSS background image, preload, metadata probe, or prefetched
attachment link. Open and Copy receive only the validated suffix-free raw-CID
gateway URL. SVG is never inline.

One shared AST renderer serves authoring Preview, final review, and detail. The
exact-source disclosure preserves the Markdown byte for byte.

### Lifecycle and provenance

Keep `Status`, `Vote result`, `Moderation`, and `Execution` as separate facts.
Flagged shows `No community result`; veto explanations use stored retracted state and current timing. No later-total inference labels a historical veto phase. Every event row uses truthful ABI identity or an unknown-actor label, uses the
producer-owned UTC block time, and links the transaction when available. Use
`Time unavailable` and `Transaction unavailable` without inventing data.

`Proposal rules` is collapsed by default and renders supplied domain facts:
approval threshold, positive-total rule, no minimum turnout, proposal type,
voting period, execution delay and guard, Voting contract, verified source, and
configuration observation block. Stored threshold and snapshot default are distinct; timing/guard configuration is not labeled “rules at creation.” The UI formats 5,000 as 50% and 6,000 as 60%;
it does not own the underlying rule.

### Proposed script

Show exact script/hash integrity, supported frame order and raw targets, selectors and calldata. Missing bytes differ from empty signal bytes. Mismatched bytes and malformed supported framing block execution preparation. Unsupported Executor implementations show raw bytes and an unsupported-decoder explanation.

Unknown calls stay unknown. Optional locally reviewed decoding may show function/arguments and its source. Proposer descriptions do not establish byte behavior. Remove historical simulation badges, pending-analysis loaders, engine/proof panels and backend analysis promises. Fresh transaction simulation belongs to the later execution confirmation flow; success is not a safety guarantee.

### Technical details

Use a disclosure for:

- chain ID;
- Voting and Voter addresses;
- proposal identity;
- creation transaction and block;
- raw contract status;
- content CID and digest;
- script hash and bytes;
- flag or veto event details;
- every event block number, hash, UTC time, nullable transaction hash,
  transaction index, and log index;
- verified-source kind, URL, revision, and source path;
- proposal-rule observation block;
- feed snapshot block and time.

Long values use copy controls with at least 40-pixel hit areas. Code blocks wrap
or scroll within their own region; the page itself must not overflow.

## 5. Proposal authoring

Use a single-page stepped form with visible sections rather than a modal wizard.
Preserve entered values when a later section fails.

### Section 1: discussion

- Field: `Forum discussion`
- Accept only `https://gov.yearn.fi/t/.../<topicId>` in the supported app flow.
- Mock mode provides deterministic valid, missing, wrong-category, and unavailable
  responses.
- Successful validation shows normalized title, category, author, and creation
  time.

Copy should not promise that the app enforces governance policy on direct
contract callers.

### Section 2: proposal content

Use one `Proposal Markdown` textarea beneath named Write and Preview tabs. The
route H1 remains `Create proposal`; form sections are H2. Preview renders the
parsed title at H3 and maps source H2 through H4 to H4 through H6. The first H1
is the title, the following paragraph is the summary, and body content follows.
Ordinary supporting links stay in Markdown.

Show one tabular UTF-8 byte counter against the 32,768-byte limit and the stable
domain errors below the editor. Tabs use `tablist`, `tab`, and `tabpanel`, with
Arrow, Home, and End keyboard behavior. A failed Review while Preview is active
returns to Write, focuses the textarea, sets the deterministic UTF-16 caret to
the first located error, and scrolls it into view. Focus waits until the Write
textarea is mounted. Do not intercept Tab inside the textarea.

Preview, final review, and detail share one safe AST renderer. Raw HTML and
unsupported nodes never render, and `dangerouslySetInnerHTML` is forbidden.
Explain that the exact source becomes the immutable proposal snapshot while the
forum may continue to change.

### Section 3: proposal type

Use two choices:

- `Signal`: `Records a DAO decision without executable calls.`
- `Executable`: `Includes an onchain script prepared with development tools.`

### Section 4: execution script

Only for `Executable`:

- multiline monospace input;
- full `0x`-prefixed Executor script;
- byte count and call count;
- first structural error with byte offset;
- target and calldata-size list;
- computed script hash.

Valid-state copy:

> Script structure is valid: 3 calls, 684 bytes.

Supporting copy:

> The proposal page retains exact scripts and supported frame details. Indexing records the confirmed proposal.

### Section 5: review and submit

Review exact forum data, immutable content, type, script, hash, calls, current
eligibility, expected voting epoch, and the two submission steps. Normal
eligibility shows `Expected voting epoch` plus `Affected reward epochs N–N+5`;
the six individual counts remain domain/debug facts. Do not show a capacity
success table or notice. When capacity blocks submission, name the exact epoch,
show `64 / 64`, repeat the affected range, and explain that capacity is shared
system-wide rather than a user quota.

Two actions are required. Present them as distinct current/upcoming/complete
surfaces rather than visually identical buttons:

1. Publish proposal content
2. Create onchain proposal

Before publication, Step 1 is current and Step 2 is unavailable; state that
publishing immutable content neither creates the proposal nor opens a wallet.
After publication, Step 1 shows its receipt/fingerprint and Step 2 receives
focus with `Content published — proposal not created yet`. When the hash is
known, show View transaction but no proposal action. After a successful receipt
decodes one matching `Propose` event, show Open proposal and Copy link. Keep the
same host-aware composite identity through receipt-confirmed, awaiting-index,
and indexed states. One persistent polite atomic live region announces progress
without repeating the whole review. Keep publication failure separate from
wallet rejection, receipt failure, onchain revert, or network failure. A
publication failure never exposes Step 2. The review panel's typed transaction
result controls proposal creation. Every failed creation preserves published
content and retries Step 2 without republishing, while showing no hash, receipt,
identity, proposal action, created record, or indexing state.

Normal success moves through receipt pending, identity decoded, awaiting
indexing, and Indexed with one stable proposal href. Apply registration latency
before the created record appears. If indexing is delayed, keep Open, Copy, and
View transaction visible and add `Retry indexing`; retry must index the same
identity without duplicate persistence or feed events.

## 6. Lifecycle menus

Retraction, flagging, and veto are destructive to the proposal lifecycle. Place
them in a contextual action area, require explicit confirmation, and show the
contract effect before signing.

Do not hide a currently available primary vote or execute action inside an
overflow menu. Role actions may use a secondary disclosure because most users
will never have them.

## 7. Shared debug controls

DAO controls live in the existing floating debug panel. No route-local scenario
bar or mock badge appears in the normal app.

Required groups:

- Persona: observer, voter, proposer, operator, guardian
- Content: available, unavailable, invalid, unverified forum
- Lifecycle: discussion, voting, approved, rejected, expired, retracted, flagged
- Veto: before votes, after votes
- Analysis: pending, decoded, partial, failed, hash mismatch
- Account: weight, no weight, already voted, late-decayed, disconnected, wrong network
- Execution: signal, executable, guarded, permissionless, simulation failure
- Authoring: valid signal, valid script, invalid frame, too many calls, too large
- Transaction: success, wallet rejection, revert, network error, index pending,
  clear pending

Personas are presets, not exclusive role types. After loading a preset, QA can
toggle proposer, operator, and guardian facts independently to cover combined
roles.

Reuse shared `+1 day`, `+7 days`, and `Reset App`. A no-argument DAO reset starts
at the deterministic `DAO_MOCK_NOW`; the shared day controls then add their delta
to that stored DAO baseline while continuing to advance the global clock and
other participating domains normally. Explicit test-bridge timestamps remain
absolute. Time travel never re-anchors immutable proposal timestamps. It changes
proposal capabilities and recomputes authoring eligibility epoch labels from the
fixed mock genesis through domain logic rather than swapping a display label. In
mock runtime, lifecycle copy uses runtime time while snapshot labels continue to
use canonical block provenance.

## 8. Responsive and accessibility requirements

- Use a 44-pixel target where space permits and never less than 40 pixels.
- Preserve visible focus and logical tab order.
- Status, Yea, Nay, warnings, and success are not color-only.
- Headings use balanced wrapping; short explanatory copy uses pretty wrapping.
- Dynamic weights, percentages, epochs, and timers use tabular numerals.
- Respect reduced motion. Interactive transitions are short and interruptible.
- Use property-specific transitions and a `0.96` press scale for active controls;
  reduced motion removes both. Proposal rules and verified-source controls must
  include scale in their explicit transition. Do not animate preview content on
  each edit.
- Do not use `transition-all`.
- Confirmation dialogs restore focus to their trigger when closed.
- Script errors connect to the textarea with accessible description attributes.
- Carry `min-width: 0` through nested grids and flex rows. Long headings and
  links use anywhere wrapping; tables, fenced code, and exact source contain
  their own horizontal scrolling. The document never overflows at the review
  widths or 200% root text.
- External source, transaction, and attachment links are native anchors with
  `target="_blank"` and `rel="noopener noreferrer"`. Internal proposal links
  remain native and host-aware.

## 9. Review widths

Review at minimum:

- 390-pixel phone;
- 768-pixel tablet;
- 1280-pixel desktop;
- a short-height desktop viewport for sticky-panel behavior.

The M2 acceptance review must cover every state in the mock schema, not only the
default proposal.

## 10. M1 route shell boundary

The first route package establishes production-shaped shells before the M2
proposal interactions:

- `/dao` reads the deterministic client and distinguishes loading, empty,
  ready, error, and disconnected states.
- `/dao/proposals/[id]` resolves numeric IDs against the active mock Voting
  contract and distinguishes loading, ready, not-found, and error states. A
  disconnected wallet is handled inside the contextual action panel; the
  detail shell does not repeat a wallet notice above its breadcrumb and title.
- `/dao/propose` reads proposer eligibility for a connected wallet and shows a
  disconnected, loading, ready, or error shell without rendering the M2 form.
- This M1 shell originally repeated `DAO Governance` as a route hero. WP7A
  supersedes that presentation with one contextual H1 per route while global
  header metadata retains product identity. The forum link remains labeled as
  a discussion surface and points to `gov.yearn.fi`.
- The routes are available by path in development and preview. Production
  runtime returns not found until the rollout package adds the final feature
  flag and data invariants.
- M1 did not expose `dao.yearn.fi`. WP7A later reserves the hostname in the
  internal routing map only; it remains absent from production Wrangler custom
  domains, canonical metadata, sitemap publication, and other discovery.

## 11. M2 read-only mock behavior

The proposal board consumes each proposal's domain-provided `displayGroup` for
the `Upcoming`, `Active`, and `Closed` filters. Rows remain dense on desktop and
stack on smaller screens. Status, title, timing, author, vote percentages, the
`of votes cast` caption, proposal type, discussion provenance, and content
failures stay visible without a wallet.

When the active filter is empty, its empty state provides keyboard-accessible
shortcuts to the upcoming and closed groups. It reports the earliest upcoming
vote time only when an upcoming proposal supplies one; filter membership and
counts continue to use the domain-provided `displayGroup` rather than
recalculating lifecycle status in the UI.

A refresh or synthetic feed error preserves the last successfully surfaced
feed as a stale board beneath a restrained outage notice and retry control. The
notice labels the last successful snapshot using `canonicalBlock.timestamp`.
An initial request that has never surfaced a successful feed remains a distinct
cold-start error and does not reveal an in-flight response as last-good data.

Detail separates immutable content, snapshot contract observations, frontend script framing and current wallet observations. The feed has no producer-owned historical decoding or simulation evidence. Preserve raw call targets and calldata when unknown. Source links come from app-owned reviewed definitions; a source pin does not verify a deployment.

Long identifiers, addresses, hashes and scripts wrap or scroll within their own regions. Copy controls retain 40-pixel targets and native explorer links.

An approved signal uses `Approved` as its primary outcome and always pairs it
with `No executable actions`, even when its raw contract status is `EXECUTED`.
The rules disclosure says `No minimum turnout is required.` without presenting
that rule as an alert.

## 12. M2 mock action behavior

The detail sidebar now places `Your action` before vote results. On phone and
tablet widths the whole sidebar precedes immutable content; on desktop it stays
in the right column without becoming a height-obscuring sticky panel.

The action panel renders only account facts and capability reasons supplied by
the DAO client. Yea and Nay start unselected. A vote review repeats the selected
direction, proposal title, effective weight, original weight and decay when
applicable, and the public-Voter irreversibility. A vetoed proposal with retracted=false retains the
same binary choices under the participation notice when current eligibility
permits; a retracted proposal exposes no vote choice. Veto confirmation says participation voting stays open only while
the current voting window is actually open; a closed-window veto says that the
window has ended and is not reopened.

Unavailable immutable content requires one acknowledgement before voting.
Invalid immutable content requires that acknowledgement plus a separate review
of the available onchain record. These warnings do not alter client-supplied
authorization.

Retract, flag, and veto remain in the lifecycle disclosure. Their dialogs state
the exact lifecycle effect; flag and veto reasons are required and limited to
256 UTF-8 bytes. Execute is present only for executable proposals, stays disabled
with the client-supplied reason until its supplied capability is true, and never
appears for a signal. Its review uses the accepted script hash, guard, and
current-state preflight facts already in the mock client. It does not perform a
new simulation or submit an onchain transaction.

All five actions prepare through the DAO client and execute through shared
`useTx`. Normal route copy says `Transaction submitted.` and never exposes a
mock label. A successful mock submission updates live account authorization and
enters `awaiting proposal indexing`; canonical proposal totals, status,
moderation, and event history remain unchanged until the debug indexer applies
the pending event. Wallet rejection, revert, and network failure create no
pending action.

Confirmation dialogs are modal, trap focus, close with Escape or the backdrop,
and restore focus to their trigger. Action targets remain at least 40 pixels,
focus remains visible, and reduced-motion mode removes interactive transitions.

## 13. M2 assembled mock account presentation

The deterministic E2E account is presented consistently across the global
wallet area, proposal board, proposal detail, action panel, and authoring
eligibility. In E2E mode, the DAO header follows the same typed runtime actor,
connection, and network facts as the current DAO route. The fallback identity
is an explicitly read-only status, not a wallet-action button; disconnected and
wrong-network states update the desktop and mobile presentations together.
Preview or production sessions without `NEXT_PUBLIC_E2E=true` retain the normal
RainbowKit connection, account, and chain behavior.

The read-only desktop presentation is at least 40 pixels high and the mobile
presentation is at least 44 pixels high. This E2E-only presentation does not
expose DAO fixtures or delivery language on normal routes.

## 14. M2 follow-up accessibility and evidence behavior

The mobile navigation is a named modal dialog rendered above and isolated from
the page. Opening it moves focus to Close, locks body scrolling, and makes the
background inert and hidden from assistive technology. Tab and Shift-Tab wrap
inside the dialog. Escape, Close, and internal navigation all restore focus to
the opener when it remains mounted. The 390 × 500 and 390 × 844 layouts keep the
header and footer fixed within `100dvh`, leave the navigation body scrollable,
and remove entrance and accordion transitions under reduced motion.

The visual Yea/Nay bar is hidden from assistive technology because the adjacent
text already exposes the same breakdown. DAO status badges, authoring eyebrow
and step markers, script-integrity text, approved-signal text, active purpose
states, and standalone error or warning feedback use local light/dark
foreground and surface pairs that meet 4.5:1 for small normal text. This covers
proposal hash and analysis failures, board content warnings, action loading and
moderation errors, and authoring validation feedback. Both decision and
participation purpose badges retain the pinned high-contrast dark treatment.

Fixture UAT navigates to the target route before applying a fixture through the
shared bridge, then reads back the selected fixture identity in the same
document. Contract, action, and trust assertions—including permissionless
execution and post-veto participation—prove the requested fixture rather than a
default title or status. The 200% overflow check injects a 200% root font size;
it is evidence for root-font scaling, not a browser-zoom claim.

## 15. Feed V2 and rollout states

The production route never uses mock fallback. With the existing DAO flag off, routes remain unavailable. Enabled, operator-configured review builds require an exact trusted deployment set and server feed URL. The beta host remains noindex/noncanonical and Access-protected; this task changes no deployed configuration.

Use a compact snapshot notice inside the existing route container. Show block time and age even after a successful old response; warn after five minutes. Failed refresh retains the last-good board/detail with an error and Retry. Initial loading, empty feed, unavailable source, incompatible version/deployment and ambiguous multi-deployment selection remain distinct. Proposal URLs include chain and Voting address so ID zero and repeated numeric IDs work.

The current-wallet panel uses a separate observed block, status and effective weight. Disconnected users keep all global data. Wrong network, RPC failure, refreshing or disconnect hides old eligibility. A newer live change may show feed lag without rewriting snapshot fields. Production actions remain explicitly disabled until their packages pass review.

## 16. V2 review evidence

Review phone 390×844, tablet 768×1024, desktop 1280×900 and short desktop 1280×600. Check native keyboard links/disclosures/retry, screen-reader labels, raw byte wrapping, content failures and signal completion. Saved consumer response route tests do not count as producer interoperability evidence.
