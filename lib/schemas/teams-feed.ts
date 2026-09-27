import { z } from "@/lib/schemas/zod";
import { TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK } from "@/lib/clients/teams/accounting-history";

export { TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK } from "@/lib/clients/teams/accounting-history";

export const TEAMS_PROTOCOL_USD_DECIMALS = 18;
export const TEAMS_BONUS_TOKEN_DECIMALS = 18;
export const TEAMS_FEED_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const TEAMS_FEED_MAX_TOKENS = 256;
export const TEAMS_FEED_MAX_TEAMS = 512;
export const TEAMS_FEED_MAX_INDEXED_PERIODS = 1_024;
export const TEAMS_FEED_MAX_PERIODS_PER_TEAM = 1_024;
export const TEAMS_FEED_MAX_REVENUE_DEPOSITS_PER_PERIOD = 4_096;
export const TEAMS_FEED_MAX_FUNDING_APPROVALS = 4_096;
export const TEAMS_FEED_MAX_FUNDING_EVENTS_PER_APPROVAL = 4_096;
export const TEAMS_FEED_MAX_BONUS_PERIODS = 1_024;
export const TEAMS_FEED_MAX_BONUS_CLAIMS = 4_096;
export const TEAMS_FEED_MAX_GLOBAL_PERIODS = 1_024;
export const TEAMS_FEED_MAX_EVENT_ID_LENGTH = 160;
export const TEAMS_FEED_MAX_TEAM_NAME_LENGTH = 128;
export const TEAMS_FEED_MAX_TOKEN_SYMBOL_LENGTH = 32;
export const TEAMS_FEED_MAX_TOKEN_NAME_LENGTH = 128;
export const TEAMS_FEED_MAX_SOURCE_REF_LENGTH = 128;
export const TEAMS_FEED_MAX_UNIX_SECONDS = 4_294_967_295;

const UINT256_MAX =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const zAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const zHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const zNonZeroAddress = zAddress.refine(
  (value) => value.toLowerCase() !== ZERO_ADDRESS,
  { message: "Expected a non-zero Ethereum address." }
);
const zNonZeroHash = zHash.refine(
  (value) => value.toLowerCase() !== ZERO_HASH,
  { message: "Expected a non-zero Ethereum hash." }
);
const zIntegerString = z
  .string()
  .max(78)
  .regex(/^(0|[1-9]\d*)$/)
  .refine(isUint256String, {
    message: "Expected an unsigned 256-bit integer string.",
  });
const zSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const zPositiveSafeInteger = zSafeInteger.refine((value) => value > 0, {
  message: "Expected a positive safe integer.",
});
const zUnixSeconds = zSafeInteger.max(TEAMS_FEED_MAX_UNIX_SECONDS);
const zEventId = z.string().min(1).max(TEAMS_FEED_MAX_EVENT_ID_LENGTH);
const zTeamName = boundedNonBlankString(TEAMS_FEED_MAX_TEAM_NAME_LENGTH);
const zTokenSymbol = boundedNonBlankString(
  TEAMS_FEED_MAX_TOKEN_SYMBOL_LENGTH
);
const zTokenName = boundedNonBlankString(TEAMS_FEED_MAX_TOKEN_NAME_LENGTH);
const TeamsFeedUnitsSchema = z.object({
  usd: z.object({
    symbol: z.literal("USD"),
    decimals: z.literal(TEAMS_PROTOCOL_USD_DECIMALS),
    scope: z.literal("all-financial-and-event-usd"),
  }),
  bonusToken: z.object({
    symbol: z.literal("YFI"),
    decimals: z.literal(TEAMS_BONUS_TOKEN_DECIMALS),
  }),
});

const TeamsFinancialsSchema = z.object({
  revenueUsd: zIntegerString,
  costUsd: zIntegerString,
  profitUsd: zIntegerString,
  lossUsd: zIntegerString,
});

const TeamsRevenueDepositSchema = z.object({
  id: zEventId,
  team: zNonZeroAddress,
  period: zSafeInteger,
  token: zNonZeroAddress,
  amount: zIntegerString,
  revenueUsd: zIntegerString,
  depositor: zNonZeroAddress,
  txHash: zNonZeroHash,
  blockNumber: zSafeInteger,
  logIndex: zSafeInteger,
  timestamp: zUnixSeconds.nullable(),
});

