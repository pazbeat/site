import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { CertificateReport } from "@/lib/admin/certificate-report";

/**
 * Файл, который бухгалтер открывает и сразу читает.
 *
 * Проверяем не «код отработал», а то, из-за чего предыдущая выгрузка выглядела
 * кривой: дата должна стоять НАД парой колонок (объединённая ячейка), суммы —
 * числами с форматом разрядов, а не текстом, пустой день — пустым, заголовки и
 * первая колонка — закреплёнными.
 */

vi.mock("@/lib/db", () => ({
  prisma: {
    certificate: { findMany: async () => [] },
  },
}));

const report: CertificateReport = {
  days: ["2026-09-01", "2026-09-02"],
  branches: [
    { id: 1, label: "Астана, Мәңгілік Ел" },
    { id: 2, label: "Алматы, Розыбакиева" },
  ],
  cells: {
    "1:2026-09-01": { paidKzt: 70000, faceKzt: 100000, count: 2 },
    "2:2026-09-02": { paidKzt: 20000, faceKzt: 20000, count: 1 },
  },
  totalsByDay: {
    "2026-09-01": { paidKzt: 70000, faceKzt: 100000, count: 2 },
    "2026-09-02": { paidKzt: 20000, faceKzt: 20000, count: 1 },
  },
  totalsByBranch: {
    1: { paidKzt: 70000, faceKzt: 100000, count: 2 },
    2: { paidKzt: 20000, faceKzt: 20000, count: 1 },
  },
  total: { paidKzt: 90000, faceKzt: 120000, count: 3 },
  byMethod: [{ key: "kaspi", label: "Kaspi", paidKzt: 90000, count: 3 }],
};

async function build(measure: "paid" | "face" = "paid") {
  const { buildCertificateXlsx } = await import("@/lib/admin/certificate-xlsx");
  const buffer = await buildCertificateXlsx({
    report,
    measure,
    periodLabel: "Сентябрь 2026",
    from: new Date("2026-08-31T19:00:00Z"),
    to: new Date("2026-09-30T19:00:00Z"),
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(new Uint8Array(buffer));
  return book;
}

describe("Excel-отчёт по сертификатам", () => {
  it("дата стоит над парой колонок «Сумма / Кол-во»", async () => {
    const sheet = (await build()).getWorksheet("Сводка")!;
    expect(sheet.getCell(2, 2).value).toBe("01.09.2026");
    expect(sheet.getCell(3, 2).value).toBe("Сумма");
    expect(sheet.getCell(3, 3).value).toBe("Кол-во");
    // Именно объединение и делало CSV кривым: там его нет
    expect(sheet.getCell(2, 2).isMerged).toBe(true);
  });

  it("суммы — числа с форматом разрядов, а не текст", async () => {
    const sheet = (await build()).getWorksheet("Сводка")!;
    expect(sheet.getCell(4, 2).value).toBe(70000);
    expect(sheet.getColumn(2).numFmt).toBe("# ##0");
  });

  it("день без продаж остаётся пустым, а не нулём", async () => {
    // Ноль читается как «продавали на ноль». В сверке это разные вещи.
    const sheet = (await build()).getWorksheet("Сводка")!;
    expect(sheet.getCell(4, 4).value).toBeNull();
  });

  it("итоги считаются и по строке, и по колонке", async () => {
    const sheet = (await build()).getWorksheet("Сводка")!;
    // Итог филиала справа
    expect(sheet.getCell(4, 6).value).toBe(70000);
    // Строка «Итог» снизу
    expect(sheet.getCell(6, 1).value).toBe("Итог");
    expect(sheet.getCell(6, 6).value).toBe(90000);
  });

  it("переключение на номинал меняет суммы, а не раскладку", async () => {
    const sheet = (await build("face")).getWorksheet("Сводка")!;
    expect(sheet.getCell(4, 2).value).toBe(100000);
    expect(sheet.getCell(3, 2).value).toBe("Сумма");
  });

  it("заголовки и первая колонка закреплены", async () => {
    // Иначе на месяце в 30 колонок бухгалтер листает вправо и теряет,
    // в какой строке филиал.
    const sheet = (await build()).getWorksheet("Сводка")!;
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 3 });
  });

  it("в книге три листа: сводка, расшифровка и способы оплаты", async () => {
    const book = await build();
    expect(book.worksheets.map((w) => w.name)).toEqual([
      "Сводка",
      "Сертификаты",
      "Чем платили",
    ]);
  });
});
