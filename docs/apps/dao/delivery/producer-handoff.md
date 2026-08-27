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
  `2e83910d5e41769305433c81c15915833a8bdf0b`. This is the final WP8 consumer
  contract pin: TypeScript/Zod boundary, generated JSON Schema, accepted and
  rejected artifacts, tests, and the five canonical DAO documents. Intermediate
  commits `8ee885c1bc35386eb5088ecab812f0eb9218b354` and
  `45f1e0e1d4131fd75f4261b97579b48d28adb1d3` are ancestors, not the producer
  pin. This later handoff-only commit changes none of those files.
- Pinned contract commit SHA:
  `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`.

## Runtime and validation

- Producer language and required runtime: Rust `1.88`, Alloy `1.4`, and REVM
  `34.0.0`, as locked by producer `Cargo.lock` SHA-256
  `0x6edd1b9a62f867205f9fb59aef137aa0fb0d08def83a0932fc84f67efe32de19`.
  The feed must
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
  `0x1111111111111111111111111111111111111111`, deployment block `23900000`,
  deployment hash
  `0x00000000000000000000000000000000000000000000000000000000016caf60`,
  producer start block `23900001`, start hash
  `0x00000000000000000000000000000000000000000000000000000000016caf61`,
  deployed-bytecode hash
  `0x000000000000000000000000000000000000000000000000000000000001869f`,
  genesis timestamp `1543946400`, fixed epoch length `1209600`,
  and canonical snapshot block `24000000` with hash
  `0x39c219e27639654c0e593394e979a69bbd28433bd8609a522a46d6fb1432cf7d`.
  It contains one contract, two ordered configurations, 27 proposals, 81
  lifecycle events, all 23 accepted M2 mock mappings, 14 completed conditional
  simulations, and 114 rejection vectors. The accepted block, receipt, code,
  and trace facts are committed synthetic fixtures, not archive-RPC claims.
  `[UNRESOLVED — an archive RPC and the exact live Voting generation addresses,
  deployment blocks/hashes, deployed-bytecode hashes, genesis timestamps,
  producer start blocks, and ordered configuration history are required before
  live output can be claimed.]`
