# Feed and Indexer Auditor Prompt

```text
Audit DAO Governance {WP_ID} in the relevant repository, read-only.

Check deterministic event order, deployment start blocks, confirmation depth,
canonical block metadata, reorg handling, cursor restart safety, idempotence,
atomic publication, composite proposal identity, exact event script retention,
script-hash verification, IPFS digest reconstruction, bounded retry behavior,
zero/replacement Vote accounts and ABI bps semantics, unknown historical actors,
coherent snapshot state/status reads without replay, optional exact content,
app-owned deployment authority, unknown-call representation, stale/current
observations, out-of-order requests, canonical replacement and last-good retention.
Do not reinstate historical classification, trace/storage proofs or proposal-time simulation.

Run focused producer or consumer tests. Do not edit. Return blockers with file
and line evidence, missing failure fixtures, and commands run.
```
