# WP17: cross-repository lifecycle UAT

Status: Deferred; explicit UAT acceptance required.

## Scope

Exercise proposal zero; votes including zero accounts/weights and replacement; Flag retraction; Veto at zero/positive totals and later replacement to zero; vetoed-but-votable; signals with EXECUTED status and no Execute; config/time status changes without logs; stored threshold persistence; writes, simulation failure, feed lag and canonical replacement.

## Acceptance

Acceptance: actual producer bytes pass actual consumer routes, connected/current wallet actions and confirmed receipt identity; no fabricated history/attribution; mobile/desktop/keyboard review and durability/publication recovery; user accepts evidence before rollout.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
