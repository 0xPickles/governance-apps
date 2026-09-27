import {
  ACTIVE_ALERT_DOMAIN_REGISTRATIONS,
  type ActiveAlertDomainId,
} from "./domain-registry";

export interface AlertsEnv {
  ALERT_STATE: DurableObjectNamespace;
  RPC_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  STYFI_TELEGRAM_CHAT_ID?: string;
  VEYFI_TELEGRAM_CHAT_ID?: string;
  YETH_TELEGRAM_CHAT_ID?: string;
  TEAMS_TELEGRAM_CHAT_ID?: string;
  YBC_TELEGRAM_CHAT_ID?: string;
  ALERTS_STYFI_ENABLED?: string;
  ALERTS_VEYFI_ENABLED?: string;
  ALERTS_YETH_ENABLED?: string;
  ALERTS_TEAMS_ENABLED?: string;
  ALERTS_YBC_ENABLED?: string;
  CONFIRMATIONS?: string;
  MAX_MESSAGES_PER_RUN?: string;
  MAX_RANGES_PER_RUN?: string;
  LOG_RANGE_SIZE?: string;
  YETH_DAILY_CHECKPOINT_BLOCKS?: string;
  YETH_DAILY_MIN_DELTA_ETH?: string;
  ADMIN_TOKEN?: string;
}

export interface DomainConfig {
  readonly domainId: ActiveAlertDomainId;
  readonly enabled: boolean;
  readonly chatId: string | null;
}

export interface RuntimeConfig {
  readonly rpcUrl: string;
  readonly botToken: string;
  readonly confirmations: number;
  readonly maxMessagesPerRun: number;
  readonly maxRangesPerRun: number;
  readonly logRangeSize: number;
  readonly yethDailyCheckpointBlocks: number;
  readonly yethDailyMinDeltaWei: bigint;
}

const DOMAIN_ENV = {
  styfi: {
    enabled: "ALERTS_STYFI_ENABLED",
    chat: "STYFI_TELEGRAM_CHAT_ID",
  },
  veyfi: {
    enabled: "ALERTS_VEYFI_ENABLED",
    chat: "VEYFI_TELEGRAM_CHAT_ID",
  },
  yeth: {
    enabled: "ALERTS_YETH_ENABLED",
    chat: "YETH_TELEGRAM_CHAT_ID",
  },
  teams: {
    enabled: "ALERTS_TEAMS_ENABLED",
    chat: "TEAMS_TELEGRAM_CHAT_ID",
  },
  ybc: {
    enabled: "ALERTS_YBC_ENABLED",
    chat: "YBC_TELEGRAM_CHAT_ID",
  },
} as const;

function envValue(env: AlertsEnv, key: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[key];
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`alert_config_${label}_invalid`);
  }
  return parsed;
}

function ethToWei(value: string | undefined): bigint {
  const normalized = value?.trim() ?? "0.5";
  const match = /^(\d+)(?:\.(\d{1,18}))?$/.exec(normalized);
  if (match === null) throw new Error("alert_config_yeth_daily_delta_invalid");
  const whole = BigInt(match[1]!);
  const fraction = (match[2] ?? "").padEnd(18, "0");
  const wei = whole * 10n ** 18n + BigInt(fraction === "" ? "0" : fraction);
  if (wei <= 0n) throw new Error("alert_config_yeth_daily_delta_invalid");
  return wei;
}

export function domainConfigs(env: AlertsEnv): readonly DomainConfig[] {
  return ACTIVE_ALERT_DOMAIN_REGISTRATIONS.map(({ id }) => {
    const keys = DOMAIN_ENV[id];
    const isEnabled = enabled(envValue(env, keys.enabled));
    const rawChat = envValue(env, keys.chat)?.trim();
    return Object.freeze({
      domainId: id,
      enabled: isEnabled,
      chatId: rawChat && rawChat.length > 0 ? rawChat : null,
    });
  });
}

export function runtimeConfig(env: AlertsEnv): RuntimeConfig {
  const rpcUrl = env.RPC_URL?.trim() ?? "";
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (rpcUrl === "") throw new Error("alert_config_rpc_missing");
  if (botToken === "") throw new Error("alert_config_telegram_token_missing");
  return Object.freeze({
    rpcUrl,
    botToken,
    confirmations: integer(env.CONFIRMATIONS, 6, 6, 6, "confirmations"),
    maxMessagesPerRun: integer(
      env.MAX_MESSAGES_PER_RUN,
      5,
      1,
      5,
      "message_cap",
    ),
    maxRangesPerRun: integer(
      env.MAX_RANGES_PER_RUN,
      6,
      1,
      6,
      "range_cap",
    ),
    logRangeSize: integer(env.LOG_RANGE_SIZE, 10_000, 100, 10_000, "range_size"),
    yethDailyCheckpointBlocks: integer(
      env.YETH_DAILY_CHECKPOINT_BLOCKS,
      7_200,
      1_000,
      50_000,
      "yeth_checkpoint",
    ),
    yethDailyMinDeltaWei: ethToWei(env.YETH_DAILY_MIN_DELTA_ETH),
  });
}

export function isAuthorizedStatusRequest(request: Request, env: AlertsEnv): boolean {
  const token = env.ADMIN_TOKEN?.trim();
  return token !== undefined && token.length > 0 &&
    request.headers.get("authorization") === `Bearer ${token}`;
}
