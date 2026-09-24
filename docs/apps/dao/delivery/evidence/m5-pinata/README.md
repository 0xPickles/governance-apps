# Pinata publication implementation evidence

Implementation started from `e1bd671b87758c49311bb0d8c3e6d93fbeeca61c` on `codex/dao/m5/pinata`.
The prepared worktree was clean. This identity was recorded before application edits.

The inherited application dependency is M5 live at `fc81ae0502efe45ed84367062a57df16c6dab46c`.
Its review range starts at `28dd8fff2e7ff00961174635715be8d18ecd8d42`.
Integrate reviewed M5 live before this package, or preserve that history in a combined review.

The decision, live review, sanitized provider report, milestone plan, live services and M5 finding tracker were inspected.
The exploratory spike remains closed. No private credentials or authenticated provider requests are needed for local implementation.

## Implementation

The server uses the fixed legacy Pinata file endpoint, CIDv1, and no directory wrapping.
It checks canonical input, digest, raw CID, upload response, and exact public-gateway bytes.
The author uses the existing editor, preview, forum validation, and separate governance transaction.
Document grants and the publication-only signature are removed.

One D1 ledger stores canonical bytes, identities, admissions, attempts, leases, and verified results.
Atomic transactions enforce global admission across replicas. Failed and abandoned documents remain counted.
Attempts are reserved before requests. Lease expiry frees concurrency without refunding spent allowances.
Retries inspect uncertain uploads first. A confirmed upload is never automatically reuploaded.
Verified retained bytes remain readable with publication disabled or upload configuration removed.

[Operations](../../../pinata-publication.md) defines limits, recovery, backup, key replacement, and rollback.
[Operator acceptance](../../../pinata-acceptance.md) prepares the separate credential session.
No new application dependency, provider registry, CAPTCHA, or identity platform was added.

## Validation environment and results

Validation used Node 24.1.0, npm 11.14.0, and the unchanged lockfile installed with `npm ci`.
Local D1 tests used the installed Wrangler/workerd runtime and the actual SQL migration.
The tests replace the context lookup and provider responses, not the durable database implementation.
Browser suites ran serially in this worktree. No two Next builds or browser servers ran together.

| Check | Actual result | Evidence |
| --- | --- | --- |
| Typecheck and lint, final code | Both passed | [Typecheck](checks/typecheck-final.log), [lint](checks/lint-final.log) |
| Complete smoke suite, final code | 44 passed, one production-only check skipped in development | [Smoke run 2](checks/smoke-2.log) |
| Complete full suite, final code, one worker | 34 passed in 10.5 minutes | [Full run 2](checks/full-2.log) |
| Enabled compiled production routes | 3 passed, one gated check skipped; missing-key check separately passed | [Enabled production](checks/production-enabled-2.log) |
| Disabled compiled production routes | 1 passed; zero configured upstream requests | [Disabled production](checks/production-disabled.log) |
| Client isolation in both production configurations | 227 client artifacts scanned per build; no fake JWT, secret name, binding, or upload endpoint | [Enabled production](checks/production-enabled-2.log), [disabled production](checks/production-disabled.log) |
| Standalone production build and client isolation | Passed; 227 artifacts scanned | [Production build](checks/build.log) |
| OpenNext Worker build and client isolation | Passed; Worker artifact generated; 227 client artifacts scanned | [Worker build](checks/worker-build.log) |
| Worker size, local dry run | 3,244.01 KiB gzip; below the repository's 9,216 KiB budget | [Worker size](checks/worker-size.log) |
| Full unit suite, final application code | 153 files, 1,392 tests passed | [Unit run 4](checks/unit-4.log) |
| Local D1 migration | Applied successfully to local state only | [Migration](checks/local-migration.log) |
| Generated-feed integrity | Passed; no generated changes | [Feed integrity](checks/feed-integrity.log) |
| Dependency policy | Passed; manifest and lockfile unchanged | [Dependency policy](checks/dependency-policy.log) |
| Disposable fork browser suite | 7 passed | [Fork suite](checks/fork-browser-1.log) |
| Released producer acquisition | 1 proposal, 1 event; exact 382-byte content | [Producer](checks/producer-1.log), [byte comparison](checks/producer-byte-comparison.log) |
| Producer through real app route/browser | 1 passed, no wallet RPC or page errors | [Browser checkpoint](checks/producer-browser-1.log) |

