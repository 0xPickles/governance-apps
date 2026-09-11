# DAO live services

DAO uses real clients when `NEXT_PUBLIC_USE_MOCKS=false`. Production always uses real clients.
`NEXT_PUBLIC_ENABLE_DAO` continues to gate all production DAO routes.

## Configuration

| Variable | Location | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_DAO_DEPLOYMENTS` | Build-time public configuration | Independently reviewed chain, Voting address, deployment block, genesis, active flag, and supported Voter, Executor and proposal-hook addresses |
| `NEXT_PUBLIC_RPC_URLS` | Build-time public configuration | App RPC for current reads, required simulation and receipts |
| `DAO_DATA_URL` | Server configuration | Static V2 feed; live endpoint: https://data.dao-ops.com/prod/dao.json |
| `DAO_PUBLICATION_ENABLED` | Private server configuration | Independent upload gate; absent or false disables publication even when DAO reads are enabled |
| `DAO_PUBLICATION_POLICY` | Private server configuration | Fixed operator-approved uploader/digest/byte grants with document and total-byte ceilings |
| `DAO_PUBLICATION_POLICY_FILE` | Loopback development only | Disposable local policy file; ignored in production and on public hosts |
| `DAO_IPFS_API_URL` | Server configuration | Base URL of an operator-selected Kubo-compatible raw-block API |
| `DAO_IPFS_AUTHORIZATION` | Private server secret | Full Authorization header value for that API; required for external services |
| `DAO_FORUM_TEST_ORIGIN` | Local test configuration only | Loopback fixture origin; rejected in production |

Store local server values in the ignored `.env.local`. Use private runtime secrets for the deployed Worker.
Public variables require a rebuild. Never put provider credentials in a `NEXT_PUBLIC_*` variable.

No external publication provider, credentials, retention policy or test target has been selected in this package.
The implemented adapter uses the standard raw-block API. Confirm compatibility with the selected service before rollout.
The task tested an offline local Kubo node. This does not establish external retention or availability.

## Publication and forum validation

The browser sends the exact reviewed canonical bytes to `POST /api/dao-content`.
The server first checks the independent publication gate, complete grant budget and uploader signature.
It then checks the exact authorized bytes and revalidates the public forum topic.
It sends those bytes to `block/put` with raw CID encoding, SHA-256 and `pin=true`.
It verifies the returned CID and size, then retrieves the block separately and compares every byte.
The browser retrieves the same commitment before it enables creation.

`GET /api/dao-content?digest=<SHA-256>` retrieves and verifies the retained bytes.
Provider errors do not expose credentials or upstream response bodies.
The public error remains retriable with the same reviewed content.
The publication route requires both the DAO gate and the independent publication gate.
Origin is a browser request check, not uploader authentication.
The approved uploader signs a message containing the origin, content digest, byte count, uploader address and server-issued time.
The signature expires after five minutes. It stays outside the canonical content document.
The current policy supports EOA signatures. Contract-wallet authorization requires a separately reviewed policy.

The operator approves a fixed set of exact content digests.
The complete grant set must fit both `maxDocuments` and `maxTotalBytes`.
Each grant contains `uploader`, `digest` and the exact `bytes` count.
Repeated requests can only pin the same raw CID; they cannot authorize another content document.
No process-local counter or resettable time window controls storage authorization.

Keep prior grants in the budget when authorizing additional content. Replacing a policy is an explicit operator budget decision.
This policy bounds authorized unique content, not provider request charges or storage already created outside this application.
A public service still requires operator approval of provider limits, retention and its complete grant set.
Keep preview access protected until that review is complete.

The author can download the exact reviewed content before requesting approval.
The app obtains a short-lived challenge, then requests the uploader signature.
Missing policy, an over-budget grant set, an unapproved digest or an invalid signature prevents all forum and pinning calls.

`GET /api/dao-forum?url=<topic URL>` checks a public Yearn Discourse topic.
It rejects credentials, suffixes, queries, fragments and ambiguous URL normalization.
It checks stable category IDs, names, slugs and ancestry under Proposals.
The normalized topic URL comes from the public topic response. The app never posts to the forum.

## Transactions and recovery

Domain clients read one canonical block, check current roles and commitments, and simulate the exact call.
Preparation is single-use. A changed account, network, trusted configuration, input or canonical head requires another review.
DAO simulation and receipt checks have no alternate-transport shortcut.
Receipt confirmation verifies success, sender, exact transaction input and destination, zero value, chain and canonical block.
Creation also decodes and validates the actual Propose event, including ID zero.

Published review data and submitted creation or action hashes survive reloads in the same browser tab.
Wallet rejection and confirmed reverts retain the publication.
A known hash is confirmed again; it is not submitted again while the feed lags.
Only an exact proposal and Propose-log match completes indexing and retires that recovery record.
Another device, a cleared browser session or an unavailable wallet response needs manual transaction reconciliation.

The authoring UI currently creates content with an empty attachment manifest, as in the accepted product.
Existing read-only attachment handling and both wire schemas remain unchanged.

## Bounded stream rejection

Declared and streamed body limits reject immediately. The 15-second deadline also rejects before cleanup.
Body cancellation is best-effort and never delays an error, including upstream HTTP failures.
A stalled cancellation cannot turn oversized or incomplete bytes into accepted publication content.

## Draft eligibility failures

A live eligibility failure leaves the active draft and review mounted for the same author.
Markdown, forum input, script and review confirmation remain intact.
Publication and proposal submission stay blocked until a fresh eligibility result permits them.

## Replacement and receipt recovery

A fee replacement is accepted only after its canonical mined transaction matches the original sender, nonce and exact prepared call.
Recovery, receipt decoding and feed matching then use the accepted hash.
A cancellation or changed call is a separate terminal outcome. The app retains its transaction link and does not infer a successful DAO action.

Ordinary actions save their hash and prepared call when the wallet returns.
Receipt timeouts retain an unknown receipt state and block another submission.
The user can retry confirmation after a temporary error or reload. Confirmation retries never send a transaction.
Confirmed actions remain separate from actions whose receipt is unknown.
An action leaves the awaiting-index state only after its matching event and receipt block appear in the feed.
