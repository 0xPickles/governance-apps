# DAO Feed v1 Producer Handoff

This handoff freezes the consumer contract that M3 WP9 must implement in
`gov-apps-stats`. It records facts observed at the producer repository commit
below. It does not authorize producer work, publish a staging feed, or make any
live deployment claim. WP9 must begin only after WP8 is accepted and integrated.

## Repositories

- Producer repository URL: configured Git origin
  `pickles:dao-operations/gov-apps-stats.git`.
  `[UNRESOLVED — the portable canonical HTTPS or SSH URL is not documented; do
  not infer one from the local SSH host alias.]`
- Producer local checkout:
  `/Users/hydra/Developer/dao-operations/gov-apps-stats`, read-only inventory
  performed while clean on `master` at
  `b888c7a9428e229be383a34ee8600cee71d22ea3` (`v0.5.0`, matching
  `origin/master`).
- Producer integration branch and worktree:
  `[UNRESOLVED — not established; this blocks WP9 preflight. Do not infer
  master or create an integration lane without authority.]`
- Producer package branch and worktree: expected package branch
  `agent/dao/m3/wp9`.
  `[UNRESOLVED — its package worktree path cannot be set until the producer
  integration lane and package-worktree workflow are named.]`
- Frontend schema commit SHA:
  `c7bb6eb7268264335bad06c9fd3549f065cbe425`. This is the exact schema and
  fixture implementation commit, not this later handoff-document commit or the
  eventual WP8 integration merge.
- Pinned contract commit SHA:
  `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`.

## Runtime and validation

- Producer language and required runtime: Rust `1.88`, Alloy `1.4`, and REVM
  `34`, as declared by the inventoried producer `Cargo.toml`. The feed must
  report runtime `rust-1.88/alloy-1.4/revm-34`.
- Repository-native install command:
  `[UNRESOLVED — the producer README says to install the Rust toolchain required
  by Cargo.toml but defines no repository-owned install or bootstrap command.
  WP9 must document the exact reproducible toolchain setup before changing
  code.]`
- Repository-native format, lint, unit, integration, and build commands:
  format `cargo fmt --all -- --check`; lint
  `cargo clippy --all-targets --all-features --locked -- -D warnings`; unit
  `cargo test --locked`; build `cargo build --release --locked`.
  `[UNRESOLVED — there is no separate integration-test target or command at the
  inventoried producer commit. WP9 must add or name the archive-RPC fixture and
  staging validation command.]`
- Fixture source and deployment-block identity: use the accepted consumer
  payloads under `docs/apps/dao/examples/feed-v1/` and executable vectors in
  `tests/fixtures/dao-feed-v1.ts`, all at the frontend schema commit above. The
  main fixture uses chain `1`, generation `1`, Voting
  `0x1111111111111111111111111111111111111111`, deployment/start block
  `23900000`, deployment hash
  `0x00000000000000000000000000000000000000000000000000000000016caf60`,
  deployed-bytecode hash
  `0x000000000000000000000000000000000000000000000000000000000001869f`,
  genesis timestamp `1543946400`, fixed epoch length `1209600`,
  and canonical snapshot block `24000000` with hash
  `0x39c219e27639654c0e593394e979a69bbd28433bd8609a522a46d6fb1432cf7d`.
  It contains one contract, two ordered configurations, 27 proposals, 81
  lifecycle events, all 23 accepted M2 mock mappings, and 46 rejection vectors.
  `[UNRESOLVED — an archive RPC and the exact live Voting generation addresses,
  deployment blocks/hashes, deployed-bytecode hashes, genesis timestamps,
  producer start blocks, and ordered configuration history are required before
  live output can be claimed.]`