- Ordered same-Voting configuration vectors:
  - `config-1` has logical `effectiveAt.kind: start_of_block` at producer start
    block `23900001`, hash
    `0x00000000000000000000000000000000000000000000000000000000016caf61`.
    It sorts before every real log and has no transaction/log coordinate. It
    uses vote-start offset/window `604800/604800`, Voter decay `0`, execution
    delay `86400`, guard `guarded`, Voter
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
    transaction/log `0/9`; its offset/window are `604700/604900`, Voter decay
    `86400`, delay `172800`, guard `permissionless`, Voter
    `0x8888888888888888888888888888888888888888`, delegated-staking aggregate
    `0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, YBC aggregate
    `0xcccccccccccccccccccccccccccccccccccccccc`, YBC weight aggregator
    `0x1313131313131313131313131313131313131313`, Executor
    `0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, hook
    `0xdddddddddddddddddddddddddddddddddddddddd`, weight measure
    `0x1515151515151515151515151515151515151515`, proposal blacklist
    `0x1717171717171717171717171717171717171717`, operator
    `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, and unchanged guardian
    `0x6666666666666666666666666666666666666666`.
  Configuration IDs, positions, block hashes, and copied proposal/event
  observations must match exactly. The offset plus window equals the fixed
  epoch length. `voterDecayLengthSeconds` is restricted to `0..604799`; zero
  disables decay. Changes to Voter, aggregates, Executor, timing, delay, guard,
  hook, weight measure, or roles never create a new Voting generation.
  `config-1` uses `producer_start_state_snapshot_sentinel`: end-of-parent-block
  state plus a creation-through-parent scan. The fixture proves zero omitted
  lifecycle logs, retains nine bootstrap Set* logs, authenticates their one
  successful transaction and unfiltered geth `callTracer`, and replays them to
  the exact start-state digest. Live v1 output requires start exactly deployment
  plus one; any lifecycle log before start makes the generation incompatible
  with this bootstrap contract. `config-2` uses `setter_trace_observation`,
  retains ten exact setters, and becomes effective at its final real canonical
  Set* log, global log index `9`. Lifecycle logs before that log use the old row
  and logs at or after it use the new row; an intervening lifecycle log forces
  split rows. Bootstrap/configuration logs share the feed-wide physical log,
  transaction, sender, and call-trace identity registries.
  Repeated setters for one field replay in canonical call/log order and the row
  equals only the last mutation for that field. The retained
  `set_propose_parameters` minimum-weight and cooldown arguments must fit
  uint256 before ABI re-encoding; malformed values are typed safe-parser
  failures and must never escape as encoder exceptions.
  Each fixture Voter is `verified_pinned`: it binds exact `Voter.vy` source,
  the official compiler distribution, independent immutable genesis, exact
  creation/runtime/layout artifacts, constructor-bound deployed runtime, and
  archive-RPC or committed-synthetic code evidence through fixed-order
  `yearn.dao.voter-build-evidence.v2`. The fixture Voter genesis is
  `1542736800`, independently older than Voting genesis `1543946400`; it must
  not follow any event that implementation could have emitted. Live values and
  code evidence remain producer-owned assumptions and require the archive-RPC
  branch. The constructor genesis is dynamic, not a fixture literal: append its
  ABI uint256 word to the frozen 2,060-byte creation bytecode and 1,957-byte
  runtime template, then recompute the 2,092-byte initcode SHA-256, 1,989-byte
  deployed-runtime SHA-256/Keccak-256, immutable word, and v2 commitment. The
  accepted alternate `1542736801` vector derives word
  `0x000000000000000000000000000000000000000000000000000000005bf44ba1`, initcode
  SHA-256 `0x035f0c7871b39cafd4a47ef7ad0e04b04bd71f65e64ae78ce5014359a5877804`,
  runtime SHA-256 `0x6faf5966a18ad50c242e2f7791d86e2031f3788de3341ef5c478525e7ac2ac6d`,
  runtime Keccak-256 `0xea7147fdd429674740a390017328cae6ca7fb707021ad9aeec62dee6e5fd93d5`,
  and v2 commitment
  `0xb1925ab67d4ce961f8752cf5e9f2ffde86d0f4f285754472e28f96d73e8a5b22`.
- CID fixture convention and test-vector location: content and assets use
  CIDv1 with the raw codec, SHA-256 multihash, and lowercase unpadded Base32.
  Proposal `1` in `docs/apps/dao/examples/feed-v1/dao-feed-v1.example.json`
  contains the byte-for-byte canonical JSON with its final LF, digest
  `0x96b2d61caddac83896b4997df04f58acb08cdeb0c7870117f298f534bcc0c668`,
  and CID
  `bafkreiewwllbzlo2za4jnnezpxye6wfmwcgn5mghq4arp4uy6u2lzqggna`.
  Its authenticated content time is `2026-08-18T11:59:00.000Z`; its Propose
  timestamp is deliberately unavailable and is not replaced by the canonical
  snapshot timestamp `1787054400`. Proposal `15` is the accepted
  digest-invalid vector: expected digest
  `0x7302a81f54f32e8cafe000b437923b87574bcc2fe6e873b78de86dfbd9484ab2`,
  computed digest
  `0x07a76b841c4b2221d14376d25ce68b7486fc7b80035ded7288c818af89eed26f`,
  comparison `mismatch`, and failure `CONTENT_DIGEST_MISMATCH`.
  It retains 38 exact malformed, no-final-LF bytes as canonical RFC 4648
  Base64. Focused vectors reproduce the exact typed failure over decoded bytes:
  digest mismatch, fatal UTF-8, malformed JSON, proposal-content schema/domain
  failure, missing final LF, or noncanonical field order. Proposal-content
  timestamps must also be real RFC 3339 instants; regex-shaped impossible
  calendar values reject. Canonical available bytes cannot be relabeled invalid,
  and malformed Base64, byte-length, digest, CID, or failure-code substitutions
  reject. A failed decoder candidate still carries its exact canonical verified
  source record, and analysis summary source/code must name the component that
  actually failed rather than substituting a simulation or decoder failure.
  Proposal `20` proves that missing
  Propose block time uses explicit unavailable `chainCreatedAt`; its
  authenticated content time is not substituted as chain time, and later
  same-block timestamp evidence never mutates that null event value.
  Accepted, boundary, and rejection vectors are in
  `tests/fixtures/dao-feed-v1.ts` and
  `docs/apps/dao/examples/feed-v1/dao-feed-v1.rejections.json`.
- Simulation engine, method, caller/context, and override policy: engine
  `revm@34.0.0`, method
  `revm_engine_injected_executor_frame_conditional_origin`, using the exact
  Propose block number, hash, timestamp, authenticated header/receipt, and
  proposal-effective code/state. This is conditional recorded-frame behavior,
  not proof of future Voting execution feasibility. Completed v1 simulations
  are mainnet-only: feed, proposal, cursor, frame, and authenticated chain
  schedule all use `chainId = 1`; coherently recommitting a different chain ID
  against mainnet Osaka/BPO2 evidence is invalid.
  - Freeze the authenticated Propose transaction sender as the hypothetical
    `tx.origin`. Enter the Executor child frame at depth `1` immediately before
    its first opcode, with omitted Voting parent depth `0`, target-call depth
    `2`, scheme `CALL`, `CALLER = Voting`, target `CALLER = Executor`, value
    zero, real Voting/Executor code, and no code override. Bind exact
    `execute(bytes)` ABI calldata, injector revision/artifact SHA-256, empty
    access list, and no prewarmed storage.
  - The proposal-effective Executor must be `verified_pinned`. Pin
    `contracts/governance/Executor.vy` at contract revision
    `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`, raw-source SHA-256
    `0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1`,
    and Vyper import-tree source-integrity SHA-256
    `0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b`.
    The latter hashes the lowercase ASCII source digest without `0x` or LF; it
    is not a compiler-distribution hash.
  - Build only with official asset
    `vyper.0.4.2+commit.c216787f.linux`, long version
    `0.4.2+commit.c216787f`, release commit
    `c216787f5e355478733a05fa5f0fce93fa9a7126`, URI
    `https://github.com/vyperlang/vyper/releases/download/v0.4.2/vyper.0.4.2%2Bcommit.c216787f.linux`,
    byte length `23495192`, SHA-256
    `0x7cc4214671dc78db8a3962f103bead22dd76b55ee370d6d333122e7f3368f4fa`.
    Use exact `-Werror -O gas --evm-version cancun` command strings from the
    frozen schema. Executor creation/runtime stdout lengths are `2483/2317`;
    decoded creation is `1240` bytes with SHA-256
    `0xccb991a4222b9576e42f6d0da4e655069a4882532bf088e22c8a95b629862a60`.
    Executor has no immutables. Its `1157`-byte runtime has Keccak-256
    `0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151`
    and raw-byte SHA-256
    `0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c`.
    Live output binds matching archive `eth_getCode`; fixture output uses only
    the committed-synthetic projection.
  - Authenticate the Propose header with `eth_getBlockByHash` and its successful
    receipt with `eth_getTransactionReceipt`. Require positive-u64 block gas
    limit and base fee, receipt sender equal to proposer, and receipt effective
    price at least the base fee. Freeze
    `executorFrameInitialGas = min(proposeBlock.gasLimit, 30000000)` and
    `effectiveGasPriceWei = proposeReceipt.effectiveGasPrice`.
  - Pin mainnet fork evidence to go-ethereum revision
    `9621c6ad10934a01b5514886fb6fbd87640b6c05`, `params/config.go`, source
    SHA-256 `0xbd6759b0b0d4e4f8191f25870e40abad46ef5fb70aacdd31bdf220b5212de361`.
    Authenticated timestamps select `SpecId::OSAKA` at `1764798551` and BPO2 at
    `1767747671`; `BogotaTime` is null in that pin. Reject Prague fraction
    `5007716`, set BPO2 override `11684671` before setting blob excess gas/price,
    then use REVM fake exponential. The fixture proves
    `excessBlobGas 50331648 -> blobBaseFeeWei 74`; Prague would yield `23174`.
    Pin producer `Cargo.lock` SHA-256
    `0x6edd1b9a62f867205f9fb59aef137aa0fb0d08def83a0932fc84f67efe32de19`
    and `revm-34.0.0.crate` URI
    `https://crates.io/api/v1/crates/revm/34.0.0/download`, exact-download
    SHA-256 `0xc2aabdebaa535b3575231a88d72b642897ae8106cf6b0d12eafc6bfdf50abfc7`.
  - Warm exactly the sorted/deduplicated union of origin, Voting, Executor,
    beneficiary, and Osaka precompiles `0x01..0x11` plus `0x0100`; coinbase is
    warm. Bind beneficiary, zero difficulty, PREVRANDAO, block timestamp, gas
    limit/base fee, excess/blob fee, synthetic-legacy-no-blobs envelope, and
    the six exact disclosures:
    `outerTransactionValidation=bypassed`,
    `osakaTransactionGasLimitCap=16777216`,
    `gasScenario=non_transactional_gas_overapproximation`,
    `resultScope=recorded_injected_frame_script_behavior_not_future_execution_feasibility`,
    `parentEip150GasDeductionApplied=false`, and
    `parentEip150Forwarding=not_modeled`.
  - Independently prove `Executor.operators[Voting]` at the Propose position.
    Pinned mapping base slot is `2`, preimage order is slot-then-Voting key, and
    the storage word is exactly zero or one. Reconcile block-end storage with
    every relevant same-block `SetOperator(Voting,bool)` log through Propose,
    not a selected subset. When present, the last applied log value must equal
    the block-end storage word, decoded value, and `authorizedAtPropose` in both
    directions; prove zero later relevant logs. Success requires true authorization,
    `script_completed`, passed gate, and script entry. False authorization uses
    `executor_operator_check_revert` plus
    `EXECUTOR_OPERATOR_CHECK_REVERTED` and no script entry; authorized script
    failure uses `executor_script_revert` plus `TARGET_CALL_REVERTED`.
  - Prove and apply only the proposal-specific Voting storage transition
    `executed: false -> true`. Pinned Voting source SHA-256 is
    `0x6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e`;
    the layout artifact SHA-256 is
    `0x0f963a37d02adeb6a34fabb98ab37b118031ac9b7380e4ad65ac2765b4b6db26`.
    `proposals` uses mapping base slot `17`, slot-then-proposal-ID order, with
    `executed` at full-word offset `8`. Retain the derived struct/word slots,
    exact zero/one pre/post words, code address/block/hash/length, and generation
    code-hash match. Apply no timestamp or other state override.
  - Recompute `yearn.dao.simulation-context-inputs.v4` with
    `deriveDaoSimulationContextInputsSha256`. It binds chain/fork/engine,
    header/receipt, raw or synthetic projections, frame/callers/calldata,
    script, injector, Executor/Voting code and state, authorization storage/log
    replay evidence, gas/blob/disclosure values, envelope/access/warm inputs.
    Its six live provenance pairs are exact and independently bound: block
    header `rawResultSha256/rawResultObjectKey`, Propose receipt
    `rawResultSha256/rawResultObjectKey`, Executor code
    `rawResultSha256/rawResultObjectKey`, operator storage
    `rawResultSha256/rawResultObjectKey`, authorization replay
    `rawLogsSha256/rawLogsObjectKey`, and Voting override code
    `rawResultSha256/rawResultObjectKey`. Archive `rawLogsSha256` hashes the
    exact retained JSON-RPC result-array token; synthetic branches bind their
    fixture projections and keep both live digest and object-key fields null.
  - All live raw transaction, receipt, trace, log, and getCode digests hash the
    exact successful non-null top-level JSON-RPC `result` token bytes before
    decode/reserialization, excluding envelope, ID, and surrounding whitespace:
    `{...}` for objects, `[...]` for logs, and quoted `"0x..."` for code.
    Missing/substituted origin, source/build/code, state, header/receipt, fork,
    gas/blob/access/warm inputs, authorization, or v4 commitment makes the whole
    simulation `unavailable`. Signal, zero/custom Executor, missing/malformed
    script, or hash mismatch also forces unavailable analysis/simulation without
    guessed framing or a vacuous complete call list.

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
  never filled into the parsed record from another observation. Across every
  retained lifecycle, configuration, deployment/bootstrap, canonical/head,
  reorg, receipt, code, storage, and simulation observation, each known
  timestamp at a higher block height must be strictly greater; equality or
  reversal is invalid. Do not borrow a Propose timestamp for an Executor
  authorization setter log: retain `null` unless that setter timestamp is
  independently authenticated. Event order,
