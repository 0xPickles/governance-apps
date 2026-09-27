# YBC Mock Data Schema v1

Purpose: a stable mock data contract for design, prototypes, and mock-backed
implementation. The canonical TypeScript mirror lives in
`lib/clients/ybc/types.ts`.

## Type Shape

```ts
import type { Address } from "viem";

type UnixSeconds = number;
type YbcAmount = string;

type YbcMockExampleScenariosV1 = {
  version: 1;
  generatedAt: UnixSeconds;
  scenarios: YbcMockScenario[];
};

type YbcMockScenario = {
  id: "observer" | "member-matured" | "member-ramping" | "operator-admin";
  label: string;
  data: YbcMockDataV1;
};

type YbcMockDataV1 = {
  version: 1;
  generatedAt: UnixSeconds;
  asOf: UnixSeconds;
  epoch: {
    current: number;
    startsAt: UnixSeconds;
    endsAt: UnixSeconds;
  };
  hero: YbcHeroRecord;
  me: YbcAccountPerspective;
  roster: YbcRosterRecord;
  proposals: YbcProposalBoardRecord;
  rewards: YbcRewardsRecord;
  admin?: YbcAdminRecord;
};

type YbcHeroRecord = {
  collectiveAddress: Address;
  memberCount: number;
  internalWeight: YbcAmount;
  delegatedWeight: YbcAmount;
  totalInfluence: YbcAmount;
  currentEpoch: number;
  activeProposalCount: number;
  awaitingExecutionCount: number;
};

type YbcAccountPerspective = {
  address: Address | null;
  isMember: boolean;
  isOperator: boolean;
  canPropose: boolean;
  canVote: boolean;
  weight: YbcWeightRecord;
  pendingRewards: YbcAmount;
};

type YbcRosterRecord = {
  totals: {
    rawStaked: YbcAmount;
    effectiveWeight: YbcAmount;
    targetWeight: YbcAmount;
    rampingMemberCount: number;
  };
  members: YbcMemberRecord[];
};

type YbcMemberRecord = {
  address: Address;
  ens: string | null;
  status: "active" | "ramping" | "pending-removal" | "removed";
  joinedAt: UnixSeconds;
  weight: YbcWeightRecord;
  sources: {
    stYFI: YbcAmount;
    stYFIx: YbcAmount;
    migratedVeYfi: YbcAmount;
  };
};

type YbcWeightRecord = {
  rawStaked: YbcAmount;
  effectiveWeight: YbcAmount;
  targetWeight: YbcAmount;
  maturityBps: number;
  maturesAt: UnixSeconds | null;
};

type YbcProposalBoardRecord = {
  summary: {
    activeCount: number;
    awaitingExecutionCount: number;
    terminalCount: number;
  };
  items: YbcProposalRecord[];
};

type YbcProposalRecord = {
  id: string;
  type: "addition" | "expulsion";
  targetAccount: Address;
  proposer: Address;
  epoch: number;
  phase:
    | "discussion"
    | "voting"
    | "awaiting-execution"
    | "executed"
    | "expired"
    | "failed"
    | "retracted";
  outcome: "pending" | "passing" | "failing" | "passed" | "failed";
  thresholdBps: number;
  votes: {
    total: YbcAmount;
    yea: YbcAmount;
    nay: YbcAmount;
  };
  timing: {
    createdAt: UnixSeconds;
    discussionStartsAt: UnixSeconds;
    votingStartsAt: UnixSeconds;
    votingEndsAt: UnixSeconds;
    executionOpensAt: UnixSeconds;
    expiresAt: UnixSeconds;
    executedAt?: UnixSeconds;
  };
  actions: {
    canRetract: boolean;
    canVote: boolean;
    canExecute: boolean;
    nextAction: "none" | "retract" | "vote" | "execute";
    disabledReason: string | null;
  };
};

type YbcRewardsRecord = {
  token: {
    symbol: "YFI";
    address: Address;
    decimals: 18;
  };
  claimable: YbcAmount;
  accruing: YbcAmount;
  lastUpdatedAt: UnixSeconds;
  claim: {
    mode: "shared-claim-surface";
    href: string;
    ctaLabel: string;
    disabledReason: string | null;
  };
  periods: YbcRewardPeriod[];
};

type YbcRewardPeriod = {
  epoch: number;
  source: "member-weight" | "operator-bonus";
  earned: YbcAmount;
  claimable: YbcAmount;
  finalized: boolean;
};

type YbcAdminRecord = {
  isOperator: boolean;
  operators: {
    address: Address;
    ens: string | null;
    role: "operator" | "management";
  }[];
  thresholds: {
    additionBps: number;
    expulsionBps: number;
  };
  hooks: {
    membershipHook: Address;
    rewardsDistributor: Address;
    bonusRecipient: Address;
  };
  scopedOperations: {
    id: "add-member" | "remove-member";
    label: string;
    enabled: boolean;
  }[];
  rewardStatus: {
    distributorFunded: boolean;
    lastSyncedAt: UnixSeconds;
  };
};
```

The follow-on debug-runtime alignment work uses this scenario set as seed presets
behind the debug panel and E2E bridge rather than as visible route-local controls.

## Field Rules

- All timestamps are Unix seconds.
- `generatedAt` is when a fixture was produced. `asOf` is the effective data
  time used for proposal action and phase examples.
- Token amounts and weights are decimal strings to preserve precision in JSON.
- `hero.internalWeight` is the authoritative collective voting-power value for
  active members and is the value shown in the overview.
- `hero.delegatedWeight` and `hero.totalInfluence` remain in schema v1 for
  fixture compatibility. The current UI does not display them or use them for
  proposal results; `totalInfluence` remains `internalWeight + delegatedWeight`
  in display units.
- Raw stake, effective weight, and target weight must remain separate fields on
  `me`, roster totals, and every roster member.
- `maturityBps` is `0` to `10000`. `maturesAt` is `null` for fully matured or
  non-member perspectives.
- `targetWeight` can exceed `effectiveWeight` while a member is ramping.
- Proposal phases are explicit; UI should not infer phase from timestamps alone.
- `awaiting-execution` means the vote passed and execution is open but not yet
  completed.
- `expired`, `executed`, `failed`, and `retracted` proposals are terminal.
- Expired proposals remain visible but have no enabled actions. A user must
  start a new proposal instead of reviving the expired one.
- YBC rewards are visible in this surface, but `rewards.claim.mode` must remain
  `shared-claim-surface`; MVP must not model a separate isolated YBC claim page.
- Admin operations are limited to `add-member` and `remove-member`. The schema
  intentionally does not expose a generic arbitrary-call operation.

## Required Scenario Coverage

`mock-data.example.json` should include:

- observer, not a member
- member with fully matured weight
- member with ramping weight
- operator/admin view

Across those scenarios, proposal fixtures should cover:

- discussion
- voting
- awaiting execution
- executed terminal state
- expired terminal state
- failed terminal state
- retracted terminal state

The scenario set is the source of truth for WP1 design and mock-backed prototype
work until onchain reads supersede the mock contract in a later work package.
