# DAO Governance Mock Data Schema v1

This schema defines the deterministic mock-client boundary accepted in M2. It
is not the producer wire contract. The frozen consumer-owned feed contract is
[`feed-schema-v1.md`](feed-schema-v1.md), with strict failure and provenance
states, exact lifecycle ABI records, and publication metadata. The
[`dao-mock-state-map-v1.example.json`](examples/feed-v1/dao-mock-state-map-v1.example.json)
file maps every accepted mock state to that feed without optional-field guesses.

## 1. Proposal identity

```ts
type DaoProposalRef = {
  chainId: number;
  votingAddress: Address;
  proposalId: bigint;
};
```

Use a stable serialized key such as
`<chainId>:<lowercaseVotingAddress>:<proposalId>`. Never key cached history by
numeric ID alone.

## 2. Status and capability types

```ts
type DaoProtocolStatus =
  | "proposed"
  | "retracted"
  | "voting"
  | "passed"
  | "failed"
  | "executed"
  | "expired"
  | "invalid"
  | "flagged"
  | "vetoed";

type DaoDisplayStatus =
  | "discussion"
  | "voting"
  | "approved"
  | "rejected"
  | "executed"
  | "expired"
  | "retracted"
  | "flagged"
  | "vetoed"
  | "not_found";

type DaoVotePurpose = "decision" | "participation_only";
type DaoDisplayGroup = "active" | "upcoming" | "closed";

type DaoCapabilities = {
  canVote: boolean;
  votePurpose: DaoVotePurpose | null;
  voteBlockedReason: string | null;
  canRetract: boolean;
  retractBlockedReason: string | null;
  canFlag: boolean;
  flagBlockedReason: string | null;
  canVeto: boolean;
  vetoBlockedReason: string | null;
  canExecute: boolean;
  executeBlockedReason: string | null;
};
```

`protocolStatus` and `displayStatus` are facts for display. Capabilities are
separate facts. In particular, `protocolStatus: "vetoed"` may coexist with
`canVote: true`.

## 3. Proposal content

Final immutable content shape:

```ts
type DaoProposalAsset = {
  path: string;
  mediaType: string;
  byteLength: number;
  digest: Hex;
  width: number | null;
  height: number | null;
};

type DaoProposalContent = {
  schema: "yearn.dao.proposal.v1";
  markdown: string;
  discussionUrl: string;
  proposalType: "signal" | "executable";
  createdBy: Address;
  createdAt: string;
  assets: DaoProposalAsset[];
};
```

The exact canonical JSON bytes hash to the onchain SHA-256 `bytes32`. Their
CIDv1/raw/SHA-256/Base32 form is the content CID. Consumers verify those bytes
and parse the declared version; they do not reserialize a parsed object to
choose its digest.

The frozen feed keeps exact fetched bytes for `invalid` content and reproduces
the first failure in this order: digest, fatal UTF-8, JSON, proposal
schema/domain parse, final LF, then canonical field order. The producer cannot
substitute another typed error, and bytes that pass all checks cannot be
relabeled invalid.

Each manifest digest authenticates one independent raw asset block. A relative
manifest attachment is an exact `./assets/...` path lookup, never a descendant
of the content CID; derive its canonical raw CID from the matching digest. A
direct `ipfs://<assetCid>` accepts no path, slash, query, or fragment and must
match one unique manifest digest. Both forms resolve to
`https://ipfs.io/ipfs/<assetCid>` with no suffix. Duplicate normalized paths or
digests fail.

Manifest limits are 16 assets, 512 UTF-8 bytes per path, 127 UTF-8 bytes per
media type, 2,097,152 bytes per asset, and 33,554,432 declared bytes in total.
Image metadata is limited to 8,192 px in either dimension and 33,554,432
pixels. The 2 MiB asset limit preserves one-raw-block interoperability across
the intended IPFS implementations.

## 4. Script and analysis

```ts
type DaoScriptFrame = {
  index: number;
  offset: number;
  target: Address;
  calldata: Hex;
  calldataBytes: number;
  selector: Hex | null;
};

type DaoScriptCheck = {
  state: "empty" | "valid" | "invalid";
  script: string;
  scriptBytes: number | null;
  scriptHash: Hex | null;
  frames: DaoScriptFrame[];
  error: { code: string; message: string; offset: number | null } | null;
};

type DaoVerifiedSource = {
  kind: "github" | "sourcify" | "explorer";
  label: string;
  url: string;
  revision: string | null;
};

type DaoDecodedCall = DaoScriptFrame & {
  decodeStatus: "verified" | "unknown" | "failed";
  contractName: string | null;
  functionSignature: string | null;
  arguments: Array<{ name: string; type: string; value: string }>;
  verifiedSource: DaoVerifiedSource | null;
  sourcePath: string | null;
};

type DaoSimulation = {
  state: "pending" | "succeeded" | "failed" | "unavailable";
  method: "atomic_script_at_state" | null;
  engine: string | null;
  blockNumber: bigint | null;
  blockHash: Hex | null;
  simulatedAt: string | null;
  stateTimestamp: number | null;
  timestampMode: "block" | "override" | null;
  timestampOverride: number | null;
  caller: Address | null;
  stateOverrides: string | null;
  error: string | null;
};

type DaoAnalysis = {
  state: "pending" | "complete" | "partial" | "failed" | "unavailable";
  generatedAt: string | null;
  registryVersion: string | null;
  calls: DaoDecodedCall[];
  proposalSimulation: DaoSimulation;
  error: string | null;
};
```

