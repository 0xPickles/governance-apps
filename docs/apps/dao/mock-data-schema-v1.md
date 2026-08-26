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
frozen feed also requires initial frame gas, effective gas price, a no-blobs
envelope, empty access list, Cancun warm-set policy, and a commitment binding
those inputs to the block, caller chain, and injector artifact.

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
guard, and global threshold observations carry their observation block. The UI
formats these supplied facts and does not reconstruct protocol rules. In the
frozen feed, the copied proposal-rule configuration is the Propose-effective
historical disclosure, each Vote uses its event-effective window, and raw
snapshot timing/status uses the configuration effective at the end of the
canonical block.

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
- Every structured source passes the HTTPS provenance validator. Unknown calls
  have no verified source.
- Event time and transaction availability remain nullable facts. Events from
  one transaction/block share the same producer-owned timestamp.

The exact canonical content vector is
[`examples/proposal-content.example.json`](examples/proposal-content.example.json).
It is the exact fixed-order encoder output; its trailing LF is part of the bytes
used by the example digest and CID. The manifest entry is bound to the exact raw
bytes in
[`examples/assets/governance-flow.svg`](examples/assets/governance-flow.svg),
including its 660-byte length, SHA-256 digest, raw CID, media type, and
1,280-by-720 dimensions.

## 8. Feed envelope

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
