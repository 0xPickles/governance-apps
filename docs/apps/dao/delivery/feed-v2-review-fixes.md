# DAO V2 review follow-up

The external review of `63978237..edf88b53` supported the V2 direction and
requested three P2 fixes before approval. It independently passed 1,264 tests,
typechecking, focused lint and generated-artifact comparison. It inspected
submitted browser evidence without rerunning browser suites or production builds.

This follow-up starts at `edf88b5328c2759ddb2627d85c41b0383e030ea5` on
`agent/dao/m3/feed-v2`. It changes Governance Apps only. Integration and
Gov Apps Stats remain untouched. Final external approval, producer-start
approval and interoperability remain pending.

## Findings and implementation

| Review item | Correction | Regression evidence |
| --- | --- | --- |
| P2 feed endpoint bypassed rollout flag | GET checks isDaoEnabled before reading configuration/fetching. Explicit HEAD shares the gate and returns no body. | Production-disabled page/API GET and HEAD return 404; a configured, counted local upstream receives zero requests. Enabled production endpoint success remains covered. Unit tests cover configured and absent upstream while disabled. |
| P2 decoded strings lost BOM bytes | Compare original bytes directly with canonical serialization after the existing digest, UTF-8, structure and safe-content checks. | Matching-digest BOM content is proposal-local invalid; canonical non-ASCII content remains available and unrelated proposals remain readable. |
| P2 execution preflight lacked state binding | Successful preflight requires a block observation and local preparation equality key. Capability checks require valid, fresh matching live block number/hash/time and matching relevant proposal, wallet, roles and configuration inputs. | Missing observations/number/hash/key, malformed/negative/stale block, changed live context/configuration/role/state, same-height canonical replacement and prepared mock submission are rejected. A newly bound preflight passes. Older feed observation does not determine preparation validity. |

The live block hash binds all state reads at that block, including current
Executor/Voter and other configuration. The local equality key additionally
guards changes to the supplied capability inputs; it is neither a public field
nor a proof. A recent simulatedAt alone cannot pass. Context keys exclude feed
observation metadata and the preflight itself. Mock live observations remain
separate from feed observations and advance without automatically resimulating.

Production write methods stay disabled. No new signing or simulation RPC path,
feed fields, pagination, service or content-distribution framework was added.
Single-snapshot launch and existing budgets remain unchanged.

Code/test commits: `f07ae47` (endpoint), `dff1f25` (content bytes),
`09275a0` (live preparation), `cc3ec98` (CI) and `91648c2`
(browser role-change regression). Review the complete
`edf88b5328c2759ddb2627d85c41b0383e030ea5..agent/dao/m3/feed-v2` follow-up
range, including the documentation commit.

## Additional review improvements

- Security And Quality CI now runs `npm run generate:dao-feed -- --check`,
  covering all four deterministic generated artifacts.
- [Exact source comparison](evidence/feed-v2/source-comparison.md) independently
  confirms Voting, Voter and Executor are identical at the two reported pins.
  The consumer pin remains unchanged. Deployed-code verification and other
  relevant dependencies remain later gates.
- Specification, requirements, execution-package acceptance, runbook, handoff,
  reset report and status ledger describe these corrections.

## Validation

- Typecheck and repository lint passed. The final browser-test addition also
  passed focused lint; both production runners perform a Next production build.
- Full unit/integration suite: 143 files, 1,287 tests passed. A final strengthened
  prepared-execution assertion passed in the 29-test action suite.
- Generated-artifact drift check and dependency policy passed. All four
  generated outputs remain unchanged.
- Smoke: 44 passed; the one production-only test was skipped in development
  and is covered separately by the disabled production runner.
- Full E2E: 33 passed initially; the guard/role case expected immediate enablement
  after a context change. The corrected test first requires disabled execution
  and the fresh-simulation reason, then supplies a newly simulated guarded mock
  scenario and retains the enabled assertion. Its focused rerun passed, covering
  all 34 cases. No assertion was relaxed to allow a stale preflight.
- Enabled production runner: build passed, both tests passed, counted upstream
  requests = 2 (GET and HEAD). The saved response also rendered through real
  routes without wallet RPC or mock fallback.
- Disabled production runner: build passed, one test passed, page/API GET and
  HEAD returned 404, counted upstream requests = 0 with DAO_DATA_URL configured.
  Security headers and beta-host gating passed.
- Full E2E covered responsive action controls, keyboard access, reduced motion,
  both-theme AA contrast and 200% text scaling. Production captures additionally
  cover 390/768/1280px layouts; the regenerated mobile and desktop full-detail
  images were inspected. The existing screenshot evidence set is retained.
- Documentation links and full-range whitespace checks passed.

The initial smoke launch was blocked by the sandbox's local listening restriction
before running cases; its authorized local-server rerun passed. An initial new
BOM fixture lacked the required proposal body; it was corrected to valid content
so the regression isolates original-byte canonicality. These failed attempts are
not counted as passes.

Commands: `npm run typecheck`, `npm run lint`, `npm run test -- --maxWorkers=1`,
`npm run generate:dao-feed -- --check`, `npm run validate:deps`,
`npm run test:e2e`, `npm run test:e2e:full -- --workers=1`,
`npm run test:e2e:dao-feed`, `npm run test:e2e:dao-feed -- --disabled`,
and the focused full-suite rerun with
`--grep 'shows exact account, timing, and execution guard reasons'`.

No real producer output, live deployment verification, contract-executed UAT,
remote staging, deployment or production transaction was performed. Those
gates remain in the [status ledger](status.md).
