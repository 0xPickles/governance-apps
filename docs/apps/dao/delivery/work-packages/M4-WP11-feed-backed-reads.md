# WP11: V2 reads and current wallet overlay

Status (2026-09-08): implemented, externally approved and integrated with revised WP8/WP12; producer handoff approved. See the [exact approved range and integration record](../evidence/feed-v2/integration.md). Actual producer interoperability remains WP10 and is pending.

## Scope

Real bounded proxy/transport, scoped client selection, queries, multi-deployment list/detail, ID zero, last-good/stale/unavailable/incompatible states, canonical replacement and separately observed wallet state. Production mock fallback is removed.

## Acceptance

Acceptance: saved V2 response uses real routes; disconnected global reads need no wallet RPC; controlled coherent RPC tests cover network/account/disconnect/error, current config/weight/voted/roles and stale eligibility invalidation. Actual producer integration remains WP10.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
