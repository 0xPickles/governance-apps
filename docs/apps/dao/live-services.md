# DAO live services

DAO uses real clients when `NEXT_PUBLIC_USE_MOCKS=false`. Production always uses real clients.
`NEXT_PUBLIC_ENABLE_DAO` gates DAO routes. `DAO_PUBLICATION_ENABLED` independently gates new uploads and defaults to false.
Use the [canonical preprod procedure](preprod-validation.md) for the reviewed mainnet JSON, shared publication infrastructure, and ordered operator steps.

## Publication

The implemented path uses server-side Pinata legacy file upload with one private upload-only JWT.
Public D1 admission replaces document grants and publication-only signatures.
The author keeps the editor, template, preview, forum validation, and separate onchain transaction.
The server validates canonical bytes, digest, raw CID, provider identity, and exact gateway retrieval before success.
Success also requires a recorded upload acknowledgement. A rejected or uncertain upload consumes another bounded upload attempt on retry.
Acknowledged uploads retry gateway retrieval without reuploading.

[Publication operations](pinata-publication.md) defines configuration, atomic budgets, retries, backup, key replacement, and rollback.
[Publication acceptance](publication-acceptance-20260923.md) records the completed 23 September follow-up.
[Closeout validation](delivery/evidence/closeout-20260924/README.md) records the subsequent offline checks.
[Publication review correction](delivery/evidence/m5-pinata-review/README.md) tracks the acknowledgement requirement and its regression results.
Historical grant and Kubo evidence remains historical. Those settings are obsolete for production.

## Other service configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_DAO_DEPLOYMENTS` | Independently reviewed chain, Voting, deployment block, genesis, and supported hook addresses |
| `NEXT_PUBLIC_RPC_URLS` | Current reads, required simulation, and receipts |
| `DAO_DATA_URL` | Static V2 feed. Live source: https://data.dao-ops.com/prod/dao.json |
| `DAO_FORUM_TEST_ORIGIN` | Loopback forum fixture, rejected in production |

`GET /api/dao-forum?url=...` retains public topic, category, and ancestry validation.
The app never posts to the forum. Provider credentials stay in deployment secrets.

Forum, Pinata upload, and gateway requests use `redirect: "manual"` and reject every non-2xx response.
The repository's Worker runtime rejects `redirect: "error"` before it sends a request.
That option caused valid topics to return `FORUM_UNAVAILABLE` and also blocked publication requests.
Manual redirect handling preserves mandatory validation and prevents credential forwarding.

## Transactions and recovery

Domain clients read one canonical block, check current roles and commitments, and simulate the exact call.
Preparation is single-use. A newer head can trigger at most two fresh preparations before wallet submission.
Each preparation repeats the live reads and exact-call simulation at its own canonical block.
This includes actual `Voting.execute`; an earlier execution simulation cannot authorize a later block.
The original observed block must remain canonical and fresh throughout preparation.
Changed eligibility, review facts, account, network, trusted configuration, or inputs require another review.
Repeated advancement stops with a preparation message. No transaction was submitted in that case.
Once the wallet send starts, this preparation never sends again, even if its result is uncertain.
DAO simulation and receipt checks have no alternate-transport shortcut.
Receipt confirmation verifies success, sender, exact transaction input and destination, zero value, chain and canonical block.
Creation also decodes and validates the actual Propose event, including ID zero.

Unpublished reviews, published review data, and submitted creation or action hashes survive reloads in the same browser tab.
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
