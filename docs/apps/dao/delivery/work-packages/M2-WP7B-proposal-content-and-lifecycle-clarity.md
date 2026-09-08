# M2 WP7B: Proposal Content and Lifecycle Clarity

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Status: scoped for implementation; the M2 product gate remains unaccepted.

Branch: `agent/dao/m2/wp7b`

Frozen integration base: `4588a9806dd7002e3f5a1bb26bb098a1f7bf91d9`

## Objective

Apply the returned M2 product-gate changes to immutable proposal content,
authoring, post-creation identity, lifecycle language, event provenance,
verified sources, and proposal rules. Keep the result deterministic and
mock-backed while preserving every accepted M2 behavior that this package does
not replace.

This file is the WP7B scope and acceptance contract. Every requirement under
Scope is binding unless it is marked as a later-milestone handoff.

## Depends on

- M2 WP4 through WP7A merged into `agent/integration` at exact commit
  `4588a9806dd7002e3f5a1bb26bb098a1f7bf91d9`.
- `integration/dao-m0` peeling to
  `04224b3c930fd72efee6b65afa07f83c70369446`, with
  `3d746e84b02d58bbe196525fb5a2510b4bfbce64` as its ancestor.
- The pinned governance source at stYFI commit
  `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`.
- The assembled M2 mock UX remaining explicitly unaccepted. WP7B is a returned
  product-gate package, not permission to begin M3.

Do not silently rebase, retarget, or replace the frozen package base. Stop if
the package branch, HEAD, merge-base, or worktree state does not match the
assigned range before implementation begins.

## Expected ownership

- `lib/clients/dao/*` content, asset, fixture, event, proposal-rule, receipt,
  and mock identity types and domain helpers
- `/dao/propose` draft, validation, preview, review, mock publication, receipt,
  and post-create states
- `/dao/proposals/[id]` shared Markdown presentation, lifecycle, provenance,
  source, and proposal-rule presentation
- route-local DAO copy and existing host-aware DAO link helpers
- DAO unit, integration, component, Playwright, test-bridge, fixture, and
  evidence coverage
- canonical DAO behavior docs, schema examples, delivery evidence, status
  ledger input, and the M3/M5 handoffs named below
- only the parser and rendering dependencies needed for the accepted Markdown
  design, pinned exactly and reviewed under the repository dependency policy

One implementer owns all edits in this worktree. Read-only auditors may inspect
the committed range, but no second agent may edit the worktree concurrently.

## Scope

### 1. Refactor the immutable content contract in place

Rename `DaoProposalContentV1` to `DaoProposalContent`. Keep
`"yearn.dao.proposal.v1"` as the first finalized wire-format identifier. Do not
add a v2 type, legacy adapter, compatibility parser, fallback renderer, or dual
fixture set. There is no production feed, published proposal corpus, or outside
consumer that needs a compatibility path.

The immutable source shape is equivalent to:

```ts
type DaoProposalAsset = {
  path: string;
  mediaType: string;
  byteLength: number;
  digest: Hex;
  width: number | null;
  height: number | null;
};

type DaoProposalContent = {
  schema: "yearn.dao.proposal.v1";
  markdown: string;
  discussionUrl: string;
  proposalType: DaoProposalType;
  createdBy: Address;
  createdAt: string;
  assets: DaoProposalAsset[];
};
```

The source object contains one exact Markdown string and a bounded immutable
asset manifest. Ordinary supporting links belong in the Markdown. Discussion
URL, proposal type, creator, creation time, and asset facts remain structured
metadata. Parsed title, summary, body nodes, attachment resolutions, and AST are
runtime results. They must not be copied back into the immutable source object.

Update every type, fixture, example, mock service, consumer, test, and canonical
document in one package. Remove every production use of the old type and field
renderer. A schema identifier that still says `v1` is not a compatibility path;
it names the newly finalized first wire format.

The reviewed Markdown string is part of the exact immutable bytes used for the
content digest. Preserve its UTF-8 bytes, including whitespace, line endings,
and a trailing newline, through review lock, mock publication, receipt data,
fixture vectors, and digest derivation. Never regenerate Markdown from the AST.
Record canonical vectors that prove a one-byte source change changes the
digest.

Content and asset publication use one authenticated-manifest model:

- the onchain `bytes32` is the SHA-256 digest of the exact canonical content
  JSON bytes;
