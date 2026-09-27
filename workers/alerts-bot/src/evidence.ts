import type { NormalizedAction } from "./types";

export type AlertEventTimeEvidence =
  | {
      readonly kind: "resolved";
      readonly blockNumber: number;
      readonly blockHash: string;
      readonly seconds: number;
    }
  | {
      readonly kind: "unavailable";
      readonly blockNumber: number;
      readonly blockHash: string;
    };

export type AlertEventBlockPriceEvidence =
  | {
      readonly kind: "available";
      readonly blockNumber: number;
      readonly blockHash: string;
      readonly yfiUsdCents: bigint;
    }
  | {
      readonly kind: "unavailable";
      readonly blockNumber: number;
      readonly blockHash: string;
      readonly reason: "not_found";
    };

export type AlertCoveFacilityEvidence =
  | {
      readonly kind: "available";
      readonly blockNumber: number;
      readonly blockHash: string;
      readonly yfiBalance: bigint;
      readonly coveYfiBalance: bigint;
    }
  | {
      readonly kind: "unavailable";
      readonly blockNumber: number;
      readonly blockHash: string;
    };

export function isCoveFacilityAction(action: NormalizedAction): boolean {
  return (
    action.tokenSymbol === "coveYFI" &&
    (action.kind === "exchange" || action.kind === "redeem")
  );
}
