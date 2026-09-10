# DAO live services

DAO uses real clients when `NEXT_PUBLIC_USE_MOCKS=false`. Production always uses real clients.
`NEXT_PUBLIC_ENABLE_DAO` continues to gate all production DAO routes.

## Configuration

| Variable | Location | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_DAO_DEPLOYMENTS` | Build-time public configuration | Independently reviewed chain, Voting address, deployment block, genesis, active flag, and supported Voter, Executor and proposal-hook addresses |
| `NEXT_PUBLIC_RPC_URLS` | Build-time public configuration | App RPC for current reads, required simulation and receipts |
| `DAO_DATA_URL` | Server configuration | Static V2 feed; live endpoint: https://data.dao-ops.com/prod/dao.json |
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
The server requires a same-origin request, limits the body, validates the content, and rechecks its public forum topic.
It sends those bytes to `block/put` with raw CID encoding, SHA-256 and `pin=true`.
It verifies the returned CID and size, then retrieves the block separately and compares every byte.
The browser retrieves the same commitment before it enables creation.

`GET /api/dao-content?digest=<SHA-256>` retrieves and verifies the retained bytes.
Provider errors do not expose credentials or upstream response bodies.
The public error remains retriable with the same reviewed content.
The publication route requires the DAO feature gate. Same-origin validation prevents cross-origin browser uploads; it does not authenticate an uploader.
The operator must retain protected preview access until independent review approves public publication controls and the chosen service's limits.

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

Published review data and a submitted creation hash survive reloads in the same browser tab.
Wallet rejection and confirmed reverts retain the publication.
A known hash is confirmed again; it is not submitted again while the feed lags.
Only an exact proposal and Propose-log match completes indexing and retires that recovery record.
Another device, a cleared browser session or an unavailable wallet response needs manual transaction reconciliation.

The authoring UI currently creates content with an empty attachment manifest, as in the accepted product.
Existing read-only attachment handling and both wire schemas remain unchanged.
