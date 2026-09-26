# DAO Governance Delivery Plan

Current entry points: [local validation completion](integration-20260926.md), [merge record](integration-20260924.md), [built local validation](../local-validation.md), and [preprod preparation](../preprod-validation.md).
The dated sequencing below records the historical delivery plan.

Status (2026-09-10): the accepted mock UI and reviewed V2 reads are integrated. The producer is reported released and active.

Use the [milestone plan](milestone-plan.md) as the single active delivery plan. [Status](status.md) separates inspected evidence from user-reported facts.
Older package ordering and producer-start gates are superseded. WP13–WP17 retain acceptance requirements within the combined live package.

## Branches and worktrees

```text
integration branch:   agent/integration
integration worktree: ../governance-apps.agent.integration

package branch:       agent/dao/<milestone>/<wp>
package worktree:     ../governance-apps.dao.<milestone>.<wp>
```

Example:

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.integration
./scripts/workpkg-worktree.sh create \
  --track dao \
  --milestone m1 \
  --wp wp1 \
  --base agent/integration \
  --install
```

The authorized combined package is `agent/dao/m5/live`, based on `28dd8fff2e7ff00961174635715be8d18ecd8d42`.

## Current sequence

The [milestone plan](milestone-plan.md) defines implementation, lightweight fork UAT, independent review, and separate release reconciliation/rollout.
No intermediate package approvals are required within the authorized implementation.
Historical M2 product gates are complete. User fork UAT acceptance and independent review remain required before release.

## Agent workflow

When explicitly authorized to orchestrate independent agents, use the existing workflow. External review of the current consumer is complete and recorded by the integrator from the user-supplied approval. For future packages, the implementer must not mark its own external review complete or merge its own branch:

1. Assign one implementer as the only editing owner of a package worktree.
2. Require a focused Conventional Commit and clean status.
3. Assign an independent reviewer read-only.
4. Assign the package's specialist auditor read-only.
5. Assign a fixer in the same package worktree for accepted blockers.
6. Re-run review against the final commit range.
7. Assign an integrator to merge the approved branch with `--no-ff`.
8. Run post-merge checks in the integration worktree.

Never let two agents edit one worktree. Do not ask a reviewer to fix what they
find. Do not merge uncommitted work or a branch whose reviewed SHA has changed
without re-review.

## Package index

### M0

- [`M0-WP0-specification-and-tooling.md`](work-packages/M0-WP0-specification-and-tooling.md)

### M1

- [`M1-WP1-domain-model-and-mocks.md`](work-packages/M1-WP1-domain-model-and-mocks.md)
- [`M1-WP2-route-shell-and-navigation.md`](work-packages/M1-WP2-route-shell-and-navigation.md)
- [`M1-WP3-debug-runtime.md`](work-packages/M1-WP3-debug-runtime.md)

### M2

- [`M2-WP4-proposal-board-and-detail.md`](work-packages/M2-WP4-proposal-board-and-detail.md)
- [`M2-WP5-voting-and-lifecycle-actions.md`](work-packages/M2-WP5-voting-and-lifecycle-actions.md)
- [`M2-WP6-proposal-authoring.md`](work-packages/M2-WP6-proposal-authoring.md)
- [`M2-WP7-mock-uat.md`](work-packages/M2-WP7-mock-uat.md)
- [`M2-WP7A-navigation-and-authoring-clarity.md`](work-packages/M2-WP7A-navigation-and-authoring-clarity.md)
- [`M2-WP7A evidence`](evidence/M2-WP7A/README.md)
- [`M2-WP7B-proposal-content-and-lifecycle-clarity.md`](work-packages/M2-WP7B-proposal-content-and-lifecycle-clarity.md)
- [`M2-WP7B evidence`](evidence/M2-WP7B/README.md)
- [`M2-WP7C-beta-access-and-execution-clarity.md`](work-packages/M2-WP7C-beta-access-and-execution-clarity.md)
- [`M2-WP7C evidence`](evidence/M2-WP7C/README.md)
- [`DAO beta operator runbook`](dao-beta-runbook.md)

### M3

- [`M3-WP8-feed-schema.md`](work-packages/M3-WP8-feed-schema.md)
- [`M3-WP9-stats-producer.md`](work-packages/M3-WP9-stats-producer.md)
- [`M3-WP10-producer-contract-validation.md`](work-packages/M3-WP10-producer-contract-validation.md)

### M4

- [`M4-WP11-feed-backed-reads.md`](work-packages/M4-WP11-feed-backed-reads.md)
- [`M4-WP12-analysis-presentation.md`](work-packages/M4-WP12-analysis-presentation.md)

### M5

- [`M5-WP13-forum-and-ipfs.md`](work-packages/M5-WP13-forum-and-ipfs.md)
- [`M5-WP14-governance-writes.md`](work-packages/M5-WP14-governance-writes.md)
- [`M5-WP15-execution-safety.md`](work-packages/M5-WP15-execution-safety.md)

### M6

- [`M6-WP16-fork-harness.md`](work-packages/M6-WP16-fork-harness.md)
- [`M6-WP17-fork-lifecycle-uat.md`](work-packages/M6-WP17-fork-lifecycle-uat.md)

### M7

- [`M7-WP18-rollout.md`](work-packages/M7-WP18-rollout.md)

## Prompt index

- [`orchestrator.md`](prompts/orchestrator.md)
- [`implementer.md`](prompts/implementer.md)
- [`reviewer.md`](prompts/reviewer.md)
- [`contract-auditor.md`](prompts/contract-auditor.md)
- [`frontend-auditor.md`](prompts/frontend-auditor.md)
- [`feed-auditor.md`](prompts/feed-auditor.md)
- [`fixer.md`](prompts/fixer.md)
- [`integrator.md`](prompts/integrator.md)

The new-session entry point is [`kickoff-prompt.md`](kickoff-prompt.md).

The durable ledger is [status](status.md). The current producer handoff is [producer-handoff](producer-handoff.md); the [template](producer-handoff-template.md) records actual later interoperability results.
