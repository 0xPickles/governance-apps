# M3 WP8: Feed Schema and Producer Brief

Branch: `agent/dao/m3/wp8`

## Objective

Freeze the versioned DAO feed contract and exact `gov-apps-stats` handoff from
the accepted mock domain.

## Depends on

- User-accepted M2.

## Scope

- JSON schema, TypeScript/Zod boundary, and example payload. Direct schema safe
  parse must be total for structured semantic mutations. The consumer wrapper
  rejects non-serializable or oversized values before traversal; raw-JSON safe
  parse handles malformed or oversized text. Each returns typed failure without
  throwing.
- Canonical block, contract generation, and composite proposal identity.
- Events, script, hash verification, IPFS, discussion, moderation, votes,
  decoding, simulation, and failure fields.
- Exact reviewed Markdown source, fixed-order content JSON with its final LF,
  the SHA-256 onchain digest, the CIDv1/raw/SHA-256/Base32 content CID, the WP7B
  bounded asset manifest, and the accepted parser/error vectors. Consumers do
  not reserialize parsed content to choose its digest. Invalid fetched content
  retains exact arbitrary bytes as Base64 without imposing UTF-8, JSON, or final
  LF rules. Those bytes must reproduce the exact first typed failure across
  digest, UTF-8, JSON, schema/domain, final-LF, and canonical-order checks;
  canonical accepted bytes cannot be relabeled invalid, and regex-shaped
  impossible RFC 3339 calendar instants fail schema reproduction.
- Independent raw asset CIDs derived from manifest digests. A relative manifest
  attachment is an exact logical path lookup, never a content-CID descendant;
  a direct `ipfs://` attachment has no path, slash, query, or fragment. Both
  resolve to `https://ipfs.io/ipfs/<assetCid>` with no suffix.
- Proposal-time simulation method, engine, explicit transaction origin,
  nested-frame/harness provenance, caller chain, real code context,
  authenticated Propose header and receipt, deterministic frame gas
  `min(block gasLimit, 30,000,000)`, receipt-derived effective gas price,
  header base fee and fee-consistency check, OSAKA/BPO2 execution context,
  beneficiary/PREVRANDAO/blob inputs, exact warm set and `execute(bytes)`
  calldata, conditional non-transactional gas-overapproximation disclosures,
  `yearn.dao.simulation-context-inputs.v4` commitment, state block and hash,
  timestamp treatment,
  state/time overrides, atomic
  conditional result, and failure state. Analysis, completed simulation, and
  unavailable-attempt timestamps must stay between known Propose time,
  analysis generation, and feed publication; failed/unavailable attempt and
  failure times agree exactly when present.
  Exact activation/fraction/initialization, REVM crate, fixture blob-fee
  comparison, and six gas-disclosure literals are normative in the canonical
  feed contract and generated JSON Schema.
- Exact GitHub verified-source kind, repository, label, canonical authoritative
  blob URL, revision, and normalized source path. A source may prove decoder
  provenance but not a mock deployment; unknown calls have no verified source.
- Producer-owned canonical event timestamps, nullable transaction hashes, full
  block/transaction/log identity, truthful actor roles, and moderation reasons.
- One feed-wide block-number/hash/known-timestamp registry across deployment,
  configuration, events, receipts, bytecode proofs, simulation evidence,
  cursor, and finality. Block-global Ethereum `logIndex` values are unique and
  rise strictly with transaction order across proposals and Voting generations.
- Proposal-owned rule snapshots: 5,000-basis-point normal default, retained
  6,000-basis-point alternate, positive-total requirement, no minimum turnout,
  proposal type, Propose-effective historical configuration, event-effective
  Vote timing, snapshot-effective raw status/timing, execution delay/guard,
  Voting identity/source, and exact configuration observation position.
- Strict configuration-boundary provenance: a logical `start_of_block` position
  first, backed by end-of-parent-block state plus a creation-through-parent scan
  proving zero omitted lifecycle logs and replaying every tracked setter. Each
  unique setter transaction binds sender, successful receipt, exact calldata,
  and unfiltered geth `callTracer` evidence. Later rows are anchored to their
  final real canonical Set* log, split around intervening lifecycle logs, and
  apply at and after that log. Bootstrap, boundary, preconfigured-Voter,
  authorization, and lifecycle logs share one feed-wide global log/transaction
  registry; configuration and Voter call evidence also shares sender/trace
  identity. The fixture uses deployment `23900000`, start
  `23900001`, nine bootstrap setters, and `config-2` at block `23902000`,
  transaction `0`, final global log index `9`, after ten retained setters.
