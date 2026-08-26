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
against the submitted values. The receipt sender must equal that Propose
proposer. Chain context is supplied separately; it is not
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
The first configuration is an exact start-of-deployment sentinel at transaction
and log zero. Every later entry binds one successful setter transaction, raw
calldata, and full trace path, and becomes effective before the first stated
subsequent log index. This makes same-block and same-transaction comparisons
deterministic without pretending the observation is a lifecycle log. When a
Voting deployment timestamp is known, it must satisfy the pinned constructor
precondition `deploymentTimestamp >= genesisTimestamp + EPOCH_LENGTH`.

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
measure, and operator may be zero. Executor and proposal blacklist begin at
constructor zero; after their nonzero-only setters initialize them, neither can
return to zero. The pinned Voter's delegated-staking, YBC, and
YBC-weight-aggregator addresses may be zero. These states have different effects
and must not be collapsed into `null` or a generic unavailable flag.

The event-effective call matrix is:

| Emitted event | Required nonzero/callable state before the log |
| --- | --- |
| `Propose` | proposal blacklist, weight measure, voting hook |
| `Vote` | Voter and weight measure; positive weight also needs the hook; pinned Voter needs YBC; a member aggregate path needs the aggregator |
| `Retract` | voting hook and a zero running vote total |
| `Flag` | operator, voting hook, and a zero running vote total |
| early-no-votes `Veto` | guardian and voting hook |
| post-participation `Veto` | guardian; this branch does not call the hook |
| nonempty executable `Execute` | Executor; guarded execution also needs the operator |
| empty signal `Execute` | no Executor call; guard rules still apply |

Running totals use the last absolute contribution for each account immediately
before the event. A prior zero-weight raw Vote does not block Retract or Flag;
a positive current contribution does. Zero Voter or weight measure disables all
Vote. A zero hook rejects positive Vote, but a zero-weight custom-Voter call can
still emit. Zero YBC atomically reverts a pinned-Voter submission. A zero
operator blocks Flag and guarded Execute but not permissionless Execute. A zero
delegated aggregate account can be emitted by the pinned Voter when the
aggregate path is otherwise valid. Each Vote multiplication and running total
must fit checked uint256 arithmetic at that event; a valid final total does not
excuse an intermediate overflow.

Human and aggregate labels require effective Voter implementation evidence and
a transaction-bound call trace. The exact Voter source is
`contracts/governance/Voter.vy` at revision
`9395d5e6fffdfe21fda32af94d32fca1a4f7840b`, SHA-256
`0x32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab`,
compiled with `vyper@0.4.2`, gas optimization, and Cancun. Archive code evidence
and a reproducible build must match at the effective configuration position.
Custom or unverified Voters preserve raw Vote data as unclassified; they do not
inherit pinned-Voter binary-human or aggregate semantics.

The compiler is the official Linux x86-64 Vyper `v0.4.2` release asset at commit
`c216787f5e355478733a05fa5f0fce93fa9a7126`, 23,495,192 bytes, SHA-256
`0x7cc4214671dc78db8a3962f103bead22dd76b55ee370d6d333122e7f3368f4fa`.
The Voter source-integrity digest is
`0x90d458df8321d2c845ad1a153b21fea3eeb6fa746feecc57d15beec3ae5f192d`;
it hashes the Vyper import tree and is not a compiler-distribution hash.

The Voter's immutable genesis is a constructor input proved by its own build and
archive evidence. It does not have to equal the Voting contract generation's
genesis timestamp, but it must not follow any Vote event that implementation
could emit. The feed's `yearn.dao.voter-build-evidence.v2` commitment binds that
constructor value to the pinned source/compiler distribution, exact commands
and stdout, runtime template and layout, immutable word, final runtime, code
evidence, and build artifacts; a timestamp-only rewrite is invalid.

Complete pinned classification groups logs by chain ID, Voting address,
transaction hash, and outer Voter call trace address. `vote_yea(address,uint256)`
is selector `0x69586e2e`; `vote_nay(address,uint256)` is `0xff855dde`. Ordinal `0` is one
nonzero, positive-weight, binary human Vote bound to the outer caller and
selector. A nonmember skips aggregation and produces only ordinal `{0}`. A
member whose configured aggregator returns zero also produces only `{0}`. A
positive aggregator return produces exactly the ordered `{0,1,2}` human,
delegated-staking, and YBC triplet under the same invocation. The aggregate
events use the same Yea basis points, but their absolute emitted weights are not
the aggregator return value. Invocation identity is feed-wide, binds only one
proposal/caller/selector, and its ordinals must appear in canonical log order.
The pinned Voter's one-submission guard also makes a complete ordinal-zero
caller unique per proposal.

