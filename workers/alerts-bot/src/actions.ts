import type { ActiveAlertDomainId } from "./domain-registry";
import {
  isProductAlertAction,
  type AlertAction,
} from "./product-types";
import type { NormalizedAction } from "./types";

const DOMAIN_KINDS: Readonly<Record<ActiveAlertDomainId, ReadonlySet<string>>> = {
  styfi: new Set(["staked", "initiated_cooldown", "withdrew_from_cooldown"]),
  veyfi: new Set([
    "staked",
    "initiated_cooldown",
    "withdrew_from_cooldown",
    "redeem",
    "exchange",
    "migrate",
    "lock",
    "extension",
    "update",
    "legacy_withdraw",
    "penalty",
  ]),
  yeth: new Set([
    "yeth_claimed_stayed",
    "yeth_claimed_exited",
    "yeth_recovery_vault_withdraw",
    "yeth_debt_paid_down",
    "yeth_recovery_progress",
    "yeth_recovery_setback",
    "yeth_yield_capacity_up",
    "yeth_yield_capacity_down",
  ]),
  teams: new Set(),
  ybc: new Set(),
};

export function actionEventId(action: AlertAction): string {
  if (isProductAlertAction(action)) return action.eventId;
  return action.source.kind === "synthetic"
    ? action.source.metricId
    : `${action.txHash.toLowerCase()}:${action.logIndex}`;
}

export function isSuppressedCatalogueAction(action: AlertAction): boolean {
  if (isProductAlertAction(action)) return false;
  if (action.kind === "penalty") return true;
  return (
    action.kind === "update" &&
    action.amounts.amount !== undefined &&
    action.amounts.previousAmount !== undefined &&
    action.amounts.locktime !== undefined &&
    action.amounts.previousLocktime !== undefined &&
    action.amounts.amount === action.amounts.previousAmount &&
    action.amounts.locktime === action.amounts.previousLocktime
  );
}

export function actionPrincipal(action: NormalizedAction): string | null {
  return action.principal?.kind === "proven"
    ? action.principal.address.toLowerCase()
    : null;
}

export function actionUsesYfiUsdPrice(action: NormalizedAction): boolean {
  switch (action.kind) {
    case "staked":
    case "withdrew_from_cooldown":
    case "redeem":
    case "exchange":
    case "lock":
    case "legacy_withdraw":
      return true;
    case "initiated_cooldown":
      return action.tokenSymbol !== "stYFI" && action.tokenSymbol !== "stYFIx";
    case "update":
      return (
        action.amounts.amount !== undefined &&
        action.amounts.previousAmount !== undefined &&
        action.amounts.locktime !== undefined &&
        action.amounts.previousLocktime !== undefined &&
        action.amounts.amount > action.amounts.previousAmount &&
        action.amounts.locktime === action.amounts.previousLocktime
      );
    default:
      return false;
  }
}

export function validateDomainActions(
  domainId: ActiveAlertDomainId,
  actions: readonly AlertAction[],
): void {
  const ids = new Set<string>();
  let previousBlock = -1;
  let previousLogIndex = -1;
  for (const action of actions) {
    if (
      isProductAlertAction(action)
        ? action.domainId !== domainId
        : !DOMAIN_KINDS[domainId].has(action.kind)
    ) {
      throw new Error("alert_action_wrong_domain");
    }
    if (
      !Number.isSafeInteger(action.blockNumber) ||
      action.blockNumber < previousBlock ||
      (action.blockNumber === previousBlock && action.logIndex <= previousLogIndex)
    ) {
      throw new Error("alert_action_order_invalid");
    }
    const id = actionEventId(action);
    if (ids.has(id)) throw new Error("alert_action_duplicate");
    ids.add(id);
    previousBlock = action.blockNumber;
    previousLogIndex = action.logIndex;
  }
}
