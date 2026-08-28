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

/**
 * Ограничение ожидания. Выпуск сертификата теперь стоит на пути оплаты
 * (номер резервируется до отправки письма), и молчащий CRM не должен держать
 * покупателя: лучше выдать сертификат без записи в Altegio и починить руками.
 */
const REQUEST_TIMEOUT_MS = 15_000;

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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

// ── Фид погашений сети ───────────────────────────────────────────────────

/**
 * Строка журнала лояльности сети. Погашение сертификата — `type_id === 8`
 * («Gift card») с непустым `certificate_id`.
 */
export type LoyaltyTransaction = {
  id: number;
  created_date: string;
  visit_id: number;
  amount: number;
  type_id: number;
  certificate_id: number;
};

/**
 * Журнал операций лояльности всей сети за период.
 *
 * Единственный найденный способ узнать о погашении сертификата, НЕ зная
 * телефона клиента: чтение самого сертификата (`loyalty/certificates`)
 * требует телефон, а наши сертификаты продаются без карточки клиента.
 * Выверено живьём 2026-08-26 на погашении WM9001.
 *
 * Особенности, выясненные перебором (ручка недокументирована):
 *  - обе даты обязательны, строго `YYYY-MM-DD`; со временем — 422;
 *  - `company_id` и `type_id` как фильтры ИГНОРИРУЮТСЯ, отбираем у себя;
 *  - выдача от новых к старым, `count` до 1000, `page` работает
 *    (≈6 дней сети на страницу).
 */
export function listLoyaltyTransactions(
  chainId: number,
  params: { from: string; to: string; page?: number; count?: number },
): Promise<LoyaltyTransaction[]> {
  const q = new URLSearchParams({
    created_after: params.from,
    created_before: params.to,
    count: String(params.count ?? 1000),
    page: String(params.page ?? 1),
  });
  return altegioRequest<LoyaltyTransaction[]>(
    `chain/${chainId}/loyalty/transactions?${q}`,
  );
}

export type AltegioVisit = {
  records?: Array<{
    company_id: number;
    documents?: Array<{ id: number }>;
  }>;
};

/** Визит: из него узнаём филиал и номер документа. */
export function getVisit(visitId: number): Promise<AltegioVisit> {
  return altegioRequest<AltegioVisit>(`visits/${visitId}`);
}

export type StorageOperation = {
  paid?: boolean;
  storage_id?: number;
  goods_transactions?: Array<{
    good_special_number?: string;
    deleted?: boolean;
  }>;
};

/**
 * Складская операция — тот самый документ продажи, которым мы выпускали
 * сертификат. Нужен, чтобы заметить возврат: когда бухгалтер оформляет
 * возврат и убирает сертификат в CRM, документ остаётся, но товарная строка
 * из него ИСЧЕЗАЕТ (сверено живьём 2026-08-28 на WM9006 против WM9007).
 */
export function getStorageOperation(
  companyId: number,
  documentId: number,
): Promise<StorageOperation> {
  return altegioRequest<StorageOperation>(
    `storage_operations/operation/${companyId}/${documentId}`,
  );
}

export type SaleDocument = {
  state?: {
    loyalty_transactions?: Array<{
      id: number;
      amount: number;
      loyalty_certificate_id?: number;
      loyalty_certificate?: {
        id: number;
        number: string;
        balance: number;
        status_slug: string;
      };
    }>;
  };
};

/**
 * Документ визита. Здесь и лежит то, ради чего всё затевалось: номер
 * сертификата и его ОСТАТОК после погашения — без всякого телефона.
 */
export function getSaleDocument(
  companyId: number,
  documentId: number,
): Promise<SaleDocument> {
  return altegioRequest<SaleDocument>(`company/${companyId}/sale/${documentId}`);
}