- the content CID is the CIDv1/raw/SHA-256/Base32 form of those same bytes;
- each manifest digest authenticates one independent raw asset block;
- `./assets/<path>` is an exact logical manifest lookup, never a descendant of
  the content CID; its asset CID is derived from the matching manifest digest;
- direct `ipfs://` attachment targets contain exactly one canonical raw asset
  CID, with no path, slash, query, or fragment, and match exactly one manifest
  digest; and
- either attachment form resolves to
  `https://ipfs.io/ipfs/<assetCid>` with no suffix.

Duplicate normalized manifest paths or duplicate digests fail validation. This
model does not publish a UnixFS directory and never treats an asset as an IPFS
child of the content JSON.

Freeze these finite manifest limits in one exported domain constant before
content implementation:

| Limit | Value |
| --- | ---: |
| Asset count | 16 |
| Path UTF-8 bytes | 512 |
| Media type UTF-8 bytes | 127 |
| Bytes per asset | 2,097,152 |
| Aggregate asset bytes | 33,554,432 |
| Image width | 8,192 px |
| Image height | 8,192 px |
| Image pixels | 33,554,432 |

The 2 MiB per-asset limit keeps each attachment representable as one raw IPFS
block across the intended block-exchange and pinning implementations. The same
values must appear in domain tests and canonical docs; they may not live only
in form controls.

The deterministic M2 vector uses
`docs/apps/dao/examples/proposal-content.example.json` as the exact canonical
content bytes, including the final LF. Its digest is
`0x3c67b58a3ea4c8fd5d6c9a56dfa7322853967b4b85c700c4592e3cf68bb2f867`
and its raw CID is
`bafkreib4m62yupvezd6v23e2k3p2omrikolhws4fy4amiwjoht3ixmxym4`. The
committed `examples/assets/governance-flow.svg` raw block is 660 bytes, has
digest
`0x63786be28dedc9bab6de44a52c8124dc237dfc650e203779da5a03aed873a209`,
and raw CID
`bafkreiddpbv6fdpnzg5lnxseuuwicjg4en67yzioea3xtws2aoxnq45cbe`.

### 2. Use one maintained Markdown AST parser and validator

Add one domain-owned parse and validation entry point. It uses a maintained
CommonMark/GFM AST parser and the minimum needed extension support. Do not parse
Markdown with regular expressions. Do not let the editor, preview, publication
review, detail route, fixture loader, or later feed vectors invoke a second
parser. The shared renderer consumes the validated AST result rather than
parsing the source again.

The pre-implementation content-security audit must record the selected package,
exact version, maintenance and release history, transitive install scripts,
AST extensions, raw-HTML setting, URL handling, and why each new direct or
transitive dependency is needed. Direct imports must be declared direct,
exact-version dependencies. `npm run validate:deps` must pass.

The grammar is:

- The first AST content node is one H1. Blank source lines before it are
  permitted because they do not create content nodes.
- The document contains exactly one H1. Its rendered inline text is the title.
- The title is required and limited to 140 visible Unicode grapheme clusters.
- The next content node is a normal prose paragraph. Its rendered inline text
  is the required summary.
- The summary is limited to 500 visible Unicode grapheme clusters.
- Markdown delimiters and link destinations do not count toward visible title
  or summary length. Displayed link text and inline-code text do. Count through
  one shared Unicode helper and pin combining-mark, emoji, and joined-emoji
  vectors. Do not normalize or mutate the source to make it fit.
- At least one meaningful non-heading body block follows the summary. Visible
  paragraph, list, quote, code, table-cell, or valid attachment content counts.
  Blank text and a heading alone do not.
- Inspect headings across the whole tree. The first later heading, when present,
  is H2, and every later heading is H2 through H4. Supported body containers may
  contain those headings. Reject every later H1 and every H5/H6, including
  headings nested in a quote or list.
- Supported nodes are headings, paragraphs, text, emphasis, strong emphasis,
  ordered and unordered lists, list items, blockquotes, safe links, inline
  code, fenced code, GFM tables, table rows/cells, line breaks, and image syntax
  that resolves to a valid attachment card. Reject every unsupported node.
- Raw HTML is disabled and rejected. It is not escaped into visible content and
  no raw-HTML rendering switch may exist.
