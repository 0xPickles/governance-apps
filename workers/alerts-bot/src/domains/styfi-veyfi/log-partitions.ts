import type { Address, Hex } from "viem";

import {
  ERC20_TRANSFER_TOPIC,
  ERC4626_DEPOSIT_TOPIC,
  ERC4626_WITHDRAW_TOPIC,
  LEGACY_VEYFI_MODIFY_LOCK_TOPIC,
  LEGACY_VEYFI_PENALTY_TOPIC,
  LEGACY_VEYFI_WITHDRAW_TOPIC,
  LIQUID_LOCKER_EXCHANGE_TOPIC,
  LIQUID_LOCKER_REDEEM_TOPIC,
  VEYFI_DISTRIBUTOR_MIGRATE_TOPIC,
} from "../../abis";
import {
  LIQUID_LOCKER_DEPOSITORS,
  LIQUID_LOCKER_REDEMPTION,
  STYFI,
  STYFIX,
  VEYFI,
  VEYFI_REWARD_DISTRIBUTOR,
} from "../../contracts";

export interface AlertLogQueryPartition {
  readonly address: readonly Address[];
  readonly topics: readonly Hex[];
}

export const STYFI_LOG_QUERY_PARTITIONS: readonly AlertLogQueryPartition[] =
  Object.freeze([
    Object.freeze({
      address: Object.freeze([STYFI, STYFIX]),
      topics: Object.freeze([
        ERC4626_DEPOSIT_TOPIC,
        ERC4626_WITHDRAW_TOPIC,
        ERC20_TRANSFER_TOPIC,
      ]),
    }),
  ]);

export const VEYFI_LOG_QUERY_PARTITIONS: readonly AlertLogQueryPartition[] =
  Object.freeze([
    Object.freeze({
      address: Object.freeze([...LIQUID_LOCKER_DEPOSITORS]),
      topics: Object.freeze([
        ERC4626_DEPOSIT_TOPIC,
        ERC4626_WITHDRAW_TOPIC,
        ERC20_TRANSFER_TOPIC,
      ]),
    }),
    Object.freeze({
      address: Object.freeze([LIQUID_LOCKER_REDEMPTION]),
      topics: Object.freeze([
        LIQUID_LOCKER_REDEEM_TOPIC,
        LIQUID_LOCKER_EXCHANGE_TOPIC,
      ]),
    }),
    Object.freeze({
      address: Object.freeze([VEYFI_REWARD_DISTRIBUTOR]),
      topics: Object.freeze([VEYFI_DISTRIBUTOR_MIGRATE_TOPIC]),
    }),
    Object.freeze({
      address: Object.freeze([VEYFI]),
      topics: Object.freeze([
        LEGACY_VEYFI_MODIFY_LOCK_TOPIC,
        LEGACY_VEYFI_WITHDRAW_TOPIC,
        LEGACY_VEYFI_PENALTY_TOPIC,
      ]),
    }),
  ]);

export function yfiLogQueryPartitions(
  domainId: "styfi" | "veyfi",
): readonly AlertLogQueryPartition[] {
  return domainId === "styfi"
    ? STYFI_LOG_QUERY_PARTITIONS
    : VEYFI_LOG_QUERY_PARTITIONS;
}
