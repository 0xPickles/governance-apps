# YBC UI Spec

Status: implemented
Applies to: `/ybc` route, `ybc-beta.dao-ops.com` beta host, and gated production
host `ybc.yearn.fi`
Recommended app key: `ybc`
Recommended display label: `Yearn Builder's Collective`
Production gate: disabled until fork smoke, preprod smoke, and production approval

## 1. Product framing

This is a governance-and-membership workspace, not another generic staking screen.

The surface should emphasize:

- collective status
- membership
- proposal lifecycle
- voting thresholds
- execution timing
- weight maturity
- rewards visibility

## 2. Primary personas

### Observer
Needs:
- what YBC is
- who is in it
- what proposals exist
- how much collective voting power it controls

### Member
Needs:
- personal effective weight
- proposal actions
- vote actions
- execution timing
- rewards visibility

### Operator / management
Needs:
- member overrides in allowed scope
- operator list / thresholds / hooks visibility
- reward distributor and bonus recipient visibility

## 3. Route structure

Recommended initial structure:

```text
/ybc
  page.tsx
  YbcPageClient.tsx
  messages.ts
  components/
    YbcHero.tsx
    MembersTable.tsx
    ProposalBoard.tsx
    ProposalCard.tsx
    RewardsCard.tsx
    OperatorPanel.tsx
```

## 4. Information architecture

Default structure:

1. Overview summary.
2. Action-prioritized proposal feed when proposals are in discussion, voting, or awaiting execution.
3. Member roster table by default, with Cards available as a saved preference.
4. Rewards.
5. Operator panel, shown only for operator/admin perspectives.

Default landing state: command-center overview.

Design alignment follows the root `DESIGN.md` product baseline. YBC should keep its
governance-board shape while matching the polished governance app family: restrained
neutral surfaces, 8px cards and controls, compact tabular numbers, persistent terminal
and blocked-action copy, and no decorative dashboard tropes. Proposal lifecycle and
member weight hierarchy should carry the experience, not visual ornament.

The route should render the core command-center sections on one page instead of forcing
members, proposals, rewards, and operator controls behind line tabs. When there are
discussion, voting, or awaiting-execution proposals, the proposal feed renders above
the member roster so actionable governance work is not buried.

Approved shell map:

- Overview shows one total collective voting-power value for active members, member count, current epoch,
  active proposals, and proposals awaiting execution.
- Members keeps raw stake, effective voting weight, target weight, maturity progress,
  visible as separate values in both Table and Cards views.
- Proposals maps addition and expulsion proposals through discussion, voting, awaiting
  execution, executed, and expired terminal states.
- Proposal cards keep phase, target, proposer, and next action visible in the summary.
  The timeline, threshold marker, votes, and action buttons live inside each disclosure.
- Rewards shows YBC rewards and points claims to the shared rewards route.
- Operator is conditional and limited to membership, operator, hooks, threshold,
  and reward status controls.
- Deep links such as `#overview`, `#members`, `#proposals`, `#rewards`, and `#admin`
  should scroll to the matching section.
- A link in the form `?proposal=<numeric-id>#proposals` opens, scrolls to, and
  highlights the matching proposal. Invalid or unknown IDs are removed while
  preserving other query parameters and forcing the safe `#proposals` fallback.

## 5. Core UX rules

## 5.1 Separate raw stake from effective weight

Always show:
- raw staked amount
- effective voting weight now
- fully matured target weight

This distinction is required because YBC weight ramps over epochs.

## 5.2 Make timing obvious

Every proposal should clearly show:
- proposal epoch
- discussion phase
- voting window
- execution window
- expired state

The proposal timeline should use a reusable stepper so phase status is consistent
across proposal cards and testable as a shared primitive.

## 5.3 Make thresholds visible

Do not hide thresholds in docs text only.

Show:
- addition threshold
- expulsion threshold
- current yea / total
- clear passing / failing state

Threshold visualization should include a marker or goal line so the user can see how
close the proposal is to passing before reading the numeric values.

## 5.3.1 Disabled and blocked actions

All blocked proposal, reward, or operator CTAs must explain the blocked state in the
button text and in persistent accessible copy next to the action. Tooltip-only
explanations are not enough.