- Ordered same-Voting configuration vectors:
  - `config-1` is effective at block `23900000`, hash
    `0x00000000000000000000000000000000000000000000000000000000016caf60`,
    transaction/log `0/0`. It uses vote-start offset/window `604800/604800`,
    execution delay `86400`, guard `guarded`, Voter
    `0x2222222222222222222222222222222222222222`, delegated-staking aggregate
    `0x8888888888888888888888888888888888888888`, YBC aggregate
    `0x7777777777777777777777777777777777777777`, Executor
    `0x3333333333333333333333333333333333333333`, hook
    `0x9999999999999999999999999999999999999999`, operator
    `0x5555555555555555555555555555555555555555`, and guardian
    `0x6666666666666666666666666666666666666666`.
  - `config-2` changes those values without changing the Voting generation. It
    is effective at block `23902000`, hash
    `0x00000000000000000000000000000000000000000000000000000000016cb730`,
    transaction/log `0/0`; its offset/window are `604700/604900`, delay
    `172800`, guard `permissionless`, Voter
    `0x8888888888888888888888888888888888888888`, delegated-staking aggregate
    `0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, YBC aggregate
    `0xcccccccccccccccccccccccccccccccccccccccc`, Executor
    `0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, hook
    `0xdddddddddddddddddddddddddddddddddddddddd`, operator
    `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, and guardian
    `0xffffffffffffffffffffffffffffffffffffffff`.
  Configuration IDs, positions, block hashes, and copied proposal/event
  observations must match exactly. The offset plus window equals the fixed
  epoch length. Changes to Voter, Executor, timing, delay, guard, hook, or roles
  never create a new Voting generation.
- CID fixture convention and test-vector location: content and assets use
  CIDv1 with the raw codec, SHA-256 multihash, and lowercase unpadded Base32.
  Proposal `1` in `docs/apps/dao/examples/feed-v1/dao-feed-v1.example.json`
  contains the byte-for-byte canonical JSON with its final LF, digest
  `0x96b2d61caddac83896b4997df04f58acb08cdeb0c7870117f298f534bcc0c668`,
  and CID
  `bafkreiewwllbzlo2za4jnnezpxye6wfmwcgn5mghq4arp4uy6u2lzqggna`.
  Its authenticated content time is `2026-08-18T11:59:00.000Z`, distinct from
  the canonical Propose block time `1787054400`. Proposal `15` is the accepted
  digest-invalid vector: expected digest
  `0x7302a81f54f32e8cafe000b437923b87574bcc2fe6e873b78de86dfbd9484ab2`,
  computed digest
  `0x73c4f1c10c831b63bde5e09019a04d1aa91282200a4b32996a45d78b6dbec6bb`,
  comparison `mismatch`, and failure `CONTENT_DIGEST_MISMATCH`.
  Accepted, boundary, and rejection vectors are in
  `tests/fixtures/dao-feed-v1.ts` and
  `docs/apps/dao/examples/feed-v1/dao-feed-v1.rejections.json`.
- Simulation engine, method, caller/context, and override policy: REVM `34`,
  method `revm_voting_transition_then_executor_execute`, using archive state at
  the proposal's exact Propose block number and hash and that block's timestamp.
  The producer must prove and apply the proposal-specific Voting storage
  transition `executed: false -> true`, derived from the exact pinned Voting
  source before calling the proposal-effective Executor with caller set to the
  Voting contract and the exact retained event script. The source SHA-256 is
  `0x6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e`.
  Compile those bytes with `vyper@0.4.2` using
  `uvx --from vyper==0.4.2 vyper -f layout -o Voting.layout.json Voting.vy`;
  the pinned layout-file SHA-256 is
  `0x0f963a37d02adeb6a34fabb98ab37b118031ac9b7380e4ad65ac2765b4b6db26`.
  The `proposals` mapping base slot is `17`, Vyper hashes
  `bytes32(17) || bytes32(proposalId)`, and the `executed` full-word offset is
  `8`. The proof retains the derived struct base, resolved slot, exact zero/one
  pre/post words, and `keccak256(eth_getCode(Voting, proposeBlock))` plus byte
  length, address, proposal block number/hash, and generation bytecode-hash
  match. Proposal `2` pins struct base
  `0xa4e0f4432e44d027a7b3f953940f096bca7a9bd910297cad2ba7c703c2b799d3`
  and resolved slot
  `0xa4e0f4432e44d027a7b3f953940f096bca7a9bd910297cad2ba7c703c2b799db`.
  The operation is atomic and permits no timestamp override or other state
  override. If the source, layout, archive bytecode, proposal pre-state, or any
  equivalent context element cannot be proved, the entire simulation is
  `unavailable` with no partial method/context claims. `failed` means the
  complete equivalent simulation ran and reverted. A bare direct
  `Executor.execute` call is not equivalent.

## Consumer contract to implement

The producer must emit one strict JSON document accepted by both the structural
and semantic consumer boundary. JSON Schema success alone is insufficient.

| Artifact | Exact location at the frontend schema commit |
| --- | --- |
| Contract and producer rules | `docs/apps/dao/feed-schema-v1.md` |
| JSON Schema | `docs/apps/dao/feed-schema-v1.schema.json` |
| TypeScript/Zod semantic boundary | `lib/schemas/dao-feed.ts` |
| Accepted complete feed | `docs/apps/dao/examples/feed-v1/dao-feed-v1.example.json` |
| Accepted creation stages | `docs/apps/dao/examples/feed-v1/dao-creation-stages-v1.example.json` |
| Accepted mock-state map | `docs/apps/dao/examples/feed-v1/dao-mock-state-map-v1.example.json` |
| Rejection vectors | `docs/apps/dao/examples/feed-v1/dao-feed-v1.rejections.json` |
| Executable fixture builder | `tests/fixtures/dao-feed-v1.ts` |
| Deterministic artifact generator | `scripts/generate-dao-feed-v1.mjs` |
| Focused consumer tests | `tests/unit/lib/schemas/dao-feed.test.ts` |

The immutable identity is:

- schema ID
  `https://dao.yearn.fi/schemas/yearn.dao.feed.v1.schema.json`;
