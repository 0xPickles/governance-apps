# DAO feed V2 local evidence

This is consumer evidence from 2026-09-08. It is not producer interoperability,
live-node verification or newly contract-executed lifecycle evidence.
The complete conclusions and limitations are in [the reset report](../../feed-v2-reset.md).

## Reproduction

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --maxWorkers=1`
- `npm run test:e2e`
- `npm run test:e2e:full -- --workers=1`
- `npm run test:e2e:dao-feed`
- `npm run test:e2e:dao-feed -- --disabled`
- `npm run generate:dao-feed -- --check`
- `npm run validate:deps`
- `npm run measure:dao-feed`
- `git diff --check`

The production runners execute a complete Next webpack production build and
then start a local server. Their child environment disables mocks/debug/E2E
wallets and either enables V2 with synthetic app-owned deployments or disables
DAO entirely. They do not modify deployed configuration or publish anything.

The full-suite reruns selected the fixture sweep, proposed-script viewport
review, terminal states and Veto confirmation after the failures described in
the reset report. All cases retained explicit expectations. The veYFI smoke
rerun used its unchanged test file after a development reload.

## Inputs and origin

- [Saved public response](../../../examples/feed-v2/dao-feed-v2.example.json):
  synthetic 27-proposal consumer input, independent saved bytes used by tests.
- [Acceptance mutations](../../../examples/feed-v2/acceptance-cases.json):
  shared ordinary-schema and actual-consumer expectations.
- `tests/fixtures/dao-rpc-v2.ts`: explicitly synthetic ABI-encoded current reads.
- [Pinned source](../../../contract-reference.md): source-based protocol checks.
- [V1 measurements](measurements-v1.json), [V2 measurements](measurements-v2.json)
  and [boundary inventory](boundary-size.json): local measurements, not estimates
  of live producer traffic.

## Visual review

`tests/e2e/dao-feed/read.spec.ts` generated the captures below through the real
production-runtime routes. Browser time is fixed at 2026-09-08T12:00:00Z so the
August synthetic snapshot deliberately exercises stale presentation.
No real wallet identity or live feed data appears in these images.

Board captures: [390 px](screenshots/board-390.png),
[1280 px](screenshots/board-1280.png).

Detail captures: [390×844](screenshots/detail-390x844.png),
[768×1024](screenshots/detail-768x1024.png),
[1280×900](screenshots/detail-1280x900.png),
[1280×600](screenshots/detail-1280x600.png).

Focused technical disclosure: [390×844](screenshots/technical-390x844.png),
[768×1024](screenshots/technical-768x1024.png),
[1280×900](screenshots/technical-1280x900.png),
[1280×600](screenshots/technical-1280x600.png).

Manual image review covered mobile/desktop boards, detail layouts and focused
technical disclosure. Automated checks cover all listed widths, no document
overflow, keyboard Enter, no production debug control, no browser page errors,
no disconnected wallet RPC, last-good/incompatible recovery, both Veto states,
signal completion, unavailable/invalid content and empty feed. Existing full
E2E adds keyboard filters, reduced motion, 200% text and both-theme contrast.
