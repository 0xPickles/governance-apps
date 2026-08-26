# DAO Feed Schema v1

This document freezes the consumer-owned `yearn.dao.feed.v1` contract. The
producer must emit this contract as one atomic JSON document. The browser must
admit the fetched text through the 64 MiB check in `parseDaoFeedJsonV1` before
JSON parsing or deep schema traversal. In-memory fixtures use
`parseDaoFeedV1`. Consumers must not trust a TypeScript cast or JSON Schema
validation alone.

## Artifacts

- JSON Schema: [`feed-schema-v1.schema.json`](feed-schema-v1.schema.json)
- TypeScript/Zod and semantic boundary:
  [`lib/schemas/dao-feed.ts`](../../../lib/schemas/dao-feed.ts)
- Accepted feed: [`examples/feed-v1/dao-feed-v1.example.json`](examples/feed-v1/dao-feed-v1.example.json)
- Receipt/index stages:
  [`examples/feed-v1/dao-creation-stages-v1.example.json`](examples/feed-v1/dao-creation-stages-v1.example.json)
- Mock-state map:
  [`examples/feed-v1/dao-mock-state-map-v1.example.json`](examples/feed-v1/dao-mock-state-map-v1.example.json)
- Rejection vectors:
  [`examples/feed-v1/dao-feed-v1.rejections.json`](examples/feed-v1/dao-feed-v1.rejections.json)
- Executable fixture builder:
  [`tests/fixtures/dao-feed-v1.ts`](../../../tests/fixtures/dao-feed-v1.ts)
- Deterministic artifact generator:
  [`scripts/generate-dao-feed-v1.mjs`](../../../scripts/generate-dao-feed-v1.mjs)

The schema ID is
`https://dao.yearn.fi/schemas/yearn.dao.feed.v1.schema.json`; the numeric
version is `1`. Objects are strict. Unknown fields, coercion, uppercase
addresses or hashes, odd hex, noncanonical or overflowing uint256 values, zero
chain/contract/emitter identities, ambiguous URLs, and invalid UTC instants fail
at the boundary. Contract-valid zero configuration addresses, zero Vote
accounts, zero script targets, bytes32 content digests, storage words, and raw
uint topics remain representable through typed states. Non-Vote lifecycle
actors remain nonzero.

## Version policy

Version 1 is immutable after acceptance. A producer may fix its own code without
changing the payload contract. Any field addition, removal, rename, type change,
new discriminant, changed meaning, or weaker bound requires a new numeric
version, schema name, schema ID, examples, rejection vectors, and consumer
review. Producers must not add optional fields to v1. Consumers must not guess a
newer version from payload shape.

## Publication

Each document is an `atomic_snapshot` with one canonical block and one cursor.
The cursor records chain ID, configured start block, last block number and hash,
and the next block. The last block equals the root canonical block; the next
block is exactly one higher. Its start is exactly the earliest configured
contract start and cannot skip historical admission. Publication requires eight
confirmations, and the claimed count equals `head - canonical`.

The producer uses one writer. It writes a local temporary file and renames it,
then writes and validates an immutable audit object, and writes the stable R2
object last. It keeps the last good stable object if any step fails. Immutable
audit snapshots, event scripts, canonical content JSON, exact invalid raw
content bytes, and asset records have indefinite retention in v1. The schema
records clean and recovered reorg states,
the common ancestor and replay point, bounded publication retries, record
counts, and the replaced last-good snapshot.

`generatedAt` and `publication.publishedAt` are the same instant. That instant
cannot precede the canonical block or confirmation-head timestamp. Content and
asset retries use exactly eight attempts and a fixed 120-second backoff. A
scheduled retry is exactly `lastAttemptAt + 120 seconds`, follows the snapshot,
and binds the failure `observedAt` to the last attempt. A successful publication
retry includes a retryable preceding failure exactly 120 seconds earlier. A
recovered reorg replays from exactly one block after the common ancestor.

## Chain and proposal identity

A proposal key is the tuple `(chainId, votingAddress, proposalId)`. Numeric IDs
alone are invalid. Contract generations are positive, ordered, contiguous, and
bound to unique Voting addresses. A retired generation points to the next
generation. Each generation records its deployment block and hash, deployed
bytecode hash, producer start block, fixed genesis timestamp, the pinned
`1,209,600`-second epoch length, ordered configuration history, and the exact
pinned Voting source. Mutable Voter or Executor changes do not create a new
Voting generation. Configuration evidence cannot predate deployment or start,
follow the canonical snapshot, or move backward in block/transaction/log order.
Events cannot predate that generation's start block.

