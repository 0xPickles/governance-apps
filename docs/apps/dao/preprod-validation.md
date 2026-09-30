# DAO preprod procedure

This is the canonical procedure for the protected mainnet beta and its later production rollout.
The September 30, 2026 shared-infrastructure decision supersedes earlier requirements for separate production and preprod databases.
Repository preparation does not authorize deployment, remote changes, publication, or transactions.

## Current state and evidence

| Stage | Status and evidence |
| --- | --- |
| Repository preparation | The candidate retains the shared D1 binding and policy, completes preprod workflow inputs, and records the reviewed deployment JSON. See the [preparation handoff](delivery/preprod-preparation-20260930.md) for local checks and review scope. |
| Remote setup | The operator reports completing setup steps 1–5, including database setup. This preparation has only local configuration evidence. Remote migration, bindings, secrets, and dashboard values were not independently verified. |
| Private operator actions | GitHub values, runtime configuration, secret installation, access protection, ownership, and release approval still need operator confirmation. |
| Preprod deployment | Pending independent review and operator authorization. Read-only checks precede a separately authorized publication check. |
| Production rollout | A later, separately authorized release. This preparation does not enable production DAO or change production routes. |

The [manual UAT closeout](delivery/uat-closeout-20260930.md) and [Pinata acceptance](publication-acceptance-20260923.md) remain completed evidence.
Do not repeat those campaigns or start their retained services for this preparation.

## Approved shared infrastructure

Preprod is a protected beta interface to the same mainnet governance deployment as production.
Both Workers use the existing producer at `https://data.dao-ops.com/prod/dao.json`.
Both use one Pinata account, public gateway, upload-only JWT, and D1 database.
Worker identities, hosts, and enablement switches remain separate. Install the same JWT privately in each Worker when authorized.

| D1 field | Approved value in both Wrangler files |
| --- | --- |
| Binding | `DAO_PUBLICATION_DB` |
| Database name | `dao-publication` |
| Database ID | `66d8bf6b-9b2c-41d2-afa1-19647ea9725e` |
| Migration directory | `migrations/dao-publication` |

Preprod publication writes affect live records, retained content, and combined capacity.
Both deployed versions must remain compatible with the shared schema.
Experimental migrations, local forks, acceptance tools, and automated tests require isolated databases and offline provider fixtures.
Never connect those tools to the shared remote database.

Mainnet proposals created through preprod are real proposals. The same producer makes them visible through production when its DAO interface is enabled.
Browser drafts remain origin-specific. A beta draft does not automatically appear on the production host.

## Reviewed mainnet deployment configuration

Copy the complete [mainnet deployment JSON](examples/mainnet-deployments.json) into `NEXT_PUBLIC_DAO_DEPLOYMENTS`.
This is the single copyable deployment configuration. It includes the proposal hook required for authoring.
Synthetic feed examples and fork identities are not deployment inputs.

Source: `/Users/hydra/Developer/yearn/styfi/deployment.json` on `master`, inspected at `69e262e7c285d42dd1734e7ce8975648d4400c6e`.
Prior independent read-only mainnet review confirmed Voting genesis, current Voter/Executor/hook addresses, hook genesis, and Voting registration.
Voting, Voter, and Executor code hashes matched the retained producer inventory. The deployment block hash also matched.
These are prior review results supplied for this preparation. This task did not repeat the mainnet checks.
Local parser validation establishes configuration syntax, not current onchain identity.

## Continue after the reported database setup

### 1. Configure GitHub preprod values

In the GitHub `preprod` environment, set `NEXT_PUBLIC_DAO_DEPLOYMENTS` from the linked JSON.
Set `NEXT_PUBLIC_ENABLE_DAO=true` for the approved beta build and `NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS=false`.
Record the selected values and the operator in the release record.