- The exact Markdown source is at most 32 KiB, meaning 32,768 UTF-8 bytes.
  Byte accounting uses one shared encoder. Reject non-round-tripping Unicode
  input rather than silently replacing invalid code units. Finish source
  preflight and enforce the UTF-8 byte limit before calling the parser.
- Ordinary links accept validated `https:` URLs, validated `ipfs:` URLs, or
  root-relative internal paths beginning with one `/`. Reject protocol-relative
  paths, including an app-prefixed path such as `/dao//host/path` that would
  become protocol-relative after prefix removal. Reject credentials, control
  characters, malformed URLs, `javascript:`, `data:`, and every unlisted scheme.
- External links use safe new-window behavior with no opener. Internal links
  keep host-aware app routing. `/dao?query` and `/dao#fragment` become root
  state on clean DAO hosts while remaining under `/dao` on shared hosts. The UI
  never builds a trusted URL from untrusted display text.

Validation returns stable error codes plus source offset, line, and column when
the AST supplies a location. It reports deterministic errors for source bytes,
missing or misplaced H1, duplicate H1, title length, missing or wrong summary,
summary length, empty body, heading depth, raw HTML, unsupported nodes, unsafe
links, unsafe images, invalid CIDs, invalid asset metadata, duplicate paths,
missing assets, and traversal. Order document errors by source position, then
manifest errors by manifest index and a frozen per-entry rule priority. Validate
at most the first 16 entries plus the too-many-assets sentinel at index 16. A
bad earlier entry precedes that sentinel; a duplicate path precedes a duplicate
digest at the same index. Finish manifest validation before attachment lookup.
The first error controls focus and caret placement in authoring.

AST work-limit inspection and title, summary, body, heading, and attachment
walks use bounded iterative traversal. A source that exceeds the node, nesting,
or table-cell limit returns a stable located limit error and an empty safe AST;
no recursive renderer receives the rejected tree.

The same parse result supplies authoring validation, preview, final publication
review, proposal detail, deterministic fixture checks, and expected vectors for
M3 producer work. The serialized feed carries exact source and validation
facts, not a browser-specific AST serialization.

### 3. Replace three content fields with one Markdown editor

Replace Title, Summary, and Specification with one proposal-document editor.
Start a new draft with this lightweight template:

```md
# Proposal title

A concise paragraph summarizing the proposal.

## Specification

Describe the proposed decision here.
```

Provide clear Write and Preview modes. Preview and final review use the same
validated AST renderer as proposal detail. Show the current UTF-8 byte count and
the 32 KiB limit. Validation messages name the failed grammar rule. On review
failure, focus the editor and place the caret or selection at the first known
source location; when no source location exists, focus the controlling field or
error summary. If Preview is active, switch to Write, wait for the textarea to
mount, then focus, place the UTF-16 caret, and scroll the control into view.

Forum discussion, proposal type, and executable script stay separate protocol
controls. Preserve signal/executable behavior, script checks, proposer
eligibility, immutable publication versus onchain creation, review locking,
publication failure, wallet rejection/revert retry, live-region messages, and
post-publication/post-submission focus behavior from WP6/WP7A.

The route still has one H1. On proposal detail, the parsed Markdown title is the
route H1 and the renderer omits the source H1 node. In authoring, the preview is
nested under the `Create proposal` route H1, so the same renderer maps the
proposal title and later headings into the correct subordinate semantic levels.
The parsed summary renders once. Heading text, tables, code, and long links stay
inside their content region at 390x844, 768x1024, 1280x900, 1280x600, and 200%
root text.

Add a `View Markdown source` disclosure to the immutable-content presentation.
It shows the exact source without executing or reinterpreting it and keeps long
lines inside its own scroll or wrap region.

### 4. Render immutable images as non-loading attachment cards

Do not render a Markdown image as `<img>`, a CSS image, a preload, a metadata
probe, or any other automatic request. A valid image AST node becomes an
attachment card. No image or attachment bytes may be requested until the user
chooses Open attachment.

Accept image targets only when they are:

- an immutable `ipfs://<assetCid>` reference containing one exact canonical
  CIDv1/raw/SHA-256/Base32 CID and no path, slash, query, or fragment; or
- a canonical relative `./assets/...` reference.