The root canonical block owns the snapshot time and hash. Events at one height
share one hash and producer-owned timestamp. Transaction hashes remain nullable;
event identity does not use them. The event ID is:

```text
chainId:votingAddress:blockHash:transactionIndex:logIndex
```

Event IDs and log coordinates are globally unique. Events within a proposal are
strictly ordered and their known block times are monotonic. Events in one
transaction group share block, timestamp, and nullable transaction-hash
provenance. The reverse relation is also unique: one non-null transaction hash
maps to one canonical block hash and transaction position. Ethereum `logIndex`
is block-global: `(chainId, blockHash, logIndex)` cannot repeat across
transactions, proposals, or Voting generations, and one block hash maps to one
block number and producer-owned timestamp. A configuration `effectiveAt`
position is an ordered observation boundary, not a claim that a lifecycle log
was emitted there, so it is not enrolled in the lifecycle-log namespace.

## Lifecycle ABI

Every decoded lifecycle event records the Voting emitter, ordered raw topics,
raw data, one matching-log count, and canonical re-encoding result. The semantic
validator re-encodes all six pinned event types. It rejects wrong emitters,
missing or extra topics, dirty address or integer padding, alternate dynamic
offsets, trailing bytes, and nonzero padding.

| Feed event | Pinned event and topic 0 | Topics | Raw data | Actor rule |
| --- | --- | ---: | --- | --- |
| `propose` | `Propose(uint256,address,uint256,bytes32,bytes)`<br>`0x385a5c21b60cb605d8ba2e06eaecca5148598b1c9401ea0e2a5f181d50a53ffd` | signature, ID, proposer, epoch | digest and exact script | emitted proposer |
| `vote` | `Vote(address,uint256,uint256,uint256)`<br>`0x6c7eb2743ec28489909706ea440d909129004996be657d36c6e9add778546abf` | signature, weight-bearing account, ID | absolute weight and Yea bps | emitted account, classified from historical Voter configuration |
| `retract` | `Retract(uint256)`<br>`0xf8f7459e0aa0dfe770104b09822d11939d2c6ae3827597365a9620fb8b566df4` | signature, ID | empty | inferred from proposal proposer |
| `flag` | `Flag(uint256,string)`<br>`0x258a67880aca461bf80e63896ed86b1271300e35d5c9c1c24e7346d60053b4bd` | signature, ID | exact reason | historical transaction sender plus operator role, or unavailable |
| `veto` | `Veto(uint256,string)`<br>`0x4742cd05951e3d1376451e464abec38be686b768a43162033255bc349f677818` | signature, ID | exact reason | historical transaction sender plus guardian role, or unavailable |
| `execute` | `Execute(address,uint256)`<br>`0x892cd8f5b436bd5fb7dac1f11aafb73345d892ba3e9fe09cd94d95ba84928e73` | signature, external caller, ID | empty | emitted external caller |

The Voting `Execute` caller is not the configured Executor contract. The feed
does not add a script hash, target, or calldata to this event. It also does not
confuse it with the Executor contract's per-frame `Execute` event.

An incomplete historical Propose record may retain its emitter and four topics
while marking raw data and exact script unavailable with a provenance failure.
An indexed creation cannot use that state.

Every Veto retains an immutable `early_no_votes` or `post_participation` branch
and the Yea/Nay/total state immediately before that log. The producer derives
those totals from the last absolute contribution per actor at that event
position, not from the final proposal totals. A later aggregate overwrite to
zero cannot rewrite a post-participation branch. A Vote after an early veto is
invalid; a Vote after a post-participation veto remains valid while the voting
window is open. Veto is bounded by the end of the epoch following the voting
epoch.

Voting `Execute` may be retained for executable or empty-script signal
proposals. Each Execute must have canonical time proving its correct following
epoch and the delay effective at the event, positive-total threshold passage at
that position, no earlier terminal action, the event-effective guard/operator,
and exact retained hash-valid script bytes. A passed signal may also advance to
raw `executed` after its following epoch without emitting an Execute event.

## Receipt-derived creation

