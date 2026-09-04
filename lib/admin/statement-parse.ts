/**
 * Разбор банковской выписки: CSV, Excel (в том числе старый .xls) или PDF →
 * строки {дата, сумма, номер}.
 *
 * Формат выписки нам не подчиняется, и оба банка пишут по-своему. Сверено на
 * настоящих выгрузках за 03.09.2026:
 *
 *   ForteBank — «Выписка по коммерсанту», старый .xls: шапка на 10-й строке,
 *   дата «03.09.26 07:42:05» с ДВУЗНАЧНЫМ годом, две похожие денежные колонки
 *   («Сумма транзакции» и «Сумма зачисления» — вторая уже без комиссии), а
 *   номера нашего заказа нет вовсе: сверять придётся по сумме и времени.
 *
 *   Kaspi — «Детальная информация по операциям», PDF: есть «Тип операции»
 *   (Покупка/Возврат) и «Детали покупки» с двадцатизначным номером заказа —
 *   тем самым, который мы отдаём в Kaspi. То есть Kaspi сверяется по номеру.
 *
 * Отсюда два правила, которые здесь важнее остальных. Первое: денежную
 * колонку выбираем по смыслу, а не по слову «сумма» — перепутать оборот с
 * зачислением значит расходиться ровно на комиссию по каждой строке. Второе:
 * возврат — не платёж; если считать его приходом, он либо займёт чужой заказ,
 * либо будет вечно висеть «лишним платежом».
 *
 * Чистый модуль без обращений к базе: проверяется тестами на кусочках
 * настоящих выписок.
 */

export type StatementKind = "payment" | "refund";

export type StatementRow = {
  /** Момент операции (UTC; в файле банк пишет местное время Алматы) */
  operatedAt: Date;
  /** Сумма в тенге, всегда положительная */
  amountKzt: number;
  /** Приход или возврат — по возвратам сверка идёт отдельно */
  kind: StatementKind;
  /** Комиссия банка по операции, если выписка её печатает */
  feeKzt: number | null;
  /** Номер операции/заказа из выписки, если он там есть */
  reference: string | null;
  /** Строка целиком — чтобы человек мог увидеть, что пришло */
  raw: Record<string, string>;
};

export type ColumnMap = {
  date: string;
  amount: string;
  reference?: string;
  /** Колонка «Тип операции», если банк её печатает */
  kind?: string;
  /** Комиссия банка по строке, если она в выписке есть */
  fee?: string;
  /** Отдельная колонка времени: Kaspi печатает дату и время врозь */
  time?: string;
};

export type ParsedStatement = {
  columns: string[];
  detected: ColumnMap | null;
  rows: Record<string, string>[];
};

/** Часовой пояс салона: банк печатает местное время без указания зоны. */
const ALMATY_OFFSET_MS = 5 * 3_600_000;

/** Заголовки, по которым узнаём нужные колонки. Порядок = приоритет. */
const HINTS = {
  date: [
    "дата транзакции",
    "дата операции",
    "дата платежа",
    "дата и время",
    "дата",
    "date",
  ],
  amount: [
    "сумма транзакции",
    "сумма операции",
    "сумма платежа",
    "сумма",
    "amount",
  ],
  reference: [
    "детали покупки",
    "номер заказа",
    "номер операции",
    "номер транзакции",
    "назначение",
    "комментарий",
    "reference",
    "order",
    "txn",
  ],
  kind: ["тип операции", "тип", "операция", "статус"],
  time: ["время операции", "время"],
  // У Forte это «Комиссия Банка», у Kaspi — «Стоимость услуг Kaspi».
  fee: ["комиссия банка", "комиссия", "стоимость услуг", "стоимость услуги"],
};

/**
 * Денежные колонки, которые похожи на нужную, но означают другое.
 *
 * «Сумма зачисления» у Forte — это оборот МИНУС комиссия банка. Возьми мы её,
 * и сверка разошлась бы на каждой строке: заказ на 35000, в выписке 34125.
 * Лучше честно не понять файл, чем понять его неправильно.
 */
