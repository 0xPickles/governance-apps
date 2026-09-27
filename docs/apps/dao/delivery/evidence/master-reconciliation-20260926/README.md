# Master reconciliation evidence

The application tree is `746df83c67d2924ba832415bcac5078615a14bfa` in merge `fe2efb3b1976008bda48cb10cef369b21a91dec3`.
The [active handoff](../../master-reconciliation-20260926.md) records scope, results, preserved state, and deferred release inputs.

- [Validation index](validation.json): exact commands, exit codes, timings, log hashes, reference selection, and cleanup results.
- [Preserved session hashes](session-preservation-sha256.json): all 54 recorded files match before and after this task.
- [Preflight diagnostics](preflight-attempts.json): shell, SSH, and host-permission attempts and corrections.

Raw logs, Playwright artifacts, source exports, local D1, fork records, and Anvil state remain at `/private/tmp/governance-reconcile-20260926`.
The offline container `dao-reconcile-20260926` is stopped with its content retained.
The original `dao-validation-857869440066` container and populated session remain unchanged.

The failed sandbox unit/browser attempts and incomplete all-routes environment/build attempts remain in the index.
No live provider request, broad manual walkthrough, deployment, or mainnet transaction was part of these checks.
