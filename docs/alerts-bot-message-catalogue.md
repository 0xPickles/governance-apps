# Governance alerts message catalogue

Status: **Approved for implementation on 27 August 2026.**

This document specifies the original stYFI, veYFI, and yETH Telegram messages
for `governance-alerts-bot-v2`, including historical replay from each stream's
start block.

The implemented Teams and YBC extension is specified in
[`alerts-bot-teams-ybc-spec.md`](alerts-bot-teams-ybc-spec.md).

The examples use fictional accounts, amounts, blocks, dates, and transaction
hashes. They show the intended visible Telegram output. The implementation may
use Telegram HTML to produce the bold text and links.

## 1. Channel and Durable Object routing

| Alert stream | Telegram destination | Durable Object instance | Included products |
| --- | --- | --- | --- |
| stYFI | stYFI alerts chat | `alerts:styfi:v1` | stYFI and stYFIx |
| veYFI | veYFI alerts chat | `alerts:veyfi:v1` | Legacy veYFI, migrated veYFI, sdYFI, supYFI, and coveYFI |
| yETH | yETH alerts chat | `alerts:yeth:v1` | yETH claims and Recovery Vault activity |
| Teams | Teams alerts chat | `alerts:teams:v2` | Team registry, budgets, accounting, and revenue routing |
| YBC | YBC alerts chat | `alerts:ybc:v2` | On-chain proposals, membership, rewards, and collective voting power |

The Worker runs all five objects independently. Each object owns its cursor,
event receipts, Telegram backoff, and destination. Teams and YBC message rules
and exact fixtures are defined in the linked extension specification.

DAO alerts remain outside this catalogue and their extension seam stays
disabled. Teams and YBC are implemented but remain disabled until their private
replays are reviewed and accepted.

## 2. Approved product decisions

- Use **stake**, **staked**, and **unstake** for stYFI and stYFIx. This matches
  the application UI.
- Route LLYFI activity to the veYFI chat.
- Replay each stream from its configured start block into a new private chat.
- Use the same templates for replay and live alerts.
- Keep the new chats private until replay reaches the confirmed chain head and
  reviewers approve the result.
- Evaluate Y6–Y9 once per 7,200-block checkpoint and emit a candidate when the
  relevant shortfall or vault-assets change is at least 0.5 ETH. Smaller
  changes do not accumulate after the checkpoint baseline advances.
- Do not send a daily impact digest.
- Do not post synthetic `initialized` alerts during replay. Use one pinned
  channel introduction instead.
- Do not post a separate legacy veYFI penalty alert when the withdrawal message
  already includes the penalty.

## 3. Common message rules

### 3.1 Message order

User-action alerts use this order:

1. Action title.
2. Amount moved and outcome.
3. Fee, timing, or recipient when relevant.
4. Principal account.
5. Account position after the event.
6. Optional protocol context.
7. Transaction, block, and UTC time.

Protocol-state alerts use this order:

1. State-change title.
2. Main change.
3. Current state.
4. Cause breakdown when known.
5. Block and UTC time.

### 3.2 Principal account

Every user-action alert identifies one principal account:

| Event | Principal account |
| --- | --- |
| Stake | Token or vault share owner |
| Cooldown start | Owner whose active position entered cooldown |
| Cooldown withdrawal | Owner whose cooldown position was reduced |
| LLYFI buy or redeem | Direct caller, or Safe account for a canonical Safe call |
| veYFI migration | Migrated account |
| Legacy veYFI lock change | Lock owner, not an operator acting for it |
| Legacy veYFI withdrawal | Lock owner |
| yETH claim | Claim account |
| Recovery Vault withdrawal | Share owner |

Display the ENS name when reverse resolution succeeds. Link the label to the
account on Etherscan. Otherwise show the shortened address.

Use these actor labels only when they add information:

- `For:` when an action changes another account's position.
- `Sent by:` when the caller differs from the principal account.
- `Received by:` when assets go to a different address.

Do not repeat the same address under several labels. Do not show a zero address,
an unresolved `unknown` placeholder, or a protocol contract as a user account.

