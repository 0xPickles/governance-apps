# M1 WP1: Domain Model and Deterministic Mocks

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Branch: `agent/dao/m1/wp1`

## Objective

Create the typed DAO boundary, deterministic mock client, capability derivation,
and full Executor-script structural parser. UI components must not own contract
math.

## Depends on

- M0 WP0 merged into `agent/integration`.

## Expected ownership

- `lib/clients/dao/types.ts`
- `lib/clients/dao/client.ts`
- `lib/clients/dao/mock.ts`
- DAO mock fixtures and pure domain helpers
- focused unit tests

## Scope

- Composite proposal identity.
- Raw protocol status, display status, and action capabilities as separate data.
- Epoch/timing, threshold, vote, signal, veto, and content-failure derivation.
- Feed-shaped proposal fixtures from `mock-data.md`.
- Proposer eligibility, rolling six-epoch shared capacity, and fresh execution
  preflight state.
- Script parsing and fixed error vectors.

## Non-goals

- No routes or visual components.
- No live feed, RPC reads, writes, IPFS upload, semantic decoding, or simulation.
- No new shared abstraction unless existing domain patterns cannot express the
  boundary.

## Acceptance criteria

- Every required fixture is representable.
- A post-vote veto can produce `status: vetoed` and `canVote: true`.
- An early veto cannot.
- Empty-script terminal display is `Approved` with no executable actions.
- Threshold is proposal-specific.
- Author eligibility reports blacklist, weight, cooldown, and shared capacity
  without treating the 64-proposal limit as per-account.
- Parser enforces exact framing, 64 calls, 2,048 bytes, and hash output.
- Bigints and JSON boundaries are explicit.

## Validation

- Unit tests for status/capability pairs and time boundaries.
- Fixed script vectors for every parser error code.
- `npm run typecheck`, `npm run lint`, `npm run test`.

## Review

Type/domain reviewer and contract auditor. Integrate first in M1.