- schema name `yearn.dao.feed.v1`;
- numeric schema version `1`.

Version 1 does not permit producer extensions. Any new field, discriminant,
meaning, bound, or weaker validation rule requires a new schema version and a
new consumer review. Do not make fields optional to bridge implementation gaps;
use the defined failure or unavailable variant.

### Lifecycle event evidence

Every event carries its Voting emitter, ordered topics including topic 0, exact
raw data, decoded fields, `matchingLogCount: 1`, and
`canonicalReencodingMatched: true`. WP9 must re-encode and compare the complete
event. It must reject extra or missing topics, dirty indexed padding, alternate
dynamic offsets, trailing bytes, and nonzero dynamic padding.

| Feed event | Exact pinned event topic 0 | Ordered topics | Raw data |
| --- | --- | --- | --- |
| `propose` | `Propose(uint256,address,uint256,bytes32,bytes)` — `0x385a5c21b60cb605d8ba2e06eaecca5148598b1c9401ea0e2a5f181d50a53ffd` | signature, proposal ID, proposer, epoch | digest and exact script |
| `retract` | `Retract(uint256)` — `0xf8f7459e0aa0dfe770104b09822d11939d2c6ae3827597365a9620fb8b566df4` | signature, proposal ID | `0x` |
| `vote` | `Vote(address,uint256,uint256,uint256)` — `0x6c7eb2743ec28489909706ea440d909129004996be657d36c6e9add778546abf` | signature, account, proposal ID | absolute weight and Yea bps |
| `flag` | `Flag(uint256,string)` — `0x258a67880aca461bf80e63896ed86b1271300e35d5c9c1c24e7346d60053b4bd` | signature, proposal ID | exact historical reason |
| `veto` | `Veto(uint256,string)` — `0x4742cd05951e3d1376451e464abec38be686b768a43162033255bc349f677818` | signature, proposal ID | exact historical reason |
| `execute` | Voting `Execute(address,uint256)` — `0x892cd8f5b436bd5fb7dac1f11aafb73345d892ba3e9fe09cd94d95ba84928e73` | signature, external caller named `executor`, proposal ID | `0x` |

