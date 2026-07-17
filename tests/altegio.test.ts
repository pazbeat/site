import { describe, expect, it } from "vitest";
import { buildCertComment } from "../lib/altegio/sync";
import {
  buildStorageOperation,
  normalizePhone,
} from "../lib/altegio/operations";
import { SALON_PREFIX_TO_ALTEGIO } from "../lib/altegio/mapping";
import {
  resolveGoodId,
  resolveProgramTitle,
  branchParams,
  BRANCH_PARAMS,
  NOMINAL_GOODS,
  PROGRAM_GOODS,
} from "../lib/altegio/catalog";

describe("altegio buildCertComment", () => {
  it("помечает тестовые записи префиксом [ТЕСТ]", () => {
    const c = buildCertComment({ test: true, serial: "WM001", orderId: "abc" });
    expect(c).toContain("[ТЕСТ]");
    expect(c).toContain("WM001");
    expect(c).toContain("abc");
  });

  it("без теста — без пометки", () => {
    const c = buildCertComment({ test: false, serial: "WT007", orderId: "o1" });
    expect(c).not.toContain("[ТЕСТ]");
    expect(c).toContain("WT007");
  });

  it("работает без серийника", () => {
    const c = buildCertComment({ test: true, serial: null, orderId: "o2" });
    expect(c).toContain("[ТЕСТ]");
    expect(c).toContain("o2");
  });
});

describe("altegio buildStorageOperation", () => {
  const ctx = {
    companyId: 225022,
    storageId: 424028,
    masterId: 1004429,
    accountId: 430646,
    clientId: 184315997,
    client: { id: 184315997, name: "[ТЕСТ] Сайт Imbir", phone: "77000000199" },
    good: {
      good_id: 24847459,
      unit_id: 216760,
      loyalty_certificate_type_id: 286962,
      title: "Энергия Сиама Сайт 35000",
    },
    comment: "[ТЕСТ] сайт Imbir · заказ ord1",
    markPaid: false,
    fallback: false,
  };
  const op = buildStorageOperation(
    {
      code: "IMB-ABCD-EFGH",
      amountKzt: 20000,
      buyerName: "Иван",
      buyerEmail: "iван@example.com",
      orderId: "ord1",
    },
    ctx,
  );
  const tx = op.goods_transactions[0];

  it("кладёт наш код в good_special_number транзакции", () => {
    expect(tx.good_special_number).toBe("IMB-ABCD-EFGH");
  });

  it("проставляет номинал в cost_per_unit и sale_amount", () => {
    expect(tx.cost_per_unit).toBe(20000);
    expect(tx.sale_amount).toBe(20000);
  });

  it("продаёт реальный товар-сертификат из контекста", () => {
    expect(tx.good_id).toBe(24847459);
    expect(op.storage_id).toBe(424028);
  });

  it("привязывает клиента (client_id) — иначе сертификат не виден в CRM", () => {
    expect(op.client_id).toBe(184315997);
    expect(tx.client_id).toBe(184315997);
    expect(op.phone).toBe("77000000199");
  });
});

describe("altegio salon mapping", () => {
  it("покрывает все 7 префиксов уникальными company_id", () => {
    const ids = Object.values(SALON_PREFIX_TO_ALTEGIO);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
  });
});