const TeamsBonusParametersSchema = z.object({
  period: zSafeInteger,
  bonusFactorBps: z.number().int().min(0).max(100_000),
  ybcSplitBps: z.number().int().min(0).max(10_000),
  bonusPriceUsd: zIntegerString,
});

const TeamsBonusPeriodSchema = z.object({
  period: zSafeInteger,
  status: z.enum([
    "unfinalized",
    "claimable",
    "claimed",
    "not_profitable",
    "unavailable",
  ]),
  claimableYfi: zIntegerString,
  ybcAmountYfi: zIntegerString,
  teamAmountYfi: zIntegerString,
  parameters: TeamsBonusParametersSchema.nullable(),
});

const TeamsTeamPeriodSchema = z.object({
  period: zSafeInteger,
  startsAt: zUnixSeconds,
  endsAt: zUnixSeconds,
  financials: TeamsFinancialsSchema,
  revenueDeposits: boundedArray(
    TeamsRevenueDepositSchema,
    TEAMS_FEED_MAX_REVENUE_DEPOSITS_PER_PERIOD,
    "teams[].periods[].revenueDeposits"
  ),
  fundingApprovalIds: boundedArray(
    zSafeInteger,
    TEAMS_FEED_MAX_FUNDING_APPROVALS,
    "teams[].periods[].fundingApprovalIds"
  ),
  bonus: TeamsBonusPeriodSchema.nullable(),
});

const TeamsFundingClaimSchema = z.object({
  id: zEventId,
  approvalId: zSafeInteger,
  team: zNonZeroAddress,
  period: zSafeInteger,
  token: zNonZeroAddress,
  amount: zIntegerString,
  costUsd: zIntegerString,
  vest: zNonZeroAddress.nullable(),
  recipient: zNonZeroAddress,
  txHash: zNonZeroHash,
  blockNumber: zSafeInteger,
  logIndex: zSafeInteger,
  timestamp: zUnixSeconds.nullable(),
});

const TeamsFundingReturnSchema = z.object({
  id: zEventId,
  approvalId: zSafeInteger,
  team: zNonZeroAddress,
  period: zSafeInteger,
  token: zNonZeroAddress,
  amount: zIntegerString,
  refundUsd: zIntegerString,
  sender: zNonZeroAddress,
  txHash: zNonZeroHash,
  blockNumber: zSafeInteger,
  logIndex: zSafeInteger,
  timestamp: zUnixSeconds.nullable(),
});

