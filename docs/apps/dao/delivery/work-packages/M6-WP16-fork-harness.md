# WP16: contract-executed integration environment

Status: Acceptance coverage in the authorized combined `agent/dao/m5/live` implementation. Separate package sequencing is superseded by the [milestone plan](../milestone-plan.md).

## Scope

Use the pinned/verified deployment contracts and a bounded existing fork/test environment. Record actual node responses and fixture origins outside the feed. Use the released producer at optional checkpoints when practical. Do not build a second indexer or permanent fork infrastructure.

## Acceptance

Acceptance: resolve source/deployment pin, demonstrate EIP-1898/current-state and deployment-inclusive historical logs, deterministic reorg/restart cases, exact scripts/content and real receipt identity zero. Clearly separate source-based, synthetic, contract-executed and live evidence.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