transaction grouping, proposal reference, and contract generation remain
coherent. Forward groups use block hash plus transaction index; the reverse
mapping permits each non-null transaction hash at exactly one block number/hash
and transaction index. A null transaction hash is a truthful value, not
permission to substitute identity. Ethereum `logIndex` is block-global:
`(chainId, blockHash, logIndex)` cannot repeat across transactions, proposals,
or Voting generations, even when transaction indices differ. In canonical
transaction order, log indices within a block must also strictly increase, so a
later transaction cannot restart at an earlier index. Only the producer
`start_of_block` configuration position is logical. Every later
`canonical_setter_log` position is a real Set* log and shares the same
block-global namespace with lifecycle, bootstrap, preconfigured-Voter-history,
and Executor-authorization logs. Exact repeated physical-log references are
ordered once and must agree on position, transaction hash, emitter, topics, and
data. Configuration/Voter call evidence additionally agrees on sender, caller,
target, full trace path, calldata, and decoded mutation; authorization logs do
not invent sender/trace fields absent from their schema.

All live `rawResultSha256`, `rawTransactionSha256`, `rawReceiptSha256`,
`rawTraceSha256`, `rawPreviousCodeSha256`, `rawDeployedCodeSha256`, and
`rawLogsSha256` values hash
the exact UTF-8 bytes of the successful non-null top-level JSON-RPC `result`
token before decoding or reserialization, excluding envelope, ID, and outside
whitespace: complete `{...}` objects, `[...]` log arrays, or the quoted
`"0x..."` code string. Retain the matching `rawResultObjectKey`,
`rawLogsObjectKey`, or other object/manifest key where the selected
branch exposes one; direct trace branches have no in-record key. Synthetic
branches bind only their fixture projection and keep exposed live hash/key
  fields null.

