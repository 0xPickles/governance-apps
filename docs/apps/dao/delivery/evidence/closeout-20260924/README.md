# DAO acceptance closeout — 24 September 2026

Review base: `6f78a0840feafdb26e8256e7212529156beb6c72`, on `codex/dao/m5/pinata`.
The branch was clean at closeout start. Reviewed history remains intact.
The [September 23 acceptance record](../../../publication-acceptance-20260923.md) closes live publication acceptance.
[acceptance.json](acceptance.json) contains the independently checked saved-artifact comparisons, counters, identities, and checksum provenance.

## Corrections

- `86a4f4f`: ordinary head advancement permits at most two fresh preparations. Original observations must remain canonical and fresh.
  Eligibility, contract configuration, review inputs, identity, chain, and exact-call simulation are rechecked.
  `Voting.execute` receives a new block-bound preflight. Changed review facts require review; unstable preparation never sends.
  A submitted or uncertain wallet result cannot trigger an automatic resend. Publication and receipt recovery remain separate.
- `04519a4`: cleared field errors no longer trigger the global warning. Empty, unvalidated, pending, and invalid forum states are distinct.
  The manual browser follows its native viewport. No authoring layout redesign or governance control was removed.
- `1418375`: a bounded `.mjs` initializer replaces inline D1 setup. Fresh mode refuses existing directories; resume is read-only.
- `d4441d4`: three unchanged evidence JSON inputs became regression fixtures, and four duplicate passing logs were removed.
  The [maintenance inventory](../../historical-index.md) gives exact original Git paths. Historical manifests remain unchanged.

The runtime and test changes are represented by `d4441d4`; subsequent closeout changes update documentation and evidence.
Tests used isolated checkouts without private environment files, dummy publication credentials, local provider substitutes, and disposable forks.
No live Pinata request, production transaction, credential inspection, remote modification, merge, push, tag, or deployment occurred.

## Validation

| Check | Result |
| --- | --- |
| Typecheck and lint | Passed, no errors or lint warnings |
| Complete unit/integration suite | 1,478 tests across 157 files passed; repeated successfully after committing the final test and fixture tree |
| Focused preparation regressions | 30 passed, including all shared write paths, execution, epoch drift, canonical replacement, concurrency, and uncertain send |
| Before/after reproduction | The same five ordinary-advancement cases fail with the reviewed base's write implementation and pass with the correction |
| Initializer regression | Passed against a new disposable database; resume preserved database and ledger bytes |
| Authoring browser checks | Three viewports passed: 1280×720, 820×533, and 390×667 |
| Complete smoke suite | 44 passed; one existing production-only case skipped in mock mode and exercised by the disabled production run |
| Complete serial full suite | 37 passed in one run |
| Complete disposable fork suite | Seven passed in one run, including real creation/voting/execution, exact download, recovery, moderation, and canonicality |
| Production routes | Enabled: three passed, with its unconfigured-publication case exercised separately and passed; disabled: one passed, zero upstream requests |
| Production and Worker builds | Passed; publication client-isolation check passed for 227 artifacts |
| Worker size | 3,373.70 KiB gzip, below the existing 9,216 KiB budget |
| Generated feed, dependency policy, and production environment validator | Passed; the environment check used explicit dummy values and does not approve real release configuration |
| Cloudflare types | Clean-source generation matches the retained file byte-for-byte |
| Local documentation targets | Passed; external URLs and anchors are outside this check |

Use [local development](../../../local-development.md) and the [release checklist](../../../release-checklist.md) for reproducible commands.
The [validation metadata](validation.json) records commands, counts, source revision, and diagnostic log hashes.
The [artifact manifest](artifact-sha256.json) identifies the sanitized files in this record.
The fork suite used the existing contracts and test helper. Its successful run used a new fork of the documented public read-only RPC source.
The helper's test weight measure and local roles are fixture configuration, not production authorization.
Kubo ran offline in a separate container; no content was sent to Pinata.

Representative [desktop](authoring-desktop.png) and [mobile](authoring-mobile.png) captures show the complete mock form from the top.
The browser assertions separately scroll to and activate the final controls.
[Native-window measurements](native-viewport.json) reproduce the manual helper's viewport mismatch and its correction.

## Failures and reruns

1. The first native-window reproduction was blocked by the macOS sandbox. The isolated-browser rerun with local permission succeeded.
   The default viewport stayed 1280×720 inside an 820×620 window. Native mode reported 820×533 content and restored full access.
2. Initial typecheck found a widened address type in the new test. Lint found an unused mock parameter. Both were corrected.
3. Three new authoring tests initially selected Preview as a button rather than a tab.
   A second run incorrectly expected a disabled publication button; the existing guard displays an error after an unconfirmed click.
   A third run looked for the live-only download in mock mode. These test assumptions were corrected without changing application behavior or timeouts.
   The final tests assert the actual confirmation guard; the live fork case compares downloaded bytes with the retained published document.
4. The first fork run passed canonicality but failed six lifecycle cases after the retained upstream became unresponsive.
   A bounded read-only health request to port 18545 timed out. That operator process was left untouched.
5. The independent fork's first run passed five cases. Cold vote simulation and receipt reads exceeded the existing deadlines in two cases.
   Later read-only inspection found the vote successfully mined. The complete rerun against the cached independent fork passed all seven cases.
   No timeout, assertion, contract, or production freshness check was relaxed. Each disposable run kept its own D1 accounting.
6. Cloudflare type generation after a Worker build added references to `.open-next/worker`.
   Generation from a clean source checkout matched the retained types. The checked-in generated file was preserved.
7. The first documentation scan found six references to this record before it was written. The completed record resolves those targets.

Builds retain existing Next middleware and third-party bundling warnings. Tests report expected mock-environment and dummy wallet-configuration warnings.
These warnings did not fail their checks. Historical failures remain historical; they are not described as passing runs.

## Scope and remaining work

The external acceptance directories and all retained operator state were left unchanged.
The disposable closeout forks and offline Kubo container were stopped after testing; their test data was preserved.
The original Anvil, PID 49883 on port 18545, remains operator-owned and unchanged. Its final bounded read-only health check timed out.
No private browser or operator terminal was inspected or closed.
The [release checklist](../../../release-checklist.md) records genuine remaining configuration, independent approval, integration, and rollout requirements.
The 141/18 integration/master divergence remains separate release work.
