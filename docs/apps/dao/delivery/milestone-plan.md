# DAO delivery milestones

This is the single active delivery plan, updated after Pinata correction approval and validation closure on 2026-09-17.
Older package ordering and producer-start gates are superseded. Historical acceptance and evidence remain in [status](status.md).

## Accepted baseline

M0 established the contract reference. M1 supplied the domain and mocks. M2 mock-first product acceptance is complete.
The reviewed V2 consumer integrates revised WP8/WP11/WP12. The accepted mock UI remains the product baseline.
The user reports that the V2 producer is reviewed, released, and active at https://data.dao-ops.com/prod/dao.json.
The approved producer implementation is `7b67945253d91c495b148ee4f0a09a946a93390d`.
An inspection on 2026-09-10 found this commit in the clean producer integration history at `23c4c1e85c1422f4cb2636ae5526bae6b8e89bb6`.
A direct endpoint read returned one deployment and zero proposals. This proves endpoint availability, not lifecycle coverage or deployment identity.

The combined package implements these application flows and supplies local fork evidence.
See [inherited M5 review evidence](evidence/m5-live-review/README.md), [publication evidence](evidence/m5-pinata/README.md), and the [runbook](../local-fork-uat.md).
External publication configuration, independent review, user acceptance, and rollout remain separate outstanding work.

The five findings from independent review are addressed in the [finding tracker](evidence/m5-live-review/README.md#finding-tracker).
The follow-up keeps this package and architecture. Independent re-review remains pending.

## 1. Review public publication through Pinata

The implemented publication package is `codex/dao/m5/pinata`, based on M5 live at `fc81ae0502efe45ed84367062a57df16c6dab46c`.
Follow [the implementation task](pinata-publication-task.md) and [the accepted implementation decision](../experiments/pinata-free/decision.md).
The earlier M5 implementation remains its dependency. Keep integration unchanged during implementation.
WP13–WP15 remain acceptance requirements, with per-document publication grants superseded by bounded public admission.
The experiment is closed. [Current implementation evidence](evidence/m5-pinata/README.md) records local results.
The small [operator session](../pinata-acceptance.md) remains a release gate.
The [publication review correction](evidence/m5-pinata-review/README.md) requires acknowledged uploads before successful publication.
The user approved the correction on 2026-09-17. The [validation closure](evidence/m5-pinata-validation/README.md) records the complete passing rerun.
The bounded operator session and deployment configuration remain release work.

- Reuse the proxy, V2 parser, adapter, routes, and live wallet overlay.
- Select real clients with `NEXT_PUBLIC_USE_MOCKS=false`. Production never falls back to mocks.
- Set `DAO_DATA_URL` to the live endpoint. Obtain independently reviewed `NEXT_PUBLIC_DAO_DEPLOYMENTS` values outside the feed.
- Implement current proposer eligibility, hooks, shared capacity, and forum URL/category validation.
- Publish and retrieve exact canonical content through the intended durable service. Keep credentials server-side.
- Gate publication independently of reads. Replace per-document grants with durable global admission limits and a finite document/byte/attempt budget.
- Preserve publication after wallet rejection or transaction failure. Publication and creation are separate actions.
- Prepare creation, vote, retract, flag, veto, and execute in domain clients through shared `useTx`.
- Verify actual account, network, trusted deployment, and action-specific state before signing. Simulate the exact transaction.
- Bind preparation to current inputs and a coherent canonical observation. Fail closed on required simulation errors.
- For execute, compare the original script with the current stored commitment and simulate actual `Voting.execute` with the actual caller.
- Distinguish submission, unknown receipt, successful receipt, awaiting-index, and indexed states. Preserve hashes through timeouts and reloads.
- Follow verified identical-call fee replacements. Identify cancellations and changed calls. Preserve ID zero and prevent duplicate submission during feed lag.
- Retain unpublished draft and review state when eligibility refresh fails. Reject oversized bodies without waiting for cancellation.
- Keep missing content independent of protocol-permitted voting. Preserve both wire formats unchanged.

## 2. Perform lightweight fork UAT and focused regression tests

WP16–WP17 define acceptance coverage within the same package. Use a disposable local fork and a small scenario script.
Reuse deployed contracts and dependencies where available. Fund throwaway wallets and confine transaction RPC to the fork.
Use saved JSON for visual and malformed-content scenarios. Match transaction fixtures to actual proposal identities, scripts, and commitments.
Assert receipts and resulting state independently. Refreshing a fixture does not prove indexing.

Cover creation/ID zero, signals, voting, replacement and zero contributions, retract, Flag, both Veto paths, and execution.
Include wallet rejection, reverts, wrong network, stale preparation, time/configuration changes, indexing delay, and canonical replacement.
Confine time controls to local tests. Preserve production freshness and canonicality checks.
This publication package requires one released-producer checkpoint with temporary configuration, state, and locally served output.
Record checkpoint limits without modifying the producer or claiming fixture coverage as producer interoperability.
No continuous producer or permanent fork infrastructure is required.

Run typecheck, lint, unit tests, smoke E2E, serial full E2E, build, and the generated-feed check.
Run enabled/disabled production route checks, applicable Worker checks, and dependency validation.
Record actual results and separate fixture, contract-executed fork, and live endpoint evidence. Unperformed tests remain pending.

## 3. Obtain independent review

Return the clean branch, exact base/final commit/review range, evidence, local runbook, limitations, and missing operator inputs.
Independent review remains required. The implementer does not self-approve or merge this package.
User UAT acceptance remains required before release.

## 4. Reconcile the release branch and perform the separately approved rollout

At package start, integration and local master differ by 141 integration-only and 17 master-only commits.
Reconcile that divergence in separate release work. Do not merge or reset master here.
WP18 retains deployment identity, protected-host, feature-flag, monitoring, rollback, and content durability requirements.
Production blockchain transactions, deployment, public exposure, forum posting, merging, and tagging are outside this task.
The public production DAO flag remains off until the separately approved rollout.
