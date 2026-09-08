# DAO feed V2 consumer integration

Date: 2026-09-08. Branch: `agent/integration`.

The user supplied the external reviewer's approval of the exact consumer range
for integration and producer handoff. All three P2 findings and both additional
improvements are resolved. The integrator records that approval here; the earlier
[reset submission](../../feed-v2-reset.md) and [review follow-up](../../feed-v2-review-fixes.md)
retain their original findings and validation history.

## Exact range and merge

- Integration worktree: `/Users/hydra/Developer/yearn/governance-apps.agent.integration`.
- Approved worktree: `/Users/hydra/Developer/yearn/governance-apps.dao.m3.feed-v2`.
- Approved branch: `agent/dao/m3/feed-v2`.
- Approved range: `639782376bcaf05ab43ed9d9759c73154d0723b6..98a51bfe1b3fa258f0c3d443207dcad7a64eb6ed`.
- Integration merge: `77a20d116c253a69945a85bd7213efb7f43cf2a8`, with parents
  `639782376bcaf05ab43ed9d9759c73154d0723b6` and
  `98a51bfe1b3fa258f0c3d443207dcad7a64eb6ed`.
- Merge message: `feat(dao): integrate approved feed v2 consumer`.
- Both worktrees were clean and both branches matched the requested commits.
  The merge base was exactly the expected integration base. No branch had advanced.
- The `--no-ff` merge had no conflicts. Its tree and the approved tip's tree are
  both `b003d72f95393fe523c60b6265d172c7e2d4d4df`. No implementation corrections
  or unreviewed implementation commits were added.
- Current status and handoff documentation are updated in a separate documentation
  commit after the merge. Historical acceptance rows are unchanged.

Included implementation commits, in order:

| Commit | Subject |
| --- | --- |
| `8da47c6f1348c30e84df3531a5a07b09359cdd9c` | feat(dao): replace V1 evidence feed with V2 snapshot consumer |
| `2c80cef4d28d184eecd687be492565f739d61bba` | fix(dao): enforce supported network and align script review assertions |
| `68f3d0271ac7a08919666528a5874bdb777c5e9a` | fix(dao): explain retracted vetoes from stored flags |
| `71fa2c7827b81b31c1dc52174d7343539059693a` | test(dao): keep production gate probes on the selected local port |
| `4a4e6e9a36a5c8639db9046fa56d4a5c6201a555` | docs(dao): reset consumer requirements and producer delivery gates |
| `edf88b5328c2759ddb2627d85c41b0383e030ea5` | test(dao): record V2 validation, payload measurements and visual review |
| `f07ae47171cd72149eea53db8ef78f64f847698a` | fix(dao): gate feed endpoint before upstream access |
| `dff1f2556d15a31ae3b8aae21d126defe6f9cca7` | fix(dao): compare canonical proposal content bytes |
| `09275a0bb4d2724295d692076ec1191cd70c2b43` | fix(dao): bind execution preflight to live observations |
| `cc3ec98be274e854d2e5a98f5643ba60dcc0bcf7` | ci(dao): check generated feed artifact drift |
| `91648c2494c0010c7decb519e66215df908eb274` | test(dao): require renewed preflight after role changes |
| `98a51bfe1b3fa258f0c3d443207dcad7a64eb6ed` | docs(dao): record V2 review fixes and source equivalence |

## Post-integration validation

Checks run in the integration worktree with Node `24.1.0` and npm `11.14.0`,
matching `.nvmrc` / `engines.node` (`24.x`) and `packageManager` (`npm@11.14.0`).
The installed Node/npm pair was used because `nvm use` had no installed Node 24
entry. No toolchain or dependency changes were made.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test -- --maxWorkers=1` | Passed: 143 files, 1,287 tests |
| `npm run generate:dao-feed -- --check` | Passed: four generated artifacts match |
| `npm run validate:deps` | Passed |
| `npm run test:e2e` | Passed on the authorized local-server rerun: 44 passed, one expected production-only skip |
| `npm run test:e2e:full -- --workers=1` | Passed: 34 tests; no rerun |
| `npm run test:e2e:dao-feed` | Passed: production build, two tests, exactly two upstream requests (GET and HEAD); no rerun |
| `npm run test:e2e:dao-feed -- --disabled` | Passed: production build, one test, page/API GET and HEAD return 404 and exactly zero upstream requests; no rerun |
| Relative documentation links | Passed: 56 Markdown files, 260 local links; no anchor links present. External URLs were not fetched. |
| Full approved range and documentation whitespace checks | Passed |

The first smoke attempt exited before running test cases: the sandbox denied
listening on `127.0.0.1:3000` with `EPERM`. It was rerun with local-server
permissions; all 44 development-mode cases passed. The production-only case is
covered by the disabled production runner. This failed launch is not counted as
a pass. The successful smoke run emitted a non-failing React state-update warning
during authoring; no assertion failed and no implementation change was made.

The enabled and disabled DAO feed runners each completed their own production
build, generating all 12 static pages. No extra production build was run. Both
runners emitted the existing Next middleware-deprecation and standalone-start
warnings; their builds and assertions passed. The disabled runner's unchanged
zero-upstream-request assertion passed with `DAO_DATA_URL` configured. The full
suite and both production runners used local-server permissions on their first
attempts. No other validation failed or required a rerun.

The enabled runner writes its captures into the tracked evidence directory. Two
mobile PNGs differed after this run (`detail-390x844.png` and
`technical-390x844.png`). The generated copies were retained locally under
`/private/tmp/dao-v2-integration-captures/`, then these two tracked files were
restored from the approved tip. The integration preserves the approved screenshot
set; no implementation or test assertions changed.

## Producer readiness and remaining gates

Consumer external review is complete and producer handoff is approved. WP9
producer implementation is the next dependency and may now start in a separately
authorized Gov Apps Stats task after its lane and target preflight. Use the
[producer handoff](../../producer-handoff.md) and this exact approved consumer
range. This integration did not inspect or modify Gov Apps Stats; its last
recorded inspection remains historical evidence.

The following remain pending:

- Actual producer-generated bytes validated through the proxy, transport,
  parser, adapter and real routes, including shared acceptance cases.
- Live deployment and dependency verification, actual node capabilities and
  producer acquisition/publication evidence.
- Contract-executed lifecycle and reorg evidence, including later WP16/WP17 UAT.
- Staging validation of the producer and consumer together.
- Production approval and the remaining rollout gates.

Local fixtures and production-build tests do not establish producer
interoperability, live deployment correctness or production readiness. V2 remains
open to small coordinated amendments supported by producer evidence and reviewed
across both repositories.

No push, tag, deployment, production DAO write enablement, Gov Apps Stats change
or worktree removal was performed.
