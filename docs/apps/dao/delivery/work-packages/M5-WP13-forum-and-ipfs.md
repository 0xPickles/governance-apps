# WP13: forum and durable content publication

Status: Inherited acceptance coverage from `agent/dao/m5/live`, continued by [the Pinata publication task](../pinata-publication-task.md) on `codex/dao/m5/pinata`. The [milestone plan](../milestone-plan.md) controls sequencing.

## Scope

Preserve yearn.dao.proposal.v1 canonical bytes, SHA-256/CID, forum category/ancestry validation, safe Markdown and no-load attachments. Implement durable publication/pinning/retrieval without recanonicalizing fetched bytes. Keep publication distinct from onchain creation.

## Acceptance

The public publication flow replaces per-document operator grants with bounded admission. Keep the editor and preview.
The spike is closed; small credential checks belong to final staging acceptance and do not block implementation.

Acceptance: immutable byte round-trip and durable recovery; publication failure does not expose creation; direct-contract proposals remain readable when forum/content conventions fail; no producer Markdown AST requirement.

## Implemented publication requirements

- Fixed legacy Pinata file upload with CIDv1 and no directory wrapping.
- Strict canonical input, digest, CID, response-size, and exact gateway-byte checks.
- One D1 ledger for atomic admission, cumulative bytes, attempts, leases, and recovery.
- Default-off publication, independent reads, sanitized errors, and server-only credentials.
- No document grants or publication-only signature. Governance authorization remains.
- Local D1 restart/concurrency tests and disposable fork/producer evidence.

[Operations](../../pinata-publication.md) defines defaults and accounting.
[Operator acceptance](../../pinata-acceptance.md) supplies the bounded credential session.
[Current evidence](../evidence/m5-pinata/README.md) records actual checks and release gaps.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
