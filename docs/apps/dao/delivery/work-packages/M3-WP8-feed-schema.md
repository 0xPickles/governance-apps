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
  canonical accepted bytes cannot be relabeled invalid.
- Independent raw asset CIDs derived from manifest digests. A relative manifest
  attachment is an exact logical path lookup, never a content-CID descendant;
  a direct `ipfs://` attachment has no path, slash, query, or fragment. Both
  resolve to `https://ipfs.io/ipfs/<assetCid>` with no suffix.
- Proposal-time simulation method, engine, explicit transaction origin,
  nested-frame/harness provenance, caller chain, real code context,
  authenticated Propose header and receipt, deterministic frame gas
  `min(block gasLimit, 30,000,000)`, receipt-derived effective gas price,
  header base fee and fee-consistency check, envelope/access/warm-set inputs,
  versioned v2 commitment, state block and hash, timestamp treatment,
  state/time overrides, atomic
  conditional result, and failure state. Analysis, completed simulation, and
  unavailable-attempt timestamps must stay between known Propose time,
  analysis generation, and feed publication; failed/unavailable attempt and
  failure times agree exactly when present.
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
- Typed zero/disabling configuration states, including proposal blacklist, and
  the exact event-effective call matrix. Retract and Flag use running
  last-write-per-account totals, so zero-weight Vote history is valid. Vote
  multiplication and every running-total update use checked uint256 arithmetic.
- Per-configuration pinned Voter source/build/archive-code provenance, with its
  constructor genesis independent of Voting genesis and bound by a deterministic
  source/compiler/runtime/build-evidence commitment. Complete classification
  requires feed-wide transaction-and-trace invocation grouping: one positive
  nonzero human ordinal, a human-only skipped/zero outcome, or the ordered
  human/delegated/YBC triplet in canonical log order, with one complete pinned
  caller submission per proposal. Pinned trace-unavailable and custom Voter records
  remain raw and unclassified; human participation becomes an explicit lower
  bound.
- Per-configuration Executor evidence discriminates verified pinned, custom
  unverified, and constructor zero. Exact pinned source/build/runtime/archive
  pins alone authorize script framing and a completed simulation. Custom or
  zero implementations retain byte/hash evidence, but executable scripts use
  `implementation_unverified` and analysis/simulation are fully unavailable
  with exact implementation provenance. Empty-signal
  framing remains independently knowable.
- Receipt-derived composite identity. Creation evidence binds a successful
  transaction hash and exactly one matching Voting `Propose` log to proposer,
  voting epoch, content digest, and exact script. Awaiting-index and indexed
  records retain that same ref.
- Human vote versus YBC/delegated aggregate classification.
- Authoritative forum root category `5` and exact allowed descendant ancestry.
- Producer start blocks, confirmation, fixed retry/backoff, cursor, reorg, and
  atomic-publication requirements.
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
  a reproducible v2 input commitment. Missing evidence, signal scripts, and
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
  per-config Executor evidence, deterministic gas/header/receipt inputs, v2
  commitments, and complete/unavailable simulation chronology.
- Standard repository checks.

## Review

Consumer schema reviewer, contract-event auditor, and producer representative.
Merge before work begins in `gov-apps-stats`.
