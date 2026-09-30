# DAO UAT closeout — September 30, 2026

Supersession note, 2026-09-30: use the [preparation handoff](preprod-preparation-20260930.md) and [canonical preprod procedure](../preprod-validation.md) for current release inputs.
The shared-database decision replaces the separate-D1 and placeholder requirements below. The reviewed mainnet JSON and producer identity are now recorded.
This historical closeout retains its original tests, observations, and then-pending inputs.
Its original documentation candidate is `6191716ed4781ccdfdec6590acb4aea71c355bc9`. Use that SHA for its review range after this note.

This bounded closeout is on `agent/integration`, for independent review before preprod deployment.
The starting commit was `ad2c18a47c9366f50037e9daa79b08641d09affa`, with a clean worktree.
The tested application commits are `6b7f810b27f68fa901915a230cf5baca1ed2b183` and `2feddf9263d56213c8c9ddffc6406bf0ac954243`.
The final documentation commit changes no application code. Both product commits used the configured SSH signer successfully.
The documentation commit uses the documented `--no-gpg-sign` fallback after `1Password: agent returned an error`. Git signing defaults remain unchanged.
The final candidate is the commit that adds this handoff. Resolve its exact SHA and review range with:

```fish
set candidate (git log -1 --format=%H 6191716ed4781ccdfdec6590acb4aea71c355bc9 -- docs/apps/dao/delivery/uat-closeout-20260930.md)
git log --oneline ad2c18a47c9366f50037e9daa79b08641d09affa.."$candidate"
git diff --stat ad2c18a47c9366f50037e9daa79b08641d09affa "$candidate"
```

## Completed walkthrough and preserved evidence

The user reported passes for the lifecycle walkthrough, populated restart, disconnected reads, desktop/mobile checks, fallback displays, and shutdown.
Independent comparisons confirm all eight proposal records survived restart unchanged.
Publication records, policy, and reservations also remained unchanged: eight documents, eight upload attempts, and eight retrieval attempts.
These comparisons do not independently establish every UI observation or process shutdown.

The retained evidence directory is `/Users/hydra/Developer/yearn/dao-local-validation/20260926/session/walkthrough-20260928`.
Its `UAT-FINDINGS.md`, `completion-check-20260930.json`, and before/after/final feed snapshots remain unchanged.
Final statuses for IDs 0–7 are EXECUTED, RETRACTED, FLAGGED, VETOED, FAILED, EXPIRED, EXPIRED, and VETOED.
Intermediate execution eligibility, rejected simulation, and closed late-veto participation are user-reported UI passes, not deductions from final statuses.

The closeout uses disposable source exports under `/private/tmp/dao-uat-closeout-20260930`, without private environment files.
It preserves the retained session, database, browser profile, producer history, documents, source exports, and offline content container.
The container `dao-validation-857869440066` remains stopped, with its ownership label pointing to the retained session.
All 6,332 regular files and symlinks match the pre-closeout preservation manifest.
Both manifest files have SHA-256 `17db5439af3856f7c3fa6f3502d8c80b171a074d07324f67bdcc3244b4967a51`.
Completed [Pinata publication acceptance](../publication-acceptance-20260923.md) remains accepted. Neither acceptance session was repeated.

## Changes and finding dispositions

| Finding | Before | After / disposition |
|---|---|---|
| UAT-001 | Permanent voting blockers could say voting had not opened or had closed. | Specific retraction, flagging, or early-veto explanations precede timing. Eligibility and transaction safeguards remain unchanged. |
| Results order | Your action preceded Vote results. | The existing results card precedes the complete action panel in the DOM and on desktop/mobile. Wallet observations stay with the action panel. |
| UAT-002 | The long-running browser stalled; the cause was unconfirmed. | Deferred and non-blocking at the user's request. No fix claimed. Investigate only on recurrence during ordinary validation. |
| UAT-003 | Opening a review dialog was mistaken for preparation. | The runbook requires prepare, replace the observed block, then invoke the old preparation. It references the existing disposable canonicality test. |
| UAT-004 | Sandbox-restricted output led to an incorrect Colima diagnosis. | The runbook explains Docker CLI use with Colima and checks existing context/container ownership. `colima-m1-wp2` is specific to this retained session. |

The results card retains its tally, thresholds, moderation semantics, and collapsed rules.
The explanation change leaves wallet, network, already-voted, weight, freshness, canonicality, and transaction controls intact.
Ordinary upcoming/closed messages and late-veto participation boundaries retain focused regression coverage.