Adjacent Voting generations have exact inclusive ranges. A retired generation
is valid through its `retiredAtBlock`; that block/hash is exactly the successor
deployment, and the successor producer start is deployment plus one. Only the
last generation is active. Old configurations/events cannot follow retirement,
successor events cannot precede start, and the bootstrap lifecycle scan counts
only ABI logs whose emitter equals that scan's Voting address. Thus an old-
generation event in the shared cutover/deployment block does not contaminate the
successor's address-scoped zero-lifecycle bootstrap proof.

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
and noncanonical Propose evidence is rejected. The receipt transaction sender
must equal the canonical Propose proposer.

Each of the three standalone creation-stage vectors separately retains the
successful receipt transaction hash/sender, block number/hash, transaction
index, and exactly one matching Propose log. Its sender equals the decoded
proposer. Live `eth_getTransactionReceipt` evidence retains the exact successful
non-null JSON-RPC result-token SHA-256 plus immutable object key and keeps all
fixture fields null; committed-synthetic evidence keeps both live fields null
and binds its exact fixture projection. Rebinding the Propose ABI cannot make a
wrong receipt sender valid.

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

Vote classification is historical. Record Voter decay, Voter,
delegated-staking, YBC, and YBC-weight-aggregator configuration ID, values, and
exact event-effective position/hash. A `verified_pinned` implementation binds
the exact source/compiler distribution, independent constructor genesis,
creation/runtime/layout outputs, immutable word, final deployed runtime, and
archive-RPC code or committed-synthetic projection through
`yearn.dao.voter-build-evidence.v2`; Voter genesis is not derived from Voting
genesis and cannot follow a Vote that implementation could emit. The source is
`https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voter.vy`,
with SHA-256
`0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab`,
Vyper source-integrity SHA-256
`0x90d458df8321d2c845ad1a153b21fea3eeb6fa746feecc57d15beec3ae5f192d`,
and the official Vyper asset pinned above. Fixture genesis `1542736800` yields a
1957-byte runtime template plus 32-byte immutable word, final length `1989`,
raw-byte SHA-256
`0xb5de901445a5744788a6979108d95eba59c98fe4602ae2ded0ec087c19fc6e0b`,
and Keccak-256
`0xef209e54f557183eb15a068121c3668d349d2f245893345d747b4e09bb55826e`.
Those fixture hashes are not schema literals for all deployments. For any
authenticated constructor genesis, derive its 32-byte ABI word, append the word
to the frozen creation/runtime-template bytes, recompute the initcode and final
runtime hashes and lengths, and bind those values in the v2 commitment. Word,
initcode SHA-256, runtime SHA-256, and runtime Keccak-256 must all agree.

