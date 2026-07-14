import "server-only";
import { altegioRequest } from "./client";

/**
 * Выпуск сертификата в Altegio = продажа товара-сертификата через
 * storage-операцию (выверено по рабочему Node-RED заказчика, 2026-07-13):
 *   POST https://app.alteg.io/api/v1/storage_operations/operation/{company_id}
 * тело — документ «Product sale» с одной goods-транзакцией; наш публичный код
 * IMB-… кладётся в goods_transactions[0].good_special_number (номер сертификата,
 * уникален — повторный выпуск даёт 400 «Gift card with such number already
 * exists», что трактуем как идемпотентный успех).
 *
 * TEST-режим использует «Тестовый 1тенге» (good_id 23833850, cert_type 266333)
 * на филиале 225022 (Мангилик) — записи в Altegio явно помечены как тест.
 * Выверено живьём: HTTP 200, создаётся document_id, сертификат с нашим кодом.
 */

// Константы тест-товара (из рабочего buildOper заказчика; good «Тестовый 1тенге»).
const TEST_OP = {
  companyId: 225022,
  goodId: 23833850,
  certificateTypeId: 266333,
  categoryId: 318928,
  category: "Сертификаты Имбирь Thai Spa",
  goodTitle: "Тестовый 1тенге",
  unitId: 216760,
  storageId: 424028,
  masterId: 1004429,
  accountId: 430646,
} as const;

export type IssueParams = {
  /** Публичный код IMB-… → номер сертификата в Altegio. */
  code: string;
  /** Номинал/баланс в тенге. */
  amountKzt: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  orderId: string;
};

/** Собирает тело storage-операции (документ продажи товара-сертификата). */
export function buildStorageOperation(p: IssueParams) {
  const now = new Date().toISOString();
  const unit = { id: TEST_OP.unitId, title: "шт", short_title: "шт" };
  return {
    user_id: 0,
    company_id: 0,
    document_id: 0,
    type_id: 1,
    master_id: TEST_OP.masterId,
    client_id: 0,
    abonements: [],
    account_id: TEST_OP.accountId,
    client: { name: "", surname: "", patronymic: "", email: "", phone: "", fullname: "" },
    email: p.buyerEmail ?? "",
    fullname: p.buyerName ?? "",
    name: p.buyerName ?? "",
    patronymic: "",
    phone: p.buyerPhone ?? "",
    surname: "",
    date: now,
    document: {
      id: 0,
      type_id: 1,
      type: { id: 1, title: "start_guide_questionnaire.products_sales" },
      storage_id: 0,
      comment: "",
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
        client_id: 0,
        comment: "",
        company_id: 0,
        cost: 0,
        cost_per_unit: p.amountKzt,
        deleted: false,
        discount: 100,
        document_id: 0,
        good: {
          actual_amounts: [],
          actual_cost: 0,
          article: "",
          barcode: "",
          category: TEST_OP.category,
          category_id: TEST_OP.categoryId,
          comment: "",
          cost: 1,
          critical_amount: 0,
          desired_amount: 0,
          good_id: TEST_OP.goodId,
          id: TEST_OP.goodId,
          is_chain: true,
          is_goods_mark_enabled: false,
          label: TEST_OP.goodTitle,
          loyalty_abonement_type_id: 0,
          loyalty_allow_empty_code: 0,
          loyalty_certificate_type_id: TEST_OP.certificateTypeId,
          loyalty_expiration_type_id: null,
          loyalty_serial_number_limited: 0,
          salon_id: TEST_OP.companyId,
          service_unit_id: TEST_OP.unitId,
          service_unit_short_title: "шт",
          title: TEST_OP.goodTitle,
          unit: "шт.",
          unit_actual_cost: 0,
          unit_actual_cost_format: "0 ₸",
          unit_equals: 1,
          unit_id: TEST_OP.unitId,
          unit_short_title: "шт",
          value: TEST_OP.goodTitle,
        },
        good_id: TEST_OP.goodId,
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
        sale_unit_id: TEST_OP.unitId,
        service_amount: 1,
        service_unit: unit,
        service_unit_id: TEST_OP.unitId,
        storage_id: 0,
        supplier_id: 0,
        type_id: 1,
        unit,
        unit_id: TEST_OP.unitId,
        unit_short_title: "",
      },
    ],
    kkm_transactions: [],
    payment_transactions: [],
    storage_id: TEST_OP.storageId,
    orderId: p.orderId,
  };
}

/** Филиал, куда фактически пишется тест-выпуск (склад тест-товара). */
export const TEST_COMPANY_ID = TEST_OP.companyId;

export type IssueResult =
  | { status: "issued"; documentId: number; companyId: number }
  | { status: "already_exists"; companyId: number };

/**
 * Выпускает сертификат в Altegio. Возвращает document_id или, если номер уже
 * существует, статус already_exists (идемпотентность по номеру сертификата).
 */
export async function issueCertificateOperation(
  params: IssueParams,
): Promise<IssueResult> {
  const path = `storage_operations/operation/${TEST_OP.companyId}`;
  try {
    const data = await altegioRequest<{ document_id?: number }>(path, {
      method: "POST",
      body: JSON.stringify(buildStorageOperation(params)),
    });
    return {
      status: "issued",
      documentId: data.document_id ?? 0,
      companyId: TEST_OP.companyId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/already exists/i.test(msg)) {
      return { status: "already_exists", companyId: TEST_OP.companyId };
    }
    throw error;
  }
}
