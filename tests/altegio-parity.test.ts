import { describe, expect, it } from "vitest";
import { buildStorageOperation } from "../lib/altegio/operations";

/**
 * Сверка тела продажи с действующим сайтом заказчика.
 *
 * Эталон ниже — дословно то, что собирает его `api.js` (метод
 * `altegio.createProduct`) для тех же входных данных. Именно этот код
 * выпускает сертификаты на sert.imbir.kz, поэтому любое отличие нашего тела
 * от эталона — повод разобраться, а не «просто другое поле».
 *
 * Как это уже спасало: у нас в `sale_amount` уходила СУММА, хотя у Altegio
 * это количество — продажа сорока тысяч сертификатов вместо одного на сорок
 * тысяч. И `cost` уходил нулём, из-за чего продажа числилась бесплатной.
 *
 * Из сравнения исключены только поля, которые не могут совпадать:
 * отметки времени и объект товара (мы собираем его инлайн по good_id).
 */

const INPUT = {
  code: "IMB-TEST-0001",
  amountKzt: 40000,
  orderId: "order-1",
  companyId: 225022,
} as const;

const CONTEXT = {
  companyId: 225022,
  storageId: 424028,
  masterId: 646602,
  accountId: 551001,
  clientId: null,
  client: {
    id: null,
    name: "Timur Junussov",
    phone: "77779005000",
    email: "t@x.kz",
  },
  good: { good_id: 24052021, id: 24052021, title: "Товар", unit_id: 216760 },
  comment: "коммент",
  markPaid: false,
  fallback: false,
} as const;

/** Эталон из api.js заказчика. */
const REFERENCE = {
  user_id: 0,
  company_id: 0,
  document_id: 0,
  type_id: 1,
  master_id: 646602,
  client_id: null,
  client: {
    name: "Timur Junussov",
    surname: "",
    patronymic: "",
    email: "t@x.kz",
    phone: "77779005000",
    fullname: "Timur Junussov",
  },
  storage_id: 424028,
  account_id: 551001,
  document: {
    id: 0,
    type_id: 1,
    type: { id: 1, title: "start_guide_questionnaire.products_sales" },
    storage_id: 0,
    user_id: 0,
    company_id: 0,
    number: 0,
    comment: "коммент",
    user: { id: 0, name: "", phone: "" },
  },
  goods_transactions: [
    {
      id: 0,
      good_title: "",
      master_name: "",
      loyalty_certificate_id: 0,
      loyalty_abonement_id: 0,
      loyalty_allow_empty_code: 0,
      document_id: 0,
      type_id: 1,
      company_id: 0,
      good_id: 24052021,
      good_planned_activation_date: "",
      is_planned_activation_date_editable: true,
      amount: 1,
      service_amount: 1,
      sale_amount: 1,
      cost_per_unit: 40000,
      cost: 40000,
      manual_cost: 0,
      unit_id: 216760,
      service_unit_id: 216760,
      sale_unit_id: 216760,
      operation_unit_type: 1,
      storage_id: 0,
      supplier_id: 0,
      good_special_number: "IMB-TEST-0001",
      loyalty_planned_activation_date: null,
      loyalty_expiration_type_id: null,
      is_loyalty_planned_activation_date_editable: true,
      client_id: 0,
      master_id: 0,
      discount: null,
      comment: "коммент",
      deleted: false,
      goods_marks: [],
      actual_amounts: [],
      unit_short_title: "",
      is_goods_mark_enabled: false,
      unit: { id: 216760, title: "шт", short_title: "шт" },
      sale_unit: { id: 216760, title: "шт", short_title: "шт" },
      service_unit: { id: 216760, title: "шт", short_title: "шт" },
    },
  ],
  payment_transactions: [],
  kkm_transactions: [],
  abonements: [],
};

/** Поля, которые не могут совпадать: время и собираемый нами объект товара. */
const IGNORED = new Set([
  "date",
  "document.create_date",
  "orderId",
  "goods_transactions.0.good",
]);

type Json = Record<string, unknown>;

/** Возвращает пути, где значения расходятся, — по обе стороны. */
function diff(reference: Json, actual: Json, path = ""): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(reference), ...Object.keys(actual)]);
  for (const key of [...keys].sort()) {
    const at = path ? `${path}.${key}` : key;
    if (IGNORED.has(at)) continue;
    const has = (o: Json) => Object.hasOwn(o, key);
    if (!has(reference)) {
      out.push(`${at}: лишнее у нас`);
      continue;
    }
    if (!has(actual)) {
      out.push(`${at}: отсутствует у нас`);
      continue;
    }
    const a = reference[key];
    const b = actual[key];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        out.push(`${at}: длина ${a.length} против ${b.length}`);
        continue;
      }
      a.forEach((item, i) => {
        if (item && typeof item === "object") {
          out.push(...diff(item as Json, b[i] as Json, `${at}.${i}`));
        } else if (item !== b[i]) {
          out.push(`${at}.${i}: ${String(item)} против ${String(b[i])}`);
        }
      });
      continue;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      out.push(...diff(a as Json, b as Json, at));
      continue;
    }
    if (a !== b) out.push(`${at}: ${String(a)} против ${String(b)}`);
  }
  return out;
}

describe("продажа в Altegio совпадает с действующим сайтом", () => {
  const ours = buildStorageOperation(INPUT, CONTEXT) as unknown as Json;

  it("не расходится с эталоном из api.js ни в одном поле", () => {
    expect(diff(REFERENCE, ours)).toEqual([]);
  });

  it("несёт наш публичный код номером сертификата", () => {
    const tx = (ours.goods_transactions as Json[])[0];
    expect(tx.good_special_number).toBe("IMB-TEST-0001");
  });
});