A pointer to a preconfigured Voter must prove direct code birth, zero prior
code, the successful creation receipt, complete authenticated history of the
four tracked nested-state setters from birth through the pointer boundary,
strict post-birth chronology, exact replay, and zero later same-block relevant
setters when using block-end state. A pointer row may instead establish all four
nested values through post-pointer setters or use the explicit disabled-zero
branch; it may never guess target state. Exact physical setter logs can be
reused across proofs only with identical feed-wide transaction/call/log
identity.

Complete human/delegated/YBC labels require one transaction-bound invocation
identity `chainId:votingAddress:transactionHash:voterCallTraceAddress`. Public
selectors are `vote_yea(address,uint256) = 0x69586e2e` and
`vote_nay(address,uint256) = 0xff855dde`. Use unfiltered geth
`debug_traceTransaction`/`callTracer` with `onlyTopCall:false`, `withLog:true`,
and `reexec:0`. For outer Voter path `P`, emitted human/delegated/YBC Vote calls
are `P+[1]`, `P+[4]`, and `P+[5]`; only the direct-root fixture has `P=[]`. That
identity is unique feed-wide and binds one proposal, caller, selector, target,
parent/child trace paths and depths, membership, aggregator result, and every
emitted Vote. Ordinal `0` is one nonzero positive-weight human. A nonmember or
member with aggregator return zero emits only `{0}`. A member with a positive
aggregator return emits the exact log-ordered `{0,1,2}` human/delegated/YBC
triplet; ordinals `1` and `2` share aggregate Yea bps, while their event weights
remain independent absolute Voting measurements. One complete pinned caller may
submit only once per proposal. Missing, extra, orphaned, duplicate, standalone,
ambiguous, or out-of-order aggregate events reject.

