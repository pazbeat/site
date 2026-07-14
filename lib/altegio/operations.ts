import "server-only";
import { altegioRequest } from "./client";

/**
 * Выпуск сертификата в Altegio = продажа РЕАЛЬНОГО товара-сертификата через
 * storage-операцию с ПРИВЯЗКОЙ КЛИЕНТА (выверено живьём 2026-07-14):
 *   POST https://app.alteg.io/api/v1/storage_operations/operation/{company_id}
 *
 * Критично (выяснено при отладке «в Altegio ничего не появляется»):
 *  1. Сертификат создаётся ТОЛЬКО при продаже настоящего товара-сертификата
 *     (у товара есть loyalty_certificate_type_id). Тест-товар «Тестовый 1тенге»
 *     сертификат НЕ создаёт — только складское списание, невидимое в CRM.
 *  2. Сертификат виден и погашаем ТОЛЬКО если привязан клиент (client_id):
 *     список сертификатов в Altegio ищется по телефону клиента. Без клиента
 *     (client_id 0) записи нет нигде.
 *  3. Баланс сертификата берётся из ТИПА товара (loyalty_certificate_type),
 *     а не из нашей суммы. Значит для каждого номинала/программы нужен свой
 *     товар-сертификат (маппинг — задача прод-фазы).
 *
 * Наш публичный код IMB-… кладётся в good_special_number (номер сертификата,
 * уникален — повтор даёт 400 «Gift card with such number already exists»,
 * трактуем как идемпотентный успех).
 *
 * TEST-режим: продаёт реальный товар «Энергия Сиама Сайт 35000» (good 24847459)
 * на филиале 225022 (Мангилик) и вешает на служебного клиента «[ТЕСТ] Сайт
 * Imbir». Запись помечена [ТЕСТ], реальный погашаемый сертификат появляется в
 * Altegio под этим клиентом. Выверено e2e: сертификат IMB-TEST-… виден в
 * loyalty/certificates по телефону тест-клиента.
 */

// Конфигурация TEST-выпуска (филиал Мангилик 225022, реальный товар-сертификат).
const TEST_OP = {
  companyId: 225022,
  goodId: 24847459, // «Энергия Сиама Сайт 35000» — реальный товар-сертификат
  storageId: 424028,
  masterId: 1004429,
  accountId: 430646,
  client: { name: "[ТЕСТ] Сайт Imbir", phone: "77000000199", email: "" },
} as const;

/** Филиал, куда фактически пишется тест-выпуск. */
export const TEST_COMPANY_ID = TEST_OP.companyId;
/** Телефон служебного тест-клиента (по нему сертификат ищется в Altegio). */
export const TEST_CLIENT_PHONE = TEST_OP.client.phone;

export type IssueParams = {
  /** Публичный код IMB-… → номер сертификата в Altegio. */
  code: string;
  /** Номинал/баланс в тенге (в TEST-режиме баланс берётся из типа товара). */
  amountKzt: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  orderId: string;
  /** Комментарий к операции (с пометкой [ТЕСТ] в тест-режиме). */
  comment?: string;
};

type AltegioClientRef = {
  id: number;
  name: string;
  surname?: string;
  patronymic?: string;
  email?: string;
  phone: string;
  fullname?: string;
};

/** Контекст выпуска: филиал, товар, клиент, склады/счета. */
export type IssueContext = {
  companyId: number;
  storageId: number;
  masterId: number;
  accountId: number;
  clientId: number;
  client: AltegioClientRef;
  /** Полный объект товара из Altegio (goods/{company}). */
  good: Record<string, unknown>;
  comment: string;
};

/** Нормализует телефон к виду 77XXXXXXXXX (цифры, ведущая 8→7). */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  return d;
}

/** Ищет клиента по телефону; возвращает id или null. */
async function searchClient(
  companyId: number,
  phone: string,
): Promise<number | null> {
  const data = await altegioRequest<Array<{ id: number; phone?: string }>>(
    `company/${companyId}/clients/search`,
    {
      method: "POST",
      body: JSON.stringify({
        page: 1,
        page_size: 10,
        fields: ["id", "name", "phone"],
        filters: [{ type: "quick_search", state: { value: phone } }],
      }),
    },
  );
  const norm = normalizePhone(phone);
  const hit = data.find((c) => normalizePhone(c.phone ?? "") === norm) ?? data[0];
  return hit?.id ?? null;
}

/** Находит клиента по телефону или создаёт нового. */
export async function findOrCreateClient(
  companyId: number,
  input: { name: string; phone: string; email?: string },
): Promise<number> {
  const existing = await searchClient(companyId, input.phone);
  if (existing) return existing;
  const created = await altegioRequest<{ id: number }>(`clients/${companyId}`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      phone: input.phone,
      email: input.email ?? "",
    }),
  });
  return created.id;
}

/** Загружает полный объект товара-сертификата из Altegio. */
export async function fetchGood(
  companyId: number,
  goodId: number,
): Promise<Record<string, unknown>> {
  const goods = await altegioRequest<Array<Record<string, unknown>>>(
    `goods/${companyId}?count=100`,
  );
  const good = goods.find((g) => (g.good_id ?? g.id) === goodId);
  if (!good) {
    throw new Error(`altegio: товар-сертификат ${goodId} не найден на ${companyId}`);
  }
  return good;
}