describe("altegio catalog", () => {
  it("резолвит good_id по номиналу и филиалу", () => {
    // Мангилик 225022, номинал 20000 → good из order_ids заказчика
    expect(resolveGoodId(225022, { nominalKzt: 20000 })).toBe(23911851);
    expect(resolveGoodId(271994, { nominalKzt: 50000 })).toBe(23911914);
  });

  it("предпочитает программу по названию, если она есть", () => {
    expect(
      resolveGoodId(225022, {
        nominalKzt: 99999,
        programTitle: "Энергия Сиама Сайт",
      }),
    ).toBe(24847459);
  });

  it("возвращает null для неизвестного номинала", () => {
    expect(resolveGoodId(225022, { nominalKzt: 12345 })).toBeNull();
  });

  it("покрывает все номиналы сайта (18000/30000/50000/100000) в каждом филиале", () => {
    for (const companyId of Object.keys(BRANCH_PARAMS)) {
      for (const nominal of [18000, 30000, 50000, 100000]) {
        expect(
          resolveGoodId(Number(companyId), { nominalKzt: nominal }),
          `company ${companyId} / номинал ${nominal}`,
        ).not.toBeNull();
      }
    }
  });

  it("не содержит дублей good_id внутри филиала (ловит копипасту вроде WS 90000=100000)", () => {
    for (const [companyId, nominals] of Object.entries(NOMINAL_GOODS)) {
      const ids = Object.values(nominals);
      expect(new Set(ids).size, `NOMINAL_GOODS ${companyId}`).toBe(ids.length);
    }
    for (const [companyId, programs] of Object.entries(PROGRAM_GOODS)) {
      const ids = Object.values(programs);
      expect(new Set(ids).size, `PROGRAM_GOODS ${companyId}`).toBe(ids.length);
    }
  });

  it("даёт складские параметры для всех 8 филиалов", () => {
    expect(Object.keys(BRANCH_PARAMS)).toHaveLength(8);
    const wm = branchParams(225022);
    expect(wm?.storageId).toBe(424028);
    expect(wm?.accountId).toBe(551001);
    expect(wm?.prefix).toBe("WM");
  });
});

describe("altegio resolveProgramTitle", () => {
  it("маппит нашу программу + цену на точное название товара Altegio", () => {
    expect(resolveProgramTitle("Тайское чудо", 19000)).toBe(
      "Тайское чудо 1 час Сайт новый 19000",
    );
    expect(resolveProgramTitle("Гармония тела", 38000)).toBe(
      "Гармония тела 2 часа 38000 Сайт",
    );
    expect(resolveProgramTitle("Karuna", 68000)).toBe(
      "Каруна на 2 серт или депозит 68000",
    );
  });

  it("каждый замаппленный вариант резолвится в good_id на всех 8 филиалах (кроме известных дыр)", () => {
    // «Чудесное ожидание 1.5 часа 30000» отсутствует только в Семее (1355056)
    const known = [
      ["Гармония тела", 22000], ["Гармония тела", 29000], ["Гармония тела", 38000],
      ["Тайское чудо", 19000], ["Тайское чудо", 27000], ["Тайское чудо", 35000],
      ["Страна улыбок", 90000], ["Страна улыбок", 132000],
      ["Ты и Я", 70000], ["Энергия Сиама", 35000], ["Перезагрузка", 55000],
      ["Спа Релакс", 20000], ["Sabai Sabai", 38000],
      ["Karuna", 36000], ["Karuna", 68000],
      ["Sanuk", 28000], ["Sanuk", 52000],
      ["Антистресс", 88000], ["Энергия Таиланда", 36000], ["Грация", 18000],
    ] as const;
    for (const companyId of Object.keys(BRANCH_PARAMS)) {
      for (const [name, price] of known) {
        const title = resolveProgramTitle(name, price);
        expect(title, `${name} ${price}`).not.toBeNull();
        expect(
          resolveGoodId(Number(companyId), { nominalKzt: price, programTitle: title }),
          `company ${companyId} / ${name} ${price}`,
        ).not.toBeNull();
      }
    }
  });

  it("возвращает null для варианта без товара в CRM (фолбэк на номинал)", () => {
    expect(resolveProgramTitle("Suay", 38000)).toBeNull();
    expect(resolveProgramTitle("Маленький Будда", 16000)).toBeNull();
  });
});

describe("altegio normalizePhone", () => {
  it("приводит 8… к 7… и убирает не-цифры", () => {
    expect(normalizePhone("8 (777) 900-50-00")).toBe("77779005000");
    expect(normalizePhone("+7 701 000 00 00")).toBe("77010000000");
  });
});
