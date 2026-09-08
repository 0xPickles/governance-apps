# M2 WP5: Voting and Lifecycle Actions

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Branch: `agent/dao/m2/wp5`

## Objective

Add mock Yea/Nay voting and eligible retract, flag, veto, and execute actions
through production-shaped transaction states.

## Depends on

- M2 WP4 merged into `agent/integration`.
- M2 WP6 may be in review but is not a code dependency.

## Expected ownership

- detail action panel and confirmations
- DAO mock mutation methods and hooks
- transaction-state and interaction tests

## Scope

- Wallet, network, weight, decay, already-voted, timing, and role states.
- Decision voting and post-veto participation voting.
- Retract, flag, veto, and execute mock actions.
- Signing, pending, success, failure, and awaiting-index states.
- Tiered content-failure confirmations.

## Non-goals

- No raw wagmi writes.
- No optimistic canonical history.
- No live role or weight reads.

## Acceptance criteria

- Neither vote direction is preselected.
- Early veto blocks voting; post-vote veto preserves Yea/Nay while open.
- Vote confirmation shows direction and effective weight.
- Duplicate vote and zero effective weight have exact blocked reasons.
- Signal proposals never imply executable calls.
- Role confirmations state their contract effect.

## Validation

- Interaction tests for every action and failure.
- Regression test for voting after veto.
- Timing and duplicate-vote tests.
- E2E lifecycle flow and standard checks.

## Review

Contract auditor and transaction UX reviewer. Integrate after WP4 and WP6.