The `atomic_script_at_state` literal above belongs only to the accepted M2 mock
view. It is not a producer method. The frozen feed's completed method is
`revm_engine_injected_executor_frame_conditional_origin` with engine
`revm@34.0.0` and explicit historical `SpecId::OSAKA`.

Raw author input remains a string until syntax validation succeeds. Invalid
characters and odd nibble counts do not describe a byte sequence, so
`scriptBytes` and `scriptHash` are `null` for those errors. Once the input is
valid even-length hex, both values are present even when a later framing,
size, call-count, or proposal-type check fails.

The frontend parser produces `DaoScriptCheck`. Backend decoding and proposal-time
simulation produce the decoded calls and stored simulation. A structured source
must be complete, use HTTPS without credentials, and retain its revision and
path separately. The frozen feed narrows accepted verified records to exact
canonical GitHub blob URLs that bind repository, 40-hex revision, and normalized
path. A source can prove the exact decoder input but cannot prove that a mock
address is deployed. Unknown decoding has no verified source and remains
independent from simulation success. `unavailable` means the producer could not
establish the required origin and nested-frame provenance; `failed` means the
atomic script reverted only in the exact disclosed conditional scenario. The
frozen feed permits a completed result only for the proposal-effective verified
pinned Executor and exact archive-RPC or committed-synthetic code evidence at
the Propose block. It authenticates
the Propose header and successful receipt, derives initial frame gas as
`min(block gasLimit, 30,000,000)`, and uses the receipt effective gas price for
`GASPRICE`. The header base fee is recorded but is not a substitute, and the
receipt effective price cannot be lower than it. A no-blobs envelope, empty
access list, Osaka coinbase/precompile warm set, BPO2 blob context, exact
`execute(bytes)` calldata, and the
`yearn.dao.simulation-context-inputs.v4` commitment bind those facts, the script,
chain-spec/engine evidence, Executor source/build/code proof, caller chain,
injector artifact, and exact-position Executor-authorization storage/replay
evidence. The 30,000,000 injected-frame cap is explicitly a
non-transactional overapproximation with outer validation bypassed and parent
EIP-150 forwarding unmodeled; it does not prove future execution feasibility.
Exact Osaka/BPO2 activation and blob-initialization literals, the REVM crate
identity, the rejected Prague comparison, and all six gas-disclosure fields are
normative in `feed-schema-v1.md` and the generated JSON Schema.
Missing evidence produces a fully unavailable simulation.

That Executor proof is per configuration. `verified_pinned` binds
`contracts/governance/Executor.vy` at revision
`9395d5e6fffdfe21fda32af94d32fca1a4f7840b`, source SHA-256
`0xfd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1`,
`vyper@0.4.2`, Vyper source-integrity SHA-256
`0x18bd5aadcc7847a329623ccf6bf05edf661a4d4c5ec6aeb13e8fdcc44df0917b`,
whose preimage is the exact lowercase ASCII string
`fd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1`
without `0x` or LF, plus the
official Linux x86-64 compiler release asset SHA-256
`0x7cc4214671dc78db8a3962f103bead22dd76b55ee370d6d333122e7f3368f4fa`.
Compilation uses gas optimization, Cancun, and no experimental codegen. Its exact
1,157-byte runtime has Keccak-256
`0x79f505f4a42c284951f3dfcba66a566279ed9e81d4140a19efac71d6b5977151`
and decoded raw-runtime SHA-256
`0x6515450d29d132991c615f1679eea39f8c095b3f71cc0e7a3ba3c446c8312f4c`.
The compiler asset is
`vyper.0.4.2+commit.c216787f.linux` from the percent-encoded `v0.4.2`
release URI, 23,495,192 unchanged bytes, long version
`0.4.2+commit.c216787f`, platform `linux-x86_64-gnu`, and official Ubuntu 22.04
workflow. Exact `-Werror -O gas --evm-version cancun` creation/runtime stdout is
2,483/2,317 bytes with SHA-256 `0x48dbf2…9f23` / `0x9c50f7…021b`; decoded
creation is 1,240 bytes with SHA-256 `0xccb991…2a60`, and Executor has no
immutables. Full hashes, source-integrity preimages, output decoding, and the
Voter v2 template/immutable/final-runtime facts are normative in
`feed-schema-v1.md`, `contract-reference.md`, and the generated JSON Schema.
Custom and zero Executors keep exact script bytes and hash evidence, but their
executable scripts use `implementation_unverified`; they do not inherit this
framing. The empty signal identity remains independently knowable.

