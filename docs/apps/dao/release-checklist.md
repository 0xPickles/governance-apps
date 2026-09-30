# DAO release and integration checklist

Publication acceptance is [complete](publication-acceptance-20260923.md).
The approved package is integrated. DAO integration through `9bee14b9037396899d8f1d3d3b604eabeeba7427` passed independent review.
The [UAT closeout](delivery/uat-closeout-20260930.md) retains completed walkthrough evidence and finding dispositions.
Use the [preparation handoff](delivery/preprod-preparation-20260930.md) for the current candidate and local validation.
The manual walkthrough and Pinata acceptance are complete. Independent review and authorized preprod deployment preparation are the next gates.
This checklist does not authorize a merge, deployment, remote change, or production transaction.

## Remaining release inputs

Follow the [canonical preprod procedure](preprod-validation.md) for the exact remaining inputs and their order.
The reviewed mainnet JSON and producer identity are recorded there. Public-client RPC URLs and existing application configuration remain operator inputs.
The operator reports database setup complete. Local preparation did not independently verify remote configuration or migration.
Private shared-JWT installation, the public gateway, access protection, backup/retention owners, monitoring, and rollback remain operator release checks.
Production rollout requires separate authorization and workflow/route review.

The retained acceptance configuration and throwaway wallets are not production inputs.
Both Wrangler files now identify the approved shared database and identical publication policy.
The September 30, 2026 decision supersedes separate-database and placeholder-ID requirements in historical handoffs.
Keep `NEXT_PUBLIC_ENABLE_DAO` and `DAO_PUBLICATION_ENABLED` independently gated.
Use [publication operations](pinata-publication.md) for shared policy semantics, key replacement, backup, budget recovery, and rollback.
Do not repeat the completed A/C/B experiment as a normal production procedure.

## Completed integration procedure (historical)

The package includes M5 live at `fc81ae0502efe45ed84367062a57df16c6dab46c` and all reviewed publication/recovery commits.
Do not cherry-pick the closeout onto the older integration baseline.
On September 24, integration was `28dd8fff2e7ff00961174635715be8d18ecd8d42`; master was `06d9ec46458675e36d72b2165ff80189914efb03`.
Their 141/18 divergence requires separate release reconciliation. This package does not resolve it.

Run these proposed commands only after approval. Compare `candidate` with the exact final SHA in the approval record.
Require clean status and the expected integration branch before merging.

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.integration
git status --short
test (git status --porcelain | count) -eq 0; or exit 1
test (git branch --show-current) = agent/integration; or exit 1
set candidate (git rev-parse codex/dao/m5/pinata)
git show --no-patch --format=fuller "$candidate"
git merge-base --is-ancestor fc81ae0502efe45ed84367062a57df16c6dab46c "$candidate"; or exit 1
git diff --check agent/integration..."$candidate"
or exit 1
git merge --no-ff --no-commit "$candidate"
```

Resolve any conflicts through review. Preserve both sides' requirements; do not silently reconcile master or server automation.
With the merge still uncommitted, run the checks below in an isolated checkout of the merged files.
Supply only dummy local settings there. Do not copy private environment files or retained acceptance state.

```fish
npm run typecheck
npm run lint
npm run test -- --maxWorkers=2
npm run test:e2e
npm run test:e2e:full -- --workers=1
npm run generate:dao-feed -- --check
npm run validate:deps
env NODE_ENV=production NEXT_PUBLIC_RUNTIME_MODE=production \
  NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_E2E=false \
  NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK=false \
  NEXT_PUBLIC_ENABLE_YETH=false NEXT_PUBLIC_ENABLE_YBC=false NEXT_PUBLIC_ENABLE_TEAMS=false \
  NEXT_PUBLIC_WC_PROJECT_ID=offline-validation \
  NEXT_PUBLIC_GLOBAL_DATA_URL=http://127.0.0.1:18546/global.json \
  NEXT_PUBLIC_RPC_URLS=http://127.0.0.1:18551 npm run validate:prod-env
node scripts/check-dao-doc-links.mjs
npm run cf-typegen
git diff --exit-code -- cloudflare-env.d.ts
npm run test:e2e:dao-feed
npm run test:e2e:dao-feed -- --disabled
npm run worker:build
npm run validate:worker-size
```

The two production feed commands each build the production app and check actual routes against local fixture upstreams.
The dummy environment check validates configuration rules only; it does not approve production inputs or contact those URLs.
Also run the [local fork suite](local-fork-uat.md) on a new disposable fork and content store.
It must cover ordinary advancement, canonical replacement, exact-call execution, publication recovery, and receipt/index recovery.
Check changed Markdown links and `git diff --check` after any conflict resolution.
Generate Cloudflare types before the builds in the isolated checkout and compare them with the retained file; investigate differences before committing.
No validation step requires a live Pinata request.

After all required checks and conflict review pass:

```fish
git diff --check
git status --short
git commit -m "merge(dao): integrate reviewed publication acceptance closeout"
git log -1 --format='%H %P %s'
git status --short
```

The merge must have two parents. Record its SHA and post-merge results in the delivery ledger.
Do not push, tag, deploy, or enable flags without the corresponding authorization.

## Before enabling an approved environment

Verify the exact deployment identities independently of the producer feed.
Check that the RPC supports canonical block-hash reads and simulation; a stale or replaced observation must fail closed.
Confirm the migration and stored limits match every replica. Preserve all counters during releases and recovery.
Check disabled publication, retained-content reads, missing-binding behavior, protected-host routing, and public error redaction.
Review the backup and rollback plan. A code rollback keeps the same D1 database and spent allowances.
Operator-specific secrets and retention decisions stay outside this repository.