Indexed creation requires a successful receipt, a known transaction hash, and
exactly one matching Propose log from the proposal's Voting address. Receipt,
event, proposal, content, and script records must agree on transaction, block,
transaction index, proposal ID, proposer, epoch, digest, and exact script. The
consumer re-encodes all four topics and the full ABI data.

`chainCreatedAt` is separate evidence. It is `available` only when the Propose
block timestamp is known and then equals and binds that exact event position.
When the log timestamp is absent it is explicitly `unavailable`; the producer
must not substitute immutable content `createdAt` or any other numeric guess.
The receipt block timestamp follows the same evidence.

The separate creation-stage example keeps the same composite ref and receipt
identity through `receipt_confirmed`, `awaiting_index`, and `indexed`. Only the
last stage may name the published snapshot. Reverted, missing, duplicate,
wrong-contract, malformed, or noncanonical logs produce no accepted identity.

## Rules and lifecycle

Only `approvalThresholdBps` is a proposal snapshot. The normal and alternate
vectors retain 5,000 and 6,000 bps. Passage requires a positive vote total and
has no minimum turnout.

Vote-start offset, vote duration, execution delay and guard, Voter,
delegated-staking, YBC and YBC-weight-aggregator addresses, Executor, hook,
weight measure, operator, and guardian are ordered historical observations.
Each configuration has a stable ID and exact block/hash/transaction/log
position. Proposal rules copy and bind the configuration effective at Propose;
that record is historical disclosure and remains the simulation Executor pin.
Each Vote is admitted against the timing and configuration effective at its own
event position. Execute delay, guard, and operator checks bind the configuration
effective at Execute. `statusConfiguration` binds the last configuration
effective at the end of the canonical block; top-level timing and raw status use
that snapshot-effective configuration. Copied observations retain the same
block hash as their history record. The feed never relabels a proposal-time
value as snapshot-current truth.

For voting epoch `E`, generation genesis `G`, fixed epoch length `L`, and the
snapshot-effective raw offset `O`, `voteStartsAt = G + E*L + O` and
`voteEndsAt = voteStartsAt + votingPeriodSeconds`. A Vote at position `P` uses
the same formula with the configuration effective at `P` and requires
`voteStart(P) <= eventTimestamp < voteEnd(P)`. Known chain creation must be in
epoch `E-1`. The raw offset plus voting window must equal `L`; the disabling
state `votingPeriodSeconds = 0` and `voteStartOffsetSeconds = L` is valid and has
no admissible Vote instant. The snapshot-effective executable window begins at
`G + (E+1)*L + executionDelaySeconds` and ends at `G + (E+2)*L`; an observed
Execute is rechecked with its event-effective delay. A passed signal remains raw
`passed` for that entire following fixed epoch and auto-reports raw `executed`
only afterward.

Typed address states preserve every pinned contract-valid disabling value.
Voter may be `disabled_zero_address`; delegated staking, YBC, YBC weight
aggregator, hook, weight measure, and operator may be `zero_address`; the
constructor's zero Executor is `uninitialized_zero_address`. The effective
guardian and all Voting/emitter identities stay nonzero. These states are not
capability guesses: zero Voter or weight measure disables Vote, a zero hook
rejects positive-weight Vote, and a zero YBC atomically reverts a pinned-Voter
submission. A zero operator blocks Flag and guarded Execute but does not block
permissionless Execute.

Signal proposals keep the fixed empty-script hash and, when bytes are available,
the exact empty script. A passed signal may have raw protocol status `executed`
without a Voting Execute event; its display status remains `approved`.

## Votes and actors

Human votes carry binary Yea or Nay direction. Delegated-staking and YBC events
always keep `direction: null`, including 0 and 10,000 bps. Their weight is an
absolute actor contribution, not an increment. Totals use the last event for
each human or aggregate actor. Aggregate rewrites do not increase the human
participation count.

Each configuration records the effective Voter implementation as one of
`verified_pinned`, `disabled_zero_address`, or `unverified`. A pinned proof binds
`contracts/governance/Voter.vy` at revision
`9395d5e6fffdfe21fda32af94d32fca1a4f7840b`, source SHA-256
`0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab`,
`vyper@0.4.2` with gas optimization and Cancun, its immutable genesis, a
reproducible build artifact, and archive `eth_getCode` length/hash at the
configuration position.

