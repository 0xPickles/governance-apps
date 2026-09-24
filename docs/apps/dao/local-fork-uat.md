# DAO disposable fork UAT

For isolated setup and file-based D1 initialization, first read [local development](local-development.md).
Do not run this harness against retained acceptance state.

Run these commands from the `codex/dao/m5/pinata` package worktree.
The setup uses deployed mainnet contracts on a disposable local Anvil node.
It funds throwaway wallets, substitutes a constant weight measure, and assigns local operator and guardian roles.
Voting, Voter, Executor, blacklist and the reward hook remain deployed contracts.
The helper also provides a marker that an executable proposal can set to 42.

The generated deployment configuration is local test evidence. It is not an independently reviewed production allowlist.
Historical M5 validation could not reach its configured upstream at `http://127.0.0.1:8546`.
The successful fork used the public viem mainnet default, `https://ethereum.reth.rs/rpc`, for upstream reads.

## Start and test

Prerequisites: the repository's Node/npm toolchain, Anvil, uv and Docker.
The scenario command runs Vyper 0.4.2 through uvx. It adds no application dependency.

Start the fork in one terminal. Choose an available upstream in the private `DAO_FORK_SOURCE_RPC` variable or the copied RPC configuration.

```fish
npm run dao:fork
```

For the public upstream used in this task:

```fish
env DAO_FORK_SOURCE_RPC=https://ethereum.reth.rs/rpc npm run dao:fork
```

Start a disposable offline content node, then prepare the fork:

```fish
docker run --detach --name governance-dao-pinata-uat --publish 127.0.0.1:15001:5001 --publish 127.0.0.1:18080:8080 --env IPFS_PROFILE=test ipfs/kubo:v0.40.1 daemon --offline
npm run dao:scenario -- setup
npm run test:e2e:dao-live
```

If the named disposable container already exists, inspect it before reuse.
The inherited Kubo container and its volume are not modified by this package.
Keep it offline. These tests require no public content pin or forum post.

The browser runner starts the app on port 3310 and local feed/forum fixtures on port 18546.
It injects a throwaway wallet that sends every RPC request to the local fork.
It sets `NEXT_PUBLIC_USE_MOCKS=false` and `NEXT_PUBLIC_E2E=false`.
The accepted mock bridge is not involved.
The real publication route reserves content in local D1 and calls a loopback Pinata-compatible seam.
The seam stores raw blocks in offline Kubo. It is not live Pinata evidence.
No document grant or publication wallet signature is needed.
The app preserves local D1 counters across restarts. Default limits allow two new documents per hour.
Repeated publication of verified bytes uses the existing record.
Use `DAO_PUBLICATION_LOCAL_STATE` for a distinct disposable test ledger, never to reset a release budget.

Run one scenario visibly, with the Playwright inspector available for manual interaction:

```fish
npm run test:e2e:dao-live -- --headed --debug --grep "publishes exact"
npm run test:e2e:dao-live -- --headed --grep "submits flag"
```

The browser clock follows each fork checkpoint through Playwright.
Production freshness and canonicality checks remain unchanged.
A normal browser uses wall-clock time and will correctly reject a fork that has moved weeks into the future.
Use the headed runner for time-travel UAT.

For disconnected live-feed inspection through the actual app proxy:

```fish
npm run test:e2e:dao-live-feed
```

This command performs read-only requests to the live producer.
It uses the generated local deployment configuration for this test and does not approve production configuration.

## Scenario controls

State and saved JSON live in `/tmp/governance-dao-uat`.
Use `DAO_FORK_DIR` to select another temporary directory.
Use `DAO_FORK_RPC`, `DAO_FORK_PORT`, `DAO_LOCAL_SERVICES_PORT` and `E2E_PORT` when the default local ports are occupied.

```fish
npm run dao:scenario -- status
npm run dao:scenario -- reset
npm run dao:scenario -- propose /absolute/canonical-content.json signal
npm run dao:scenario -- propose /absolute/canonical-content.json /absolute/script.hex
npm run dao:scenario -- record 0xTRANSACTION_HASH /absolute/canonical-content.json
npm run dao:scenario -- phase vote 0
npm run dao:scenario -- vote 0
npm run dao:scenario -- replace 0 0
npm run dao:scenario -- replace 0 0 0
npm run dao:scenario -- phase execute 0
npm run dao:scenario -- execute 0
npm run dao:scenario -- fixture
```

