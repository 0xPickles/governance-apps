# Pinata publication acknowledgement correction

Review base: `6886f447da52006f9659b91a5129572b944a92e5` on `codex/dao/m5/pinata`.
The worktree was clean at correction start.
The [original implementation evidence](../m5-pinata/README.md) remains historical and unchanged.

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

The initial reproduction produced five expected regression failures and two local-runtime test timeouts.
The corrected focused run passed all 57 tests in four files.
It used a 30-second test timeout to accommodate the local D1 runtime.
Typecheck and the full repository lint command passed.
Final repository checks are recorded here after completion.

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