Feed analysis times cannot predate a known Propose block or follow feed
generation. Completed simulation follows its Propose state time and cannot
follow analysis generation. It also requires an executable, exact retained,
hash-verified script with valid pinned-Executor framing. Failed and unavailable
attempts use one exact shared attempt/failure instant; an unavailable record may
use `null` for both only when that instant is unproved. An analysis failure
derived from simulation evidence cannot predate the simulation failure.

A fresh execution preflight is wallet-specific and never belongs in the global
feed:

```ts
type DaoExecutionPreflight = {
  state: "idle" | "simulating" | "succeeded" | "failed";
  scriptHash: Hex;
  blockNumber: bigint | null;
  simulatedAt: string | null;
  error: string | null;
};
```

## 5. Event provenance

```ts
type DaoLogRef = {
  blockNumber: bigint;
  blockHash: Hex;
  timestamp: number | null;
  transactionHash: Hex | null;
  transactionIndex: number;
  logIndex: number;
};

type DaoProposalEvent = {
  type: "propose" | "vote" | "retract" | "flag" | "veto" | "execute";
  log: DaoLogRef;
  actor: Address;
  voteActorKind: "human" | "ybc_aggregate" | "styfix_aggregate" | null;
  yeaBps: number | null;
  direction: "yea" | "nay" | null;
  weight: bigint | null;
  reason: string | null;
};
```

Every retained event carries canonical block and log identity. Its timestamp is
the block producer's canonical UTC time, never a browser-clock substitute.
Transaction hash may be absent for a truthful direct-contract or incomplete
historical record; presentation uses explicit fallbacks without discarding the
remaining block, transaction-index, or log-index provenance.
`yeaBps` retains the `Voting.Vote.yea` value from 0 through 10,000, including
blended YBC and stYFIx aggregate rewrites. `direction` is an optional derived
label for binary human votes only: 10,000 is Yea and 0 is Nay. Aggregate vote
actors are never counted as additional human participation.

The frozen feed expands this small mock event view without changing it. Every
block-bearing record joins one canonical registry: one chain height has one
hash and one value for every known timestamp, and one hash maps to one height.
Within a block, `logIndex` is unique and rises strictly with transaction order
across proposals and Voting generations.

A complete pinned-Voter classification groups one transaction by its unfiltered
geth `callTracer` outer Voter path `P`. Human, delegated, and YBC
`Voting.vote` child paths are `P+[1]`, `P+[4]`, and `P+[5]`; only the
direct-root fixture has `P=[]`, hence `[1]`, `[4]`, and `[5]`. Child indices are
from the complete, unfiltered call tree. Ordinal `0` is one
nonzero, positive-weight binary human Vote. A
nonmember or member with a zero aggregator result produces only `{0}`. A
positive result produces the exact ordered `{0,1,2}` human, delegated-staking,
and YBC triplet. Missing traces under pinned code and custom Voter code preserve
raw events as unclassified provenance failures. Human participation is then an
explicit lower bound rather than a guessed complete count. Disabled zero Voter
state cannot produce a Vote. The Voter's proved constructor genesis is
independent of the Voting generation genesis and is committed with its exact
source integrity, official compiler distribution, command/stdout, runtime
template/immutable, final deployed runtime, and code evidence through
`yearn.dao.voter-build-evidence.v2`. It cannot follow a Vote that implementation
could emit. Invocation identity is feed-wide, binds one proposal, and each
complete pinned caller appears only once per proposal. The consumer replays
cumulative pinned `ybc_votes` with checked uint256 arithmetic and derives the
shared aggregate bps from cumulative Yea and weight.

The trace request is `debug_traceTransaction` with geth `callTracer`,
`onlyTopCall:false`, `withLog:true`, and `reexec:0`. Live
`rawTraceSha256` hashes the exact UTF-8 bytes encoding the successful non-null
top-level JSON-RPC `result` object, from opening `{` through matching `}`, before
JSON decoding or reserialization and excluding the envelope, ID, and
surrounding whitespace. Synthetic records use a committed projection and leave
live client/raw fields null. Public Voter selectors are
`vote_yea(address,uint256)` / `0x69586e2e` and
`vote_nay(address,uint256)` / `0xff855dde`.
Transaction, receipt, code, and log-result raw hashes follow the same exact
top-level JSON-RPC result-token byte rule defined in `feed-schema-v1.md`, with
named retained keys where the selected branch exposes them and null exposed
live hash/key fields for synthetic projections.