Each classified Vote records that effective Voter proof, delegated-staking,
YBC, and YBC-weight-aggregator configuration, plus a transaction-bound call
trace, call depths, call ordinal, emitted account, membership, and aggregate
path. The trace resolves address collisions and permits the pinned Voter's
contract-valid zero delegated aggregate account. An arbitrary or unverified
Voter remains `unclassified`; it preserves raw account, weight, and Yea bps but
cannot claim binary-human or aggregate semantics. Flag and veto actor evidence
must join the historical transaction sender to the role configuration effective
at that log. If the producer cannot prove both, it emits strict unavailable
evidence and never uses current roles as a guess.

## Content and assets

Content always names the expected onchain SHA-256 digest and its raw CID.
Fetched states separately retain the digest and CID computed from the exact
bytes and a `verified` or `mismatch` comparison. Unavailable content has no
computed identity. This makes digest-invalid fetched bytes representable with
the explicit `CONTENT_DIGEST_MISMATCH` failure instead of replacing the
onchain identity with a reserialized guess.

Available content retains the fetched canonical JSON byte-for-byte, including
exactly one final LF, and requires expected and computed identities to agree.
Consumers do not reserialize a parsed object to choose its digest;
reserialization in the semantic validator only checks the frozen field order.
Invalid fetched content instead retains exact arbitrary bytes as canonical RFC
4648 Base64 plus byte length. It may lack a final LF, contain malformed JSON,
NUL, or invalid UTF-8. Digest and CID are computed over those decoded bytes, and
the record preserves expected versus computed evidence; canonical JSON rules
apply only to `available`. Immutable content `createdAt` is independently
authenticated content data. It may precede chain creation and, when chain time
is known, cannot follow it; it is never a substitute for missing block time.

The content parser enforces the WP7B limits: 32,768 Markdown UTF-8 bytes, 16
assets, 512 UTF-8 path bytes, 127 UTF-8 media-type bytes, 2,097,152 bytes per
asset, 33,554,432 aggregate bytes, 8,192 pixels per image dimension, and
33,554,432 image pixels. Paths and digests are normalized and unique.

Each manifest entry maps to one independent asset record with digest-derived raw
CID and `https://ipfs.io/ipfs/<assetCid>` gateway. Each Markdown attachment also
has an ordered record. Relative attachments use the exact manifest path. Direct
attachments use exactly `ipfs://<assetCid>`, with no path, slash, query, or
fragment. Gateway URLs never gain a suffix. Invalid or unavailable content has
no guessed asset or attachment records.

Content, discussion, and asset availability use strict states and typed failure
sources. Retry records have bounded attempts and exact timestamps. A retry time
exists only for a retryable failure with attempts left.

## Scripts, decoding, and simulation

The feed retains the exact Propose script for the life of the event when it is
available, its stored hash, computed Keccak-256 hash, comparison state, bounded
frame-parser result, and Propose event ID. The stored hash always determines
type: `signal` iff it equals `keccak256(0x)`; every other stored hash is
`executable`, even when the exact Propose bytes are unavailable. Missing bytes,
a stored-hash mismatch, malformed framing, and a structurally valid zero target
remain distinct. Malformed history remains representable; it does not become an
executable script.

Decoded records keep every raw frame in order. Version 1 retains only verified
GitHub sources. Every record binds `kind: github`, repository, exact 40-hex
revision, normalized source path, and the exact derived
`https://github.com/<repository>/blob/<revision>/<sourcePath>` URL. Credentials,
query, fragment, port, controls, backslashes, traversal, noncanonical paths, and
other hosts are rejected. Voting and Voter records further bind their exact
yearn/stYFI paths at the pinned revision.

Verified discussions require canonical `gov.yearn.fi/t/<slug>/<id>` URLs. The
authoritative public category metadata observed on 2026-08-26 fixes root
`5 / Proposals / proposals`; accepted descendants are IDs `9`, `18`, `17`,
`21`, `10`, and `29` with exact root ancestry and ID/name/slug tuples.
Authorization uses IDs and ancestry, never labels. Category `42` is invalid.
Unknown calls keep raw target and calldata but no contract name, signature,
arguments, or verified source. Failed decoding uses a decoder failure. Decode
state does not imply a simulation result.

