# Small Pinata release acceptance

> Current status: the original A/C/B run is interrupted and incomplete. Its database and ledger are missing.
> Preserve its historical observations. Use the [revised recovery checklist](pinata-recovery.md) for a separately authorized, bounded follow-up.
> The original procedure below remains a reference. Its prior preparation status is historical.
> The helper now requires an existing database and ledger; initialization is an explicit new-session operation.

This procedure is prepared, not executed. It requires separate explicit live-session authorization.
The implementation task made no authenticated provider requests and inspected no private keys.
The prior spike is closed. Its revoked keys must not be reused.
The authorized 2026-09-17 session has a [prepared operator checklist](pinata-acceptance-session.md) with concrete local paths and manual wallet instructions.

## Bounds and setup

Use the actual app on loopback, a disposable fork, and three disposable documents: A, C, and B.
A proves the application and producer path. C is the deletion canary. B proves revocation and key replacement.
The isolated D1 policy allows three documents, 393,216 canonical bytes, and four upload attempts.
It allows twelve gateway attempts and two concurrent jobs.
The helper has a persistent eight-request ceiling, including local app checks.
These allowances permit at most 24 provider requests, counting local helper checks conservatively.
Reserve one additional public retrieval for one producer checkpoint. The complete session ceiling is 25 provider requests.
Attempted upload bytes cannot exceed 524,288. Failed attempts are counted.

The helper never resets its ledger. App restarts use the same D1 directory.
If prior experiment infrastructure is reused, preserve and extend its aggregate ledger too.
Do not rename the session directory, remove counters, or start a new ledger to retry exhausted allowances.

1. Complete independent review and obtain live-session authorization.
2. Start the [disposable fork](local-fork-uat.md) and prepare its scenario state. Live Pinata needs no offline Kubo container or automatic lifecycle test.
3. Privately create upload-only key K1, with only `pinning.pinFileToIPFS`.
4. Keep temporary cleanup authority outside the application.
5. Select a private session directory and a public HTTPS gateway.

