# DAO publication operations

Publication is implemented and disabled by default. Publication acceptance completed on 23 September 2026.
See the [accepted result](publication-acceptance-20260923.md) and [release checklist](release-checklist.md).
Independent approval of the closeout corrections and production configuration remain release requirements.
Use the [canonical preprod procedure](preprod-validation.md) for the current candidate, reported remote setup, and ordered operator steps.
The September 30, 2026 decision replaces separate production/preprod databases with one shared mainnet publication database.
The author needs no provider account, upload key, document grant, or publication signature.
An eligible author publishes reviewed content, then separately authorizes the governance transaction.

## Reviewed-content recovery

The live form saves validated reviews in same-tab session storage before publication starts.
The record retains canonical content, timestamp, digest, CID, validated forum topic, and executor script.
An unpublished record stays unpublished after a failed request, reload, or App restart.
The author must confirm the retained review again. Recovery never starts publication or creates a transaction automatically.

Existing published records retain their publication identity and receipt recovery, including the legacy storage format.
Storage is scoped to wallet and deployment. Account or deployment changes select a separate record and remount the form.
Restored bytes, identity, forum topic, and script are validated. Transaction preparation still checks server publication, eligibility, network, and deployment.
A cached publication record cannot bypass the server's acknowledgement and exact-content checks.

If storage refuses a write, publication stops and the current review stays downloadable.
If storage is missing or corrupt, use **Restore exact content file** with the original JSON export.
Executable content also requires its original script, entered before import. The content schema does not contain that script.
Import checks exact canonical bytes, the connected author, the forum topic, and script validity.
It preserves the snapshot timestamp and creates an unpublished review, even when those bytes were previously published.
The normal server flow must establish publication status. Do not edit browser-storage JSON to manufacture acknowledgement.

