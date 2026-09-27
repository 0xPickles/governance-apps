interface TelegramSendMessageResponse {
  ok?: boolean;
  error_code?: number;
  parameters?: {
    retry_after?: number;
  };
}

export type TelegramSendFailureKind =
  | "http_error"
  | "api_error"
  | "invalid_response";

export class TelegramRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("telegram_rate_limited");
    this.name = "TelegramRateLimitError";
  }
}

export class TelegramSendError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly telegramErrorCode: number | null,
    readonly kind: TelegramSendFailureKind,
  ) {
    super("telegram_send_failed");
    this.name = "TelegramSendError";
  }
}

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

export async function sendMessage(
  chatId: string,
  html: string,
  botToken: string,
): Promise<void> {
  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const payload =
    (await response.json().catch(() => null)) as TelegramSendMessageResponse | null;

  const retryAfter = safeInteger(payload?.parameters?.retry_after);
  if (
    response.status === 429 &&
    retryAfter !== null &&
    retryAfter > 0
  ) {
    throw new TelegramRateLimitError(retryAfter);
  }
  if (!response.ok || payload?.ok !== true) {
    throw new TelegramSendError(
      response.status,
      safeInteger(payload?.error_code),
      payload === null
        ? "invalid_response"
        : response.ok
          ? "api_error"
          : "http_error",
    );
  }
}
