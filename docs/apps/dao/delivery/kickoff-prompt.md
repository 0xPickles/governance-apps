# DAO live integration continuation

```text
Continue the combined DAO live implementation in agent/dao/m5/live.
Use docs/apps/dao/delivery/milestone-plan.md as the single active plan.
Read AGENTS.md, DAO requirements, contract reference, V2 specification, field mapping, status, and current worktree changes.
Preserve the accepted mock UI and both wire formats. Historical package sequencing and producer-start gates are superseded.

The base is 28dd8fff2e7ff00961174635715be8d18ecd8d42.
The worktree is /Users/hydra/Developer/yearn/governance-apps.dao.m5.live.
The live feed is https://data.dao-ops.com/prod/dao.json.
The approved producer implementation is 7b67945253d91c495b148ee4f0a09a946a93390d.
Keep integration unchanged. Do not merge or reset master.

Complete real reads, runtime selection, eligibility, forum validation, durable content publication, and wallet transactions.
Keep credentials on the server. Ask early for missing provider, credential references, test target, or reviewed deployment configuration.
Use domain clients and shared useTx. Require exact simulation and fresh canonical state before signing.
Preserve publication on cancellation, receipt identity including ID zero, and same-identity indexing recovery.

Build a small disposable fork script and saved UI scenarios. Match transaction fixtures to actual fork commitments.
Assert receipts and resulting contract state independently. Exercise UI creation, voting, and execution plus failure cases.
Use optional producer checkpoints when practical. Do not create permanent infrastructure or modify the producer for tests.
Use only local services for ordinary tests. External publication requires an explicitly approved test target.

Run the checks in the milestone plan. Record actual evidence and limits without marking unperformed lifecycle tests complete.
Use small Conventional Commits and return a clean worktree with the exact review range and local runbook.
Do not self-approve independent review, merge, tag, deploy, expose production, submit production transactions, or post to the forum.
Release reconciliation and rollout remain separate work.
```