For application transaction recovery, see [live services](live-services.md#transactions-and-recovery).
The completed B experiment is historical evidence, not a production recovery procedure.

## Configuration

| Configuration | Purpose |
| --- | --- |
| `DAO_PUBLICATION_ENABLED=true` | Enables new publication. Absent or false stops POST before upstream access. |
| `DAO_PINATA_JWT` | Private Worker secret. Scope: only `pinning.pinFileToIPFS`. |
| `DAO_IPFS_GATEWAY_URL` | Fixed HTTPS public gateway base ending in `/ipfs/`. No credentials, query, or fragment. |
| `DAO_PUBLICATION_DB` | D1 binding shared by production, preprod, and every replica of both Workers. |
| `DAO_PUBLICATION_LIMITS` | Strict JSON overrides. Both Wrangler files contain the approved deployment policy below. |
| `DAO_PUBLICATION_TEST_ORIGIN` | Loopback development seam. Production rejects it. |
| `DAO_PUBLICATION_LOCAL_STATE` | Optional isolated local D1 directory for disposable acceptance. |

The upload endpoint is fixed: `https://api.pinata.cloud/pinning/pinFileToIPFS`.
The browser cannot select an endpoint. Gateway requests never contain the upload credential.
The application retains no delete, metadata-write, admin, or key-generation authority.
Public variables and client bundles must never contain the JWT.

Both Wrangler files identify the approved `dao-publication` database, ID `66d8bf6b-9b2c-41d2-afa1-19647ea9725e`.
They bind `DAO_PUBLICATION_DB` with migration directory `migrations/dao-publication`.
The operator reports database setup complete. This task did not independently verify remote migration, bindings, secrets, or dashboard values.
Production and preprod share one Pinata account, gateway, upload-only JWT, and ledger. Worker hosts and enablement switches remain separate.
An absent binding, missing migration, invalid limits, or missing key makes publication fail closed.
The package adds no application dependency.

The publication POST requires an exact request origin in production.
In explicit development mode, Next.js normalizes loopback IP addresses to `localhost` in the request URL.
The route also accepts `127.0.0.1` or `[::1]` when the original `Host` matches and the scheme and port remain identical.
This exception requires both `NODE_ENV=development` and `NEXT_PUBLIC_RUNTIME_MODE=development`.
Forwarded headers do not authorize the exception. Missing, malformed, and foreign origins remain rejected.
Empty binary requests reach `400 invalid_content` only after origin validation; they make no publication reservation or provider request.

## Global application limits

| JSON field | Application default | Shared deployment policy | Accounting |
| --- | ---: | ---: | --- |
| `hourlyDocuments` | 2 | 10 | Newly admitted digests in the preceding hour |
| `dailyDocuments` | 10 | 30 | Newly admitted digests in the preceding 24 hours |
| `monthlyDocuments` | 40 | 100 | Newly admitted digests in the preceding 30 days |
| `documents` | 300 | 400 | Lifetime distinct admitted documents |
| `bytes` | 39,321,600 | 52,428,800 | Lifetime canonical bytes, including failed and abandoned documents |
| `concurrent` | 2 | 2 | Active publication reservations. Maximum configurable value: 2 |
| `uploadAttempts` | 500 | 1,200 | Lifetime reserved provider upload attempts |
| `documentUploadAttempts` | 3 | 3 | Upload attempts for one digest |
| `retrievalAttempts` | 1,800 | 2,400 | Lifetime gateway verification attempts |
| `documentRetrievalAttempts` | 6 | 6 | Gateway attempts for one digest |
| `documentReservations` | 6 | 6 | Lifetime publication jobs for one digest, including forum errors and crashes |

These numbers are application allowances, not Pinata plan facts or billing formulas.
The deployment policy applies across both Workers through their shared D1 ledger, not separately to each site.
The [complete default JSON example](examples/publication-limits.json) remains an application-default example, not the deployment policy.
The identical strings in [production](../../../wrangler.jsonc) and [preprod](../../../wrangler.preprod.jsonc) are the source-controlled deployment overrides.
Documents are distinct admitted content versions, including failed or abandoned admissions. Each changed digest consumes another document slot.
Rolling windows expire with time. Lifetime counters do not reset when a rolling window expires.
A busy period or quota incident can prevent publication through both sites.
These limits do not bound all inbound traffic, public gateway traffic, or direct use of a stolen JWT.
Operators can revise limits after usage review. Authors never request document approval.

D1 stores one record per digest: bytes, CID, admission time, success time, attempts, and lease state.
The first admission stores the complete limits in a singleton policy row.
A replica with different limits fails closed. Changing an environment variable alone cannot replace the stored policy.

Admission and reservation use one transaction on D1's primary.
Concurrent requests for a digest obtain one lease. Distinct digests compete against the same rows.
No process counter, eventual-consistency update, or IP identity enforces the global budget.
The implementation uses the documented [D1 transactional batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

A lease lasts 180 seconds. Upstream requests have 15-second transport and bounded-body deadlines.
Forum requests retain their existing 8-second deadlines.
An upstream attempt requires at least 35 seconds left on the lease.
Release or expiry frees concurrency, but never refunds documents, bytes, reservations, or attempts.
Lease tokens prevent a stale owner from completing or releasing a newer reservation.
The two-job ceiling bounds admitted application work. A provider can continue processing a timed-out request remotely.

An attempt is charged before network I/O, even if the process stops before sending.
An upload without a validated acknowledgement requires another upload of the same bytes within the existing attempt allowance.
This includes rejected requests, timeouts, and a crash before D1 records the acknowledgement.
A recorded, validated provider acknowledgement prevents automatic reupload.
A job performs at most one upload and three gateway requests.
A failed job has a 60-second cooldown. Durable per-document and global limits also bound manual retries.
Spent allowances survive restarts, errors, key replacement, and deployments.

## Exact content and recovery

The route bounds input to 131,072 bytes and checks canonical content, the submitted digest, and the expected raw CID.
Invalid input reaches neither the forum nor Pinata.
Admitted content passes the existing forum check before upload.
The server sends a file with `cidVersion: 1` and `wrapWithDirectory: false`.
It checks `IpfsHash` and `PinSize`, then compares every retrieved byte.
This follows the selected [Pinata legacy file API](https://docs.pinata.cloud/api-reference/endpoint/ipfs/pin-file-to-ipfs).
Publication requires both the validated upload acknowledgement and exact gateway bytes.
The D1 completion operation independently requires `upload_accepted = 1`.
An open gateway can retrieve content from other IPFS sources; retrieval alone does not establish acceptance by this Pinata account.
See Pinata's [restricted and open gateway distinction](https://docs.pinata.cloud/gateways/gateway-access-controls).

A verified digest returns `already_published` without another provider request.
`GET /api/dao-content?digest=...` serves only previously verified retained bytes.
Unknown or unpublished digests never trigger gateway retrieval.
Disabling POST leaves retained recovery reads and producer-embedded proposal reads available.
Public errors distinguish disabled, unavailable, budget reached, busy, invalid content/forum, and pending verification.
Provider response text and private configuration never enter the response.

Before reusing a ledger written by the pre-correction build, inspect rows with `published_at IS NOT NULL AND upload_accepted != 1`.
The corrected app rejects these rows for deduplication and retained-content recovery.
If any exist, keep publication disabled and preserve the complete ledger for operator reconciliation.
Do not invent an acknowledgement, delete rows, or reset spent counters.
No remote ledger was used during implementation. The completed local acceptance used its own preserved ledger.

The existing editor, template, preview, draft storage, and browser recovery remain.
Real proposer eligibility, simulation, transaction signatures, receipt identity, ID zero, replacement handling, cancellation, and indexing recovery remain.
Publication grants no onchain authority. Feed V2 and immutable proposal-content V1 are unchanged.

## Configure, replace, or disable

Use the [canonical preprod procedure](preprod-validation.md#continue-after-the-reported-database-setup) after the operator's reported database setup.
It covers GitHub values, Worker runtime configuration, private secret installation, access protection, exact workflow/source selection, and bounded checks.
Production later uses the same database, policy, gateway, and JWT through its separate Worker.
Normal operation needs no per-document approval or planned frequent key rotation.

To stop uploads, set `DAO_PUBLICATION_ENABLED=false` through the deployment configuration.
Keep the DAO read flag and D1 binding intact.
For a suspected key leak, stop publication in both Workers and revoke the shared key privately at Pinata.
Install the replacement upload-only JWT privately in both Workers, then complete a separately authorized bounded publication check.
Application limits do not constrain direct abuse of a stolen provider credential.

## Backup, inventory, and recovery

Before a release backup or policy change, stop publication in both Workers and allow 180 seconds for reservations to expire.
Export the complete database through the operator's Cloudflare account:

```fish
npx wrangler d1 export DAO_PUBLICATION_DB --remote --config wrangler.jsonc --output /absolute/private/dao-publication.sql
npx wrangler d1 execute DAO_PUBLICATION_DB --remote --config wrangler.jsonc --command "SELECT digest,cid,byte_length,admitted_at,published_at,upload_accepted,upload_attempts,retrieval_attempts,reservations FROM dao_publications" --json
```

The SQL export includes canonical BLOB bytes, unsuccessful rows, policy, and every spent counter.
Keep an encrypted backup and a sanitized CID inventory.
The public recovery route is not a complete backup because it excludes unpublished rows.
D1 supports [SQL import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

If verification exhausts its allowance, keep the row and investigate the configured gateway.
Export the bytes and verify their digest/CID before any operator recovery.
An operator can extend the stored and deployed limits together after accounting review.
Do not reset attempt counters or remove the row to make a retry work.
If a confirmed pin needs restoration, treat a manual reupload as a separately authorized, counted recovery operation.

For a limits change, update the singleton `limits_json` to the complete approved JSON while publication is disabled.
Use the field order in `DAO_PUBLICATION_DEFAULT_LIMITS`; the application compares its normalized serialization.
Update both source-controlled `DAO_PUBLICATION_LIMITS` strings and deploy matching values to both Workers before enabling publication.
Coordinate the stored-policy update with both deployments. A policy mismatch fails closed, including during a code rollback.
Preserve all publication rows. The local acceptance configuration is a separate example, not a production policy.

## Rollback and retention

A code rollback keeps the same D1 database and spent allowances.
Both deployed versions must remain compatible with the shared schema. Test experimental migrations only against isolated databases.
Rollback to the inherited grant implementation requires publication to remain disabled.
Old grant settings and Kubo production settings are obsolete and must not be restored.

A database restore can reopen spent capacity if the backup predates attempted uploads.
Keep publication disabled until the restored counters include all later known and uncertain attempts.
If accounting cannot be reconciled, do not enable publication from that backup.
Never attach an empty database as a rollback shortcut.

No automatic task deletes historical proposal pins or abandoned documents.
Content referenced by real proposals remains retained regardless of whether publication originated in preprod or production.
Pinata Free retention and ten-year availability are not guaranteed by the experiment.
Canonical backups and producer-embedded content provide additional recovery evidence.
Unpinning does not erase copies from public IPFS caches.
