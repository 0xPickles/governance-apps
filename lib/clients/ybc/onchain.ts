import { formatUnits, isAddress, type Address, type PublicClient } from "viem";
import { YbcAbi } from "@/lib/abis/Ybc";
import { YbcElectionAbi } from "@/lib/abis/YbcElection";
import { YbcWeightAggregatorAbi } from "@/lib/abis/YbcWeightAggregator";
import { assertMainnetAccount, MAINNET_CHAIN_ID } from "@/lib/tx/network";
import type { PreparedTransaction } from "@/lib/tx/types";
import type { YbcClient, YbcPageState } from "./client";
import type {
  YbcAdminRecord,
  YbcMemberRecord,
  YbcMemberStatus,
  YbcMockDataV1,
  YbcProposalOutcome,
  YbcProposalPhase,
  YbcProposalRecord,
  YbcProposalType,
  YbcScenarioId,
  YbcVoteChoice,
  YbcWeightRecord,
} from "./types";
import type {
  YbcFeed,
  YbcFeedMember,
  YbcFeedProposal,
} from "@/lib/schemas/ybc-feed";
import {
  assertYbcMainnetDeployment,
  YBC_MAINNET_DEPLOYMENT,
} from "./deployment";
import {
  assertYbcMainnetPublicClient,
  verifyYbcSnapshotBlock,
  type YbcVerifiedBlock,
} from "./canonical-block";
import {
  assertCompleteYbcProposalHistory,
  assertYbcProposalIdentityMatchesFeed,
  assertYbcProposalSnapshotMatchesFeed,
  assertYbcProposalStatusMatchesFeed,
} from "./proposalSecurity";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ZERO_WEIGHT: YbcWeightRecord = {
  rawStaked: "0",
  effectiveWeight: "0",
  targetWeight: "0",
  maturityBps: 10_000,
  maturesAt: null,
};
const TERMINAL_PHASES = new Set<YbcProposalPhase>([
  "executed",
  "expired",
  "failed",
  "retracted",
]);
const YBC_PROPOSAL_STATUS = {
  PROPOSED: 1,
  RETRACTED: 2,
  VOTING: 4,
  PASSED: 8,
  FAILED: 16,
  EXECUTED: 32,
  EXPIRED: 64,
  INVALID: 128,
} as const;

export const YBC_PROPOSAL_READ_BATCH_SIZE = 8;

export type YbcProposalStatusFlag =
  (typeof YBC_PROPOSAL_STATUS)[keyof typeof YBC_PROPOSAL_STATUS];

export type YbcWalletOverlay = {
  isMember: boolean;
  isOperator: boolean;
  staked: bigint;
  weight: bigint;
  proposalStatusById: Record<number, YbcProposalStatusFlag>;
  votedByProposalId: Record<number, boolean>;
};

export type YbcCanonicalSnapshot = YbcVerifiedBlock & {
  additionThresholdBps: number;
  expulsionThresholdBps: number;
  proposalStatusById: Record<number, YbcProposalStatusFlag>;
};

type YbcMapOptions = {
  actionStateTrusted?: boolean;
  canonicalBlockTimestamp?: number;
  proposalStatusById?: Record<number, YbcProposalStatusFlag>;
  walletChainId?: number | null;
  walletOverlay?: YbcWalletOverlay | null;
};

type YbcProposalActionContext = {
  account: Address | null;
  normalizedAccount: string | null;
  currentEpoch: number;
  actionStateTrusted: boolean;
  isActiveMember: boolean;
  isMainnetAccount: boolean;
  effectiveWeightRaw: bigint;
  votedByProposalId: Record<number, boolean | null>;
  proposalStatusById: Record<number, YbcProposalStatusFlag | null>;
  feedVotes: YbcFeed["votes"];
};

export class OnchainYbcClient implements YbcClient {
  constructor(
    private readonly feed: YbcFeed,
    private readonly account: Address | null = null
  ) {
    assertYbcMainnetDeployment(feed);
    assertCompleteYbcProposalHistory(feed);
  }

  resolveDefaultScenario(address?: Address | null): YbcScenarioId {
    const member = feedMemberForAddress(this.feed, address ?? null);
    if (!member || member.status === "removed") return "observer";

    const weight = mapWeight(member);
    return mapMemberStatus(member, weight) === "ramping"
      ? "member-ramping"
      : "member-matured";
  }

  async getPageState(): Promise<YbcPageState> {
    return mapYbcFeedToPageState(this.feed, this.account);
  }

