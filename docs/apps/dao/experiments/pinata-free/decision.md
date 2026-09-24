# Pinata publication: implementation decision

Decision date: **2026-09-16**. The exploratory spike is closed.
The user authorized implementation after reviewing the first live run.
Use **server-side publication through Pinata's legacy file-upload endpoint** as the launch design.
This selects the implementation direction. It does not claim completed production acceptance or authorize deployment.

The [live review](live-review-2026-09-16.md) separates measured results from missing evidence.
The [implementation task](../../delivery/pinata-publication-task.md) defines the next work package.
This decision supersedes the earlier requirement to complete the full provider matrix before building.
It also supersedes the per-document operator approval requirement for the planned public publication flow.
Until the implementation changes it, the existing application still enforces that old grant policy.

## What the experiment established

- Five valid documents passed legacy upload, expected-CID comparison and exact-byte retrieval. They include Unicode and the 131,072-byte maximum.
- The modern endpoint also passed the small-document case. No broader modern compatibility claim is made.
- The API created all 15 test keys. Initial metadata verified their requested scopes, maximum uses and zero-use state.
- The selected generated key still uploaded after the operator confirmed revocation of the setup key.
- A two-use key accepted two uploads and rejected the third. Existing content remained retrievable.
- A second two-use key accepted one upload, then accepted one of two competing requests after a client restart.
- The observed file count stayed at seven across the checked duplicate upload.
- The unchanged producer retrieved exact bytes from the live gateway. Local restart/recovery and consumer rendering checks passed.
- Cleanup returned success for seven unique CIDs. The operator confirmed an empty account and revoked disposable keys.

These are observations from one bounded run. They are not general concurrency, retention or availability guarantees.

## What remains unknown

- Permission-isolation probes did not run. Their entry condition required a numeric dashboard counter that this account did not expose.
- Signed-upload tests also did not run. Signed URLs are outside the selected launch architecture.
- Post-revocation rejection, retrieval and replacement-key checks were skipped after an accidental blank confirmation.
- Independent retrieval through ipfs.io returned HTTP 429. Pinata's configured gateway returned the correct bytes.
- Failed-request use accounting, long-term retention and behavior at account exhaustion remain unproven.
- The oversized transport fixture was accepted. Application byte limits do not constrain direct use of a leaked provider credential.

The missing evidence does not block local implementation. A small set of credential checks belongs in final staging acceptance.
Do not reopen the complete experiment, require absent dashboard counters or silently mark skipped tests as passed.

## Selected product behavior

Keep the Markdown editor, standard template, preview, forum validation and separate publication/transaction steps.
Authors publish through the application. They do not supply provider keys, upload files elsewhere or seek approval of each document.
Onchain proposer eligibility and transaction authorization remain unchanged.

Use one private upload credential scoped to `pinning.pinFileToIPFS`.
Send canonical file bytes to `POST https://api.pinata.cloud/pinning/pinFileToIPFS` with CIDv1 and no directory wrapper.
Compare the returned CID with the locally expected CID. Retrieve and compare every byte before reporting publication success.
Do not use the JSON-upload endpoint or reserialize the canonical content through a provider SDK.
Public retrieval sends no provider credential. Fixed server configuration selects the endpoint and gateway.

Remove the per-document grant workflow from the public publication path.
Remove its extra challenge/signature step if it serves only that workflow. Do not alter wallet authorization for actual governance transactions.
Keep publication independently disabled by default until release configuration and acceptance are complete.

## Small, enforceable controls

- Enforce the existing 131,072-byte limit and canonical-content validation before provider calls.
- Reuse successful publications by digest. Coordinate concurrent requests and ambiguous retries across application instances.
- Apply configurable global time-window limits, a finite cumulative document/byte budget and bounded provider attempts.
- Use an existing suitable hosting primitive or one small durable store. Process-local counters alone cannot enforce global limits.
- Reuse the durable publication record for canonical-byte recovery where practical. Keep indexed producer content as additional retained evidence.
- Preserve drafts and publication identity after provider errors, wallet rejection, transaction failure and delayed indexing.
- Keep a switch that stops new publication without breaking DAO reads or valid governance actions.

The previous experiment's numerical policy was a proposal, not measured provider behavior or mandatory production configuration.
The implementation task carries initial application limits for review and explains the tradeoff when ordinary authors reach a limit.
No general quota service, provider framework, permanent fork or signed-URL subsystem is required.

## Acceptance and operations

In final staging validation, test the real application publication path with disposable content and a narrow key.
Verify that this key cannot delete an existing test document, then revoke it and confirm a subsequent upload is rejected.
Verify retained-content retrieval and publication with a replacement key.
Use a successful authorized control for the deletion check and a successful upload before revocation.
Keep these checks bounded. Numeric dashboard counters and explicit dashboard pin badges are not prerequisites.

The live walkthrough continues through local-fork proposal creation, receipt, producer indexing and actual application rendering.
All chain writes stay on the disposable fork. Public production transactions require separate authorization.

Do not describe a provider-key leak as harmless. Direct access can bypass application limits and disrupt the account.
Retain canonical bytes and a CID inventory. Document disabling publication, revoking/replacing the key and restoring content.
Free service has no retention guarantee established by this experiment. Record that limitation without inventing a ten-year promise.
Routine operation should need no per-document approval or frequent planned key rotation.

## Branch and integration plan

The application baseline is `agent/dao/m5/live` at `fc81ae0502efe45ed84367062a57df16c6dab46c`.
Start the implementation branch `codex/dao/m5/pinata` in `governance-apps.dao.m5.pinata` from that baseline.
Carry over this decision, the sanitized evidence and the implementation task only.
Do not merge the spike runner, its local configuration, generated bundle or ignored runtime directory into the application branch.

At this decision, `agent/integration` remains at `28dd8fff2e7ff00961174635715be8d18ecd8d42` and does not include M5 live.
The new work is intentionally stacked on M5 live. Review the new implementation and its inherited M5 behavior before integration.
Integrate the M5 dependency before or with the publication package. Do not duplicate M5 through an independent reimplementation.
Master/integration release reconciliation remains separate. No producer change is required by the measured content path.

Historical provider research and the original experiment plan remain in the spike's Git history at `82ae4c5503645e4560feba550b6f523b6234eff1`.
The retained spike is evidence, not an active production dependency or a request for more live runs.