export const TeamsFeedSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  units: TeamsFeedUnitsSchema.optional(),
  chainId: z.literal(1),
  generatedAt: zUnixSeconds,
  blockNumber: zSafeInteger,
  blockHash: zNonZeroHash,
  deployment: z.object({
    budgetGenesis: zUnixSeconds,
    deployBlock: zSafeInteger,
    teamRegistry: zNonZeroAddress,
    teamImplementation: zNonZeroAddress,
    teamAccountant: zNonZeroAddress,
    revenueRecipient: zNonZeroAddress,
    revenuePriceOracle: zNonZeroAddress,
    fundingDistributor: zNonZeroAddress,
    bonusDistributor: zNonZeroAddress,
    bonusPriceOracle: zNonZeroAddress,
    ybcBonusRecipient: zNonZeroAddress,
    yfi: zNonZeroAddress,
    multicall3: zNonZeroAddress,
    source: z.object({
      repo: z.literal("styfi"),
      ref: boundedNonBlankString(TEAMS_FEED_MAX_SOURCE_REF_LENGTH),
    }),
  }),
  periods: z.object({
    current: zSafeInteger,
    lengthSeconds: zPositiveSafeInteger,
    currentStartsAt: zUnixSeconds,
    currentEndsAt: zUnixSeconds,
    indexed: boundedArray(
      zSafeInteger,
      TEAMS_FEED_MAX_INDEXED_PERIODS,
      "periods.indexed"
    ),
  }),
  tokens: boundedAddressRecord(
    z.object({
      address: zNonZeroAddress,
      symbol: zTokenSymbol,
      name: zTokenName.nullable(),
      decimals: z.number().int().min(0).max(36),
      kind: z.enum(["revenue", "funding", "bonus", "unknown"]),
      priceOracle: zNonZeroAddress.nullable(),
      converter: zNonZeroAddress.nullable(),
    }),
    TEAMS_FEED_MAX_TOKENS,
    "tokens"
  ),
  teams: boundedArray(
    z.object({
      index: zSafeInteger,
      address: zNonZeroAddress,
      name: zTeamName,
      owner: zNonZeroAddress,
      pendingOwner: zNonZeroAddress.nullable(),
      status: z.enum(["active", "retiring", "retired", "migrated", "unknown"]),
      retirementPeriod: zSafeInteger.nullable(),
      isRegisteredAtSnapshot: z.boolean(),
      successor: zNonZeroAddress.nullable(),
      periods: boundedArray(
        TeamsTeamPeriodSchema,
        TEAMS_FEED_MAX_PERIODS_PER_TEAM,
        "teams[].periods"
      ),
      lifetime: TeamsFinancialsSchema,
      claimCursor: z.object({
        nextBonusPeriod: zSafeInteger,
      }),
      availableActions: z.object({
        canDepositRevenue: z.boolean(),
        canClaimFunding: z.boolean(),
        canReturnFunding: z.boolean(),
        canClaimBonus: z.boolean(),
      }),
    }),
    TEAMS_FEED_MAX_TEAMS,
    "teams"
  ),
  fundingApprovals: boundedArray(
    z.object({
      id: zSafeInteger,
      team: zNonZeroAddress,
      period: zSafeInteger,
      token: zNonZeroAddress,
      amount: zIntegerString,
      used: zIntegerString,
      claimable: zIntegerString,
      durationSeconds: zSafeInteger,
      status: z.enum([
        "pending",
        "claimable",
        "fully_claimed",
        "expired",
        "inactive_team",
      ]),
      averageCostPriceUsd: zIntegerString.nullable(),
      claims: boundedArray(
        TeamsFundingClaimSchema,
        TEAMS_FEED_MAX_FUNDING_EVENTS_PER_APPROVAL,
        "fundingApprovals[].claims"
      ),
      returns: boundedArray(
        TeamsFundingReturnSchema,
        TEAMS_FEED_MAX_FUNDING_EVENTS_PER_APPROVAL,
        "fundingApprovals[].returns"
      ),
    }),
    TEAMS_FEED_MAX_FUNDING_APPROVALS,
    "fundingApprovals"
  ),
  bonus: z.object({
    token: zNonZeroAddress,
    pendingPeriod: zSafeInteger,
    finalizedPeriods: boundedArray(
      TeamsBonusParametersSchema,
      TEAMS_FEED_MAX_BONUS_PERIODS,
      "bonus.finalizedPeriods"
    ),
    claims: boundedArray(
      z.object({
        id: zEventId,
        team: zNonZeroAddress,
        period: zSafeInteger,
        amountYfi: zIntegerString,
        ybcAmountYfi: zIntegerString,
        recipient: zNonZeroAddress,
        txHash: zNonZeroHash,
        blockNumber: zSafeInteger,
        logIndex: zSafeInteger,
        timestamp: zUnixSeconds.nullable(),
      }),
      TEAMS_FEED_MAX_BONUS_CLAIMS,
      "bonus.claims"
    ),
  }),
  revenueRecipient: z.object({
    address: zNonZeroAddress,
    token: zNonZeroAddress.optional(),
    killed: z.boolean(),
    operator: zNonZeroAddress.nullable(),
    treasury: zNonZeroAddress.nullable(),
    rewardDistributor: zNonZeroAddress.nullable(),
    recoveryAuction: zNonZeroAddress.nullable(),
    tokenSplitBps: z.tuple([
      z.number().int().min(0).max(10_000),
      z.number().int().min(0).max(10_000),
      z.number().int().min(0).max(10_000),
    ]),
    lastBalance: zIntegerString.nullable(),
    sumBalance: zIntegerString.nullable(),
    used: z.tuple([zIntegerString, zIntegerString, zIntegerString]).nullable(),
  }),
  accountant: z.object({
    globalByPeriod: boundedArray(
      z.object({
        period: zSafeInteger,
        financials: TeamsFinancialsSchema,
      }),
      TEAMS_FEED_MAX_GLOBAL_PERIODS,
      "accountant.globalByPeriod"
    ),
    lifetime: TeamsFinancialsSchema,
  }),
  events: z.object({
    firstIndexedBlock: zSafeInteger,
    lastIndexedBlock: zSafeInteger,
    teamCount: zSafeInteger,
    revenueDepositCount: zSafeInteger,
    fundingApprovalCount: zSafeInteger,
    fundingClaimCount: zSafeInteger,
    fundingReturnCount: zSafeInteger,
    bonusClaimCount: zSafeInteger,
  }),
}).superRefine((feed, context) => {
  if (feed.version === 2 && !feed.units) {
    addIssue(
      context,
      ["units"],
      "Teams feed v2 requires explicit normalized unit metadata."
    );
  }

  if (
    feed.version === 2 &&
    feed.blockNumber < TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK
  ) {
    addIssue(
      context,
      ["blockNumber"],
      `Teams feed v2 must use a snapshot at or after corrected accounting block ${TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK}.`
    );
  }

  if (
    feed.revenueRecipient.tokenSplitBps.reduce(
      (sum, split) => sum + split,
      0
    ) !== 10_000
  ) {
    addIssue(
      context,
      ["revenueRecipient", "tokenSplitBps"],
      "Teams revenue token splits must total exactly 10,000 bps."
    );
  }

  if (
    feed.periods.currentStartsAt >= feed.periods.currentEndsAt ||
    feed.periods.currentEndsAt - feed.periods.currentStartsAt !==
      feed.periods.lengthSeconds
  ) {
    addIssue(
      context,
      ["periods"],
      "The current period bounds must be ordered and match lengthSeconds."
    );
  }

  const indexedPeriods = new Set(feed.periods.indexed);
  if (
    indexedPeriods.size !== feed.periods.indexed.length ||
    !indexedPeriods.has(feed.periods.current)
  ) {
    addIssue(
      context,
      ["periods", "indexed"],
      "Indexed periods must be unique and include the current period."
    );
  }

  if (
    feed.events.firstIndexedBlock > feed.events.lastIndexedBlock ||
    feed.events.lastIndexedBlock > feed.blockNumber ||
    feed.deployment.deployBlock > feed.blockNumber ||
    feed.events.firstIndexedBlock < feed.deployment.deployBlock
  ) {
    addIssue(
      context,
      ["events"],
      "The indexed event block range must start at or after deployment, remain ordered, and end at or before the snapshot block."
    );
  }

  if (
    normalize(feed.revenueRecipient.address) !==
    normalize(feed.deployment.revenueRecipient)
  ) {
    addIssue(
      context,
      ["revenueRecipient", "address"],
      "The revenue recipient record must match the deployment address."
    );
  }

  const tokenEntries = Object.entries(feed.tokens);
  assertUniqueNormalizedValues(
    tokenEntries.map(([address]) => address),
    context,
    ["tokens"],
    "Token keys"
  );
  const tokenAddresses = new Set(
    tokenEntries.map(([address]) => normalize(address))
  );
  for (const [key, token] of tokenEntries) {
    if (normalize(key) !== normalize(token.address)) {
      addIssue(
        context,
        ["tokens", key, "address"],
        "Each token record address must match its record key."
      );
    }
  }

  if (
    normalize(feed.bonus.token) !== normalize(feed.deployment.yfi) ||
    !tokenAddresses.has(normalize(feed.bonus.token))
  ) {
    addIssue(
      context,
      ["bonus", "token"],
      "The bonus token must be the deployed YFI token and exist in tokens."
    );
  }
  if (
    feed.revenueRecipient.token &&
    !tokenAddresses.has(normalize(feed.revenueRecipient.token))
  ) {
    addIssue(
      context,
      ["revenueRecipient", "token"],
      "The revenue recipient balance token must exist in tokens."
    );
  }
  const hasRecipientBalanceTuple =
    feed.revenueRecipient.lastBalance !== null ||
    feed.revenueRecipient.sumBalance !== null ||
    feed.revenueRecipient.used !== null;
  const hasCompleteRecipientBalanceGroup =
    feed.revenueRecipient.token !== undefined &&
    feed.revenueRecipient.lastBalance !== null &&
    feed.revenueRecipient.sumBalance !== null &&
    feed.revenueRecipient.used !== null;
  const hasLegacyZeroBalanceTuple =
    feed.version === 1 &&
    feed.revenueRecipient.token === undefined &&
    feed.revenueRecipient.lastBalance === "0" &&
    feed.revenueRecipient.sumBalance === "0" &&
    feed.revenueRecipient.used?.every((value) => value === "0");
  if (
    hasRecipientBalanceTuple &&
    !hasCompleteRecipientBalanceGroup &&
    !hasLegacyZeroBalanceTuple
  ) {
    addIssue(
      context,
      ["revenueRecipient"],
      "Revenue recipient balance fields require a token and a complete balance tuple; legacy v1 may omit the token only for an all-zero tuple."
    );
  }

  assertUniqueNormalizedValues(
    feed.teams.map((team) => team.address),
    context,
    ["teams"],
    "Team addresses"
  );
  assertUniqueNumbers(
    feed.teams.map((team) => team.index),
    context,
    ["teams"],
    "Team indices"
  );
  const teamAddresses = new Set(
    feed.teams.map((team) => normalize(team.address))
  );
  const fundingApprovalIds = new Set(
    feed.fundingApprovals.map((approval) => approval.id)
  );
  const fundingApprovalsById = new Map(
    feed.fundingApprovals.map((approval) => [approval.id, approval])
  );
  assertUniqueNumbers(
    feed.fundingApprovals.map((approval) => approval.id),
    context,
    ["fundingApprovals"],
    "Funding approval IDs"
  );

  const allRevenueDeposits: Array<
    z.infer<typeof TeamsRevenueDepositSchema>
  > = [];
  const referencedFundingApprovalIds = new Set<number>();
  for (const [teamIndex, team] of feed.teams.entries()) {
    const teamPeriodNumbers = team.periods.map((period) => period.period);
    assertUniqueNumbers(
      teamPeriodNumbers,
      context,
      ["teams", teamIndex, "periods"],
      "Team period numbers"
    );

    if (feed.version === 2) {
      assertFinancialConservation(
        team.lifetime,
        context,
        ["teams", teamIndex, "lifetime"]
      );
    }

    for (const [periodIndex, period] of team.periods.entries()) {
      const periodPath = ["teams", teamIndex, "periods", periodIndex];
      if (
        !indexedPeriods.has(period.period) ||
        period.startsAt >= period.endsAt
      ) {
        addIssue(
          context,
          periodPath,
          "Team periods must reference an indexed period with ordered timestamps."
        );
      }
      if (
        period.period === feed.periods.current &&
        (period.startsAt !== feed.periods.currentStartsAt ||
          period.endsAt !== feed.periods.currentEndsAt)
      ) {
        addIssue(
          context,
          periodPath,
          "The current team period must match the feed current-period bounds."
        );
      }
      if (feed.version === 2) {
        assertFinancialConservation(
          period.financials,
          context,
          [...periodPath, "financials"]
        );
      }

      assertUniqueNumbers(
        period.fundingApprovalIds,
        context,
        [...periodPath, "fundingApprovalIds"],
        "Funding approval references"
      );
      for (const approvalId of period.fundingApprovalIds) {
        referencedFundingApprovalIds.add(approvalId);
        const approval = fundingApprovalsById.get(approvalId);
        if (
          !approval ||
          normalize(approval.team) !== normalize(team.address) ||
          approval.period !== period.period
        ) {
          addIssue(
            context,
            [...periodPath, "fundingApprovalIds"],
            "Funding approval references must resolve to the enclosing team and period."
          );
          break;
        }
      }

      for (const [depositIndex, deposit] of period.revenueDeposits.entries()) {
        allRevenueDeposits.push(deposit);
        if (
          normalize(deposit.team) !== normalize(team.address) ||
          deposit.period !== period.period ||
          !tokenAddresses.has(normalize(deposit.token))
        ) {
          addIssue(
            context,
            [...periodPath, "revenueDeposits", depositIndex],
            "Revenue deposits must reference the enclosing team and period and a known token."
          );
        }
        assertEventBlockRange(
          deposit,
          feed,
          context,
          [...periodPath, "revenueDeposits", depositIndex]
        );
      }

      if (period.bonus) {
        const claimableYfi = parseUint256String(
          period.bonus.claimableYfi
        );
        const ybcAmountYfi = parseUint256String(
          period.bonus.ybcAmountYfi
        );
        const teamAmountYfi = parseUint256String(
          period.bonus.teamAmountYfi
        );
        if (
          period.bonus.period !== period.period ||
          (period.bonus.parameters !== null &&
            period.bonus.parameters.period !== period.period)
        ) {
          addIssue(
            context,
            [...periodPath, "bonus"],
            "Team bonus data must reference the enclosing period."
          );
        }
        if (
          claimableYfi !== null &&
          ybcAmountYfi !== null &&
          teamAmountYfi !== null &&
          claimableYfi !== ybcAmountYfi + teamAmountYfi
        ) {
          addIssue(
            context,
            [...periodPath, "bonus"],
            "Claimable YFI must equal the YBC and team bonus amounts."
          );
        }
      }
    }
  }

  for (const approvalId of fundingApprovalIds) {
    if (!referencedFundingApprovalIds.has(approvalId)) {
      addIssue(
        context,
        ["fundingApprovals"],
        "Every funding approval must be referenced by its team period."
      );
      break;
    }
  }

  const allFundingClaims = feed.fundingApprovals.flatMap(
    (approval) => approval.claims
  );
  const allFundingReturns = feed.fundingApprovals.flatMap(
    (approval) => approval.returns
  );
  const fundingCostBuckets = new Map<
    string,
    {
      claimedRaw: bigint;
      returnedRaw: bigint;
    }
  >();
  for (const [approvalIndex, approval] of feed.fundingApprovals.entries()) {
    const approvalPath = ["fundingApprovals", approvalIndex];
    if (
      !teamAddresses.has(normalize(approval.team)) ||
      !indexedPeriods.has(approval.period) ||
      !tokenAddresses.has(normalize(approval.token))
    ) {
      addIssue(
        context,
        approvalPath,
        "Funding approvals must reference a known team, indexed period, and token."
      );
    }
    const approvalAmount = parseUint256String(approval.amount);
    const approvalUsed = parseUint256String(approval.used);
    const approvalClaimable = parseUint256String(approval.claimable);
    if (
      approvalAmount !== null &&
      approvalUsed !== null &&
      approvalClaimable !== null &&
      approvalUsed + approvalClaimable > approvalAmount
    ) {
      addIssue(
        context,
        approvalPath,
        "Funding used plus claimable units cannot exceed the approved amount."
      );
    }

    for (const [claimIndex, claim] of approval.claims.entries()) {
      if (
        claim.approvalId !== approval.id ||
        normalize(claim.team) !== normalize(approval.team) ||
        claim.period !== approval.period ||
        normalize(claim.token) !== normalize(approval.token)
      ) {
        addIssue(
          context,
          [...approvalPath, "claims", claimIndex],
          "Funding claims must match their enclosing approval."
        );
      }
      assertEventBlockRange(
        claim,
        feed,
        context,
        [...approvalPath, "claims", claimIndex]
      );
    }
    for (const [returnIndex, fundingReturn] of approval.returns.entries()) {
      if (
        fundingReturn.approvalId !== approval.id ||
        normalize(fundingReturn.team) !== normalize(approval.team) ||
        fundingReturn.period !== approval.period ||
        normalize(fundingReturn.token) !== normalize(approval.token)
      ) {
        addIssue(
          context,
          [...approvalPath, "returns", returnIndex],
          "Funding returns must match their enclosing approval."
        );
      }
      assertEventBlockRange(
        fundingReturn,
        feed,
        context,
        [...approvalPath, "returns", returnIndex]
      );
    }

    const claimedRaw = sumUint256Strings(
      approval.claims.map((claim) => claim.amount)
    );
    const returnedRaw = sumUint256Strings(
      approval.returns.map((fundingReturn) => fundingReturn.amount)
    );
    if (claimedRaw !== null && returnedRaw !== null) {
      const bucketKey = [
        normalize(approval.team),
        approval.period,
        normalize(approval.token),
      ].join(":");
      const bucket = fundingCostBuckets.get(bucketKey) ?? {
        claimedRaw: 0n,
        returnedRaw: 0n,
      };
      bucket.claimedRaw += claimedRaw;
      bucket.returnedRaw += returnedRaw;
      fundingCostBuckets.set(bucketKey, bucket);
    }
  }

  for (const bucket of fundingCostBuckets.values()) {
    if (bucket.returnedRaw > bucket.claimedRaw) {
      addIssue(
        context,
        ["fundingApprovals"],
        "Aggregate funding return units cannot exceed recorded claim units for a team, period, and token."
      );
    }
  }

  const finalizedBonusPeriods = new Set(
    feed.bonus.finalizedPeriods.map((period) => period.period)
  );
  if (
    finalizedBonusPeriods.size !== feed.bonus.finalizedPeriods.length ||
    [...finalizedBonusPeriods].some((period) => !indexedPeriods.has(period))
  ) {
    addIssue(
      context,
      ["bonus", "finalizedPeriods"],
      "Finalized bonus periods must be unique indexed periods."
    );
  }
  const bonusClaimKeys = new Set<string>();
  for (const [claimIndex, claim] of feed.bonus.claims.entries()) {
    const claimKey = `${normalize(claim.team)}:${claim.period}`;
    const amountYfi = parseUint256String(claim.amountYfi);
    const ybcAmountYfi = parseUint256String(claim.ybcAmountYfi);
    if (
      !teamAddresses.has(normalize(claim.team)) ||
      !finalizedBonusPeriods.has(claim.period) ||
      (amountYfi !== null &&
        ybcAmountYfi !== null &&
        ybcAmountYfi > amountYfi) ||
      bonusClaimKeys.has(claimKey)
    ) {
      addIssue(
        context,
        ["bonus", "claims", claimIndex],
        "Bonus claims must uniquely reference a known team and finalized period with a bounded YBC share."
      );
    }
    bonusClaimKeys.add(claimKey);
    assertEventBlockRange(
      claim,
      feed,
      context,
      ["bonus", "claims", claimIndex]
    );
  }

  assertUniqueNumbers(
    feed.accountant.globalByPeriod.map((entry) => entry.period),
    context,
    ["accountant", "globalByPeriod"],
    "Accountant period numbers"
  );
  for (const [index, entry] of feed.accountant.globalByPeriod.entries()) {
    if (!indexedPeriods.has(entry.period)) {
      addIssue(
        context,
        ["accountant", "globalByPeriod", index, "period"],
        "Accountant periods must reference indexed periods."
      );
    }
    if (feed.version === 2) {
      assertFinancialConservation(
        entry.financials,
        context,
        ["accountant", "globalByPeriod", index, "financials"]
      );
    }
  }
  if (feed.version === 2) {
    assertFinancialConservation(
      feed.accountant.lifetime,
      context,
      ["accountant", "lifetime"]
    );
  }

  const allEvents = [
    ...allRevenueDeposits,
    ...allFundingClaims,
    ...allFundingReturns,
    ...feed.bonus.claims,
  ];
  assertUniqueEvents(allEvents, context);

  if (
    feed.events.teamCount !== feed.teams.length ||
    feed.events.revenueDepositCount !== allRevenueDeposits.length ||
    feed.events.fundingApprovalCount !== feed.fundingApprovals.length ||
    feed.events.fundingClaimCount !== allFundingClaims.length ||
    feed.events.fundingReturnCount !== allFundingReturns.length ||
    feed.events.bonusClaimCount !== feed.bonus.claims.length
  ) {
    addIssue(
      context,
      ["events"],
      "Event counters must exactly match the bounded feed records."
    );
  }
});

