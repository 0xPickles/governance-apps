# DAO live implementation: review evidence

Recorded on 2026-09-10. This is implementation evidence, not independent approval or a rollout decision.

## Review boundary

- Base: `28dd8fff2e7ff00961174635715be8d18ecd8d42`.
- Branch: `agent/dao/m5/live`.
- Review the complete base-to-tip range. The final handoff supplies the exact tip after this record is committed.
- Integration is clean and unchanged at the base. It has 141 commits absent from local master; master has 17 absent from integration.
- No merge, tag, deployment, production transaction, public exposure or forum post occurred.
- The existing milestone plan is the single active plan. WP13–WP17 remain acceptance coverage within this combined package.
- Historical acceptance records and wire schemas remain unchanged.

## Implemented behavior

Real clients now work in development when `NEXT_PUBLIC_USE_MOCKS=false`. Production never falls back to mocks.
The accepted screens use real proposer eligibility, forum validation, canonical content publication, wallet creation and lifecycle actions.

Transactions use the shared pipeline. Domain clients check the actual account, chain, allowlist, current roles, timing, hooks, capacity and commitments.
Required simulation uses the exact caller, destination and arguments against a fresh canonical block.
Changed inputs or observations invalidate preparation. Execution checks the original script against its current stored commitment.

Receipt confirmation checks the mined transaction and canonical receipt.
Creation validates the actual Propose event, including ID zero.
Published content survives wallet rejection and confirmed reverts.
A saved submission hash is recovered after reload and is never resubmitted merely because indexing is late.
Indexing completes only after the exact proposal and event appear.

Publication uses a real Kubo-compatible raw-block adapter with pinning and separate byte-for-byte retrieval.
It is not a publication stub. The tested service was an offline local Kubo node.
External service selection, credentials and durability remain operator inputs.

See [live service configuration](../../../live-services.md) and the [local runbook](../../../local-fork-uat.md).

## Evidence classes

| Evidence | Actual observation | Limit |
| --- | --- | --- |
| [Direct live feed](live-empty-direct.json) | Live endpoint returned one deployment and zero proposals at block 25947670 | Endpoint availability only |
| [Live feed through the app](live-empty-app.json) | Real app proxy and empty board passed; no wallet RPC requests; block 25947944 | Local reviewed-test candidate configuration; no production identity approval |
| [Released producer creation](producer-created.json) | Existing binary acquired one proposal and one Propose event from the local fork | Content retrieval was disabled; content is null |
| [Producer logs](producer-created.log) | Empty and creation checkpoints both succeeded | No later lifecycle, producer reorg or producer restart checkpoint was run |
| [Fork execution fixture](fork-execution.json) | Saved JSON built from canonical receipts and current contract reads; proposal zero executed | Scenario output, not producer output |
| [Local retention](local-retention.json) | Exact 382-byte raw block and recursive pin survived a Kubo restart | No external provider or retention SLA tested |
| [Production screenshots](screenshots/detail-390x844.png) | Compiled application rendered saved feed data across four viewport sizes | Saved-fixture UI evidence |
| [Fork screenshot](screenshots/fork-awaiting-execution-index.png) | Actual execution receipt confirmed while the displayed feed still awaited indexing | The older displayed status is intentional feed-lag evidence |

