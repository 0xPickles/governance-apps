# veYFI App Docs

Scope: legacy veYFI migration and LLYFI tooling under `/veyfi`.

- User stories: [`user-stories.md`](user-stories.md)
- UI specification: [`ui-spec.md`](ui-spec.md)
- Telegram alerts: [message catalogue](../../alerts-bot-message-catalogue.md)
  and [operations](../../alerts-bot.md).

The veYFI bot covers sdYFI, supYFI, and coveYFI facility purchases and
redemptions, staking, cooldowns, and withdrawals, plus legacy veYFI lock changes
and migration. Purchases and redemptions through routers or Safe batches still
post when the trader cannot be identified; account position is shown as
unavailable. External DEX
trades and LLYFI reward claims are outside the bot's coverage.

Shared architecture and standards are documented in [`../../shared/README.md`](../../shared/README.md).