Every accepted image target resolves to exactly one asset-manifest entry so the
card has verified media type, byte length, digest, and dimension facts. A
relative target is an exact logical manifest lookup. It never resolves as a
path below the proposal content CID. Derive the asset's canonical raw CID from
the matching digest. A direct CID must match exactly one manifest digest.
Reject arbitrary remote `https:` image targets, missing or duplicate assets,
duplicate manifest digests, invalid or noncanonical CIDs, direct CID paths,
empty or whitespace-only alt text, malformed metadata, digest/byte/dimension
inconsistencies in fixture vectors, absolute filesystem paths, backslashes,
empty path segments, query-based aliases, and `.` or `..` traversal. Apply
traversal checks after percent decoding and reject encoded separators or
traversal at any decoding depth.

An attachment token is accepted only as the sole child of its own top-level
paragraph after the summary. Reject image syntax in the title, summary,
headings, links, emphasis, mixed inline content, quotes, lists, tables, and all
other nested contexts. This keeps the card at one standalone block position and
prevents an attachment action from becoming a child of another interactive
element.

Each card shows the Markdown alt text as its title, media type, formatted byte
size, Open attachment, and Copy immutable link. One domain helper resolves both
direct IPFS and relative manifest attachments to
`https://ipfs.io/ipfs/<assetCid>` with no suffix. Open and Copy use that
resolved URL; Copy never returns the raw relative path. Opening uses an isolated
new window with no opener.

SVG is a downloadable/openable immutable attachment in WP7B. Do not render it
inline, sanitize it, rasterize it, inspect its remote contents, or add an SVG
code path. Use deterministic local fixture bytes and pre-pinned `ipfs://`
references for M2 evidence. Real upload, byte packaging, CID computation,
multi-provider pinning, credentials, retention, and recovery belong to M5 WP13.

### 5. Decode post-create identity from the confirmed receipt

Model distinct submission states: transaction hash known, receipt pending,
confirmed `Propose` event decoded, proposal awaiting indexing, and the same
proposal indexed/enriched.

- Show View transaction as soon as a transaction hash exists.
- Do not create a proposal URL or numeric ID from a local counter, array length,
  request input, or transaction submission alone.
- Decode the numeric proposal index and the canonical `DaoProposalRef` from one
  matching confirmed `Propose` receipt log. Bind it to chain ID and the expected
  Voting address. Missing, duplicate, malformed, reverted, or wrong-contract
  logs fail explicitly and expose no proposal link.
- A matching log has exactly four canonical topics: selector, proposal index,
  proposer, and voting epoch. After strict decoding, canonically re-encode all
  four topics and the non-indexed content digest and script. Every byte must
  match the receipt. Reject extra topics, dirty indexed padding, trailing ABI
  words, alternate dynamic offsets, and nonzero dynamic padding as malformed.
- Once identity is decoded, show primary Open proposal, secondary Copy link,
  and View transaction actions. Open and Copy use existing host-aware DAO path
  helpers for shared `/dao`, `dao-beta.dao-ops.com`, and the reserved production
  host. Copy writes an absolute URL.
- Add a deterministic mock receipt and `Propose` event. Add an awaiting-index
  proposal reachable at the decoded route in the same browser session.
- Keep proposal identity separate from indexing and analysis. The explicit mock
  indexing seam enriches that same serialized proposal reference and route; it
  must not replace it with a fixture carrying another ID.

The beta mock remains browser-local. Same-session creation, navigation, reload
behavior that the local store can truthfully support, and indexing must be
tested. Evidence and beta review controls state the cross-session limitation.
Normal product copy does not mention mocks, fixtures, debug controls, or
delivery stages.

### 6. Separate lifecycle status, vote result, moderation, and execution

Remove ambiguous copy such as `Decision: Flagged`. Keep these concepts separate
in domain facts and presentation:

- Status: Proposed, Voting, Passed, Failed, Executed, Expired, Retracted,
  Flagged, or Vetoed.
- Vote result: Approved or Rejected, only when an actual voting result exists.
- Moderation: Flagged by operator or Vetoed by guardian.
- Execution: executable, executed, blocked, guarded, permissionless, or expired.

Do not change pinned contract status or capability derivation to make the words
fit. In particular, status and action capability remain separate, post-vote
veto may remain votable while the window is open, and an approved signal still
shows Approved with `No executable actions` rather than implying calls ran.

For Flagged, state that the operator marked the proposal invalid before votes
were recorded, that this is moderation rather than a community result, and show
the recorded reason. Do not show Approved or Rejected merely because the status
is Flagged.