The live endpoint is [data.dao-ops.com/prod/dao.json](https://data.dao-ops.com/prod/dao.json).
The user reports that the producer was reviewed, released and activated.
Inspection found approved commit `7b67945253d91c495b148ee4f0a09a946a93390d` in the clean producer checkout at `23c4c1e85c1422f4cb2636ae5526bae6b8e89bb6`.
The endpoint reads and local binary runs provide separate evidence. They do not independently establish the remote deployment's release identity.

### Contract and producer checkpoints

The fork used Anvil 1.5.1 on chain 1.
The copied local upstream at port 8546 was unavailable.
Anvil used `https://ethereum.reth.rs/rpc` for upstream reads; transaction RPC remained on loopback port 18545.

Voting, Voter, Executor, blacklist and the proposal hook came from the deployed contracts.
Disposable setup replaced the weight measure and assigned local roles to throwaway wallets.
The helper also supplied an execution marker, which changed from zero to 42 after successful UI execution.

The [local deployment configuration](local-deployments.json) records test candidates.
The [temporary producer configuration](local-producer-config.json) records observed code hashes and deployment identity fields.
Neither is an independently reviewed production allowlist.
The pinned and producer-vendored Voting, Voter and Executor sources were compared and matched.
A fresh deployed-bytecode-to-compiler identity audit remains a release requirement.

The existing released binary ran in local mode with temporary state. No producer files or production outputs were changed.

| Checkpoint | Result | Output SHA-256 |
| --- | --- | --- |
| Empty | 0 proposals, 0 events, 515 bytes; 149 RPC requests; 14.569 seconds | `e522cbec5f751aa2c7f59aa08ee36039616058b008c4c2349b7a5de16e46508f` |
| Creation | 1 proposal, 1 event, 1412 bytes; 31 RPC requests; 58 milliseconds | `13cfe1766e90add949e005f4594e47bcbc6e312426fc2f546e80b967ba3af394` |

The empty output was superseded in the temporary output file; its [successful producer log](producer-empty.log) is retained.
The creation bytes are retained exactly and pass the consumer parser and adapter.
The separate fork execution fixture also passes them. These two tests are part of the full unit suite.

Kubo used `ipfs/kubo:v0.40.1`, image digest `sha256:9c70a3dba0b5f362bf99317a02384a194f5c91cf5388abdb8fe7d64d83dd20bb`.
It ran offline with its API bound to loopback port 15001.
The retained CID is `bafkreigscvqaoctcyt5twzudx73p7hoium6qifir2kpommtbtrtlwfbn4a`.
No public pin or forum test post was made.

## Validation results

Logs in [checks](checks/) have terminal formatting normalized and package paths made portable.
No dependencies changed. [Artifact hashes](artifact-sha256.json) identify the retained files.

| Command or check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 148 files, 1335 tests passed |
| `npm run test:e2e` | 44 passed, 1 expected production-mode skip |
| `npm run test:e2e:full -- --workers=1` | 33 passed, 1 test failed because it used the mock bridge before hydration |
| Corrected full-suite case | Passed after adding the existing bridge-readiness wait; the complete full suite was not rerun |
| `npm run test:e2e:dao-live` | 7 passed against the actual disposable fork |
| Strengthened moderation assertions | 5 selected cases passed, including canonical replacement, Flag retraction and vote replacement after Veto |
| `npm run test:e2e:dao-live-feed` | 1 passed against the actual live endpoint through the app |
| Enabled production DAO route tests | 2 passed; 2 saved-upstream requests; disconnected reads used no wallet RPC |
| Disabled production DAO route tests | 1 passed; page, feed, forum and content routes returned 404; 0 upstream requests |
| Production `npm run build` | Passed; 12 static pages generated |
| `npm run worker:build` | Passed |
| `npm run validate:worker-size` | Dry-run gzip size 3233.72 KiB, below the 9216 KiB repository budget |
| `npm run generate:dao-feed -- --check` | Passed |
| Complete-range whitespace check | Passed |

Production build checks explicitly used production runtime mode, disabled DAO, disabled mocks and disabled E2E.
The enabled-route runner separately compiled its enabled configuration.
No deployment command ran. The Worker size check used Wrangler's dry run.
Existing middleware deprecation and Worker dynamic-import warnings remain nonblocking.

An early targeted browser rerun reused a server that the completed parent suite then stopped.
That connection-refused run is not counted as a pass.
The retained corrected-case log comes from a standalone server and passed.

## Coverage and limits

- WP13: exact publication/retrieval, provider failures, request bounds, URL/category rules and retained publication are covered. External durability is unverified.
- WP14: proposal zero, wallet rejection, creation recovery, vote, retract, Flag and both Veto states ran on the fork.
- WP15: actual execution changed contract state. Wrong network, downstream reverts, head advancement and same-height canonical replacement blocked unsafe submission.
- WP16: guarded local setup, receipt-backed fixtures, EIP-1898 preparation, repeatable snapshots, Kubo restart and optional producer acquisition ran.
- WP17: replacement and zero contributions ran on deployed Voting. Replacement after positive-weight Veto preserved vetoed, nonretracted state at zero totals.
- Broader schema vectors and accepted mock scenarios still cover zero accounts, terminal signals, malformed content and configuration-driven observations.
- Those broader vectors are fixture evidence. This package does not claim fresh fork or producer execution of every WP17 vector.
- Producer lifecycle after creation, producer reorg/restart, cross-browser manual UAT and independent review remain unperformed.
- Snapshot refresh is explicitly separate from transaction receipt verification. It is never presented as proof of producer indexing.
- Recovery is scoped to the same browser tab and session. A cleared session or unavailable wallet response requires manual transaction reconciliation.

## Operator and review handoff

Provide an independently reviewed production `NEXT_PUBLIC_DAO_DEPLOYMENTS` value, including supported proposal hooks.
Provide the selected raw-block service URL, private `DAO_IPFS_AUTHORIZATION` secret reference, retention policy and approved external test target.
Confirm service compatibility and publication limits before public use.

Same-origin validation is not uploader authentication.
Keep preview access protected until independent review approves publication controls for the chosen service.

Independent review must cover the entire base-to-tip range, especially the shared transaction receipt extension and domain preparation boundaries.
The changes are not approved for integration.
Reconcile the 141/17 integration/master divergence separately before release.
Retain feature flags, protected-host checks, rollback and monitoring requirements from WP18.

The first four package commits were signed.
The configured 1Password signer then failed twice; the standard signer could not access the signing key.
Remaining local commits use a one-command `commit.gpgsign=false` fallback. Git configuration was not changed.
The final handoff records the clean branch tip. No unsigned fallback authorizes a merge or release.