## Failed attempts and corrections

- Initial typechecks found strict Worker response types and one incomplete hook-test call.
  Those errors were corrected. Retained logs include [typecheck 1](checks/typecheck-1.log),
  [typecheck 2](checks/typecheck-2.log), and [typecheck 4](checks/typecheck-4.log).
- A hook assertion compared typed arrays from different realms.
  It now compares their byte arrays. [The failing run](checks/focused-2.log) and
  [all 13 hook tests passing](checks/hook-3.log) are retained.
- [Unit run 3](checks/unit-3.log) had one stale copy assertion after author guidance changed.
  The assertion was updated; the complete [unit run 4](checks/unit-4.log) passed.
- [Smoke run 1](checks/smoke-1.log) had 42 passes, one expected skip, and two failures:
  the mobile stYFI Snapshot link and the yETH test-bridge wait.
  A development configuration reload also occurred during that run; causation was not established.
  No unrelated product change was made in response. The complete fresh rerun passed all 44 applicable tests.
- [Full run 1](checks/full-1.log) passed all 34 tests before the final copy and retained-read correction.
  It is retained as an earlier result, not substituted for the final complete suite.
- The first producer preparation command reset the local fork, then stopped because the command wrapper rejected fish `and` syntax.
  The corrected command created the proposal and ran the producer successfully.
  [Preparation output](checks/producer-preparation.log) retains both attempts.
- The [first production build](checks/production-enabled-1.log) stopped at the existing required-RPC configuration guard.
  Subsequent local builds explicitly use `NEXT_PUBLIC_RPC_URLS=http://127.0.0.1:18545`.
  The guard remains intact; no private RPC configuration was needed or inspected.
- The [final full-range whitespace check](checks/range-whitespace-1.log) found five lines emitted by Wrangler's type generator.
  Their trailing spaces were removed without changing declarations or runtime behavior.

Dependency installation and type generation initially encountered sandbox network/loopback restrictions.
Authorized local retries succeeded. No remote resource was created.
Logs are sanitized for terminal colors and local home/worktree paths.
The [SHA-256 manifest](artifact-sha256.txt) covers every retained evidence file except itself.
Production checks use a fake JWT sentinel and loopback RPC configuration.
They validate code and route gating, not operator-owned production RPC, wallet-service, or provider configuration.
Existing middleware deprecation, missing test WalletConnect ID, and standalone-start warnings remain in the logs.
The Worker bundler also reports dependency warnings about negative-zero comparison and an empty dynamic-import glob.
These warnings did not fail the build.

## Fork, publication, and producer evidence

The fork suite used the real application publication route, real local D1, and an offline Pinata-compatible seam.
The seam stores exact raw blocks in disposable Kubo 0.40.1.
All transaction RPC went to `http://127.0.0.1:18545`.
The fork read upstream was the public `https://ethereum.reth.rs/rpc` endpoint.
Forum and initial saved-feed responses were local fixtures.
This package made no live Pinata request or public forum post.

The browser first sent a malformed publication body to the real route.
The route rejected it, creation stayed unavailable, and the wallet recorded no transaction.
Retrying the unchanged review published successfully.
The same suite checked wallet rejection, reload recovery, receipt-confirmed ID zero, feed lag,
voting, execution marker 42, retraction, flagging, veto, vote replacement, zero contribution,
wrong-network rejection, and a real reverted execution receipt.

[Published content](published-content.json) has 382 bytes and SHA-256 digest
`71ef88a77e301d47957b438c72aa010773908caa1a85dfe88aadd863dcd57add`.
The [execution capture](screenshots/local-execution.png) deliberately retains the older feed snapshot.
It shows transaction confirmation awaiting indexing; the test separately asserts marker 42.
The [local D1 ledger](checks/local-ledger.log) records one admission, one upload attempt,
one retrieval attempt, verified content, and no active lease.