For the monitored stYFI exits and LLYFI buys and redemptions, canonical
Safe `execTransaction` calls are unwrapped only when the inner operation is a
zero-value `CALL` to the exact expected protocol contract. The Safe is the
principal account; its external executor is not the user. LLYFI buys and
redemptions through Safe batches, other Safe targets, or routers remain
anonymous; their confirmed facility events still produce alerts. The bot does
not guess the end user from indirect calldata. If the transaction lookup
explicitly returns no transaction, either trade also posts with its confirmed
event amounts and `Position after: unavailable`. Malformed or noncanonical
calldata fails closed. stYFI exits still require proven attribution.

A yETH claim is attributed to the account indexed by the canonical Claim event,
independent of whether the call was direct, Safe-wrapped, or initiated by a
claim-and-distribute contract. Positive claim shares plus the matching Recovery
Vault mint and deposit prove `stayed`; zero shares with no such companions prove
`exited`. The bot does not parse transaction wrappers to infer either fact.

### 3.3 Event-time account position

`Position after` means the account state at the end of the confirmed event
block. It is not the intermediate state immediately after the event log, so it
can include a later change in the same block. Historical replay must query the
event block, not the latest chain state.

The chain is the source of truth. The bot must not maintain balances by applying
only the events it watches, because ordinary token transfers would make such a
record incomplete.

Batch the reads for one `account:block` snapshot. Cache that snapshot for the
rest of the run. A retry must query the same block and produce the same values.

If a required snapshot read fails, processing pauses before delivery and retries
from the saved cursor. Do not fill either replay or live history with incomplete
account context. A redemption whose canonical principal cannot be attributed
may remain anonymous as `Position after: unavailable`; this is distinct from a
failed account read.

### 3.4 stYFI and veYFI account context

For stYFI and veYFI user actions, the account snapshot contains:

- stYFI active, cooling, and currently withdrawable YFI.
- stYFIx active, cooling, and currently withdrawable YFI.
- sdYFI, supYFI, and coveYFI wallet, active, cooling, and withdrawable amounts.
- Total LLYFI exposure expressed as YFI equivalent.
- Legacy veYFI locked amount and unlock date.
- Migrated veYFI amount and unlock date when available.

Display rules:

- Show the product affected by the event in detail.
- Every stYFI or stYFIx action shows the other stYFI variant and total LLYFI
  exposure when either balance is nonzero.
- Every LLYFI or veYFI action shows total stYFI/stYFIx exposure when it is
  nonzero.
- Show related products in a compact summary.
- Omit zero product rows unless zero proves that a position closed.
- Use YFI-equivalent values when LLYFI token units are not 1:1 with YFI.
- Never add raw token amounts with YFI-equivalent amounts.
- Reject provider logs whose asset/share relation contradicts the deployed
  contract: stYFI, stYFIx, sdYFI, and coveYFI are 1:1; supYFI uses its fixed
  69,420 token-unit scale. The same invariant applies to stake, cooldown, and
  withdrawal actions before rendering.
- Limit the position section to four rows. Combine related LLYFI holdings when
  more rows would be needed.

Example:

```text
Position after · alice.eth
stYFI: 38.20 active · 12.50 cooling · 0.00 withdrawable
stYFIx: 4.10 active
LLYFI: 8.30 YFI eq.
```

When all related positions are zero, show only the affected product row.

### 3.5 yETH account context

For yETH user actions, the account snapshot contains:

- Original snapshot claim amount.
- ETH recovered after the recovery rate.
- Unclaimed snapshot amount after the event.
- Recovery Vault shares after the event.
- Current ETH value of those shares at the event block.

The deployed claim event exposes `account`, `amount`, `underlying`, and `shares`.
Use the event values for the action outcome:

- `amount`: original snapshot claim before the recovery rate.
- `underlying`: ETH recovered after the recovery rate.
- `shares`: Recovery Vault shares minted when the account stays; zero when the
  account exits.