The Voting `Execute` event is distinct from the Executor contract's per-frame
`Execute(address,address,bytes)` event. It contains no script hash, target, or
calldata. Its emitted `executor` is the external caller, not the configured
Executor address.

The event ID is independent of nullable transaction hash:

```text
chainId:votingAddress:blockHash:transactionIndex:logIndex
```

IDs and log coordinates are globally unique. Event order, transaction grouping,
block hash, producer-owned timestamp, proposal reference, and contract
generation must remain coherent. Forward groups use block hash plus transaction
index; the reverse mapping permits each non-null transaction hash at exactly one
block number/hash and transaction index. A null transaction hash is a truthful
value, not permission to substitute identity.

Every Veto has canonical event time, immutable branch
`early_no_votes` or `post_participation`, and running totals computed from the
last absolute write per actor immediately before the Veto. Proposal `13`
demonstrates positive aggregate participation before Veto and a later aggregate
overwrite to final zero without rewriting its `post_participation` branch. A
Vote after an early Veto is invalid; a Vote after the post-participation branch
is valid while the vote window remains open. Veto cannot reach the end of epoch
`E+1`.

Voting `Execute` accepts an executable script or the exact empty signal script.
Each event must prove positive-total threshold passage at its own position, no
prior terminal action, retained hash-valid compatible bytes, and time within
epoch `E+1` after the delay effective at that event. A guarded caller equals the
event-effective operator. Proposal `27` is the explicit empty-script signal
Execute vector; passed signals without an Execute remain raw `passed` for the
entire fixed following epoch and auto-report raw `executed` only afterward.

### Receipt and actor rules

An indexed proposal requires a successful receipt and exactly one matching
Voting `Propose` log. Receipt, log, proposal, content, and script must agree on
transaction, block, transaction index, composite proposal reference, proposer,
epoch, digest, and exact script. Reverted, absent, duplicate, wrong-contract,
and noncanonical Propose evidence is rejected.

`Propose`, `Vote`, and Voting `Execute` take their actors from indexed event
fields. `Retract` infers its actor from the proposal proposer. `Flag` and `Veto`
require historical transaction-sender evidence joined to the operator or
guardian configuration effective at that log; use actor evidence `unavailable`
when that proof is absent. Never use a current role as a historical guess.

Vote classification is also historical. Record the Voter, delegated-staking,
and YBC configuration ID, values, and exact observation position/hash effective
at each Vote log. Historical observations cannot predate deployment or producer
start, follow the canonical block, or disagree with their copied block hash.
Human votes have binary direction. Delegated-staking and YBC aggregate votes
always use `direction: null`, including 0 and 10,000 bps. Aggregate weights
overwrite the actor's absolute contribution; they are not increments and do
not increase human participation.

### Rules, content, scripts, and failures

Only the approval threshold is snapshotted. Preserve both accepted 5,000 and
6,000 bps vectors, the positive-total requirement, and no minimum turnout.
Keep one ordered `configurationHistory` per Voting generation. Vote-start
offset/window, execution delay/guard, Voter, delegated-staking/YBC aggregates,
Executor, hook, operator, and guardian are mutable observations with exact
block/hash and transaction/log ordering. Proposal rules copy the configuration
effective at Propose; Vote and role evidence bind their own event-effective
configuration; Execute delay, guard, and operator bind the Execute position;
simulation uses the proposal-effective Executor. Do not label any of these
values snapshots.

Generation genesis is immutable and `epochLengthSeconds` is exactly `1209600`.
For voting epoch `E`, genesis `G`, and proposal-effective raw vote offset `O`,
`voteStartsAt = G + E*1209600 + O`; the offset plus voting window equals one
epoch, and the canonical Propose block time occurs in epoch `E-1`. Authenticated
content `createdAt` is independent, may be older, and must not follow Propose.
The executable window begins in epoch `E+1` after its effective delay and ends
at `G + (E+2)*1209600`.

Keep onchain Flag and Veto reasons byte-exact. Empty and whitespace-only reasons
are valid through the 256-byte contract bound; the frontend authoring form's
trimmed, nonempty rule does not apply to history. A signal may report raw
`executed` without a Voting Execute event while its consumer display state stays
`approved`.

