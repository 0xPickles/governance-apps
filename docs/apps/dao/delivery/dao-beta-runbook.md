# DAO feed V2 local review and later rollout runbook

> Historical V2 consumer review runbook. Use [local development](../local-development.md) and the [release checklist](../release-checklist.md) for current setup and operation. The host and fail-closed requirements below remain applicable.


This reset performs no deployment, feed publication or infrastructure change.
Existing production DAO flags remain off. Production runtime no longer permits
the former mock-beta exception; an enabled production review build uses only V2.
Historical M2 beta evidence remains in its acceptance ledger and evidence folders.

## Local consumer review

Use the package worktree from `scripts/workpkg-worktree.sh`, based on accepted
`agent/integration`. Follow AGENTS.md. Keep credentials private and use the
repository environment sync tooling.

- `npm run generate:dao-feed -- --check`
- `npm run typecheck`, `npm run lint`, `npm run test`
- `npm run test:e2e`, `npm run test:e2e:full -- --workers=1`
- `npm run test:e2e:dao-feed` builds a local production-runtime consumer with synthetic trusted deployments, then renders saved V2 responses through real routes and checks enabled GET/HEAD against a counted local upstream.
- `npm run test:e2e:dao-feed -- --disabled` builds the default gated production runtime and checks GET/HEAD 404 behavior for pages and `/api/dao-data`, security headers and the beta host. A configured local upstream must receive zero requests.
- Both production route runners perform a full Next production build; `npm run build` is also available for an ordinary build.
- `npm run validate:deps`, `git diff --check`
- `npm run measure:dao-feed` reports payload/schema size and parse/adapter cost.

The V2 route runner uses port 3131 by default and overrides only its child
process environment. It never publishes or enables a deployed flag. Browser
screenshots go to `delivery/evidence/feed-v2/screenshots`. Ordinary mock E2E
uses preview/development runtime and the shared test bridge.

## Configuration for a later reviewed environment

`DAO_DATA_URL` is a server-only fixed static feed URL consumed by
`/api/dao-data`; disabled production returns 404 before configuration or fetch. When enabled, absent configuration returns 503. Never accept this URL from
query parameters. Use HTTPS for a real remote endpoint. Both proxy and browser
bound decompressed response bytes to 32 MiB and total request/body time to ten
seconds, with no-store.

`NEXT_PUBLIC_DAO_DEPLOYMENTS` is an app-owned JSON array. Each entry has
chainId, lowercase votingAddress, decimal deploymentBlock, fixed genesis Unix
seconds, active boolean, supportedVoters and supportedExecutors address arrays.
Use the [synthetic example](../examples/feed-v2/deployments.example.json) only
for tests. Defaults are empty. Review actual source/deployment matches first;
Ethereum mainnet (chain 1) and up to eight distinct Voting deployments are supported;
other app chains are rejected because the shared RPC/explorer infrastructure is mainnet-only.
No feed entry authorizes a transaction destination.

`NEXT_PUBLIC_RUNTIME_MODE=production` with
`NEXT_PUBLIC_ENABLE_DAO=true` enables the reviewed read client only. Writes
remain explicitly disabled in the current implementation. No mock fallback or
DAO debug controls exist in production, even on beta hosts. Public environment
values are build-time configuration; changing them requires a reviewed rebuild.

## Later operator checks

Only after explicit approval, verify the exact immutable producer candidate,
chain/deployment configuration, complete acquisition, stable object ordering and
current RPC behavior. Disconnected reads must work without wallet RPC. Inspect
snapshot age, last-good/error recovery, content/script failures, zero identity,
unknown actors and newer live wallet observations on mobile/desktop/keyboard.

Historical logs must be retained or reacquirable from deployment inclusively.
Verify durable original scripts and proposal content independently of diagnostic
snapshot retention. Monitor required acquisition failure, canonical divergence,
stale feed/head, content availability, payload growth and live preflight errors.

The six exact governance beta hosts retain approved Cloudflare Access policies
for every path and approved GitHub organization/team access. Keep unrelated
accounts denied. No wildcard/public bypass is permitted. noindex/noncanonical
metadata is separate from authentication; a custom domain is not access control.
The shared preproduction flag is deployment-wide, not isolated to the DAO host.

R2 conditional writes/fencing, storage consistency versus edge-cache behavior
and immutable-candidate retry are producer acceptance requirements in the
[handoff](producer-handoff.md), not an R2 adapter to build here.

## Production gate and rollback

External consumer review → explicit producer-start approval → producer
implementation → actual-byte interoperability/staging → authorized write and
contract-executed lifecycle gates → explicit production approval.

Only the later rollout package may expose `dao.yearn.fi`, alter production
flags or update Snapshot-era links. A rollback disables exposure/actions while
retaining canonical event/script/content state. Never “recover” a production feed
outage by selecting the mock client. Record the deployed revision, validated
candidate and approved rollback procedure at that later gate.