## 6. Proposal view model

```ts
type DaoLifecycleFacts = {
  status: DaoProtocolStatus;
  voteResult: "approved" | "rejected" | null;
  moderation: {
    kind: "flagged" | "vetoed" | null;
    phase: "before_participation" | "after_participation" | null;
    reason: string | null;
    votingAvailable: boolean;
    executionBlocked: boolean;
  };
  execution: {
    state:
      | "no_actions"
      | "scheduled"
      | "executable"
      | "executed"
      | "blocked"
      | "expired";
    guard: "guarded" | "permissionless" | null;
  };
};

type DaoProposalRules = {
  approvalThresholdBps: number;
  thresholdSnapshottedAtCreation: true;
  minimumTurnout: null;
  passageRequiresPositiveTotal: true;
  proposalType: "signal" | "executable";
  votingPeriodSeconds: number;
  executionDelaySeconds: number | null;
  executionGuard: "guarded" | "permissionless" | null;
  votingAddress: Address;
  votingSource: DaoVerifiedSource;
  votingSourcePath: string;
  observationBlockNumber: bigint;
};

type DaoProposal = {
  ref: DaoProposalRef;
  proposer: Address;
  votingEpoch: bigint;
  createdAt: number;
  voteStartsAt: number;
  voteEndsAt: number;
  executionStartsAt: number | null;
  executionEndsAt: number | null;
  thresholdBps: number;
  totalWeight: bigint;
  yeaWeight: bigint;
  nayWeight: bigint;
  protocolStatus: DaoProtocolStatus;
  displayStatus: DaoDisplayStatus;
  displayGroup: DaoDisplayGroup;
  type: "signal" | "executable";
  rules: DaoProposalRules;
  content: {
    state: "available" | "unavailable" | "invalid";
    cid: string | null;
    digest: Hex;
    value: DaoProposalContent | null;
    error: string | null;
  };
  discussion: {
    state: "verified" | "unverified" | "unavailable";
    url: string | null;
    title: string | null;
    categoryId: number | null;
    category: string | null;
    categorySlugPath: string[];
  };
  script: {
    bytes: Hex | null;
    hash: Hex;
    hashVerified: boolean | null;
  };
  analysis: DaoAnalysis;
  events: DaoProposalEvent[];
  moderation: {
    flagReason: string | null;
    vetoReason: string | null;
  };
};
```

`deriveDaoLifecycleFacts` keeps raw status, community vote result, moderation,
and execution separate. A flagged proposal has no community result. An early
veto blocks voting, while a veto after participation can leave voting available
until the window closes. An empty-script raw `executed` signal has an approved
vote result and `no_actions` execution state.

The frozen feed chooses the immutable Veto branch from the
last-write-per-account total immediately before the log: zero is
`early_no_votes`, positive is `post_participation`. Zero-weight Vote history
does not turn the early branch into post-participation.

Execution integrity is a separate derived fact:

```ts
type DaoProposalExecutionReadiness =
  | { state: "not_applicable"; blocker: null; reason: null }
  | { state: "integrity_ready"; blocker: null; reason: null }
  | {
      state: "integrity_blocked";
      blocker:
        | "exact_script_unavailable"
        | "stored_script_hash_mismatch";
      reason: string;
    };
```

`deriveDaoProposalExecutionReadiness` reads proposal type and script bytes/hash
only. `integrity_ready` proves byte/hash integrity, not current executability or
account permission.

Rules belong to the proposal. The constructor/default fixture uses 5,000 basis
points; a retained alternate snapshot uses 6,000. Mutable voting period, delay,
and guard carry their configuration boundary. Each proposal threshold snapshot
is independently storage-proven at its Propose block and hash. The UI formats
these supplied facts and does not reconstruct protocol rules. In the
frozen feed, the copied proposal-rule configuration is the Propose-effective
historical disclosure, each Vote uses its event-effective window, and raw
snapshot timing/status uses the configuration effective at the end of the
canonical block. The first history entry is a logical `start_of_block`
position, ordered before transaction zero/log zero. Its authenticated
producer-start snapshot replays every tracked setter from contract creation
through the parent block and proves zero skipped lifecycle logs. Each unique
setter transaction binds sender, successful receipt, exact calldata, and full
geth call trace. Later entries become effective at their final retained real
Set* log. Those logs share the block-global namespace with lifecycle,
preconfigured-Voter-history, and Executor-authorization logs; lifecycle events
on opposite sides of a same-transaction setter select old and new rows.
The committed fixture deploys at block `23900000`, starts the producer reducer
at `23900001`, replays nine bootstrap setters, and anchors `config-2` after ten
setters at block `23902000`, transaction `0`, global log index `9`.

