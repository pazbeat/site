import { describe, expect, it } from "vitest";
import {
  detectColumns,
  parseAmount,
  parseCsv,
  parseDate,
  toStatementRows,
} from "@/lib/admin/statement-parse";
import { matchStatement, summarize, type MatchableOrder } from "@/lib/admin/statement-match";

/**
 * Формат выписки нам не подчиняется: у Kaspi он один, у ForteBank другой, и
 * оба меняются без предупреждения. Поэтому разбор проверяется на том, как
 * банки реально пишут числа и даты, а не на удобном для нас случае.
 */
describe("разбор сумм", () => {
  it("понимает разряды пробелом и запятую как десятичный разделитель", () => {
    expect(parseAmount("12 000,00")).toBe(12000);
    expect(parseAmount("12 000,00 ₸")).toBe(12000);
    expect(parseAmount("12000.00")).toBe(12000);
    expect(parseAmount("12000")).toBe(12000);
  });

  it("списание берёт по модулю: знак — это направление, а не сумма", () => {
    expect(parseAmount("-35 000,00")).toBe(35000);
  });

  it("на мусоре молчит, а не выдумывает число", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("итого за день")).toBeNull();
  });
});

describe("разбор дат", () => {
  it("понимает и русский, и ISO", () => {
    expect(parseDate("01.09.2026")?.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(parseDate("2026-09-01 14:07")?.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(parseDate("01/09/2026")?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("на пустом не падает", () => {
    expect(parseDate("")).toBeNull();
  });
});

describe("определение колонок", () => {
  it("находит дату, сумму и номер по заголовкам", () => {
    const map = detectColumns(["Дата операции", "Сумма", "Номер заказа", "Статус"]);
    expect(map).toEqual({
      date: "Дата операции",
      amount: "Сумма",
      reference: "Номер заказа",
    });
  });

  it("без даты или суммы не угадывает — попросит человека", () => {
    expect(detectColumns(["Статус", "Комментарий"])).toBeNull();
  });
});

describe("разбор CSV выписки", () => {
  const csv = [
    "Выписка по счёту",
    "Период: 01.09.2026 - 30.09.2026",
    "Дата операции;Сумма;Номер заказа;Статус",
    "01.09.2026;20 000,00;12345678901234567890;Проведён",
    "02.09.2026;35 000,00;98765432109876543210;Проведён",
    "ИТОГО;55 000,00;;",
  ].join("\r\n");

  it("находит шапку, даже если сверху шапка документа", () => {
    const parsed = parseCsv(csv);
    expect(parsed.columns).toEqual([
      "Дата операции",
      "Сумма",
      "Номер заказа",
      "Статус",
    ]);
    expect(parsed.rows).toHaveLength(3);
  });

  it("строка итога отбрасывается: это не операция", () => {
    const parsed = parseCsv(csv);
    const { rows, skipped } = toStatementRows(parsed, parsed.detected!);
    expect(rows).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(rows[0].amountKzt).toBe(20000);
  });
});

function order(over: Partial<MatchableOrder> = {}): MatchableOrder {
  return {
    id: "cmt9t7g75000128qz",
    amountKzt: 20000,
    paidAt: new Date("2026-09-01T09:00:00Z"),
    kaspiRef: "12345678901234567890",
    paymentId: "12345678901234567890",
    provider: "kaspi",
    salonLabel: "Астана, Мәңгілік Ел",
    serial: "WM9001",
    ...over,
  };
}

describe("сопоставление с выпиской", () => {
  const parsed = parseCsv(
    [
      "Дата операции;Сумма;Номер заказа",
      "01.09.2026;20 000,00;12345678901234567890",
      "02.09.2026;35 000,00;00000000000000000000",
    ].join("\r\n"),
  );
  const rows = toStatementRows(parsed, parsed.detected!).rows;

  it("совпадение по номеру важнее совпадения по сумме", () => {
    // Иначе чужой платёж с той же суммой занял бы наш заказ, и оба
    // расхождения спрятались бы друг за другом.
    const result = matchStatement(rows, [order()]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].by).toBe("reference");
  });

  it("платёж банка без нашего заказа — деньги есть, сертификата нет", () => {
    const result = matchStatement(rows, [order()]);
    expect(result.extraInStatement).toHaveLength(1);
    expect(result.extraInStatement[0].amountKzt).toBe(35000);
  });

  it("наш заказ без платежа в выписке виден отдельно", () => {
    const result = matchStatement(rows, [
      order(),
      order({ id: "второй", kaspiRef: "999", paymentId: "999" }),
    ]);
    expect(result.missingInStatement.map((o) => o.id)).toEqual(["второй"]);
  });

  it("номер совпал, сумма разошлась — это отдельная строка, а не «сошлось»", () => {
    const result = matchStatement(rows, [order({ amountKzt: 25000 })]);
    expect(result.amountMismatch).toHaveLength(1);
    expect(result.amountMismatch[0].order.amountKzt).toBe(25000);
  });

  it("без номера в выписке ловим по сумме и дате", () => {
    const noRef = parseCsv(
      ["Дата операции;Сумма", "01.09.2026;20 000,00"].join("\r\n"),
    );
    const plain = toStatementRows(noRef, noRef.detected!).rows;
    const result = matchStatement(plain, [order({ kaspiRef: null, paymentId: null })]);
    expect(result.matched[0].by).toBe("amount_date");
  });

  it("сводка считает и суммы, а не только штуки", () => {
    const s = summarize(matchStatement(rows, [order()]));
    expect(s).toMatchObject({
      matchedCount: 1,
      matchedKzt: 20000,
      extraCount: 1,
      extraKzt: 35000,
      missingCount: 0,
    });
  });
});
