# M1 WP2: Route Shell and Navigation

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Branch: `agent/dao/m1/wp2`

## Objective

Add production-shaped DAO routes and safe empty/loading shells backed by the M1
domain client.

## Depends on

- M1 WP1 merged into `agent/integration`.

## Expected ownership

- `app/dao/page.tsx`
- `app/dao/DaoPageClient.tsx`
- `app/dao/messages.ts`
- `app/dao/proposals/[id]/...`
- `app/dao/propose/...`
- route/runtime/nav registration and tests

## Scope

- `/dao`, `/dao/proposals/[id]`, and `/dao/propose`.
- `DAO Governance` header identity.
- Shared-host path behavior and non-production route access.
- Initial feature-gate seam without exposing a production host.
- Disconnected, loading, empty, not-found, and error shells.

## Non-goals

- No complete list/detail design or form interactions.
- No feed, onchain, or transaction behavior.
- No change to `gov.yearn.fi` or stYFI Snapshot links.

## Acceptance criteria

- All routes load through the App Router pattern.
- `gov.yearn.fi` appears only as the forum/discussion surface.
- Normal route chrome has no mock or prototype label.
- Existing route, host, sitemap, and header behavior does not regress.
- Mobile shells have no page overflow.

## Validation

- Route/component tests.
- `npm run typecheck`, `npm run lint`, `npm run test`.
- Smoke E2E for all three routes.

## Review

Frontend reviewer and accessibility reviewer. Integrate second in M1.