Replay pinned Voter `ybc_votes` per Voter/Voting/proposal in canonical invocation
order. Each positive aggregator return updates checked cumulative weight and
Yea from the Yea/Nay selector; delegated and YBC logs must both equal
`floor(10000*cumulativeYea/cumulativeWeight)`. Event multiplication, cumulative
updates, running last-write totals, and passage multiplication are checked
uint256 operations. Each emitted Vote weight is at most
`floor(UINT256_MAX / 10000)`; `10000 * yea`, cumulative aggregate weight/Yea,
replayed proposal total/Yea/Nay, and `yea * 10000` for passage must not
overflow. A prior positive trace-unavailable Vote by the same caller also
consumes the one-submission guard.

If pinned implementation proof exists but trace or transaction provenance is
unavailable, retain the raw Vote as `pinned_voter_trace_unavailable`, with null
trace, typed failure, and `actorKind: unclassified`. A custom/unverified Voter
uses `unverified_voter_unclassified`; a zero Voter cannot emit a canonical
Vote. Neither unclassified variant may claim binary-human or aggregate
semantics. Human votes have binary direction. Aggregate and unclassified votes
keep `direction: null`; human participation becomes an exact lower bound with
the classified-human and unclassified-event counts. Aggregate weights overwrite
the actor's absolute contribution; they are not increments.
A positive `pinned_voter_trace_unavailable` invocation can hide a cumulative
`ybc_votes` mutation. Without an independently authenticated cumulative seed,
no later `returned_positive` invocation may restart exact aggregate replay at
zero; all later aggregate-dependent Vote records must cascade to the same raw,
unclassified representation. The accepted `10000 -> 5000` regression proves
that only the all-later-raw form is truthful after the first opaque Yea.

### Rules, content, scripts, and failures

Only the approval threshold is snapshotted. Preserve both accepted 5,000 and
6,000 bps vectors, the positive-total requirement, and no minimum turnout.
Version 1 does not retain global `SetThreshold` history. Each proposal instead
binds an independent Propose-block storage proof: pinned Vyper `proposals`
mapping base slot `17`, preimage `bytes32(17) || bytes32(proposalId)`, threshold
struct offset `4`, exact resolved slot/raw word, decoded basis points, and
archive-RPC or committed-synthetic evidence. Both copied threshold values must
equal that proof. Keep one ordered `configurationHistory` per Voting generation.
Vote-start offset/window, Voter decay, execution delay/guard, Voter,
delegated-staking/YBC aggregates, YBC weight aggregator, Executor, hook, weight
measure, proposal blacklist, operator, and guardian
are mutable observations with exact block/hash and transaction/log ordering.
Proposal rules copy the configuration effective at Propose and remain
historical disclosure; simulation uses that proposal-effective Executor. Vote
admission and actor evidence bind the configuration effective at the exact
event position. Execute delay, guard, and operator bind the Execute position.
`statusConfiguration` is the last configuration effective at the end of the
canonical block; top-level timing and raw `protocolStatus` are derived from
that snapshot-effective configuration. Never relabel proposal-time values as
snapshot-current truth.
Within a boundary, replay setter calls in strict canonical call/log order and
use the last mutation for each repeated field. In particular,
`set_hooks(A), set_hooks(B)` yields final hook `B`; reordering the canonical
positions changes which value is final. Both `set_propose_parameters` uint
arguments are structurally bounded before ABI encoding so all three safe parser
entry points reject `2^256` without throwing.

Generation genesis is immutable and `epochLengthSeconds` is exactly `1209600`.
When deployment time is known, pinned Voting construction requires
`deploymentTimestamp >= genesisTimestamp + 1209600`; an earlier deployment is
not a representable successful generation.
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
independent. Frozen labels are exactly `Voting.vy at pinned stYFI revision`,
`Voter.vy at pinned stYFI revision`, and
`Executor.vy at pinned stYFI revision`; copied or failure-path source records
must preserve them.

