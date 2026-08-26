# DAO Feed Schema v1

This document freezes the consumer-owned `yearn.dao.feed.v1` contract. The
producer must emit this contract as one atomic JSON document. The browser must
parse the document through `parseDaoFeedV1`; it must not trust a TypeScript cast
or JSON Schema validation alone.

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

The schema ID is
`https://dao.yearn.fi/schemas/yearn.dao.feed.v1.schema.json`; the numeric
version is `1`. Objects are strict. Unknown fields, coercion, uppercase
addresses or hashes, odd hex, noncanonical unsigned integers, and invalid UTC
instants fail at the boundary.

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
block is exactly one higher. Publication requires eight confirmations, and the
claimed count equals `head - canonical`.

The producer uses one writer. It writes a local temporary file and renames it,
then writes and validates an immutable audit object, and writes the stable R2
object last. It keeps the last good stable object if any step fails. Immutable
audit snapshots, event scripts, canonical content JSON, and asset records have
indefinite retention in v1. The schema records clean and recovered reorg states,
the common ancestor and replay point, bounded publication retries, record
counts, and the replaced last-good snapshot.

`generatedAt` and `publication.publishedAt` are the same instant. That instant
cannot precede the canonical block or confirmation-head timestamp. A published
retry includes its preceding publication failure and time. A recovered reorg
replays from exactly one block after the common ancestor.

## Chain and proposal identity

A proposal key is the tuple `(chainId, votingAddress, proposalId)`. Numeric IDs
alone are invalid. Contract generations are positive, ordered, contiguous, and
bound to unique Voting addresses. A retired generation points to the next
generation. Each generation records its deployment block, producer start block,
Voter, Executor, and the pinned Voting source. Events cannot predate that
generation's start block.

The root canonical block owns the snapshot time and hash. Events at one height
share one hash and producer-owned timestamp. Transaction hashes remain nullable;
event identity does not use them. The event ID is:

```text
chainId:votingAddress:blockHash:transactionIndex:logIndex
```

Event IDs and log coordinates are globally unique. Events within a proposal are
strictly ordered. Events in one transaction group share block, timestamp, and
nullable transaction-hash provenance.

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

## Receipt-derived creation

Indexed creation requires a successful receipt, a known transaction hash, and
exactly one matching Propose log from the proposal's Voting address. Receipt,
event, proposal, content, and script records must agree on transaction, block,
transaction index, proposal ID, proposer, epoch, digest, and exact script. The
consumer re-encodes all four topics and the full ABI data.

The separate creation-stage example keeps the same composite ref and receipt
identity through `receipt_confirmed`, `awaiting_index`, and `indexed`. Only the
last stage may name the published snapshot. Reverted, missing, duplicate,
wrong-contract, malformed, or noncanonical logs produce no accepted identity.

## Rules and lifecycle

Only `approvalThresholdBps` is a proposal snapshot. The normal and alternate
vectors retain 5,000 and 6,000 bps. Passage requires a positive vote total and
has no minimum turnout.

Vote start, vote duration, execution delay and guard, Voter, Executor, hook,
operator, and guardian are mutable observations. They include block number,
block hash, transaction index, and log index, use `effective_at_propose_event`
ordering, and declare that the values are not snapshots. They must match the
proposal timeline and contract generation. The feed does not describe current
configuration as historical truth.

Signal proposals keep the empty script and fixed empty-script hash. A passed
signal may have raw protocol status `executed` without a Voting Execute event;
its display status remains `approved`.

## Votes and actors

Human votes carry binary Yea or Nay direction. Delegated-staking and YBC events
always keep `direction: null`, including 0 and 10,000 bps. Their weight is an
absolute actor contribution, not an increment. Totals use the last event for
each human or aggregate actor. Aggregate rewrites do not increase the human
participation count.

Each vote records the Voter, delegated-staking address, YBC address, and the
configuration observation effective at that log. The indexed account must match
the chosen classification. Flag and veto actor evidence must join the
historical transaction sender to the role configuration effective at that log.
If the producer cannot prove both, it emits the strict unavailable evidence
state and does not use current roles as a guess.

## Content and assets

Available content retains the fetched canonical JSON byte-for-byte, including
exactly one final LF. Its SHA-256 digest must equal the onchain digest. Its CID
must be the CIDv1/raw/SHA-256/Base32 form of that digest. Consumers do not
reserialize an object to choose a digest; reserialization in the semantic
validator only checks that an available payload used the frozen field order.

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

The feed retains the exact Propose script for the life of the event, its stored
hash, computed Keccak-256 hash, comparison state, bounded frame-parser result,
and Propose event ID. Missing bytes, a stored-hash mismatch, malformed framing,
and a structurally valid zero target remain distinct. Malformed history remains
representable; it does not become an executable script.

Decoded records keep every raw frame in order. Verified calls require a complete
HTTPS source with a normalized repository-relative path. Unknown calls keep raw
target and calldata but have no contract name, signature, arguments, or verified
source. Failed decoding uses a decoder failure. Decode state does not imply a
simulation result.

A completed proposal-time simulation uses `revm@34` and method
`revm_voting_transition_then_executor_execute`. It executes at the Propose block
number, hash, and block timestamp, with the Voting contract as caller, the
generation's Executor, and the exact retained script hash. It applies one typed
override that models Voting setting this proposal's stored `executed` flag to
`true` before the Executor calls, using the pinned Voting source. It applies no
time override. The result is atomic success or atomic revert.

A bare `Executor.execute` call is not execution-equivalent. If the producer
cannot establish the Propose state, timestamp, caller, exact script, and typed
Voting transition, it emits `unavailable`, with no partial method or context
claims. `failed` means the complete equivalent simulation ran and reverted.

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
  blocks;
- historical Voter, delegated-staking, YBC, hook, operator, and guardian
  configuration at each relevant log;
- the stable and immutable R2 object keys, cursor-state key, and local state-file
  paths, while keeping the publication order fixed above;
- bounded raw content and asset fetch policy details within the v1 maxima; and
- producer support for DAO event ABIs, nullable transaction hashes, block hashes,
  transaction indices, CID and blob handling, and the typed REVM transition.

Those are producer tasks and assumptions. WP8 adds no producer code and no
frontend feed-backed reads.
