import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "../db";
import {
  detectColumns,
  parseCsv,
  toStatementRows,
  type ColumnMap,
  type ParsedStatement,
  type StatementRow,
} from "./statement-parse";
import { matchStatement, summarize, type MatchableOrder } from "./statement-match";

/**
 * Сверка с банковской выпиской: файл → разбор → сопоставление → сохранение.
 *
 * Что здесь важно понимать про смысл. Совпадение сумм за день ничего не
 * доказывает: две ошибки в разные стороны гасят друг друга, и именно такие
 * случаи бухгалтер потом ищет неделями. Поэтому сверка идёт построчно и
 * называет расхождения поимённо — какой платёж банка не наш и по какому нашему
 * заказу денег нет.
 *
 * Результат сохраняется целиком, а не только расхождения: иначе на вопрос
 * «а этот платёж мы уже разбирали?» ответить нечем.
 */

export type StatementSource = "kaspi" | "forte";

export type UploadResult =
  | {
      ok: true;
      summary: ReturnType<typeof summarize>;
      skipped: number;
      batchId: string;
      columns: ColumnMap;
    }
  | { ok: false; error: string; columns?: string[] };

/** Читает XLSX первой страницей и приводит к тому же виду, что и CSV. */
async function parseXlsx(buffer: Buffer): Promise<ParsedStatement> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = book.worksheets[0];
  if (!sheet) return { columns: [], detected: null, rows: [] };

  const table: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      let text = "";
      const value = cell.value;
      if (value instanceof Date) {
        text = value.toISOString().slice(0, 10);
      } else if (value !== null && value !== undefined) {
        text =
          typeof value === "object" && "text" in value
            ? String((value as { text: unknown }).text)
            : String(value);
      }
      cells[col - 1] = text.trim();
    });
    table.push([...cells].map((c) => c ?? ""));
  });

  // Шапка — первая строка, в которой узнаются дата и сумма. У выписок сверху
  // бывает шапка документа на несколько строк.
  let headerIndex = 0;
  for (let i = 0; i < Math.min(table.length, 15); i += 1) {
    if (detectColumns(table[i].map((c) => c ?? ""))) {
      headerIndex = i;
      break;
    }
  }
  const columns = (table[headerIndex] ?? []).map(
    (c, i) => c || `Колонка ${i + 1}`,
  );
  const rows = table.slice(headerIndex + 1).map((cells) => {
    const row: Record<string, string> = {};
    columns.forEach((col, index) => {
      row[col] = cells[index] ?? "";
    });
    return row;
  });
  return { columns, detected: detectColumns(columns), rows };
}

async function parseFile(
  name: string,
  buffer: Buffer,
): Promise<ParsedStatement> {
  if (/\.xlsx?$/i.test(name)) return parseXlsx(buffer);
  return parseCsv(buffer.toString("utf8"));
}

/** Наши оплаченные заказы за период, пригодные для сопоставления. */
async function ordersForPeriod(
  source: StatementSource,
  from: Date,
  to: Date,
): Promise<MatchableOrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      status: "paid",
      paymentProvider: source,
      OR: [
        { paidAt: { gte: from, lt: to } },
        { paidAt: null, createdAt: { gte: from, lt: to } },
      ],
    },
    select: {
      id: true,
      amountKzt: true,
      paidAt: true,
      createdAt: true,
      kaspiRef: true,
      paymentId: true,
      paymentProvider: true,
      salon: { select: { city: true, name: true } },
      certificates: { select: { serial: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    amountKzt: o.amountKzt,
    paidAt: o.paidAt ?? o.createdAt,
    kaspiRef: o.kaspiRef,
    paymentId: o.paymentId,
    provider: o.paymentProvider,
    salonLabel: `${o.salon.city}, ${o.salon.name}`,
    serial: o.certificates[0]?.serial ?? null,
  }));
}

