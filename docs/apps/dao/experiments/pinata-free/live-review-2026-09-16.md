# Pinata live review: 2026-09-16

Outcome: **content compatibility established; proceed with server-side implementation**.
The user accepted moving the remaining small credential checks into staging acceptance.
The exploratory spike is closed. Production publication remains disabled pending implementation and release acceptance.

## Evidence identity

- Application baseline: `fc81ae0502efe45ed84367062a57df16c6dab46c`.
- Spike tip used for the run: `82ae4c5503645e4560feba550b6f523b6234eff1`.
- Executable source commit: `42caed45f9fe93e7b5d4699d87f637d892225f27`.
- Approved runner SHA-256: `68f825ea1ee69bd4fa2682ebda3159db6f1e86d11c8665776fae9d5b773c794a`.
- [Sanitized cumulative report](evidence/report-2026-09-16T13-21-22-226Z.json).
- [Evidence checksums](evidence/sha256.json).
- Live review interval: 2026-09-16 13:21:22.226Z through 13:47:10.487Z.

The report includes earlier offline evidence. This review uses the 164 events in the live review interval.
The live interval includes local/injected recovery and browser checks; they are not relabeled as live provider or contract evidence.
The report's `providerVerdict: INCOMPLETE` value is hardcoded by the reviewed runner, not an automatic failure classification.

## Observed results

| Subject | Evidence and conclusion |
| --- | --- |
| Free-account setup | The operator confirmed the dedicated Free account. All 15 key configurations were verified through initial API metadata. No billing statement or financial charge is inferred from the request ledger. |
| Legacy exact content | Small, Unicode/serialization, maximum Markdown, 131,072-byte maximum document and revision all returned expected CIDs and exact bytes. |
| Modern upload | The small document passed. This does not establish the complete modern test matrix. |
| Generated key after setup revocation | Legacy publication succeeded after the operator's setup-revocation confirmation. |
| Oversized transport | The deliberately invalid 131,073-byte fixture uploaded and was retrieved intact. Pinata did not enforce our application's smaller body limit. |
| Independent gateway | ipfs.io returned HTTP 429. Independent availability remains unverified. |
| Duplicate storage | The operator entered seven files before and after the checked duplicate. Returned CIDs also matched. No universal provider billing rule is inferred. |
| Sequential allowance | A key verified at zero of two uses accepted two uploads, then returned 403. Gateway retrieval afterward returned exact content. |
| Concurrent allowance | A separate two-use key accepted one upload. After a process restart, two competing requests returned one 200 and one 403. |
| Mixed requests | Malformed upload returned 400, unauthorized list returned 403, authentication returned 200 and a valid upload returned 200. Numeric use deltas were unavailable. |
| Producer | `producer-gateway-1` retrieved 561 exact bytes from Pinata. `producer-initial` passed with one retrieval. RPC data came from the existing local harness. |
| Recovery and UI | Local resumed/unavailable/resumed-unavailable producer checks passed. Consumer browser rendering passed using local output. No production lifecycle is claimed. |
| Cleanup | Seven unpin requests returned 200. All eight conservative object records are marked removed. The operator confirmed account emptiness and key cleanup. |

The user's dashboard screenshot also showed `L-sequential` and `L-consumption` as Exhausted.
That observation supports exhaustion but supplies no numeric USED count and no per-request accounting rule.
The screenshot is not copied because its key column is unnecessary evidence.

## Skipped and qualified evidence

- Legacy and modern permission-isolation probes stopped before the forbidden-operation requests because USED counters were unavailable.
- Signed-upload tests stopped at the same prerequisite. No signed URL was tested in this run.
- The operator reports revoking `L-revoke`, then submitting a blank confirmation by mistake.
  The runner skipped revoked-key rejection, post-revocation retrieval and replacement-key publication.
- Dashboard pin confirmations record operator observations. File listing and successful retrieval do not independently prove indefinite pin retention.
- Deferred wrong-CID, wrapping and other matrix cases remain unperformed. Existing offline rejection tests are separate evidence.
- No production endpoint abuse test, account-exhaustion test, long-term retention test or public governance transaction occurred.

## Budget and cleanup

| Aggregate ledger item | Recorded amount | Ceiling |
| --- | ---: | ---: |
| Programmatic requests | 73 | 200 |
| Upload attempts | 20 | 40 |
| Attempted file-content bytes | 304,384 | 8,388,608 |
| Conservative lifetime object slots | 8 | 20 |
| Known object records still retained | 0 | Not a reusable allowance |

Dashboard actions are not counted as programmatic requests. Cleanup does not reset experiment counters.
No interruption or stopped-run event appears in this live interval. The run reached normal cleanup.
No recovery command or repeat of the full experiment is required.
Keep the ignored local ledger and sanitized report. Do not recreate test keys or delete accounting history.
Unpinning from this account does not erase public IPFS caches.

## Lessons for the implementation

1. Pinata compatibility is sufficient to start building. Missing dashboard UI fields must not become implementation prerequisites.
2. Validate exact bytes and expected CID in application code. File visibility is not a substitute for content verification.
3. Numeric counters can remain unknown. Use fresh keys, bounded requests and successful controls for the small release checks.
4. Reject blank answers to confirmations that skip stages. Explain a skipped stage immediately.
5. Link operators to a report that exists. Do not ask them to inspect a final report before it has been written.
6. Invoke manual helpers relative to their own location, or state the required working directory explicitly.
7. Keep setup and publication keys private. Report only selected, sanitized results; crop dashboard key columns.
8. Stop expanding the experiment. Build the chosen server-side path and validate it through the real application.

The [decision](decision.md) is the current policy. The [next task](../../delivery/pinata-publication-task.md) carries it into implementation.
