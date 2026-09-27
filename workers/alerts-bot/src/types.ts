export type ActionKind =
  | "staked"
  | "initiated_cooldown"
  | "withdrew_from_cooldown"
  | "redeem"
  | "exchange"
  | "migrate"
  | "lock"
  | "extension"
  | "update"
  | "legacy_withdraw"
  | "penalty"
  | "yeth_claimed_stayed"
  | "yeth_claimed_exited"
  | "yeth_recovery_vault_withdraw"
  | "yeth_debt_paid_down"
  | "yeth_recovery_progress"
  | "yeth_recovery_setback"
  | "yeth_yield_capacity_up"
  | "yeth_yield_capacity_down";

export type YethWithdrawalType = "full" | "partial";

export type ActionPrincipalEvidence =
  | {
      readonly kind: "proven";
      readonly address: string;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "canonical_sender_unavailable";
    };

export type NormalizedActionSource =
  | {
      readonly kind: "onchain";
      readonly txHash: string;
      readonly logIndex: number;
    }
  | {
      readonly kind: "synthetic";
      readonly metricId: string;
      readonly blockHash: string;
      readonly orderingIndex: number;
    };

export interface ActionAmounts {
  assets?: bigint;
  shares?: bigint;
  amount?: bigint;
  // For liquid locker redemption events, this is a 1e18-scaled fee rate.
  fee?: bigint;
  penalty?: bigint;
  unlockEpoch?: bigint;
  locktime?: bigint;
  previousAmount?: bigint;
  previousLocktime?: bigint;
  yethSnapshotAmount?: bigint;
  yethUnderlyingAmount?: bigint;
  yethClaimShares?: bigint;
  yethSnapshotMoved?: bigint;
  yethTotalSnapshotDebtEth?: bigint;
  yethSnapshotExitedEth?: bigint;
  yethSnapshotStayedEth?: bigint;
  yethSnapshotUnclaimedEth?: bigint;
  yethOutstandingDebtEth?: bigint;
  yethYieldVaultAssetsEth?: bigint;
  yethSharesBurned?: bigint;
  yethOwnerSharesBefore?: bigint;
  yethOwnerSharesAfter?: bigint;
  yethPreviousOutstandingDebtEth?: bigint;
  yethCurrentOutstandingDebtEth?: bigint;
  yethPreviousRepaidPercentHundredths?: bigint;
  yethCurrentRepaidPercentHundredths?: bigint;
  yethPreviousRecoveryShortfallEth?: bigint;
  yethCurrentRecoveryShortfallEth?: bigint;
  yethPreviousRecoveryCoverageHundredths?: bigint;
  yethCurrentRecoveryCoverageHundredths?: bigint;
  yethPreviousRecoveryVaultAssetsEth?: bigint;
  yethCurrentRecoveryVaultAssetsEth?: bigint;
  yethRecoveryNetFlowEth?: bigint;
  yethRecoveryOrganicDeltaEth?: bigint;
  yethPreviousYieldVaultAssetsEth?: bigint;
  yethCurrentYieldVaultAssetsEth?: bigint;
  yethPreviousYieldCoverageHundredths?: bigint;
  yethCurrentYieldCoverageHundredths?: bigint;
  yethYieldNetFlowEth?: bigint;
  yethYieldOrganicDeltaEth?: bigint;
}

export interface NormalizedAction {
  kind: ActionKind;
  tokenSymbol: string;
  user: string | null;
  /** Canonical primary account evidence consumed by the WP3 context resolver. */
  principal?: ActionPrincipalEvidence;
  owner?: string;
  receiver?: string;
  caller?: string;
  amounts: ActionAmounts;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  /** Distinguishes linkable chain logs from block-level protocol metrics. */
  source: NormalizedActionSource;
  yethWithdrawalType?: YethWithdrawalType;
  /** Scanner-proven pre-event stream state for cooldown restart copy. */
  cooldownRestarted?: boolean;
}
