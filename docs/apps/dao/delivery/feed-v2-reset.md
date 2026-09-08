# DAO feed reset — review candidate

The 2026-09-08 reset is based on clean integration commit
`639782376bcaf05ab43ed9d9759c73154d0723b6`, exactly the reviewed baseline.
Branch: `agent/dao/m3/feed-v2`. No intervening integration changes existed.
Review the complete `639782376bcaf05ab43ed9d9759c73154d0723b6..agent/dao/m3/feed-v2`
range, including its requirements and evidence commits. The branch is not merged.

The producer checkout was read-only and clean at
`943de11f539845200e23b02a61fbe1592bf90ed6`. The contract pin remains
`9395d5e6fffdfe21fda32af94d32fca1a4f7840b`.

This user-authorized reset supersedes the V1 freeze and the dependency that
blocked consumer read implementation behind producer acceptance. Historical
acceptance at `2e83910d5e41769305433c81c15915833a8bdf0b` and handoff at
`fb8bbb8735b336b5eadd6d42b26e56696ad688de` remain historical facts, not approval
of V2. External review, explicit producer-start approval, producer
interoperability, lifecycle staging, and production approval remain pending.

## Review boundaries and repository state

There was no deployed Governance Apps V1 feed consumer to migrate. A search of
the reviewed integration tree found the V1 parser in the schema generator and
tests, without a DAO runtime import. The existing route client used mocks,
including a production beta exception. This reset removes that exception and
rejects V1 explicitly; it introduces no dual validator, converter or publication.

The required package worktree was created with
`scripts/workpkg-worktree.sh create --track dao --milestone M3 --wp feed-v2 --base agent/integration --no-install`.
Its review location is `../governance-apps.dao.m3.feed-v2`. Sandbox restrictions
on that sibling caused repeated approval prompts, so routine edits and tests
used an isolated shared-object clone under `/private/tmp` on the same base and
branch. The final commits are transferred back to the package worktree. This is
a tooling accommodation, not a different integration base or permission to
modify the producer. Integration, producer, infrastructure and deployed flags
remain unchanged.

Commits use the integration repository’s existing author identity. The temporary
checkout’s signing attempt failed because its configured GPG secret key was
unavailable. A per-command unsigned-commit override was used; global Git
configuration was not changed.

## Architecture and decisions

[V2](../feed-schema-v2.md) is one bounded static snapshot. It carries observed
state and complete canonical events for explicitly configured Voting deployments.
Proposal identity is chain + Voting + uint256 ID, including zero. The current
app explicitly supports Ethereum mainnet, matching its existing shared RPC and
explorer infrastructure, with up to eight configured Voting deployments. The
[field/source mapping](../feed-v2-field-sources.md) accounts for each public field.
Stored proposal threshold and lifecycle flags are read directly; status comes
from the contract view at the identified block. Historical Vote contributions
are never summed into current totals.

The same-origin proxy and client reuse the bounded Teams/YBC transport. The
typed adapter owns display derivation and reuses the established content and
Executor framing parsers. Content is optional exact base64 bytes. A content
failure affects its proposal enrichment, while an invalid envelope cannot
replace last-good data. Request sequencing and acquisition time permit canonical
replacement at a lower height while rejecting delayed candidates.

Disconnected reads need no wallet RPC. The live overlay uses coherent
hash-referenced calls and reports its own block/time, account eligibility,
roles, contribution, configuration and current status. It cannot make the
snapshot appear newer. Production DAO preparation methods remain disabled;
mock actions remain in domain clients and shared useTx. Existing execution
preflight interfaces now bind the actual Voting.execute call, caller, chain
and script, and reject stale or changed prepared inputs.

Removed: active V1 generation/schema/examples/proof tests, state replay,
historical configuration reconstruction, trace/storage/setter attribution,
human/YBC/stYFIx classifications and counts, proposal-time simulation jobs,
proof manifests, simulation UI promises and production mock fallback.

Retained: immutable `yearn.dao.proposal.v1`, exact content commitments and safe
Markdown/attachments, established Executor bytes, stored governance facts,
canonical history, receipt-confirmed identity and awaiting-index behavior,
current mock action flows and fresh actual-call execution safety requirements.

Deferred: producer implementation and actual-byte interoperability, live
deployment/source verification, production forum/content publication and writes,
optional semantic ABI expansion/analysis, contract-executed lifecycle UAT and
rollout. None of these is represented by a permanently pending analysis object.

## Evidence origin

| Area | Evidence in this branch | Later gate |
| --- | --- | --- |
| Voting/Voter semantics, ID zero, flags, replacement votes, signal completion | Reviewed pinned source plus explicitly synthetic tests | Contract-executed lifecycle cases |
| RPC coherence, chain/account changes, stale heads and failures | Controlled ABI-encoded RPC responses in `tests/fixtures/dao-rpc-v2.ts`; no recorded live responses | Actual node/provider and deployment verification |
| Feed acceptance, content and script states | Saved synthetic [27-proposal response](../examples/feed-v2/dao-feed-v2.example.json), portable acceptance mutations, Ajv and real parser/adapter | Actual producer-generated immutable candidate |
| UI and cache behavior | Real production-runtime routes with saved response, mocks disabled; component/hook and mock E2E coverage | Cross-repository staging, authenticated host and lifecycle UAT |
| Publication/reorg operations | Reviewed [producer requirements](producer-handoff.md), consumer replacement tests | Producer fault/restart/delayed-write and canonical recovery tests |

No new live or contract-executed evidence is claimed. The earlier producer
findings are carried into consumer expectations: zero topics are valid; Flag
and early Veto retain retracted; and observed status is not independently
replayed by one language. A status mutation without contradictory flags can be
wire-valid; only acquisition of the real status result establishes correctness.

