# DAO integration and local validation — 24 September 2026

This record preserves the September 24 results and shutdown.
The [September 26 completion](integration-20260926.md) supersedes its outstanding local-preparation items and temporary-session resume commands.
Use that record for the durable session, completed populated-state checks, and current review handoff.

## Source identity

- Authorized baseline: `28dd8fff2e7ff00961174635715be8d18ecd8d42`.
- Exact approved package: `da041f5eaa5abe55ed5221f2642d3f0b047e5315`.
- Merge: `4e7d4fd51d39eadc060fccbae77c1748d9375069`.
- First parent: `28dd8fff2e7ff00961174635715be8d18ecd8d42`.
- Second parent: `da041f5eaa5abe55ed5221f2642d3f0b047e5315`.

The worktree was clean and matched the authorized baseline. The exact package merged without conflicts.
The merge tree matches the approved package tree. New validation tooling is separate from that merge.
The merge was recorded while post-merge browser checks continued. No history was rewritten.

The review range for added work starts after `4e7d4fd51d39eadc060fccbae77c1748d9375069` and ends at the final delivery commit.
The last code candidate is `845960e5d9800cf6174b15595059765857467429`.
This closeout adds documentation only. Its commit is the final integration commit reported with the handoff.
The user requested shutdown before the remaining interactive checks.

## Entry points

- [Built local validation](../local-validation.md): start/resume/stop commands, clock model, substitutions, and UI scenario matrix.
- [Preprod preparation](../preprod-validation.md): intended host, mainnet boundaries, bounded publication check, and missing deployment inputs.

The broader interactive walkthrough remains outstanding. No deployment or live publication check is authorized by these documents.
No push, tag, master reconciliation, mainnet transaction, authenticated Pinata request, or producer source change occurred.

## Completed checks

The isolated merge checks use `/private/tmp/dao-integration-20260924/source` and a separate fork-check source directory.
Only tracked source and explicit dummy configuration enter these checkouts. Historical acceptance directories remain untouched.
The type generation matches the retained declaration file. Checks used explicit dummy configuration and an isolated home directory.

| Check | Result and source scope |
|---|---|
| Typecheck and lint | Passed on the merged package and repeated for the new tooling |
| Generated artifacts, dependency policy, documentation links, production environment validation | Passed on the merged package |
| Merged unit suite | 157 files, 1,478 tests passed |
| Unit suite with initial tooling fixes | 158 files, 1,483 tests passed; source scope recorded below |
| Browser smoke | 44 passed, one configuration-specific skip |
| Full browser suite | 37 passed |
| DAO-enabled production routes | Three passed, one configuration-specific skip; separate unconfigured-publication check passed |
| DAO-disabled production route | One passed; disabled route made no upstream request |
| Worker build and size | Passed; compressed upload 3,378.62 KiB against a 9,216 KiB repository budget |
| Fork lifecycle suite | Six passed in the full run; executable lifecycle passed on a later focused run |
| Focused tooling suite | Seven files, 40 tests passed; the final added localhost-confinement test was not included |
| Latest optimized local build and startup | Passed at `845960e5d9800cf6174b15595059765857467429` |
| Released producer acquisition and retained-history resume | Passed with an empty feed; proposal interoperability remains outstanding |

The full tooling unit run used code through `40fb35096e38959c171cb9d0806a977599ef1891`.
Later tooling changes received focused tests, typecheck, lint, and local startup checks.
The full release suites validate the approved merge, not every later tooling edit.

Raw check logs remain in `/private/tmp/dao-integration-20260924/checks/`.
`initial-results.json` records the first batch; `results.json` records successful browser, production-route, and Worker reruns.
`final-unit.log` and `new-tool-unit.log` retain the full and focused tooling results.
Fork evidence remains in the sibling `fork-check`, `fork-focused`, and `fork-warm` directories.

## Failures and reruns

The first browser attempts could not locate Chromium under the isolated home directory.
The rerun selects the installed browser cache explicitly. A concurrent fork attempt also collided with the first source's Next development lock.
The fork rerun uses a separate source directory. Its executable scenario hit a cold vote deadline.
A later focused attempt hit a cold creation deadline. The unchanged executable scenario then passed on a warmed fork.
It covered offline publication recovery, wallet rejection, reload recovery, voting, and marker execution.
All seven fork cases passed across runs. There was no single clean seven-case run; cold-RPC timing remains a limitation.
Assertions and test deadlines were not relaxed.
An initial production build lacked an explicit dummy RPC URL and correctly failed the configuration guard.
Subsequent production builds use a generated public-only dummy configuration file in the isolated checkout.

