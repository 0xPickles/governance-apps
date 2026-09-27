# DAO local validation completion — 26 September 2026

This completion record is historical. The user confirmed independent approval through `9bee14b9037396899d8f1d3d3b604eabeeba7427`.
Use the [master reconciliation handoff](master-reconciliation-20260926.md) for the current candidate, review range, and later session rebuild instructions.

The outstanding local preparation passed. The durable session contains one UI-created executable proposal in the Voting phase.
All owned services are stopped. The broader interactive walkthrough remains pending independent review and master reconciliation.

## Source and review scope

- Expected and inspected starting commit: `9a186ac5b6b5f7ac30b742d609f4c1a6ab39c865`.
- Tested application and tooling source: the same commit, exported into the durable session.
- Approved merge and review base: `4e7d4fd51d39eadc060fccbae77c1748d9375069`.
- This completion adds documentation and sanitized evidence only. No application, harness, configuration template, or producer source changed.

The final delivery commit contains this record. Its exact SHA and review range are recorded after commit in the durable `final-handoff.json`.
The file is at `/Users/hydra/Developer/yearn/dao-local-validation/20260926/final-handoff.json`.
Resolve the same delivery commit from Git with:

```fish
git log -1 --format=%H -- docs/apps/dao/delivery/integration-20260926.md
```

The review range starts after the approved merge and ends at that delivery commit.
The [September 24 record](integration-20260924.md) retains the merge parents, earlier failures, and larger regression results.

## Completed validation

| Check | Result |
|---|---|
| Latest tooling regressions | Seven files, 41 tests passed, including localhost wallet confinement |
| Typecheck and lint | Passed in an isolated checkout without private environment files |
| Optimized build and startup | Passed with real DAO clients, loopback Anvil, local D1, and offline Kubo |
| Built-app smoke | Passed on the first attempt in the durable session, in 13.996 seconds |
| Canonical proposal verification | Successful receipt, transaction calldata, proposer, epoch, block hash, transaction index, and log index matched |
| Content and script verification | Exact 397 document bytes matched the download, D1, gateway, app content route, and producer output |
| Served feed and rendering | The actual `/api/dao-data` response matched released-producer output; the proposal rendered through the built route |
| Phase change | Actual fork time advanced from Proposed to Voting; the producer and UI reflected the change |
| Populated stop/resume | Proposal, canonical receipt, content, D1 policy/accounting, and producer history survived |
| Freshness after resume | Unsigned vote review passed; stale browser time blocked actions; restored fork time restored review |

The sole proposal is ID `0` on Voting contract `0x543e8871562a8c53e8b6a26835aeecb3a5a13070`, chain ID `1` on disposable Anvil.
Its creation transaction is `0x0f17eaf04409d1d3f3619fbdcfaadc391d23a7d4f90de4d48a77d10aa5b9921e`.
Its content digest is `0xa39c94b28720a40c5f1247f547a2c9d09278e3cfd9ae54cc0f52c20cad271891`.
Its script hash is `0x12e7e738438dfb13213ae69ae19b2f65c046cebf854209f9146aa6583ffb3c10`.
The [evidence directory](evidence/local-validation-20260926/README.md) retains exact bytes, receipts, feeds, configuration, and checkpoint comparisons.

No second proposal or vote was submitted. Vote review stopped before confirmation.
D1 retained one document, one upload attempt, and one retrieval attempt across phase change and restart.
The same producer state directory retained its log and extended its checkpoint history from 19 to 20 to 21 entries.

| Checkpoint | Contract state | Feed block | Block time | Producer observation / fork / browser time |
|---|---|---|---|---|
| Created | PROPOSED | 26060697 | 1790414460 | 1790414466 |
| Phase change | VOTING | 26060700 | 1791417610 | 1791417612 |
| Resumed | VOTING | 26060704 | 1791417614 | 1791417617 |

Times are Unix seconds. The local fork reached October 8 through intentional phase advancement; the workstation clock remained unchanged.
The producer ran with its recorded process-clock dependency. No feed timestamp or document byte was edited.
Freshness checks retained their existing limits. The stale-clock check changed browser time only and submitted zero transactions.

## Diagnostics and limits

