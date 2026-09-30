# Pinata publication acknowledgement correction

Supersession note, 2026-09-30: use the [canonical preprod procedure](../../../preprod-validation.md) for current infrastructure and key installation.
Shared D1 configuration replaces the reserved-ID requirements below. Historical correction evidence and acceptance-key instructions retain their original scope.

Review base: `6886f447da52006f9659b91a5129572b944a92e5` on `codex/dao/m5/pinata`.
Correction commit: `a5b82c412df26eae3dfe4e5e64aa16221de94a0d`.
Code review range: `6886f447da52006f9659b91a5129572b944a92e5..a5b82c412df26eae3dfe4e5e64aa16221de94a0d`.
The worktree was clean at correction start.
The [original implementation evidence](../m5-pinata/README.md) remains historical and unchanged.
The inherited M5 dependency remains `fc81ae0502efe45ed84367062a57df16c6dab46c`; integration order is unchanged.

## Finding tracker

| Finding | Correction | Status |
| --- | --- | --- |
| P2: gateway retrieval could complete publication without an accepted upload | Require an acknowledged upload before retrieval and enforce `upload_accepted = 1` in D1 completion | Implemented; independent re-review pending |

The reviewer reproduced a rejected upload followed by successful open-gateway retrieval.
The application then reported publication with `upload_accepted = 0`.
The reviewer reported 54 targeted passing tests, typecheck, focused lint, and 49 valid evidence checksums.
Those are reviewer-reported results, separate from this correction's validation below.

## Correction

An unacknowledged request must upload the same canonical bytes again within the existing attempt allowance.
Only a validated Pinata response records upload acceptance.
The app then requires exact gateway bytes before publication.
Acknowledged uploads continue retrieval after restart without another upload.
The D1 completion update independently rejects a record without upload acceptance.

Deduplication and retained reads also reject older success records with no acknowledgement.
This preserves their bytes and spent counters for operator reconciliation.
No schema migration, permission change, new infrastructure, or provider experiment is needed.

An open gateway can retrieve content outside this account's pins.
See Pinata's [gateway access documentation](https://docs.pinata.cloud/gateways/gateway-access-controls).
Gateway retrieval therefore proves byte availability, not this account's upload acceptance.
The [operations guide](../../../pinata-publication.md) documents the corrected retry rule and the existing-ledger audit.

## Validation

Tests use real local D1 with mocked upload and gateway responses.
The gateway fixture always returns the exact bytes, including while upload requests fail.

- New regressions reject both HTTP 403 and ambiguous upload outcomes on repeated attempts.
- Success requires a later validated acknowledgement for the same bytes, digest, and CID.
- Exhausting upload attempts does not convert available gateway bytes into successful publication.
- Direct D1 completion fails without acknowledgement.
- Acknowledgement survives restart and avoids reupload.
- Older unacknowledged success records fail closed without counter changes.

| Check | Result | Evidence |
| --- | --- | --- |
| Pre-fix reproduction on real D1 | 5 expected regression failures, 2 runtime timeouts, 14 passes | [Reproduction](checks/red.log) |
| Corrected publication and authoring regressions | 57 tests passed in four files | [Focused tests](checks/focused.log) |
| Complete unit run | 1,391 passed, 6 failed across 153 files; exit 1 | [Full unit run](checks/unit.log) |
| Separate rerun of six full-suite UI failures | 1 passed, 5 failed; 44 unselected tests skipped | [UI rerun](checks/ui-rerun.log) |
| `npm run typecheck` | Passed | [Typecheck](checks/typecheck.log) |
| `npm run lint` | Passed | [Lint](checks/lint.log) |
| Original evidence integrity | All 49 retained checksums valid; original files unchanged | [Checksums](checks/original-checksums.log) |
| Current documentation links | All relative links resolve | [Links](checks/document-links.log) |

The focused run used `--testTimeout=30000` for local D1 runtime headroom.
Its complete command was:

```sh
npx vitest run tests/unit/lib/clients/dao.publication-store.test.ts tests/unit/lib/clients/dao.publication.test.ts tests/unit/lib/clients/dao.publication-policy.test.ts tests/integration/hooks/useDaoLiveRecovery.test.tsx --testTimeout=30000
```

The two reproduction timeouts occurred in existing D1 race and propagation checks under heavy system load.
The corrected run passed those checks without assertion changes.
The complete unit command was `npm run test -- --maxWorkers=2 --testTimeout=30000`.
It completed in 1,660.53 seconds. The machine's observed load average exceeded 170 during validation.
The six failures were confined to the two UI files listed below; both files are unchanged.
All 151 other files passed, including the real D1 publication regressions.

The separate UI rerun used one worker and the same 30-second test timeout:

```sh
npx vitest run tests/components/TeamsPageClient.test.tsx tests/components/DaoProposalAuthoringForm.test.tsx --maxWorkers=1 --testTimeout=30000 --reporter=verbose -t 'cleans an unknown|mutates route coverage|keeps published bytes|shows fixed parser code|publishes a Signal snapshot|shows the transaction before receipt identity'
```

Receipt-to-index recovery passed on that rerun. Five failures remain unresolved:

- Teams directory cleanup: expected heading not found.
- Teams debug state: expected loading text not found.
- DAO reverted-receipt recovery: 30-second timeout.
- DAO parser display: expected parser code not found.
- DAO Signal publication: expected review heading not found.

These tests exercise unchanged mock-backed UI code. This correction changes only server publication and D1 success conditions.
Heavy host load is observed context, not a proven explanation for every failure.
The partial rerun does not establish a passing full suite.

The editor, route schema, and governance transaction code are unchanged.
Browser/fork suites and builds were not repeated for this correction; their earlier results remain historical in the original evidence.
The [SHA-256 manifest](artifact-sha256.txt) covers every retained correction evidence file except itself.
Local paths, the machine name, and terminal formatting are normalized in retained logs.

## Acceptance and deployment handoff

The [prepared operator session](../../../pinata-acceptance.md) now explicitly checks acknowledgement state before and after key replacement.
Its existing four-upload and 25-request ceilings remain unchanged.
Review this correction before that bounded session.
The operator enters fresh keys privately; this task must not inspect credentials.

Deployment configuration requires the selected public HTTPS gateway and reviewed production/preproduction D1 IDs.
These non-secret inputs were requested while the local correction continued.
No missing private credential blocks implementation or local validation.
Reserved D1 IDs and disabled feature flags remain until reviewed values and rollout authority are available.
No authenticated Pinata request, remote provisioning, deployment, push, or merge occurred during this correction.
