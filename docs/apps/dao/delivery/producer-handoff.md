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
  `7cb3a9b46502821b37d5c26c409940ebff16a8ea`. This is the exact schema and
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
  lifecycle events, all 23 accepted M2 mock mappings, and 78 rejection vectors.
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
    `0x7777777777777777777777777777777777777777`, YBC weight aggregator
    `0x1212121212121212121212121212121212121212`, Executor
    `0x3333333333333333333333333333333333333333`, hook
    `0x9999999999999999999999999999999999999999`, weight measure
    `0x1414141414141414141414141414141414141414`, proposal blacklist
    `0x1616161616161616161616161616161616161616`, operator
    `0x5555555555555555555555555555555555555555`, and guardian
    `0x6666666666666666666666666666666666666666`.
  - `config-2` changes those values without changing the Voting generation. It
    is effective at block `23902000`, hash
    `0x00000000000000000000000000000000000000000000000000000000016cb730`,
    transaction/log `0/0`; its offset/window are `604700/604900`, delay
    `172800`, guard `permissionless`, Voter
    `0x8888888888888888888888888888888888888888`, delegated-staking aggregate
    `0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, YBC aggregate
    `0xcccccccccccccccccccccccccccccccccccccccc`, YBC weight aggregator
    `0x1313131313131313131313131313131313131313`, Executor
    `0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, hook
    `0xdddddddddddddddddddddddddddddddddddddddd`, weight measure
    `0x1515151515151515151515151515151515151515`, proposal blacklist
    `0x1717171717171717171717171717171717171717`, operator
    `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, and guardian
    `0xffffffffffffffffffffffffffffffffffffffff`.
  Configuration IDs, positions, block hashes, and copied proposal/event
  observations must match exactly. The offset plus window equals the fixed
  epoch length. Changes to Voter, aggregates, Executor, timing, delay, guard,
  hook, weight measure, or roles never create a new Voting generation.
  Each fixture Voter is `verified_pinned`: it binds exact `Voter.vy` source,
  compiler settings, independently proven immutable genesis, reproducible
  runtime-bytecode equality, archive code length/hash, build-artifact hash, and
  the fixed-order `yearn.dao.voter-build-evidence.v1` commitment at that
  configuration position. The Voter constructor genesis is not required to
  equal the Voting generation genesis. Live values and code evidence remain
  producer-owned assumptions.
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
  `0x07a76b841c4b2221d14376d25ce68b7486fc7b80035ded7288c818af89eed26f`,
  comparison `mismatch`, and failure `CONTENT_DIGEST_MISMATCH`.
  It retains 38 exact malformed, no-final-LF bytes as canonical RFC 4648
  Base64. Focused vectors reproduce the exact typed failure over decoded bytes:
  digest mismatch, fatal UTF-8, malformed JSON, proposal-content schema/domain
  failure, missing final LF, or noncanonical field order. Canonical available
  bytes cannot be relabeled invalid, and malformed Base64, byte-length, digest,
  CID, or failure-code substitutions reject. Proposal `20` proves that missing
  Propose block time uses explicit unavailable `chainCreatedAt`; its
  authenticated content time is not substituted as chain time, and later
  same-block timestamp evidence never mutates that null event value.
  Accepted, boundary, and rejection vectors are in
  `tests/fixtures/dao-feed-v1.ts` and
  `docs/apps/dao/examples/feed-v1/dao-feed-v1.rejections.json`.
- Simulation engine, method, caller/context, and override policy: REVM `34`,
  method `revm_engine_injected_executor_frame_conditional_origin`, using archive
  state at the exact Propose block number, hash, and timestamp. This is a
  conditional historical scenario, not proof that an unknown future execution
  transaction will succeed.
  - Freeze the authenticated Propose transaction sender as the hypothetical
    `tx.origin`. Missing sender/receipt provenance makes the simulation
    `unavailable`.
  - Enter real Executor code through an engine-injected nested frame immediately
    before `operators[Voting]` is checked. Executor sees `CALLER = Voting`;
    targets see `CALLER = Executor`; value is zero; the operator check runs; no
    Voting or Executor code override is allowed. Record the exact injector
    revision and artifact SHA-256.
  - Prove the proposal-effective Executor at the Propose block as
    `verified_pinned`. Its exact source is `contracts/governance/Executor.vy`,
    source SHA-256
    `0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1`,
    `vyper@0.4.2`, compiler-integrity SHA-256
    `0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b`,
    gas optimization, Cancun, and non-experimental codegen. The reproducible
    runtime is exactly 1,157 bytes, Keccak-256
    `0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151`,
    and raw-runtime SHA-256
    `0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c`.
    Reproduce it with
    `uv run --no-project --isolated --with vyper==0.4.2 vyper -O gas --evm-version cancun -f bytecode_runtime contracts/governance/Executor.vy`.
    Bind matching archive `eth_getCode` address/block/hash/length/code hash.
  - Authenticate the Propose header with `eth_getBlockByHash`, requiring
    positive u64 gas limit and base fee, and the successful Propose receipt with
    `eth_getTransactionReceipt`, including transaction hash, sender, block, and
    canonical effective gas price. Freeze
    `executorFrameInitialGas = min(proposeBlock.gasLimit, 30_000_000)` and
    `effectiveGasPriceWei = proposeReceipt.effectiveGasPrice`; the effective
    price cannot be lower than the header base fee. These are conditional
    scenario inputs, not a future nested-call gas-equivalence claim.
  - Record envelope `synthetic_legacy_no_blobs`, an exactly empty access list,
    and warm-set policy
    `cancun_frame_entry_origin_voting_executor_and_precompiles_no_storage`.
    Recompute fixed-order `yearn.dao.simulation-context-inputs.v2`
    `contextInputsSha256` with `deriveDaoSimulationContextInputsSha256`; it
    binds header and receipt evidence, origin and caller chain, injector
    artifact, exact Executor source/build/archive-code identity, gas formula and
    values, envelope, access list, and warm-set inputs.
  - Prove and apply only the proposal-specific Voting storage transition
    `executed: false -> true` before Executor entry. The Voting source SHA-256 is
    `0x6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e`.
    Compile those exact bytes with `vyper@0.4.2` using
    `uv run --no-project --isolated --with vyper==0.4.2 vyper -f layout -o Voting.layout.json Voting.vy`;
    the layout-file SHA-256 is
    `0x0f963a37d02adeb6a34fabb98ab37b118031ac9b7380e4ad65ac2765b4b6db26`.
    The `proposals` mapping base slot is `17`, the hash input is
    `bytes32(17) || bytes32(proposalId)`, and `executed` is full-word offset `8`.
    Retain the derived struct base, resolved slot, exact zero/one pre/post words,
    and `keccak256(eth_getCode(Voting, proposeBlock))` with byte length, address,
    proposal block number/hash, and generation bytecode-hash match. Proposal `2`
    pins struct base
    `0xa4e0f4432e44d027a7b3f953940f096bca7a9bd910297cad2ba7c703c2b799d3`
    and resolved slot
    `0xa4e0f4432e44d027a7b3f953940f096bca7a9bd910297cad2ba7c703c2b799db`.
  - Apply no timestamp override or other state override. `succeeded` and
    `failed` mean atomic success or revert only for the exact recorded scenario.
    A bare top-level Executor call with caller Voting changes `tx.origin`; an
    ordinary harness changes caller/code identity. Either method is invalid.
    Missing or substituted source, layout, code, pre-state, origin, frame,
    header, receipt, gas, access, warm-set, script, or input commitment makes
    the whole simulation `unavailable`, with every partial context field null.
    A zero or custom Executor also forces both script analysis and simulation
    unavailable; it cannot publish guessed pinned framing or an empty
    `complete` call list.

  Analysis chronology is mandatory for completed and unavailable records. When
  Propose chain time is known, it is no later than simulation/failure time;
  simulation is no later than analysis `generatedAt`; analysis generation is no
  later than feed generation and publication. Failed and unavailable attempts
  bind `simulatedAt` to the exact failure `observedAt`; null means genuinely
  unproven, not a guessed instant. No analysis or failure observation may occur
  after the feed snapshot or publication.

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

IDs and log coordinates are globally unique. A single feed-wide canonical block
registry covers deployment/start, every configuration observation, lifecycle
logs and receipts, chain-creation evidence, Voter/Executor/archive/header/
simulation evidence, cursor, reorg, finality, and publication records. One
`(chainId, blockNumber)` has exactly one hash, one hash has exactly one height,
and all known timestamps for that block agree. Null remains unavailable and is
never filled into the parsed record from another observation. Event order,
transaction grouping, proposal reference, and contract generation remain
coherent. Forward groups use block hash plus transaction index; the reverse
mapping permits each non-null transaction hash at exactly one block number/hash
and transaction index. A null transaction hash is a truthful value, not
permission to substitute identity. Ethereum `logIndex` is block-global:
`(chainId, blockHash, logIndex)` cannot repeat across transactions, proposals,
or Voting generations, even when transaction indices differ. In canonical
transaction order, log indices within a block must also strictly increase, so a
later transaction cannot restart at an earlier index. Configuration
`effectiveAt` is an observation boundary, not an emitted lifecycle log, and
does not occupy this log namespace.

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

Chain creation time is a strict union. When the Propose log/block timestamp is
known, `chainCreatedAt` is available, equals it, and binds the exact event
position; the receipt timestamp agrees. When it is absent, both are explicitly
unavailable/null with provenance failure. Never substitute content `createdAt`
or another numeric timestamp.

`Propose`, `Vote`, and Voting `Execute` take their actors from indexed event
fields. `Retract` infers its actor from the proposal proposer. `Flag` and `Veto`
require historical transaction-sender evidence joined to the operator or
guardian configuration effective at that log; use actor evidence `unavailable`
when that proof is absent. Never use a current role as a historical guess.

Vote classification is also historical. Record the Voter, delegated-staking,
YBC, and YBC-weight-aggregator configuration ID, values, and exact observation
position/hash effective at each Vote log. A `verified_pinned` implementation
must bind exact Voter source, compiler/settings, immutable genesis, reproducible
runtime code, archive code length/hash, and build artifact at that configuration
position. Its `yearn.dao.voter-build-evidence.v1` commitment binds the pinned
source/compiler settings, its independently proven constructor genesis, runtime
length/hash, deployed-code hash, and build-artifact hash; Voter genesis is not
derived from Voting genesis. The source is
`https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voter.vy`,
with SHA-256
`0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab`,
`vyper@0.4.2`, gas optimization, and Cancun.

Complete human/delegated/YBC labels require one transaction-bound invocation
identity `chainId:votingAddress:transactionHash:voterCallTraceAddress`. That
identity is unique feed-wide and binds one proposal, caller, selector, target,
parent/child trace paths and depths, membership, aggregator result, and every
emitted Vote. Ordinal `0` is one nonzero positive-weight human. A nonmember or
member with aggregator return zero emits only `{0}`. A member with a positive
aggregator return emits the exact log-ordered `{0,1,2}` human/delegated/YBC
triplet; ordinals `1` and `2` share aggregate Yea bps, while their event weights
remain independent absolute Voting measurements. One complete pinned caller may
submit only once per proposal. Missing, extra, orphaned, duplicate, standalone,
ambiguous, or out-of-order aggregate events reject.

If pinned implementation proof exists but trace or transaction provenance is
unavailable, retain the raw Vote as `pinned_voter_trace_unavailable`, with null
trace, typed failure, and `actorKind: unclassified`. A custom/unverified Voter
uses `unverified_voter_unclassified`; a zero Voter cannot emit a canonical
Vote. Neither unclassified variant may claim binary-human or aggregate
semantics. Human votes have binary direction. Aggregate and unclassified votes
keep `direction: null`; human participation becomes an exact lower bound with
the classified-human and unclassified-event counts. Aggregate weights overwrite
the actor's absolute contribution; they are not increments.

### Rules, content, scripts, and failures

Only the approval threshold is snapshotted. Preserve both accepted 5,000 and
6,000 bps vectors, the positive-total requirement, and no minimum turnout.
Keep one ordered `configurationHistory` per Voting generation. Vote-start
offset/window, execution delay/guard, Voter, delegated-staking/YBC aggregates,
YBC weight aggregator, Executor, hook, weight measure, proposal blacklist,
operator, and guardian
are mutable observations with exact block/hash and transaction/log ordering.
Proposal rules copy the configuration effective at Propose and remain
historical disclosure; simulation uses that proposal-effective Executor. Vote
admission and actor evidence bind the configuration effective at the exact
event position. Execute delay, guard, and operator bind the Execute position.
`statusConfiguration` is the last configuration effective at the end of the
canonical block; top-level timing and raw `protocolStatus` are derived from
that snapshot-effective configuration. Never relabel proposal-time values as
snapshot-current truth.

Generation genesis is immutable and `epochLengthSeconds` is exactly `1209600`.
For voting epoch `E`, genesis `G`, fixed epoch length `L = 1209600`, and the
snapshot-effective raw vote offset `O`, top-level
`voteStartsAt = G + E*L + O` and
`voteEndsAt = voteStartsAt + votingPeriodSeconds`. Each Vote instead applies
that formula to the configuration effective at its own event position and
requires `voteStart(P) <= eventTimestamp < voteEnd(P)`. The offset plus voting
window equals `L`; the contract-valid disabled state is
`votingPeriodSeconds = 0`, `voteStartOffsetSeconds = L`, and admits no Vote.
Known chain creation occurs in epoch `E-1`. Authenticated content `createdAt` is
independent, may be older, and is never substituted for chain time. The
snapshot-effective executable window begins in epoch `E+1` after its delay and
ends at `G + (E+2)*L`; each Execute is rechecked with its event-effective delay.

Use the schema's typed address-state discriminants. Voter may be
`disabled_zero_address`; delegated staking, YBC, YBC weight aggregator, hook,
weight measure, and operator may be `zero_address`; constructor-zero Executor
and proposal blacklist are `uninitialized_zero_address`. The guardian and every Voting/emitter
identity remain nonzero. These values have distinct effects: zero Voter or
weight measure disables Vote, zero hook rejects positive-weight Vote, and zero
YBC atomically reverts every pinned-Voter submission, including trace-
unavailable ones. A zero aggregator is valid for a proven nonmember path but a
member path cannot survive it. A zero operator prevents Flag and guarded
Execute but does not prevent permissionless Execute. Zero delegated staking can
emit a canonical zero-account aggregate Vote. Executor history may begin at
constructor zero, but after its first nonzero setter value it cannot return to
zero. Reject every state/address contradiction and never replace a zero state
with unavailable.

Capability checks are event-effective and follow pinned pre-log behavior.
Propose needs callable blacklist, weight measure, and hook interfaces. Retract
and Flag need a callable hook; Flag also needs the matching nonzero operator.
An early zero-total Veto needs the hook, while a post-participation Veto skips
it. Vote needs a callable Voter and weight measure; positive weight also needs
the hook, while a raw zero-weight Vote from a custom implementation may survive
without it. Nonempty executable Execute needs a callable nonzero Executor;
empty signal Execute skips it. Guarded Execute needs the matching nonzero
operator, while permissionless Execute does not. Retract and Flag use the
checked last-write-per-account total immediately before the event, not the
historical absence of Vote logs, so a custom zero-weight overwrite may return a
prior contribution to zero and make the terminal action valid.

Keep onchain Flag and Veto reasons byte-exact. Empty and whitespace-only reasons
are valid through the 256-byte contract bound; the frontend authoring form's
trimmed, nonempty rule does not apply to history. A signal may report raw
`executed` without a Voting Execute event while its consumer display state stays
`approved`.

Content keeps separate expected onchain digest/CID and computed fetched-byte
digest/CID fields plus `verified`, `mismatch`, or `unavailable` comparison.
Available content retains byte-exact canonical UTF-8 JSON in frozen field order
with exactly one final LF and requires exact identity equality. Invalid fetched
content instead retains the exact arbitrary bytes, including no-final-LF,
malformed JSON, NUL, or invalid UTF-8, as canonical RFC 4648 Base64 plus exact
byte length. Compute its digest and CID over the decoded bytes and retain
truthful expected-versus-computed evidence. Canonical JSON and final-LF rules
apply only to `available`; `invalid` must not pretend the bytes are text.
Digest-invalid bytes use `CONTENT_DIGEST_MISMATCH`; unavailable content has no
computed identity and guesses no bytes. Content `createdAt` is immutable
content data and may precede and differ from known canonical Propose block time.
Enforce
16 assets, 512 UTF-8 path bytes, 127 UTF-8 media-type bytes, 2,097,152 bytes per
asset, 33,554,432 aggregate bytes, 8,192 pixels per dimension, and 33,554,432
pixels per image. Relative Markdown attachments resolve by exact normalized
manifest path. Direct attachments are exactly `ipfs://<assetCid>` without a
path, slash, query, or fragment. Both gateway URLs are exactly
`https://ipfs.io/ipfs/<assetCid>` with no suffix.