## Validation

| Check | Result |
|---|---|
| Typecheck and lint | Passed after test corrections |
| Complete unit/integration suite | 171 files, 1,724 tests passed |
| Focused domain, action, and rendered component tests | 104 passed |
| Focused browser regressions | Four passed: card order/keyboard access and all three lifecycle explanations across timing states |
| Smoke browser suite | 46 passed, one expected production-only skip |
| Complete serial browser suite | 41 passed with one worker |
| Generated-feed artifacts and dependency policy | Passed, no drift or dependency changes |
| Production environment validation | Passed with the existing non-secret fixture configuration |
| Enabled production routes | Three passed, two upstream requests; separate unconfigured-publication check passed |
| Disabled production routes | One passed, zero upstream requests |
| Private publication values in client output | Absent from all 227 checked artifacts in each production build |
| Worker build | Passed using `--skipNextBuild` with the tested enabled output |
| Worker size, preprod and production configurations | 3,379.20 KiB gzip against the 9,216 KiB budget |
| Documentation and whitespace | 493 local Markdown targets passed; changed links and `git diff --check` passed |

Raw command records and logs are retained in `/private/tmp/dao-uat-closeout-20260930/checks`.
Failed browser runs retain traces, screenshots, and video under that directory's sibling `artifacts` directory.
The [validation index](/private/tmp/dao-uat-closeout-20260930/validation.json) records commands, results, timings, and log/screenshot hashes.

Inspected screenshots are in `/private/tmp/dao-uat-closeout-20260930/screenshots`:

| File | Viewport | Inspected result |
|---|---|---|
| `retracted.png` | 1280 × 900 | Results above actions, collapsed rules, explicit retraction explanation |
| `flagged.png` | 390 × 844 | Results above actions, contained mobile text, explicit flagging explanation |
| `early-veto.png` | 1280 × 900 | Results above actions, explicit veto explanation despite retraction |

These are sidebar captures at the stated viewports. Browser assertions also cover document containment, control access, keyboard order, and disconnected reads.

Retained attempts and corrections:

- The sandbox rejected the first browser server bind. The same suite ran with host access and disposable state.
- The initial complete unit run passed 1,722 tests and failed two obsolete early-veto text expectations. Updated expectations passed focused and complete reruns.
- New browser checks initially targeted a non-focusable label and a field absent from the test bridge. They now assert loaded controls, keyboard order, and rendered text.
- One combined lifecycle browser test exceeded its existing timeout. Separate fixture tests retain every timing assertion and the unchanged per-test timeout.
- One existing account test stalled before bridge initialization, with `SyntaxError: Invalid or unexpected token` in its trace. Its unchanged isolated rerun and complete suite passed.
- The first production size command used an unsupported wrapper argument. The corrected positional configuration argument passed without a rebuild.

No assertion or timeout was relaxed. The transient client-script error is not a claimed fix or diagnosis of UAT-002.
No failure established a transaction-path regression. This closeout did not repeat the fork lifecycle campaign or publication acceptance.
Logs retain development, dummy-wallet, jsdom, middleware, standalone-output, and OpenNext bundle warnings.

## Preprod handoff

Independent review of this exact candidate is the next gate. No push, tag, deployment, or mainnet transaction occurred.
Remote resources and rollout flags remain unchanged.
After acceptance, build that source separately with `NODE_ENV=production` and `NEXT_PUBLIC_RUNTIME_MODE=production`, connected to mainnet.
Local fixture URLs, test identities, and reserved database IDs are not deployment inputs.

Outstanding inputs are:

- Approved candidate SHA, mainnet deployment allowlist/identities, canonical/simulation-capable RPC URLs, and live producer endpoint/identity.
- A distinct real preprod D1 ID, migration operator, backup location, and restoration owner.
- Private upload-only Pinata secret, public gateway, aggregate limits, retention duration, and pin owner for enabled publication.
- Reviewed feature flags, WalletConnect project ID, global data URL, and other values required by enabled domains.
- Beta-host access policy, release operator, monitoring owners, and rollback Worker version.

Use the [preprod checklist](../preprod-validation.md) for configuration and read-only validation. Routine validation stops before transaction submission.
A bounded live publication check remains a separate operator action with its own document, forum topic, named operator, and one-document budget approval.
The production database ID and production rollout approval remain later production-release inputs.
Local validation does not constitute independent review or production approval.
