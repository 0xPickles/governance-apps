# WP18: gated production rollout

Status: Deferred; requires explicit production approval after staging/lifecycle acceptance.

## Scope

Verify reviewed deployment/source/configuration, feed endpoint, complete acquisition/health/age, current RPC, exact-call preflight, durable content/scripts, cache policy, conditional publication, monitoring and rollback. Preserve protected beta hosts and path-first release.

## Acceptance

Acceptance: production mode excludes mocks; all writes pass live checks and useTx; no required historical analysis; disable gates without losing chain/content records; expose dao.yearn.fi and change Snapshot links only under explicit production approval.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
