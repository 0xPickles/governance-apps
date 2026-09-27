# Yearn Builder's Collective

App name / slug: `ybc`
Route key: `/ybc`
Beta host: `ybc-beta.dao-ops.com`
Production host: `ybc.yearn.fi` (gated until fork smoke, preprod smoke, and
production approval)
Recommended display label: `Yearn Builder's Collective`

## Product summary

A governance and membership workspace for the Yearn Builder's Collective.

It covers collective voting power, membership, weight maturity, proposal lifecycle,
thresholds, execution timing, rewards, and scoped operator controls.

## Naming stance

- Keep the app slug stable as `ybc`.
- Keep the route stable as `/ybc`.
- Use `Yearn Builder's Collective` in product copy and headers.

This keeps routing, hostnames, and domain client keys durable even if the surface
grows.

## Route shell baseline

The shared-host route is `/ybc`. The route shell keeps the overview visible first,
then renders the governance command-center sections on one page. When discussion,
voting, or awaiting-execution proposals exist, the proposal feed appears above the
roster so actionable governance work is not buried. Proposal cards use disclosures:
short proposal lists stay open, while longer lists keep active/actionable proposals
open and collapse terminal history by default.

Default structure:

1. Overview summary
2. Priority proposal feed when proposals are actionable
3. Member roster table, with Cards available through a saved view toggle
4. Rewards
5. Operator panel, shown only for operator/admin perspectives

The overview has one authoritative headline metric, **Total collective voting
power**. It is the sum of current on-chain weight for active members; removed
members never contribute even if a feed retains their last nonzero weight.
Proposal links in the form `?proposal=<id>#proposals` open and focus the
matching proposal card; invalid IDs are removed from the URL and fall back to
`#proposals`. Telegram alert behavior is specified in
[`../../alerts-bot-teams-ybc-spec.md`](../../alerts-bot-teams-ybc-spec.md).

## Live data path

Production consumes `ybc.json` from `NEXT_PUBLIC_YBC_DATA_URL`; browsers use the
same-origin `/api/ybc-data` proxy. The feed owns historical member, proposal, vote,
weight, and reward display state.

The feed is display input, not deployment or write authority. The frontend pins the
Mainnet deployment, verifies the snapshot block and canonical proposal state, then adds
wallet-specific membership, voting, and action eligibility. Snapshot age is shown as
operational context, not used as an action cutoff. A refresh failure may leave the last
accepted snapshot visible with a compact warning. Canonical-chain, deployment, or live
wallet-state verification failures keep the affected actions disabled, and a rejected
payload must not replace accepted data.

Proposal writes use the shared transaction pipeline for propose addition, propose
expulsion, retract, vote, and execute. Feed rendering stays authoritative after a
transaction; the app waits for `gov-apps-stats` to publish indexed state instead of
inventing proposal rows or vote totals.

Member identity resolves in one order: a valid browser-local name, verified Mainnet
ENS, then a deterministic pseudonym. The canonical linked address always remains
visible. Clicking the resolved name opens the local editor; its secondary pencil
appears on fine-pointer hover or keyboard focus. Local names never leave the browser
or affect protocol actions.

Dates use the shared UTC formatter. Rewards continue to hand off to the shared stYFI
claim route. See [`ui-spec.md`](ui-spec.md) for product behavior and
[`onchain-integration-plan/ybc-feed-schema-v1.md`](onchain-integration-plan/ybc-feed-schema-v1.md)
for the feed contract.

## Debug runtime alignment

The default route keeps production copy. Observer, member, proposal, reward, loading,
empty, and operator states are seeded through the shared debug panel and E2E bridge.
Without an explicit preset, the view follows the active wallet.

## Included docs

- `docs/apps/ybc/ui-spec.md`
- `docs/apps/ybc/user-stories.md`
- `docs/apps/ybc/mock-data-schema-v1.md`
- `docs/apps/ybc/examples/mock-data.example.json`
- `docs/apps/ybc/onchain-integration-plan/README.md`
- `docs/apps/ybc/onchain-integration-plan/ybc-feed-schema-v1.md`
- `docs/apps/ybc/onchain-integration-plan/examples/ybc-feed.example.json`