In Pinata's API Keys page, create a named custom key with Admin disabled.
Select only the legacy IPFS permission `pinning.pinFileToIPFS` for K1 and K2.
Leave V3 resources, metadata, deletion, listing, and key-generation permissions disabled.
Save each JWT privately when Pinata shows it.
Use the key's Revoke action for the revocation step.
See Pinata's [key creation guide](https://knowledge.pinata.cloud/en/articles/6191471-how-to-create-an-pinata-api-key)
and [permission schema](https://docs.pinata.cloud/api-reference/endpoint/ipfs/generate-pinata-api-key).
Cleanup authority needs only legacy `pinning.unpin`. It stays outside the app.

From the repository root, use a private operator terminal:

```fish
set -gx DAO_IPFS_GATEWAY_URL https://YOUR-PUBLIC-GATEWAY/ipfs/
node scripts/dao-pinata-acceptance.mjs launch /absolute/private/pinata-acceptance
```

The helper asks for an explicit answer and hidden JWT input.
Enter K1 privately. The child app receives it only through its environment.
Do not paste keys into chat, command arguments, URLs, screenshots, or retained output.
The launcher uses an isolated local D1 directory and the bounded acceptance policy.
It keeps forum responses as local fixtures and every transaction RPC on the fork.
The local provider seam is disabled for this session.

Production deployment uses the Worker secret facility described in [operations](pinata-publication.md).
This loopback acceptance does not deploy or approve any public host.
No cleanup or admin key enters the running app.

## Actual app publication and deletion scope

1. Use the editor, template, preview, and discussion validation to prepare A.
2. Download A's exact reviewed canonical document.
3. Publish A through the app.
4. Record its CID, digest, successful status, and local time.
5. Verify retained application bytes from another private terminal:

```fish
node scripts/dao-pinata-acceptance.mjs verify-app /absolute/private/pinata-acceptance /absolute/A.json
```

6. Repeat publication and download for distinct disposable canary C.
7. Verify C through the same helper.
8. Attempt one deletion of C with K1:

```fish
node scripts/dao-pinata-acceptance.mjs scope-delete /absolute/private/pinata-acceptance /absolute/C.json
```

The required result is HTTP 403. A timeout, missing object, or generic failure does not prove scope enforcement.
The helper prints only CID, action, status, result, and request count.

9. Repeat deletion of the same C with separately authorized cleanup authority:

```fish
node scripts/dao-pinata-acceptance.mjs control-delete /absolute/private/pinata-acceptance /absolute/C.json
```

The required control result is HTTP 200. Both results are necessary to conclude that deletion scope was enforced.
If the control fails, stop and record the scope result as inconclusive.
The helper rejects a control without the preceding 403 for the same CID.
C remains counted in D1 after deletion.
Use separate browser tabs for A, C, and B. Keep A's published review open for its later transaction.
Each tab retains its own publication recovery state.

## Revocation and replacement

1. Privately revoke K1 at Pinata after A and C uploaded successfully.
2. Record the revocation action and time without key material.
3. Keep the original app process running with K1.
4. Prepare distinct B, download its reviewed bytes, and attempt publication once.
5. Record the sanitized failure and prove that creation remains unavailable.
   Check that B has `upload_accepted = 0` and `published_at IS NULL` in the session's local D1 ledger.
6. Keep B unchanged.
7. Verify that A remains publicly retrievable:

```fish
node scripts/dao-pinata-acceptance.mjs retrieve /absolute/private/pinata-acceptance /absolute/A.json
```

8. Stop the local app.
9. Privately create replacement upload-only key K2.
10. Restart the same launcher with the same session directory and K2.
11. After the 60-second cooldown, retry B without editing its bytes.
12. Verify B through `verify-app`.

B must retain its original digest and CID. App admission must show the failed and replacement attempts.
After replacement, B must have `upload_accepted = 1`, a non-null `published_at`, and two counted upload attempts.
Gateway availability alone must never complete B's rejected upload.
Inspect the session ledger from the repository root in the private operator terminal:

```fish
source /private/tmp/dao-pinata-acceptance-20260917/session.fish
sqlite3 -readonly -json "$DAO_ACCEPTANCE_DB" 'SELECT digest,cid,published_at,upload_accepted,upload_attempts,retrieval_attempts FROM dao_publications'
```

For the prepared session, use the verified database path in `session.fish` for every inspection and SQLite backup.
The app passes `persist.path` directly to `getPlatformProxy`. Wrangler CLI `--persist-to` adds a different `v3` directory.
Preserve both databases. The [operator checklist](pinata-acceptance-session.md) identifies the active file and exact backup command.

The session uses two successful initial uploads, one rejected upload, and one replacement upload.
If a timeout or another attempt exhausts the four-attempt bound, stop and report incomplete acceptance.
Do not infer provider use counts from the app ledger.
Dashboard USED counts and explicit pin badges can remain unknown.

## Fork and producer checkpoint

Use A for local proposal creation, receipt confirmation, and released-producer acquisition.
The existing browser lifecycle can use the live launcher as a prestarted server.
For this bounded session, manual A publication must not be followed by an unrelated automatic publication.

1. Create A's proposal through the app with a throwaway fork wallet.
2. Record its successful receipt and actual proposal ID.
3. Keep the saved feed unchanged long enough to verify pending-index recovery.
4. Run the unchanged released producer against the local fork with the configured live gateway.
5. Serve its output through the real app route.
6. Compare producer `contentBytes` with A's downloaded bytes.
7. Record the rendered proposal identity and content.

The [local UAT runbook](local-fork-uat.md) supplies commands and temporary producer configuration.
For the producer, set `DAO_CONTENT_GATEWAY` to the live public gateway.
Set `limits.contentRequests=1` and `limits.retries=0`. Run one producer cycle for the single A proposal.
No producer source change, permanent producer, public contract write, or public forum post is part of this session.

Label each result: live provider, local contract, released producer on local contract state, or local forum/feed fixture.
A saved fixture alone is not producer indexing evidence.
The app's retained GET proves local recovery. The separate gateway check proves current provider retrieval.

## Evidence and cleanup

The helper writes `acceptance-ledger.json` before each request.
Empty or invalid confirmations cause another prompt.
A negative confirmation for an individual request requires a skip reason and leaves that check unproven.
Declining launch stops before key input or application startup and reports that no publication evidence was recorded.
If a process stops with `acceptance.lock`, first make sure that no helper remains active.
Remove only the stale lock. Preserve the ledger and uncertain request reservation.

Record app D1 counters, three identities, statuses, byte comparisons, receipts, producer identity, and browser results.
Export D1 before removing disposable infrastructure.
Store sanitized evidence separately from the private key setup.

After evidence capture, remove A and B with cleanup authority:

```fish
node scripts/dao-pinata-acceptance.mjs cleanup /absolute/private/pinata-acceptance /absolute/A.json
node scripts/dao-pinata-acceptance.mjs cleanup /absolute/private/pinata-acceptance /absolute/B.json
```

C was removed by the successful control. If that control failed, C still needs separately recorded cleanup.
Privately revoke K2 and any disposable cleanup key.
Stop the app and fork. Preserve all ledgers and evidence.
Do not claim successful acceptance if a required check was skipped, inconclusive, or exhausted its bound.

## Deployment configuration handoff

After correction review, use this same bounded session; no new provider experiment is required.
Supply the selected public HTTPS gateway and reviewed production/preproduction D1 IDs before replacing the reserved configuration values.
Keep the existing feature flags disabled during configuration and migration.
Enter the upload-only JWT through the private secret prompt in [operations](pinata-publication.md).
Do not send credentials to the implementation task.
Record the session results before requesting rollout approval.
