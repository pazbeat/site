import "server-only";
import {
  normalizeWhatsAppChatId,
  type MessagingProvider,
  type MessengerFile,
} from "./types";

/**
 * ChatApp (chatapp.online) — провайдер WhatsApp (PRD §12 №5).
 * Поток: POST /v1/tokens (email+password+appId → accessToken 24ч) →
 * POST /v1/licenses/{licenseId}/messengers/{type}/chats/{chatId}/messages/text|file.
 * Токен кэшируется в памяти процесса и переполучается по истечении/401.
 *
 * Эндпоинты выверены по живому API (2026-07-13):
 *  - текст:  POST …/messages/text  body {text}
 *  - файл:   POST …/messages/file  body {file: URL, fileName, text}
 *    ВНИМАНИЕ: `file` — это ПУБЛИЧНЫЙ URL, который сервер ChatApp скачивает
 *    сам (бинарная/multipart-загрузка не поддерживается). На localhost URL
 *    недоступен извне → доставка файла падает; поэтому в delivery.ts она
 *    best-effort, а получателю всё равно уходит текст со ссылкой на PDF.
 */

const BASE_URL = process.env.CHATAPP_BASE_URL ?? "https://api.chatapp.online";

type Config = {
  email: string;
  password: string;
  appId: string;
  licenseId: string;
  messengerType: string;
};

function readConfig(): Config | null {
  const email = process.env.CHATAPP_EMAIL;
  const password = process.env.CHATAPP_PASSWORD;
  const appId = process.env.CHATAPP_APP_ID;
  const licenseId = process.env.CHATAPP_LICENSE_ID;
  if (!email || !password || !appId || !licenseId) return null;
  return {
    email,
    password,
    appId,
    licenseId,
    messengerType: process.env.CHATAPP_MESSENGER ?? "whatsapp",
  };
}

// Кэш токена на уровне процесса
let tokenCache: { accessToken: string; expiresAt: number } | null = null;

async function fetchToken(cfg: Config): Promise<string> {
  const response = await fetch(`${BASE_URL}/v1/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: cfg.email,
      password: cfg.password,
      appId: cfg.appId,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`chatapp_auth_failed ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    accessToken?: string;
    data?: { accessToken?: string };
  };
  const accessToken = data.accessToken ?? data.data?.accessToken;
  if (!accessToken) throw new Error("chatapp_auth_no_token");
  // accessToken живёт 24ч — кэшируем на 23ч
  tokenCache = { accessToken, expiresAt: Date.now() + 23 * 3600_000 };
  return accessToken;
}

async function getToken(cfg: Config): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }
  return fetchToken(cfg);
}

function chatUrl(cfg: Config, chatId: string, suffix: string): string {
  return `${BASE_URL}/v1/licenses/${cfg.licenseId}/messengers/${cfg.messengerType}/chats/${chatId}/${suffix}`;
}

/** Выполняет запрос с токеном; на 401 переполучает токен и повторяет один раз. */
async function authedFetch(
  cfg: Config,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let token = await getToken(cfg);
  let response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: token },
  });
  if (response.status === 401) {
    tokenCache = null;
    token = await fetchToken(cfg);
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: token },
    });
  }
  return response;
}

export class ChatAppProvider implements MessagingProvider {
  readonly id = "chatapp";

  isConfigured(): boolean {
    return readConfig() !== null;
  }

  async sendText(toPhone: string, text: string): Promise<void> {
    const cfg = readConfig();
    if (!cfg) throw new Error("chatapp_not_configured");
    const chatId = normalizeWhatsAppChatId(toPhone);
    const response = await authedFetch(
      cfg,
      chatUrl(cfg, chatId, "messages/text"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `chatapp_send_text_failed ${response.status}: ${body.slice(0, 200)}`,
      );
    }
  }

  async sendFile(
    toPhone: string,
    file: MessengerFile,
    caption?: string,
  ): Promise<void> {
    const cfg = readConfig();
    if (!cfg) throw new Error("chatapp_not_configured");
    if (!file.url) {
      // ChatApp качает файл по URL — без публичной ссылки отправить нельзя.
      throw new Error("chatapp_file_requires_url");
    }
    const chatId = normalizeWhatsAppChatId(toPhone);

    const response = await authedFetch(
      cfg,
      chatUrl(cfg, chatId, "messages/file"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: file.url,
          fileName: file.filename,
          ...(caption ? { text: caption } : {}),
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `chatapp_send_file_failed ${response.status}: ${body.slice(0, 200)}`,
      );
    }
  }
}