`retract 0`, `flag 0 REASON` and `veto 0 REASON` select the corresponding lifecycle action.
`mine` confirms another block.
`reset` returns to the prepared empty deployment. Close the prior browser session after a reset; its saved receipts belong to the previous branch.
Restart Anvil and run `setup` if the snapshot is lost.

`record` verifies a successful canonical receipt and its original proposal commitments.
It records only known scenario transactions. It does not scan or emulate a general indexer.
`fixture` independently reads stored totals, flags, status and configuration and checks proposal counts and script hashes.
It writes a saved V2 file only after those checks pass.

Refreshing this saved file is not proof of producer indexing.
The creation test deliberately retains the old file while it checks receipt identity and reload recovery.
The replacement command impersonates the configured Voter only on Anvil; the public Voter still permits one user vote.
Its optional final argument is the contribution scale in basis points. Zero replaces the contribution with zero weight.
`expect-execute-revert 0` asserts a real reverted local receipt without accepting an executed state.

For a normal local app session:

```fish
npm run dao:local
```

This serves the saved scenario file and local forum responses.
For manual authoring, publish directly from the reviewed editor state.
The app applies the same durable admission policy as the public path.
The obsolete `grant` command and policy file are removed.

Use only throwaway accounts from the disposable Anvil node.
The scripts reject transaction RPC URLs outside loopback and verify the Anvil client and chain before writes.

## Required publication producer checkpoint

The released binary accepts:

```fish
env DAO_RPC_TRANSPORT=http DAO_RPC_URL=http://127.0.0.1:18545 /absolute/gov-apps-dao local /absolute/temporary-config.json /absolute/temporary-state /absolute/producer-feed.json
```

Use temporary state and reviewed identity fields appropriate to the fork.
A real producer acquisition is distinct from `fixture`.
Do not change the producer or production clock checks to accommodate future fork timestamps.
To retrieve published content, set a positive `limits.contentRequests` value in the temporary producer configuration.
Set `DAO_CONTENT_GATEWAY` to an approved gateway base URL ending in `/ipfs/`.
For the offline local node, expose its native gateway only on loopback port 18080.
The disposable container command already exposes this gateway.

```fish
env DAO_RPC_TRANSPORT=http DAO_RPC_URL=http://127.0.0.1:18545 DAO_CONTENT_GATEWAY=http://127.0.0.1:18080/ipfs/ /absolute/gov-apps-dao local /absolute/temporary-config.json /absolute/temporary-state /absolute/producer-feed.json
```

Use a fresh state file after a fork reset. Recreate a proposal with the UI-published bytes, then mine a confirmation block.
Verify the producer's decoded `contentBytes` against `/tmp/governance-dao-uat/ui-content.json`.
To display this producer output through the real app, copy it without modification to the local feed path:

```fish
cp /absolute/producer-feed.json /tmp/governance-dao-uat/feed.json
env DAO_UAT_PRODUCER_CHECKPOINT=true DAO_EVIDENCE_DIR=/tmp/dao-producer-evidence E2E_PORT=3310 E2E_WEB_SERVER_COMMAND="node scripts/dao-local-app.mjs" npx playwright test --project=dao-live-feed --workers=1 --grep "published bytes"
```

This browser check expects proposal zero and the content created by the `publishes exact` UI scenario.
It checks actual app responses and rendered content without wallet RPC or mocked feed responses.
The publication package requires this checkpoint. Ordinary saved-fixture checks remain independent.
`DAO_EVIDENCE_DIR` selects retained browser captures. Without it, captures go to the current test output directory.

The [original evidence](delivery/evidence/m5-live/README.md) and [review-fix evidence](delivery/evidence/m5-live-review/README.md) record what actually ran.

## Stop

Stop the local app and Anvil terminals with Ctrl-C.
Stop the disposable content node with `docker stop governance-dao-pinata-uat`.
If the temporary gateway container is running, stop it with `docker stop governance-dao-live-gateway`.
Retain its container for local pin checks, or remove it when that test content is no longer needed.
No command in this runbook publishes an app, merges a branch, or posts a forum topic.

## Live-provider release session

Use [the small operator procedure](pinata-acceptance.md) only after separate authorization.
It keeps the local fork, uses fresh upload-only keys, and enforces its own persistent small budget.
No authenticated provider request is part of ordinary local UAT.