- Typed zero/disabling configuration states, including proposal blacklist, and
  the exact event-effective call matrix. Retract and Flag use running
  last-write-per-account totals, so zero-weight Vote history is valid. Vote
  multiplication and every running-total update use checked uint256 arithmetic.
- Per-configuration pinned Voter source/build and archive-RPC or
  committed-synthetic code provenance, with its constructor genesis independent
  of Voting genesis and bound by the deterministic
  `yearn.dao.voter-build-evidence.v2`
  source-integrity/official-compiler/runtime-template/immutable/final-runtime
  commitment. Complete classification requires feed-wide
  transaction-and-full-call-trace invocation grouping: one positive
  nonzero human ordinal, a human-only skipped/zero outcome, or the ordered
  human/delegated/YBC triplet in canonical log order, with one complete pinned
  caller submission per proposal. The consumer replays cumulative `ybc_votes`
  and every intermediate/passage multiplication with checked uint256 arithmetic.
  Pinned trace-unavailable and custom Voter records remain raw and unclassified;
  human participation becomes an explicit lower bound.
- Exact public selectors are `vote_yea(address,uint256)` / `0x69586e2e` and
  `vote_nay(address,uint256)` / `0xff855dde`. For outer Voter trace path `P`,
  human/delegated/YBC calls are `P+[1]`, `P+[4]`, and `P+[5]`; the direct-root
  fixture alone uses `[1]/[4]/[5]`. Live traces use
  `debug_traceTransaction`/geth `callTracer` with `onlyTopCall:false`,
  `withLog:true`, and `reexec:0`; `rawTraceSha256` covers the exact retained UTF-8
  JSON-RPC result-object bytes before decoding or reserialization.
- Live transaction, receipt, trace, code, and log hashes all use the canonical
  feed contract's exact successful non-null top-level JSON-RPC result-token byte
  preimage and retain named object or manifest keys where the branch exposes
  them. Synthetic branches bind only their fixture projection and keep exposed
  live hash/key fields null.
- Pinned Voter and Executor proofs bind the official
  `vyper.0.4.2+commit.c216787f.linux` distribution, exact URI/size/SHA-256,
  source-integrity preimages, `-Werror -O gas --evm-version cancun` command
  strings, stdout and decoded-byte hashes, Voter layout/immutable/final runtime,
  and Executor creation/runtime/no-immutable facts frozen in the canonical feed
  contract.
- Voter decay is historical configuration. A pointer to a preconfigured Voter
  binds direct code birth, complete authenticated setter history from birth
  through the pointer boundary, strict post-birth chronology, replay of decay
  and all three aggregate addresses, and zero later same-block relevant setters
  when block-end state is used. A reused physical Set* log is ordered once and
  retains identical position, transaction hash, emitter, topics, and data;
  configuration and Voter call records additionally retain identical
  sender/caller/target/trace/calldata/decoded-mutation evidence.
- Per-configuration Executor evidence discriminates verified pinned, custom
  unverified, and constructor zero. Exact pinned source/build/runtime and live
  archive or committed-synthetic pins alone authorize script framing. A
  completed simulation additionally proves `Executor.operators[Voting]` at the
  exact Propose position from mapping slot `2`, block-end storage, canonical
  same-block SetOperator replay, and zero later relevant logs. Custom or
  zero implementations retain byte/hash evidence, but executable scripts use
  `implementation_unverified` and analysis/simulation are fully unavailable
  with exact implementation provenance. Empty-signal
  framing remains independently knowable.
- Receipt-derived composite identity. Creation evidence binds a successful
  transaction hash and exactly one matching Voting `Propose` log to proposer,
  receipt sender, voting epoch, content digest, and exact script. The receipt
  sender equals the Propose proposer. Awaiting-index and indexed records retain
  that same ref.
