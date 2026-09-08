import type { QueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { formatUnits, parseUnits } from "viem";
import type { StyfiClient, StyfiStakeMode } from "@/lib/clients/styfi/client";
import type { VeyfiClient } from "@/lib/clients/veyfi/client";
import type { YethClient, YethDebugPreset } from "@/lib/clients/yeth";
import type {
  DaoExecutionGuard,
  DaoMockAccountState,
  DaoMockScriptState,
  DaoMockAuthoringState,
  DaoMockContentState,
  DaoMockExecutionState,
  DaoMockFixtureId,
  DaoMockLifecycleState,
  DaoMockPersona,
  DaoMockProposalFlagsPatch,
  DaoMockProposalTimingPatch,
  DaoMockProposerState,
  DaoMockRole,
  DaoMockSurfaceState,
  DaoMockTransactionOutcome,
  DaoMockVetoState,
  DaoVoteDirection,
} from "@/lib/clients/dao/types";
import { GLOBAL_WORLD_STATE } from "@/lib/mocks/world-state";
import { setFixedNow } from "@/lib/mocks/time";
import { teamsKeys } from "@/lib/hooks/useTeams";
import { ybcKeys } from "@/lib/hooks/useYbc";
import { daoKeys } from "@/lib/hooks/daoKeys";
import { resetMockStyfiStore } from "@/lib/clients/styfi/mock";
import {
  resetMockVeyfiStore,
  setMockRedemptionCapsExhausted,
} from "@/lib/clients/veyfi/mock";
import { resetMockYethStore } from "@/lib/clients/yeth/mock";
import {
  MOCK_COVEYFI_ADDRESS,
  MOCK_SDYFI_ADDRESS,
  MOCK_UPYFI_ADDRESS,
  MOCK_YFI_ADDRESS,
} from "@/lib/constants";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";

// Known tokens for tests. Extend only when added to app logic.
export type TokenSymbol =
  | "YFI"
  | "stYFI"
  | "stYFIx"
  | "sdYFI"
  | "upYFI"
  | "coveYFI";

type BridgePatch = Record<string, unknown>;
type BridgeMutation<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Promise<void> | void;

export interface TeamsTestBridgeMethods {
  resetTeams?: () => Promise<void>;
  setTeamsViewerRole?: (role: string) => Promise<void>;
  setTeamsSelectedTeam?: (teamId: string | null) => Promise<void>;
  setTeamsLoading?: (value: boolean) => Promise<void>;
  setTeamsEmpty?: (value: boolean) => Promise<void>;
  setTeamsCurrentPeriod?: (period: number | null) => Promise<void>;
  patchTeamsTeam?: (teamId: string, patch: BridgePatch) => Promise<void>;
  patchTeamsFundingApproval?: (
    approvalId: string,
    patch: BridgePatch
  ) => Promise<void>;
  patchTeamsBonus?: (patch: BridgePatch) => Promise<void>;
  patchTeamsAdmin?: (patch: BridgePatch) => Promise<void>;
}

export interface YbcTestBridgeMethods {
  resetYbc?: () => Promise<void>;
  setYbcPerspective?: (perspective: string) => Promise<void>;
  setYbcLoading?: (value: boolean) => Promise<void>;
  setYbcEmptyRoster?: (value: boolean) => Promise<void>;
  setYbcEmptyBoard?: (value: boolean) => Promise<void>;
  setYbcEpoch?: (epoch: number) => Promise<void>;
  patchYbcMember?: (memberId: string, patch: BridgePatch) => Promise<void>;
  patchYbcProposal?: (proposalId: string, patch: BridgePatch) => Promise<void>;
  patchYbcRewards?: (patch: BridgePatch) => Promise<void>;
  patchYbcAdmin?: (patch: BridgePatch) => Promise<void>;
}

export interface DaoTestBridgeMethods {
  resetDao?: () => Promise<void>;
  getDaoState?: () => Promise<DaoTestStateSnapshot>;
  setDaoFixture?: (fixtureId: DaoMockFixtureId) => Promise<void>;
  setDaoSelectedProposal?: (proposalId: string) => Promise<void>;
  setDaoLoading?: (value: boolean) => Promise<void>;
  setDaoEmpty?: (value: boolean) => Promise<void>;
  setDaoSurface?: (surface: DaoMockSurfaceState) => Promise<void>;
  setDaoPersona?: (persona: DaoMockPersona) => Promise<void>;
  setDaoRole?: (role: DaoMockRole, enabled: boolean) => Promise<void>;
  setDaoContentState?: (state: DaoMockContentState) => Promise<void>;
  setDaoLifecycle?: (state: DaoMockLifecycleState) => Promise<void>;
  setDaoVetoState?: (state: DaoMockVetoState) => Promise<void>;
  setDaoAnalysisState?: (state: DaoMockScriptState) => Promise<void>;
  setDaoAccountState?: (state: DaoMockAccountState) => Promise<void>;
  setDaoAccountWeight?: (weight: string) => Promise<void>;
  setDaoAlreadyVoted?: (
    hasVoted: boolean,
    direction?: DaoVoteDirection | null
  ) => Promise<void>;
  setDaoExecutionState?: (state: DaoMockExecutionState) => Promise<void>;
  setDaoExecutionGuard?: (guard: DaoExecutionGuard) => Promise<void>;
  setDaoAuthoringState?: (state: DaoMockAuthoringState) => Promise<void>;
  setDaoProposerState?: (state: DaoMockProposerState) => Promise<void>;
  setDaoProposalVotes?: (
    totalWeight: string,
    yeaWeight: string
  ) => Promise<void>;
  setDaoProposalThreshold?: (thresholdBps: number) => Promise<void>;
  setDaoProposalFlags?: (flags: DaoMockProposalFlagsPatch) => Promise<void>;
  setDaoProposalTiming?: (timing: DaoMockProposalTimingPatch) => Promise<void>;
  setDaoProposerWeights?: (
    currentWeight: string,
    minimumWeight: string
  ) => Promise<void>;
  setDaoProposerBlacklist?: (blacklisted: boolean) => Promise<void>;
  setDaoProposerCooldown?: (
    lastProposedAt: number | null,
    cooldownSeconds: number
  ) => Promise<void>;
  setDaoProposalCapacity?: (index: number, count: number) => Promise<void>;
  setDaoTransactionOutcome?: (
    outcome: DaoMockTransactionOutcome
  ) => Promise<void>;
  indexDaoPendingAction?: () => Promise<void>;
  clearDaoPendingAction?: () => Promise<void>;
}

export type DaoTestStateSnapshot = {
  selectedFixtureId: DaoMockFixtureId | null;
  selectedProposalId: string;
  account: {
    address: Address;
    connected: boolean;
    correctChain: boolean;
    isProposer: boolean;
    isOperator: boolean;
    isGuardian: boolean;
  };
  proposal: {
    type: "signal" | "executable";
    protocolStatus: string;
    displayStatus: string;
    contentState: string;
    scriptHashVerified: boolean | null;
    scriptError: string | null;
  };
  capabilities: {
    canVote: boolean;
    votePurpose: string | null;
    canExecute: boolean;
  };
  proposer: {
    expectedVotingEpoch: string;
    affectedBoostEpochs: Array<{
      epoch: string;
      currentProposalCount: number;
      proposalLimit: number;
    }>;
  };
  executionGuard: DaoExecutionGuard;
  canonicalBlock: {
    number: string;
    hash: string;
    timestamp: number;
  };
};

type TestBridgeAdapterHooks = {
  onSetNow?: (timestamp: number) => Promise<void> | void;
};

export type TeamsTestBridgeAdapter = TeamsTestBridgeMethods &
  TestBridgeAdapterHooks;

export type YbcTestBridgeAdapter = YbcTestBridgeMethods &
  TestBridgeAdapterHooks;

export type DaoTestBridgeAdapter = DaoTestBridgeMethods &
  TestBridgeAdapterHooks;

type TestStateSnapshot = {
  balances: Record<TokenSymbol, string>;
  styfi: {
    active: string;
    cooldown: string;
    withdrawable: string;
  };
  veyfi: {
    legacyBalance: string;
    migrated: boolean;
    llyfi: Record<TokenSymbol, { staked: string; cooldown: string }>;
  };
  yeth: {
    snapshotLoss: string;
    claimableNow: string;
    recoveryShares: string;
  };
  isBlacklisted: boolean;
};

export interface TestBridge
  extends TeamsTestBridgeMethods,
    YbcTestBridgeMethods,
    DaoTestBridgeMethods {
  reset: () => Promise<void>;
  setNow: (timestamp: number) => Promise<void>;
  getState: (address: Address) => Promise<TestStateSnapshot>;
  setBalance: (
    address: Address,
    symbol: TokenSymbol,
    amount: string
  ) => Promise<void>;
  setAllowance: (
    address: Address,
    symbol: TokenSymbol,
    spender: Address,
    amount: string
  ) => Promise<void>;
  setScenario: (
    name: "standard" | "active" | "legacy_user" | "caps_exhausted"
  ) => Promise<void>;
  setYethPreset: (address: Address, preset: YethDebugPreset) => Promise<void>;
  seedExternalPortfolio: (address: Address) => Promise<void>;
}

type TestBridgeDeps = {
  styfi: StyfiClient;
  veyfi: VeyfiClient;
  yeth: YethClient;
  queryClient: QueryClient;
  teams?: TeamsTestBridgeAdapter;
  ybc?: YbcTestBridgeAdapter;
  dao?: DaoTestBridgeAdapter;
};

const TOKEN_DECIMALS: Record<TokenSymbol, number> = {
  YFI: 18,
  stYFI: 18,
  stYFIx: 18,
  sdYFI: 18,
  upYFI: 18,
  coveYFI: 18,
};

const LLYFI_ADDRESS: Record<"sdYFI" | "upYFI" | "coveYFI", Address> = {
  sdYFI: MOCK_SDYFI_ADDRESS,
  upYFI: MOCK_UPYFI_ADDRESS,
  coveYFI: MOCK_COVEYFI_ADDRESS,
};

function parseStrictAmount(value: string, decimals: number): bigint {
  if (!value) throw new Error("Amount is required.");
  if (value.includes(",")) {
    throw new Error("Invalid amount format. Commas are not allowed.");
  }
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error("Invalid amount format. Use digits and one decimal point.");
  }
  return parseUnits(value, decimals);
}

function formatStrictAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

function requireDebugMethod<T extends (...args: never[]) => unknown>(
  fn: T | undefined,
  name: string
): T {
  if (!fn) {
    throw new Error(`Test bridge requires mock clients. Missing ${name}.`);
  }
  return fn;
}

function resolveStyfiMode(symbol: TokenSymbol): StyfiStakeMode | null {
  if (symbol === "stYFI") return "stYFI";
  if (symbol === "stYFIx") return "stYFIx";
  return null;
}

function wrapBridgeMutation<TArgs extends unknown[]>(
  fn: BridgeMutation<TArgs> | undefined,
  invalidate: () => Promise<void>
): ((...args: TArgs) => Promise<void>) | undefined {
  if (!fn) {
    return undefined;
  }

  return async (...args: TArgs) => {
    await fn(...args);
    await invalidate();
  };
}

export function createTestBridge({
  styfi,
  veyfi,
  yeth,
  queryClient,
  teams,
  ybc,
  dao,
}: TestBridgeDeps): TestBridge {
  const debugSetStyfiBalance = requireDebugMethod(
    styfi.debugSetBalance?.bind(styfi),
    "styfi.debugSetBalance"
  );
  const debugSetStyfiAllowance = requireDebugMethod(
    styfi.debugSetAllowance?.bind(styfi),
    "styfi.debugSetAllowance"
  );
  const debugSetVeyfiAllowance = requireDebugMethod(
    veyfi.debugSetAllowance?.bind(veyfi),
    "veyfi.debugSetAllowance"
  );
  const debugSetPendingVeYfi = requireDebugMethod(
    veyfi.debugSetPendingVeYfi?.bind(veyfi),
    "veyfi.debugSetPendingVeYfi"
  );
  const debugSetLlyfiBalance = requireDebugMethod(
    veyfi.debugSetLlyfiBalance?.bind(veyfi),
    "veyfi.debugSetLlyfiBalance"
  );
  const debugSeedStakedExternalPortfolio = requireDebugMethod(
    veyfi.debugSeedStakedExternalPortfolio?.bind(veyfi),
    "veyfi.debugSeedStakedExternalPortfolio"
  );
  const debugSetYethPreset = requireDebugMethod(
    yeth.debugSetAccountPreset?.bind(yeth),
    "yeth.debugSetAccountPreset"
  );
  const invalidateTeams = () =>
    queryClient.invalidateQueries({
      queryKey: teamsKeys.all,
      refetchType: "all",
    });
  const invalidateYbc = () =>
    queryClient.invalidateQueries({
      queryKey: ybcKeys.all,
      refetchType: "all",
    });
  const invalidateDao = () =>
    queryClient.invalidateQueries({
      queryKey: daoKeys.all,
      refetchType: "all",
    });

  const reset = async () => {
    setFixedNow(null);
    resetMockStyfiStore();
    resetMockVeyfiStore();
    resetMockYethStore();
    await Promise.all([
      teams?.resetTeams?.(),
      ybc?.resetYbc?.(),
      dao?.resetDao?.(),
    ]);
    GLOBAL_WORLD_STATE.reset();
    await queryClient.resetQueries();
  };

  const setNow = async (timestamp: number) => {
    setFixedNow(timestamp);
    await Promise.all([
      teams?.onSetNow?.(timestamp),
      ybc?.onSetNow?.(timestamp),
      dao?.onSetNow?.(timestamp),
    ]);
    await queryClient.invalidateQueries({ refetchType: "all" });
  };

  const getState = async (address: Address) => {
    const [styfiState, veyfiState, yethState] = await Promise.all([
      styfi.getAccountState(address),
      veyfi.getAccountState(address),
      yeth.getAccountState(address),
    ]);
    const identity = GLOBAL_WORLD_STATE.get(address);
    const veYfi = veyfiState.veYfi ?? {
      legacyBalance: 0n,
      migrated: false,
    };

    const llyfiState = Object.fromEntries(
      veyfiState.llyfiTokens.map((token) => [
        token.symbol,
        {
          staked: formatStrictAmount(token.stakedBalance, 18),
          cooldown: formatStrictAmount(token.cooldownBalance, 18),
        },
      ])
    ) as Record<TokenSymbol, { staked: string; cooldown: string }>;

    return {
      balances: {
        YFI: formatStrictAmount(identity.yfiBalance, TOKEN_DECIMALS.YFI),
        stYFI: formatStrictAmount(
          styfiState.styfiActive +
            styfiState.styfiInCooldown +
            styfiState.styfiUnlocked,
          TOKEN_DECIMALS.stYFI
        ),
        stYFIx: formatStrictAmount(
          styfiState.styfiX.assetsActive +
            styfiState.styfiX.assetsInCooldown +
            styfiState.styfiX.assetsUnlocked,
          TOKEN_DECIMALS.stYFIx
        ),
        sdYFI: formatStrictAmount(
          veyfiState.llyfiTokens.find((t) => t.symbol === "sdYFI")
            ?.walletBalance ?? 0n,
          TOKEN_DECIMALS.sdYFI
        ),
        upYFI: formatStrictAmount(
          veyfiState.llyfiTokens.find((t) => t.symbol === "upYFI")
            ?.walletBalance ?? 0n,
          TOKEN_DECIMALS.upYFI
        ),
        coveYFI: formatStrictAmount(
          veyfiState.llyfiTokens.find((t) => t.symbol === "coveYFI")
            ?.walletBalance ?? 0n,
          TOKEN_DECIMALS.coveYFI
        ),
      },
      styfi: {
        active: formatStrictAmount(styfiState.styfiActive, 18),
        cooldown: formatStrictAmount(styfiState.styfiInCooldown, 18),
        withdrawable: formatStrictAmount(styfiState.styfiWithdrawable, 18),
      },
      veyfi: {
        legacyBalance: formatStrictAmount(veYfi.legacyBalance, 18),
        migrated: veYfi.migrated,
        llyfi: llyfiState,
      },
      yeth: {
        snapshotLoss: formatStrictAmount(yethState.snapshotLossEth, 18),
        claimableNow: formatStrictAmount(yethState.claimableNowEth, 18),
        recoveryShares: formatStrictAmount(yethState.recoveryVaultShares, 18),
      },
      isBlacklisted: identity.isBlacklisted,
    };
  };

  const setBalance = async (
    address: Address,
    symbol: TokenSymbol,
    amount: string
  ) => {
    const decimals = TOKEN_DECIMALS[symbol];
    const parsed = parseStrictAmount(amount, decimals);

    if (symbol === "YFI") {
      GLOBAL_WORLD_STATE.setYfi(address, parsed);
    } else if (symbol === "sdYFI" || symbol === "upYFI" || symbol === "coveYFI") {
      debugSetLlyfiBalance(address, symbol, parsed);
    } else {
      const mode = resolveStyfiMode(symbol);
      if (!mode) throw new Error(`Unsupported token symbol: ${symbol}`);
      const state = await styfi.getAccountState(address);
      const current =
        mode === "stYFI" ? state.styfiActive : state.styfiX.assetsActive;
      const delta = parsed - current;
      debugSetStyfiBalance(address, mode, delta);
    }

    await queryClient.invalidateQueries({ refetchType: "all" });
  };

  const setAllowance = async (
    address: Address,
    symbol: TokenSymbol,
    spender: Address,
    amount: string
  ) => {
    const decimals = TOKEN_DECIMALS[symbol];
    const parsed = parseStrictAmount(amount, decimals);

    const tokenAddress =
      symbol === "sdYFI" || symbol === "upYFI" || symbol === "coveYFI"
        ? LLYFI_ADDRESS[symbol]
        : MOCK_YFI_ADDRESS;

    debugSetStyfiAllowance(address, tokenAddress, spender, parsed);
    debugSetVeyfiAllowance(address, tokenAddress, spender, parsed);

    await queryClient.invalidateQueries({ refetchType: "all" });
  };

  const setScenario = async (
    name: "standard" | "active" | "legacy_user" | "caps_exhausted"
  ) => {
    await reset();

    if (name === "active") {
      GLOBAL_WORLD_STATE.setYfi(E2E_MOCK_ADDRESS, parseUnits("100", 18));
      debugSetStyfiBalance(E2E_MOCK_ADDRESS, "stYFI", parseUnits("25", 18));
    } else if (name === "legacy_user") {
      debugSetPendingVeYfi(parseUnits("100", 18));
    } else if (name === "caps_exhausted") {
      setMockRedemptionCapsExhausted();
    }

    await queryClient.invalidateQueries({ refetchType: "all" });
  };

  const seedExternalPortfolio = async (address: Address) => {
    debugSeedStakedExternalPortfolio(address);
    await queryClient.invalidateQueries({ refetchType: "all" });
  };

  const setYethPreset = async (address: Address, preset: YethDebugPreset) => {
    debugSetYethPreset(address, preset);
    await queryClient.invalidateQueries({ refetchType: "all" });
  };

  return {
    reset,
    setNow,
    getState,
    setBalance,
    setAllowance,
    setScenario,
    setYethPreset,
    seedExternalPortfolio,
    resetTeams: wrapBridgeMutation(teams?.resetTeams, invalidateTeams),
    setTeamsViewerRole: wrapBridgeMutation(
      teams?.setTeamsViewerRole,
      invalidateTeams
    ),
    setTeamsSelectedTeam: wrapBridgeMutation(
      teams?.setTeamsSelectedTeam,
      invalidateTeams
    ),
    setTeamsLoading: wrapBridgeMutation(teams?.setTeamsLoading, invalidateTeams),
    setTeamsEmpty: wrapBridgeMutation(teams?.setTeamsEmpty, invalidateTeams),
    setTeamsCurrentPeriod: wrapBridgeMutation(
      teams?.setTeamsCurrentPeriod,
      invalidateTeams
    ),
    patchTeamsTeam: wrapBridgeMutation(teams?.patchTeamsTeam, invalidateTeams),
    patchTeamsFundingApproval: wrapBridgeMutation(
      teams?.patchTeamsFundingApproval,
      invalidateTeams
    ),
    patchTeamsBonus: wrapBridgeMutation(teams?.patchTeamsBonus, invalidateTeams),
    patchTeamsAdmin: wrapBridgeMutation(teams?.patchTeamsAdmin, invalidateTeams),
    resetYbc: wrapBridgeMutation(ybc?.resetYbc, invalidateYbc),
    setYbcPerspective: wrapBridgeMutation(
      ybc?.setYbcPerspective,
      invalidateYbc
    ),
    setYbcLoading: wrapBridgeMutation(ybc?.setYbcLoading, invalidateYbc),
    setYbcEmptyRoster: wrapBridgeMutation(ybc?.setYbcEmptyRoster, invalidateYbc),
    setYbcEmptyBoard: wrapBridgeMutation(ybc?.setYbcEmptyBoard, invalidateYbc),
    setYbcEpoch: wrapBridgeMutation(ybc?.setYbcEpoch, invalidateYbc),
    patchYbcMember: wrapBridgeMutation(ybc?.patchYbcMember, invalidateYbc),
    patchYbcProposal: wrapBridgeMutation(ybc?.patchYbcProposal, invalidateYbc),
    patchYbcRewards: wrapBridgeMutation(ybc?.patchYbcRewards, invalidateYbc),
    patchYbcAdmin: wrapBridgeMutation(ybc?.patchYbcAdmin, invalidateYbc),
    resetDao: wrapBridgeMutation(dao?.resetDao, invalidateDao),
    getDaoState: dao?.getDaoState,
    setDaoFixture: wrapBridgeMutation(dao?.setDaoFixture, invalidateDao),
    setDaoSelectedProposal: wrapBridgeMutation(
      dao?.setDaoSelectedProposal,
      invalidateDao
    ),
    setDaoLoading: wrapBridgeMutation(dao?.setDaoLoading, invalidateDao),
    setDaoEmpty: wrapBridgeMutation(dao?.setDaoEmpty, invalidateDao),
    setDaoSurface: wrapBridgeMutation(dao?.setDaoSurface, invalidateDao),
    setDaoPersona: wrapBridgeMutation(dao?.setDaoPersona, invalidateDao),
    setDaoRole: wrapBridgeMutation(dao?.setDaoRole, invalidateDao),
    setDaoContentState: wrapBridgeMutation(
      dao?.setDaoContentState,
      invalidateDao
    ),
    setDaoLifecycle: wrapBridgeMutation(dao?.setDaoLifecycle, invalidateDao),
    setDaoVetoState: wrapBridgeMutation(dao?.setDaoVetoState, invalidateDao),
    setDaoAnalysisState: wrapBridgeMutation(
      dao?.setDaoAnalysisState,
      invalidateDao
    ),
    setDaoAccountState: wrapBridgeMutation(
      dao?.setDaoAccountState,
      invalidateDao
    ),
    setDaoAccountWeight: wrapBridgeMutation(
      dao?.setDaoAccountWeight,
      invalidateDao
    ),
    setDaoAlreadyVoted: wrapBridgeMutation(
      dao?.setDaoAlreadyVoted,
      invalidateDao
    ),
    setDaoExecutionState: wrapBridgeMutation(
      dao?.setDaoExecutionState,
      invalidateDao
    ),
    setDaoExecutionGuard: wrapBridgeMutation(
      dao?.setDaoExecutionGuard,
      invalidateDao
    ),
    setDaoAuthoringState: wrapBridgeMutation(
      dao?.setDaoAuthoringState,
      invalidateDao
    ),
    setDaoProposerState: wrapBridgeMutation(
      dao?.setDaoProposerState,
      invalidateDao
    ),
    setDaoProposalVotes: wrapBridgeMutation(
      dao?.setDaoProposalVotes,
      invalidateDao
    ),
    setDaoProposalThreshold: wrapBridgeMutation(
      dao?.setDaoProposalThreshold,
      invalidateDao
    ),
    setDaoProposalFlags: wrapBridgeMutation(
      dao?.setDaoProposalFlags,
      invalidateDao
    ),
    setDaoProposalTiming: wrapBridgeMutation(
      dao?.setDaoProposalTiming,
      invalidateDao
    ),
    setDaoProposerWeights: wrapBridgeMutation(
      dao?.setDaoProposerWeights,
      invalidateDao
    ),
    setDaoProposerBlacklist: wrapBridgeMutation(
      dao?.setDaoProposerBlacklist,
      invalidateDao
    ),
    setDaoProposerCooldown: wrapBridgeMutation(
      dao?.setDaoProposerCooldown,
      invalidateDao
    ),
    setDaoProposalCapacity: wrapBridgeMutation(
      dao?.setDaoProposalCapacity,
      invalidateDao
    ),
    setDaoTransactionOutcome: wrapBridgeMutation(
      dao?.setDaoTransactionOutcome,
      invalidateDao
    ),
    indexDaoPendingAction: wrapBridgeMutation(
      dao?.indexDaoPendingAction,
      invalidateDao
    ),
    clearDaoPendingAction: wrapBridgeMutation(
      dao?.clearDaoPendingAction,
      invalidateDao
    ),
  };
}
