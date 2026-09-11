# DAO live review fixes

Recorded on 2026-09-11. This record tracks the five independent-review findings and the follow-up validation.
It does not grant review approval, UAT acceptance or rollout authority.

## Review boundary

- Branch: `agent/dao/m5/live`.
- Original package base: `28dd8fff2e7ff00961174635715be8d18ecd8d42`.
- Incremental review base: `f4f7e49bace1c26d2ba01d9c786cc92841e65d61`.
- The final handoff supplies the committed tip and both review ranges.
- The reviewer requested changes before integration. Re-review remains pending.
- [Original evidence](../m5-live/README.md) and its digest manifest remain unchanged.
- Both wire formats and dependencies remain unchanged.
- Integration, producer source and production remain unchanged. No merge, tag, deployment or forum post occurred.

## Finding tracker

| Finding | Implemented correction | Targeted regression | Review state |
| --- | --- | --- | --- |
| R1 / P1: unauthenticated publication and unbounded storage | Independent default-off publication gate; operator grants for exact digest, uploader and byte count; wallet signature; finite unique-content budget before upstream calls | `dao.publication-policy.test.ts`; compiled enabled-read/publication-disabled test; real signed local publication | Fixed; independent review pending |
| R2 / P2: transaction replacements | Verify the mined transaction, sender, nonce, exact call and canonical block. Use accepted fee-replacement hashes for decoding, saved recovery and indexing. Identify cancellations and changed calls as terminal outcomes | `dao.live-receipt.test.ts`; accepted and terminal creation/action reload tests in `useDaoLiveRecovery.test.tsx` | Fixed; independent review pending |
| R3 / P2: action receipt timeouts | Save actions as soon as a hash arrives. Retain unknown receipts through reload, lock duplicate actions, show the hash and retry confirmation without sending | `useDaoLiveRecovery.test.tsx`; `DaoProposalActionPanel.test.tsx`; shared `useTx.test.tsx` retry tests | Fixed; independent review pending |
| R4 / P2: lost unpublished drafts | Keep the authoring form and its fields mounted during eligibility errors or refresh. Block submission until eligibility is fresh | `DaoLiveDraft.test.tsx` retains Markdown, forum, script and review state | Fixed; independent review pending |
| R5 / P2: stalled oversized-body cancellation | Reject before best-effort cancellation, including upstream-error cleanup | `dao.publication.test.ts` covers declared size, streamed size and error bodies whose cancellation never resolves | Fixed; independent review pending |
| DAO-FR-035 | Distinguish errors before a hash exists from receipt failures after submission. Preserve known terminal hashes and published content | [Updated requirements](../../../functional-requirements.md) and recovery tests | Corrected |

Authorization metadata stays outside canonical proposal bytes.
The server checks the whole grant set against document and byte budgets before forum lookup or pinning.
Repeated grants permit only the same raw CID. They cannot increase unique pinned content within the configured policy.
This policy does not bound provider request charges or content uploaded through other systems.
Operators must retain consumed grants when extending a budget. A policy replacement is an explicit budget decision.
EOA signatures are supported. Contract-wallet authorization requires a separately reviewed policy.
See [live services](../../../live-services.md) for exact settings and limits.

## Evidence classes

| Evidence | Observation | Limit |
| --- | --- | --- |
| Signed publication and lifecycle browser run | A throwaway wallet signed exact content. The real route authorized it, pinned it in offline Kubo and verified retrieval. UI creation, vote and execution passed | Local service, candidate deployment configuration and disposable fork |
| [Published content](published-content.json) | Exact bytes published through the UI and retained in Kubo | No external service or retention agreement |
| [Producer output](producer-content.json) | Released binary retrieved those same bytes through Kubo's native HTTP gateway and emitted one proposal with available content | Local creation checkpoint; no producer changes |
| [Producer log](producer-content.log) | 170 RPC requests; 18.120 seconds; one proposal and one event; content requests enabled | Captured process stderr; no later lifecycle/reorg/restart producer checkpoint |
| [Producer-to-app browser check](local-producer-app.json) | Passed with actual producer bytes through the proxy, parser and rendered detail; zero wallet RPC and page errors | [Screenshot](screenshots/local-producer-content.png) retains the correct stale-snapshot notice; no fresh wallet eligibility is claimed |