After a fork reset, the same UI-published bytes were proposed again for the producer checkpoint.
That local transaction was `0xd830a8ca032180d3f3d4dcaa107441d41cb32e41bd22eea8201139b1638475bd`.
This is a separate transaction from the browser lifecycle, with the same content identity.

The unchanged released producer checkout was clean at
`23c4c1e85c1422f4cb2636ae5526bae6b8e89bb6`.
Its release binary SHA-256 was
`61c51b8528cb249b8290b0bc1fe9acc9f9514be7a5991d8af22fd61fedc8ff5c`.
It ran once with [temporary local configuration](local-producer-config.json), a fresh state directory,
and the offline gateway at `http://127.0.0.1:18080/ipfs/`.
The cycle used 242 local RPC requests and one content allowance.

The [producer output](local-producer-feed.json) was served without modification by the local app.
The [actual app response](local-producer-app.json) contains the same exact canonical bytes.
The [browser capture](screenshots/local-producer-content.png) shows proposal zero and “Set the local marker to 42.”
It also correctly shows the old fork snapshot as stale and the fixture forum topic as unverified.
No production freshness, forum classification, or transaction safeguard was relaxed.
After evidence capture, this task's fork stopped and its disposable offline container and volume were removed.
The inherited content container was left unchanged. [Cleanup output](checks/cleanup.log) records the disposable container name.

## Reviewer checklist and integration notes

Implementation self-review checked the following. Independent review remains pending.

- Canonical bytes and raw CID are checked before provider access; malformed publication never enables creation.
- Real local D1 tests cover same/different digest races, global windows, cumulative bytes/documents,
  policy drift, finite attempts/reservations, restart persistence, and stale lease fencing.
- Disabled/missing configuration fails closed. Provider errors are sanitized and retries are finite.
- Upload credentials stay server-side. Gateway retrieval has no authorization header and rejects redirects.
- Draft, preview, recovery, receipt identity, ID zero, replacement, and cancellation behavior remain covered.
- Feed V2, proposal-content V1, ABIs, trusted deployments, and governance write/simulation code are unchanged.
- Documentation covers current behavior, key handling, backup/export, disablement, and rollback accounting.

Review the inherited M5 range
`28dd8fff2e7ff00961174635715be8d18ecd8d42..fc81ae0502efe45ed84367062a57df16c6dab46c`
before or together with this package.
The publication implementation range starts at `e1bd671b87758c49311bb0d8c3e6d93fbeeca61c`.
The validated code/test tip is `eed4059c80bc4f04dde42106777e7bd0a2988e92`.
Only evidence/documentation and generated-type whitespace cleanup follow that tip.
The handoff supplies the exact final review range.
Documentation setup between M5 live and that start is also part of the branch history.
Integrate reviewed M5 live first, then this package, or review a combined merge preserving that ancestry.
Master reconciliation is a separate task.

`agent/integration` remains `28dd8fff2e7ff00961174635715be8d18ecd8d42`.
The M5 live branch, master, spike evidence, and producer repository were not changed.
No push, merge, tag, deployment, public host exposure, or production blockchain write occurred.

## Remaining release inputs

1. Independent implementation review and acceptance of inherited M5 corrections.
2. Operator-owned production/preproduction D1 resources and real IDs replacing reserved placeholders.
   Apply the migration, establish backup/export, and review the single shared ledger and limits.
3. A fresh upload-only Pinata key stored as a Worker secret, plus a selected public HTTPS gateway.
4. Explicit authorization and execution of the [small operator session](../../../pinata-acceptance.md).
   It must prove exact app publication, deletion-scope rejection with an authorized control,
   revocation, retained retrieval, replacement-key recovery, and producer/application consumption.
5. Reviewed production deployments, host/flag configuration, retention/recovery ownership, and separate rollout authorization.

The operator session is prepared only. Its persistent app/helper limits permit at most four uploads,
524,288 attempted upload bytes, and 25 conservatively counted provider requests including the producer checkpoint.
No credential was requested, read, or recorded here. No authenticated provider request was made.
Dashboard counts, pin badges, live revocation behavior, and long-duration retention remain unproven by this package.
Application limits do not constrain direct use of a stolen credential.