Retain exact Propose script bytes when available, the stored hash, computed
Keccak-256 hash, hash comparison, frame parse result, and Propose event ID. The
stored hash determines proposal type even when bytes are unavailable: `signal`
iff it is `keccak256(0x)`, otherwise `executable`. Missing bytes, hash mismatch,
malformed framing, and structurally valid zero targets are separate states.
Pinned 32-byte headers, 96-bit frame lengths, the 64-frame maximum, operator
semantics, decoded calls, and completed simulation are authorized only by an
effective `verified_pinned` Executor. An unverified/custom Executor preserves
the raw script and hash but uses `implementation_unverified`; both analysis and
simulation are unavailable with `EXECUTOR_IMPLEMENTATION_UNVERIFIED`.
Constructor zero similarly uses `EXECUTOR_UNINITIALIZED_ZERO_ADDRESS`. Neither
state may publish guessed framing or `complete` analysis with an empty call
list. Decoding preserves frame order and raw calldata. Unknown calls have no
invented source. Verified records are GitHub-only and bind `kind`, repository,
exact 40-hex revision, normalized `sourcePath`, and the derived canonical blob
URL; credentials, query, fragment, port, controls, backslashes, traversal,
noncanonical paths, and any other host fail. Decode and simulation states are
independent.

The exact Voting source URL is
`https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy`;
queries, fragments, alternate repositories/revisions/paths, credentials,
backslashes, controls, and noncanonical URL forms fail. The exact Executor
source is
`https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Executor.vy`.
Its source SHA-256 is
`0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1`;
the pinned compiler-integrity SHA-256 is
`0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b`.
The exact gas-optimized Cancun runtime is 1,157 bytes, with Keccak-256
`0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151`
and raw-runtime SHA-256
`0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c`.
Verified discussions use canonical
`https://gov.yearn.fi/t/<slug>/<positiveId>` paths. Authoritative public
metadata fetched from `https://gov.yearn.fi/categories.json` on 2026-08-26 and
the canonical search route `https://gov.yearn.fi/c/proposals/5` fix root
`5 / Proposals / proposals`, with `parent_category_id: null` and exact
descendant IDs `[9, 18, 17, 21, 10, 29]`: `9 / Vaults / vaults`,
`18 / Other Products (Labs) / labs`, `17 / Finance / finance`,
`21 / Protocol and Governance / protocol-and-governance`,
`10 / YIPs / yips`, and `29 / veYFI / veyfi`, each under root `5`.
Authorization uses exact ID and ancestry, never labels; category `42`, an
unrelated ID, or a valid label with wrong ancestry fails.