- Proposal threshold evidence independently binds the stored threshold at the
  Propose block from pinned Vyper mapping slot `17`, slot-then-key order, struct
  offset `4`, exact storage word, and decoded basis points. Both copied
  threshold fields equal that proof.
- Human vote versus YBC/delegated aggregate classification.
- Authoritative forum root category `5` and exact allowed descendant ancestry.
- Producer start blocks, exact eight-confirmation threshold (with greater
  observed depth allowed), fixed retry/backoff, bootstrap retry and reorg
  recovery without invented prior snapshot IDs, cursor, and atomic-publication
  requirements.
- Completed producer handoff copied from `producer-handoff-template.md`.

## Non-goals

- No producer implementation.
- No frontend feed wiring.
- No wallet-specific action eligibility in the feed.

## Acceptance criteria

- Every accepted mock state maps to the schema without optional-field guesswork.
- Browser code needs no historical log scan.
- Exact event script and its verification result are retained.
- Stored script hash determines Signal versus Executable even when bytes are
  unavailable.
- Unknown calls and failures remain representable.
- A time-gated `Voting.execute` at the proposal block is not accepted as the
  proposal-time simulation method.
- Failed and unavailable simulation states are distinct, completed results are
  conditional on the exact recorded origin/frame scenario, and decode status is
  independent.
- Completed simulation is impossible without exact pinned Executor evidence,
  exact retained hash-verified executable bytes and valid framing,
  authenticated Propose header and receipt, deterministic gas derivation, and
  a reproducible v4 input commitment including exact Executor-authorization
  storage/replay provenance. Missing evidence, signal scripts, and
  malformed or mismatched bytes produce a fully unavailable record.
- Consumer tests reject incompatible or internally inconsistent examples.
- Consumer tests reject unsafe/incomplete verified sources, substituted event
  or creation time, receipt/log mismatches, inconsistent live/proposal/snapshot
  configurations, unproved Voter labels, and origin/frame substitutions.
- Consumer tests reject conflicting block identities or timestamps across any
  evidence source, nonmonotonic block-global log order, false invalid-content
  codes, impossible zero-capability events, nonzero running totals before
  Retract/Flag, bad Voter invocation outcome sets, substituted Executor pins,
  and analysis/simulation chronology outside its proposal snapshot.
- Safe-parse tests prove total typed failure across accepted-vector mutations
  and every published rejection vector; semantic refinement does not escape an
  exception.
- Consumer tests enforce unique normalized manifest paths and digests and the
  WP7B bounds: 16 assets, 512 UTF-8 path bytes, 127 UTF-8 media-type bytes,
  2,097,152 bytes per asset, 33,554,432 aggregate bytes, 8,192 px per image
  dimension, and 33,554,432 image pixels.

## Validation

- Frozen artifact totals: 27 accepted proposals, 81 lifecycle events, 103
  committed rejection vectors, and 136 focused schema tests.
- Schema and example parsing tests.
- Semantic fixtures for veto branches, signal status, aggregate votes, missing
  content, partial decode, failed simulation, hash mismatch, missing event time
  or transaction, structured source, 5,000/6,000 rules, and each receipt/index
  identity stage.
- Accepted and rejected vectors for configuration transitions, disabling zeros,
  missing script bytes, exact source hosts, arbitrary invalid content bytes,
  Voter implementation evidence, forum ancestry, retry time/backoff, origin
  handling, and block-global log indices.
- Mutation/property coverage for safe-parse totality, exact invalid-byte failure
  reproduction, global block identity, cross-transaction log ordering,
  event-effective capability zeros, running vote totals, exact Voter invocation
  outcomes and trace-unavailable lower bounds, independent Voter genesis,
  per-config Executor evidence, deterministic OSAKA/BPO2
  gas/header/receipt/opcode inputs, v4 commitments, synthetic-vs-archive source
  tuples, exact threshold storage, bootstrap and setter-boundary replay,
  preconfigured-Voter code-birth/history, shared log/transaction/trace
  registries, exact-position Executor authorization/stages, and
  complete/unavailable simulation chronology.
- Standard repository checks.

## Review

Consumer schema reviewer, contract-event auditor, and producer representative.
Merge before work begins in `gov-apps-stats`.
