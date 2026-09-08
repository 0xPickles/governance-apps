# WP8: V2 contract reset

Status (2026-09-08): implemented, externally approved and integrated with WP11/WP12; producer handoff approved. See the [exact approved range and integration record](../evidence/feed-v2/integration.md). Producer interoperability and later release gates remain pending.

## Scope

Small Zod source and generated draft-07 schema; explicit V2 identity; field/source mapping; complete state/log semantics; optional exact content bytes; trusted app deployments; shared acceptance and measurements. Remove active V1 generation/proofs/tests after regressions move.

## Acceptance

Acceptance: real consumer rejects V1; schema and consumer use shared saved examples; integrity failures remain local where specified; uint256/ID-zero/multi-deployment and bounds are tested.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