Typecheck initially rejected a required optional checkpoint argument; its declaration is corrected.
Early session attempts exposed unsupported clock-offset syntax, a frozen producer clock, and restored Anvil timestamp ordering.
The launcher now uses an advancing process clock, mines monotonic resume blocks, and retains canonical producer history.
Cold acquisition exceeded its unchanged budget until supported 10,000-block log queries reduced scan overhead.
The released producer binary and application freshness protections remain unchanged.

The built-app smoke downloaded canonical content but publication failed the origin guard at `http://127.0.0.1:3310`.
Next normalizes the request origin to localhost. The final tooling commit uses `http://localhost:3310` and confines its wallet there.
The corrected candidate built and started successfully. The publication smoke was not rerun before the requested shutdown.
No proposal was created by that built-app smoke. Its failure log and screenshots remain in the retained session.

## Retained session and shutdown

- Directory: `/private/tmp/dao-ui-validation-20260924-v3`.
- Source: `845960e5d9800cf6174b15595059765857467429`, exported as `source-845960e5d9800cf6174b15595059765857467429`.
- Configuration: optimized Next build, production Node mode, explicit development runtime, real DAO clients, local D1, offline publication.
- Producer SHA-256: `61c51b8528cb249b8290b0bc1fe9acc9f9514be7a5991d8af22fd61fedc8ff5c`.
- Latest actual producer snapshot: zero proposals, block `26045974`, observed at `1790236471`.
- Snapshot SHA-256: `99b4d55012e0fd3beecad6d537097f3f56fba96ea1c7efcca5118e4055c0ac17`.
- Retained offline container: `dao-validation-60837dcb6cf0`, stopped.

The session manifest records the fork identity, dependency hash, producer hash, clock-library hash, and prior source exports.
The build manifest records its explicit public configuration and fingerprint.
Fork state, content blocks, local D1, producer history, logs, and downloaded documents remain available.
Temporary directories are subject to operating-system cleanup; preserve them for longer retention.

Anvil, application, and browser ownership records report stopped. No Docker containers remain running.
Ports `3310`, `18545`, `18546`, `15001`, and `18080` have no listeners. Nothing was intentionally left running.

## Outstanding validation and next session

1. Run the final localhost wallet-confinement unit test, which was added after the last focused test run.
2. Rerun the built-app smoke after the origin fix. Verify UI publication, proposal receipt, released-producer acquisition, and rendered proposal together.
3. Retain its exact document bytes, content digest, proposal identity, events, and script bytes. The current empty snapshot does not prove these.
4. Verify phase changes and snapshot/browser clocks with real proposals. Check stop/resume with populated producer and publication state.
5. Complete the broader visible desktop/mobile walkthrough using the [scenario matrix](../local-validation.md#scenario-matrix).
6. Address cold-RPC reliability if it recurs. Existing fork reruns do not prove consistent cold-start performance.
7. After separately authorized deployment, run the bounded Worker publication check in the [preprod checklist](../preprod-validation.md).

Resume the retained session with these fish-compatible commands. Do not initialize it again.

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.integration
set session /private/tmp/dao-ui-validation-20260924-v3
npm run dao:validate -- start "$session"
node scripts/dao-validation-smoke.mjs "$session"
npm run dao:validate -- browser "$session"
npm run dao:validate -- status "$session"
# After relevant UI transactions, acquire actual producer output.
npm run dao:validate -- refresh "$session"
# When finished, stop all owned services and retain state.
npm run dao:validate -- stop "$session"
```

Run the smoke before the broader walkthrough. Inspect a failed run before retrying; it can leave a proposal or spent publication allowance.
The local runbook supplies new-session setup and scenario controls. The preprod checklist identifies each missing deployment input.

## Integration and release boundary

At code candidate `845960e5d9800cf6174b15595059765857467429`, integration/master divergence is `187/18`.
This documentation closeout adds one integration-only commit. Master remains `06d9ec46458675e36d72b2165ff80189914efb03`.
Release reconciliation and selection of a deployment SHA remain separate work before preprod deployment.
The local development-runtime build must not be deployed as the production Worker build.
