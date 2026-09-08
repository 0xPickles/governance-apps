# WP14: live governance writes

Status: Deferred; production write methods remain disabled in this reset.

## Scope

Implement only reviewed actions via prepared domain clients and shared useTx. Verify actual account/chain/trusted deployment, roles, current stored proposal/contribution, timing/configuration and action-specific hook/capacity conditions before signing. Never authorize from a feed label.

## Acceptance

Acceptance: simulate actual caller/destination/arguments; invalidate preparation on account/network/proposal/script/relevant observation change; test zero receipt ID and same-identity awaiting-index recovery; no duplicate creation on feed lag; content failure does not forbid eligible voting; Flag and both Veto paths remain correct.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
