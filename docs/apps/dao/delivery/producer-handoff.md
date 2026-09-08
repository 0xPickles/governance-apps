# DAO feed V2 producer handoff

Status: ready for external consumer review. Producer implementation is pending explicit approval. This handoff supersedes the V1 handoff at `fb8bbb8735b336b5eadd6d42b26e56696ad688de`; historical acceptance remains recorded in [status](status.md). V2 is a reviewable candidate, not a permanently frozen contract.

## Boundaries and inputs

Governance Apps owns [V2](../feed-schema-v2.md), its [field/source mapping](../feed-v2-field-sources.md), generated JSON Schema and consumer acceptance tests. Gov Apps Stats will implement a separate DAO process in the existing Rust repository, using the existing node and static object storage. No language rewrite, request-time indexing backend, browser historical scan, or new infrastructure is required.

Reviewed consumer base: `639782376bcaf05ab43ed9d9759c73154d0723b6`.
Reviewed producer checkout: `gov-apps-stats.dao.m3.wp9`, clean at `943de11f539845200e23b02a61fbe1592bf90ed6`.
Governance Apps source pin: `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`.

Read-only inspection found a producer manifest candidate for Voting
`0x543e8871562a8c53e8b6a26835aeecb3a5a13070`, mainnet block `25883944`,
with source revision `054e3e391f0fe4cd41c68b1a97263cb3234faee1`.
These are inventory facts, not live verification or permission to use this deployment.
The reviewer and this implementation follow-up independently downloaded and compared `contracts/governance/{Voting,Voter,Executor}.vy` at both revisions: all three files are byte-for-byte identical. The [comparison record](evidence/feed-v2/source-comparison.md) includes URLs, lengths and SHA-256 hashes. This resolves the file-level discrepancy for those contracts, without changing the consumer pin. Before implementation against a live target, verify deployed Voting/Voter/Executor code and any other relevant dependencies. A source URL alone proves no deployment. Keep code/deployment verification records and diagnostics private to operator evidence; do not put compiler manifests into the public feed.

The synthetic example addresses are never production defaults. The app defaults to no trusted DAO deployments. Operators must review the exact chain, Voting address, inclusive deployment block, fixed genesis and supported Voter/Executor allowlists before configuring `NEXT_PUBLIC_DAO_DEPLOYMENTS`. The feed cannot select these authorities.

## Acquisition

1. Load concrete configured deployments and durable canonical checkpoints.
2. Read chain identity and choose a canonical snapshot header according to the reviewed confirmation policy.
3. Scan bounded log ranges from the deployment block inclusively, or resume after a verified checkpoint. Retain Propose script bytes, exact event payloads, log/transaction identity and block time. Do not require an adjacent proposal or nonzero indexed topic.
4. Reconcile proposal coverage with `num_proposals`. Query current configuration and all known stored proposals and statuses in bounded concurrent batches at this snapshot. Default to all proposals on every refresh; time or configuration changes can affect status without logs. Measure before tracking incremental dependencies.
5. Optionally retrieve content blocks by their raw SHA-256 CID. Bound bytes; retain exact bytes without JSON reserialization. A gateway failure yields null content enrichment and must not hide onchain facts.
6. Validate the complete candidate before publishing. Never advance the published snapshot on missing required logs/state, canonical reconciliation failure, or overflow.

Historical logs and their headers must be available back to deployment. This is different from historical state/trace availability. The first feed requires no historical call traces, transaction-debug methods, proposal-time simulation, historical storage reconstruction, or old-state reads at each event. An ordinary node must support log ranges and state calls at the selected recent canonical block; retained event/script data must survive node pruning.

## Coherent RPC reads

Prefer [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898) `eth_call` with `{blockHash, requireCanonical:true}` for every dependent call. Confirm chain ID, header identity and canonicality again after acquisition. A batch JSON-RPC request reduces transport overhead but does not by itself make reads coherent. If the hash is unavailable/noncanonical or any call fails, reject the candidate and reacquire coherently.

A numeric-block fallback is permitted only after documenting the actual node's behavior and using one fixed, non-load-balanced node. Pin every call to the same explicit height, verify the canonical hash at that height before and after every acquisition batch and at final reconciliation, and discard the whole acquisition on any mismatch. This cannot offer the same protection against an unseen replacement-and-return between checks; use hash references for the production gate unless reviewers explicitly accept the measured provider constraint. Never fall back to `latest` for individual reads or mix provider heads.

Browser live reads require EIP-1898 and fail closed when unsupported. They have a ten-second acquisition deadline and independently label their block. The producer may retry acquisition privately within a bounded process policy; retry counts and RPC URLs are not public fields.

## Protocol facts and event history