For Vetoed, identify the guardian action and reason. Use typed facts to explain
whether it happened before participation or after votes existed, whether the
voting window is still open, and that execution is blocked. Early veto blocks
voting and removes participation accounting. Post-participation veto blocks
approval and execution but leaves Yea/Nay participation voting available only
while the contract window remains open.

### 7. Show canonical event time and transaction provenance

Add nullable canonical block timestamp and transaction availability to the
typed log/event reference without weakening canonical block, block-hash,
transaction-index, or log-index identity. The producer or mock domain supplies
the event block time. Components do not substitute browser time, content
`createdAt`, proposal schedule time, feed generation time, or the current
canonical feed block time.

For Propose, Retract, Flag, Veto, Vote, and Execute wherever the event is
presented, use a primary pattern equivalent to:

```text
Vetoed 18 Aug 2026, 12:04 UTC · View transaction
```

Use the event verb that matches the action. Place the shared transaction link
beside the event time. If the timestamp is absent, say `Time unavailable`; if
the transaction is absent, omit the link and say `Transaction unavailable` in
the event details. Never synthesize either value. Keep block number, block
hash, transaction index, and log index in Technical details.

Reuse shared explorer, copy, UTC formatting, focus, coarse-pointer, and
host/network helpers. Links and buttons keep visible focus and at least 40px
targets, with 44px used where practical. Proposal rules and verified-source
controls include their `0.96` press scale in an explicit property-specific
transition; reduced motion removes the transition and press scale.

### 8. Replace ABI strings with structured verified sources

Replace `abiSource: string | null` with structured provenance equivalent to:

```ts
type DaoVerifiedSource = {
  kind: "github" | "sourcify" | "explorer";
  label: string;
  url: string;
  revision: string | null;
};
```

The domain/producer supplies and validates the complete HTTPS URL. The UI labels
it `Verified source`; it must not turn an arbitrary string, address, path, or
revision into a URL. External links use safe no-opener behavior. Keep target
address, registry version, source revision, source path, and other raw
provenance in Technical details.

The pinned Voting fixture uses:

- kind: `github`
- revision: `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`
- URL:
  `https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy`

Future producer records may use GitHub, Sourcify, or a chain explorer only when
that service is the actual verification authority. Preserve partial decoding,
failed decoding, and unknown-call presentation. An unknown call has no verified
source link.

### 9. Make Proposal rules compact and data-driven

Replace generic hardcoded rule paragraphs with proposal-specific typed facts in
a Proposal rules disclosure that is collapsed by default. The domain supplies,
when applicable:

- approval threshold as a percentage of votes cast;
- that the threshold was snapshotted at proposal creation;
- minimum turnout `none`, plus the separate fact that passage requires at least
  one non-zero vote;
- Signal or Executable proposal type;
- voting period;
- execution delay;
- guarded or permissionless execution; and
- the exact Voting contract address and pinned/deployed source version that
  owns those facts.

The UI formats these supplied facts but owns no threshold, timing, guard, or
pass/fail math. Rules bind to the complete proposal reference, not the numeric
ID alone.

The pinned `Voting.vy` constructor starts the global threshold at 5,000 basis
points, or 50%. Management can change the global value. `propose` snapshots the
then-current threshold into the proposal, and `_passed` requires non-zero votes
plus the proposal's snapshotted Yea fraction. Change the normal mock default
from 5,500 to 5,000 basis points. Keep an explicit 6,000-basis-point fixture to
prove that the UI reads proposal data.

Do not claim a live deployed threshold without a read from the deployed Voting
contract at a stated block. M3 and later feed/live packages must carry each
proposal snapshot rather than inherit a fixture constant.

### 10. Expand deterministic fixtures and debug reachability

Update all existing proposals and authoring services to the new content,
source, log, receipt, and rule types. Every state remains reachable through the
shared DAO test bridge or a typed fixture; do not add a route-local scenario
switcher.

Add or retain deterministic coverage for:

- valid Markdown, long valid Markdown, invalid structure, missing H1, duplicate
  H1, missing summary, empty body, oversized UTF-8, raw HTML, safe links, and
  unsafe links;
- valid IPFS attachment, valid relative manifest attachment, missing attachment,
  invalid CID, encoded and plain traversal, rejected remote image, empty alt
  text, duplicate paths, and inconsistent asset metadata;
