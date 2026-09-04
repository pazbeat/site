/**
 * Разбор банковской выписки: CSV или XLSX → строки {дата, сумма, номер}.
 *
 * Формат выписки нам не подчиняется: у Kaspi он один, у ForteBank другой, и
 * оба меняются без предупреждения. Поэтому колонки не зашиты, а угадываются по
 * заголовкам, а угаданное показывается человеку до сверки — ошибиться молча
 * здесь хуже, чем не разобрать вовсе.
 *
 * Чистый модуль без обращений к базе: его можно проверить тестами на кусочках
 * настоящих выписок, когда они появятся.
 */

export type StatementRow = {
  /** Дата операции */
  operatedAt: Date;
  /** Сумма в тенге, всегда положительная */
  amountKzt: number;
  /** Номер операции/заказа из выписки, если он там есть */
  reference: string | null;
  /** Строка целиком — чтобы человек мог увидеть, что пришло */
  raw: Record<string, string>;
};

export type ColumnMap = { date: string; amount: string; reference?: string };

export type ParsedStatement = {
  columns: string[];
  detected: ColumnMap | null;
  rows: Record<string, string>[];
};

/** Заголовки, по которым узнаём нужные колонки. Порядок = приоритет. */
const HINTS = {
  date: ["дата операции", "дата платежа", "дата", "date", "operation date"],
  amount: ["сумма", "amount", "сумма операции", "сумма платежа", "итого"],
  reference: [
    "номер заказа",
    "номер операции",
    "order",
    "reference",
    "назначение",
    "комментарий",
    "детали",
    "txn",
    "id",
  ],
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Ищет колонку по подсказкам: сначала точное совпадение, потом вхождение. */
export function detectColumn(
  columns: string[],
  hints: string[],
): string | null {
  const normalized = columns.map((c) => [c, norm(c)] as const);
  for (const hint of hints) {
    const exact = normalized.find(([, n]) => n === hint);
    if (exact) return exact[0];
  }
  for (const hint of hints) {
    const partial = normalized.find(([, n]) => n.includes(hint));
    if (partial) return partial[0];
  }
  return null;
}

export function detectColumns(columns: string[]): ColumnMap | null {
  const date = detectColumn(columns, HINTS.date);
  const amount = detectColumn(columns, HINTS.amount);
  if (!date || !amount) return null;
  const reference = detectColumn(columns, HINTS.reference) ?? undefined;
  return { date, amount, reference };
}

/**
 * Сумма из выписки. Банки пишут по-разному: «12 000,00», «12000.00»,
 * «12 000,00 ₸», иногда со знаком минус для списаний.
 */
export function parseAmount(value: string): number | null {
  if (!value) return null;
  const cleaned = value
    .replace(/ /g, " ")
    .replace(/[^\d,.\-]/g, "")
    .replace(/\s/g, "");
  if (!cleaned) return null;
  // Запятая как десятичный разделитель, если после неё ровно две цифры
  const normalized = /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(Math.abs(num));
}

/**
 * Дата из выписки. Понимаем «01.09.2026», «2026-09-01», «01/09/2026», с
 * временем и без. Двузначный год не принимаем: угадывать век на деньгах нельзя.
 */
export function parseDate(value: string): Date | null {
  if (!value) return null;
  const text = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  }
  const ru = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(text);
  if (ru) {
    return new Date(Date.UTC(+ru[3], +ru[2] - 1, +ru[1]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Разбирает CSV: разделитель определяется по первой строке. */
export function parseCsv(text: string): ParsedStatement {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], detected: null, rows: [] };

  const delimiter = [";", "\t", ","]
    .map((d) => [d, lines[0].split(d).length] as const)
    .sort((a, b) => b[1] - a[1])[0][0];

  const split = (line: string) => {
    // Учитываем кавычки: в назначении платежа встречается разделитель
    const out: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = !quoted;
        continue;
      }
      if (ch === delimiter && !quoted) {
        out.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    out.push(current);
    return out.map((v) => v.trim());
  };

  // Шапка не всегда первая строка: у выписок сверху бывает «шапка документа».
  // Берём первую строку, в которой больше одной непустой ячейки и есть хоть
  // одна подсказка из наших.
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 15); i += 1) {
    const cells = split(lines[i]).filter(Boolean);
    if (cells.length < 2) continue;
    if (detectColumns(split(lines[i]))) {
      headerIndex = i;
      break;
    }
  }

  const columns = split(lines[headerIndex]).map((c, i) => c || `Колонка ${i + 1}`);
  const rows: Record<string, string>[] = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const cells = split(lines[i]);
    if (cells.every((c) => !c)) continue;
    const row: Record<string, string> = {};
    columns.forEach((col, index) => {
      row[col] = cells[index] ?? "";
    });
    rows.push(row);
  }

  return { columns, detected: detectColumns(columns), rows };
}

/** Приводит разобранные строки к операциям по выбранному сопоставлению колонок. */
export function toStatementRows(
  parsed: ParsedStatement,
  map: ColumnMap,
): { rows: StatementRow[]; skipped: number } {
  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const raw of parsed.rows) {
    const operatedAt = parseDate(raw[map.date] ?? "");
    const amountKzt = parseAmount(raw[map.amount] ?? "");
    // Строка без даты или суммы — это подвал, итог или разделитель, а не
    // операция. Молча пропускаем, но считаем: количество должно быть видно.
    if (!operatedAt || !amountKzt) {
      skipped += 1;
      continue;
    }
    rows.push({
      operatedAt,
      amountKzt,
      reference: map.reference ? (raw[map.reference] || null) : null,
      raw,
    });
  }
  return { rows, skipped };
}
