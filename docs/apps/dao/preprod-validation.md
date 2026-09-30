# DAO preprod candidate checklist

Do not deploy or perform the publication smoke check as part of local integration.
The [UAT closeout](delivery/uat-closeout-20260930.md) identifies the candidate and completed checks.
The manual walkthrough and Pinata acceptance are complete. Neither is a pending deployment input.

Preprod remains connected to mainnet. A transaction signed there is a real mainnet transaction.
Routine preprod validation stops before sending any transaction. Wallet connection and unsigned review are sufficient.

## Candidate and host

- Obtain independent acceptance of the closeout candidate on the reconciled integration branch.
- Record the final deployed source SHA, lockfile hash, build command, public configuration, Worker version, and operator.
- Intended configuration: `wrangler.preprod.jsonc`, Worker `governance-apps-preprod`, DAO host `dao-beta.dao-ops.com`.
- Confirm protected-host routing, access protection, noindex headers, clean DAO paths, and disabled-host behavior.
- Confirm existing non-DAO beta routes remain functional.
- Build separately from the local validation build. Use `NODE_ENV=production` and `NEXT_PUBLIC_RUNTIME_MODE=production`.
- Use `npm run validate:prod-env`, `npm run worker:build`, and `npm run validate:worker-size` with reviewed deployment configuration.
- Record `NEXT_PUBLIC_ENABLE_DAO`, `DAO_PUBLICATION_ENABLED`, and all relevant domain flags independently.
- Disable mocks, E2E, debug/review controls, and simulation transport fallback. Set no local publication or forum origins.

## Mainnet configuration and publication

- Supply an independently approved mainnet deployment allowlist, RPC endpoints, and live `DAO_DATA_URL` identity.
- Verify canonical block reads, simulations, feed freshness, content bytes, and proposal routes through the deployed proxy.
- Replace the reserved preprod D1 ID with a separate preprod database. Never use the production ledger.
- Apply `migrations/dao-publication/0001_publications.sql` once. Verify schema, persisted policy, counters, and backup ownership.
- Provision `DAO_PINATA_JWT` as a private upload-only Worker secret. Never put it in public build values or repository files.
- Supply `DAO_IPFS_GATEWAY_URL`, reviewed `DAO_PUBLICATION_LIMITS`, content-retention policy, and pin ownership.
- Preserve spent allowance across restarts, key rotation, and rollback. Do not replace a used ledger with an empty database.
- Verify disabled publication, missing-binding failure, retained-content reads, redacted errors, and expected origin enforcement.

## Bounded deployed publication smoke

This is a separate operator action requiring its own approval, outside routine read-only preprod validation.
Authorize a maximum of one new canonical document through the deployed Worker's normal authoring flow.
Use one reviewed valid forum topic and an identified operator. Download and retain exact bytes before publication.
Stop before **Create onchain proposal**. No mainnet proposal transaction is required.

The bound is one document and one UI publication attempt. The route can use one upload and up to three gateway retrievals.
Record the D1 counter difference, digest, CID, exact gateway bytes, Worker version, and origin behavior.
If publication is pending or fails, stop and inspect accounting. Do not retry automatically or repeat provider acceptance.
Assign the retained pin and document to the agreed retention owner.

## Read-only validation and operations

- Inspect feed freshness, empty/unavailable handling, proposal rendering, content failures, desktop/mobile layouts, and navigation.
- Connect a mainnet wallet and inspect role/action eligibility. Stop before transaction submission.
- Assign owners for Worker logs, D1 accounting, publication failures, gateway failures, and producer freshness alerts.
- Record the previous working Worker version and rollback operator. Keep the same D1 database during code rollback.
- Recheck protected hosts and feed/publication flags after rollback.

## Exact missing inputs

1. Independent acceptance of the closeout review range and its exact deployment source SHA.
2. Reviewed mainnet allowlist, deployment identities, canonical/simulation-capable RPC URLs, and live producer endpoint/identity.
3. An actual preprod D1 ID distinct from production, migration operator, backup location, and restoration owner. The production D1 ID is a later production-release input.
4. Upload-only Pinata secret provisioned privately, gateway URL, aggregate limits, retention duration, and pin owner.
5. Approved feature-flag values and other required public build values, including the WalletConnect project ID and global data URL.
6. Confirmation of the intended beta host's access policy, release operator, monitoring owners, and rollback Worker version.
7. For the separate publication smoke only: named operator, reviewed forum topic/document, and approval for its one-document budget.

No address, ID, credential, or approval value is inferred from local test configuration.
Different public environment values require separate builds from the same accepted source revision.
