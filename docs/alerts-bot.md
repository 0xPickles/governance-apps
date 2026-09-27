# Governance alerts bot runbook

## Scope

This runbook covers `governance-alerts-bot-v2`, the five-domain replacement
for the live `governance-alerts-bot` singleton. The v2 Worker owns five
independent Durable Object instances and five Telegram destinations. It does
not migrate or adopt the old singleton's cursor.

The two Workers run side by side while the v2 histories are replayed and
reviewed privately. The old Worker continues serving its existing combined
chat until an explicit cutover. `governance-alerts-bot-v2` is the permanent
production identity after cutover; it must not be renamed back to the old
Worker name.

No command in this document should be run against production until the code
review and local verification gates pass.

## Production shape

| Worker | Purpose during rollout | Destination |
| --- | --- | --- |
| `governance-alerts-bot` | Existing live singleton; leave unchanged | Existing combined chat |
| `governance-alerts-bot-v2` | New permanent Worker; replay privately | Five final domain chats |

| Domain | Durable Object | Telegram destination | Start block |
| --- | --- | --- | ---: |
| stYFI | `alerts:styfi:v1` | final private stYFI chat | 24,386,915 |
| veYFI | `alerts:veyfi:v1` | final private veYFI chat | 24,386,915 |
| yETH | `alerts:yeth:v1` | final private yETH chat | 24,522,098 |
| Teams | `alerts:teams:v2` | final private Teams chat | 25,244,861 |
| YBC | `alerts:ybc:v2` | final private YBC chat | 25,228,044 |

Each object stores one versioned state record and immutable event receipts. The
state contains the cursor and terminal hash, redacted run status, Telegram
backoff, yETH accounting where relevant, and domain replay state for Teams and
YBC. It does not contain chat IDs,
tokens, endpoints, warning leases, migration phases, or rollback generations.

## Configuration

Set these as Cloudflare secrets, never as committed values:

- `RPC_URL`: archive-capable Ethereum RPC. It must also support Geth-compatible
  `debug_traceTransaction` with `callTracer` and `withLog` before YBC is enabled;
  final-day votes through a non-pinned aggregator require that evidence.
- `TELEGRAM_BOT_TOKEN`.
- `STYFI_TELEGRAM_CHAT_ID`.
- `VEYFI_TELEGRAM_CHAT_ID`.
- `YETH_TELEGRAM_CHAT_ID`.
- `TEAMS_TELEGRAM_CHAT_ID`.
- `YBC_TELEGRAM_CHAT_ID`.
- `ADMIN_TOKEN`: bearer token for `GET /status`.

The committed variables are deliberately inert:

```text
ALERTS_STYFI_ENABLED=false
ALERTS_VEYFI_ENABLED=false
ALERTS_YETH_ENABLED=false
ALERTS_TEAMS_ENABLED=false
ALERTS_YBC_ENABLED=false
CONFIRMATIONS=6
MAX_MESSAGES_PER_RUN=5
MAX_RANGES_PER_RUN=6
LOG_RANGE_SIZE=10000
YETH_DAILY_CHECKPOINT_BLOCKS=7200
YETH_DAILY_MIN_DELTA_ETH=0.5
```

An enabled domain without its chat ID fails closed. If no domains are enabled,
the cron performs no RPC or Telegram work.

## Rate and capacity choices

The Worker now runs on Cloudflare's paid plan. It therefore uses simple bounds
instead of the old free-tier request ledger:

- one cron invocation per minute;
- up to six 10,000-block ranges per domain run while catching up;
- log-range halving only when the RPC explicitly rejects the range size;
- block headers loaded only for event blocks and range terminals, not every
  block in a range;
- exact-block RPC batches limited to 25 calls;
- log-aware transaction traces limited to 8 MiB and requested only for
  final-day YBC votes through a non-pinned weight aggregator;
- five Telegram messages per domain run, sent in order about 1.1 seconds apart;
- persisted Telegram `retry_after` backoff.

These settings catch up quickly without doing repeated head scans or consuming
capacity that has no user benefit.

The parser treats these as safety limits, not suggestions. Confirmations must
equal six. Environment overrides above five messages, six ranges, or 10,000
blocks per range are rejected before a domain can run.

