# DAO Governance Contract Reference

Status: reviewed against stYFI governance commit
[`9395d5e`](https://github.com/yearn/stYFI/tree/9395d5e6fffdfe21fda32af94d32fca1a4f7840b).
The source PR remains open, so this document is a pinned integration reference,
not a claim that the contracts are deployed or final.

Rechecked on 2026-08-18: PR #5 remained open and its head was observed at
`168a99570044e771e8e081b3f4f5d2b6dd59f79c`. This integration reference remains
deliberately pinned to `9395d5e`.

Primary contracts:

- `contracts/governance/Voting.vy`
- `contracts/governance/Voter.vy`
- `contracts/governance/Executor.vy`
- `contracts/governance/WeightMeasure.vy`
- `contracts/governance/VoteBoostRewardDistributor.vy`

## 1. Time model

- Epoch length is 14 days.
- A proposal created in epoch `N` is assigned voting epoch `N + 1`.
- Voting opens at the configured `vote_start` offset within that epoch. The
  constructor default opens voting halfway through the epoch.
- `vote_start` and voting length are live global configuration, not proposal
  snapshots. `status()` and `vote()` read the values effective when they run, so
  a later change can alter an existing proposal's opening interval and raw
  status. The feed keeps the Propose-effective values as historical disclosure,
  admits each Vote under its event-effective values, and derives snapshot timing
  and raw status from values effective at the end of the canonical block.
- `vote_start + voting length` equals the fixed epoch. The setter permits the
  disabling boundary `vote_start = epoch length` and `voting length = 0`; no
  Vote timestamp can fall inside that empty interval, and the proposal remains
  `PROPOSED` through its voting epoch before passage logic applies.
- An approved executable proposal can execute only in epoch `N + 2`, after the
  configured execution delay and before that epoch ends.
- Contract parameters are live configuration. The app must not hardcode launch
  values for vote length, execution delay, threshold, proposal weight, cooldown,
  guard mode, or role addresses.

All countdowns use chain time in live mode and deterministic mock time in mock
mode.

## 2. Proposal record

The stored proposal contains:

- proposer;
- voting epoch;
- `bytes32` IPFS value;
- execution script hash;
- snapshotted approval threshold;
- total and Yea voting weight;
- retracted, executed, flagged, and vetoed booleans.

The contract does not store the execution script or flag/veto reasons in the
proposal struct. The `Propose` event emits the full script. `Flag` and `Veto`
events emit their reasons.

Canonical application identity is:

```text
chain ID + Voting contract address + numeric proposal ID
```

The numeric ID alone is not stable across replacement Voting contracts.

Proposal creation learns that identity only from a successful receipt. The
receipt transaction hash must equal the submitted hash and exactly one
`Propose` log must come from the expected Voting address. Its proposal ID,
proposer, voting epoch, content digest, and exact script are decoded and checked
against the submitted values. Chain context is supplied separately; it is not
trusted from receipt data. Missing, duplicate, malformed, wrong-contract, or
mismatched logs produce no proposal link.

The event log must contain exactly four canonical topics. After decoding, the
consumer re-encodes the selector, indexed proposal ID, proposer, and epoch, plus
the non-indexed content digest and script. The re-encoded bytes must equal the
receipt bytes. Extra topics, dirty address padding, trailing data, alternate
dynamic offsets, and nonzero padding are malformed and produce no identity.

## 3. Passing rule and quorum

A proposal passes when:

```text
total votes > 0
and
Yea weight / total weight >= the proposal's snapshotted threshold
```

There is no minimum turnout or quorum. The threshold is copied into the proposal
at creation, so later global threshold changes do not affect existing proposals.
The pinned Voting constructor default is 5,000 basis points. Normal deterministic
fixtures use that 50% default; one historical fixture retains a 6,000-basis-point
snapshot. A live deployment's mutable threshold, vote duration, execution delay,
and guard remain observed configuration and must carry the observation block.

## 4. Voting

Users submit Yea or Nay through `Voter`, not directly to `Voting`.

- The public Voter permits one user submission per proposal.
- The effective weight can decay near the end of the voting epoch.
- A zero effective weight reverts.
- A YBC member vote also updates blended YBC and delegated stYFIx aggregate votes.
- Each proposal vote counts toward vote-boost participation regardless of Yea or
  Nay direction.

The raw `Voting.vote` entry point can overwrite a vote, but only the configured
Voter may call it. The public app follows the one-vote rule enforced by `Voter`.

Pinned setters also admit disabling zero addresses. Voting's Voter, hook, weight
measure, and operator may be zero; the Executor is zero before its required
nonzero setter initializes it. The pinned Voter's delegated-staking, YBC, and
YBC-weight-aggregator addresses may be zero. These states have different
effects and must not be collapsed into `null` or a generic unavailable flag:
zero Voter or weight measure disables Vote, a zero hook rejects positive-weight
Vote, zero YBC atomically reverts a pinned-Voter submission, and zero operator
blocks Flag and guarded Execute but not permissionless Execute. A zero delegated
aggregate account can be emitted by the pinned Voter when the aggregate path is
otherwise valid.

Human and aggregate labels require effective Voter implementation evidence and
a transaction-bound call trace. The exact Voter source is
`contracts/governance/Voter.vy` at revision
`9395d5e6fffdfe21fda32af94d32fca1a4f7840b`, SHA-256
`0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab`,
compiled with `vyper@0.4.2`, gas optimization, and Cancun. Archive code evidence
and a reproducible build must match at the effective configuration position.
Custom or unverified Voters preserve raw Vote data as unclassified; they do not
inherit pinned-Voter binary-human or aggregate semantics.

## 5. Veto behavior

Veto has two branches that the UI must keep distinct.

### Before any votes

- `vetoed` becomes true;
- `retracted` also becomes true;
- the retraction hook removes the proposal from participation accounting;
- later voting fails because retracted proposals cannot receive votes.

### After votes exist

- `vetoed` becomes true;
- `retracted` remains false;
- the retraction hook does not run;
- approval and execution are permanently disabled;
- remaining users can still vote during the voting window because `vote` rejects
  retracted proposals but does not reject vetoed proposals.

This branch preserves equal access to vote-boost participation after some users
have already voted. The mock suite and fork suite must include an explicit vote
after a post-vote veto, even though the pinned contract tests do not yet cover
that exact call sequence.

## 6. Proposal eligibility and shared cap

Proposal creation requires:

- weight at or above the live `propose_min_weight`;
- no match in the live proposal blacklist;
- the account's live cooldown to have elapsed.

The configured voting hook can also reject creation. In the pinned
`VoteBoostRewardDistributor`, one proposal increments the proposal count for six
reward epochs, starting with its voting epoch. Every affected epoch has a shared
limit of 64 proposals. Creation reverts if any of those six counts is already 64.
This is a system-wide rolling capacity rule, not a per-proposer allowance.

The authoring client must expose all six current counts and derive `canPropose`
from live hook state. The UI uses `Proposal capacity is full` as the primary
reason and may disclose the first full epoch.

## 7. Retraction and flagging

### Proposer retraction

The proposer may retract before or during the assigned voting epoch if:

- the proposal has no votes;
- it is not already retracted;
- it is not vetoed.

Retraction does not reset the proposer's cooldown.

### Operator flag

The operator may flag a malformed or spam proposal through its voting epoch only
while it has no votes. Flagging also retracts it and removes it from participation
accounting.

Flag and veto reasons are event data. Feed-backed history must retain them.

## 8. Status and display mapping

The contract's `status()` gives terminal booleans priority over time-derived
phases. Its time-derived phases use the current live vote timing described
above, not the timing effective when the proposal was created. Application
actions must therefore be derived separately.

| Raw status | Default display | Notes |
| --- | --- | --- |
| `PROPOSED` | Discussion | Waiting for the vote window |
| `VOTING` | Voting | Yea/Nay available when account eligibility permits |
| `PASSED` | Approved | Executable proposals may be waiting for execution |
| `FAILED` | Rejected | Threshold was not met or no votes were cast |
| `EXECUTED` | Executed | Use `Approved` instead when the script is empty |
| `EXPIRED` | Expired | Approved executable proposal missed its execution epoch |
| `RETRACTED` | Retracted | No further vote or execution |
| `FLAGGED` | Flagged | Invalid or spam proposal; no further vote |
| `VETOED` | Vetoed | `canVote` may still be true after prior votes |
| `INVALID` | Not found | ID is outside the contract proposal range |

Never map raw status directly to button availability.

## 9. Signal proposals

An empty script has the fixed `keccak256("")` hash. The stored script hash is
authoritative for type even when exact event bytes are unavailable: that one
hash is Signal and every other hash is Executable. Retained bytes independently
verify integrity. A passed empty-script proposal reports `PASSED` during the
following epoch and later reports `EXECUTED` without requiring an executable
call.

User-facing behavior:

- type: `Signal`;
- final decision: `Approved`;
- supporting text: `No executable actions`;
- do not imply that protocol calls ran.

## 10. Execution scripts

The Executor script is a byte sequence of up to 64 calls and 2,048 bytes total.
Each call is:

```text
32-byte header + calldata
```

The header packs the 20-byte target in its high bytes and the calldata length in
its low 12 bytes. Calls execute in order and atomically. One revert fails the
whole execution. The Executor does not attach native ETH value.

Before proposal submission, the browser checks only:

- valid even-length hex;
- complete 32-byte headers;
- declared calldata fits in the remaining bytes;
- parsing ends exactly at the final byte;
- no more than 64 calls;
- no more than 2,048 bytes;
- the displayed script hash matches the entered bytes.

These checks prove structure, not safety. Semantic decoding and the stored
proposal-time simulation belong on the backend. Execution uses a fresh
current-state simulation.

## 11. Proposal-time simulation

The backend simulation is not a normal `Voting.execute` call at the proposal
block. That call would fail the proposal status and time gates before the voting
and execution epochs.

The producer may simulate the ordered script atomically in a disclosed,
conditional proposal-time Executor-frame scenario. A completed result records:

- the simulation method and engine;
- state block number and hash;
- simulated timestamp;
- the authenticated hypothetical transaction origin;
- the nested-frame caller chain and any state or timestamp overrides;
- the real code addresses, operator check, and absence of code overrides;
- the initial frame gas, effective gas price, envelope, access list, and warm-set
  policy;
- whether the complete ordered script succeeded atomically;
- revert or unavailable reason.

A bare top-level `Executor.execute` call with caller set to Voting is not
equivalent because `tx.origin` becomes Voting. An ordinary deployed harness also
changes an observable caller or code identity. Version 1 therefore uses an
engine-injected Executor frame at the Propose block: the authenticated Propose
sender is a frozen hypothetical origin, Executor sees `CALLER = Voting`, targets
see `CALLER = Executor`, real Voting and Executor code remains present, and only
the proven proposal-specific `executed: false -> true` transition is applied.
The record also freezes initial Executor-frame gas, effective `GASPRICE`, a
synthetic legacy no-blobs envelope, empty access list, and the Cancun warm set
for origin, Voting, Executor, and precompiles with no prewarmed storage. A
recomputed SHA-256 commitment binds those inputs to the block, caller chain, and
injector artifact.
Success or revert is conditional on that exact recorded scenario, not a promise
about the unknown future execution origin. If the origin, frame, code, state,
time, gas/access context, or script cannot be proved, the result is
`unavailable`. ABI decoding is independent: an unknown function can still
simulate, and a decoded function can still revert.

This stored result is historical analysis. Execution still requires a fresh
normal simulation through the current Voting contract and current state.

## 12. Events and feed ownership

`gov-apps-stats` must retain:

- `Propose`, including the exact script;
- `Vote`, with aggregate actors classified separately;
- `Retract`;
- `Flag`, including reason;
- `Veto`, including reason;
- `Execute`;
- canonical block, producer-owned block timestamp, nullable transaction hash,
  transaction index, and log index.

The browser must not substitute local time when an event timestamp is missing
and must not invent a transaction link for a direct-contract or incomplete
historical record. Technical details retain every available identity field.

Known-call decoding uses an exact GitHub record: source kind, repository, label,
canonical blob URL, 40-hex revision, and normalized source path. WP7B pins the
Voting source to exact stYFI revision
`9395d5e6fffdfe21fda32af94d32fca1a4f7840b`. Other hosts, credentials, query,
fragment, controls, traversal, and noncanonical paths are invalid. That record
proves the source used for decoding; it does not prove that a mock address is
deployed. Unknown calls have no verified source.

The producer verifies `keccak256(eventScript) == storedScriptHash`, fetches IPFS
content, decodes known calls, runs the proposal-time simulation, and publishes a
versioned feed. Browser code must not scan full historical logs.

## 13. Content and asset authentication convention

The application convention fixes the contract's 32-byte value as the SHA-256
digest of the exact fixed-order proposal-content JSON bytes, including the one
required final LF. The content CID is
the CIDv1/raw/SHA-256/Base32 representation of those same bytes. Producers and
consumers verify this byte-to-digest-to-CID round trip from fixed vectors; they
do not reserialize a parsed object to choose its digest.

Each asset-manifest digest authenticates one independent raw asset block. A
relative manifest attachment such as `./assets/diagram.svg` is an exact logical
lookup of the manifest path, not an IPFS descendant of the content CID. Its
CIDv1/raw/SHA-256/Base32 asset CID is derived from the matching digest. A direct
`ipfs://` attachment contains exactly that canonical raw asset CID with no
path, slash, query, or fragment and must match exactly one manifest digest.
Both forms resolve to `https://ipfs.io/ipfs/<assetCid>` with no suffix.

Duplicate normalized paths or duplicate digests fail validation. The manifest
allows at most 16 assets. Each path is at most 512 UTF-8 bytes, each media type
at most 127 UTF-8 bytes, each raw asset at most 2,097,152 bytes, and all declared
assets together at most 33,554,432 bytes. Image metadata is bounded to 8,192 px
per dimension and 33,554,432 pixels. The 2 MiB per-asset bound keeps one asset
within one raw block for the intended IPFS block-exchange and pinning paths.

M2 uses deterministic pre-pinned vectors. M5 owns creation, round-trip checks,
multi-provider pinning, and retention of the independent content and asset raw
blocks. A live contract deployment still needs explicit confirmation that it
uses this convention before writes are enabled.

## 14. Known integration checks

- The pinned contract requires a proposal cooldown of at least one day, while
  several pinned tests configure zero. Treat the branch test suite as moving.
- The open PR has no final deployment manifest in this repository.
- Role addresses, proposal parameters, execution guard mode, and confirmation
  that a live Voting deployment uses the fixed digest convention remain
  live-integration inputs, not mock blockers.