Cold-RPC timeouts did not recur in this pass. The first producer acquisition took 17.638 seconds and 93 RPC requests.
The next three acquisitions took 82, 60, and 300 milliseconds with retained history.
These results show one successful fresh-session run and restart. They do not establish repeated cold-start reliability or explain every earlier timeout.

Use the launcher's readiness sequence before opening the browser. It verifies Anvil identity, offline storage, producer acquisition, and the built feed route.
No extra warm-up, timeout increase, or assertion relaxation was required.
If a deadline fails later, retain its logs and inspect receipts and accounting before retrying.
Compare public fork-upstream latency with loopback RPC and application timing before attributing the failure.

Two diagnostic issues did not require product changes:

- The system SQLite reader could not open the active local ledger. Node's read-only SQLite reader returned the ledger successfully.
- The first freshness diagnostic expected an internal RPC error string. The UI intentionally shows its generic unavailable-action message.
  The corrected diagnostic checked that message, absent vote controls, zero transactions, and restored unsigned review. The original screenshot and diagnostic remain retained.

The larger release suites were not repeated. Only documentation and evidence changed after the tested candidate.
The September 24 suite results retain their original source scope; they are not new results from this pass.

The desktop/mobile screenshots are smoke evidence. They do not complete the broader interactive walkthrough.
Production authorization, hosted Worker behavior, live Pinata, preprod deployment, and mainnet transactions remain outside this pass.

## Durable environment and preservation

- Active session: `/Users/hydra/Developer/yearn/dao-local-validation/20260926/session`.
- Clock dependency: `/Users/hydra/Developer/yearn/dao-local-validation/20260926/dependencies/libfaketime-v0.9.13/src/libfaketime.1.dylib`.
- Clock SHA-256: `18741dd4fd8d794205b0dc710505d7fe7e8707e85f42951b732093ecbddf838e`.
- Released producer SHA-256: `61c51b8528cb249b8290b0bc1fe9acc9f9514be7a5991d8af22fd61fedc8ff5c`.
- Offline container: `dao-validation-857869440066`, stopped; retain it because it holds content blocks.
- Raw checks and diagnostic scripts: `/Users/hydra/Developer/yearn/dao-local-validation/20260926/checks`.

The old session remains at `/private/tmp/dao-ui-validation-20260924-v3`.
An additional preserved copy is at `/Users/hydra/Developer/yearn/dao-local-validation/20260926/previous-session-20260924`.
Inspection found zero publication rows and zero Propose events among its five setup transactions.
The copy includes its prior failures and source exports. Selected critical files have matching hashes in `preservation.json`.

The preserved copy is an archive, not a relocated runnable session.
Absolute manifest paths, build fingerprints, producer state paths, and container ownership labels require the original location.
The separate durable session has its own fresh fork, ledger, source export, clock path, and container.
No accounting or historical acceptance state was reset, moved, or reused.

The session still depends on the recorded producer binary and the repository's installed, locked dependencies.
Keep those paths and the stopped container available. Use a new session after a dependency installation.

## Start, resume, and stop

Use this definitive fish-compatible sequence for the existing durable session. Do not run `init`, reset it, or rerun proposal creation.
The manifest selects the tested source export; documentation-only delivery changes do not require rebuilding it.

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.integration
set session /Users/hydra/Developer/yearn/dao-local-validation/20260926/session

# Start or resume the retained populated session.
npm run dao:validate -- start "$session"
npm run dao:validate -- status "$session"
npm run dao:validate -- browser "$session"

# After relevant UI transactions or a phase change, acquire actual producer output.
npm run dao:validate -- refresh "$session"

# Stop all owned services and retain their state.
npm run dao:validate -- stop "$session"
npm run dao:validate -- status "$session"
```

The browser opens `http://localhost:3310/dao`. Connect **Browser Wallet** and open proposal `0`.
Keep the browser's default `producer` feed and `fork` clock controls for transaction evidence.
The [local runbook](../local-validation.md#scenario-matrix) provides the prepared walkthrough matrix and controls.
Complete independent review and master reconciliation before that broader walkthrough, as requested.

At shutdown, Anvil, app, browser, and offline container were stopped.
Ports `3310`, `18545`, `18546`, `15001`, and `18080` had no listeners. Nothing was intentionally left running.
No merge, master reconciliation, authenticated Pinata request, push, tag, deployment, or mainnet transaction occurred.