- unavailable content, invalid content digest, analysis pending, partial
  decoding, simulation failure, script hash mismatch, and direct-contract
  proposal;
- Proposed, Voting, Passed, Failed, Retracted, Flagged with reason, early Veto,
  post-participation Veto, Executed, Expired, and approved Signal states;
- default and alternate thresholds, Signal and Executable rules, guarded and
  permissionless execution;
- submitted transaction before receipt, receipt without a decodable identity,
  submitted proposal awaiting indexing, and the same created proposal after
  indexing; and
- timestamp unavailable, transaction unavailable, and exact verified-source
  link states.

Preserve all accepted voting, action, authoring, filtering, navigation,
responsive, accessibility, beta-host, feature-flag, fail-closed, dead-RPC,
content-failure, and cross-domain guarantees from WP4 through WP7A.

### 11. Tests and evidence

Add a failing regression before each substantive behavior fix. Do not weaken an
existing assertion to make the package pass. Reproduce and classify failures
before changing a test.

Unit and domain tests cover parser determinism, title/summary derivation,
Unicode graphemes, UTF-8 bytes, grammar errors and precedence, raw HTML, node
allowlisting, URL schemes, attachment resolution, manifest bounds, CID and
traversal rules, exact source preservation, digest vectors, structured sources,
event time provenance, proposal-rule facts, 5,000/6,000 threshold snapshots,
receipt decoding, canonical proposal reference creation, and identity-preserving
indexing.

Component tests cover Write/Preview parity, one-H1 detail semantics, Markdown
accessibility, contained tables/code/links, attachment cards, zero automatic
attachment requests at the component boundary where practical, Open/Copy
controls, exact-source disclosure, post-submit focus and live-region behavior,
Flagged/Veto explanations, event time and transaction links, verified-source
links, truthful fallbacks, and collapsed Proposal rules.

Playwright covers Markdown authoring through review and publication, Signal and
Executable flows, immediate View transaction, delayed Open proposal and Copy
link, absolute host-aware URLs, submitted to awaiting-index to indexed identity,
no attachment request before Open, keyboard and focus behavior, reduced motion,
coarse pointer, light/dark themes, 200% root text, no document overflow, long
headings/links/tables/code, lifecycle event provenance, Flagged/Veto semantics,
default/alternate rules, exact source link, beta-host navigation, DAO flag-on,
DAO flag-off, dead-loopback RPC, and cross-domain smoke.

Create `docs/apps/dao/delivery/evidence/M2-WP7B/README.md` during implementation.
Capture fresh production-compiled screenshots for the changed authoring,
attachment, post-create, lifecycle, source, and rules states. Use 390x844,
768x1024, 1280x900, and 1280x600 across light and dark themes. Record exact
route, fixture, runtime, viewport, theme, focus, reduced-motion, text-scale,
request-count, and overflow metadata. Development screenshots are not accepted.

### 12. Documentation and later-milestone handoffs

Update behavior and rationale in the same implementation package:

- `docs/apps/dao/README.md`
- `docs/apps/dao/contract-reference.md`
- `docs/apps/dao/functional-requirements.md`
- `docs/apps/dao/user-stories.md`
- `docs/apps/dao/ui-spec.md`
- `docs/apps/dao/mock-data.md`
- `docs/apps/dao/examples/proposal-content.example.json`
- `docs/apps/dao/examples/mock-data.example.json`
- `docs/apps/dao/delivery/README.md` and dependency graph
- this work package and `docs/apps/dao/delivery/evidence/M2-WP7B/README.md`
- `docs/apps/dao/delivery/status.md` in the post-merge ledger commit
- `docs/apps/dao/delivery/work-packages/M3-WP8-feed-schema.md`
- `docs/apps/dao/delivery/work-packages/M5-WP13-forum-and-ipfs.md`
- `docs/shared/testing.md`, `docs/shared/security-hardening.md`, and other shared
  testing/security text only where the behavior or dependency policy changes

Explain why the content contract changed in place, why there is no compatibility
parser, the exact grammar and limits, derived title/summary, raw-HTML rejection,
attachment cards, zero automatic image loading, the SVG boundary, the M2
pre-pinned asset boundary, the M5 upload/CID/pinning owner, exact-source byte
preservation, mock cross-session limits, constructor threshold versus mutable
deployed state, event-time ownership, source-provenance ownership, and
receipt-derived proposal identity.