## 5.4 Keep rewards simple

Show:
- member’s YBC-related rewards
- statement that rewards are claimed through the shared reward flow
- CTA that points to the shared rewards route instead of duplicating reward claims

## 5.5 Keep identity canonical

Resolve member labels in this order everywhere:

1. A valid name saved in this browser.
2. A reverse and forward verified Mainnet ENS name.
3. A deterministic pseudonym, with stable ordinals for collisions.

Show one resolved name and one linked canonical address. Do not add `Local`, `ENS`, or
`Generated` badges. A local name is a display preference, not identity or protocol
authority, and never replaces the address.

The resolved name is the edit control. Click, Enter, or Space opens the local editor.
Its secondary pencil stays hidden at rest and appears on fine-pointer hover or keyboard
focus without shifting or blurring the row. Save, cancel, reset, and Escape restore
focus to the name.

Member names, addresses, amounts, and statuses must wrap inside table and card layouts
at 360px. The canonical address remains a Mainnet Etherscan target on coarse pointers.

## 6. Hero section

Recommended hero stats:

- total collective voting power for active members
- member count
- current epoch
- active proposals
- proposals awaiting execution

## 7. Members table

The default roster view is Table. Cards remain available through a saved view toggle.

Columns:
- member
- status
- raw staked
- effective weight
- target weight
- maturity progress

Cards show:
- maturity progress bar
- effective vs target weight

Names and canonical addresses use the same identity treatment in the roster, proposal
cards, viewer summary, and operator panel.

## 8. Proposal board

Each card should show:
- addition vs expulsion
- target account
- proposer
- threshold
- votes
- phase
- next available action

Proposal, reward, operator, and last-updated timestamps use the shared UTC formatter.
Action timing comes from the verified Mainnet block and canonical proposal status, not
the publisher's `generatedAt` value.

Proposal cards should use disclosures so long proposal history stays scannable. When
there are fewer than three proposals, keep cards open by default. When there are three
or more, keep discussion, voting, awaiting-execution, and otherwise actionable
proposals open; collapse terminal history by default. Collapsed cards must still show
the proposal id, type, phase, target, proposer, and next action.

Supported proposal actions:
- propose addition
- propose expulsion
- retract
- vote yea
- vote nay
- execute

The route-local scenario controls used during the initial prototype phase are retired.
YBC now seeds observer, member, operator, loading, empty-roster, empty-board, proposal,
rewards, and admin coverage through the shared floating debug panel and the shared E2E
bridge so the default `/ybc` route can keep production-like copy and navigation.
That production-like posture should avoid visible `mock` / `prototype` badges or
route-shell implementation notes on the default surface; debug state switching belongs
in the panel and bridge instead.
When no explicit debug preset is applied, the default runtime should follow the active
wallet on connect, disconnect, and account changes so `/ybc` keeps the same production-
like observer/member split a real connected route would show.
Debug setters that force terminal proposal phases must leave those proposals terminal:
executed, expired, failed, and retracted cards should expose no vote, retract, or
execute affordances after the phase flip.

## 9. Operator Scope For MVP

Expose only in-scope operator/admin affordances:

- add member
- remove member
- operator list visibility
- hooks visibility
- threshold visibility
- reward / bonus-related status

Do **not** build a generic arbitrary-call transaction builder in MVP.

## 10. Debug-backed seed scenarios

These scenarios remain the seed contract for the mock data model, but the debug-backed
runtime now exposes them as hidden debug presets and granular bridge setters instead of
page-local UI controls.
Admin access toggles in that runtime should mutate the viewer's effective operator
membership, not only local booleans, so debug mode can turn operator access on and off
symmetrically.

Required mock scenarios:

1. observer, not a member
2. member with matured weight
3. member with ramping weight
4. proposal in discussion phase
5. proposal in voting phase
6. passed proposal awaiting execution
7. expired proposal
8. operator/admin view

## 11. Copy posture

Prefer:
- `Collective Influence`
- `Voting Weight`
- `Ramping`
- `Proposal`
- `Execute`
- `Awaiting Execution`

Avoid:
- implying instant full weight for new stake
- implying expired proposals can be revived
- implying YBC has a fully generic arbitrary-execution UI in scope