Configuration includes Voter decay in `0..604799`, with zero disabling decay. A
changed pointer either establishes all four nested Voter values after the
pointer setter, is explicitly zero-disabled, or authenticates a preconfigured
Voter from direct code birth through the boundary with a complete setter
manifest and replay. Setters must follow code birth, code birth must precede the
pointer, and block-end state requires zero later same-block relevant setters.
Reused physical logs are ordered once and retain identical feed-wide position,
transaction hash, emitter, topics, and data. Configuration and
preconfigured-Voter call evidence additionally retains identical
sender/caller/target/trace/calldata/decoded-mutation evidence; Executor
authorization does not claim sender or call-trace fields.
The stored proposal threshold is separately proved at Propose from Vyper mapping
slot `17`, slot-then-key hashing, struct offset `4`, exact word, and decoded
basis points; duplicated threshold fields are not self-authentication.

The frozen rule record also includes typed Voter, Executor, proposal-blacklist,
hook, weight-measure, aggregate, operator, and guardian states. Historical
event admission follows the exact call path: Propose needs blacklist, weight
measure, and hook; Vote needs Voter and weight measure, with hook required for
positive weight; Retract and Flag need hook; early Veto needs hook while
post-participation Veto does not; nonempty Execute needs Executor while empty
signal Execute skips it. Flag and guarded Execute need the operator. Retract and
Flag test the last-write-per-account running total, so zero-weight Vote history
is allowed. Executor and blacklist may start at zero but cannot return to zero
after their nonzero-only setters initialize them. Each Vote multiplication and
updated running total must also fit checked uint256 arithmetic at that event.

Connected-wallet state is not part of the global proposal feed:

```ts
type DaoAccountProposalState = {
  address: Address;
  connected: boolean;
  correctChain: boolean;
  votingWeight: bigint;
  effectiveVotingWeight: bigint;
  decayBps: number;
  hasVoted: boolean;
  voteDirection: "yea" | "nay" | null;
  isProposer: boolean;
  isOperator: boolean;
  isGuardian: boolean;
  executionPreflight: DaoExecutionPreflight;
  capabilities: DaoCapabilities;
};

type DaoProposerState = {
  address: Address;
  connected: boolean;
  correctChain: boolean;
  canPropose: boolean;
  proposeBlockedReason: string | null;
  currentWeight: bigint;
  minimumWeight: bigint;
  blacklisted: boolean;
  lastProposedAt: number | null;
  nextEligibleAt: number;
  expectedVotingEpoch: bigint;
  affectedBoostEpochs: Array<{
    epoch: bigint;
    currentProposalCount: number;
    proposalLimit: 64;
  }>;
};
```

`canPropose` is false if any affected reward epoch is already at 64 proposals.
This is shared system capacity, not a per-account proposal count.

Confirmed mock writes use a live overlay until the corresponding event is
indexed:

```ts
type DaoTransactionReceipt = {
  status: "success" | "reverted";
  transactionHash: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  blockTimestamp: number | null;
  transactionIndex: number;
  logs: DaoReceiptLog[];
};

type DaoDecodedProposeIdentity = {
  ref: DaoProposalRef;
  proposer: Address;
  votingEpoch: bigint;
  contentDigest: Hex;
  script: Hex;
  blockTimestamp: number | null;
  log: DaoLogRef;
};

type DaoCreatedProposalRecord = {
  stage: "awaiting_index" | "indexed";
  proposal: DaoProposal;
};

type DaoActionType = "vote" | "retract" | "flag" | "veto" | "execute";

type DaoPendingAction = {
  action: DaoActionType;
  ref: DaoProposalRef;
  actor: Address;
  transactionHash: Hex;
  submittedAt: number;
  direction: "yea" | "nay" | null;
  effectiveVotingWeight: bigint | null;
  reason: string | null;
};

type DaoMockTransactionOutcome =
  | "success"
  | "user-rejected"
  | "revert"
  | "network-error";

type DaoProposalSubmissionRequest = {
  review: DaoAuthoringReview;
  publication: DaoPublishedContent;
  outcome: DaoMockTransactionOutcome;
  latencyMs?: number;
};
```

`DaoPendingAction` is not canonical feed history. A confirmed vote updates
`hasVoted` and `voteDirection` only for the full serialized proposal reference
and normalized actor address, so the same wallet may vote on another proposal
and another wallet may vote on the same proposal. That one-vote overlay blocks
an exact duplicate immediately while proposal weights and events stay
unchanged. Indexing applies the pending record once, advances the canonical
block, and clears the pending action; the submitted-vote fact remains until a
fixture or app reset rebuilds the mock store. Every successful submission gets
a deterministic unique transaction hash, and the prepared result, pending
record, and indexed event retain that exact hash. Failed outcomes create no
pending action. Flag and veto reasons are trimmed, required, and limited to 256
UTF-8 bytes both when preparing and when calling the prepared transaction.