The producer checkpoint used the existing binary from the clean producer checkout at `23c4c1e85c1422f4cb2636ae5526bae6b8e89bb6`.
Its approved implementation commit `7b67945253d91c495b148ee4f0a09a946a93390d` is an ancestor.
The [temporary configuration](local-producer-config.json) enables eight content requests per cycle.
It is a test candidate, not an approved production allowlist.

The fork was reset after the UI lifecycle run. A local script created proposal zero with the exact UI-published bytes.
This distinct transaction is recorded in the producer output.
The producer used `DAO_CONTENT_GATEWAY=http://127.0.0.1:18080/ipfs/`.
The gateway was native offline Kubo, using the same pin volume through a temporary container.
No public pin, forum post, production transaction or production feed update occurred.

## Validation

Logs in [checks](checks/) retain the completed runs, with local paths and terminal formatting normalized.

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 151 files; 1364 tests passed |
| Additional recovery regression run | 12 tests passed |
| `npm run test:e2e` | 44 passed; one expected production-mode skip |
| `npm run test:e2e:full -- --workers=1` | All 34 passed in one complete serial run; 10.4 minutes |
| `npm run test:e2e:dao-live` | Six passed; one development browser failure |
| Fresh-server creation/vote/execution rerun | Passed; signed publication and exact retrieval included |
| `npm run generate:dao-feed -- --check` | Passed |
| Original evidence digest verification | All 31 recorded files match; historical evidence unchanged |
| Producer-to-app browser check | Passed; one test with no feed interception or wallet RPC |
| Enabled compiled production routes | Three passed; two upstream feed requests; publication challenge and POST returned 404 |
| Disabled compiled production routes | One passed; page and API routes returned 404; zero upstream requests |
| Explicit production `npm run build` | Passed; 12 static pages generated |
| Explicit production `npm run worker:build` | Passed |
| `npm run validate:worker-size` | Dry-run gzip size 3253.18 KiB; below the 9216 KiB repository budget |
| Final type, lint and complete-range whitespace checks | Passed |

[Artifact hashes](artifact-sha256.json) identify every retained evidence file.
Production builds used explicit production runtime mode, disabled DAO, disabled mocks, disabled E2E and disabled publication.
The enabled-route runner compiled its separate enabled-DAO configuration with publication disabled.
No deployment command ran. Worker sizing used the repository's Wrangler dry run.
Existing Next.js middleware/standalone and Worker dynamic-import warnings remain nonblocking.

The first unit run loaded an outdated copy assertion. The corrected complete run passed.
The first full fork run had six passes and one browser navigation failure after successful signed publication and creation.
The trace recorded a development Fast Refresh script error. A fresh-server rerun of that full creation/vote/execution case passed.
These attempts are recorded separately; they are not represented as one clean seven-case run.

The first optional producer browser check used block time for its clock, before the later producer observation.
The app correctly rejected that future observation. The corrected test uses the producer observation time and passed.
The stale-snapshot notice remains visible because the fork block preceded producer acquisition by 18 minutes.
No application freshness or protocol checks changed. The retained screenshot was inspected for content and layout.

The first compiled publication test used a numeric loopback origin, while Next.js normalized the request URL to localhost.
That request correctly failed the origin check with 403. The runner now uses localhost consistently.
The publication assertion remains strict: disabled challenge and matching-origin POST both return 404.

## Remaining decisions and release gates

1. Select the external raw-block provider, private credential reference, retention policy and explicitly approved test target.
2. Approve the production uploader/grant policy and independently review deployment values, including supported hooks.
3. Publish one approved document through that external target, retrieve it through the producer's intended gateway, then verify it in the app.
4. Complete user local UAT acceptance and independent re-review of the committed range.
5. Reconcile the 141 integration-only and 17 master-only commits in separate release work.
6. Obtain separate rollout approval. Keep public DAO exposure and publication disabled until the relevant controls are approved and configured.

Protected preview access remains appropriate for private UAT.
The local producer/content checkpoint does not validate an external provider or production deployment.
Same-tab session recovery survives reload while browser storage is available. Clearing that storage requires manual transaction reconciliation.
Recovery never submits merely because a receipt or feed is delayed.

The disposable Anvil process and temporary gateway container were stopped after validation.
The original offline Kubo container and its pin volume remain available for local UAT.

The configured 1Password signer stalled during this follow-up.
The attempt was stopped before commit creation. Commits use the existing one-command unsigned fallback; Git settings were not changed.
