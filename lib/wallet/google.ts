import "server-only";
import type { PassFields } from "./pass";
import {
  buildOauthAssertion,
  buildSaveJwtPayload,
  signJwtRs256,
} from "./google-jwt";
import {
  buildGiftCardClass,
  buildGiftCardObject,
  buildGiftCardPatch,
  giftCardObjectId,
  type GoogleIds,
} from "./google-pass";

/**
 * Google Wallet: ссылка «Сохранить в Кошелёк» и обновление уже сохранённой
 * карты.
 *
 * Устроено проще, чем Apple. Ссылка — это подписанный JWT с картой внутри:
 * ничего заранее создавать не нужно, Google заводит и оформление, и саму
 * карту в момент первого сохранения. Обновление идёт обычным PATCH к их API:
 * рассылку по устройствам Google берёт на себя, своего APNs заводить не надо.
 *
 * Включается тремя переменными: идентификатор эмитента и почта с ключом
 * сервисного аккаунта. Нет их — кнопки Google на сайте просто не будет.
 */

const SAVE_URL = "https://pay.google.com/gp/v/save/";
const API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const REQUEST_TIMEOUT_MS = 15_000;

export type GoogleWalletConfig = GoogleIds & {
  clientEmail: string;
  privateKey: string;
};

export function readGoogleWalletConfig(): GoogleWalletConfig | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY?.trim();
  if (!issuerId || !clientEmail || !privateKey) return null;
  return {
    issuerId,
    clientEmail,
    privateKey,
    classSuffix: process.env.GOOGLE_WALLET_CLASS_SUFFIX?.trim() || "imbir-gift",
  };
}

export function isGoogleWalletConfigured(): boolean {
  return readGoogleWalletConfig() !== null;
}

/** Идентификатор карты на стороне Google; null — Google не настроен. */
export function googleObjectIdFor(serialNumber: string): string | null {
  const cfg = readGoogleWalletConfig();
  return cfg ? giftCardObjectId(cfg, serialNumber) : null;
}

/**
 * Ссылка «Сохранить в Google Кошелёк». Ничего не запрашивает по сети — карта
 * целиком лежит внутри подписанного токена.
 */
export function buildGoogleSaveUrl(input: {
  serialNumber: string;
  fields: PassFields;
  origin: string;
  now?: Date;
}): string | null {
  const cfg = readGoogleWalletConfig();
  if (!cfg) return null;
  const now = input.now ?? new Date();

  const jwt = signJwtRs256(
    buildSaveJwtPayload({
      clientEmail: cfg.clientEmail,
      origin: input.origin,
      giftCardClass: buildGiftCardClass(cfg, input.origin),
      giftCardObject: buildGiftCardObject({
        ids: cfg,
        serialNumber: input.serialNumber,
        fields: input.fields,
        now,
      }),
      now: now.getTime(),
    }),
    cfg.privateKey,
  );
  return `${SAVE_URL}${jwt}`;
}

/** Access-токен сервисного аккаунта. Кэшируем: он живёт час. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(cfg: GoogleWalletConfig): Promise<string> {
  const now = Date.now();
  // Минута запаса, чтобы не отправить запрос с токеном, истекающим в полёте
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.value;

  const assertion = signJwtRs256(
    buildOauthAssertion({ clientEmail: cfg.clientEmail, scope: SCOPE, now }),
    cfg.privateKey,
  );
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;
  if (!response.ok || !data?.access_token) {
    throw new Error(
      `google wallet: не выдан токен (${response.status}) ${data?.error_description ?? ""}`.trim(),
    );
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/**
 * Обновляет остаток и состояние уже сохранённой карты.
 *
 * Возвращает `missing`, если карты в Google нет: это не сбой, а обычное дело
 * — покупатель мог не нажать «Сохранить», и тогда обновлять нечего.
 */
export async function updateGoogleCard(input: {
  serialNumber: string;
  fields: PassFields;
  now?: Date;
}): Promise<"updated" | "missing" | "skipped"> {
  const cfg = readGoogleWalletConfig();
  if (!cfg) return "skipped";

  const id = giftCardObjectId(cfg, input.serialNumber);
  const response = await fetch(`${API_BASE}/giftCardObject/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${await accessToken(cfg)}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify(buildGiftCardPatch(input.fields, input.now)),
  });

  if (response.status === 404) return "missing";
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `google wallet: карта ${id} не обновлена (${response.status}) ${text.slice(0, 200)}`,
    );
  }
  return "updated";
}