export type TeamsFeed = z.infer<typeof TeamsFeedSchema>;
export type TeamsFeedFinancials = TeamsFeed["teams"][number]["lifetime"];
export type TeamsFeedFundingApproval = TeamsFeed["fundingApprovals"][number];
export type TeamsFeedTeam = TeamsFeed["teams"][number];
export type TeamsFeedTeamPeriod = TeamsFeedTeam["periods"][number];
export type TeamsFeedToken = TeamsFeed["tokens"][string];
export type TeamsFeedUnits = NonNullable<TeamsFeed["units"]>;

export function hasCompatibleTeamsFinancialUnits(
  feed: TeamsFeed
): feed is TeamsFeed & { version: 2; units: TeamsFeedUnits } {
  return (
    feed.version === 2 &&
    feed.units !== undefined &&
    feed.blockNumber >= TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK
  );
}

function boundedNonBlankString(maximumLength: number) {
  return z
    .string()
    .min(1)
    .max(maximumLength)
    .refine((value) => value.trim().length > 0, {
      message: "Expected a non-blank string.",
    });
}

function boundedArray<T extends z.ZodType>(
  itemSchema: T,
  maximumLength: number,
  fieldName: string
) {
  return z
    .custom<unknown[]>(
      (value) =>
        Array.isArray(value) && value.length <= maximumLength,
      {
        message: `${fieldName} must be an array with at most ${maximumLength} items.`,
      }
    )
    .pipe(z.array(itemSchema));
}