Proposal creation does not guess the next numeric ID. Chain context is supplied
separately from the receipt. The decoder requires a successful receipt with the
exact submitted transaction hash and exactly one `Propose` log from the expected
Voting address. Proposer, voting epoch, content digest, and exact script must
match the submitted values. The log has exactly four canonical topics. Its
decoded topics and non-indexed content digest and script must re-encode to the
exact receipt bytes, with no extra topic, trailing word, alternate offset, or
dirty padding. A missing, duplicate, malformed, wrong-contract, or mismatched
log yields no proposal ref. Once decoded, the same composite ref is
used for the receipt-confirmed view, browser-local `awaiting_index` overlay, and
indexed fixture. That local overlay intentionally does not survive another
browser session.

The explicit submission request controls transaction outcomes. Forum topic
`1002` remains the publication-failure fixture and `1005` remains the missing
receipt-log fixture. Topics `1003` and `1004` are ordinary valid topics and do
not select transaction behavior. Rejection, revert, and network failure return
before a hash exists and leave pending, created, session, feed, event, and index
state unchanged. Reset restores `success`.

Created-proposal registration waits for its modeled latency before persistence.
If completion cannot find the record, the UI exposes an idempotent indexing
retry. Re-registration upserts the exact receipt-derived reference; indexing
then enriches that same record without adding a second proposal or `propose`
event.

`createMockDaoClient` is an immutable fixture-snapshot reader and rejects all
five prepared-write methods with a stable read-only error. It must not imply
that a snapshot-only client can consume one-vote or lifecycle authorization.
Mock routes use `RuntimeMockDaoClient`, backed by the mutable store above, as the
only mock client that prepares and submits actions.

## 7. Domain invariants

- `totalWeight === yeaWeight + nayWeight` and no weight is negative.
- Threshold, decay, and vote-event Yea values stay between 0 and 10,000 basis
  points.
- `createdAt <= voteStartsAt < voteEndsAt`. When both execution times exist,
  `voteEndsAt <= executionStartsAt < executionEndsAt`.
- App type is derived from the stored script hash even when event bytes are
  unavailable: Signal iff the stored hash is `keccak256(0x)`; every other hash
  is Executable. When bytes are present they must be empty for Signal and
  non-empty for Executable and must verify against that stored hash. A
  conflicting IPFS `proposalType` is a content inconsistency, not the
  authoritative type.
- `hashVerified` is `null` only when exact bytes are absent. When bytes exist,
  it equals the actual keccak comparison with the stored hash.
- The six affected boost epochs start at `expectedVotingEpoch` and are
  consecutive.
- `invalid` and `not_found` are lookup results and never appear in feed history.
- Upcoming contains discussion-phase proposals. Active contains voting proposals
  and approved executable proposals that have not executed or expired. Closed
  contains terminal outcomes and approved signals.
- Verified forum status requires an allowed stable category ID. A matching
  display label alone is insufficient.
- `rules.approvalThresholdBps === thresholdBps`; proposal type, Voting address,
  timing, delay, and guard agree with the proposal record.
- Threshold evidence reproduces the pinned Vyper storage slot and exact Propose
  word; both threshold copies equal its decoded basis points.
- Every structured source passes the HTTPS provenance validator. Unknown calls
  have no verified source.
- Event time and transaction availability remain nullable facts. All
  block-bearing evidence at one height shares one hash and each known
  timestamp; one hash maps to one height. Block-global log indices are unique
  and rise with transaction order.
- Human participation is complete only when every raw Vote has exact pinned
  invocation evidence. Trace-unavailable and custom-Voter events are
  unclassified and make the count a lower bound.
- Pinned Executor framing and completed simulation require exact per-config
  source/build/archive-or-committed-synthetic code evidence. Completed
  simulation also proves `operators[Voting]` at Propose from mapping slot `2`,
  block-end storage, exact same-block SetOperator replay, and zero later relevant
  logs; its typed gate/script stage and error code agree. Custom or zero
  Executor state never borrows pinned framing and forces executable
  analysis/simulation unavailable.

The exact canonical content vector is
[`examples/proposal-content.example.json`](examples/proposal-content.example.json).
It is the exact fixed-order encoder output; its trailing LF is part of the bytes
used by the example digest and CID. The manifest entry is bound to the exact raw
bytes in
[`examples/assets/governance-flow.svg`](examples/assets/governance-flow.svg),
including its 660-byte length, SHA-256 digest, raw CID, media type, and
1,280-by-720 dimensions.