The workflow fixes these values in environment validation, Worker build, and deployment:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_RUNTIME_MODE` | `production` |
| `NEXT_PUBLIC_USE_MOCKS` | `false` |
| `NEXT_PUBLIC_E2E` | `false` |
| `NEXT_PUBLIC_ENABLE_DEBUG_UI` | `false` |
| `NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK` | `false` |

Supply the existing `NEXT_PUBLIC_WC_PROJECT_ID`, `NEXT_PUBLIC_GLOBAL_DATA_URL`, and comma-separated `NEXT_PUBLIC_RPC_URLS`.
Keep the approved flags and feed URLs for Teams, YBC, and yETH in the same environment.
Their enabled flags require `NEXT_PUBLIC_TEAMS_DATA_URL`, `NEXT_PUBLIC_YBC_DATA_URL`, and `NEXT_PUBLIC_YETH_GLOBAL_DATA_URL`, respectively.
Keep the existing deployment credentials private in GitHub secrets.

The RPC list must serve Ethereum mainnet, canonical block-hash reads, and exact-call simulation.
Check EIP-1898 support, recent head timestamps, archive availability where required, and browser/provider origin restrictions.
`NEXT_PUBLIC_*` values enter the browser bundle, even when supplied through GitHub secrets.
Use only RPC URLs approved for public client exposure. Never include a private credential in a public value.
The environment validator checks required values and runtime rules. It does not contact or approve the RPC services.

### 2. Configure the preprod Worker runtime

Target `governance-apps-preprod` with [wrangler.preprod.jsonc](../../../wrangler.preprod.jsonc).
Set `DAO_DATA_URL=https://data.dao-ops.com/prod/dao.json` and the approved `DAO_IPFS_GATEWAY_URL`.
The gateway must be a public HTTPS base ending in `/ipfs/`, without credentials, query, or fragment.
Set `DAO_PUBLICATION_ENABLED=false` before deployment and keep it false through the read-only checks.
Do not set local publication, forum, or acceptance origins in the Worker.

