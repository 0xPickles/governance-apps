# DAO historical records and maintenance inventory

The [DAO entry point](../README.md), [operations](../pinata-publication.md), [local development](../local-development.md), and [release checklist](../release-checklist.md) describe current behavior.
The [September 23 acceptance](../publication-acceptance-20260923.md) closes publication acceptance.
Earlier “pending” statements below describe their recorded dates. They are not additional live acceptance gates.

| Historical record | Retained purpose |
| --- | --- |
| [Original implementation task](pinata-publication-task.md) | Scope and constraints before implementation; superseded by the current milestone plan |
| [September 17 acceptance procedure](../pinata-acceptance.md) and [prepared session](../pinata-acceptance-session.md) | Original A/C/B plan, budgets, ownership, and interrupted preparation |
| [Recovery and follow-up procedure](../pinata-recovery.md) | Missing original accounting, exact-document recovery, and separately bounded follow-up |
| [Original M5 evidence](evidence/m5-live/README.md) | Fork, producer, and build evidence at its recorded revision |
| [M5 review corrections](evidence/m5-live-review/README.md) | Review findings and recovery checks inherited by this package |
| [Pinata implementation](evidence/m5-pinata/README.md) | Initial implementation results, failed attempts, and corrected reruns |
| [Acknowledgement correction](evidence/m5-pinata-review/README.md) | Rejected-upload defect and original failing validation run |
| [September 17 validation closure](evidence/m5-pinata-validation/README.md) | Full rerun after the acknowledgement correction; does not validate later code |
| [Provider decision](../experiments/pinata-free/decision.md) | Closed provider choice and accepted constraints |

## September 24 maintenance inventory

The original committed version for every path in this inventory is:
`6f78a0840feafdb26e8256e7212529156beb6c72:<path>`.
Retrieve any original artifact without changing the worktree:

```fish
git show 6f78a0840feafdb26e8256e7212529156beb6c72:docs/apps/dao/delivery/evidence/m5-pinata/checks/typecheck-7.log
```

| Original repository path | Current location or reason |
| --- | --- |
| `docs/apps/dao/delivery/evidence/m5-live/fork-execution.json` | [Regression fixture](../../../../tests/fixtures/dao-live-evidence/fork-execution.json); unchanged bytes |
| `docs/apps/dao/delivery/evidence/m5-live/producer-created.json` | [Regression fixture](../../../../tests/fixtures/dao-live-evidence/producer-created.json); unchanged bytes |
| `docs/apps/dao/delivery/evidence/m5-live/local-deployments.json` | [Regression fixture](../../../../tests/fixtures/dao-live-evidence/local-deployments.json); unchanged bytes |
| `docs/apps/dao/delivery/evidence/m5-pinata/checks/typecheck-7.log` | Removed duplicate passing output; identical `typecheck-final.log` remains |
| `docs/apps/dao/delivery/evidence/m5-pinata/checks/typecheck-8.log` | Removed duplicate passing output; identical `typecheck-final.log` remains |
| `docs/apps/dao/delivery/evidence/m5-pinata/checks/lint-4.log` | Removed duplicate passing output; identical `lint-final.log` remains |
| `docs/apps/dao/delivery/evidence/m5-pinata/checks/lint-5.log` | Removed duplicate passing output; identical `lint-final.log` remains |

Historical checksum manifests are unchanged and describe their original artifact sets.
Run their complete checks against the recorded Git revision, not against the reorganized current tree.
Tests now import the three JSON inputs from the fixture directory. Historical evidence links point to their current locations.
Significant failed logs, screenshots, review findings, and provider decisions remain discoverable in the current tree.

No application helper or configuration was removed without evidence that it was unused.
Fork tooling, schemas/examples, migrations, supported mocks, and generated Cloudflare types remain required and retained.
No external acceptance directory, credential, database, ledger, checkpoint, or browser profile was copied into Git or changed.
