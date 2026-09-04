import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "../db";
import type { CertificateReport } from "./certificate-report";

/**
 * Отчёт по сертификатам в Excel — то, что бухгалтер открывает и сразу читает.
 *
 * CSV для этой задачи не годится: в её таблице дата стоит НАД парой колонок
 * «сумма / количество», а в CSV объединённых ячеек нет, и файл открывается
 * съехавшим. Плюс числа без разрядов и без выравнивания читаются хуже, чем
 * ничего. Здесь всё это есть: объединённые шапки, формат чисел с разрядами,
 * закреплённые заголовки и первая колонка, ширины под содержимое.
 *
 * Второй лист — расшифровка по каждому сертификату. Именно она отвечает на
 * вопрос «откуда взялась эта сумма», который возникает при первом же
 * расхождении с выпиской; без неё пришлось бы возвращаться в админку и искать
 * руками.
 */

const PURPLE = "FF4D295D";
const GOLD = "FFB69244";
const LIGHT = "FFF3EEF6";

const MONEY = "# ##0";
const DATE_FMT = "dd.mm.yyyy";

function ruDate(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

export async function buildCertificateXlsx(input: {
  report: CertificateReport;
  measure: "paid" | "face";
  periodLabel: string;
  from: Date;
  to: Date;
}): Promise<Buffer> {
  const { report, measure } = input;
  const book = new ExcelJS.Workbook();
  book.creator = "Imbir Thai Spa";
  book.created = new Date();

  // ── Лист 1: сводка филиалы × дни ─────────────────────────────────
  const sheet = book.addWorksheet("Сводка", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
  });

  const title = sheet.getCell(1, 1);
  title.value =
    measure === "paid"
      ? `Продажи сертификатов · ${input.periodLabel} · суммы оплат`
      : `Продажи сертификатов · ${input.periodLabel} · номинал сертификатов`;
  title.font = { bold: true, size: 14, color: { argb: PURPLE } };
  sheet.mergeCells(1, 1, 1, 1 + report.days.length * 2 + 2);

  // Шапка: дата над парой колонок, ниже «Сумма | Кол-во»
  sheet.getCell(2, 1).value = "Филиал";
  sheet.mergeCells(2, 1, 3, 1);
  report.days.forEach((day, index) => {
    const col = 2 + index * 2;
    const cell = sheet.getCell(2, col);
    cell.value = ruDate(day);
    sheet.mergeCells(2, col, 2, col + 1);
    sheet.getCell(3, col).value = "Сумма";
    sheet.getCell(3, col + 1).value = "Кол-во";
  });
  const totalCol = 2 + report.days.length * 2;
  sheet.getCell(2, totalCol).value = "Итого";
  sheet.mergeCells(2, totalCol, 2, totalCol + 1);
  sheet.getCell(3, totalCol).value = "Сумма";
  sheet.getCell(3, totalCol + 1).value = "Кол-во";

  for (let row = 2; row <= 3; row += 1) {
    for (let col = 1; col <= totalCol + 1; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PURPLE },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
    }
  }

  const pick = (cell?: { paidKzt: number; faceKzt: number }) =>
    cell ? (measure === "paid" ? cell.paidKzt : cell.faceKzt) : null;

  let rowIndex = 4;
  for (const branch of report.branches) {
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = branch.label;
    report.days.forEach((day, index) => {
      const value = report.cells[`${branch.id}:${day}`];
      const col = 2 + index * 2;
      // Пустая ячейка остаётся пустой, а не нулём: «не продавали» и «продали
      // на ноль» в сверке разные вещи.
      row.getCell(col).value = pick(value);
      row.getCell(col + 1).value = value ? value.count : null;
    });
    const totals = report.totalsByBranch[branch.id];
    row.getCell(totalCol).value = pick(totals) ?? 0;
    row.getCell(totalCol + 1).value = totals ? totals.count : 0;
    row.getCell(totalCol).font = { bold: true };
    row.getCell(totalCol + 1).font = { bold: true };
    if (rowIndex % 2 === 1) {
      for (let col = 1; col <= totalCol + 1; col += 1) {
        row.getCell(col).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: LIGHT },
        };
      }
    }
    rowIndex += 1;
  }

  const totalRow = sheet.getRow(rowIndex);
  totalRow.getCell(1).value = "Итог";
  report.days.forEach((day, index) => {
    const value = report.totalsByDay[day];
    const col = 2 + index * 2;
    totalRow.getCell(col).value = pick(value) ?? 0;
    totalRow.getCell(col + 1).value = value ? value.count : 0;
  });
  totalRow.getCell(totalCol).value = pick(report.total) ?? 0;
  totalRow.getCell(totalCol + 1).value = report.total.count;
  for (let col = 1; col <= totalCol + 1; col += 1) {
    const cell = totalRow.getCell(col);
    cell.font = { bold: true, color: { argb: PURPLE } };
    cell.border = { top: { style: "medium", color: { argb: GOLD } } };
  }

  // Форматы и ширины
  sheet.getColumn(1).width = 26;
  for (let col = 2; col <= totalCol + 1; col += 1) {
    const isCount = (col - 2) % 2 === 1;
    sheet.getColumn(col).width = isCount ? 8 : 12;
    sheet.getColumn(col).numFmt = isCount ? "0" : MONEY;
    sheet.getColumn(col).alignment = { horizontal: "right" };
  }

  // ── Лист 2: расшифровка по сертификатам ──────────────────────────
  const details = await prisma.certificate.findMany({
    where: {
      order: {
        status: "paid",
        OR: [
          { paidAt: { gte: input.from, lt: input.to } },
          { paidAt: null, createdAt: { gte: input.from, lt: input.to } },
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      serial: true,
      amountKzt: true,
      createdAt: true,
      toName: true,
      fromName: true,
      altegioSyncStatus: true,
      salon: { select: { city: true, name: true } },
      order: {
        select: {
          id: true,
          kaspiRef: true,
          amountKzt: true,
          paidAt: true,
          createdAt: true,
          paymentProvider: true,
          paymentId: true,
          buyerEmail: true,
          promo: { select: { code: true } },
        },
      },
    },
  });

  const list = book.addWorksheet("Сертификаты", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const columns = [
    { header: "Дата оплаты", key: "date", width: 14 },
    { header: "Филиал", key: "salon", width: 26 },
    { header: "Сертификат", key: "serial", width: 14 },
    { header: "Номинал", key: "face", width: 12 },
    { header: "Оплачено", key: "paid", width: 12 },
    { header: "Промокод", key: "promo", width: 12 },
    { header: "Способ", key: "method", width: 16 },
    { header: "Номер операции", key: "ref", width: 24 },
    { header: "Номер для Kaspi", key: "kaspi", width: 20 },
    { header: "Кому", key: "to", width: 18 },
    { header: "От кого", key: "from", width: 18 },
    { header: "Почта покупателя", key: "email", width: 26 },
    { header: "В Altegio", key: "crm", width: 12 },
  ];
  list.columns = columns;
  list.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  list.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PURPLE },
  };

  const CRM_LABEL: Record<string, string> = {
    synced: "да",
    pending: "ждёт",
    failed: "ОШИБКА",
    missing: "ПРОПАЛ",
    skipped: "не писали",
  };

  for (const cert of details) {
    const manual = cert.order.paymentId?.startsWith("manual:") ?? false;
    list.addRow({
      date: cert.order.paidAt ?? cert.order.createdAt,
      salon: `${cert.salon.city}, ${cert.salon.name}`,
      serial: cert.serial ?? "—",
      face: cert.amountKzt ?? 0,
      paid: cert.order.amountKzt,
      promo: cert.order.promo?.code ?? "",
      method: manual
        ? "Вручную"
        : cert.order.paymentProvider === "kaspi"
          ? "Kaspi"
          : cert.order.paymentProvider === "forte"
            ? "Карта (Forte)"
            : "—",
      ref: manual
        ? cert.order.paymentId?.slice("manual:".length)
        : (cert.order.paymentId ?? ""),
      kaspi: cert.order.kaspiRef ?? "",
      to: cert.toName,
      from: cert.fromName,
      email: cert.order.buyerEmail,
      crm: CRM_LABEL[cert.altegioSyncStatus] ?? cert.altegioSyncStatus,
    });
  }

  list.getColumn("date").numFmt = DATE_FMT;
  list.getColumn("face").numFmt = MONEY;
  list.getColumn("paid").numFmt = MONEY;
  list.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 13 } };

  // ── Лист 3: чем платили ──────────────────────────────────────────
  const methods = book.addWorksheet("Чем платили");
  methods.columns = [
    { header: "Способ", key: "label", width: 22 },
    { header: "Сумма", key: "sum", width: 14 },
    { header: "Сертификатов", key: "count", width: 14 },
  ];
  methods.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  methods.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PURPLE },
  };
  for (const m of report.byMethod) {
    methods.addRow({ label: m.label, sum: m.paidKzt, count: m.count });
  }
  methods.getColumn("sum").numFmt = MONEY;

  const out = await book.xlsx.writeBuffer();
  return Buffer.from(out);
}
