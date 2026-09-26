# Local validation evidence — 26 September 2026

Source: `9a186ac5b6b5f7ac30b742d609f4c1a6ab39c865`.
Configuration: optimized local development runtime, real DAO clients, loopback Anvil, local D1, and offline publication.
These records cover one executable proposal, a voting-phase change, populated restart, and freshness behavior.
They do not complete the broader desktop/mobile walkthrough.

- `summary.json` records results, shutdown, history comparisons, and artifact hashes.
- `checks.json` records the focused tooling, typecheck, and lint results.
- `build.json` and `producer-config.json` record the explicit configuration.
- `content.json` contains the exact 397 downloaded document bytes.
- `smoke.json`, `smoke-run.json`, and `smoke.log` record the successful built-app path.
- `created/`, `phase/`, and `resumed/` contain canonical receipts, ledger rows, clock values, served feeds, and producer history.
- `freshness.json` records stale-clock rejection and restored unsigned review without transactions.
- `diagnostic-failure.json` records the initial diagnostic selector error. Its screenshot remains outside Git.
- `preservation.json` identifies the old session archive and matching critical-file hashes.
- `producer.log` retains each acquisition's time, RPC count, and output digest.

Raw test logs, screenshots, and one-off diagnostic scripts remain in `/Users/hydra/Developer/yearn/dao-local-validation/20260926`.
The [completion record](../../integration-20260926.md) explains the checks, limits, and definitive resume commands.
