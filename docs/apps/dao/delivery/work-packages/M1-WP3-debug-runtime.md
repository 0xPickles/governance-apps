# M1 WP3: Shared Debug Runtime

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Branch: `agent/dao/m1/wp3`

## Objective

Make every DAO mock state reachable through the existing floating debug panel,
deterministic clock, and typed E2E bridge while preserving existing domains.

## Depends on

- M1 WP2 merged into `agent/integration`.

## Expected ownership

- DAO `MockControls` section
- smallest needed edits to `components/DebugControls.tsx`
- DAO adapter additions in `lib/test-bridge.ts` and listener wiring
- mock-store and bridge tests

## Scope

- Persona, content, lifecycle, veto, analysis, account, execution, and authoring
  controls from the UI spec.
- Existing `+1 day`, `+7 days`, and reset integration.
- DAO root query invalidation and time-change hook.
- Typed E2E methods that mutate facts rather than only load scenarios.

## Non-goals

- No route-local scenario bar.
- No redesign of the shared debug shell.
- No production exposure of debug controls.

## Acceptance criteria

- Every required mock fixture is reachable without editing code.
- Time changes drive domain capability transitions.
- Reset clears DAO state and still clears all existing domains.
- E2E methods await mutation and query invalidation.
- Debug UI remains hidden under production rules.

## Validation

- Mock-store, time, reset, bridge, and regression tests.
- Debug-only route smoke.
- Standard repository checks.

## Review

Debug-runtime reviewer and test-infrastructure reviewer. Integrate third, then run
the full M1 test gate and tag only after engineering acceptance.
