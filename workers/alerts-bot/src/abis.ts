import {
  parseAbi,
  parseAbiItem,
  toEventSelector,
  toFunctionSelector,
} from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const ERC20_TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed sender, address indexed receiver, uint256 value)",
);

export const ERC4626_DEPOSIT_EVENT = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);

export const ERC4626_WITHDRAW_EVENT = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);

export const LIQUID_LOCKER_REDEEM_EVENT = parseAbiItem(
  "event Redeem(address indexed token, uint256 amount, uint256 fee)",
);

export const LIQUID_LOCKER_EXCHANGE_EVENT = parseAbiItem(
  "event Exchange(address indexed token, uint256 amount)",
);

export const VEYFI_DISTRIBUTOR_MIGRATE_EVENT = parseAbiItem(
  "event Migrate(address indexed account, uint256 unlock_epoch, uint256 amount)",
);

export const LEGACY_VEYFI_MODIFY_LOCK_EVENT = parseAbiItem(
  "event ModifyLock(address indexed sender, address indexed user, uint256 amount, uint256 locktime, uint256 ts)",
);

export const LEGACY_VEYFI_WITHDRAW_EVENT = parseAbiItem(
  "event Withdraw(address indexed user, uint256 amount, uint256 ts)",
);

export const LEGACY_VEYFI_PENALTY_EVENT = parseAbiItem(
  "event Penalty(address indexed user, uint256 amount, uint256 ts)",
);
export const YETH_SET_CLAIM_EVENT = parseAbiItem(
  "event SetClaim(address indexed account, uint256 amount)",
);
export const YETH_CLAIM_EVENT = parseAbiItem(
  "event Claim(address indexed account, uint256 amount, uint256 underlying, uint256 shares)",
);

export const LEGACY_VEYFI_LOCKED_ABI = parseAbi([
  "function locked(address) view returns (uint256 amount, uint256 end)",
] as const);
export const COOLDOWN_STREAMS_ABI = parseAbi([
  "function streams(address account) view returns (uint256 start, uint256 total, uint256 claimed)",
] as const);
export const ERC20_BALANCE_OF_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
] as const);
export const ERC4626_TOTAL_ASSETS_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
] as const);
export const STYFI_EXIT_CALL_ABI = parseAbi([
  "function withdraw(uint256 assets) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function redeem(uint256 shares) returns (uint256 assets)",
  "function redeem(uint256 shares, address receiver) returns (uint256 assets)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",
] as const);
export const YETH_CLAIM_CALL_ABI = parseAbi([
  "function claim() returns (uint256 underlying, uint256 shares)",
  "function claim(bool _exit) returns (uint256 underlying, uint256 shares)",
] as const);
export const YETH_CLAIM_NO_ARGUMENTS_SELECTOR = toFunctionSelector("claim()");
export const YETH_CLAIM_EXIT_SELECTOR = toFunctionSelector("claim(bool)");

export const ERC20_TRANSFER_ABI = [ERC20_TRANSFER_EVENT] as const;
export const ERC4626_DEPOSIT_ABI = [ERC4626_DEPOSIT_EVENT] as const;
export const ERC4626_WITHDRAW_ABI = [ERC4626_WITHDRAW_EVENT] as const;
export const LIQUID_LOCKER_REDEEM_ABI = [LIQUID_LOCKER_REDEEM_EVENT] as const;
export const LIQUID_LOCKER_EXCHANGE_ABI = [LIQUID_LOCKER_EXCHANGE_EVENT] as const;
export const VEYFI_DISTRIBUTOR_MIGRATE_ABI = [
  VEYFI_DISTRIBUTOR_MIGRATE_EVENT,
] as const;
export const LEGACY_VEYFI_MODIFY_LOCK_ABI = [
  LEGACY_VEYFI_MODIFY_LOCK_EVENT,
] as const;
export const LEGACY_VEYFI_WITHDRAW_ABI = [LEGACY_VEYFI_WITHDRAW_EVENT] as const;
export const LEGACY_VEYFI_PENALTY_ABI = [LEGACY_VEYFI_PENALTY_EVENT] as const;
export const YETH_SET_CLAIM_ABI = [YETH_SET_CLAIM_EVENT] as const;
export const YETH_CLAIM_ABI = [YETH_CLAIM_EVENT] as const;

export const ERC20_TRANSFER_TOPIC = toEventSelector(ERC20_TRANSFER_EVENT);
export const ERC4626_DEPOSIT_TOPIC = toEventSelector(ERC4626_DEPOSIT_EVENT);
export const ERC4626_WITHDRAW_TOPIC = toEventSelector(ERC4626_WITHDRAW_EVENT);
export const LIQUID_LOCKER_REDEEM_TOPIC = toEventSelector(
  LIQUID_LOCKER_REDEEM_EVENT,
);
export const LIQUID_LOCKER_EXCHANGE_TOPIC = toEventSelector(
  LIQUID_LOCKER_EXCHANGE_EVENT,
);
export const VEYFI_DISTRIBUTOR_MIGRATE_TOPIC = toEventSelector(
  VEYFI_DISTRIBUTOR_MIGRATE_EVENT,
);
export const LEGACY_VEYFI_MODIFY_LOCK_TOPIC = toEventSelector(
  LEGACY_VEYFI_MODIFY_LOCK_EVENT,
);
export const LEGACY_VEYFI_WITHDRAW_TOPIC = toEventSelector(
  LEGACY_VEYFI_WITHDRAW_EVENT,
);
export const LEGACY_VEYFI_PENALTY_TOPIC = toEventSelector(
  LEGACY_VEYFI_PENALTY_EVENT,
);
export const YETH_SET_CLAIM_TOPIC = toEventSelector(YETH_SET_CLAIM_EVENT);
export const YETH_CLAIM_TOPIC = toEventSelector(YETH_CLAIM_EVENT);