The exact Voting source URL is
`https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy`;
queries, fragments, alternate repositories/revisions/paths, credentials,
backslashes, controls, and noncanonical URL forms fail. The exact Executor
source is
`https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Executor.vy`.
Its source SHA-256 is
`0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1`;
the pinned Vyper import-tree source-integrity SHA-256 is
`0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b`.
Its exact preimage is the lowercase ASCII raw-source digest without `0x` or LF;
it is not compiler-distribution evidence. The compiler distribution and exact
stdout/raw-byte derivations are the official Vyper pins above.
The exact gas-optimized Cancun runtime is 1,157 bytes, with Keccak-256
`0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151`
and raw-runtime SHA-256
`0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c`.
Verified discussions use canonical
`https://gov.yearn.fi/t/<slug>/<positiveId>` paths whose original serialized
URL equals `${url.origin}${url.pathname}` exactly. Trailing slashes, ordinary
queries/fragments, and terminal bare `?` or `#` delimiters reject. Authoritative public
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
calls per proposal. A consumer safely admits fetched UTF-8 text through
`safeParseDaoFeedJsonV1`, which returns typed failure after checking the 64 MiB
byte cap before JSON parsing or deep structural/semantic traversal;
`parseDaoFeedJsonV1` is only the throwing convenience wrapper. Chain, contract,
emitter, and non-Vote
lifecycle identities plus provenance hashes are nonzero. Typed contract-valid
zero configuration addresses, zero Vote accounts, zero script targets,
content/asset digests, raw storage words, and uint topics remain representable.

## Cursor, retries, reorgs, and publication

Use an archive-capable Ethereum RPC. Select one canonical block and read all
logs, calls, configuration, content provenance, and simulation state against its
declared historical context. The required confirmation threshold is exactly
`8`; `observedConfirmations` equals head minus canonical block and is in the
inclusive range `8..10000`. Feed `generatedAt` equals
`publication.publishedAt`; that instant cannot precede the canonical-block
timestamp or any known finality-head timestamp.

The cursor records chain ID, the earliest configured contract start block, last
block number/hash, and next block. Its start must equal that earliest start and
may never skip it. The last block is the canonical block and next is exactly
last plus one. On a stored-hash mismatch, find the common ancestor and replay
from exactly the following block. An ordinary `recovered` reorg identifies the
same non-null prior stable snapshot in `previousSnapshotId` and
`replacedSnapshotId`. Before the first stable snapshot,
`recovered_before_first_stable_snapshot` keeps both IDs null and still binds the
common ancestor and exact replay start. Never invent a prior snapshot identity.

Content and asset fetches use exactly `maxAttempts: 8` and policy
`fixed_120_seconds`. Every `lastAttemptAt` is at or before feed generation and
publication; a failure's `observedAt` equals that last attempt. A retryable
failure with attempts left is `scheduled`, with
`nextRetryAt = lastAttemptAt + 120 seconds`, and that instant must follow the
snapshot. Non-retryable, exhausted, and succeeded records keep no next retry or
backoff. Snapshot publication permits at most 16 attempts. A
`succeeded_after_retry` publication retains a retryable preceding failure, a
non-null prior stable snapshot ID, and succeeds exactly 120 seconds later at
`publishedAt`. A first-ever failed publication followed by success uses
`succeeded_after_bootstrap_retry` with `previousSnapshotId: null`; it retains the
same exact failure/backoff evidence without inventing a snapshot identity. A
first attempt binds its last attempt directly to `publishedAt`.

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
  canonical public routes. Topic serialization must equal origin plus pathname;
  trailing slashes and terminal bare `?`/`#` delimiters reject. It must reject
  category `42` rather than treating it as a fixture or deployment assumption.
- Historical configuration and simulation proof acquisition:
  `[UNRESOLVED — WP9 must name the archive calls and retained raw-result object
  keys that prove deployment/genesis, the deployment-to-start bootstrap scan,
  zero omitted lifecycle logs, every tracked Set* log, successful receipt, and
  unfiltered callTracer transaction partition. Later rows require real final
  canonical setter-log anchors, complete setter-history replay and state
  projections, including Voter decay. A pointer to a preconfigured Voter
  requires direct top-level code-birth proof plus its complete four-setter
  history; this v1 restriction and live compatibility remain producer-owned.
  Each proposal threshold requires its exact Propose-block storage proof. Live
  Voter/Executor/Voting code must use archive evidence rather than fixture
  projections. Every live header, receipt, code, storage, and log-replay branch
  must retain both its exact successful result-token digest and immutable object
  key; creation-stage receipts also bind sender equal to decoded proposer.
  Multiple generations require address-scoped bootstrap queries and the exact
  inclusive retirement/successor-deployment cutover. All known block times must
  rise strictly with height across the complete retained evidence set. A
  completed simulation additionally requires chain ID `1`, exact proposal-
  position Executor authorization and zero later same-block relevant
  SetOperator logs; otherwise it is unavailable. WP9 must reproduce the
  engine-injected frame and v4 origin/header/receipt/fork/blob/gas/access/warm/
  code/state/authorization commitment. Any unproved complete simulation remains
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
npx vitest run --configLoader runner --no-cache tests/unit/lib/schemas/dao-feed.test.ts
npm run typecheck -- --incremental false
npm run lint
npm run test
git diff 75f3fd5a4395f1a3c2082d5b39c7f7a5c3243ed6 --check
```

