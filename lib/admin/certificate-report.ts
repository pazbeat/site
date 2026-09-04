import "server-only";
import { prisma } from "../db";

/**
 * Отчёт по проданным сертификатам: филиалы × дни, суммы и количество.
 *
 * Форма отчёта повторяет таблицу, которую бухгалтер ведёт руками (по строке на
 * филиал, по паре колонок «сумма / количество» на каждый день, итоги справа и
 * снизу). Это не подражание ради подражания: она сверяет её с выпиской и с
 * Altegio, и любая другая раскладка означала бы, что цифры придётся
 * перекладывать глазами — то есть ровно ту работу, которую отчёт и убирает.
 *
 * День считается по времени салона (Asia/Almaty, UTC+5, без перехода). В UTC
 * вечерние продажи уезжали бы в следующие сутки, и итоги не сошлись бы с
 * кассовой сменой.
 *
 * Две суммы намеренно разные:
 *  · «оплачено» — сколько пришло денег. С ним сверяется банковская выписка.
 *  · «номинал» — на какую сумму выпущены сертификаты. С ним сверяется Altegio.
 * При промокоде они расходятся, и подменять одно другим нельзя.
 */

export type ReportCell = { paidKzt: number; faceKzt: number; count: number };

export type CertificateReport = {
  /** Дни периода по Алматы, YYYY-MM-DD, по возрастанию. */
  days: string[];
  branches: { id: number; label: string }[];
  /** Значение по паре «филиал + день»; ключ `${salonId}:${day}`. */
  cells: Record<string, ReportCell>;
  totalsByDay: Record<string, ReportCell>;
  totalsByBranch: Record<number, ReportCell>;
  total: ReportCell;
  /** Разбивка по способу оплаты — ручные подтверждения отдельной строкой. */
  byMethod: { key: string; label: string; paidKzt: number; count: number }[];
};

const EMPTY: ReportCell = { paidKzt: 0, faceKzt: 0, count: 0 };

function add(target: ReportCell | undefined, value: ReportCell): ReportCell {
  const base = target ?? EMPTY;
  return {
    paidKzt: base.paidKzt + value.paidKzt,
    faceKzt: base.faceKzt + value.faceKzt,
    count: base.count + value.count,
  };
}

/** Дни периода включительно, по алматинскому календарю. */
export function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const shift = 5 * 3_600_000;
  const start = new Date(
    Date.UTC(
      new Date(from.getTime() + shift).getUTCFullYear(),
      new Date(from.getTime() + shift).getUTCMonth(),
      new Date(from.getTime() + shift).getUTCDate(),
    ),
  );
  const end = new Date(to.getTime() + shift - 1);
  const last = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  for (let t = start.getTime(); t <= last; t += 24 * 3_600_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
    // Защита от бесконечного цикла на кривом периоде
    if (out.length > 400) break;
  }
  return out;
}

const METHOD_LABEL: Record<string, string> = {
  kaspi: "Kaspi",
  forte: "Карта (Forte)",
  manual: "Вручную",
  "—": "Не указан",
};

type Row = {
  salon_id: number;
  city: string;
  name: string;
  day: string;
  cnt: number;
  paid_sum: number;
  face_sum: number;
  method: string;
};

/**
 * Границы отчёта. Пустой период («всё время») в матрице по дням не имеет
 * смысла — колонок было бы на годы; сводим к последним 30 суткам.
 */
export function reportRange(
  from: Date | null,
  to: Date | null,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const end = to ?? now;
  return {
    from: from ?? new Date(end.getTime() - 30 * 24 * 3_600_000),
    to: end,
  };
}

