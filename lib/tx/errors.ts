type NormalizedErrorCode =
  | "user_rejected"
  | "cooldown_not_ready"
  | "cap_exceeded"
  | "insufficient_balance"
  | "revert"
  | "network"
  | "unknown";

type NormalizedError = {
  code: NormalizedErrorCode;
  message: string;
};

export function normalizeTxError(raw: unknown): NormalizedError {
  if (!raw) return { code: "unknown", message: "Something went wrong" };

  const maybeObj =
    typeof raw === "object" && raw !== null
      ? (raw as { shortMessage?: string; message?: string; name?: string })
      : null;

  const text = (
    maybeObj?.shortMessage || maybeObj?.message || String(raw)
  ).toLowerCase();

  // A bounded pre-submission refresh is recoverable through review. Preserve its
  // explanation even when it mentions the RPC; it is not a transport failure.
  if (maybeObj?.name === "DaoPreparationChangedError") {
    return { code: "unknown", message: maybeObj.message ?? "Review the DAO action again." };
  }

  if (maybeObj?.name === "UserRejectedRequestError" || text.includes("rejected")) {
    return { code: "user_rejected", message: "Transaction cancelled." };
  }

  if (text.includes("cooldown") || text.includes("not complete")) {
    return {
      code: "cooldown_not_ready",
      message: "Cooldown isn’t ready yet.",
    };
  }

  if (
    (text.includes("cap") || text.includes("limit")) &&
    text.includes("exceed")
  ) {
    return {
      code: "cap_exceeded",
      message: "Redemption cap reached. Try a smaller amount or later.",
    };
  }

  if (text.includes("nothing claimable") || text.includes("nothing to claim")) {
    return {
      code: "insufficient_balance",
      message: "No claimable yETH recovery balance available.",
    };
  }

  if (
    text.includes("no recovery vault shares") ||
    text.includes("no shares to redeem")
  ) {
    return {
      code: "insufficient_balance",
      message: "No Recovery Vault shares available to redeem.",
    };
  }

  if (text.includes("insufficient vault liquidity")) {
    return {
      code: "revert",
      message: "Insufficient vault liquidity for this action.",
    };
  }

  if (text.includes("insufficient")) {
    return {
      code: "insufficient_balance",
      message: "Insufficient balance for this action.",
    };
  }

  if (text.includes("revert")) {
    return { code: "revert", message: "Transaction reverted." };
  }

  if (
    text.includes("network") ||
    text.includes("rpc") ||
    text.includes("http request failed") ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed")
  ) {
    return { code: "network", message: "Network issue. Please retry." };
  }

  return {
    code: "unknown",
    message: maybeObj?.shortMessage || maybeObj?.message || "Something went wrong",
  };
}

export type { NormalizedError, NormalizedErrorCode };