Use only the schema's typed failure and evidence unions. Do not publish partial
success shapes, inferred provenance, guessed timestamps, placeholder hashes, or
unbounded strings/arrays. The payload cap is 64 MiB, with at most 64 contract
generations, 100,000 proposals, 100,000 events per proposal, and 64 decoded
calls per proposal. A consumer admits fetched UTF-8 text through
`parseDaoFeedJsonV1`, which checks the 64 MiB byte cap before JSON parsing or
deep structural/semantic traversal. Chain, contract, emitter, and non-Vote
lifecycle identities plus provenance hashes are nonzero. Typed contract-valid
zero configuration addresses, zero Vote accounts, zero script targets,
content/asset digests, raw storage words, and uint topics remain representable.

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

Content and asset fetches use exactly `maxAttempts: 8` and policy
`fixed_120_seconds`. Every `lastAttemptAt` is at or before feed generation and
publication; a failure's `observedAt` equals that last attempt. A retryable
failure with attempts left is `scheduled`, with
`nextRetryAt = lastAttemptAt + 120 seconds`, and that instant must follow the
snapshot. Non-retryable, exhausted, and succeeded records keep no next retry or
backoff. Snapshot publication permits at most 16 attempts. A
`succeeded_after_retry` publication retains a retryable preceding failure and
succeeds exactly 120 seconds later at `publishedAt`; a first attempt binds its
last attempt directly to `publishedAt`.

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
canonical content JSON, exact invalid raw content bytes, and asset records. The
established Teams producer flow is only an architectural precedent; it does not
choose the DAO keys or paths.

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
- RPC timeout, content/asset timeout, and maximum fetched raw bytes before
  schema validation:
  `[UNRESOLVED — WP9 must choose bounded values within the v1 payload/asset
  maxima and add deterministic tests. Retry attempts and the fixed 120-second
  backoff are already frozen and are not producer choices.]`