export async function buildCertificateReport(
  fromRaw: Date | null,
  toRaw: Date | null,
  now: Date = new Date(),
): Promise<CertificateReport> {
  const { from, to } = reportRange(fromRaw, toRaw, now);
  // Одним запросом: сертификаты с их заказами, сгруппированные по дню салона.
  // Считаем по сертификатам, а не по заказам: в отчёте бухгалтера строка — это
  // выпущенный сертификат, и заказ с двумя сертификатами (схема это допускает)
  // должен дать двойку, а не единицу.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT s.id AS salon_id,
           s.city,
           s.name,
           to_char((COALESCE(o.paid_at, o.created_at) + interval '5 hours')::date, 'YYYY-MM-DD') AS day,
           COUNT(c.id)::int AS cnt,
           COALESCE(SUM(o.amount_kzt), 0)::int AS paid_sum,
           COALESCE(SUM(c.amount_kzt), 0)::int AS face_sum,
           CASE
             WHEN o.payment_id LIKE 'manual:%' THEN 'manual'
             ELSE COALESCE(o.payment_provider::text, '—')
           END AS method
      FROM certificates c
      JOIN orders o ON o.id = c.order_id
      JOIN salons s ON s.id = c.salon_id
     WHERE o.status = 'paid'
       AND COALESCE(o.paid_at, o.created_at) >= ${from}
       AND COALESCE(o.paid_at, o.created_at) < ${to}
     GROUP BY 1, 2, 3, 4, 8
  `;

  const days = daysBetween(from, to);
  const branchMap = new Map<number, string>();
  const cells: Record<string, ReportCell> = {};
  const totalsByDay: Record<string, ReportCell> = {};
  const totalsByBranch: Record<number, ReportCell> = {};
  const byMethod = new Map<string, { paidKzt: number; count: number }>();
  let total = EMPTY;

  for (const row of rows) {
    branchMap.set(row.salon_id, `${row.city}, ${row.name}`);
    const value: ReportCell = {
      paidKzt: row.paid_sum,
      faceKzt: row.face_sum,
      count: row.cnt,
    };
    const key = `${row.salon_id}:${row.day}`;
    cells[key] = add(cells[key], value);
    totalsByDay[row.day] = add(totalsByDay[row.day], value);
    totalsByBranch[row.salon_id] = add(totalsByBranch[row.salon_id], value);
    total = add(total, value);

    const method = byMethod.get(row.method) ?? { paidKzt: 0, count: 0 };
    method.paidKzt += row.paid_sum;
    method.count += row.cnt;
    byMethod.set(row.method, method);
  }

  // Филиалы: сначала те, где были продажи, потом остальные активные — пустая
  // строка филиала в отчёте тоже информация («там не продавали»).
  const allSalons = await prisma.salon.findMany({
    where: { active: true },
    orderBy: [{ city: "asc" }, { sort: "asc" }],
    select: { id: true, city: true, name: true },
  });
  const branches = allSalons.map((s) => ({
    id: s.id,
    label: branchMap.get(s.id) ?? `${s.city}, ${s.name}`,
  }));
  // Филиал мог быть отключён после продаж — он всё равно должен быть в отчёте
  for (const [id, label] of branchMap) {
    if (!branches.some((b) => b.id === id)) branches.push({ id, label });
  }

  return {
    days,
    branches,
    cells,
    totalsByDay,
    totalsByBranch,
    total,
    byMethod: [...byMethod.entries()]
      .map(([key, v]) => ({
        key,
        label: METHOD_LABEL[key] ?? key,
        paidKzt: v.paidKzt,
        count: v.count,
      }))
      .sort((a, b) => b.paidKzt - a.paidKzt),
  };
}

/**
 * Отчёт в раскладке бухгалтерской таблицы: строки — филиалы, на каждый день
 * пара колонок «сумма / количество», справа итог.
 *
 * Разделитель — точка с запятой, числа без пробелов-разделителей: так их
 * принимает и Excel, и Google Таблицы, и их можно вставить прямо в её файл.
 */
export function reportToCsv(
  report: CertificateReport,
  measure: "paid" | "face",
): string {
  const pick = (cell: ReportCell | undefined) =>
    cell ? (measure === "paid" ? cell.paidKzt : cell.faceKzt) : 0;

  const head1 = ["Филиал"];
  const head2 = [""];
  for (const day of report.days) {
    const [y, m, d] = day.split("-");
    head1.push(`${d}.${m}.${y}`, "");
    head2.push("Сумма", "Кол-во");
  }
  head1.push("Итого", "");
  head2.push("Сумма", "Кол-во");

  const lines = [head1.join(";"), head2.join(";")];
  for (const branch of report.branches) {
    const row: (string | number)[] = [branch.label];
    for (const day of report.days) {
      const cell = report.cells[`${branch.id}:${day}`];
      row.push(cell ? pick(cell) : "", cell ? cell.count : "");
    }
    const totals = report.totalsByBranch[branch.id];
    row.push(totals ? pick(totals) : 0, totals ? totals.count : 0);
    lines.push(row.join(";"));
  }

  const totalRow: (string | number)[] = ["Итог"];
  for (const day of report.days) {
    const cell = report.totalsByDay[day];
    totalRow.push(cell ? pick(cell) : 0, cell ? cell.count : 0);
  }
  totalRow.push(pick(report.total), report.total.count);
  lines.push(totalRow.join(";"));

  // BOM — иначе Excel в Windows открывает кириллицу нечитаемой
  return "﻿" + lines.join("\r\n");
}