Trace paths are unfiltered geth `callTracer` child indices from
`debug_traceTransaction` with `onlyTopCall:false`, `withLog:true`, and `reexec:0`.
Root is `[]`; direct-root Voter calls bind human/delegated/YBC frames at `[1]`,
`[4]`, and `[5]`. Live trace evidence binds client version and raw trace hash;
committed examples use a separate synthetic fixture projection. The consumer
also replays pinned Voter `ybc_votes` cumulatively: each positive aggregator
return updates checked cumulative weight/Yea, and both aggregate Vote logs use
`floor(10000*cumulativeYea/cumulativeWeight)`. All intermediate products and
sums, including passage multiplication, must fit uint256.

Pinned code without a usable trace uses `pinned_voter_trace_unavailable` and
keeps the raw Vote unclassified. Custom code uses
`unverified_voter_unclassified`. Both carry provenance failure and make the
human count an explicit lower bound. A zero Voter cannot emit an accepted Vote.

## 5. Veto behavior

Veto has two branches that the UI must keep distinct.

### At zero running total (`early_no_votes`)

- `vetoed` becomes true;
- `retracted` also becomes true;
- the retraction hook removes the proposal from participation accounting;
- later voting fails because retracted proposals cannot receive votes.

The branch reads the last-write-per-account total, not Vote-log count. Prior
zero-weight Vote history still takes this branch.

### At positive running total (`post_participation`)

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

- the last-write-per-account running vote total is zero;
- it is not already retracted;
- it is not vetoed.

Retraction does not reset the proposer's cooldown.
Zero-weight Vote history is compatible with the zero-total condition.

### Operator flag

The operator may flag a malformed or spam proposal through its voting epoch only
while the last-write-per-account running total is zero. Zero-weight Vote history
is allowed. Flagging also retracts the proposal and removes it from participation
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

The feed applies that framing only when the event-effective Executor matches the
pinned implementation. The proof binds `contracts/governance/Executor.vy` at
revision `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`, source SHA-256
`0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1`,
`vyper@0.4.2`, Vyper source-integrity SHA-256
`0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b`,
gas optimization, Cancun, and experimental code generation disabled. That
digest hashes the lowercase ASCII source digest without `0x`; it is not a
compiler artifact hash. The official Linux x86-64 compiler asset is 23,495,192
bytes with SHA-256
`0x7cc4214671dc78db8a3962f103bead22dd76b55ee370d6d333122e7f3368f4fa`.
Creation/runtime stdout SHA-256 values are
`0x48dbf262a5e31ccdb52119174854e136d8070bbd67140e8b11f72d7b7b169f23`
and `0x9c50f7eb47e09e8349e896e0843f41c96a6b15c48c53c2855e4db709510e021b`.
The decoded runtime is 1,157 bytes, with Keccak-256
`0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151`
and raw-byte SHA-256
`0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c`.
Live archive code at the configuration position must match the same address,
length, hash, and build artifact. Synthetic examples use an explicit fixture
projection and do not claim archive RPC.

A custom nonzero Executor remains `unverified`; constructor zero remains
`uninitialized_zero_address`. Exact script retention and hash comparison still
apply, but the feed marks executable structure
`implementation_unverified` and does not invent pinned frames, decoded calls,
or a completed proposal-time simulation.

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
- authenticated Propose block-header and successful-receipt evidence;
- the deterministic initial frame gas, receipt effective gas price, envelope,
  access list, and warm-set policy;
- whether the complete ordered script succeeded atomically;
- revert or unavailable reason.

Only an executable proposal with exact retained, hash-verified bytes and valid
pinned-Executor framing may have a completed result. Signals, missing or
malformed scripts, hash mismatches, and custom Executors remain unavailable.

A bare top-level `Executor.execute` call with caller set to Voting is not
equivalent because `tx.origin` becomes Voting. An ordinary deployed harness also
changes an observable caller or code identity. Version 1 therefore uses an
engine-injected Executor frame at the Propose block: the authenticated Propose
sender is a frozen hypothetical origin, Executor sees `CALLER = Voting`, targets
see `CALLER = Executor`, real Voting and Executor code remains present, and only
the proven proposal-specific `executed: false -> true` transition is applied.
The completed record requires the proposal-effective pinned Executor proof and
code evidence at the Propose block. Live records authenticate the header with
`eth_getBlockByHash`, including positive u64 gas limit and base fee, and the
successful Propose receipt with `eth_getTransactionReceipt`, including hash,
sender, block, and effective gas price. It derives:

```text
Executor frame gas = min(Propose block gasLimit, 30_000_000)
GASPRICE = Propose receipt effectiveGasPrice
```

The base fee is evidence about the block, not a substitute for `GASPRICE`; the
authenticated receipt effective price cannot be lower than it. The exact
go-ethereum timestamp schedule selects OSAKA and BPO2. BPO2 fraction
`11684671` derives blob base fee from authenticated excess blob gas. REVM is
pinned to `34.0.0` with explicit `SpecId::OSAKA`; its Prague default is rejected.
The record binds beneficiary, zero difficulty, PREVRANDAO, exact ABI
`execute(bytes)` calldata, a synthetic legacy no-blobs envelope, empty access
list, and the Osaka warm set including coinbase and precompiles `0x01` through
`0x11` plus `0x0100`.

The 30,000,000 frame cap is a conditional non-transactional gas
overapproximation: outer transaction validation is bypassed, Osaka's
16,777,216 EIP-7825 transaction cap is disclosed, and parent EIP-150 forwarding
is not modeled. It proves recorded injected-frame behavior, not future
execution feasibility. The `yearn.dao.simulation-context-inputs.v3` SHA-256
commitment binds chain-spec/engine pins, header/receipt and synthetic/RPC
projection evidence, fork/blob/opcode context, caller chain, calldata, script,
injector, Executor source/build/code proof, Voting override, gas disclosures,
envelope, access list, and warm set.
Success or revert is conditional on that exact recorded scenario, not a promise
about the unknown future execution origin. If the origin, frame, code, state,
time, authenticated header/receipt, gas/access context, pinned Executor, or
script cannot be proved, the result is `unavailable`. ABI decoding is
independent: an unknown function can still simulate, and a decoded function can
still revert.

Analysis and simulation records also preserve chronology. Non-pending analysis
cannot predate a known Propose block or follow feed publication. A completed
simulation follows the Propose state time and cannot follow analysis generation.
A failed simulation uses its attempt time as the exact failure observation. An
unavailable attempt either uses the same retained instant for both fields or
uses `null` for both when no time is proved.
An analysis failure derived from simulation evidence cannot predate the
simulation failure.

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

The consumer maintains one canonical registry for every block-bearing record,
not only lifecycle logs. At one chain height, deployments, configurations,
events, receipts, archive-code proofs, simulation evidence, cursors, and
finality data use one hash and one value for each known timestamp. One hash maps
to one height. Ethereum `logIndex` is block-global and rises strictly with
transaction order across proposals and Voting generations.

Known-call decoding uses an exact GitHub record: source kind, repository, label,
canonical blob URL, 40-hex revision, and normalized source path. WP7B pins the
Voting source to exact stYFI revision
`9395d5e6fffdfe21fda32af94d32fca1a4f7840b`. Other hosts, credentials, query,
fragment, controls, traversal, and noncanonical paths are invalid. That record
proves the source used for decoding; it does not prove that a mock address is
deployed. Failed decoder candidate sources obey the same canonical rules, and a
failed analysis summary must name the component that actually failed. Unknown
calls have no verified source.

The producer verifies `keccak256(eventScript) == storedScriptHash`, fetches IPFS
content, decodes known calls, runs the proposal-time simulation, and publishes a
versioned feed. Browser code must not scan full historical logs.

Consumer safe-parse entry points are total. The raw path handles malformed or
oversized JSON; the in-memory wrapper rejects non-serializable or oversized
values before traversal; direct schema safe parse returns typed failure for
semantic mutations instead of escaping an exception. Throwing parse helpers
only surface that typed error to callers that choose exception flow.

## 13. Content and asset authentication convention

The application convention fixes the contract's 32-byte value as the SHA-256
digest of the exact fixed-order proposal-content JSON bytes, including the one
required final LF. The content CID is
the CIDv1/raw/SHA-256/Base32 representation of those same bytes. Producers and
consumers verify this byte-to-digest-to-CID round trip from fixed vectors; they
do not reserialize a parsed object to choose its digest.

Invalid retrieval records retain the exact bytes and must reproduce their
non-retryable failure in order: digest mismatch, fatal UTF-8 decode, JSON parse,
proposal schema/domain parse, final LF, then canonical field order. A valid
canonical byte sequence cannot be relabeled invalid, and a producer cannot
substitute a later failure code for the first failing check. RFC 3339 values are
parsed as real instants; regex-shaped impossible calendar dates are schema
failures.

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
