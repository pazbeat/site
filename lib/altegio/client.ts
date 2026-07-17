import "server-only";

/**
 * Клиент Altegio CRM (PRD §12 №1, Фаза 3). База https://api.alteg.io/api/v1.
 * Авторизация двумя токенами (RFC6749, режим Partner+User): заголовок
 *   Authorization: Bearer {partnerToken}, User {userToken}
 * и Accept: application/vnd.api.v2+json.
 *
 * Наша БД — источник истины по выпуску; Altegio — по погашениям. Все вызовы
 * идут через очередь (лимит 200 req/min), ошибка синка НЕ блокирует доставку.
 * Наш публичный код IMB-… передаётся номером сертификата в Altegio.
 */

// Боевой хост записи/чтения (совпадает с рабочим Node-RED заказчика).
const BASE_URL = process.env.ALTEGIO_BASE_URL ?? "https://app.alteg.io/api/v1";

export type AltegioConfig = {
  partnerToken: string;
  userToken: string;
  chainId: number;
};

export function readAltegioConfig(): AltegioConfig | null {
  const partnerToken = process.env.ALTEGIO_PARTNER_TOKEN;
  const userToken = process.env.ALTEGIO_USER_TOKEN;
  const chainId = Number(process.env.ALTEGIO_CHAIN_ID);
  if (!partnerToken || !userToken || !Number.isFinite(chainId)) return null;
  return { partnerToken, userToken, chainId };
}

export function isAltegioConfigured(): boolean {
  return readAltegioConfig() !== null;
}

type AltegioResponse<T> = {
  success: boolean;
  data: T;
  meta?: { message?: string; total_count?: number; errors?: unknown };
};

/** Низкоуровневый запрос к Altegio. Бросает при success:false / не-2xx. */
export async function altegioRequest<T>(
  path: string,
  init: RequestInit = {},
  cfg: AltegioConfig = requireConfig(),
): Promise<T> {
  const response = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api.v2+json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.partnerToken}, User ${cfg.userToken}`,
      ...init.headers,
    },
  });
  const body = (await response
    .json()
    .catch(() => null)) as AltegioResponse<T> | null;
  if (!response.ok || !body || body.success === false) {
    const msg = body?.meta?.message ?? `HTTP ${response.status}`;
    throw new Error(`altegio_request_failed [${path}]: ${msg}`);
  }
  return body.data;
}

function requireConfig(): AltegioConfig {
  const cfg = readAltegioConfig();
  if (!cfg) throw new Error("altegio_not_configured");
  return cfg;
}

// ── Справочники (read-only, выверено живьём) ─────────────────────────────

export type AltegioCompany = { id: number; title: string; city: string };

/** Филиалы сети, доступные интеграции. */
export function listCompanies(): Promise<AltegioCompany[]> {
  return altegioRequest<AltegioCompany[]>("companies?my=1");
}

export type AltegioCertificateType = {
  id: number;
  title: string;
  balance: number;
  is_multi: boolean;
};

/**
 * Шаблоны сертификатов сети (chain-level). Строго постранично: без параметров
 * API отдаёт максимум 250, а живых типов в сети 585 (выверено 2026-07-17).
 */
export async function listCertificateTypes(
  cfg: AltegioConfig = requireConfig(),
): Promise<AltegioCertificateType[]> {
  const all: AltegioCertificateType[] = [];
  for (let page = 1; page <= 50; page++) {
    const batch = await altegioRequest<AltegioCertificateType[]>(
      `chain/${cfg.chainId}/loyalty/certificate_types?page=${page}&count=100`,
      {},
      cfg,
    );
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export type AltegioCertificate = {
  id: number;
  /** Номер сертификата = наш публичный код IMB-XXXX-XXXX */
  number: string;
  /** Остаток по данным CRM — источник истины по погашениям */
  balance: number;
  default_balance: number;
  status: { id: number; slug: string; title: string };
};

/**
 * Сертификаты клиента в филиале. Выверено живьём (2026-07-15): это
 * ЕДИНСТВЕННЫЙ доступный путь чтения — `phone` обязателен, поиска по номеру
 * («Missing phone number»), выборки по филиалу целиком, chain-level списка и
 * истории операций у API нет. Поэтому телефон клиента мы запоминаем при
 * выпуске (Certificate.altegioClientPhone).
 */
export function listClientCertificates(
  companyId: number,
  phone: string,
): Promise<AltegioCertificate[]> {
  const q = new URLSearchParams({
    company_id: String(companyId),
    phone,
  });
  return altegioRequest<AltegioCertificate[]>(`loyalty/certificates/?${q}`);
}