/** Собирает тело storage-операции (продажа товара-сертификата с клиентом). */
export function buildStorageOperation(p: IssueParams, ctx: IssueContext) {
  const now = new Date().toISOString();
  const goodUnitId = (ctx.good.unit_id as number) ?? 216760;
  const unit = { id: goodUnitId, title: "шт", short_title: "шт" };
  const client = ctx.client;
  const goodId = (ctx.good.good_id ?? ctx.good.id) as number;
  return {
    user_id: 0,
    company_id: 0,
    document_id: 0,
    type_id: 1,
    master_id: ctx.masterId,
    client_id: ctx.clientId,
    abonements: [],
    account_id: ctx.accountId,
    client: {
      id: client.id,
      name: client.name,
      surname: client.surname ?? "",
      patronymic: client.patronymic ?? "",
      email: client.email ?? "",
      phone: client.phone,
      fullname: client.fullname ?? client.name,
    },
    email: client.email ?? "",
    fullname: client.name,
    name: client.name,
    patronymic: "",
    phone: client.phone,
    surname: "",
    date: now,
    document: {
      id: 0,
      type_id: 1,
      type: { id: 1, title: "start_guide_questionnaire.products_sales" },
      storage_id: 0,
      comment: ctx.comment,
      company_id: 0,
      create_date: now,
      number: 0,
    },
    goods_transactions: [
      {
        id: 0,
        good_title: "",
        master_name: "",
        loyalty_certificate_id: 0,
        loyalty_abonement_id: 0,
        actual_amounts: [],
        amount: 1,
        client_id: ctx.clientId,
        comment: ctx.comment,
        company_id: 0,
        cost: 0,
        cost_per_unit: p.amountKzt,
        deleted: false,
        discount: 0,
        document_id: 0,
        good: { ...ctx.good, id: goodId },
        good_id: goodId,
        good_planned_activation_date: "",
        // Номер сертификата = наш публичный код (уникален).
        good_special_number: p.code,
        goods_marks: [],
        is_goods_mark_enabled: false,
        is_loyalty_planned_activation_date_editable: true,
        is_planned_activation_date_editable: true,
        loyalty_allow_empty_code: 0,
        loyalty_expiration_type_id: null,
        loyalty_planned_activation_date: null,
        manual_cost: 0,
        master_id: 0,
        operation_unit_type: 1,
        sale_amount: p.amountKzt,
        sale_unit: unit,
        sale_unit_id: goodUnitId,
        service_amount: 1,
        service_unit: unit,
        service_unit_id: goodUnitId,
        storage_id: 0,
        supplier_id: 0,
        type_id: 1,
        unit,
        unit_id: goodUnitId,
        unit_short_title: "",
      },
    ],
    kkm_transactions: [],
    payment_transactions: [],
    storage_id: ctx.storageId,
    orderId: p.orderId,
  };
}

export type IssueResult =
  | {
      status: "issued";
      documentId: number;
      companyId: number;
      clientId: number;
      number: string;
      clientPhone: string;
    }
  | { status: "already_exists"; companyId: number; number: string };

/**
 * Собирает контекст выпуска. Сейчас реализован только TEST-режим (реальный
 * товар-сертификат на Мангилик + служебный тест-клиент). Прод-режим (маппинг
 * номинала/программы → товар-сертификат по филиалам) — задача прод-фазы.
 */
async function resolveTestContext(params: IssueParams): Promise<IssueContext> {
  const clientId = await findOrCreateClient(TEST_OP.companyId, TEST_OP.client);
  const good = await fetchGood(TEST_OP.companyId, TEST_OP.goodId);
  return {
    companyId: TEST_OP.companyId,
    storageId: TEST_OP.storageId,
    masterId: TEST_OP.masterId,
    accountId: TEST_OP.accountId,
    clientId,
    client: { id: clientId, ...TEST_OP.client },
    good,
    comment: params.comment ?? `[ТЕСТ] сайт Imbir · заказ ${params.orderId}`,
  };
}

/**
 * Выпускает сертификат в Altegio. Возвращает document_id и номер, либо, если
 * номер уже существует, статус already_exists (идемпотентность по номеру).
 */
export async function issueCertificateOperation(
  params: IssueParams,
): Promise<IssueResult> {
  const ctx = await resolveTestContext(params);
  const path = `storage_operations/operation/${ctx.companyId}`;
  try {
    const data = await altegioRequest<{ document_id?: number }>(path, {
      method: "POST",
      body: JSON.stringify(buildStorageOperation(params, ctx)),
    });
    return {
      status: "issued",
      documentId: data.document_id ?? 0,
      companyId: ctx.companyId,
      clientId: ctx.clientId,
      number: params.code,
      clientPhone: ctx.client.phone,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/already exists/i.test(msg)) {
      return {
        status: "already_exists",
        companyId: ctx.companyId,
        number: params.code,
      };
    }
    throw error;
  }
}
