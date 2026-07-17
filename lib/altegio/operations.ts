import "server-only";
import { altegioRequest } from "./client";
import { branchParams, resolveGoodId } from "./catalog";

/**
 * Выпуск сертификата в Altegio = продажа товара-сертификата через storage-
 * операцию с ПРИВЯЗКОЙ КЛИЕНТА, затем пометка продажи оплаченной (markAsPaid).
 * Схема выверена по рабочему сайту заказчика (Node-RED api.js/flows):
 *   1) POST storage_operations/operation/{company_id}   → document_id
 *   2) POST company/{company_id}/sale/{document_id}/payment (метод "account")
 *
 * Критично (выяснено 2026-07-14):
 *  - сертификат создаётся только при продаже РЕАЛЬНОГО товара-сертификата
 *    (good с loyalty_certificate_type_id) и с привязкой КЛИЕНТА (client_id);
 *  - баланс берётся из товара → нужен свой good на каждый номинал/филиал
 *    (каталог `catalog.ts`, данные из spr.js заказчика);
 *  - markAsPaid проводит продажу как оплаченную (иначе висит неоплаченной).
 *
 * Прод-режим: филиал заказа (company_id) + номинал → good_id из каталога,
 * покупатель заводится клиентом, продажа помечается оплаченной.
 * TEST-режим (ALTEGIO_TEST!=0): в комментарий добавляется [ТЕСТ] и markAsPaid
 * НЕ вызывается (чтобы не засорять финансы). Если good для филиала/номинала не
 * найден — безопасный фолбэк на тест-товар «Энергия Сиама Сайт 35000» (225022)
 * под служебным тест-клиентом.
 */

// Фолбэк-выпуск, когда номинал/филиал не смапплены (реальный товар-сертификат).
const TEST_FALLBACK = {
  companyId: 225022,
  goodId: 24847459, // «Энергия Сиама Сайт 35000»
  storageId: 424028,
  masterId: 1004429,
  accountId: 430646,
  client: { name: "[ТЕСТ] Сайт Imbir", phone: "77000000199", email: "" },
} as const;

/** Филиал фолбэк-выпуска. */
export const TEST_COMPANY_ID = TEST_FALLBACK.companyId;
/** Телефон служебного тест-клиента. */
export const TEST_CLIENT_PHONE = TEST_FALLBACK.client.phone;

export function isAltegioTestMode(): boolean {
  return process.env.ALTEGIO_TEST !== "0";
}

export type IssueParams = {
  /** Публичный код IMB-… → номер сертификата в Altegio. */
  code: string;
  /** Номинал/баланс в тенге. */
  amountKzt: number;
  /** Филиал заказа (Altegio company_id). Нет → фолбэк на тест-филиал. */
  companyId?: number | null;
  /** Точное название программы Altegio (если это программный сертификат). */
  programTitle?: string | null;
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
  /** Объект товара для тела операции. */
  good: Record<string, unknown>;
  comment: string;
  /** Помечать ли продажу оплаченной (прод — да, тест — нет). */
  markPaid: boolean;
  /** Использован ли фолбэк на тест-товар (номинал/филиал не смапплены). */
  fallback: boolean;
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

/** Находит клиента по телефону (если есть) или создаёт нового. */
export async function findOrCreateClient(
  companyId: number,
  input: { name: string; phone: string; email?: string },
): Promise<number> {
  if (input.phone) {
    const existing = await searchClient(companyId, input.phone);
    if (existing) return existing;
  }
  const created = await altegioRequest<{ id: number }>(`clients/${companyId}`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name || "Клиент сайта",
      phone: input.phone,
      email: input.email ?? "",
    }),
  });
  return created.id;
}

/**
 * Загружает полный объект товара-сертификата из Altegio (для фолбэка).
 * ВАЖНО: `count` у goods максимум 100, а невалидные значения (500/1000/…)
 * молча откатываются к 25 — поэтому строго постраничная выборка.
 */
export async function fetchGood(
  companyId: number,
  goodId: number,
): Promise<Record<string, unknown>> {
  for (let page = 1; page <= 50; page++) {
    const goods = await altegioRequest<Array<Record<string, unknown>>>(
      `goods/${companyId}?page=${page}&count=100`,
    );
    const good = goods.find((g) => (g.good_id ?? g.id) === goodId);
    if (good) return good;
    if (goods.length < 100) break;
  }
  throw new Error(`altegio: товар-сертификат ${goodId} не найден на ${companyId}`);
}

/**
 * Собирает объект товара инлайн (как рабочий сайт заказчика): сервер Altegio
 * определяет реальный товар и баланс по good_id, остальные поля косметические.
 */