Before enabling YBC, exercise `debug_traceTransaction` against the configured
provider during the private historical replay. The response must use the Geth
`callTracer` shape and include logs with `index` and `position`. An unsupported
method, ignored `withLog` option, malformed positional data, or trace above the
8 MiB limit stops YBC at its saved cursor. Do not substitute a block-level
`eth_call`: it cannot recover state at a transaction position within the block.

## yETH cadence

Y1–Y4 are emitted from claim and withdrawal events. Y5 is derived when those
events reduce outstanding recovery debt. Y6–Y9 are evaluated once per fixed
7,200-block checkpoint. The scanner does not inspect every block for protocol
metric changes.

The Recovery Vault can mint and burn vault-owned shares without `Deposit` or
`Withdraw` events during canonical V3 report, fee, and profit-locking
accounting. These events update the internal share ledger but do not produce a
user alert. Every `Deposit` must still have its matching share mint, every
`Withdraw` must still have its matching burn, and a standalone user share burn
fails closed.

The committed daily materiality threshold is 0.5 ETH. This matches the
accounting layer's candidate floor; smaller checkpoint changes do not
accumulate after the daily baseline advances. Before yETH is opened to users,
review the complete replay history and the structured
`alert_yeth_daily_checkpoint` records. Those records include every candidate
delta and whether the configured threshold emitted it. If the private replay is
too noisy, evaluate 1 ETH before considering a larger threshold. A threshold
change must update the catalogue examples and focused tests. The first
checkpoint establishes a baseline and sends no protocol message.

## Status and failures

`GET /status` requires:

```text
Authorization: Bearer <ADMIN_TOKEN>
```

It returns only redacted domain state: cursor, cursor hash, last observed
confirmed head, caught-up state, last run and success times, last error code,
and Telegram backoff expiry. A saved run error makes `caughtUp` false. Failures
after fetching the chain head retain that head without advancing the cursor.

There is no automatic health monitor in this release. During replay and the
first production week, check status and structured logs manually. A scanner,
context, rendering, cursor-hash, RPC, or Telegram failure leaves the domain at
its saved cursor for retry. Unknown monitored data is never silently skipped.

An `alert_run_failed` log includes a controlled `stage` such as `head`, `scan`,
`render`, `telegram_send`, `receipt_write`, or `state_commit`. RPC failures add
only the method, failure kind, HTTP status, and RPC code. Telegram failures add
only the HTTP status, Telegram error code, and controlled failure kind. Raw
exception messages, provider response bodies, RPC URLs, credentials, chat IDs,
message bodies, and account context are never logged.

Teams and YBC scanner failures additionally retain bounded canonical evidence:
the controlled reason, contract, block number, transaction hash, and event name
when known. These fields are format-validated before logging and never contain
provider text.

Direct stYFI and LLYFI calls are attributed to their sender. Canonical Safe
`execTransaction` wrappers are accepted only for a zero-value `CALL` to the
expected protocol contract and are attributed to the Safe. LLYFI buys and
redemptions through Safe batches or other indirect routes use the catalogue's
anonymous position variant. Their confirmed facility events prove the trades;
the bot does not infer the end user from the outer transaction sender. An
explicitly missing transaction lookup uses the same fallback. Failed RPC
requests, malformed Safe calldata, or contradictory transaction data still stop
processing. stYFI exit attribution remains strict.

yETH claims use the indexed Claim account as principal and derive stayed versus
exited from the Claim values and mandatory Recovery Vault companions. They do
not perform a transaction lookup, so direct calls, Safe batches, and
claim-and-distribute contracts share the same event-evidence path.

## Local release gates

Run at minimum:

```bash
npm run typecheck -- --incremental false
npm run lint
npm run validate:deps
npm run test
npm run alerts:catalogue-examples
npx wrangler deploy --dry-run --config wrangler.alerts.jsonc
git diff --check master...
```

The dry run must not deploy. Confirm that all five enable flags remain false
and that the working tree is clean after the release commit.

The Worker compatibility date was reviewed and advanced on 3 September 2026.
Review it at least quarterly. Before each update, inspect the Cloudflare
compatibility changes since the pinned date. Run this complete gate before
deployment and repeat the private replay before public enablement.

## Bounded rollout