export async function uploadStatement(input: {
  source: StatementSource;
  fileName: string;
  buffer: Buffer;
  from: Date;
  to: Date;
  actor: string;
  /** Ручное сопоставление колонок, если автоматика не справилась. */
  columns?: ColumnMap;
}): Promise<UploadResult> {
  const parsed = await parseFile(input.fileName, input.buffer);
  if (parsed.rows.length === 0) {
    return { ok: false, error: "В файле не нашлось ни одной строки с данными." };
  }
  const map = input.columns ?? parsed.detected;
  if (!map) {
    return {
      ok: false,
      error:
        "Не понял, где в файле дата и сумма. Укажите колонки вручную или пришлите файл — подстроим разбор.",
      columns: parsed.columns,
    };
  }

  const { rows, skipped } = toStatementRows(parsed, map);
  if (rows.length === 0) {
    return {
      ok: false,
      error: `Ни одной операции не разобрано (пропущено строк: ${skipped}). Проверьте, те ли колонки выбраны.`,
      columns: parsed.columns,
    };
  }

  const orders = await ordersForPeriod(input.source, input.from, input.to);
  const result = matchStatement(rows, orders);

  // Повторная загрузка того же источника за тот же период заменяет прежнюю
  // целиком: иначе строки удваивались бы, и «расхождений» становилось вдвое
  // больше на ровном месте.
  const batchId = `${input.source}:${input.from.toISOString().slice(0, 10)}:${Date.now()}`;
  await prisma.$transaction(async (tx) => {
    await tx.bankStatementEntry.deleteMany({
      where: {
        source: input.source,
        operatedAt: { gte: input.from, lt: input.to },
      },
    });
    const data = [
      ...result.matched.map((m) => ({
        source: input.source,
        operatedAt: m.row.operatedAt,
        amountKzt: m.row.amountKzt,
        reference: m.row.reference?.slice(0, 128) ?? null,
        raw: m.row.raw,
        orderId: m.order?.id ?? null,
        matchedBy: m.by,
        batchId,
        uploadedBy: input.actor,
      })),
      ...result.extraInStatement.map((row) => ({
        source: input.source,
        operatedAt: row.operatedAt,
        amountKzt: row.amountKzt,
        reference: row.reference?.slice(0, 128) ?? null,
        raw: row.raw,
        orderId: null,
        matchedBy: null,
        batchId,
        uploadedBy: input.actor,
      })),
    ];
    // createMany порциями: месячная выписка это сотни строк, одним запросом их
    // слать незачем.
    for (let i = 0; i < data.length; i += 200) {
      await tx.bankStatementEntry.createMany({ data: data.slice(i, i + 200) });
    }
  });

  return {
    ok: true,
    summary: summarize(result),
    skipped,
    batchId,
    columns: map,
  };
}

export type Discrepancies = {
  /** Платежи банка без нашего заказа: деньги пришли, сертификата нет */
  extra: {
    id: string;
    source: string;
    operatedAt: Date;
    amountKzt: number;
    reference: string | null;
  }[];
  /** Наши оплаченные заказы, которых нет в загруженной выписке */
  missing: {
    id: string;
    paidAt: Date;
    amountKzt: number;
    provider: string | null;
    salonLabel: string;
    serial: string | null;
  }[];
  /** Источники и периоды, по которым выписка вообще загружалась */
  loaded: { source: string; count: number; from: Date; to: Date }[];
};

/**
 * Расхождения за период — то, что показывается под отчётом.
 *
 * Считается по сохранённой выписке, а не пересчитывается заново: бухгалтер
 * открывает отчёт много раз, а загружает выписку один.
 */
export async function findStatementDiscrepancies(
  from: Date,
  to: Date,
): Promise<Discrepancies> {
  const entries = await prisma.bankStatementEntry.findMany({
    where: { operatedAt: { gte: from, lt: to } },
    orderBy: { operatedAt: "asc" },
    select: {
      id: true,
      source: true,
      operatedAt: true,
      amountKzt: true,
      reference: true,
      orderId: true,
    },
  });
  if (entries.length === 0) {
    return { extra: [], missing: [], loaded: [] };
  }

  const sources = [...new Set(entries.map((e) => e.source))];
  const matchedOrderIds = new Set(
    entries.map((e) => e.orderId).filter((id): id is string => !!id),
  );

  const ourOrders = await prisma.order.findMany({
    where: {
      status: "paid",
      paymentProvider: { in: sources as ("kaspi" | "forte")[] },
      OR: [
        { paidAt: { gte: from, lt: to } },
        { paidAt: null, createdAt: { gte: from, lt: to } },
      ],
    },
    select: {
      id: true,
      paidAt: true,
      createdAt: true,
      amountKzt: true,
      paymentProvider: true,
      paymentId: true,
      salon: { select: { city: true, name: true } },
      certificates: { select: { serial: true } },
    },
  });

  const loaded = sources.map((source) => {
    const rows = entries.filter((e) => e.source === source);
    return {
      source,
      count: rows.length,
      from: rows[0].operatedAt,
      to: rows[rows.length - 1].operatedAt,
    };
  });

  return {
    extra: entries
      .filter((e) => !e.orderId)
      .map((e) => ({
        id: e.id,
        source: e.source,
        operatedAt: e.operatedAt,
        amountKzt: e.amountKzt,
        reference: e.reference,
      })),
    missing: ourOrders
      .filter((o) => !matchedOrderIds.has(o.id))
      // Подтверждённые вручную в выписке провайдера и не должны появляться:
      // это не расхождение, а другой способ оплаты.
      .filter((o) => !o.paymentId?.startsWith("manual:"))
      .map((o) => ({
        id: o.id,
        paidAt: o.paidAt ?? o.createdAt,
        amountKzt: o.amountKzt,
        provider: o.paymentProvider,
        salonLabel: `${o.salon.city}, ${o.salon.name}`,
        serial: o.certificates[0]?.serial ?? null,
      })),
    loaded,
  };
}

export type { StatementRow, ColumnMap };