Use `proposals(id).threshold`, totals and lifecycle flags directly, and `status(id)` as observed. Do not reconstruct state by summing Vote events. Vote.yea is bps and contributions can replace earlier contributions, including replacement with zero. Proposal ID zero and zero account/weight are valid. Flag sets retracted and flagged; Veto sets vetoed and conditionally retracted at that moment. A later total cannot identify the veto phase.

Flag/Veto logs do not identify actors. Omit attribution; no trace proofs or current-role classification are required. Preserve Vote.account and Execute.executor under their ABI meanings. Execute.executor is the execution caller, distinct from configured Executor. Signal completion may have status EXECUTED without an Execute event.

Record all required timeline events through the snapshot. Reconcile each original Propose identity/commitment against stored immutable facts; reject a disagreement rather than fabricating history. A retained missing or mismatched script can be represented by the consumer for safe degradation, but complete producer acquisition must recover and reconcile the Propose script before advancing production publication. Moderation reasons use their actual event bytes and ABI bound. No feed field promises historical authorization, semantic ABI discovery or conditional execution simulation.

## Canonical checkpointing and recovery

Persist canonical headers/checkpoints, event coverage and exact scripts durably. Before resume, verify the checkpoint hash against the node. On divergence, locate a common canonical ancestor, roll back orphaned indexed history and state checkpoints, rescan the affected ranges, then refresh all stored records/statuses at the replacement snapshot. If no retained ancestor is available, reacquire from inclusive deployment. Never combine orphaned and canonical events.

Incomplete coverage and reconciliation failures must produce operator alerts and preserve the last stable feed. Do not encode cursors, attempts, leases, journal paths, trace references or retention bookkeeping in the public feed. Retain source content/scripts durably independently of diagnostic snapshot retention. Diagnostic retention is an operator policy with a documented recovery horizon; it is not an unbounded public compatibility obligation.

## Candidate validation and publication

Use typed Rust values and an ordinary maintained JSON Schema validator for draft-07, plus small explicit semantic checks described in V2. Do not implement a general JSON Schema interpreter or the frontend Markdown parser. Run the shared examples through both ordinary schema tooling and actual Governance Apps acceptance. Keep acceptance/rejection origin records outside public bytes.

Create immutable candidate bytes once, including fixed observedAt. Store their digest and private publication sequence. Upload the immutable object, read it back and verify exact bytes/digest, then update the stable object last. Publication retry reuses the same bytes. A failed upload must not rewrite observedAt or add an attempt field.

Serialize candidate ownership across workers/process restarts. A delayed writer must never overwrite a newer candidate: use a durable monotonic publication generation/lease with fencing, and conditional object writes where supported. Observe the stable object's ETag, use If-Match when replacing it (or If-None-Match for initial creation), and treat a precondition failure as a concurrency conflict requiring reconciliation. An old candidate must not acquire the newer ETag and blindly retry. Persist publication intent/outcome so an uncertain network response can be reconciled by reading stable bytes. Candidate order remains private; observedAt must increase between distinct candidates, even when a reorg lowers block height.

[R2's S3 API](https://developers.cloudflare.com/r2/api/s3/api/) documents conditional PutObject support. Confirm exact client/header behavior in the later adapter tests. [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) describes strong storage consistency separately from cache behavior. CDN/HTTP caches can still serve older bytes; configure cache policy and purge/revalidation operationally, test stale edge delivery, and retain consumer last-good/out-of-order protection. Do not describe storage consistency as a guarantee about edge cache freshness.

## Acceptance and handback

After explicit authorization, implement only the producer lane. Return:
- Actual source/deployment verification and node capability evidence, including hash-pinned state calls and historical log coverage.
- Bounded all-proposal refresh timings, real payload sizes, candidate validation and canonical/reorg reconciliation evidence.
- Durable content/script recovery, restart-safe cursors and publication fault tests, delayed-write protection and cache checks.
- Immutable producer-generated response bytes, digests, canonical block and source/acquisition records outside the feed.
- The exact consumer review range used for validation and any proposed coordinated contract amendments.

Governance Apps then runs those exact bytes through the proxy/transport/parser/adapter and real routes; a consumer-generated fixture does not satisfy this gate. Recorded node or contract-executed scenarios must cover zero topics, replacement votes, both Veto paths, Flag retraction, status/configuration changes without logs and signal completion. Missing contract-execution evidence remains in WP10/WP16/WP17.

Fresh signing checks belong to later frontend write packages. In particular execute must simulate the actual Voting.execute call with actual caller and exact arguments against fresh state, verify the current stored script hash and record the simulation block number/hash/timestamp, bind it to the live preparation context, and invalidate preparation after account/network/proposal/script/configuration/observation changes, including replacement blocks at the same height. Missing block identity or a recent simulatedAt alone cannot pass; the feed snapshot is not the live preparation context. Historical Executor-frame simulation provides no substitute. No production write or publication is authorized by this handoff.