Run the private rollout from the clean `agent/data` worktree. Do not merge the
rebuild into `master` until all five replay histories and the private live
behavior have been approved. Confirm the branch, commit, and configured Worker
identity before every deploy:

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.data
git status --short
git branch --show-current
git rev-parse HEAD
rg '"name"|"ALERTS_.*_ENABLED"' wrangler.alerts.jsonc
npx wrangler whoami
```

The branch must be `agent/data`, the name must be
`governance-alerts-bot-v2`, and all five flags must initially be `false`.

### 1. Prepare final destinations

1. Create the final stYFI, veYFI, yETH, Teams, and YBC Telegram chats and keep them private.
2. Add the bot to each chat with permission to post.
3. Record the five final chat IDs. Never use the old combined chat ID for a v2
   destination.

Do not replay into a temporary chat and then change its destination. Event
receipts belong to the final destination history.

### 2. Deploy v2 inert

Run the local release gates, then create the separate Worker while every domain
is disabled:

```fish
npx wrangler deploy --dry-run --config wrangler.alerts.jsonc
npx wrangler deploy --config wrangler.alerts.jsonc
```

The deploy output must identify `governance-alerts-bot-v2`. At this point the
old `governance-alerts-bot` continues running unchanged, and v2 performs no RPC
or Telegram work.

### 3. Configure v2 secrets

Wrangler prompts for each value without writing it to the repository:

```fish
npx wrangler secret put RPC_URL --config wrangler.alerts.jsonc
npx wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.alerts.jsonc
npx wrangler secret put STYFI_TELEGRAM_CHAT_ID --config wrangler.alerts.jsonc
npx wrangler secret put VEYFI_TELEGRAM_CHAT_ID --config wrangler.alerts.jsonc
npx wrangler secret put YETH_TELEGRAM_CHAT_ID --config wrangler.alerts.jsonc
npx wrangler secret put TEAMS_TELEGRAM_CHAT_ID --config wrangler.alerts.jsonc
npx wrangler secret put YBC_TELEGRAM_CHAT_ID --config wrangler.alerts.jsonc
npx wrangler secret put ADMIN_TOKEN --config wrangler.alerts.jsonc
```

Each `secret put` creates a Worker version. This is safe only because all five
domain flags remain disabled.

Use the `workers.dev` URL printed by the deploy command to verify the redacted
status response:

```fish
set alerts_v2_url 'https://governance-alerts-bot-v2.<workers-subdomain>.workers.dev'
read --silent --prompt-str 'v2 ADMIN_TOKEN: ' alerts_v2_admin_token
curl --fail --silent --show-error \
  --header "Authorization: Bearer $alerts_v2_admin_token" \
  "$alerts_v2_url/status" | jq
