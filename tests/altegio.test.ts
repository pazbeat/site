import { describe, expect, it } from "vitest";
import { buildCertComment } from "../lib/altegio/sync";
import { buildStorageOperation } from "../lib/altegio/operations";
import { SALON_PREFIX_TO_ALTEGIO } from "../lib/altegio/mapping";

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
  const op = buildStorageOperation({
    code: "IMB-ABCD-EFGH",
    amountKzt: 20000,
    buyerName: "Иван",
    buyerEmail: "iван@example.com",
    orderId: "ord1",
  });
  const tx = op.goods_transactions[0];

  it("кладёт наш код в good_special_number транзакции", () => {
    expect(tx.good_special_number).toBe("IMB-ABCD-EFGH");
  });

  it("проставляет номинал в cost_per_unit и sale_amount", () => {
    expect(tx.cost_per_unit).toBe(20000);
    expect(tx.sale_amount).toBe(20000);
  });

  it("использует тест-товар и его cert-type", () => {
    expect(tx.good_id).toBe(23833850);
    expect(tx.good.loyalty_certificate_type_id).toBe(266333);
    expect(op.storage_id).toBe(424028);
  });
});

describe("altegio salon mapping", () => {
  it("покрывает все 7 префиксов уникальными company_id", () => {
    const ids = Object.values(SALON_PREFIX_TO_ALTEGIO);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
  });
});
