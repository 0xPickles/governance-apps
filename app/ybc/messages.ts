export const ybcCopy = {
  app: {
    slug: "ybc",
    routeKey: "/ybc",
    displayLabel: "Yearn Builder's Collective",
    betaHost: "ybc-beta.dao-ops.com",
    productionHost: "ybc.yearn.fi",
  },
  page: {
    title: "Yearn Builder's Collective",
    description:
      "Review collective voting power, member weight, on-chain proposals, and rewards.",
    loadingTitle: "Loading collective influence",
    loadingBody:
      "Loading the YBC overview, members, and proposals.",
    errorTitle: "Unable to load collective influence",
    errorBody:
      "YBC data could not be loaded. Retry to restore the page.",
    retryCta: "Retry",
    refreshing: "Refreshing YBC data",
    lastUpdated: "Last updated",
    retrying: "Retrying",
  },
  proposalBoard: {
    title: "Proposal Board",
    description:
      "Review proposal timing, vote thresholds, and available actions.",
    emptyTitle: "No proposal history",
    emptyBody:
      "There are no active or past proposals right now.",
    emptyHint:
      "Member proposals will appear here during discussion, voting, and execution.",
    thresholdTitle: "Threshold guide",
    viewerTitle: "Current viewer",
    terminalTitle: "Expired proposals",
    terminalBody:
      "Expired proposals stay visible. Members must start a new proposal instead.",
    proposeAdditionCta: "Propose add member",
    proposeExpulsionCta: "Propose remove member",
    proposeAdditionDisabledCta: "Add proposal unavailable",
    proposeExpulsionDisabledCta: "Remove proposal unavailable",
    proposeDisabledBody:
      "This viewer cannot create member proposals.",
    targetLabel: "Target address",
    targetInvalid: "Enter a valid Ethereum address before proposing.",
    actionFailed: "The YBC action failed. Review the details and try again.",
    summary: {
      active: "Active",
      awaitingExecution: "Awaiting execution",
      terminal: "Terminal",
    },
  },
  rewards: {
    title: "Rewards",
    handoffBadge: "Shared claim route",
    summary: {
      pending: "Pending for this wallet",
      claimable: "Claimable on shared route",
      accruing: "Accruing this epoch",
    },
    periodsTitle: "Reward periods",
    viewerTitle: "Current viewer",
    handoffTitle: "Claim route",
    handoffBody:
      "YBC shows member and operator rewards. Claiming stays on the shared stYFI rewards route.",
    disabledClaimCta: "Shared rewards unavailable",
    rows: {
      role: "Role",
      pendingRewards: "Pending rewards",
      claimMode: "Claim mode",
      lastUpdated: "Last updated",
      claimable: "Claimable",
      earned: "Earned",
    },
    states: {
      observer: "Observer",
      member: "Member",
      operator: "Operator",
      sharedClaimMode: "Shared rewards route only",
      finalized: "Finalized",
      pending: "Accruing",
      memberWeight: "Member weight",
      operatorBonus: "Operator bonus",
      emptyMemberTitle: "No finalized YBC rewards yet",
      emptyMemberBody:
        "No finalized YBC reward periods are ready to claim yet.",
      emptyObserverTitle: "Connect a member wallet to view YBC rewards",
      emptyObserverBody:
        "Only member wallets with YBC rewards can use the claim route.",
      emptyUnseededTitle: "No YBC reward periods seeded",
      emptyUnseededBody:
        "Reward periods appear here after YBC distributions are finalized.",
    },
  },
  sections: {
    overview: "Overview",
    members: "Members",
    proposals: "Proposals",
    rewards: "Rewards",
    admin: "Operator",
  },
  hero: {
    summary: {
      collectiveLabel: "Total collective voting power",
      collectiveBody:
        "The current on-chain voting weight controlled by all active YBC members.",
    },
    stats: {
      members: "Members",
      epoch: "Current epoch",
      activeProposals: "Active proposals",
      awaitingExecution: "Awaiting execution",
    },
    perspective: {
      observerTitle: "Observer view",
      observerBody:
        "Read-only view of member weight and maturity.",
      memberTitle: "Member view",
      memberBody:
        "Raw stake, active weight, and target weight stay separate until maturity completes.",
      collectiveAddress: "Collective address",
      rawStaked: "Raw staked",
      effectiveWeight: "Effective weight",
      targetWeight: "Target weight",
      maturity: "Maturity",
    },
    states: {
      observer: "Observer",
      member: "Member",
    },
  },
  members: {
    title: "Members and weight",
    description:
      "Raw stake, effective weight, target weight, and maturity for every member.",
    totals: {
      rawStaked: "Raw staked",
      effectiveWeight: "Effective weight",
      targetWeight: "Target weight",
      rampingMembers: "Ramping members",
    },
    columns: {
      member: "Member",
      status: "Status",
      rawStaked: "Raw staked",
      effectiveWeight: "Effective weight",
      targetWeight: "Target weight",
      maturity: "Maturity",
    },
    alias: {
      edit: "Edit name",
      fieldLabel: "Local member name",
      browserOnly:
        "Saved only in this browser and never sent with a transaction. The Ethereum address remains canonical.",
      save: "Save",
      cancel: "Cancel",
      reset: "Reset",
      clearAll: "Clear all local names",
      invalid:
        "Enter a name from 1 to 40 characters without invisible or directional control characters.",
      storageError:
        "This browser could not save the name. Check its storage settings and try again.",
    },
    states: {
      active: "Active",
      ramping: "Ramping",
      pendingRemoval: "Pending removal",
      removed: "Removed",
      you: "You",
      fullyMatured: "Fully mature",
      maturesOn: "Full weight on",
      emptyTitle: "No members seeded",
      emptyBody:
        "Member records appear here once the collective has roster data.",
    },
  },
  operatorPanel: {
    title: "Operator Panel",
    description: "Manage member proposals and review governance configuration.",
    accessCard: {
      title: "Operator access required",
      body:
        "Operator access unlocks member controls and governance details.",
      viewerLabel: "Current viewer",
      controlsLabel: "Member controls",
      lockedValue: "Locked",
      hint: "Operator access is required to inspect the full panel.",
    },
    operationsTitle: "Member changes",
    operations: {
      addMember: {
        title: "Add member",
        cta: "Start add member flow",
      },
      removeMember: {
        title: "Remove member",
        cta: "Start remove member flow",
      },
    },
    operationEnabled: "Enabled",
    operationDisabled: "Unavailable",
    operatorsTitle: "Operators and management",
    roles: {
      operator: "Operator",
      management: "Management",
      you: "You",
    },
    viewerTitle: "Current operator viewer",
    viewer: {
      wallet: "Wallet",
      accessRole: "Access role",
      observerWallet: "No connected wallet",
      roles: {
        observer: "Observer",
        member: "Member",
        operator: "Operator",
      },
    },
    thresholdsTitle: "Membership thresholds",
    thresholds: {
      addition: "Add member",
      expulsion: "Remove member",
    },
    hooksTitle: "Governance hooks",
    hooks: {
      membershipHook: "Membership hook",
      rewardsDistributor: "Rewards distributor",
      bonusRecipient: "Bonus recipient",
    },
    rewardStatusTitle: "Reward wiring",
    rewardStatusBody:
      "Review distributor funding and bonus recipient status.",
    rewardStatus: {
      funded: "Distributor funded",
      unfunded: "Funding needed",
      lastSynced: "Last synced UTC",
    },
    guardrailsTitle: "Limits",
    guardrails: [
      "Add member and remove member proposal entry points",
      "Visible operators, thresholds, hooks, and reward status",
      "No generic arbitrary-call builder",
    ],
  },
} as const;
