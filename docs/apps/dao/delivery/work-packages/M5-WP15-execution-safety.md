# WP15: fresh actual-call execution preflight

Status: Deferred; no production execution is added by the reset.

## Scope

Recover exact original script, compare keccak256 against current stored commitment, verify actual trusted Voting/current Executor support and status/flags/time/guard/role. Simulate actual Voting.execute(id, script) from the actual caller with exact transaction data against fresh state.

## Acceptance

Acceptance: failure or unavailability of required reads/simulation blocks normal execute; standalone Executor-frame or historical simulation cannot pass; changed inputs/observations invalidate preparation; simulation success is no guarantee; shared useTx only; empty signals expose no execute action.

## Dependencies and validation

[Current dependency graph](../dependency-graph.md) and [status](../status.md) supersede the previous V1 sequence. Use the [V2 specification](../../feed-schema-v2.md) and [producer handoff](../producer-handoff.md). Preserve historical acceptance as recorded facts.

Run typecheck, lint, unit tests, applicable smoke/full E2E and production build. Add focused contract/transport/content/transaction checks appropriate to changed behavior. Record failures, skipped checks and environment limits accurately. External review is independent; the implementer must not mark it complete or merge its own branch.
