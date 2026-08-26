# DAO Governance Delivery Plan

Status: M2 is complete; M3 WP8 is the next package. M3 WP9 remains blocked until
WP8 is accepted.

This plan is the task source for implementing DAO Governance. It uses the shared
workflow in [`docs/shared/codex-usage-guide.md`](../../../shared/codex-usage-guide.md)
and the product sources one directory above.

## Delivery gates

| Milestone | Outcome | Human gate |
| --- | --- | --- |
| M0 | Canonical requirements, tooling, and handoff | Accepted in discovery |
| M1 | Domain model, routes, and shared debug runtime | Engineering review |
| M2 | Complete mock proposal, voting, authoring, and UX | User accepts mock UX |
| M3 | Feed contract, fixture-backed producer, and staging contract validation | Producer and consumer accept schema |
| M4 | Feed-backed reads and analysis presentation | Read-path review |
| M5 | Forum/IPFS publication and onchain writes | Write/security review |
| M6 | Fork deployment and full lifecycle proof | User accepts fork UAT |
| M7 | Preproduction and controlled production rollout | Explicit production approval |

M2 was accepted on 2026-08-26 after authenticated Cloudflare Access UAT passed
for all six beta hosts. Start M3 with consumer-owned WP8. Do not start WP9 in
`gov-apps-stats` until WP8 is accepted. Do not start M7 before fork evidence is
accepted.

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

Create a package only after its dependencies are merged into integration.

## Integration sequence

```text
M1: WP1 -> WP2 -> WP3
M2: WP4 -> WP6 -> WP5 -> WP7 -> user gate -> WP7A -> user gate -> WP7B -> user gate -> WP7C -> user gate
M3: WP8 -> WP9 (gov-apps-stats) -> WP10
M4: WP11 -> WP12
M5: WP13 -> WP14 -> WP15
M6: WP16 -> WP17 -> user gate
M7: WP18 -> production approval
```

WP4 and WP6 may run in parallel after M1 if they keep their owned files separate.
Producer WP9 runs in the `gov-apps-stats` repository and its own integration lane.

## Human-gate iteration

User feedback at M2 creates a follow-up package from the latest integration head:
`M2-WP7A`, `M2-WP7B`, then `M2-WP7C` if needed. Add the scoped package file before editing,
then run the normal implementation, review, audit, fix, re-review, and integration
loop. Present the gate again after each accepted follow-up. Do not tag M2 or begin
M3 without explicit acceptance.

Use the same suffix pattern after fork UAT (`M6-WP17A`, `M6-WP17B`). Do not tag
M6 or begin rollout until the fork gate is accepted.

## Agent workflow

The root orchestrator uses up to three sub-agents alongside itself:

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

The durable package ledger is [`status.md`](status.md). Before WP9, copy
[`producer-handoff-template.md`](producer-handoff-template.md) to
`producer-handoff.md` and fill every field.
