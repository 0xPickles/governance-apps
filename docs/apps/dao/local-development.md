# DAO local development and regression checks

For the next UI walkthrough, use [built local validation](local-validation.md) from `agent/integration`.
The commands below remain useful for focused regression checks.

Use [live services](live-services.md) for trust boundaries and [publication operations](pinata-publication.md) for production recovery.
The [fork runbook](local-fork-uat.md) covers deployed contracts on a disposable node and an offline content substitute.
Completed acceptance procedures are historical. Do not reuse their state as disposable test data.

## Isolate each test environment

Run from a checkout with no private `.env*` or `.dev.vars*` files.
Use explicit dummy configuration and unused local ports.
Keep the operator's browser, forks, databases, and request ledgers separate.
An independent fork source avoids making a retained operator node a test dependency.
The fork harness uses `DAO_FORK_RPC`, `DAO_FORK_DIR`, `DAO_LOCAL_SERVICES_PORT`, and `DAO_LOCAL_IPFS_API_URL`.
Mock browser suites use `E2E_PORT` and `E2E_BASE_URL`.

```fish
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run test:e2e:full -- --workers=1
npm run generate:dao-feed -- --check
npm run validate:deps
node scripts/check-dao-doc-links.mjs
npm run test:e2e:dao-feed
npm run test:e2e:dao-feed -- --disabled
```

Run mock browser suites sequentially against their own development server.
The production feed checks use saved fixtures and local upstreams, with publication disabled or deliberately unconfigured.
They do not contact Pinata.
Use the [release checklist](release-checklist.md) for production and Worker builds.

## File-based local D1 initialization

Wrangler's synchronous worker inherits Node execution flags.
Do not initialize D1 through inline `node --input-type=module`.
The September 23 repair and the reusable initializer run as `.mjs` files.

For a new disposable local session, select a directory that does not yet exist:

```fish
set -gx DAO_LOCAL_SESSION (mktemp -d /tmp/dao-local-parent.XXXXXX)/session
node scripts/dao-publication-local-db.mjs fresh "$DAO_LOCAL_SESSION"
and set -gx DAO_PUBLICATION_LOCAL_STATE "$DAO_LOCAL_SESSION/d1"
```

Success prints the exact database path, zero documents and policies, zero helper requests, and `integrity: ok`.
The helper uses the installed Wrangler with local bindings, no environment files, and the existing migration.
It fails within 30 seconds if the worker cannot finish.
On failure, preserve the directory for inspection. It does not erase partial state or retry initialization.
No provider request occurs.

For an existing session:

```fish
node scripts/dao-publication-local-db.mjs resume "$DAO_LOCAL_SESSION"
```

Resume opens only the expected SQLite file in read-only mode and checks the existing ledger.
It neither starts Wrangler nor creates a missing database, ledger, or directory.
Missing state requires a consistent backup; a fresh database is not recovery.

The application gives the session's `d1` directory directly to `getPlatformProxy({persist:{path:...}})`.
The database is `d1/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite` relative to the session.
Wrangler CLI `--persist-to` uses a different layout. Do not substitute a `v3` path.

For a consistent local backup after stopping the session's App:

```fish
set db "$DAO_LOCAL_SESSION/d1/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite"
set backup "$DAO_LOCAL_SESSION/publication-backup.sqlite"
test ! -e "$backup"; or exit 1
sqlite3 -readonly "$db" ".backup '$backup'"
sqlite3 -readonly "$backup" 'PRAGMA quick_check;'
```

Keep the matching ledger, canonical documents, policy, and fork checkpoint with the backup.
The SQLite backup API includes committed WAL state; copying only the database file does not.

## Manual browser behavior

`scripts/dao-pinata-browser.mjs` uses the native window's viewport and retains exact downloads without overwriting changed bytes.
It binds the manual test wallet to the selected loopback RPC and fixed `http://127.0.0.1:3310` browser origin.
It never publishes or signs automatically.
Use only throwaway accounts on a disposable fork. Keep credential entry outside agent tools.
Live provider use requires separate authorization; it is unnecessary for these regression checks.
