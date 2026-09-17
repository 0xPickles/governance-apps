# Pinata validation closure

Date: 2026-09-17.
Validation base: `8637ce829b640939fc46ae463fe844c9c1925c32` on `codex/dao/m5/pinata`.
The worktree was clean before validation.
The user approved the Pinata acknowledgement correction on this date.

## Scope and findings

This follow-up checks the six UI failures from the [correction evidence](../m5-pinata-review/README.md).
Five of those failures remained after the earlier partial rerun.
The complete affected files now pass all 50 tests without edits.
This includes reverted-receipt recovery, parser details, Signal publication, receipt identity, Teams route cleanup, and Teams debug state.

The earlier full run recorded two 30-second timeouts and four missing-element failures.
The machine's observed load average exceeded 170 during that run.
At the start of this follow-up, the observed load averages were 7.87, 7.79, and 8.13.
The successful rerun supports resource contention as a contributor, but does not establish the cause of every earlier failure.
No reproducible application defect appeared in the affected files.

Application code, test code, assertions, test configuration, dependencies, and publication design remain unchanged.
The new runs use existing timeout settings without a command-line timeout override.
They use no test-name filter, skip, retry, or assertion relaxation.
The first run selects both complete affected files. The subsequent run selects the complete repository suite.

## Commands and results

Toolchain: Node.js `v24.1.0`, npm `11.14.0`, Vitest `4.1.5`.
The repository lockfile is unchanged.

| Check | Result | Evidence |
| --- | --- | --- |
| Both affected component files | 50 tests passed in 2 files, exit 0, 50.04 seconds | [Affected files](checks/affected-files.log) |
| Complete repository suite | 1,397 tests passed in all 153 files, exit 0, 305.66 seconds | [Complete suite](checks/unit.log) |
| `npm run typecheck` | Passed, exit 0 | [Typecheck](checks/typecheck.log) |
| `npm run lint` | Passed, exit 0 | [Lint](checks/lint.log) |
| Historical evidence integrity | All 49 package and 9 correction checksums valid | [Historical checksums](checks/prior-evidence.log) |
| Documentation links | All relative links in changed documents resolve | [Links](checks/document-links.log) |
| Change scope | Only DAO documentation and evidence changed | [Scope](checks/scope.log) |

The affected-file command was:

```sh
npx vitest run tests/components/TeamsPageClient.test.tsx tests/components/DaoProposalAuthoringForm.test.tsx --maxWorkers=1 --reporter=verbose
```

The complete-suite command was:

```sh
npm run test -- --maxWorkers=2
```

The complete suite includes the real local D1 publication regressions and the authoring recovery checks.
Both runs passed without skipped tests or retries.
The six earlier failures are closed by these complete passing runs.

## Evidence and release boundaries

The [original package evidence](../m5-pinata/README.md) and correction evidence remain unchanged, including their failed runs.
The [SHA-256 manifest](artifact-sha256.txt) covers every closure evidence file except itself.
Retained logs normalize local paths, the machine name, and terminal formatting.
The historical browser, fork, and build results remain in those records.
This documentation-only closure does not repeat those suites or claim new results for them.

The approved correction still requires Pinata acknowledgement and exact gateway bytes before successful publication.
The [prepared operator session](../../../pinata-acceptance.md) and deployment configuration remain release work.
The selected gateway, reviewed D1 IDs, private operator setup, and rollout authorization remain external inputs.
This follow-up accessed no credentials and made no authenticated provider request, remote change, push, merge, or deployment.
