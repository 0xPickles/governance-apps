# M2 WP7: Mock UAT and Production-Parity Polish

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Branch: `agent/dao/m2/wp7`

## Objective

Review the assembled mock product, fix cross-package UX and accessibility issues,
record evidence, and present the M2 user gate.

## Depends on

- M2 WP4, WP5, and WP6 merged into `agent/integration`.

## Expected ownership

- scoped cross-route polish
- E2E state matrix
- UAT checklist and screenshots
- docs updated for accepted behavior changes

## Scope

- Phone, tablet, desktop, short-height, keyboard, focus, and reduced-motion review.
- Every mock fixture and lifecycle action.
- Copy consistency, action hierarchy, overflow, loading, and error recovery.
- Browser evidence for the user gate.

## Non-goals

- No feed, backend, RPC, IPFS, or contract integration.
- No speculative design-system rewrite.

## Acceptance criteria

- Normal routes look production-ready with debug UI closed.
- All state and authoring fixtures are reachable from the shared panel.
- Veto, quorum, threshold, decay, signal, content, and execution language is
  contract-accurate.
- Required widths and keyboard paths pass.
- Full mock tests are green.
- User sees the assembled product and explicitly accepts or returns changes.
- Returned changes become a documented `M2-WP7A`, `M2-WP7B`, and so on from the
  latest integration head, with the complete review loop repeated.

## Validation

- `npm run typecheck`, `npm run lint`, `npm run test`.
- `npm run test:e2e`, `npm run test:e2e:full`, `npm run build`.
- Browser screenshots and state checklist.

## Review

Independent frontend auditor, accessibility reviewer, contract auditor, and
integrator. Stop after reporting the user gate; do not start M3 automatically.
Do not tag M2 until the user explicitly accepts the latest follow-up.