  async preparePropose(
    type: YbcProposalType,
    target: Address
  ): Promise<PreparedTransaction> {
    assertValidYbcProposalTarget(target);
    const expectedAccount = requireYbcPreparedAccount(this.account);

    return async () => {
      const {
        getAccount,
        getPublicClient,
        simulateThenWrite,
        wagmiConfig,
      } =
        await getYbcWriteRuntime();
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      assertYbcPreparedAccount(expectedAccount, address);
      const publicClient = requireYbcMainnetPublicClient(
        getPublicClient(wagmiConfig, { chainId: MAINNET_CHAIN_ID })
      );
      await verifyYbcSnapshotBlock(publicClient, this.feed);
      const confirmedAddress = assertMainnetAccount(getAccount(wagmiConfig));
      assertYbcPreparedAccount(expectedAccount, confirmedAddress);
      const request = {
        address: YBC_MAINNET_DEPLOYMENT.ybcElection,
        abi: YbcElectionAbi,
        functionName:
          type === "addition" ? "propose_addition" : "propose_expulsion",
        args: [target] as const,
        account: confirmedAddress,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(
        request,
        request,
        type === "addition"
          ? "YBC propose addition"
          : "YBC propose expulsion"
      );
    };
  }

  async prepareRetract(proposalId: bigint): Promise<PreparedTransaction> {
    const expectedAccount = requireYbcPreparedAccount(this.account);
    const proposal = requireYbcFeedProposal(this.feed, proposalId);

    return async () => {
      const {
        getAccount,
        getPublicClient,
        simulateThenWrite,
        wagmiConfig,
      } =
        await getYbcWriteRuntime();
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      assertYbcPreparedAccount(expectedAccount, address);
      const publicClient = requireYbcMainnetPublicClient(
        getPublicClient(wagmiConfig, { chainId: MAINNET_CHAIN_ID })
      );
      await verifyYbcSnapshotBlock(publicClient, this.feed);
      await assertYbcProposalReadyForWrite(
        publicClient,
        proposal,
        YBC_PROPOSAL_STATUS.PROPOSED,
        "retraction"
      );
      const confirmedAddress = assertMainnetAccount(getAccount(wagmiConfig));
      assertYbcPreparedAccount(expectedAccount, confirmedAddress);
      const request = {
        address: YBC_MAINNET_DEPLOYMENT.ybcElection,
        abi: YbcElectionAbi,
        functionName: "retract",
        args: [proposalId] as const,
        account: confirmedAddress,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, "YBC retract proposal");
    };
  }

  async prepareVote(
    proposalId: bigint,
    choice: YbcVoteChoice
  ): Promise<PreparedTransaction> {
    const expectedAccount = requireYbcPreparedAccount(this.account);
    const proposal = requireYbcFeedProposal(this.feed, proposalId);

    return async () => {
      const {
        getAccount,
        getPublicClient,
        simulateThenWrite,
        wagmiConfig,
      } =
        await getYbcWriteRuntime();
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      assertYbcPreparedAccount(expectedAccount, address);
      const publicClient = requireYbcMainnetPublicClient(
        getPublicClient(wagmiConfig, { chainId: MAINNET_CHAIN_ID })
      );
      await verifyYbcSnapshotBlock(publicClient, this.feed);
      await assertYbcProposalReadyForWrite(
        publicClient,
        proposal,
        YBC_PROPOSAL_STATUS.VOTING,
        "voting"
      );
      const confirmedAddress = assertMainnetAccount(getAccount(wagmiConfig));
      assertYbcPreparedAccount(expectedAccount, confirmedAddress);
      const request = {
        address: YBC_MAINNET_DEPLOYMENT.ybcElection,
        abi: YbcElectionAbi,
        functionName: choice === "yea" ? "vote_yea" : "vote_nay",
        args: [proposalId] as const,
        account: confirmedAddress,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `YBC vote ${choice}`);
    };
  }

  async prepareExecute(proposalId: bigint): Promise<PreparedTransaction> {
    const expectedAccount = requireYbcPreparedAccount(this.account);
    const proposal = requireYbcFeedProposal(this.feed, proposalId);

    return async () => {
      const {
        getAccount,
        getPublicClient,
        simulateThenWrite,
        wagmiConfig,
      } =
        await getYbcWriteRuntime();
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      assertYbcPreparedAccount(expectedAccount, address);
      const publicClient = requireYbcMainnetPublicClient(
        getPublicClient(wagmiConfig, { chainId: MAINNET_CHAIN_ID })
      );
      await verifyYbcSnapshotBlock(publicClient, this.feed);
      await assertYbcProposalReadyForWrite(
        publicClient,
        proposal,
        YBC_PROPOSAL_STATUS.PASSED,
        "execution"
      );
      const confirmedAddress = assertMainnetAccount(getAccount(wagmiConfig));
      assertYbcPreparedAccount(expectedAccount, confirmedAddress);
      const request = {
        address: YBC_MAINNET_DEPLOYMENT.ybcElection,
        abi: YbcElectionAbi,
        functionName: "execute",
        args: [proposalId] as const,
        account: confirmedAddress,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, "YBC execute proposal");
    };
  }
}

async function getYbcWriteRuntime() {
  const [
    { getAccount, getPublicClient },
    { simulateThenWrite },
    { wagmiConfig },
  ] = await Promise.all([
      import("wagmi/actions"),
      import("@/lib/tx/simulateWrite"),
      import("@/web3/wagmi"),
    ]);

  return {
    getAccount,
    getPublicClient,
    simulateThenWrite,
    wagmiConfig,
  };
}

function requireYbcPreparedAccount(account: Address | null): Address {
  if (!account) {
    throw new Error("Connect a wallet before preparing a YBC transaction.");
  }
  return account;
}

function assertYbcPreparedAccount(expected: Address, actual: Address): void {
  if (normalizeAddress(expected) !== normalizeAddress(actual)) {
    throw new Error(
      "The connected wallet changed after this YBC action was prepared. Review and try again."
    );
  }
}

function requireYbcFeedProposal(
  feed: YbcFeed,
  proposalId: bigint
): YbcFeedProposal {
  const proposal = feed.proposals.find(
    (candidate) => BigInt(candidate.id) === proposalId
  );
  if (!proposal) {
    throw new Error(`YBC proposal ${proposalId} is not in the validated feed.`);
  }
  return proposal;
}

function requireYbcMainnetPublicClient(
  publicClient: PublicClient | undefined
): PublicClient {
  if (!publicClient) {
    throw new Error("Ethereum Mainnet RPC is unavailable for YBC validation.");
  }
  assertYbcMainnetPublicClient(publicClient);
  return publicClient;
}

async function assertYbcProposalReadyForWrite(
  publicClient: PublicClient,
  proposal: YbcFeedProposal,
  expectedStatus: YbcProposalStatusFlag,
  actionLabel: string
): Promise<void> {
  assertYbcMainnetPublicClient(publicClient);
  const proposalId = BigInt(proposal.id);
  const [numProposals, canonicalProposal, status] = await Promise.all([
    publicClient.readContract({
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      abi: YbcElectionAbi,
      functionName: "num_proposals",
    }),
    publicClient.readContract({
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      abi: YbcElectionAbi,
      functionName: "proposals",
      args: [proposalId] as const,
    }),
    publicClient.readContract({
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      abi: YbcElectionAbi,
      functionName: "status",
      args: [proposalId] as const,
    }),
  ]);

  if (proposalId >= numProposals) {
    throw new Error(`YBC proposal ${proposal.id} does not exist on mainnet.`);
  }
  assertYbcProposalIdentityMatchesFeed(proposal, canonicalProposal);

  const statusFlag = coerceProposalStatus(status);
  if (statusFlag !== expectedStatus) {
    throw new Error(
      `YBC proposal ${proposal.id} is no longer ready for ${actionLabel}. Refresh before trying again.`
    );
  }
}

export function mapYbcFeedToPageState(
  feed: YbcFeed,
  account: Address | null = null,
  options: YbcMapOptions = {}
): YbcPageState {
  assertYbcMainnetDeployment(feed);
  assertCompleteYbcProposalHistory(feed);
  const normalizedAccount = account ? normalizeAddress(account) : null;
  const members = feed.members.map((member) => mapMember(feed, member));
  const currentMember =
    normalizedAccount === null
      ? null
      : members.find(
          (member) => normalizeAddress(member.address) === normalizedAccount
        ) ?? null;
  const currentFeedMember = feedMemberForAddress(feed, account);
  const actionStateTrusted =
    options.actionStateTrusted === true &&
    options.canonicalBlockTimestamp !== undefined;
  const feedActiveMember =
    currentMember?.status !== "removed" && currentMember !== null;
  const isActiveMember = options.walletOverlay?.isMember ?? feedActiveMember;
  const isMainnetAccount =
    normalizedAccount !== null &&
    (options.walletChainId === undefined ||
      options.walletChainId === MAINNET_CHAIN_ID);
  const operatorAddresses = new Set(feed.config.operators.map(normalizeAddress));
  const isOperator =
    options.walletOverlay?.isOperator ??
    (normalizedAccount !== null && operatorAddresses.has(normalizedAccount));
  const effectiveWeightRaw =
    options.walletOverlay?.weight ??
    BigInt(feedMemberForAddress(feed, account)?.effectiveWeight ?? "0");
  const snapshotTimestamp =
    options.canonicalBlockTimestamp ?? feed.generatedAt;
  const canonicalEpoch = getYbcEpochWindowAt(snapshotTimestamp);
  const proposals = feed.proposals.map((proposal) =>
    mapProposal(proposal, {
      account,
      normalizedAccount,
      currentEpoch: canonicalEpoch.epoch,
      actionStateTrusted,
      isActiveMember,
      isMainnetAccount,
      effectiveWeightRaw,
      votedByProposalId: options.walletOverlay?.votedByProposalId ?? {},
      proposalStatusById:
        options.walletOverlay?.proposalStatusById ??
        options.proposalStatusById ??
        {},
      feedVotes: feed.votes,
    })
  );
  const activeProposalCount = proposals.filter(
    (proposal) => proposal.phase === "discussion" || proposal.phase === "voting"
  ).length;
  const awaitingExecutionCount = proposals.filter(
    (proposal) => proposal.phase === "awaiting-execution"
  ).length;
  const terminalCount = proposals.filter((proposal) =>
    TERMINAL_PHASES.has(proposal.phase)
  ).length;
  const meWeight =
    currentMember && options.walletOverlay?.weight !== undefined
      ? {
          ...currentMember.weight,
          rawStaked:
            options.walletOverlay.staked === null
              ? currentMember.weight.rawStaked
              : fromBaseUnits(options.walletOverlay.staked.toString()),
          effectiveWeight:
            options.walletOverlay.weight === null
              ? currentMember.weight.effectiveWeight
              : fromBaseUnits(options.walletOverlay.weight.toString()),
        }
      : currentMember?.weight ?? ZERO_WEIGHT;
  const pendingRewards = currentMember
    ? currentMember.weight.rawStaked === "0"
      ? "0"
      : fromBaseUnits(
          currentFeedMember?.pendingRewards ?? "0"
        )
    : "0";
  const activeMembers = members.filter((member) => member.status !== "removed");
  const effectiveWeightTotal = sumDisplayAmounts(
    activeMembers.map((member) => member.weight.effectiveWeight)
  );

  const data: YbcMockDataV1 = {
    version: 1,
    generatedAt: feed.generatedAt,
    asOf: snapshotTimestamp,
    epoch: {
      current: canonicalEpoch.epoch,
      startsAt: canonicalEpoch.startsAt,
      endsAt: canonicalEpoch.endsAt,
    },
    hero: {
      collectiveAddress: YBC_MAINNET_DEPLOYMENT.ybc,
      memberCount: activeMembers.length,
      internalWeight: effectiveWeightTotal,
      delegatedWeight: "0",
      totalInfluence: effectiveWeightTotal,
      currentEpoch: canonicalEpoch.epoch,
      activeProposalCount,
      awaitingExecutionCount,
    },
    me: {
      address: account,
      isMember: isActiveMember,
      isOperator,
      canPropose:
        actionStateTrusted && isActiveMember && isMainnetAccount,
      canVote:
        actionStateTrusted &&
        isActiveMember &&
        isMainnetAccount &&
        effectiveWeightRaw > 0n,
      weight: meWeight,
      pendingRewards,
    },
    roster: {
      totals: {
        rawStaked: sumDisplayAmounts(
          activeMembers.map((member) => member.weight.rawStaked)
        ),
        effectiveWeight: effectiveWeightTotal,
        targetWeight: sumDisplayAmounts(
          activeMembers.map((member) => member.weight.targetWeight)
        ),
        rampingMemberCount: members.filter(
          (member) =>
            member.status === "ramping" && Number(member.weight.targetWeight) > 0
        ).length,
      },
      members,
    },
    proposals: {
      summary: {
        activeCount: activeProposalCount,
        awaitingExecutionCount,
        terminalCount,
      },
      items: proposals,
    },
    rewards: mapRewards(
      feed,
      pendingRewards,
      currentFeedMember?.pendingRewards ?? "0",
      isActiveMember,
      snapshotTimestamp
    ),
    admin: mapAdmin(feed, isOperator, snapshotTimestamp),
  };

  return {
    scenarioId: isOperator
      ? "operator-admin"
      : currentMember?.status === "ramping"
        ? "member-ramping"
      : isActiveMember
        ? "member-matured"
        : "observer",
    label: "YBC feed",
    data,
  };
}

function mapMember(feed: YbcFeed, member: YbcFeedMember): YbcMemberRecord {
  const weight = mapWeight(member);

  return {
    address: member.address as Address,
    ens: null,
    status: mapMemberStatus(member, weight),
    joinedAt: member.addedAt ?? feed.generatedAt,
    weight,
    sources: {
      stYFI: weight.rawStaked,
      stYFIx: "0",
      migratedVeYfi: "0",
    },
  };
}

function mapWeight(member: YbcFeedMember): YbcWeightRecord {
  const targetRaw = BigInt(member.upstreamStaked);
  const effectiveRaw = BigInt(member.effectiveWeight);
  const maturityBps =
    targetRaw === 0n
      ? 10_000
      : member.weightMaturityBps > 0
        ? member.weightMaturityBps
        : Number((effectiveRaw * 10_000n) / targetRaw);

  return {
    rawStaked: fromBaseUnits(member.upstreamStaked),
    effectiveWeight: fromBaseUnits(member.effectiveWeight),
    targetWeight: fromBaseUnits(member.upstreamStaked),
    maturityBps: clampBps(maturityBps),
    maturesAt: member.maturesAt,
  };
}

function mapMemberStatus(
  member: YbcFeedMember,
  weight: YbcWeightRecord
): YbcMemberStatus {
  if (member.status === "removed") return "removed";
  if (Number(weight.targetWeight) > 0 && weight.maturityBps < 10_000) {
    return "ramping";
  }
  return "active";
}

function mapProposal(
  proposal: YbcFeedProposal,
  context: YbcProposalActionContext
): YbcProposalRecord {
  const phase = mapProposalPhase(proposal, context.proposalStatusById[proposal.id]);
  const outcome = mapProposalOutcome(phase, proposal);
  const proposalEpoch = getYbcEpochWindow(proposal.epoch);
  const createdAt =
    proposal.proposedAt ??
    proposalEpoch.startsAt;

  return {
    id: `YBC-${proposal.id}`,
    type: proposal.addition ? "addition" : "expulsion",
    targetAccount: proposal.account as Address,
    proposer: proposal.proposer as Address,
    epoch: proposal.epoch,
    phase,
    outcome,
    thresholdBps: proposal.thresholdBps,
    votes: {
      total: fromBaseUnits(proposal.votes),
      yea: fromBaseUnits(proposal.yea),
      nay: fromBaseUnits(proposal.nay),
    },
    timing: {
      createdAt,
      discussionStartsAt: createdAt,
      votingStartsAt: proposalEpoch.votingStartsAt,
      votingEndsAt: proposalEpoch.endsAt,
      executionOpensAt: proposalEpoch.endsAt,
      expiresAt:
        proposalEpoch.endsAt +
        YBC_MAINNET_DEPLOYMENT.epochLengthSeconds,
    },
    actions: {
      ...deriveProposalActions(proposal, phase, context),
    },
  };
}

function mapProposalPhase(
  proposal: YbcFeedProposal,
  statusFlag: YbcProposalStatusFlag | null | undefined
): YbcProposalPhase {
  if (statusFlag !== null && statusFlag !== undefined) {
    return mapStatusFlagToProposalPhase(statusFlag);
  }

  if (proposal.executed) return "executed";
  if (proposal.retracted) return "retracted";

  switch (proposal.status) {
    case "proposed":
      return "discussion";
    case "voting":
      return "voting";
    case "passed":
      return "awaiting-execution";
    case "executed":
      return "executed";
    case "expired":
      return "expired";
    case "failed":
      return "failed";
    case "retracted":
      return "retracted";
    case "unknown":
      return "failed";
  }
}

function mapStatusFlagToProposalPhase(
  statusFlag: YbcProposalStatusFlag
): YbcProposalPhase {
  switch (statusFlag) {
    case YBC_PROPOSAL_STATUS.PROPOSED:
      return "discussion";
    case YBC_PROPOSAL_STATUS.RETRACTED:
      return "retracted";
    case YBC_PROPOSAL_STATUS.VOTING:
      return "voting";
    case YBC_PROPOSAL_STATUS.PASSED:
      return "awaiting-execution";
    case YBC_PROPOSAL_STATUS.EXECUTED:
      return "executed";
    case YBC_PROPOSAL_STATUS.EXPIRED:
      return "expired";
    case YBC_PROPOSAL_STATUS.FAILED:
    case YBC_PROPOSAL_STATUS.INVALID:
      return "failed";
  }
}

function mapProposalOutcome(
  phase: YbcProposalPhase,
  proposal: YbcFeedProposal
): YbcProposalOutcome {
  if (phase === "awaiting-execution" || phase === "executed" || phase === "expired") {
    return "passed";
  }
  if (phase === "failed" || phase === "retracted") {
    return "failed";
  }
  if (BigInt(proposal.votes) === 0n) {
    return "pending";
  }
  return BigInt(proposal.yea) * 10_000n >=
    BigInt(proposal.votes) * BigInt(proposal.thresholdBps)
    ? "passing"
    : "failing";
}

function mapRewards(
  feed: YbcFeed,
  pendingRewards: string,
  pendingRewardsRaw: string,
  isActiveMember: boolean,
  snapshotTimestamp: number
): YbcMockDataV1["rewards"] {
  return {
    token: {
      symbol: "YFI",
      address: YBC_MAINNET_DEPLOYMENT.rewardToken,
      decimals: 18,
    },
    claimable: pendingRewards,
    accruing: fromBaseUnits(feed.rewards.totalPendingRewards),
    lastUpdatedAt: snapshotTimestamp,
    claim: {
      mode: "shared-claim-surface",
      href: "/styfi",
      ctaLabel: "Open shared rewards",
      disabledReason: isActiveMember
        ? BigInt(pendingRewardsRaw) > 0n
          ? null
          : "No YBC rewards are claimable yet."
        : "Connect a member wallet to view claimable rewards.",
    },
    periods: [],
  };
}

function mapAdmin(
  feed: YbcFeed,
  isOperator: boolean,
  snapshotTimestamp: number
): YbcAdminRecord {
  return {
    isOperator,
    operators: feed.config.operators.map((operator) => ({
      address: operator as Address,
      ens: null,
      role: "operator",
    })),
    thresholds: {
      additionBps: feed.config.additionThresholdBps,
      expulsionBps: feed.config.expulsionThresholdBps,
    },
    hooks: {
      membershipHook: (feed.config.hooks ?? ZERO_ADDRESS) as Address,
      rewardsDistributor: YBC_MAINNET_DEPLOYMENT.ybcRewardDistributor,
      bonusRecipient: YBC_MAINNET_DEPLOYMENT.ybcBonusRecipient,
    },
    scopedOperations: [
      {
        id: "add-member",
        label: "Add member",
        enabled: false,
      },
      {
        id: "remove-member",
        label: "Remove member",
        enabled: false,
      },
    ],
    rewardStatus: {
      distributorFunded: !feed.config.rewardDistributorKilled,
      lastSyncedAt: snapshotTimestamp,
    },
  };
}

function feedMemberForAddress(
  feed: YbcFeed,
  account: Address | null | undefined
) {
  if (!account) return null;
  const normalized = normalizeAddress(account);
  return (
    feed.members.find((member) => normalizeAddress(member.address) === normalized) ??
    null
  );
}

function deriveProposalActions(
  proposal: YbcFeedProposal,
  phase: YbcProposalPhase,
  context: YbcProposalActionContext
): YbcProposalRecord["actions"] {
  if (!context.account || !context.normalizedAccount) {
    return {
      canRetract: false,
      canVote: false,
      canExecute: false,
      nextAction: "none",
      disabledReason: "Connect a wallet to act on this proposal.",
    };
  }

  if (!context.isMainnetAccount) {
    return {
      canRetract: false,
      canVote: false,
      canExecute: false,
      nextAction: "none",
      disabledReason: "Switch to Ethereum Mainnet to act on this proposal.",
    };
  }

  if (!context.actionStateTrusted) {
    return {
      canRetract: false,
      canVote: false,
      canExecute: false,
      nextAction: "none",
      disabledReason:
        "The current YBC snapshot is not trusted for actions. Refresh before continuing.",
    };
  }

  if (TERMINAL_PHASES.has(phase)) {
    return {
      canRetract: false,
      canVote: false,
      canExecute: false,
      nextAction: "none",
      disabledReason: "This proposal is terminal.",
    };
  }

  if (phase === "discussion") {
    const isProposer =
      normalizeAddress(proposal.proposer) === context.normalizedAccount;
    const canRetract =
      isProposer && context.currentEpoch < proposal.epoch;

    return {
      canRetract,
      canVote: false,
      canExecute: false,
      nextAction: canRetract ? "retract" : "none",
      disabledReason: canRetract
        ? null
        : isProposer
          ? "The retract window has closed."
          : "Only the proposer can retract during discussion.",
    };
  }

  if (phase === "voting") {
    const hasVoted = getHasVoted(proposal.id, context);
    const isOwnExpulsion =
      !proposal.addition &&
      normalizeAddress(proposal.account) === context.normalizedAccount;

    if (!context.isActiveMember) {
      return {
        canRetract: false,
        canVote: false,
        canExecute: false,
        nextAction: "none",
        disabledReason: "Only current YBC members can vote.",
      };
    }

    if (isOwnExpulsion) {
      return {
        canRetract: false,
        canVote: false,
        canExecute: false,
        nextAction: "none",
        disabledReason: "Members cannot vote on their own expulsion.",
      };
    }

    if (hasVoted) {
      return {
        canRetract: false,
        canVote: false,
        canExecute: false,
        nextAction: "none",
        disabledReason: "This wallet has already voted.",
      };
    }

    if (context.effectiveWeightRaw <= 0n) {
      return {
        canRetract: false,
        canVote: false,
        canExecute: false,
        nextAction: "none",
        disabledReason: "This wallet has no live voting weight.",
      };
    }

    return {
      canRetract: false,
      canVote: true,
      canExecute: false,
      nextAction: "vote",
      disabledReason: null,
    };
  }

  if (phase === "awaiting-execution") {
    return {
      canRetract: false,
      canVote: false,
      canExecute: true,
      nextAction: "execute",
      disabledReason: null,
    };
  }

  return {
    canRetract: false,
    canVote: false,
    canExecute: false,
    nextAction: "none",
    disabledReason: "No proposal action is currently available.",
  };
}

function getHasVoted(
  proposalId: number,
  context: YbcProposalActionContext
): boolean {
  const overlayVote = context.votedByProposalId[proposalId];
  if (overlayVote !== null && overlayVote !== undefined) {
    return overlayVote;
  }

  if (!context.normalizedAccount) {
    return false;
  }

  return context.feedVotes.some(
    (vote) =>
      vote.proposalId === proposalId &&
      normalizeAddress(vote.voter) === context.normalizedAccount
  );
}

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function getYbcEpochWindowAt(timestamp: number) {
  const elapsedSeconds = Math.max(
    0,
    timestamp - YBC_MAINNET_DEPLOYMENT.genesis
  );
  const epoch =
    Math.floor(
      elapsedSeconds / YBC_MAINNET_DEPLOYMENT.epochLengthSeconds
    );
  return getYbcEpochWindow(epoch);
}

function getYbcEpochWindow(epoch: number) {
  const normalizedEpoch = Math.max(0, epoch);
  const startsAt =
    YBC_MAINNET_DEPLOYMENT.genesis +
    normalizedEpoch * YBC_MAINNET_DEPLOYMENT.epochLengthSeconds;
  const endsAt =
    startsAt + YBC_MAINNET_DEPLOYMENT.epochLengthSeconds;
  return {
    epoch: normalizedEpoch,
    startsAt,
    endsAt,
    votingStartsAt:
      endsAt - YBC_MAINNET_DEPLOYMENT.voteLengthSeconds,
  };
}

export function parseYbcProposalContractId(proposalId: string): bigint {
  const match = /^YBC-(\d+)$/.exec(proposalId);
  if (!match) {
    throw new Error(`Invalid YBC proposal id: ${proposalId}`);
  }
  return BigInt(match[1]);
}

export async function readYbcWalletOverlay(
  publicClient: PublicClient,
  feed: YbcFeed,
  account: Address,
  verifiedSnapshot?: YbcCanonicalSnapshot
): Promise<YbcWalletOverlay> {
  assertYbcMainnetDeployment(feed);
  assertYbcMainnetPublicClient(publicClient);
  const ybc = YBC_MAINNET_DEPLOYMENT.ybc;
  const election = YBC_MAINNET_DEPLOYMENT.ybcElection;
  const weightAggregator = YBC_MAINNET_DEPLOYMENT.ybcWeightAggregator;
  const snapshot =
    verifiedSnapshot ??
    (await readYbcCanonicalSnapshot(publicClient, feed));
  const blockNumber = snapshot.blockNumber;
  if (
    blockNumber !== BigInt(feed.blockNumber) ||
    snapshot.blockHash.toLowerCase() !== feed.blockHash.toLowerCase()
  ) {
    throw new Error(
      "The verified YBC snapshot does not match this feed payload."
    );
  }
  await verifyYbcSnapshotBlock(publicClient, feed);

  const [isMember, isOperator, staked, weight] = await Promise.all([
    readContractOrNull(publicClient, {
      address: ybc,
      abi: YbcAbi,
      functionName: "members",
      args: [account] as const,
      blockNumber,
    }),
    readContractOrNull(publicClient, {
      address: ybc,
      abi: YbcAbi,
      functionName: "operators",
      args: [account] as const,
      blockNumber,
    }),
    readContractOrNull(publicClient, {
      address: weightAggregator,
      abi: YbcWeightAggregatorAbi,
      functionName: "staked",
      args: [account] as const,
      blockNumber,
    }),
    readContractOrNull(publicClient, {
      address: weightAggregator,
      abi: YbcWeightAggregatorAbi,
      functionName: "weight",
      args: [account] as const,
      blockNumber,
    }),
  ]);
  const proposalEntries = await mapYbcInBatches(
    feed.proposals,
    YBC_PROPOSAL_READ_BATCH_SIZE,
    async (proposal) => {
      const proposalId = BigInt(proposal.id);
      const voted = await readContractOrNull(publicClient, {
          address: election,
          abi: YbcElectionAbi,
          functionName: "voted",
          args: [account, proposalId] as const,
          blockNumber,
        });

      return {
        proposalId: proposal.id,
        status: snapshot.proposalStatusById[proposal.id],
        voted: typeof voted === "boolean" ? voted : null,
      };
    }
  );
  await verifyYbcSnapshotBlock(publicClient, feed);

  if (
    typeof isMember !== "boolean" ||
    typeof isOperator !== "boolean" ||
    typeof staked !== "bigint" ||
    typeof weight !== "bigint" ||
    proposalEntries.some(
      (entry) =>
        entry.status === null ||
        entry.status === undefined ||
        entry.voted === null
    )
  ) {
    throw new Error(
      "One or more live YBC wallet reads failed. Actions are unavailable."
    );
  }

  return {
    isMember,
    isOperator,
    staked,
    weight,
    proposalStatusById: Object.fromEntries(
      proposalEntries.map((entry) => [entry.proposalId, entry.status])
    ) as Record<number, YbcProposalStatusFlag>,
    votedByProposalId: Object.fromEntries(
      proposalEntries.map((entry) => [entry.proposalId, entry.voted])
    ) as Record<number, boolean>,
  };
}

export async function readYbcCanonicalSnapshot(
  publicClient: PublicClient,
  feed: YbcFeed
): Promise<YbcCanonicalSnapshot> {
  assertYbcMainnetDeployment(feed);
  assertCompleteYbcProposalHistory(feed);
  const verifiedBlock = await verifyYbcSnapshotBlock(
    publicClient,
    feed
  );
  const blockNumber = verifiedBlock.blockNumber;
  const [
    numProposals,
    additionThreshold,
    expulsionThreshold,
  ] = await Promise.all([
    publicClient.readContract({
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      abi: YbcElectionAbi,
      functionName: "num_proposals",
      blockNumber,
    }),
    publicClient.readContract({
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      abi: YbcElectionAbi,
      functionName: "addition_threshold",
      blockNumber,
    }),
    publicClient.readContract({
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      abi: YbcElectionAbi,
      functionName: "expulsion_threshold",
      blockNumber,
    }),
  ]);

  if (numProposals !== BigInt(feed.events.proposalCount)) {
    throw new Error(
      "The YBC proposal count does not match the canonical snapshot."
    );
  }
  const additionThresholdBps = coerceYbcThresholdBps(
    additionThreshold,
    "addition"
  );
  const expulsionThresholdBps = coerceYbcThresholdBps(
    expulsionThreshold,
    "expulsion"
  );
  if (
    additionThresholdBps !== feed.config.additionThresholdBps ||
    expulsionThresholdBps !== feed.config.expulsionThresholdBps
  ) {
    throw new Error(
      "The YBC proposal thresholds do not match the canonical snapshot."
    );
  }

  const proposalEntries = await mapYbcInBatches(
    feed.proposals,
    YBC_PROPOSAL_READ_BATCH_SIZE,
    async (proposal) => {
      const proposalId = BigInt(proposal.id);
      if (proposalId >= numProposals) {
        throw new Error(`YBC proposal ${proposal.id} is outside the snapshot.`);
      }

      const [canonicalProposal, status] = await Promise.all([
        publicClient.readContract({
          address: YBC_MAINNET_DEPLOYMENT.ybcElection,
          abi: YbcElectionAbi,
          functionName: "proposals",
          args: [proposalId] as const,
          blockNumber,
        }),
        publicClient.readContract({
          address: YBC_MAINNET_DEPLOYMENT.ybcElection,
          abi: YbcElectionAbi,
          functionName: "status",
          args: [proposalId] as const,
          blockNumber,
        }),
      ]);

      assertYbcProposalSnapshotMatchesFeed(proposal, canonicalProposal);
      const statusFlag = coerceProposalStatus(status);
      if (
        statusFlag === null ||
        statusFlag === YBC_PROPOSAL_STATUS.INVALID
      ) {
        throw new Error(
          `YBC proposal ${proposal.id} has an invalid canonical status.`
        );
      }
      assertYbcProposalStatusMatchesFeed(proposal, statusFlag);

      return [proposal.id, statusFlag] as const;
    }
  );
  const finalVerifiedBlock = await verifyYbcSnapshotBlock(
    publicClient,
    feed
  );

  return {
    ...finalVerifiedBlock,
    additionThresholdBps,
    expulsionThresholdBps,
    proposalStatusById: Object.fromEntries(
      proposalEntries
    ) as Record<number, YbcProposalStatusFlag>,
  };
}

async function readContractOrNull<
  const TParameters extends Parameters<PublicClient["readContract"]>[0],
>(
  publicClient: PublicClient,
  parameters: TParameters
): Promise<Awaited<ReturnType<PublicClient["readContract"]>> | null> {
  try {
    return await publicClient.readContract(parameters);
  } catch (error) {
    console.warn("[ybc] wallet overlay read failed", error);
    return null;
  }
}

async function mapYbcInBatches<TItem, TResult>(
  items: readonly TItem[],
  batchSize: number,
  mapper: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    results.push(...(await Promise.all(batch.map(mapper))));
  }
  return results;
}