M3 WP8 must consume the exact Markdown source, asset manifest, content
validation vectors, structured source provenance, canonical event timestamps,
proposal-rule snapshots, and receipt-derived composite identity. M5 WP13 must
replace only the mock publication boundary with Add image, package exact bytes,
compute and round-trip CID/digest, and multi-pin/retention work. It must not add
a second content schema or parser.

The integrator records the reviewed package range, merge commit, final checks,
evidence, accepted limits, and later owners in `delivery/status.md` in the
separate post-merge ledger commit required by the delivery workflow.

## Non-goals

- No M3 feed schema implementation, `gov-apps-stats` producer, backend,
  production feed, browser history log scan, or live indexing.
- No real forum validation, IPFS upload, asset byte packaging, CID creation,
  provider credentials, pinning, retention, or recovery. Those remain M5 WP13.
- No raw wagmi write, live proposal receipt, production onchain read/write,
  execution change, fork work, or contract deployment.
- No compatibility parser, v2 content object, parallel renderer, inline image,
  image proxy, automatic image request, SVG sanitization, or SVG rasterization.
- No generic rich-text editor, WYSIWYG dependency, ABI builder, semantic script
  decode in the browser, or design-system rewrite.
- No shared persistence, server database, fake cross-browser beta state, or
  claim that a browser-local mock survives another session.
- No DAO production rollout, canonical-host promotion, sitemap/discoverability
  change, GitHub/Cloudflare/DNS mutation, deployment, push, tag, or worktree
  cleanup.
- No change to pinned governance math or capability derivation except the
  corrected 5,000-basis-point normal fixture default and typed presentation of
  proposal-owned facts.

## Acceptance criteria

- One `DaoProposalContent` wire contract, one parser/validator, and one AST
  renderer serve every accepted surface; no legacy production path remains.
- Exact reviewed Markdown bytes survive authoring, publication, digest vectors,
  route rendering, and source disclosure unchanged.
- All grammar, Unicode, byte, link, HTML, asset, CID, and traversal rules fail
  closed with stable, located errors.
- Authoring has one Write/Preview editor, specific errors, byte count, correct
  focus, one-H1 semantics, and parity with detail rendering.
- Attachment syntax produces informative cards and zero automatic requests;
  Open and Copy resolve immutable absolute URLs and SVG never renders inline.
- A transaction link appears before proposal identity; proposal actions appear
  only after a confirmed event supplies the composite reference; indexing keeps
  that identity.
- Status, vote result, moderation, and execution no longer share ambiguous
  labels. Flagged and both Veto branches match the pinned contract.
- User-facing lifecycle events use canonical block time and transaction links,
  with truthful missing-data fallbacks and full raw provenance in Technical
  details.
- Verified decoding links use structured, validated HTTPS provenance and the
  exact pinned `Voting.vy` source. Unknown calls remain unknown.
- Proposal rules are collapsed, proposal-specific, tied to Voting identity,
  and supplied by the domain. Normal fixtures show 50%; the alternate fixture
  shows 60% without UI-owned math.
- The complete fixture matrix, focused regressions, full repository gates,
  production proofs, screenshots, canonical docs, evidence ledger, and M3/M5
  handoffs are present and consistent.
- All required reviewers approve the same clean final package tip and complete
  frozen-base range before integration.

## Exact validation commands

Run focused checks while implementing, then run every command below on the
frozen final package tip and again after the no-fast-forward integration where
applicable.

