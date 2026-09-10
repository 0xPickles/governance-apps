# WP13: forum and durable content publication

Status: Acceptance coverage in the authorized combined `agent/dao/m5/live` implementation. Separate package sequencing is superseded by the [milestone plan](../milestone-plan.md).

## Scope

Preserve yearn.dao.proposal.v1 canonical bytes, SHA-256/CID, forum category/ancestry validation, safe Markdown and no-load attachments. Implement durable publication/pinning/retrieval without recanonicalizing fetched bytes. Keep publication distinct from onchain creation.

## Acceptance

Acceptance: immutable byte round-trip and durable recovery; publication failure does not expose creation; direct-contract proposals remain readable when forum/content conventions fail; no producer Markdown AST requirement.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