Check the reported binding and migration against the approved shared database before release.
Retain the operator's setup record. Do not create another database or repeat setup because an older handoff requests it.
Check the stored policy and counters without changing them. An unused database can have no policy row until its first admission.
If a stored policy differs, keep publication disabled and use the coordinated [policy maintenance procedure](pinata-publication.md#backup-inventory-and-recovery).

Both Wrangler files contain the same `DAO_PUBLICATION_LIMITS` string. These source-controlled overrides are the deployment policy.
The application defaults and isolated test policies remain unchanged. See [limit semantics](pinata-publication.md#global-application-limits).

The deployment script retains `--keep-vars` through OpenNext to Wrangler.
It preserves dashboard-only runtime variables, while explicit Wrangler variables replace same-name dashboard values.
Thus the source-controlled publication policy takes effect at deployment. Secrets remain private Worker bindings.
See [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth) and the installed deployment code.
GitHub public build values do not provision server-only dashboard variables. Check the effective runtime values after deployment.

### 3. Install the shared upload-only secret privately

Use the approved Pinata account and JWT with only `pinning.pinFileToIPFS` authority.
Use the interactive prompt for the preprod Worker:

```fish
npx wrangler secret put DAO_PINATA_JWT --config wrangler.preprod.jsonc
```

This is a remaining operator action, not a command run during repository preparation.
Never paste the JWT into chat, source, workflow variables, logs, or client configuration.
Do not reuse revoked acceptance keys or grant delete, metadata-write, admin, or key-generation authority.
The same approved JWT will serve production later. Publication remains disabled after installation.

### 4. Protect every beta entry point

Check Cloudflare Access for all six beta hosts, every path, and API routes before exposure.
The DAO flag applies throughout the shared preprod Worker, including `/dao` on other beta hosts.
Check `/api/dao-data`, `/api/dao-content`, `/api/dao-forum`, and any alternative Workers or version-preview URLs.
`preview_urls` remains enabled in the preprod configuration. Protect those URLs or disable their exposure through authorized release work.
Check both permitted and denied sessions. No alternative host can bypass the access policy.
`noindex`, a custom domain, and origin checks do not replace authentication.

### 5. Select the workflow branch and exact source

Obtain independent acceptance of the complete preparation candidate and record its exact commit SHA.
After authorized publication of the branch, open **Deploy Preprod** (`.github/workflows/deploy-preprod.yml`) in GitHub Actions.
Select `agent/integration` in **Use workflow from** so the workflow includes the corrected environment blocks.
Set the required `ref` input to the full accepted source SHA, rather than a moving branch name.
These selections are separate: the workflow branch selects workflow logic, and `ref` selects the checked-out application source.
Check that the selected workflow revision matches the reviewed workflow before dispatch.

The workflow runs environment validation, a fresh Worker build, the preprod size check, and deployment with the required public values.
Record workflow revision, checked-out SHA, lockfile hash, public configuration, operator, and resulting Worker version.
Keep the previous working Worker version and rollback owner in that record.
Different public values require a separate build from the accepted source.

### 6. Perform read-only deployed checks

Check access protection, noindex headers, clean DAO paths, disabled-host behavior, and existing non-DAO beta routes.
Check feed identity/freshness, disconnected reads, proposal content, unavailable responses, and navigation on desktop and mobile.
Connect a mainnet wallet and inspect eligibility and unsigned review. Stop before transaction submission.
Check canonical block reads and simulation through the configured RPC path without sending a transaction.

With publication disabled, check that POST stops before provider access and leaves accounting unchanged.
Check retained-content GET responses for existing verified content and redacted error responses.
If no verified records exist, record that limitation rather than creating content for this check.
Disabled POST returns before the origin check. Origin rejection and missing-binding failure remain covered by isolated tests.
Do not remove the live shared binding to repeat those tests.
Keep publication disabled until the separate publication check receives approval.

### 7. Perform one separately authorized publication check

Obtain approval for one new canonical document, one UI publication attempt, a named operator, and a reviewed valid forum topic.
Record the shared accounting baseline and retain the exact downloadable bytes before publication.
Enable publication only in the authorized Worker for this bounded check.
Check missing/foreign-origin rejection with empty invalid content before the publication attempt. These rejected requests must leave accounting unchanged.
Publish through the normal authoring flow, then stop before **Create onchain proposal**.
No mainnet proposal transaction is part of this check.

The route can use one upload and up to three gateway retrievals for this attempt.
Record the counter difference, digest, CID, exact gateway bytes, Worker version, and origin behavior.
If other authorized traffic occurs, reconcile its records before attributing the combined counter difference.
If publication fails or remains pending, stop and inspect accounting. Do not retry automatically or repeat provider acceptance.
Assign the document and pin to the retention owner. Restore disabled publication unless approval explicitly permits continued operation.

### 8. Maintain shared records and prepare later production rollout

Assign owners for backups, restoration, retained content, pins, Worker logs, accounting, gateway failures, and producer freshness.
Use [publication operations](pinata-publication.md#backup-inventory-and-recovery) for complete backups, policy changes, and recovery.
Before coordinated policy or schema maintenance, disable publication in both Workers and allow active reservations to expire.
A quota incident can stop publication through both sites. Key rotation and code rollback do not reset allowances.
Never remove records, reset counters, or attach an empty database to recover capacity.

Keep both deployed versions compatible with the shared schema. Run experimental migrations only against isolated databases.
A rollback must preserve records, retained bytes, policy, and accounting.
Before re-enabling publication, reconcile any restored backup with later attempted work.
Content referenced by real proposals remains retained regardless of its originating site.
Record the retention duration and backup location privately. Public IPFS copies can outlive a provider pin.

For later production rollout, obtain separate approval for production workflow wiring, flags, routes, and the exact release SHA.
Use the same mainnet JSON, producer, D1 database, publication policy, public gateway, and upload-only JWT.
Install the JWT privately in `governance-apps` with `wrangler.jsonc` when authorized.
Keep production publication disabled until its release checks pass. Do not repeat database creation or reset the shared policy.

## Remaining operator inputs

- Independent candidate acceptance, workflow revision, source SHA, release operator, and deployment authorization.
- GitHub preprod values, public-client mainnet RPC URLs, and existing application configuration.
- Public gateway URL and private installation of the approved shared JWT.
- Confirmation of reported remote setup, stored policy/counters, effective runtime values, and access protection on every entry point.
- Backup location, restoration/retention/monitoring owners, retention duration, and previous Worker version.
- Separate approval, operator, forum topic, document, and budget for the single publication check.

No missing value is inferred from a local fixture, retained acceptance state, or an earlier workflow run.
