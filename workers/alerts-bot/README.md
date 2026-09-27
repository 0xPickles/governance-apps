# Governance alerts bot

One Cloudflare Worker scans confirmed Ethereum events and routes five alert
domains to five Telegram chats. One Durable Object class is instantiated once
per domain:

| Domain | Object name | Contents |
| --- | --- | --- |
| stYFI | `alerts:styfi:v1` | stYFI and stYFIx |
| veYFI | `alerts:veyfi:v1` | legacy and migrated veYFI plus LLYFI |
| yETH | `alerts:yeth:v1` | recovery claims, withdrawals, and protocol updates |
| Teams | `alerts:teams:v2` | team lifecycle, accounting, funding, and bonuses |
| YBC | `alerts:ybc:v2` | on-chain proposals, membership, rewards, and collective power |

DAO remains an explicit disabled registry entry. Teams and YBC are active
domains whose committed production flags remain off pending private replay.

## Runtime model

- A one-minute cron invokes each enabled object independently.
- Each object owns one cursor, event receipts, Telegram backoff, and its chat.
- New objects begin at their domain's canonical start block. Replay and live
  alerts use the same scanner, exact-block context, renderer, and sender.
- User messages include the affected account's event-block position. They do
  not reconstruct balances from watched logs.
- Direct stYFI and LLYFI calls are attributed to the sender. Strict Safe
  `execTransaction` wrappers are attributed to the Safe only for zero-value
  calls to the expected protocol contract; other Safe wrappers fail closed.
  Other indirect LLYFI redemptions remain anonymous instead of guessing through
  router data. yETH claims use their indexed event account and vault companions
  without a transaction-envelope lookup.
- Telegram delivery is sequential, capped at five messages per domain run, and
  obeys Telegram's `retry_after` response.
- The only accepted duplicate window is Telegram accepting a message before
  the event receipt can be written.
- A cursor hash mismatch, malformed monitored event, unsupported action, or
  required context failure stops that domain at its saved cursor.

yETH claim and withdrawal messages are event-driven. Debt paydown is derived
from claim/accounting changes. Recovery and yield-capacity messages are
evaluated at one fixed 7,200-block checkpoint and sent only when their change
meets the configured threshold. There is no daily impact digest.
Canonical V3 report/fee mints and vault-owned profit-lock burns update the yETH
share ledger without creating user alerts. Deposits and withdrawals still
require their corresponding mint and burn events; standalone user burns fail
closed.

There is deliberately no health monitor or Telegram warning subsystem. Failures
produce structured logs and appear in the authenticated status response.
Failure logs identify the safe runtime stage and controlled RPC or Telegram
error metadata without including provider payloads, credentials, destinations,
message bodies, or account context. This can be revisited when DAO alerts add
stronger operational requirements.

## Configuration

Required secrets when any domain is enabled:

- `RPC_URL` (archive-capable; YBC additionally requires Geth-compatible
  `debug_traceTransaction` call traces with logs for non-pinned final-day votes)
- `TELEGRAM_BOT_TOKEN`
- `STYFI_TELEGRAM_CHAT_ID`
- `VEYFI_TELEGRAM_CHAT_ID`
- `YETH_TELEGRAM_CHAT_ID`
- `TEAMS_TELEGRAM_CHAT_ID`
- `YBC_TELEGRAM_CHAT_ID`
- `ADMIN_TOKEN` for `GET /status`

All domains are disabled in `wrangler.alerts.jsonc`. Enable them independently
with `ALERTS_STYFI_ENABLED`, `ALERTS_VEYFI_ENABLED`, `ALERTS_YETH_ENABLED`,
`ALERTS_TEAMS_ENABLED`, and `ALERTS_YBC_ENABLED` after their final private
chats, secrets, and replay reviews are ready.

The paid Workers plan removes the old free-tier pressure to micro-budget every
subrequest. The remaining bounds protect providers and Telegram without adding
a general request governor: 10,000-block log ranges, at most six ranges per
domain run, RPC batches of 25, and five Telegram messages per domain run.
Transaction call traces are capped at 8 MiB and are requested only when a
final-day YBC vote used an aggregator whose vote-time weight cannot be
reconstructed from the pinned wrapper's packing rule.
Configuration parsing requires exactly six confirmations and rejects overrides
above any of those range or message limits.

See [the operational runbook](../../docs/alerts-bot.md) and
[the approved message catalogue](../../docs/alerts-bot-message-catalogue.md).
Teams and YBC have a separate
[acceptance specification](../../docs/alerts-bot-teams-ybc-spec.md) and
[review ledger](../../docs/alerts-bot-teams-ybc-review-resolution.md).
