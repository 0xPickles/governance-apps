# M0 WP0: Specification and Tooling

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Status: implemented by the DAO discovery documentation change.

## Objective

Create one accepted requirement set, one agent workflow, and working DAO
worktree support before implementation begins.

## Scope

- Pin reviewed contract behavior and open integration inputs.
- Record product, user-story, UI, mock-data, content, and script decisions.
- Define milestones, dependencies, package prompts, and the Sol Ultra kickoff.
- Generalize stale repository-wide delivery documentation.
- Add `dao` to work-package path, branch, list, and sync tooling.
- Make Node fallback logic follow `.nvmrc` rather than a stale hardcoded major.

## Non-goals

- No DAO application code.
- No producer code, deployment, or IPFS provider selection.
- No change to current stYFI Snapshot links.

## Acceptance criteria

- `DAO Governance`, `/dao`, and `dao.yearn.fi` are canonical.
- Veto participation, no quorum, signal display, raw script authoring, backend
  analysis, and fresh execution simulation are unambiguous.
- `workpkg-worktree.sh path --track dao --milestone m1 --wp wp1` resolves the
  canonical branch/worktree names.
- Active documentation points to app-owned delivery status.
- The committed baseline is merged into `agent/integration` before M1 branches.

## Validation

- `sh -n` for the changed shell scripts.
- DAO path and branch helper smoke checks.
- Markdown link and banned-stale-reference scan.
- Repository baseline required by `AGENTS.md` because tooling changed.

## Review

Documentation reviewer, tooling reviewer, and integrator.
