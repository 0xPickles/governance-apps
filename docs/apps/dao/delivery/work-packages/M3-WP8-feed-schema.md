# M3 WP8: Feed Schema and Producer Brief

Branch: `agent/dao/m3/wp8`

## Objective

Freeze the versioned DAO feed contract and exact `gov-apps-stats` handoff from
the accepted mock domain.

## Depends on

- User-accepted M2.

## Scope

- JSON schema, TypeScript/Zod boundary, and example payload.
- Canonical block, contract generation, and composite proposal identity.
- Events, script, hash verification, IPFS, discussion, moderation, votes,
  decoding, simulation, and failure fields.
- Exact reviewed Markdown source, fixed-order content JSON with its final LF,
  the SHA-256 onchain digest, the CIDv1/raw/SHA-256/Base32 content CID, the WP7B
  bounded asset manifest, and the accepted parser/error vectors. Consumers do
  not reserialize parsed content to choose its digest. Invalid fetched content
  retains exact arbitrary bytes as Base64 without imposing UTF-8, JSON, or final
  LF rules.
- Independent raw asset CIDs derived from manifest digests. A relative manifest
  attachment is an exact logical path lookup, never a content-CID descendant;
  a direct `ipfs://` attachment has no path, slash, query, or fragment. Both
  resolve to `https://ipfs.io/ipfs/<assetCid>` with no suffix.
- Proposal-time simulation method, engine, explicit transaction origin,
  nested-frame/harness provenance, caller chain, real code context, strict
  gas/envelope/access/warm-set inputs and commitment, state block and hash,
  timestamp treatment, state/time overrides, atomic conditional result, and
  failure state.
- Exact GitHub verified-source kind, repository, label, canonical authoritative
  blob URL, revision, and normalized source path. A source may prove decoder
  provenance but not a mock deployment; unknown calls have no verified source.
- Producer-owned canonical event timestamps, nullable transaction hashes, full
  block/transaction/log identity, truthful actor roles, and moderation reasons.
- Block-global Ethereum `logIndex` uniqueness across proposals, transactions,
  and Voting generations.
- Proposal-owned rule snapshots: 5,000-basis-point normal default, retained
  6,000-basis-point alternate, positive-total requirement, no minimum turnout,
  proposal type, Propose-effective historical configuration, event-effective
  Vote timing, snapshot-effective raw status/timing, execution delay/guard,
  Voting identity/source, and exact configuration observation position.
- Typed zero/disabling configuration states and per-configuration pinned Voter
  source/build/archive-code provenance. Human and aggregate Vote labels require
  transaction-bound call-trace evidence; unverified Voters remain unclassified.
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
- Consumer tests reject incompatible or internally inconsistent examples.
- Consumer tests reject unsafe/incomplete verified sources, substituted event
  or creation time, receipt/log mismatches, inconsistent live/proposal/snapshot
  configurations, unproved Voter labels, and origin/frame substitutions.
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
- Standard repository checks.

## Review

Consumer schema reviewer, contract-event auditor, and producer representative.
Merge before work begins in `gov-apps-stats`.
