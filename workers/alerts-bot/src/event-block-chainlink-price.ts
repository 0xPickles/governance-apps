import { encodeFunctionData, parseAbi, type Address } from "viem";
import type { AlertEventBlockPriceEvidence } from "./evidence";
import type { RpcClient } from "./rpc";

export interface AlertEventBlockPriceSource {
  readYfiUsdPrice(input: {
    readonly blockNumber: number;
    readonly blockHash: `0x${string}`;
    readonly timestamp: number;
  }): Promise<AlertEventBlockPriceEvidence>;
}

const CHAINLINK_AGGREGATOR_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
] as const);

/**
 * Ethereum mainnet YFI/USD proxy metadata from Chainlink's official mainnet
 * reference-data directory:
 * https://data.chain.link/feeds/ethereum/mainnet/yfi-usd
 * These values are deliberately source constants, never runtime configuration
 * or a current-price HTTP feed.
 */
export const CHAINLINK_YFI_USD_PROXY =
  "0xA027702dbb89fbd58938e4324ac03B58d812b0E1" as Address;
export const CHAINLINK_YFI_USD_DECIMALS = 8;
export const CHAINLINK_YFI_USD_HEARTBEAT_SECONDS = 86_400;
export const CHAINLINK_YFI_USD_DEVIATION_THRESHOLD_PERCENT = 1;

const LATEST_ROUND_DATA = encodeFunctionData({
  abi: CHAINLINK_AGGREGATOR_ABI,
  functionName: "latestRoundData",
});
const DECIMALS = encodeFunctionData({
  abi: CHAINLINK_AGGREGATOR_ABI,
  functionName: "decimals",
});
const UINT80_MAX = (1n << 80n) - 1n;
const UINT256_MODULUS = 1n << 256n;
const INT256_SIGN_BIT = 1n << 255n;
const PRICE_SCALE_TO_CENTS =
  10n ** BigInt(CHAINLINK_YFI_USD_DECIMALS - 2);
const MAX_PRICE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

function unavailable(input: Readonly<{
  readonly blockNumber: number;
  readonly blockHash: `0x${string}`;
}>): AlertEventBlockPriceEvidence {
  return Object.freeze({
    kind: "unavailable",
    blockNumber: input.blockNumber,
    blockHash: input.blockHash,
    reason: "not_found",
  });
}

function decodeRoundWords(value: string): readonly bigint[] {
  if (!/^0x[0-9a-fA-F]{320}$/.test(value)) {
    throw new Error("alert_chainlink_yfi_usd_result_invalid");
  }
  const words: bigint[] = [];
  for (let index = 0; index < 5; index += 1) {
    const start = 2 + index * 64;
    words.push(BigInt(`0x${value.slice(start, start + 64)}`));
  }
  return Object.freeze(words);
}

function decodeDecimals(value: string): bigint {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("alert_chainlink_yfi_usd_decimals_invalid");
  }
  const decimals = BigInt(value);
  if (decimals > 255n || decimals !== BigInt(CHAINLINK_YFI_USD_DECIMALS)) {
    throw new Error("alert_chainlink_yfi_usd_decimals_invalid");
  }
  return decimals;
}

function signedInt256(value: bigint): bigint {
  return value >= INT256_SIGN_BIT ? value - UINT256_MODULUS : value;
}

function exactBlockReference(blockHash: `0x${string}`) {
  return Object.freeze({ blockHash, requireCanonical: true as const });
}

export function createChainlinkYfiUsdPriceSource(
  rpc: RpcClient,
): AlertEventBlockPriceSource {
  return Object.freeze({
    readYfiUsdPrice: async (
      input: Parameters<AlertEventBlockPriceSource["readYfiUsdPrice"]>[0],
    ) => {
      const call = rpc.call.bind(rpc);
      const value = await call(
        Object.freeze([
          Object.freeze({
            to: CHAINLINK_YFI_USD_PROXY.toLowerCase(),
            data: LATEST_ROUND_DATA,
          }),
          Object.freeze({
            to: CHAINLINK_YFI_USD_PROXY.toLowerCase(),
            data: DECIMALS,
          }),
        ]),
        exactBlockReference(input.blockHash),
      );
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error("alert_chainlink_yfi_usd_result_invalid");
      }
      const words = decodeRoundWords(value[0]!);
      decodeDecimals(value[1]!);
      const [roundId, rawAnswer, startedAt, updatedAt, answeredInRound] = words;
      if (
        roundId === undefined ||
        rawAnswer === undefined ||
        startedAt === undefined ||
        updatedAt === undefined ||
        answeredInRound === undefined ||
        roundId > UINT80_MAX ||
        answeredInRound > UINT80_MAX
      ) {
        throw new Error("alert_chainlink_yfi_usd_result_invalid");
      }
      const answer = signedInt256(rawAnswer);
      const eventTimestamp = BigInt(input.timestamp);
      if (
        roundId === 0n ||
        answer <= 0n ||
        startedAt === 0n ||
        updatedAt === 0n ||
        answeredInRound < roundId ||
        startedAt > updatedAt ||
        updatedAt > eventTimestamp ||
        eventTimestamp - updatedAt >
          BigInt(CHAINLINK_YFI_USD_HEARTBEAT_SECONDS)
      ) {
        return unavailable(input);
      }
      const yfiUsdCents =
        (answer + PRICE_SCALE_TO_CENTS / 2n) / PRICE_SCALE_TO_CENTS;
      if (yfiUsdCents <= 0n) return unavailable(input);
      if (yfiUsdCents > MAX_PRICE_CENTS) {
        throw new Error("alert_chainlink_yfi_usd_price_out_of_range");
      }
      return Object.freeze({
        kind: "available",
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        yfiUsdCents,
      });
    },
  });
}

export function selectProductionYfiUsdPriceSource(params: {
  readonly sharedRpc: RpcClient | undefined;
  readonly injected: AlertEventBlockPriceSource | undefined;
}): AlertEventBlockPriceSource | undefined {
  if (params.injected !== undefined) return params.injected;
  return params.sharedRpc === undefined
    ? undefined
    : createChainlinkYfiUsdPriceSource(params.sharedRpc);
}