## 8. Feed envelope

The committed feed example contains 27 proposals and 81 lifecycle events. Its
published rejection corpus contains 103 vectors, and the focused boundary suite
contains 136 tests.

The mock client should resemble the future feed:

```ts
type DaoFeedV1 = {
  schemaVersion: 1;
  chainId: number;
  generatedAt: string;
  canonicalBlock: { number: bigint; hash: Hex; timestamp: number };
  contracts: Array<{
    votingAddress: Address;
    voterAddress: Address;
    executorAddress: Address;
    deploymentBlock: bigint;
    active: boolean;
  }>;
  proposals: DaoProposal[];
};
```

When JSON is used, bigint values serialize as base-10 strings and adapters parse
them at the domain boundary. The v1 adapter accepts canonical unsigned decimal
strings only: `0` or a non-zero digit followed by digits. Signs, whitespace,
decimals, exponent notation, and leading zeroes are rejected.

The frozen feed's safe boundaries are total. `safeParseDaoFeedJsonV1` handles
malformed or oversized JSON, and `safeParseDaoFeedV1` rejects non-serializable
or oversized in-memory values before traversal. Direct schema safe parse returns
typed failure without throwing for structurally parsed semantic mutations,
including inconsistent totals, timelines, and every rejection vector. The
throwing `parse*` helpers only expose the same Zod error for callers that choose
exception flow.

## 9. Required deterministic fixtures

All proposal times are derived once from one mock genesis and the contract timing
helper. The mock epoch is 14 days, voting is assigned to creation epoch `N + 1`,
and the vote starts halfway through that voting epoch. Fixtures may supply a
historical execution-delay input to cover both waiting and open execution
states, but they do not hand-author voting epochs or output timestamps. Runtime
initialization, reset, fixture selection, and fact replacement never translate
those immutable proposal or content timestamps to wall-clock time. No-argument
initialization and reset start at `DAO_MOCK_NOW`; runtime time then moves across
the fixed proposal schedule to derive lifecycle state and capabilities.

The authoring eligibility fixture derives `expectedVotingEpoch` from the same
genesis and timing configuration. Store normalization recomputes that epoch and
the six consecutive affected boost-epoch labels whenever runtime time changes,
while retaining the fixture's proposal counts and limits. Equal voting windows
therefore always carry the same `votingEpoch`.

The mock store must provide at least:

| Fixture | Required distinction |
| --- | --- |
| Discussion | Created now, vote scheduled next epoch |
| Voting | Decision vote open |
| Late voting | Effective weight decayed |
| Approved signal | Display Approved despite eventual raw Executed |
| Approved executable | Waiting for execution window or delay |
| Executed | Hash-valid script and completed calls |
| Rejected | Some votes but below threshold |
| No votes | Rejected without quorum language |
| Expired | Passed script missed execution epoch |
| Retracted | Author retracted before votes |
| Flagged | Operator reason retained |
| Early veto | Vetoed and retracted; cannot vote |
| Post-vote veto | Vetoed, not retracted; participation vote open |
| Content unavailable | Onchain record and vote capability retained |
| Content invalid | Strong warning; exact error retained |
| Analysis pending | Content present, calls not yet decoded |
| Partial decode | Known and unknown calls together |
| Simulation failed | Structurally valid script with backend failure |
| Hash mismatch | Execution blocked |
| Direct proposal | No verified forum discussion |
| Guarded execution | Only operator can execute |
| Permissionless execution | Any eligible connected account can execute |
| Proposal capacity full | At least one of the six affected reward epochs is at 64 |

Proposal 1 reaches the relative manifest attachment. Proposal 2 reaches the
same committed raw asset through its direct `ipfs://` CID. Proposal 20 retains
missing event time and transaction provenance. The 5,000-basis-point default
and 6,000-basis-point alternate rule snapshots are both reachable.

## 10. Mutable debug state

The DAO mock adapter must support:

- set persona;
- select proposal;
- set loading, empty, content, and analysis states;
- patch proposal booleans, votes, threshold, timing, and script state;
- set account weight and voted state;
- set guard mode and roles;
- choose success, wallet-rejection, revert, or network transaction outcomes;
- index or clear a confirmed pending action;
- set proposer blacklist, cooldown, minimum/current weight, and each affected
  epoch's proposal count;
- advance deterministic time;
- reset DAO state without breaking other domain resets.

Presets seed state. Tests and the debug panel must also mutate individual facts so
capability derivation is tested rather than bypassed.