At schema commit `2e83910d5e41769305433c81c15915833a8bdf0b`, the focused
suite passes 152 tests, the standard full suite passes 1,343 tests in 140 files, and
typecheck, lint, and full-range `git diff --check` pass. Two consecutive
`npm run generate:dao-feed` runs produced byte-identical artifacts. The
one-pass 114-vector semantic loop has an explicit 20-second local timeout, and
the all-114 × direct/wrapper/raw-JSON totality loop has an explicit 30-second
local timeout. Both are intentionally large adversarial matrices; the
unmodified standard full command is green. The exact artifact SHA-256 values are:

- JSON Schema:
  `62eecc3be69a9bd687a49c42aac8e3acfe4feab626418673d63485a9a379597f`;
- accepted feed:
  `5b957de34e3dabad0fc250794858feba9e94e1a227c460ad9cf862b19eb6023b`;
- rejection vectors:
  `00a86c69d63ac8c10dd5b8a0bfbf3485e77d4562ec095060b81f52d8a1145975`;
- mock-state map:
  `f440e709ef5c036c98d59ba03dd30af9b40aa6b6f979d1da833866765843335e`;
- creation-stage example:
  `660463815a1715da9f31453ff2da131f9764b34d8e1e8c76167fde94a8d24b8e`.

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

The return package must include the producer package range and no-fast-forward
integration merge, contract/deployment/start/genesis/bytecode pins, Rust fixture
locations for all 27 proposals, 81 lifecycle events, 23 mock mappings, 14
completed conditional simulations, and 114 rejection vectors, plus all
validation output. It must return the archive-RPC methods and exact raw-result
byte/object evidence; deployment-to-start bootstrap scan/replay; every real
canonical setter-log boundary; Voter decay and authenticated preconfigured-
Voter code-birth/history proof; per-proposal threshold storage proof; the
feed-wide block/hash/timestamp/log/transaction/call registry; exact snapshot-
effective status timing and event-effective capability checks; and typed zero-
state vectors. Classified Votes require exact Voter source/compiler/build/code
and complete invocation-trace evidence, feed-wide invocation identity,
log-ordered ordinals, cumulative checked aggregate replay, caller uniqueness,
and lower-bound accounting for trace-unavailable raw Votes. A positive opaque
pinned invocation forces all later aggregate-dependent records to remain raw
unless an authenticated cumulative seed is returned. The package must also
return dynamic Voter constructor-word/initcode/runtime derivation, repeated-
setter last-write replay, and safe uint256 setter rejection evidence.

It must also return the root-5 forum metadata lookup and exact canonical topic
serialization rejecting trailing slash and terminal bare `?`/`#`, exact arbitrary-byte
content and expected/computed digest/CID vectors, fixed retry evidence, cursor/
reorg recovery evidence, and exact object/state/history paths. For simulations,
return the exact Vyper layout and Voting transition proof, real Voting/Executor
code and pinned Executor build evidence, authenticated hypothetical origin,
engine-injected caller chain, injector revision/artifact, authenticated Propose
header and receipt, positive-u64 base fee/gas limit, Osaka/BPO2 block/blob
context, deterministic frame-gas/effective-price derivation, exact warm/frame/
calldata inputs, mainnet `chainId = 1`, all six archive raw-digest/object-key
pairs (or exact synthetic-null/projection alternatives), Executor authorization
storage/log replay and result stage, all
six nontransactional disclosures, recomputed v4 `contextInputsSha256`, and the
conditional result. Every unresolved simulation must use the `unavailable`
variant with completed frame/context/result fields null and its required typed,
non-null error retained. `simulatedAt` and `error.observedAt` are either the same
known instant or both null when the attempt time is unproven. A custom or zero
Executor must also return unavailable analysis without guessed framing. Finally,
return a byte hash of the accepted
staging or local payload and every unresolved assumption with an owner. The
minimum unresolved set includes the producer integration lane/worktree,
portable repository URL, live archive RPC/deployment pins, staging/stable and
retention keys, local cursor paths, bounded timeouts, the strict bootstrap
compatibility check, the direct-code-birth restriction for preconfigured
Voters, zero later same-block relevant SetOperator proof for completed
simulations, live forum metadata acquisition, and a repository-owned integration
test command. No fixture-only derivation may be reported as live evidence. The
frontend remains mock-backed until that handoff is independently accepted.