A completed proposal-time simulation uses `revm@34` and method
`revm_engine_injected_executor_frame_conditional_origin`. It is a disclosed,
conditional proposal-time scenario, not a claim that an unknown future
`Voting.execute` transaction will succeed. It uses the Propose block number,
hash, and timestamp, freezes the authenticated Propose transaction sender as the
hypothetical `tx.origin`, and injects a nested Executor frame at engine level.
That frame uses real Executor code with `CALLER = Voting`, runs the
`operators[Voting]` check, uses zero value and the exact retained script, and
ensures each target sees `CALLER = Executor`. There is no ordinary deployed
harness, top-level caller substitution, or code override. The method records
the frame-injector revision and artifact hash. Its strict gas context records
positive initial Executor-frame gas, canonical effective `GASPRICE`, a synthetic
legacy no-blobs envelope, an exact empty access list, and the Cancun frame-entry
warm set containing origin, Voting, Executor, and precompiles with no prewarmed
storage. The exact block hash binds block gas limit and base fee. A fixed-order
SHA-256 commitment binds those inputs to the block, origin, caller chain, and
injector artifact. If the origin or any frame/gas provenance is missing or
substituted, the simulation is `unavailable`.

Before entering the Executor frame, the method applies one typed
proposal-specific override proving `executed: false -> true`. That proof
includes the exact pinned source, `vyper@0.4.2` source SHA-256, and storage-layout
artifact SHA-256. For the pinned source, `proposals` is mapping slot `17`; Vyper
derives the proposal struct base as
`keccak256(bytes32(17) || bytes32(proposalId))`, and `executed` is full storage
word offset `8`. The proof retains that base and resolved slot, exact zero/one
pre/post words, plus the byte length and Keccak-256 of
`eth_getCode(Voting, proposeBlock)` bound to the proposal block hash and
contract generation. It applies no time override. `succeeded` and `failed` mean
atomic success or revert only for the exact recorded conditional scenario.

The pinned source SHA-256 is
`0x6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e`.
Running
`uvx --from vyper==0.4.2 vyper -f layout -o Voting.layout.json Voting.vy`
against those exact bytes produces the pinned layout-file SHA-256
`0x0f963a37d02adeb6a34fabb98ab37b118031ac9b7380e4ad65ac2765b4b6db26`.

A bare top-level `Executor.execute` call with caller set to Voting is invalid
because it changes `tx.origin`. An ordinary harness is also invalid because it
changes the Executor caller or observable Voting code. If the producer cannot
establish the Propose state, timestamp, hypothetical origin, nested frame,
caller chain, exact script, real code, and typed Voting transition, it emits
`unavailable`, with no partial method or context claims.

## Mock mapping and consumer overlays

The mock-state map names exact status, content, discussion, script, analysis,
simulation, rule, event, moderation, and missing-provenance predicates for all 23
accepted M2 states. `late-voting` and `proposal-capacity-full` are the only
consumer-wallet overlays. They add no wallet eligibility fields to the feed.
Missing scripts and unavailable simulations use explicit states, not absent
optional fields.

## Validation

Run:

```bash
npm run generate:dao-feed
npm run test -- tests/unit/lib/schemas/dao-feed.test.ts
npm run typecheck
npm run lint
npm run test
```

The focused suite parses the accepted examples, checks JSON Schema/Zod parity,
runs every rejection vector, and tests cross-record, cryptographic, ABI,
timestamp, source, bound, retry, reorg, cursor, and publication invariants.

## Producer assumptions still open

WP8 does not claim that live production is ready. WP9 must resolve and report:

- archive RPC access;
- exact live Voting generation addresses, deployment blocks, and producer start
  blocks, genesis timestamp, deployed bytecode hashes, and configuration
  histories;
- historical Voter, delegated-staking, YBC, YBC aggregator, Executor, vote
  timing, execution delay/guard, hook, weight measure, operator, and guardian
  configuration at each relevant log;
- the stable and immutable R2 object keys, cursor-state key, and local state-file
  paths, while keeping the publication order fixed above;
- bounded raw content and asset fetch policy details within the v1 maxima; and
- producer support for DAO event ABIs, nullable transaction hashes, reverse
  transaction identity, block hashes, transaction indices, CID and blob
  handling, pinned Voter reproducible-code and call-trace evidence, and the
  pinned layout/bytecode/frame proof for the conditional REVM transition.

Those are producer tasks and assumptions. WP8 adds no producer code and no
frontend feed-backed reads.
