# DAO remaining milestone plan

This plan supersedes the implementation sequence recorded before September 23.
[Publication acceptance](../publication-acceptance-20260923.md) is complete; provider selection and the A/C/B experiment are closed.
The [historical index](historical-index.md) preserves earlier scope, requirements, failures, and review identifiers.

## 1. Review the closeout corrections

Review `codex/dao/m5/pinata` from `6f78a0840feafdb26e8256e7212529156beb6c72` to the final handoff commit.
Use the [closeout evidence](evidence/closeout-20260924/README.md) for current tests and limitations.
Confirm bounded fresh preparation, exact-call simulation, canonical replacement rejection, and no automatic resend after wallet submission.
Confirm forum feedback, form access, exact downloads, same-tab review recovery, and safe local initialization.
The original immutable content, feed schemas, contracts, and shared transaction pipeline remain unchanged.

## 2. Integrate the approved package

The package includes M5 live at `fc81ae0502efe45ed84367062a57df16c6dab46c`.
Preserve reviewed history and use the normal `--no-ff` merge into `agent/integration`.
Do not cherry-pick only the closeout commits onto a branch without their M5 and publication dependencies.
Use the [integration instructions](../release-checklist.md#integration-after-independent-approval) and repeat the required checks after merging.

## 3. Configure and authorize release

Supply independently reviewed deployment identities, RPC and producer configuration, separate D1 databases, migration, upload-only secret, gateway, limits, and retention ownership.
Verify protected-host behavior, disabled-mode reads, error monitoring, backup, and rollback procedures.
Keep public exposure and publication separately gated until rollout authorization.
The completed acceptance session is not production configuration and does not authorize deployment.

## 4. Reconcile release branches separately

On September 24, integration and local master differed by 141 integration-only and 18 master-only commits.
Resolve this divergence as separate release work. Do not reset, merge, or change master as part of this package cleanup.
WP18's deployment identity, monitoring, host protection, content durability, and rollback requirements still apply.
Production transactions, public exposure, forum posting, merging, tagging, and deployment require their own authorization.
