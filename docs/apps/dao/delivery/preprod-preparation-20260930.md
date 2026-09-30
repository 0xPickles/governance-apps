# DAO preprod preparation — September 30, 2026

Repository preparation is complete on `agent/integration`, for independent review.
The exact base is `6191716ed4781ccdfdec6590acb4aea71c355bc9`.
At entry, only `wrangler.jsonc` and `wrangler.preprod.jsonc` were modified. Their approved database and policy values are retained.

Configuration commits:

- `46c5e506d5be821780fd2564918feca174f5f4ec` — shared publication infrastructure and generated types.
- `f22c7c2bc437c66672d4b19651b205840948981e` — preprod workflow wiring, existing regression expectations, and public deployment JSON.

This handoff follows in a separate documentation commit. Both configuration commits used the configured signer successfully.

The final candidate is the commit that adds this handoff. Resolve its exact SHA and complete review range with:

```fish
set candidate (git log --diff-filter=A -1 --format=%H -- docs/apps/dao/delivery/preprod-preparation-20260930.md)
git log --reverse --format='%H %s' 6191716ed4781ccdfdec6590acb4aea71c355bc9.."$candidate"
git diff --stat 6191716ed4781ccdfdec6590acb4aea71c355bc9 "$candidate"
```

## Configuration and operating decision

- Both Workers bind the approved `dao-publication` database and use identical source-controlled publication limits.
- Wrangler-generated types now include the publication policy variable.
- Preprod environment validation, Worker build, and deployment receive the deployment JSON and explicit disabled simulation fallback.
- Existing workflow expectations cover those new values in all three steps. Production expectations remain unchanged.
- The [public mainnet JSON](../examples/mainnet-deployments.json) includes the reviewed proposal hook and passes the application parser.
- The [canonical procedure](../preprod-validation.md) distinguishes local preparation, reported remote setup, private operator inputs, deployed checks, and later production rollout.
- [Publication operations](../pinata-publication.md) explains combined accounting, policy maintenance, shared incidents, backup, retention, and rollback.
- Dated supersession notes preserve historical evidence while replacing obsolete database and key instructions.

The production workflow and production route values remain unchanged. Application defaults, database schema, local helpers, and publication fixtures remain unchanged.
No new service, dependency, configuration framework, or application behavior was introduced.
The existing deployment script passes `--keep-vars` through OpenNext to Wrangler.
Installed Wrangler code preserves dashboard-only variables and emits explicit configuration variables, including the publication policy.
The authorized deployment must still check effective remote values.

## Evidence boundaries

The operator reports completing setup steps 1–5, including database setup.
This task checked local configuration only. It did not independently verify remote migration, bindings, secrets, or dashboard values.
Mainnet identity checks described in the canonical procedure are prior review evidence, not checks repeated by this task.

Validation used a disposable source export with the installed locked dependencies, without private environment files.
Build inputs were explicit and non-secret: synthetic loopback RPC/feed URLs, a dummy WalletConnect ID, and a fake JWT sentinel.
The build enabled DAO and the other application flags only in that isolated process, with production runtime and publication disabled.
It used the supplied reviewed public deployment JSON. Synthetic service URLs are not approved deployment inputs.

Local helpers explicitly disable remote bindings and use isolated persistence. Tests use the reserved local D1 fixture and offline provider responses.
No shared remote database was connected during validation. No JWT or other private credential was read or introduced.
Retained UAT services and state were not opened, started, or changed.

## Validation

| Check | Result |
| --- | --- |
| Wrangler JSONC and installed configuration schema | Both files passed |
| Shared binding and policy | Exact approved binding, identical strings, and identical normalized values through the existing limits parser |
| Application defaults | Unchanged, including the default-policy JSON example |
| Mainnet JSON | Passed the existing deployment parser, including the proposal hook |
| Workflow configuration | Required values present in validation, build, and deployment. Production workflow and routes unchanged |
| Generated Cloudflare types | Regenerated with the installed Wrangler, included in the candidate |
| Typecheck and lint | Passed |
| Focused publication policy/store and local D1 initialization | 59 tests passed, including independent stores, duplicate content, shared accounting, policy mismatch, and restart recovery |
| Complete unit suite | 171 files, 1,724 tests passed |
| Production environment validation | Passed with explicit synthetic inputs |
| Fresh Worker build | Passed, including a fresh Next build |
| Preprod and production size checks | Both passed: 3,372.68 KiB gzip against the 9,216 KiB repository budget |
| Client publication isolation | Passed for 227 artifacts, including absence of the fake JWT sentinel and server publication identifiers |
| Documentation and whitespace | 521 local targets, 135 links in changed Markdown, eight local anchors, and `git diff --check` passed |

The [validation index](evidence/preprod-preparation-20260930/validation.json) records commands, results, log paths, and hashes.
Raw checks and disposable source remain at `/private/tmp/dao-preprod-preparation-20260930-TfFeLA`.
The directory includes the synthetic inputs and temporary configuration-check script for review.

Retained failures and their disposition:

- The first build failed with `listen EPERM` on loopback. Local D1 initialization also failed under sandbox restrictions.
  The unchanged build and focused tests passed with host access and isolated state.
- The first full unit suite passed 1,721 tests and failed three workflow expectations that still described the old preprod environment.
  The expectations now require the two approved values. No assertion was weakened, and no publication fixture or timeout changed.
- The temporary configuration check initially used an unexported schema import and an incorrect production-workflow filename.
  Reading the installed schema file and using the existing workflow filename corrected the checker. Repository code needed no correction.
- The temporary documentation audit had a syntax typo, and an intermediate link check preceded creation of the evidence index.
  The corrected audit and completed documentation passed all link and whitespace checks.
- The host command adapter rejected fish command chaining during the first staging attempt. Separate Git commands then succeeded without repository changes.

Build logs retain compatibility-date, middleware, and dependency-bundle warnings. No warning established a failure in this configuration change.
The completed fork UAT, live Pinata acceptance, and full browser walkthrough were not repeated.
No UI flow or route behavior changed, so no additional browser campaign was required.

## Review and continuation

Review the exact complete range, including the operator's original Wrangler changes and the shared-infrastructure consequences.
This preparation is not independent acceptance or deployment authorization.
No push, merge, tag, deployment, remote migration, dashboard change, content publication, or transaction occurred.

After independent review, use the [ordered continuation procedure](../preprod-validation.md#continue-after-the-reported-database-setup):

1. Supply GitHub preprod values, mainnet RPC URLs, and existing application configuration.
2. Confirm runtime feed/gateway values and reported database setup, with publication disabled.
3. Install the shared upload-only JWT privately and protect every beta/API/alternative entry point.
4. Authorize deployment from the reviewed workflow branch and exact source SHA, then complete read-only checks.
5. Separately authorize the one-document publication check. Stop before an onchain transaction.
6. Retain shared records, assign backup/retention/monitoring owners, and reserve production rollout for later approval.

Remaining operator inputs are the gateway, private secret installation, public RPCs, access policy, release approval, and operational ownership.
The mainnet JSON, database identity, producer URL, and shared limits are already recorded.
Both deployed versions must remain compatible with the shared schema. Policy maintenance or publication incidents can require disabling publication in both Workers.
Rollback must preserve records and accounting. The next step is review and preprod deployment preparation, not another implementation phase.