function buildInlineGood(
  goodId: number,
  companyId: number,
  amountKzt: number,
  title: string,
): Record<string, unknown> {
  return {
    title,
    value: title,
    label: title,
    article: "",
    category: "Сертификаты Имбирь Thai Spa",
    category_id: 390846,
    salon_id: companyId,
    good_id: goodId,
    id: goodId,
    cost: amountKzt,
    unit_id: 216760,
    unit_short_title: "шт",
    service_unit_id: 216760,
    service_unit_short_title: "шт",
    actual_cost: 0,
    unit_actual_cost: 0,
    unit_actual_cost_format: "0 ₸",
    unit_equals: 1,
    barcode: "",
    loyalty_abonement_type_id: 0,
    loyalty_certificate_type_id: 268607,
    loyalty_allow_empty_code: 0,
    loyalty_expiration_type_id: null,
    is_goods_mark_enabled: false,
    actual_amounts: [],
    unit: "шт.",
    is_chain: true,
    comment: "",
    loyalty_serial_number_limited: 0,
    critical_amount: 0,
    desired_amount: 0,
  };
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
        good: ctx.good,
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

/** Помечает продажу оплаченной (метод «account»). Best-effort. */
async function markSaleAsPaid(
  companyId: number,
  documentId: number,
  amountKzt: number,
  accountId: number,
): Promise<void> {
  await altegioRequest(`company/${companyId}/sale/${documentId}/payment`, {
    method: "POST",
    body: JSON.stringify({
      payment: {
        method: { slug: "account", account_id: accountId },
        amount: amountKzt,
        analytics_is_fast_payment_tab: true,
      },
    }),
  });
}

export type IssueResult =
  | {
      status: "issued";
      documentId: number;
      companyId: number;
      clientId: number;
      number: string;
      clientPhone: string;
      paid: boolean;
      fallback: boolean;
    }
  | { status: "already_exists"; companyId: number; number: string };

/** Строит контекст выпуска: прод (по каталогу) или фолбэк на тест-товар. */
async function resolveContext(params: IssueParams): Promise<IssueContext> {
  const test = isAltegioTestMode();
  const comment =
    params.comment ??
    `${test ? "[ТЕСТ] " : ""}Сайт Imbir · заказ ${params.orderId}`;

  const companyId = params.companyId ?? null;
  const goodId = companyId
    ? resolveGoodId(companyId, {
        nominalKzt: params.amountKzt,
        programTitle: params.programTitle,
      })
    : null;
  const branch = companyId ? branchParams(companyId) : null;

  if (companyId && goodId && branch) {
    const phone = params.buyerPhone ? normalizePhone(params.buyerPhone) : "";
    const clientId = await findOrCreateClient(companyId, {
      name: params.buyerName ?? "Клиент сайта",
      phone,
      email: params.buyerEmail,
    });
    return {
      companyId,
      storageId: branch.storageId,
      masterId: branch.masterId,
      accountId: branch.accountId,
      clientId,
      client: {
        id: clientId,
        name: params.buyerName ?? "Клиент сайта",
        phone,
        email: params.buyerEmail,
      },
      good: buildInlineGood(
        goodId,
        companyId,
        params.amountKzt,
        params.programTitle ?? `Сертификат ${params.amountKzt}₸`,
      ),
      comment,
      // В тест-режиме продажу оплаченной НЕ проводим (не засоряем финансы).
      markPaid: !test,
      fallback: false,
    };
  }

  // Несмаппленный товар/филиал. В ПРОДЕ фолбэка нет: выпустить сертификат с
  // чужим балансом (35000 из типа тест-товара) на чужом филиале хуже, чем
  // пометить синк failed — админ увидит в списке сертификатов и заведёт
  // вручную в CRM. Фолбэк на тест-товар — только в тест-режиме.
  if (!test) {
    throw new Error(
      `altegio: нет товара-сертификата для company ${companyId ?? "—"} / ` +
        `${params.amountKzt}₸${params.programTitle ? ` / «${params.programTitle}»` : ""} — ` +
        `нужен маппинг в lib/altegio/catalog.ts или товар в CRM`,
    );
  }
  if (companyId) {
    console.warn(
      `[altegio] нет good для company ${companyId} / номинал ${params.amountKzt}` +
        ` — фолбэк на тест-товар (Мангилик)`,
    );
  }
  const clientId = await findOrCreateClient(
    TEST_FALLBACK.companyId,
    TEST_FALLBACK.client,
  );
  const good = await fetchGood(TEST_FALLBACK.companyId, TEST_FALLBACK.goodId);
  return {
    companyId: TEST_FALLBACK.companyId,
    storageId: TEST_FALLBACK.storageId,
    masterId: TEST_FALLBACK.masterId,
    accountId: TEST_FALLBACK.accountId,
    clientId,
    client: { id: clientId, ...TEST_FALLBACK.client },
    good,
    comment: `[ТЕСТ] ${comment}`,
    markPaid: false,
    fallback: true,
  };
}

/**
 * Выпускает сертификат в Altegio (+ помечает оплаченным в прод-режиме).
 * Идемпотентность — по уникальному номеру (повтор → already_exists).
 */
export async function issueCertificateOperation(
  params: IssueParams,
): Promise<IssueResult> {
  const ctx = await resolveContext(params);
  const path = `storage_operations/operation/${ctx.companyId}`;
  let documentId = 0;
  try {
    const data = await altegioRequest<{ document_id?: number }>(path, {
      method: "POST",
      body: JSON.stringify(buildStorageOperation(params, ctx)),
    });
    documentId = data.document_id ?? 0;
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

  let paid = false;
  if (ctx.markPaid && documentId) {
    try {
      await markSaleAsPaid(
        ctx.companyId,
        documentId,
        params.amountKzt,
        ctx.accountId,
      );
      paid = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[altegio] markAsPaid не удался для ${documentId}: ${msg}`);
    }
  }

  return {
    status: "issued",
    documentId,
    companyId: ctx.companyId,
    clientId: ctx.clientId,
    number: params.code,
    clientPhone: ctx.client.phone,
    paid,
    fallback: ctx.fallback,
  };
}