- Forum category and provenance policy: resolved consumer pin. WP9 must obtain
  public category metadata from `https://gov.yearn.fi/categories.json`, retain
  root `5` and exact allowed descendant ancestry, and resolve topics through
  canonical public routes. It must reject category `42` rather than treating
  it as a fixture or deployment assumption.
- Historical configuration and simulation proof acquisition:
  `[UNRESOLVED — WP9 must name the archive calls/log joins that recover genesis,
  every configuration transition, effective Voter source/build/archive-code
  evidence, transaction call traces, deployed Voting/Executor code bytes/hash,
  and proposal storage pre-state without substituting current values. It must
  name the engine-injected frame method and reproduce the origin/gas/access/
  warm-set input commitment. Any unproved complete simulation remains
  unavailable.]`

The inventoried producer has no DAO scanner, CID/blob module, complete nullable
and reverse transaction-hash handling, block-global log-index enforcement,
strict global block/hash/timestamp registry, event block-hash/transaction-index
support, ordered mutable-configuration store, feed-wide Voter invocation and
build/trace proof, exact pinned Executor implementation proof, arbitrary-byte
content/failure reproduction, or typed engine-injected conditional Voting
transition simulation with committed header/receipt/origin/gas context.
Existing YBC/Teams cursor recovery, local
temp-and-rename writes, immutable Teams audit object, and stable R2 PUT are
useful precedents, not evidence that the DAO contract is already feasible.

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