function boundedAddressRecord<V extends z.ZodType>(
  valueSchema: V,
  maximumEntries: number,
  fieldName: string
) {
  return z
    .custom<Record<string, unknown>>(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length <= maximumEntries,
      {
        message: `${fieldName} must be an object with at most ${maximumEntries} entries.`,
      }
    )
    .pipe(z.record(zNonZeroAddress, valueSchema));
}

function isUint256String(value: string): boolean {
  return parseUint256String(value) !== null;
}

function parseUint256String(value: string): bigint | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= UINT256_MAX ? parsed : null;
  } catch {
    return null;
  }
}

function sumUint256Strings(values: string[]): bigint | null {
  let total = 0n;
  for (const value of values) {
    const parsed = parseUint256String(value);
    if (parsed === null) return null;
    total += parsed;
  }
  return total;
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function assertUniqueNormalizedValues(
  values: string[],
  context: z.core.$RefinementCtx<unknown>,
  path: PropertyKey[],
  label: string
): void {
  if (new Set(values.map(normalize)).size !== values.length) {
    addIssue(context, path, `${label} must be unique.`);
  }
}

function assertUniqueNumbers(
  values: number[],
  context: z.core.$RefinementCtx<unknown>,
  path: PropertyKey[],
  label: string
): void {
  if (new Set(values).size !== values.length) {
    addIssue(context, path, `${label} must be unique.`);
  }
}

function assertEventBlockRange(
  event: { blockNumber: number },
  feed: {
    blockNumber: number;
    events: {
      firstIndexedBlock: number;
      lastIndexedBlock: number;
    };
  },
  context: z.core.$RefinementCtx<unknown>,
  path: PropertyKey[]
): void {
  if (
    event.blockNumber < feed.events.firstIndexedBlock ||
    event.blockNumber > feed.events.lastIndexedBlock ||
    event.blockNumber > feed.blockNumber
  ) {
    addIssue(
      context,
      [...path, "blockNumber"],
      "Event blocks must fall inside the indexed snapshot range."
    );
  }
}

function assertUniqueEvents(
  events: Array<{
    id: string;
    txHash: string;
    logIndex: number;
  }>,
  context: z.core.$RefinementCtx<unknown>
): void {
  const ids = new Set<string>();
  const logCoordinates = new Set<string>();

  for (const event of events) {
    const normalizedId = normalize(event.id);
    const coordinate = `${normalize(event.txHash)}:${event.logIndex}`;
    if (ids.has(normalizedId) || logCoordinates.has(coordinate)) {
      addIssue(
        context,
        ["events"],
        "Event IDs and transaction log coordinates must be globally unique."
      );
      return;
    }
    ids.add(normalizedId);
    logCoordinates.add(coordinate);
  }
}

function assertFinancialConservation(
  financials: {
    revenueUsd: string;
    costUsd: string;
    profitUsd: string;
    lossUsd: string;
  },
  context: z.core.$RefinementCtx<unknown>,
  path: PropertyKey[]
): void {
  const revenue = parseUint256String(financials.revenueUsd);
  const cost = parseUint256String(financials.costUsd);
  const profit = parseUint256String(financials.profitUsd);
  const loss = parseUint256String(financials.lossUsd);
  if (
    revenue === null ||
    cost === null ||
    profit === null ||
    loss === null
  ) {
    return;
  }
  const expectedProfit = revenue >= cost ? revenue - cost : 0n;
  const expectedLoss = cost > revenue ? cost - revenue : 0n;
  if (profit !== expectedProfit || loss !== expectedLoss) {
    addIssue(
      context,
      path,
      "Profit and loss must exactly conserve normalized revenue and cost."
    );
  }
}

function addIssue(
  context: z.core.$RefinementCtx<unknown>,
  path: PropertyKey[],
  message: string
): void {
  context.addIssue({
    code: "custom",
    message,
    path,
  });
}