The M1 runtime implements this boundary through a lazy mutable store and a
route-facing mock adapter. `window.__TEST__` exposes domain-prefixed async setters
for fixture and proposal selection, surface state, persona and independent roles,
content, lifecycle, veto, analysis, account, execution, authoring, votes,
threshold, terminal flags, timing, proposer eligibility, and each affected
epoch's capacity. It also exposes transaction outcome, pending-action indexing,
pending-action clearing, plus a read-only JSON-safe DAO evidence snapshot. Each
mutation waits for completion and then invalidates `daoKeys.all`; the evidence
read does not invalidate. Runtime time is distinct from feed provenance. The
canonical timestamp is quantized to a 12-second block slot: time changes within
the current slot preserve the complete block number, hash, and timestamp tuple,
while crossing a slot derives a new coherent tuple. Indexing advances the block
number and binds its hash to that number and canonical timestamp. The initial
fixture block uses the same hash derivation, so advancing and rewinding to an
exact slot restores the identical tuple. Route lifecycle copy uses runtime time;
the canonical timestamp remains snapshot provenance.

The shared `+1 day` and `+7 days` controls continue advancing the global mock
clock and every participating domain, but apply the selected delta to the DAO
store's own deterministic runtime baseline. Explicit bridge `setNow(timestamp)`
remains absolute. Shared DAO time changes also recompute proposer epoch labels
from the fixed genesis before invalidation, so status, capabilities, and
authoring eligibility use one clock.
Account roles apply only when the normalized queried address equals the
role-bearing fixture actor. Reset restores the success outcome and removes any
pending action.

## 11. Parser error catalogue

At minimum:

- `INVALID_HEX`
- `ODD_HEX_LENGTH`
- `SCRIPT_TOO_LARGE`
- `TRUNCATED_HEADER`
- `CALLDATA_OUT_OF_BOUNDS`
- `TOO_MANY_CALLS`
- `TRAILING_BYTES`
- `EMPTY_EXECUTABLE_SCRIPT`
- `NON_EMPTY_SIGNAL_SCRIPT`

Messages include the failing byte offset where one exists. Parser tests use
fixed vectors rather than only generated examples.

Error precedence and offsets are deterministic:

| Error | Rule | Offset |
| --- | --- | --- |
| `INVALID_HEX` | Missing `0x` prefix or a non-hex character | Invalid byte when known; otherwise `null` |
| `ODD_HEX_LENGTH` | The final nibble has no pair | Incomplete final byte |
| `TOO_MANY_CALLS` | A structurally reachable 65th header exists | Start of the 65th header |
| `SCRIPT_TOO_LARGE` | A script with at most 64 reachable calls exceeds 2,048 bytes | First byte beyond the limit |
| `TRUNCATED_HEADER` | The first header contains fewer than 32 bytes | Start of the incomplete header |
| `CALLDATA_OUT_OF_BOUNDS` | Declared calldata exceeds the remaining bytes | Start of the declared calldata |
| `TRAILING_BYTES` | A complete call is followed by fewer than 32 bytes | First trailing byte |
| `EMPTY_EXECUTABLE_SCRIPT` | Executable type uses `0x` | `0` |
| `NON_EMPTY_SIGNAL_SCRIPT` | Signal type uses one or more structurally valid calls | `0` |

The content parser first rejects non-round-tripping Unicode and NUL/control
characters before `TextEncoder`, then enforces the 32,768-byte source limit
before parsing. Bounded iterative walks enforce AST node/depth/table-cell work
bounds, exactly one H1 across the tree, later H2-H4 order, the summary paragraph,
non-empty body, the node allowlist, the raw-HTML block, safe links, and attachment
rules. A work-limit failure returns an empty safe AST. An attachment is valid
only when it is the sole image in a top-level body paragraph after the summary;
title, summary, heading, link, mixed-inline, and nested image contexts fail.
Located document errors are reported in stable source order before manifest
errors. Manifest errors are ordered by manifest index and fixed rule priority;
an earlier bad entry precedes the index-16 too-many-assets sentinel, and a
duplicate path precedes a duplicate digest at one index. Duplicate normalized
paths and duplicate digests fail before attachment lookup; direct-CID lookup
must resolve to exactly one digest.

Call-count validation precedes the total-byte limit so both contract limits are
independently diagnosable: 65 empty 32-byte headers already occupy 2,080 bytes.
All other inputs over 2,048 bytes report `SCRIPT_TOO_LARGE` before ordinary
framing errors. Structural validation proves only framing; it never labels a
script safe or verified.

Feed content failures use separate deterministic byte checks. Their fixed
precedence is `CONTENT_DIGEST_MISMATCH`, `CONTENT_UTF8_INVALID`,
`CONTENT_JSON_INVALID`, `CONTENT_SCHEMA_INVALID`,
`CONTENT_FINAL_LF_INVALID`, then `CONTENT_CANONICAL_INVALID`. The retained bytes
must reproduce the named code. If none applies, the bytes are valid canonical
content and the `invalid` state is rejected.