function coerceProposalStatus(value: unknown): YbcProposalStatusFlag | null {
  const status =
    typeof value === "bigint"
      ? Number(value)
      : typeof value === "number"
        ? value
        : null;

  if (status === null) {
    return null;
  }

  return Object.values(YBC_PROPOSAL_STATUS).includes(
    status as YbcProposalStatusFlag
  )
    ? (status as YbcProposalStatusFlag)
    : null;
}

function coerceYbcThresholdBps(
  value: unknown,
  label: string
): number {
  const threshold =
    typeof value === "bigint"
      ? Number(value)
      : typeof value === "number"
        ? value
        : Number.NaN;
  if (
    !Number.isInteger(threshold) ||
    threshold < 0 ||
    threshold > 10_000
  ) {
    throw new Error(
      `The canonical YBC ${label} threshold is invalid.`
    );
  }
  return threshold;
}

function assertValidYbcProposalTarget(target: Address) {
  if (!isAddress(target)) {
    throw new Error("Invalid YBC proposal target address.");
  }

  if (normalizeAddress(target) === ZERO_ADDRESS) {
    throw new Error("YBC proposal target cannot be the zero address.");
  }

  if (
    normalizeAddress(target) ===
    normalizeAddress(YBC_MAINNET_DEPLOYMENT.ybc)
  ) {
    throw new Error("YBC proposal target cannot be the YBC contract.");
  }
}

function fromBaseUnits(value: string) {
  const formatted = formatUnits(BigInt(value), 18);
  return trimDecimal(formatted, 4);
}

function trimDecimal(value: string, fractionDigits: number) {
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length === 0) return whole ?? "0";

  const trimmedFraction = fraction.slice(0, fractionDigits).replace(/0+$/, "");
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole ?? "0";
}

function sumDisplayAmounts(values: string[]) {
  const sum = values.reduce((total, value) => total + Number(value), 0);
  return Number.isFinite(sum) ? trimDecimal(String(sum), 4) : "0";
}

function clampBps(value: number) {
  return Math.min(Math.max(value, 0), 10_000);
}