Content keeps separate expected onchain digest/CID and computed fetched-byte
digest/CID fields plus `verified`, `mismatch`, or `unavailable` comparison.
Fetched canonical JSON remains byte-exact in frozen field order with one final
LF. Available content requires exact identity equality. Digest-invalid bytes
remain representable only with `CONTENT_DIGEST_MISMATCH`; unavailable content
does not guess computed values. Content `createdAt` is immutable content data
and may precede and differ from the canonical Propose block time. Enforce
16 assets, 512 UTF-8 path bytes, 127 UTF-8 media-type bytes, 2,097,152 bytes per
asset, 33,554,432 aggregate bytes, 8,192 pixels per dimension, and 33,554,432
pixels per image. Relative Markdown attachments resolve by exact normalized
manifest path. Direct attachments are exactly `ipfs://<assetCid>` without a
path, slash, query, or fragment. Both gateway URLs are exactly
`https://ipfs.io/ipfs/<assetCid>` with no suffix.

Retain exact Propose script bytes, stored hash, computed Keccak-256 hash, hash
comparison, frame parse result, and Propose event ID. Missing bytes, hash
mismatch, malformed framing, and structurally valid zero targets are separate
states. Decoding preserves frame order and raw calldata. Unknown calls have no
invented source. Verified calls require the complete structured HTTPS source.
Decode and simulation states are independent.

The exact Voting source URL is
`https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy`;
queries, fragments, alternate repositories/revisions/paths, credentials,
backslashes, controls, and noncanonical URL forms fail. Verified discussions
use canonical `https://gov.yearn.fi/t/<slug>/<positiveId>` paths and fixture
category ID/name/slug `42` / `Proposals` / `proposals`. The fixture does not
claim that `42` is the live production category; WP9 must resolve that pin.

Use only the schema's typed failure and evidence unions. Do not publish partial
success shapes, inferred provenance, guessed timestamps, placeholder hashes, or
unbounded strings/arrays. The payload cap is 64 MiB, with at most 64 contract
generations, 100,000 proposals, 100,000 events per proposal, and 64 decoded
calls per proposal. A consumer admits fetched UTF-8 text through
`parseDaoFeedJsonV1`, which checks the 64 MiB byte cap before JSON parsing or
deep structural/semantic traversal. Protocol identities and provenance hashes
are nonzero; contract-valid zero script targets, content/asset digests, raw
storage words, and uint topics remain representable.

## Cursor, retries, reorgs, and publication

Use an archive-capable Ethereum RPC. Select one canonical block and read all
logs, calls, configuration, content provenance, and simulation state against its
declared historical context. Publication requires exactly eight confirmations.

The cursor records chain ID, the earliest configured contract start block, last
block number/hash, and next block. Its start must equal that earliest start and
may never skip it. The last block is the canonical block and next is exactly
last plus one. On a stored-hash mismatch, find the common ancestor and replay
from exactly the following block. Report the replaced snapshot and recovered
reorg evidence.

Content and asset fetches permit at most eight attempts. Snapshot publication
permits at most sixteen. Retry timestamps, last failures, retryability, and
remaining attempts must satisfy the strict schema variants.

Publication order is fixed:

1. Build and semantically validate the complete snapshot before replacing any
   last-good bytes.
2. Write a local temporary file and atomically rename it.
3. Write and validate an immutable audit object containing the same accepted
   bytes.
4. With exactly one writer, PUT the stable R2 object last.
5. If any earlier or final step fails, retain the prior stable last-good object
   and report a typed retry on the next successful publication.

V1 records indefinite retention for immutable audit snapshots, event scripts,
canonical content JSON, and asset records. The established Teams producer flow
is only an architectural precedent; it does not choose the DAO keys or paths.

- Stable R2 object key:
  `[UNRESOLVED — WP9 must name the exact staging and production key; do not
  overload an existing feed key.]`