The read-only producer inventory contains a different source pin and a candidate
Voting deployment. These are recorded in the handoff and remain unresolved.
Synthetic deployment addresses are never production defaults.

## Measurements and validation

Measured on an Apple M1 Max with 64 GiB RAM, macOS arm64 and Node v24.1.0.
Both parser series use Vite SSR module loading, one warmup and ten serial
iterations, including JSON.parse. The final V2 series ran after browser/build
processes finished. Network, RPC, initial module loading and rendering are
excluded. These are local wall-time means, not browser latency guarantees.

| Measurement | Reviewed V1 | V2 |
| --- | ---: | ---: |
| Main schema + semantic validator | 407,612 bytes / 11,009 lines | 9,292 bytes / 232 lines |
| Additional Voter build proof module | 9,532 bytes / 45 lines | Removed |
| Generated JSON Schema, formatted | 2,498,040 bytes | 10,393 bytes |
| Representative minified response, 27 proposals | 956,317 bytes | 47,764 bytes |
| JSON + wire validation, mean | 132.917 ms | 0.622 ms |
| JSON + wire validation + domain/content/script adapter | No production V1 adapter existed | 4.485 ms |

The generated V2 schema is 4,778 bytes minified. The representative V2 response
has 59 events; the V1 example had 81 and different synthetic scenarios. This is
a comparison of the replacement contracts, not identical historical chain data.
The response is about 95% smaller and the formatted generated schema about
99.6% smaller.

To expose the remaining code rather than hide it behind the adapter,
[boundary-size.json](evidence/feed-v2/boundary-size.json) inventories every new
consumer boundary module: schema, adapter, content-byte loader, deployment
checks, script framing wrapper, transport reader, proxy, live RPC client and
exact execute-call binding total 38,980 bytes / 740 lines. This includes new
functionality absent from V1. Existing shared content/script parsers and the
domain/UI remain separately maintained; no old proof validator sits behind them.

The measured growth case has 1,000 proposals, 11,000 events and distinct
canonical content bodies of roughly 4 KiB each. Its minified response is
10,122,086 bytes (about 9.65 MiB). Wire validation averages 52.788 ms and complete
adaptation 810.543 ms. Complete timelines and inline content now dominate growth,
rather than proof/simulation structures. This is synthetic sizing, not a forecast
or producer evidence.

Keep one snapshot for launch: the representative response is under 48 KB.
The hard transport ceiling is 32 MiB decoded bytes with a ten-second total
deadline. Proposed operating targets are at most 1 MiB and at most 100 ms
parse-plus-adapter time on the review desktop; verify actual mobile cost at
staging. The 1,000-proposal case exceeds those operating targets and needs a
coordinated performance review before that scale is admitted to production.
Evaluate cached/lazy frontend interpretation and, if necessary, a small immutable
content-object split tied to a snapshot. Do not silently omit proposals/history
or treat the hard ceiling as an acceptable interaction latency. No request-time
indexer is proposed.

Raw series: [V1](evidence/feed-v2/measurements-v1.json),
[V2](evidence/feed-v2/measurements-v2.json).
Run `npm run measure:dao-feed` to reproduce V2.

| Local gate | Result |
| --- | --- |
| Typecheck and lint | Pass |
| Unit/integration suite, one worker | 143 files, 1,264 tests passed |
| Final stored-veto UI/domain regression | 62 tests passed after the final presentation fix |
| Preview/development smoke suite | 43 passed, one interrupted veYFI case passed on isolated rerun, one production-only case skipped in this mode |
| Full E2E suite | All 34 cases passed across the full run and corrective reruns |
| Production V2 routes, mocks disabled | Pass; saved response through actual transport/parser/adapter/routes, zero wallet RPC requests |
| Disabled production gate | Pass; GET/HEAD 404s, security headers and beta-host gating; covers the smoke mode skip |
| Next production build | Pass in both enabled-V2 and disabled-DAO configurations |
| Generated artifact drift, dependency policy, documentation links, diff whitespace | Pass |
| Visual/keyboard review | Mobile/tablet/desktop/short-desktop captures; native disclosure keyboard access and overflow checks; full E2E contrast checks in both themes |

The commands and screenshot provenance are in
[the evidence index](evidence/feed-v2/README.md).
Initial failures are not counted as passes: old URL/title/attribution expectations
were corrected; a collapsed Rules disclosure was opened before asserting its
retained source link; the terminal test exposed the stored-retraction explanation
omission, which was fixed. One smoke case was interrupted by a development
reload during a shared-module edit and passed unchanged with files held stable.
The disabled-host runner initially used the wrong local port; the runner now
sets one explicit local base URL and the gate passed. Early concurrent unit/build
runs hit resource-related timeouts; the serial full unit run passed without
relaxing assertions.

No live deployment verification, actual producer-byte interoperability, newly
contract-executed lifecycle/reorg tests, authenticated remote staging, OpenNext
worker build/deployment, physical-device or manual screen-reader certification
was performed. These are not claimed as passes. The source-pin discrepancy,
growth cost and real provider/publication behavior remain later integration
gates.

## Remaining gates

1. External review of the complete base-to-tip range; address findings.
2. Explicit approval to begin Gov Apps Stats.
3. Producer implementation against this reviewed V2 candidate, including source
   reconciliation, bounded acquisition, durable scripts/content and publication.
4. Actual producer bytes through this transport/parser/adapter and real routes,
   followed by cross-repository staging and contract-executed lifecycle/reorg UAT.
5. Required production approval before any deployment or exposure change.

V2 is ready for review and producer implementation after approval.
Interoperability is pending. Practical producer findings may require small
coordinated amendments; this branch does not declare V2 permanently frozen.