At schema commit `7cb3a9b46502821b37d5c26c409940ebff16a8ea`, the focused
suite passes 94 tests, the full suite passes 1,285 tests in 140 files, and
typecheck, lint, and full-range `git diff --check` pass. Two consecutive
`npm run generate:dao-feed` runs produced byte-identical artifacts. The exact
artifact SHA-256 values are:

- JSON Schema:
  `ca342cec702599a168e3ec1b061cc3001ec0ae478fc667a9ec4e26cb0d4b18ad`;
- accepted feed:
  `92fde461723abae9900a4e6348e433115693b1a49c7b05a3f64d79aee74115cf`;
- rejection vectors:
  `02e38e78dc064ec08c5f0eafea38b65ff6d61e6ae4112b1a3ae4ffa696706237`;
- mock-state map:
  `01dae60a0d90b708f146f08b4ebf0dbb0a72a4b2a64a94f382b0dc5b30ddb624`;
- creation-stage example:
  `22257d4e9e59336cf54b82fe3d725228e92b6981fa4bdefb0074ca5b8030292a`.

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
merge, contract/deployment/genesis/bytecode pins, Rust fixture locations for all
27 proposals, 81 lifecycle events, 23 mock mappings, and 78 rejection vectors,
and all validation output. It must return the archive-RPC method; event and full
configuration-history evidence; the feed-wide block/hash/timestamp registry and
strict block-global log-index order checks; exact
snapshot-effective status timing and event-effective Vote/Execute checks;
typed zero-state and capability vectors; and effective Voter source/build/
archive-code and complete invocation-trace evidence for every classified Vote,
including feed-wide invocation identity, log-ordered ordinals, caller
uniqueness, and lower-bound accounting for trace-unavailable raw Votes.

It must also return the root-5 forum metadata lookup, exact arbitrary-byte
content and expected/computed digest/CID vectors, fixed retry evidence, cursor/
reorg recovery evidence, and exact object/state/history paths. For simulations,
return the exact Vyper layout and Voting transition proof, real Voting/Executor
code and pinned Executor build evidence, authenticated hypothetical origin,
engine-injected caller chain, injector revision/artifact, authenticated Propose
header and receipt, positive-u64 base fee/gas limit, deterministic frame-gas and
effective-price derivation, gas/access/warm-set inputs, recomputed v2
`contextInputsSha256`, and conditional result. Every unresolved simulation must
use the fully null `unavailable` variant; a custom or zero Executor must also
return unavailable analysis without guessed framing. Finally, return a byte
hash of the accepted staging or local payload and every unresolved assumption
with an owner. No fixture-only derivation may be reported as live evidence. The
frontend remains mock-backed until that handoff is independently accepted.
