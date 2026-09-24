# Unpublished review recovery validation — 2026-09-23

Implementation base: `f3aa25347e25842b6e311326fcf247146c626ff5`.
Recovery correction: `872abef3afb0aacd5e73eb7bda9da726d0936f81`.
Separate local-fork browser selection: `fffa2bc79267cdfa00016373fd75b7a293d232d1`.
The documentation commit completes the review range reported in the handoff.

## Scope and state

The authoritative input was the durable recovery packet's `CONTINUE.md`, `README.md`, diagnosis, and document record.
[Document verification](document-verification.json) confirms all three fixture copies match its exact recovered bytes.
Original B is 567 bytes with digest `0xeddf3b10786df3496b3d36a2cc7cfc0df55af2676e4e47d885ea3065ba40903e`.
Its timestamp remains `2026-09-18T16:53:51.000Z`.

The original acceptance D1 and request ledger remain missing. No comparison against an original database was possible.
The full-admission regression creates an explicitly synthetic D1 fixture from A/C/B in isolated test storage.
It verifies three admissions, three initial uploads, a runtime restart, rejection of a changed timestamp,
and successful identical B retry: still three admissions, four total uploads, and two B reservations.
Provider substitutes supply every test response. These results are not live acceptance evidence.

Before edits, App and local-services ports 3310/18546 were free. Original Anvil remained owned by `hydra`, PID 49883, launcher 49858.
Both retained the original worktree as their working directory. No arguments, environments, or private terminals were inspected.
A bounded read-only RPC check reported Anvil 1.5.1, chain 1, block 26028638,
hash `0x91324781ed169c133ec793be95e9d0eff7051daa87653163c1cb41c80d661dbc`, and zero proposals.
The packet's fork export has 5,992,202 bytes and SHA-256 `59da8916fabdb280d8c48a72d8183e7327ed7fdfb85c9db1a9916a7e1d73966d`.
It is valid even-length hex. It was inspected without loading or changing either fork state or snapshot metadata.

The old Browser was left untouched and not inspected. No live Pinata request, credential access, transaction, or acceptance cleanup occurred.
The isolated E2E copy excluded credential files and used port 3311, mocks, dummy credentials, and publication disabled.
Only agent-owned test services were stopped after validation. The original Anvil remains running; App remains stopped.

## Checks

| Check | Result |
| --- | --- |
| Exact recovered B and legacy published A recovery | Passed |
| Failed publication → remount → identical retry; server transaction gate | Passed |
| Unavailable/corrupt storage, script validation, account/deployment changes | Passed |
| File import and repeated exact downloads | Passed |
| Real isolated D1, full three-document limit, runtime restart | 22 tests passed |
| Focused form, draft, hook, storage, and helper checks | 43 tests passed before the final account-switch test; included in the complete run |
| `npm run test -- --maxWorkers=2` | 156 files, 1,454 tests passed at the recovery commit |
| Final helper-only checks after selecting the separate local fork | Nine passed, including two additional cases; unchanged application tests were not repeated |
| `npm run typecheck` and `npm run lint` | Passed after the final helper change |
| `npm run test:e2e` | 44 passed, one expected production-mode skip |
| `npm run test:e2e:full -- --workers=1` | 33 passed, one setup failure; retained in `e2e-full.log` |
| Targeted unchanged vote-revert rerun | One passed; retained in `e2e-revert-rerun.log` |
| Revised operator commands | All fish blocks passed `fish --no-execute`; commands were not executed against live acceptance |
| Complete diff whitespace check | Passed |

## Failures retained

The first combined focused run printed four test-fixture/assertion failures and then stopped reporting progress.
It was interrupted; it has no completed batch result. Subsequent isolated runs completed.
Initial typecheck also caught an incorrect script-vector property, a missing submission fixture field, and widened mock result types.
The new tests corrected those fixtures and compared byte arrays across the Node/jsdom boundary by their values.
An initial component assertion matched both the visible failure and its accessibility announcement; the assertion now expects both.
These were test corrections, not changes to content identity or publication policy.

The full browser run reported a failure in the unchanged vote-revert case.
`resetBridge` in `beforeEach` lost its execution context during navigation, before the test's action assertions.
Its saved page showed the board loading with no connected wallet, before the required action panel appeared.
The failure and any targeted rerun are recorded separately. They are not presented as a clean initial full-suite pass.
After both complete suites finished, the unchanged case passed alone in 16.8 seconds.
No application or test code changed for that rerun.

The earlier preparation compilation timeout and later successful preflight remain in
[the original preparation record](../pinata-preparation-20260917.json).
The packet also preserves C's initial 503, the cleanup-key deletion, the later ambiguous 400,
A's expected upload-key DELETE 403, revoked-K1 B failure, and changed-timestamp admission rejection.
No old counters, acknowledgement, pin status, or remaining allowance was reconstructed.

Commits used the established command-scoped unsigned fallback. No signing or JWT prompt was opened through agent tools.
The [operator checklist](../../pinata-recovery.md) defines the separately authorized follow-up and durable checkpoints.
