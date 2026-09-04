import { describe, expect, it } from "vitest";
import {
  daysBetween,
  reportToCsv,
  type CertificateReport,
} from "@/lib/admin/certificate-report";

/**
 * День в отчёте — алматинский, а не UTC. Продажа в 21:00 по Алматы это 16:00
 * UTC того же дня, а вот в 02:00 по Алматы — 21:00 UTC ПРЕДЫДУЩИХ суток. Если
 * считать по UTC, ночные продажи уезжают в чужой день, и итог не сходится с
 * кассовой сменой — то есть отчёт делает ровно то, из-за чего его и заводили.
 */
describe("daysBetween", () => {
  it("день считается по Алматы, а не по UTC", () => {
    // 31 августа 21:00 UTC = 1 сентября 02:00 по Алматы
    const from = new Date("2026-08-31T19:00:00Z");
    const to = new Date("2026-09-01T19:00:00Z");
    expect(daysBetween(from, to)).toEqual(["2026-09-01"]);
  });

  it("месяц отдаёт все свои дни", () => {
    const days = daysBetween(
      new Date("2026-08-31T19:00:00Z"),
      new Date("2026-09-30T19:00:00Z"),
    );
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-09-01");
    expect(days.at(-1)).toBe("2026-09-30");
  });
});

function report(): CertificateReport {
  return {
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
}

describe("reportToCsv", () => {
  it("раскладка как в таблице бухгалтера: филиалы строками, дни парами колонок", () => {
    const csv = reportToCsv(report(), "paid");
    // Первый символ — BOM, без него Excel в Windows читает кириллицу мусором
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Филиал;01.09.2026;;02.09.2026;;Итого;");
    expect(lines[1]).toBe(";Сумма;Кол-во;Сумма;Кол-во;Сумма;Кол-во");
    expect(lines[2]).toBe("Астана, Мәңгілік Ел;70000;2;;;70000;2");
    expect(lines[4]).toBe("Итог;70000;2;20000;1;90000;3");
  });

  it("номинал и оплата — разные суммы, и их нельзя подменять", () => {
    // При промокоде в банк пришло 70 000, а сертификатов выпущено на 100 000.
    // С выпиской сходится первое, с Altegio — второе.
    expect(reportToCsv(report(), "paid")).toContain(";70000;2;");
    expect(reportToCsv(report(), "face")).toContain(";100000;2;");
  });

  it("пустой день филиала остаётся пустым, а не нулём", () => {
    // Ноль читается как «продавали на ноль», пустая ячейка — «не продавали».
    // В сверке это разные вещи.
    const csv = reportToCsv(report(), "paid");
    expect(csv.split("\r\n")[2]).toContain(";;;");
  });
});