Do not infer these values from a current balance when the event supplies them.
The implementation must verify this mapping against the deployed
[claim contract source](https://eth.blockscout.com/address/0x9564850c7090B13794e6d1164B0826C0aEFf3143?tab=contract)
and pin it in an ABI fixture.

### 3.6 Amounts and precision

- Use up to four decimals below `0.01`.
- Use two decimals from `0.01` through `999.99`.
- Use comma separators when the exact value remains readable.
- Use `K`, `M`, or `B` only for secondary totals where exact units do not affect
  the meaning.
- Never render a before and after value that round to the same display value.
  Increase precision or show the delta and current value instead.
- Show USD value only for YFI-denominated action amounts when the event-block
  price is available. Do not show USD on every account-position row.
- Display percentages with two decimal places.
- Use `percentage points`, shortened to `pts`, for a change between percentages.

### 3.7 Size and whale treatment

Remove the five-bar impact meter and the Shrimp, Fish, Dolphin, and Shark labels
from public messages.

Keep the internal size classification if it remains useful for logging or alert
priority. Only the Whale classification changes public output:

```text
🚨 WHALE MOVE
```

The whale line appears before the title. Each domain must define and test its
threshold. The message still shows the exact action amount or percentage.

### 3.8 Links and footer

User-action footer:

```text
Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

- `Tx` links to the transaction on Etherscan.
- `Block 25,123,456` links to the block on Etherscan.
- Use the event block timestamp.
- Every delivered action and protocol update must resolve its event-block
  timestamp before posting.
- Empty or catalogue-suppressed ranges may advance without rendering a footer.

Protocol-state footer:

```text
Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Synthetic protocol-state alerts do not claim to have one causal transaction.

### 3.9 Telegram safety

- Escape all account labels, ENS names, symbols, and other external text.
- Use only Telegram-supported HTML.
- Keep messages below Telegram's message length limit with room for long ENS
  names and links.
- Do not use Markdown and HTML in the same message.
- Do not expose bot tokens, chat IDs, RPC URLs, raw exceptions, or internal
  fingerprints.

## 4. Pinned channel introductions

Pin one introduction after historical replay finishes and before users join.

### 4.1 stYFI introduction

```text
stYFI activity

This channel tracks stYFI and stYFIx staking, cooldowns, and withdrawals on
Ethereum.

Account positions are shown at the end of each event's confirmed block.
Historical messages were replayed from the contracts' start block using the
same rules as live alerts.
```

### 4.2 veYFI introduction

```text
veYFI and LLYFI activity

This channel tracks legacy veYFI locks and withdrawals, veYFI migration, and
sdYFI, supYFI, and coveYFI staking, cooldowns, buys, and redemptions on Ethereum.

Account positions are shown at the end of each event's confirmed block.
Historical messages were replayed from the contracts' start block using the
same rules as live alerts.
```

### 4.3 yETH introduction

```text
yETH recovery activity

This channel tracks yETH recovery claims, Recovery Vault withdrawals, and
changes in recovery funding on Ethereum.

User positions are shown at the end of each event's confirmed block. Protocol
updates summarize state changes and may not have one causal transaction.
Historical messages were replayed from the recovery contracts' start block
using the same rules as live alerts.
```

## 5. Event routing matrix

| Current normalized action | Product variant | Destination | Catalogue template |
| --- | --- | --- | --- |
| `staked` | stYFI | stYFI | S1 |
| `staked` | stYFIx | stYFI | S1 |
| `initiated_cooldown` | stYFI | stYFI | S2 |
| `initiated_cooldown` | stYFIx | stYFI | S2 |
| `withdrew_from_cooldown` | stYFI | stYFI | S3 |
| `withdrew_from_cooldown` | stYFIx | stYFI | S3 |
| `staked` | sdYFI, supYFI, coveYFI | veYFI | V1 |
| `initiated_cooldown` | sdYFI, supYFI, coveYFI | veYFI | V2 |
| `withdrew_from_cooldown` | sdYFI, supYFI, coveYFI | veYFI | V3 |
| `exchange` | sdYFI, supYFI, coveYFI | veYFI | V4 |
| `redeem` | sdYFI, supYFI, coveYFI | veYFI | V5 |
| `migrate` | veYFI | veYFI | V6 |
| `lock` | Legacy veYFI | veYFI | V7 |
| `extension` | Legacy veYFI | veYFI | V8 |
| `update` | Legacy veYFI | veYFI | V9 or V10 |
| `legacy_withdraw` | Legacy veYFI | veYFI | V11 or V12 |
| `penalty` | Legacy veYFI | none | Suppress as duplicate |
| `yeth_claimed_stayed` | yETH | yETH | Y1 |
| `yeth_claimed_exited` | yETH | yETH | Y2 |
| `yeth_recovery_vault_withdraw` | Partial | yETH | Y3 |
| `yeth_recovery_vault_withdraw` | Full | yETH | Y4 |
| `yeth_debt_paid_down` | Protocol state | yETH | Y5 |
| `yeth_recovery_progress` | Protocol state | yETH | Y6 |
| `yeth_recovery_setback` | Protocol state | yETH | Y7 |
| `yeth_yield_capacity_up` | Protocol state | yETH | Y8 |
| `yeth_yield_capacity_down` | Protocol state | yETH | Y9 |

No current action kind may fall through silently. An unknown action or unsupported
token variant stops cursor advancement and records a structured processing error.

## 6. stYFI message catalogue

### S1. stYFI or stYFIx staked

Use `stYFI staked` or `stYFIx staked`. Do not call this action a deposit in the
public message.

```text
🟢 stYFI staked

Staked: 12.50 YFI ($125,000.00)

Position after · alice.eth
stYFI: 44.20 active · 6.00 cooling
stYFIx: 3.10 active
LLYFI: 8.40 YFI eq.

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Omit `Received`: admitted stYFI and stYFIx stakes are exactly 1:1. A
  nonidentity assets/shares event is malformed and stops the block.
- If the receiver differs from the caller, show `For` and `Sent by`.
- Use the owner or receiver as the principal account, never the staking contract.
- Show the whale line when the stake reaches the approved stYFI threshold.
- Use the same structure for stYFIx.

Different-account example:

```text
🟢 stYFIx staked

Staked: 5.00 YFI ($50,000.00)

For: alice.eth
Sent by: yearn-zap.eth

Position after · alice.eth
stYFIx: 25.00 active
stYFI: 8.00 active

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

### S2. stYFI or stYFIx cooldown started

```text
🧊 stYFI cooldown started

Entered cooldown: 12.50 stYFI
Total cooling: 20.00 stYFI
Withdrawable now: 0.00 YFI
Stream completes: 10 Sep 2026 14:20 UTC

Position after · alice.eth
stYFI: 38.20 active · 20.00 cooling
stYFIx: 4.10 active
LLYFI: 8.30 YFI eq.

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Show the amount newly entered and the total cooldown after the event.
- Show `Withdrawable now` even when it is zero. It explains whether funds can be
  claimed immediately.
- The stream completion is derived from the event-block stream state.
- If adding to a cooldown resets an existing stream, add:
  `Existing cooldown restarted with the new total.`
- Use the same structure for stYFIx.

### S3. stYFI or stYFIx cooldown withdrawal

```text
🏁 stYFI cooldown withdrawal

Received: 4.20 YFI ($42,000.00)

Position after · alice.eth
stYFI: 38.20 active · 7.80 cooling · 0.00 withdrawable
stYFIx: 3.10 active
LLYFI: 8.40 YFI eq.

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Omit `Burned`: admitted stYFI and stYFIx withdrawals are exactly 1:1. A
  nonidentity assets/shares event is malformed and stops the block.
- If the receiver differs from the owner, show `Received by`.
- On full withdrawal, keep the affected row and show zero:
  `stYFI: 0.00 active · 0.00 cooling · position closed`.
- On partial withdrawal, show the remaining cooldown.
- Use the same structure for stYFIx.

## 7. veYFI and LLYFI message catalogue

### V1. LLYFI staked

```text
🟢 supYFI staked

Staked: 69.42K supYFI
YFI equivalent: 1.00 YFI ($10,000.00)

Position after · alice.eth
supYFI: 21.30K wallet · 138.84K active
Other LLYFI: 5.40 YFI eq.
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
stYFI/stYFIx: 14.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Use sdYFI, supYFI, or coveYFI in the title and affected position row.
- Show YFI equivalent only when it differs from the token amount at display
  precision.
- When the staked token and YFI-equivalent values are equal at display
  precision, omit the redundant equivalent line and attach the USD suffix to
  `Staked`.
- Show wallet, active, cooling, and withdrawable components when nonzero.
- Show `For` and `Sent by` when the owner differs from the caller.

### V2. LLYFI cooldown started

```text
🧊 sdYFI cooldown started

Entered cooldown: 5.00 sdYFI
YFI equivalent: 5.00 YFI ($50,000.00)
Total cooling: 8.00 sdYFI
Withdrawable now: 0.00 sdYFI
Stream completes: 10 Sep 2026 14:20 UTC

Position after · alice.eth
sdYFI: 7.00 wallet · 12.00 active · 8.00 cooling
Other LLYFI: 3.30 YFI eq.
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules match S2, including the restarted-stream note.

### V3. LLYFI cooldown withdrawal

```text
🏁 coveYFI cooldown withdrawal

Received: 2.00 coveYFI ($20,000.00)

Position after · alice.eth
coveYFI: 4.00 wallet · 3.00 active · 1.00 cooling
Other LLYFI: 5.10 YFI eq.
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027

Received by: yearn-treasury.eth

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Show `Received by` only when it differs from the principal account.
- Show the affected row as closed on a full withdrawal.
- Show token units first and YFI equivalent second when they differ.
- When token and YFI-equivalent values are equal at display precision, omit the
  redundant equivalent line and attach the USD suffix to `Received`.

### V4. LLYFI bought with YFI

```text
🛒 supYFI bought

2.00 YFI → 138.84K supYFI
Value: $20,000.00

Position after · alice.eth
supYFI: 160.14K wallet · 34.71K active
Other LLYFI: 5.40 YFI eq.
stYFI/stYFIx: 14.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Use the event's exact conversion scale.
- Do not describe a derived token amount as exact unless the contract guarantees
  that scale.
- For coveYFI, add the facility line only when both event-block balances resolve:
  `Facility after: 120.00 YFI · 450.00 coveYFI`.
- Do not add the facility balance to the user's position.

### V5. LLYFI redeemed for YFI

```text
💸 supYFI redeemed

69.42K supYFI → 0.95 YFI ($9,500.00)
Exit fee: 0.05 YFI · 5.00%

Position after · alice.eth
supYFI: 21.30K wallet · 34.71K active
Other LLYFI: 5.40 YFI eq.
stYFI/stYFIx: 14.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Omit the fee line when the fee is zero.
- Use four decimals when the received or fee amount is below `0.01 YFI`.
- Do not include the old `Impact basis` line. The conversion and fee already
  explain gross and net value.
- Apply the optional coveYFI facility line from V4.
- If account attribution cannot be proven, do not fabricate a position. Use
  the anonymous `Position after: unavailable` variant and record a structured
  anomaly. A failed snapshot read stops processing and retries from the saved
  cursor.

### V6. Legacy veYFI migrated

```text
🚚 Legacy veYFI migrated

Opted into the new veYFI boost system: 8.00 YFI
Unlock: 10 Jun 2027 00:00 UTC

Position after · alice.eth
Migrated veYFI: 8.00 YFI until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Keep the epoch number out of the main message unless operators need it to
  explain an unexpected date.
- Show both the epoch and date in structured logs.
- Do not imply that the account received an LLYFI token during migration.

### V7. Legacy veYFI lock created

```text
🔐 Legacy veYFI lock created

Locked: 8.00 YFI ($80,000.00)
Unlock: 10 Jun 2027 00:00 UTC · 287 days

Position after · alice.eth
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Calculate remaining duration from the event block timestamp.
- Do not show a negative duration for an expired lock. Use `expired`.

### V8. Legacy veYFI lock extended

Use this template when the amount is unchanged and the unlock time increases.

```text
🗓️ Legacy veYFI lock extended

Locked: 8.00 YFI
Unlock: 12 Dec 2026 → 10 Jun 2027
Extension: 180 days

Position after · alice.eth
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

### V9. Legacy veYFI lock increased

Use this template when the amount increases and the unlock time is unchanged.

```text
🔒 Legacy veYFI lock increased

Locked: 5.00 → 8.00 YFI
Added: 3.00 YFI ($30,000.00)
Unlock: 10 Jun 2027

Position after · alice.eth
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

### V10. Legacy veYFI lock increased and extended

Use this template when both amount and unlock time increase.

```text
🗓️ Legacy veYFI lock increased and extended

Locked: 5.00 → 8.00 YFI · +3.00
Unlock: 12 Dec 2026 → 10 Jun 2027 · +180 days

Position after · alice.eth
Legacy veYFI: 8.00 YFI locked until 10 Jun 2027
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Unexpected lock changes:

- If the amount falls outside a withdrawal event, title it
  `Legacy veYFI lock updated` and show the exact before and after values.
- If the unlock time falls, title it `Legacy veYFI unlock shortened` and record
  a structured anomaly. This is an unexpected state transition.
- Never label an unchanged amount and date as an update. Suppress it and record
  diagnostic evidence.

### V11. Legacy veYFI withdrawn

```text
🏦 Legacy veYFI withdrawn

Received: 8.00 YFI ($80,000.00)

Position after · alice.eth
Legacy veYFI: position closed
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

### V12. Legacy veYFI early exit

```text
🏃 Legacy veYFI early exit

Received: 6.00 YFI ($60,000.00)
Penalty: 2.00 YFI ($20,000.00) · 25.00%
Original locked value: 8.00 YFI

Position after · alice.eth
Legacy veYFI: position closed
LLYFI: 12.40 YFI eq.
stYFI/stYFIx: 6.20 YFI

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules for V11 and V12:

- Use `position closed` only when the event-block lock is zero.
- If a lock remains, show its amount and unlock date.
- Calculate the penalty percentage from received plus penalty.
- Suppress the paired standalone `penalty` action after recording deduplication.

## 8. yETH message catalogue

### Y1. yETH recovery claimed and stayed

```text
🟢 yETH recovery claimed · stayed

Original snapshot claim: 20.00 ETH
Recovered: 6.39 ETH · 31.96%
Deposited into the Recovery Vault
Received: 6.12 yswETH

Position after · alice.eth
Recovery Vault: 6.12 yswETH · worth 6.39 ETH
Unclaimed recovery: 0.00 ETH

Protocol choices: 56.20% stayed · 30.00% exited · 13.80% unclaimed

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Read `amount`, `underlying`, and `shares` from the verified claim event.
- Calculate the displayed recovery rate as `underlying / amount`.
- `Received` must match the event's minted shares.
- The event-block account snapshot verifies total shares after the claim.
- If the account already held Recovery Vault shares, distinguish the event's
  shares received from the total position after.
- Show exact protocol choice percentages after applying the event.

### Y2. yETH recovery claimed and exited

```text
🏁 yETH recovery claimed · exited

Original snapshot claim: 20.00 ETH
Received now: 6.39 ETH · 31.96%

Position after · alice.eth
Unclaimed recovery: 0.00 ETH
Recovery Vault: 0.00 yswETH

Protocol choices: 56.20% stayed · 30.20% exited · 13.60% unclaimed

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- The claim event's `shares` value must be zero.
- Only independent event-specific evidence may contradict exit attribution;
  block-final aggregate account state is not such evidence. A proved
  contradiction stops cursor advancement and records a structured processing
  error.
- Do not call the original snapshot amount the amount received.

### Y3. Partial Recovery Vault withdrawal

```text
💸 yETH Recovery Vault withdrawal · partial

Received: 3.20 ETH
Burned: 3.06 of 6.12 yswETH · 50.00%
Shares after withdrawal: 3.06 yswETH
Original snapshot moved to exited: 10.00 ETH

Position after · alice.eth
Recovery Vault: 3.06 yswETH · worth 3.20 ETH

Protocol choices: 46.20% stayed · 40.00% exited · 13.80% unclaimed

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Lead with the event's actual withdrawn assets, not the original snapshot
  amount attributed to the shares.
- Show shares before, shares burned, and the event-local shares after. The
  event-block position may differ after a later action in the same block.
- Show `Received by` when the receiver differs from the owner.
- `Original snapshot moved to exited` explains the protocol accounting change;
  it is not the ETH paid in this transaction.

### Y4. Full Recovery Vault withdrawal

```text
💸 yETH Recovery Vault withdrawal · full

Received: 6.40 ETH
Burned: 6.12 yswETH · 100.00%
Original snapshot moved to exited: 20.00 ETH

Position after · alice.eth
Recovery Vault: position closed

Protocol choices: 36.20% stayed · 50.00% exited · 13.80% unclaimed

Tx · Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Use `full` only when event attribution and the event-block balance both show
  zero shares after the withdrawal.
- Keep `position closed` even though zero rows are normally omitted.

### Y5. yETH recovery debt paid down

```text
🟢 yETH recovery debt paid down

Outstanding recovery debt fell by 0.72 ETH
Remaining debt: 2,909.72 ETH
Recovered since snapshot: 22.73% · +0.02 pts

Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Remove the internal alert threshold from the public message.
- Do not show rounded before and after totals that appear equal.
- When the recovered-percentage change rounds to `0.00 pts`, show only the
  current recovered percentage and omit the zero suffix.
- This is a protocol-state alert. Do not show an account or transaction.

### Y6. yETH recovery progress

```text
📈 yETH recovery progress

Recovery shortfall narrowed by 36.50 ETH
Remaining shortfall: 1,168.10 ETH
Coverage: 54.03% → 55.43% · +1.40 pts

Since the previous checkpoint:
User deposits: +10.00 ETH
Yield, fees and donations: +26.50 ETH

Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Omit a zero driver row.
- If both drivers are unknown, omit the cause section.
- Do not emit a progress alert solely to establish the first baseline.

### Y7. yETH recovery setback

```text
📉 yETH recovery setback

Recovery shortfall widened by 18.40 ETH
Current shortfall: 1,186.50 ETH
Coverage: 55.43% → 54.73% · -0.70 pts

Since the previous checkpoint:
User withdrawals: -5.00 ETH
Yield, fees and losses: -13.40 ETH

Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules:

- Use `losses` when the organic delta is negative and `donations` when it is
  positive.
- Keep signed values in the cause section.
- Do not show an orange neutral icon for a setback.

### Y8. yETH yield capacity increased

```text
📈 yETH yield capacity increased

Yield Vault assets rose by 80.00 ETH
Current assets: 1,740.00 ETH
Coverage of outstanding recovery debt: 57.04% → 59.80% · +2.76 pts
Outstanding recovery debt: 2,909.72 ETH

Since the previous checkpoint:
Net claim flow: +50.00 ETH
Yield and other gains: +30.00 ETH

Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

### Y9. yETH yield capacity decreased

```text
📉 yETH yield capacity decreased

Yield Vault assets fell by 80.00 ETH
Current assets: 1,660.00 ETH
Coverage of outstanding recovery debt: 59.80% → 57.04% · -2.76 pts
Outstanding recovery debt: 2,910.44 ETH

Since the previous checkpoint:
Net claim flow: -50.00 ETH
Yield and other losses: -30.00 ETH

Block 25,123,456 · 27 Aug 2026 14:20 UTC
```

Variant rules for Y8 and Y9:

- Omit a zero driver row.
- Use the direction proved by the asset delta, not the action-kind name alone.
- If the action kind contradicts the asset delta, stop cursor advancement and
  record a structured processing error.
- Do not emit a capacity alert solely to establish the first baseline.

## 9. Suppressed and removed messages

| Message | Decision | Reason |
| --- | --- | --- |
| Daily impact digest | Remove | It adds noise and depends on the old animal-tier display. |
| Shrimp/Fish/Dolphin/Shark labels | Remove from public output | Exact amounts and account positions carry more information. |
| Standalone legacy veYFI penalty | Suppress | The early-exit message already contains the penalty. |
| yETH recovery initialized | Suppress | Use the pinned yETH baseline instead of a synthetic event. |
| yETH yield capacity initialized | Suppress | Use the pinned yETH baseline instead of a synthetic event. |
| Unknown or unsupported action | Do not send and do not advance | Silent omission could lose a real alert. Record a structured processing error. |

## 10. Historical replay rules

- Replay confirmed blocks in ascending order.
- Preserve transaction and log order within each block.
- Use each event's block timestamp, account state, protocol state, and price.
- Use an archive-capable Ethereum RPC for historical `eth_call` requests.
- Before enabling YBC, verify that the same RPC supports Geth-compatible
  `debug_traceTransaction` with `callTracer` and `withLog`. Generic-aggregator
  votes during final-day decay use the trace's log index and child-call position
  to recover vote-time weight; an end-of-block call is not valid evidence.
- Post through the same formatter, delivery, cursor, retry, and deduplication
  path used for live alerts.
- Rate-limit Telegram delivery without reordering messages within a chat.
- Resume from the saved cursor after restarts.
- Do not run live delivery for a domain while its replay is still behind the
  confirmed head.
- A replayed message must be byte-identical to the message that the same code
  would have produced when the event was live, given the same chain data.
- Recreate a private destination chat if reviewers reject its replay. Do not
  mutate Durable Object state manually to force a second delivery into the same
  destination.

## 11. Acceptance fixtures

The implementation must provide deterministic fixtures for every template and
variant below.

### Shared fixtures

- ENS name resolved and unresolved.
- Principal account equals caller and differs from caller.
- Receiver equals owner and differs from owner.
- All related positions zero.
- One related position nonzero.
- More than four nonzero product rows, proving compact aggregation.
- Historical timestamp and account snapshot at an old block.
- HTML-sensitive ENS name and symbol escaping.
- Small amount requiring four decimals.
- Large amount requiring comma or suffix formatting.
- Whale threshold immediately below, at, and above the boundary.

### stYFI fixtures

- stYFI stake with 1:1 received shares.
- stYFIx stake with a distinct receiver.
- Malformed stYFI or stYFIx stake with non-identity assets and shares rejected.
- New cooldown.
- Addition to an existing cooldown that restarts the stream.
- Partial cooldown withdrawal.
- Full cooldown withdrawal.
- Withdrawal to a different receiver.

### veYFI and LLYFI fixtures

- Stake, cooldown, and withdrawal for each of sdYFI, supYFI, and coveYFI.
- Non-1:1 supYFI YFI-equivalent formatting.
- Buy for each LLYFI token.
- Redemption with no fee, a normal fee, and a sub-`0.01 YFI` fee.
- coveYFI buy and redemption with facility state available and unavailable.
- veYFI migration.
- Legacy lock creation.
- Extension only.
- Amount increase only.
- Amount increase and extension together.
- Unexpected amount decrease.
- Unexpected unlock shortening.
- Normal withdrawal with position closed and position remaining.
- Early exit with penalty.
- Paired standalone penalty suppression.

### yETH fixtures

- Claim and stay with no prior Recovery Vault position.
- Claim and stay with an existing Recovery Vault position.
- Claim and exit.
- Claim whose `amount`, `underlying`, and `shares` prove distinct values.
- Contradictory claim/exit attribution failure.
- Partial withdrawal.
- Full withdrawal.
- Withdrawal to a different receiver.
- Debt paid down with a delta smaller than the old total's display precision.
- Recovery progress with both drivers, one driver, and no known drivers.
- Recovery setback with user withdrawal and organic loss.
- Yield capacity increase and decrease.
- Action-kind direction contradicting the asset delta.
- Initial recovery and yield baselines suppressed.

Print the exact rendered HTML for the 24 action templates and three channel
introductions with the same assertions used in the test suite. Material
variants remain covered by the focused renderer tests.

```bash
npm run alerts:catalogue-examples
```

Initialization never sends the three channel introductions. They are pure
registry and review outputs only.

## 12. Review checklist

Reviewers should answer these questions before approval:

- Does each action use the term a user sees in the application?
- Is the principal account correct for delegated and receiver-different actions?
- Does each message distinguish the action amount from the position after?
- Are token units and YFI-equivalent units kept separate?
- Do yETH claim messages distinguish original claim, recovered ETH, and shares?
- Can a reader understand each message without knowing the bot's internal
  thresholds or state machine?
- Is every line useful enough to repeat throughout the historical chat?
- Are any messages too long on a narrow Telegram screen?
- Are protocol-state alerts clearly different from user actions?
- Are all expected events routed to exactly one public chat?
- Are all deliberate suppressions listed and tested?

Approval of this catalogue freezes the public copy and data requirements for the
rebuild. Later copy changes should use a separate, small
change set with updated fixtures.