const AMOUNT_EXCLUDE = ["зачислен", "комисси", "услуг", "остаток", "баланс"];

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Без пробелов вовсе — на случай, если из PDF слово пришло разорванным. */
function tight(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

/** Ищет колонку по подсказкам: сначала точное совпадение, потом вхождение. */
export function detectColumn(
  columns: string[],
  hints: string[],
  exclude: string[] = [],
): string | null {
  const allowed = columns.filter(
    (column) => !exclude.some((word) => tight(column).includes(tight(word))),
  );
  const normalized = allowed.map((c) => [c, norm(c), tight(c)] as const);
  for (const hint of hints) {
    const exact = normalized.find(([, n, t]) => n === hint || t === tight(hint));
    if (exact) return exact[0];
  }
  for (const hint of hints) {
    const partial = normalized.find(
      ([, n, t]) => n.includes(hint) || t.includes(tight(hint)),
    );
    if (partial) return partial[0];
  }
  return null;
}

export function detectColumns(columns: string[]): ColumnMap | null {
  const date = detectColumn(columns, HINTS.date);
  const amount = detectColumn(columns, HINTS.amount, AMOUNT_EXCLUDE);
  if (!date || !amount) return null;
  const reference = detectColumn(columns, HINTS.reference) ?? undefined;
  const kind = detectColumn(columns, HINTS.kind) ?? undefined;
  const fee = detectColumn(columns, HINTS.fee) ?? undefined;
  const time = detectColumn(columns, HINTS.time) ?? undefined;
  return { date, amount, reference, kind, fee, time };
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

/** Списание банк помечает минусом — знак нужен отдельно от величины. */
export function isNegativeAmount(value: string): boolean {
  return /-\s*\d/.test(value.replace(/ /g, " "));
}

/**
 * Дата из выписки — как настенное время, без приведения к зоне: понимаем
 * «01.09.2026», «03.09.26 07:42:05», «2026-09-01 14:07», «01/09/2026».
 *
 * Двузначный год пришлось принять: именно так пишет ForteBank, и отвергать
 * его значило бы не читать выписку по картам вовсе. Век берём двадцать первый
 * — банковских выписок за девяностые не бывает.
 */
export function parseDate(value: string): Date | null {
  if (!value) return null;
  const text = value.trim();

  const time = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  const hours = time ? +time[1] : 0;
  const minutes = time ? +time[2] : 0;
  const seconds = time && time[3] ? +time[3] : 0;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) {
    return new Date(
      Date.UTC(+iso[1], +iso[2] - 1, +iso[3], hours, minutes, seconds),
    );
  }
  // Четырёхзначный год пробуем ПЕРВЫМ: чередование останавливается на первом
  // подошедшем, и «\d{2}|\d{4}» откусило бы от «2026» только «20», превратив
  // сентябрь 2026-го в сентябрь 2020-го.
  const ru = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4}|\d{2})/.exec(text);
  if (ru) {
    const year = ru[3].length === 2 ? 2000 + +ru[3] : +ru[3];
    return new Date(Date.UTC(year, +ru[2] - 1, +ru[1], hours, minutes, seconds));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Возврат ли это — по колонке «Тип операции» либо по минусу в сумме. */
export function isRefund(typeText: string, amountText: string): boolean {
  const type = tight(typeText);
  if (type.includes("возврат") || type.includes("refund")) return true;
  if (type.includes("отмен")) return true;
  return isNegativeAmount(amountText);
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

  return gridToStatement(lines.map(split));
}

/**
 * Таблица значений → шапка и строки.
 *
 * Общий путь для CSV и обоих Excel: шапка не всегда первая строка — у выписок
 * сверху бывает «шапка документа» на несколько строк (у Forte их девять).
 * Берём первую строку, в которой узнаются и дата, и сумма.
 */
export function gridToStatement(table: string[][]): ParsedStatement {
  if (table.length === 0) return { columns: [], detected: null, rows: [] };

  let headerIndex = 0;
  for (let i = 0; i < Math.min(table.length, 25); i += 1) {
    const cells = table[i] ?? [];
    if (cells.filter(Boolean).length < 2) continue;
    if (detectColumns(cells)) {
      headerIndex = i;
      break;
    }
  }

  const columns = (table[headerIndex] ?? []).map(
    (c, i) => c || `Колонка ${i + 1}`,
  );
  const rows: Record<string, string>[] = [];
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const cells = table[i] ?? [];
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
    const amountText = raw[map.amount] ?? "";
    // Kaspi печатает дату и время в разных колонках — склеиваем, иначе все
    // операции суток слипаются в полночь и порядок в отчёте теряется.
    const dateText = map.time
      ? `${raw[map.date] ?? ""} ${raw[map.time] ?? ""}`.trim()
      : (raw[map.date] ?? "");
    const wallClock = parseDate(dateText);
    const amountKzt = parseAmount(amountText);
    // Строка без даты или суммы — это подвал, итог или разделитель, а не
    // операция. Молча пропускаем, но считаем: количество должно быть видно.
    if (!wallClock || !amountKzt) {
      skipped += 1;
      continue;
    }
    rows.push({
      // Банк печатает местное время; заказы у нас в UTC — приводим здесь, а не
      // в разборе даты, чтобы разбор оставался про формат, а не про зону.
      operatedAt: new Date(wallClock.getTime() - ALMATY_OFFSET_MS),
      amountKzt,
      kind: isRefund(map.kind ? (raw[map.kind] ?? "") : "", amountText)
        ? "refund"
        : "payment",
      feeKzt: map.fee ? parseAmount(raw[map.fee] ?? "") : null,
      reference: map.reference ? (raw[map.reference] || null) : null,
      raw,
    });
  }
  return { rows, skipped };
}