set -e alerts_v2_admin_token
```

Keep a second terminal available for structured logs:

```fish
npx wrangler tail governance-alerts-bot-v2 --format pretty
```

### 4. Replay stYFI

Change only `ALERTS_STYFI_ENABLED` to `true` in `wrangler.alerts.jsonc`, review
the diff, commit the operational change, and redeploy:

```fish
git diff --check
git diff -- wrangler.alerts.jsonc
git add wrangler.alerts.jsonc
git commit -m "chore(alerts): enable stYFI v2 replay"
npx wrangler deploy --config wrangler.alerts.jsonc
```

The new stYFI object starts at block 24,386,915. Poll the authenticated status
route until stYFI reports `caughtUp: true`. Review the entire private history,
links, ordering, amounts, account context, and formatting. Pin the approved
stYFI introduction manually only after acceptance.

### 5. Replay veYFI

Leave stYFI enabled, change only `ALERTS_VEYFI_ENABLED` to `true`, then repeat
the review, commit, and deploy sequence:

```fish
git diff --check
git diff -- wrangler.alerts.jsonc
git add wrangler.alerts.jsonc
git commit -m "chore(alerts): enable veYFI v2 replay"
npx wrangler deploy --config wrangler.alerts.jsonc
```

Wait for veYFI to report `caughtUp: true`, approve its complete private
history, and then pin its introduction.

### 6. Replay yETH

Leave stYFI and veYFI enabled, change only `ALERTS_YETH_ENABLED` to `true`, then
commit and deploy:

```fish
git diff --check
git diff -- wrangler.alerts.jsonc
git add wrangler.alerts.jsonc
git commit -m "chore(alerts): enable yETH v2 replay"
npx wrangler deploy --config wrangler.alerts.jsonc
```

Wait for yETH to report `caughtUp: true`. Review Y1–Y5, every structured
`alert_yeth_daily_checkpoint` record, and the complete set of daily checkpoint
candidates before accepting the 0.5 ETH threshold. Pin the yETH introduction
only after approval.

### 7. Replay Teams

Leave the accepted domains enabled, change only `ALERTS_TEAMS_ENABLED` to
`true`, commit, and deploy. Wait for Teams to report `caughtUp: true`, then
review every T1–T16 message, companion-log failure, team link, and zero/no-op
suppression result. Pin the Teams introduction only after the replay is
accepted.

### 8. Replay YBC

Change only `ALERTS_YBC_ENABLED` to `true`, commit, and deploy. Wait for YBC to
report `caughtUp: true`, then review every B1–B14 message, same-block vote
ordering, multi-team bonus pairing, collective-power checkpoint, and proposal
link. Pin the YBC introduction only after the replay is accepted.

### 9. Observe privately

Keep both Workers live briefly after all five v2 domains are caught up. They
scan the same chain but deliver to different chats: the old Worker protects
existing coverage while the final v2 histories remain private.

Do not merge to `master` until the replay histories, live messages, status, and
structured logs have been accepted.

### 10. Promote the approved release and cut over

Once private testing is approved, fast-forward `master` to the accepted
`agent/data` commit from the master worktree, rerun the release gates, and
redeploy the same v2 configuration:

```fish
cd /Users/hydra/Developer/yearn/governance-apps
git status --short
git merge --ff-only agent/data
npm run typecheck -- --incremental false
npm run lint
npm run validate:deps
npm run test
npx wrangler deploy --dry-run --config wrangler.alerts.jsonc
npx wrangler deploy --config wrangler.alerts.jsonc
```

This redeploy targets the existing `governance-alerts-bot-v2` Worker. Its
Durable Object state, receipts, cursors, and secrets remain in place. Confirm
all five domains still report `caughtUp: true` before disabling the old
Worker.

Immediately before cutover, confirm all five v2 domains are caught up and have
recent successful runs. Then disable the old singleton using its existing
authenticated endpoint:

```fish
set alerts_v1_url 'https://governance-alerts-bot.<workers-subdomain>.workers.dev'
read --silent --prompt-str 'v1 ADMIN_TOKEN: ' alerts_v1_admin_token
curl --fail --silent --show-error --request POST \
  --header "Authorization: Bearer $alerts_v1_admin_token" \
  "$alerts_v1_url/admin/disable"
set -e alerts_v1_admin_token
```

Confirm the response is `disabled`, the old chat stops receiving alerts, and
v2 continues processing. Pin a redirect in the old chat, then invite users to
the five new chats.

Keep the old Worker deployed but disabled through the first production week.
Retiring or deleting it is a separate destructive operation and is not part of
this rollout.

## Rejecting a replay

If reviewers reject a private chat's history:

1. Disable that domain.
2. Keep the destination private and remove the rejected bot messages from its
   Telegram history. Creating a new chat remains an option, but is not required.
3. Bump only that domain's versioned object name in a reviewed commit and deploy
   it while the domain remains disabled.
4. When reusing the same chat, leave its chat-ID secret unchanged. Update the
   secret only when moving to a different chat.
5. Re-enable the domain and replay from its canonical start block. Verify the
   status identifies the new object generation before accepting the replay.

Do not add a reset endpoint or mutate production Durable Object storage to
force a replay. A new versioned object is simpler and leaves an auditable path.
The prior object and its receipts remain isolated and cannot suppress messages
sent by the new replay.

## Pause and recovery

Set a domain's enable flag to `false` and redeploy to pause it. Its cursor and
receipts remain intact. Re-enabling resumes from that cursor.

The old singleton and v2 may deliver concurrently only during private replay,
when their destinations are distinct. Never point a v2 domain at the old
combined chat.

To roll back after cutover, first call the old singleton's authenticated
`/admin/enable` endpoint so legacy coverage resumes immediately. Then set all
five v2 enable flags to `false` and redeploy v2. A brief overlap across distinct chats
is preferable to a delivery gap. Do not call either old reset endpoint.

The duplicate window after Telegram accepts a message but before its receipt is
written cannot be removed without an external transactional sender. If it
occurs, keep the duplicate in history or remove it manually after comparing the
transaction link and block.