```fish
npm run validate:deps

npx vitest run \
  tests/unit/lib/clients/dao.content.test.ts \
  tests/unit/app/dao/propose/authoring.test.ts \
  tests/unit/lib/clients/dao.domain.test.ts \
  tests/unit/lib/clients/dao.mock.test.ts \
  tests/unit/lib/clients/dao.store.test.ts \
  tests/unit/lib/clients/dao.actions.test.ts

npx vitest run \
  tests/components/DaoProposalMarkdown.test.tsx \
  tests/components/DaoProposalAuthoringForm.test.tsx \
  tests/components/DaoProposalDetail.test.tsx \
  tests/components/DaoProposalActionPanel.test.tsx \
  tests/integration/hooks/useDaoProposal.test.tsx \
  tests/integration/hooks/useDaoProposalActions.test.tsx

npx playwright test \
  tests/e2e/smoke/dao-authoring.spec.ts \
  tests/e2e/smoke/dao-shell.spec.ts \
  --project=smoke --workers=1

npx playwright test \
  tests/e2e/full/dao-proposal-read.spec.ts \
  tests/e2e/full/dao-actions.spec.ts \
  tests/e2e/full/dao-mock-uat.spec.ts \
  --project=full --workers=1

node .github/skills/impeccable/scripts/context.mjs --target app/dao
node .github/skills/impeccable/scripts/detect.mjs --json app/dao components/ui
rg -n -i "delve|tapestry|leverage|multifaceted|robust|holistic|utilize|in order to|due to the fact that" \
  app/dao \
  docs/apps/dao/README.md \
  docs/apps/dao/contract-reference.md \
  docs/apps/dao/functional-requirements.md \
  docs/apps/dao/user-stories.md \
  docs/apps/dao/ui-spec.md \
  docs/apps/dao/mock-data.md
git diff --check 4588a9806dd7002e3f5a1bb26bb098a1f7bf91d9..HEAD

npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run test:e2e:full -- --workers=1
npm run build
```

Build and run the production proof twice with the approved WP7A production
environment inputs. The DAO=true build must hydrate root, authoring, pending
created proposal, indexed proposal, and detail routes; keep global mocks, E2E,
and global debug off; preserve beta noindex/noncanonical behavior; and emit no
dead-loopback `eth_accounts` request or console error. The DAO=false build must
return 404 for DAO root, authoring, and detail GET/HEAD requests. Record the
exact build SHA, environment booleans, start/probe commands, ports, responses,
console/network results, and screenshots in the WP7B evidence ledger.

The full smoke run supplies cross-domain coverage. Record any skipped or failed
check with its reason; never report an unrun check as passing.

## Review and integration

Before implementation, run three read-only audits in parallel where slots
permit:

1. A Markdown/content-security and dependency auditor approves the parser,
   extensions, manifest bounds, URL/CID/path rules, byte preservation, raw-HTML
   block, rendering configuration, no-load attachments, and supply-chain diff.
2. A governance contract/provenance/rules auditor checks the exact pinned
   `Voting.vy` source, 5,000-basis-point constructor default, mutable global and
   proposal snapshot rules, status/capability split, Veto branches, receipt
   identity, event time, and verified-source facts.
3. A frontend/accessibility interaction auditor checks the proposed editor,
   shared renderer, one-H1 mapping, attachment cards, lifecycle hierarchy,
   post-create actions, focus/live regions, copy, containment, themes, reduced
   motion, coarse pointer, and target sizes.

Implement in dependency order: content type/parser/fixtures, shared
authoring/detail renderer and attachments, receipt/ref/index seam, then
lifecycle/provenance/source/rules presentation. Keep documentation and tests
with each behavior change.

After a clean committed tip, independent versions of the same three roles
review the complete
`4588a9806dd7002e3f5a1bb26bb098a1f7bf91d9..FINAL_TIP` range read-only. Each
verifies branch, exact base, merge-base, HEAD, clean status, diff, focused tests,
and evidence, then returns explicit `APPROVE` or `REQUEST CHANGES`. A dedicated
fixer reproduces accepted blockers, adds red regressions, makes only scoped
fixes, and commits separately. Every affected reviewer then rechecks the full
final range, not only the fix commit.

A separate integrator may merge only the exact approved clean tip into
`agent/integration` with `--no-ff`. The integrator confirms frozen-base ancestry,
review SHAs, dependency order, docs, tests, and evidence; preserves hooks; runs
the post-merge gates; and records the result in a separate ledger commit. Use
the documented one-command no-sign fallback only if the configured signer fails
before creating the merge commit. Stop on any product, protocol, security, or
non-mechanical conflict. Do not tag, push, deploy, mutate remote services, or
remove worktrees.

## Product gate and stop condition

After integration, present the revised assembled mock UX, stable evidence,
exact package/merge/ledger commits, validation results, manifest bounds,
dependency decision, browser-local limitations, beta redeployment steps if the
compiled code changed, and a focused WP7B UAT checklist.

The M2 product gate remains explicitly unaccepted until the user says `accept`.
Do not tag M2 or begin M3, backend feeds, real forum validation, real IPFS
publication/pinning, production onchain reads or writes, fork work, or M7
rollout before that explicit acceptance.