- Immutable audit-object key layout:
  `[UNRESOLVED — WP9 must name a collision-resistant snapshot key and prove the
  downloaded bytes before stable PUT.]`
- Local stable snapshot, temporary file, and cursor-state paths:
  `[UNRESOLVED — WP9 must name each persistent path and its ownership and
  recovery policy.]`
- Raw content, asset blob, script-history, and metadata object keys:
  `[UNRESOLVED — WP9 must specify exact keys, collision behavior, and how
  indefinite v1 record retention is met.]`
- RPC timeout, content/asset timeout, retry delay/backoff, and maximum fetched
  raw bytes before schema validation:
  `[UNRESOLVED — WP9 must choose bounded values within the v1 attempts and
  payload/asset maxima and add deterministic tests.]`
- Live forum category and provenance policy:
  `[UNRESOLVED — WP9 must pin the live Proposals category ID/slug ancestry and
  public-topic lookup method; fixture category ID 42 is not a deployment
  claim.]`
- Historical configuration and simulation proof acquisition:
  `[UNRESOLVED — WP9 must name the archive calls/log joins that recover genesis,
  every configuration transition, deployed code bytes/hash, and proposal
  storage pre-state without substituting current values. Any unproved complete
  simulation remains unavailable.]`

The inventoried producer has no DAO scanner, CID/blob module, complete nullable
and reverse transaction-hash handling, event block-hash/transaction-index
support, ordered mutable-configuration store, or typed Voting-transition
simulation. Existing YBC/Teams cursor recovery, local temp-and-rename writes,
immutable Teams audit object, and stable R2 PUT are useful precedents, not
evidence that the DAO contract is already feasible.

## Consumer validation commands

At the frozen frontend schema commit, run:

```fish
npm run generate:dao-feed
npm run test -- tests/unit/lib/schemas/dao-feed.test.ts
npm run typecheck
npm run lint
npm run test
git diff --check
```

At schema commit `c7bb6eb7268264335bad06c9fd3549f065cbe425`, the focused
suite passes 53 tests, the full suite passes 1,244 tests in 140 files, and
typecheck, lint, deterministic generation, and `git diff --check` pass.

WP9 must port the accepted and rejected vectors to Rust and demonstrate that
the produced JSON also passes the frozen consumer parser without normalization
or repair.

## Handoff back to the frontend

- Producer reviewed commit range:
  `[UNRESOLVED — WP9 must report the exact accepted base..tip range after all
  producer blockers close.]`
- Producer integration merge SHA:
  `[UNRESOLVED — WP9 must report the no-fast-forward integration merge after an
  authorized producer lane exists.]`
- Staging artifact URL or local fixture path:
  `[UNRESOLVED — WP8 publishes no feed. WP9 must return the exact immutable
  staging URL and stable URL, or a byte-identical local fixture path when live
  credentials are unavailable; label fixture-only evidence explicitly.]`
- Schema version: `1` (`yearn.dao.feed.v1`).
- Known fixture-only gaps deferred to M6:
  `[UNRESOLVED — none are pre-approved. WP9 must list each fixture-only gap,
  owner, risk, and acceptance decision; archive RPC, generation pins, schema
  conformance, cursor safety, and atomic publication are WP9 blockers and cannot
  be deferred by relabeling them as M6 work.]`
- Producer and consumer owners:
  `[UNRESOLVED — individual owners are not assigned. WP9 must name the producer
  implementer/reviewer/integrator and the consumer reviewer who accepts its
  returned evidence.]`

The return package must include the producer package range and integration
merge, contract/deployment/genesis/bytecode pins, Rust fixture locations, all
validation output, archive-RPC method, event and full configuration-history
evidence, expected/computed content vectors, exact Vyper layout and simulation
evidence, cursor/reorg recovery evidence, exact object/state/history paths, a
byte hash of the accepted staging or local payload, and every unresolved
assumption with an owner. It must identify whether each simulation is complete,
failed after a complete run, or unavailable; no fixture-only derivation may be
reported as live evidence. The frontend remains mock-backed until that handoff
is independently accepted.
