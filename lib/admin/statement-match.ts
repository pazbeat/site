import type { StatementRow } from "./statement-parse";

/**
 * Сопоставление строк выписки с нашими заказами.
 *
 * Задача не «посчитать, сходятся ли суммы за день», а назвать поимённо: вот
 * этот платёж банка не наш, а вот по этому нашему заказу денег в выписке нет.
 * Именно это бухгалтер сейчас выясняет глазами, и именно на этом теряется
 * время — суммы-то сойтись могут и при двух взаимно гасящих ошибках.
 *
 * Чистая функция: никакой базы, только данные. Поэтому её можно проверять
 * тестами на настоящих выписках, не трогая продакшн.
 */

export type MatchableOrder = {
  id: string;
  amountKzt: number;
  paidAt: Date;
  /** Номер, под которым заказ виден в Kaspi */
  kaspiRef: string | null;
  /** Номер операции у провайдера */
  paymentId: string | null;
  provider: string | null;
  salonLabel: string;
  serial: string | null;
};

export type Match = {
  row: StatementRow;
  order: MatchableOrder | null;
  /** Чем сопоставили: по номеру — надёжно, по сумме и дате — вероятно */
  by: "reference" | "amount_date" | null;
};

export type MatchResult = {
  matched: Match[];
  /** Строки выписки, которым не нашлось заказа: деньги есть, сертификата нет */
  extraInStatement: StatementRow[];
  /** Наши оплаченные заказы, которых нет в выписке */
  missingInStatement: MatchableOrder[];
  /** Совпал номер, но сумма разошлась — самое подозрительное */
  amountMismatch: { row: StatementRow; order: MatchableOrder }[];
  /**
   * Возвраты из выписки и заказы, к которым они относятся.
   *
   * По Kaspi это единственный способ узнать об отмене платежа: в ответе
   * легаси-бэкенда состояния «отменено» нет вовсе, есть только признак
   * «оплачено». Пока выписку не загрузили, погашённый назад платёж выглядит у
   * нас как обычная продажа, а сертификат остаётся действующим.
   */
  refunds: { row: StatementRow; order: MatchableOrder | null }[];
};

/** Насколько далеко по времени готовы искать пару. */
const DAY = 24 * 3_600_000;
const WINDOW_MS = 3 * DAY;
/** Возврат приходит заметно позже платежа — ему окно шире. */
const REFUND_WINDOW_MS = 90 * DAY;

/**
 * Все номера, под которыми заказ мог попасть в выписку.
 *
 * Порог в восемь знаков не случаен: номер ищется вхождением по всей строке
 * выписки, и короткий «999» нашёлся бы внутри любой суммы или номера карты.
 */
function refsOf(order: MatchableOrder): string[] {
  return [order.kaspiRef, order.paymentId, order.id]
    .filter((v): v is string => !!v && v.length >= 8)
    .map((v) => v.replace(/^manual:/, ""));
}

/**
 * Ищет любой из номеров заказа в тексте строки выписки.
 *
 * Сравниваем и как есть, и без пробелов вовсе: в PDF Kaspi двадцатизначный
 * номер заказа разорван переносом строки на 13 и 7 цифр, и по ячейке
 * «1071141051090 3180952» обычное вхождение не срабатывает.
 */
function referenceHit(row: StatementRow, order: MatchableOrder): boolean {
  const haystack = [row.reference ?? "", ...Object.values(row.raw)]
    .join(" ")
    .toLowerCase();
  const tight = haystack.replace(/\s+/g, "");
  return refsOf(order).some((ref) => {
    const needle = ref.toLowerCase();
    return haystack.includes(needle) || tight.includes(needle);
  });
}

export function matchStatement(
  allRows: StatementRow[],
  orders: MatchableOrder[],
): MatchResult {
  // Возврат — не приход. Считать его платежом нельзя дважды: он занял бы
  // чужой заказ по совпадению суммы, а сам заказ остался бы «не оплаченным по
  // выписке». Поэтому возвраты уходят в собственный разбор.
  const rows = allRows.filter((row) => row.kind !== "refund");
  const refundRows = allRows.filter((row) => row.kind === "refund");

  const free = new Set(orders.map((o) => o.id));
  const byId = new Map(orders.map((o) => [o.id, o]));
  const matched: Match[] = [];
  const amountMismatch: { row: StatementRow; order: MatchableOrder }[] = [];
  const extraInStatement: StatementRow[] = [];

  // Первый проход — по номеру. Он надёжен, поэтому имеет приоритет: иначе
  // совпадение «по сумме и дате» могло бы занять чужой заказ.
  const rest: StatementRow[] = [];
  for (const row of rows) {
    const candidate = orders.find(
      (o) => free.has(o.id) && referenceHit(row, o),
    );
    if (!candidate) {
      rest.push(row);
      continue;
    }
    free.delete(candidate.id);
    if (candidate.amountKzt !== row.amountKzt) {
      amountMismatch.push({ row, order: candidate });
    }
    matched.push({ row, order: candidate, by: "reference" });
  }

  // Второй проход — по сумме и дате. Kaspi в выписке нашего номера может и не
  // печатать, а платёж всё равно наш.
  for (const row of rest) {
    const candidate = orders.find(
      (o) =>
        free.has(o.id) &&
        o.amountKzt === row.amountKzt &&
        Math.abs(o.paidAt.getTime() - row.operatedAt.getTime()) <= WINDOW_MS,
    );
    if (!candidate) {
      extraInStatement.push(row);
      continue;
    }
    free.delete(candidate.id);
    matched.push({ row, order: candidate, by: "amount_date" });
  }

  // Возврат ищет свой заказ среди ВСЕХ, а не только свободных: платёж по нему
  // в этой же выписке уже сошёлся, и заказ занят — но возврат относится
  // именно к нему.
  const refunds = refundRows.map((row) => {
    const byReference = orders.find((o) => referenceHit(row, o));
    if (byReference) return { row, order: byReference };
    const byAmount = orders.find(
      (o) =>
        o.amountKzt === row.amountKzt &&
        Math.abs(o.paidAt.getTime() - row.operatedAt.getTime()) <=
          REFUND_WINDOW_MS,
    );
    return { row, order: byAmount ?? null };
  });

  return {
    matched,
    extraInStatement,
    missingInStatement: [...free].map((id) => byId.get(id)!).filter(Boolean),
    amountMismatch,
    refunds,
  };
}

/** Короткая сводка для экрана: сколько сошлось и на какую сумму. */
export function summarize(result: MatchResult): {
  matchedCount: number;
  matchedKzt: number;
  extraCount: number;
  extraKzt: number;
  missingCount: number;
  missingKzt: number;
  mismatchCount: number;
  refundCount: number;
  refundKzt: number;
} {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return {
    refundCount: result.refunds.length,
    refundKzt: sum(result.refunds.map((r) => r.row.amountKzt)),
    matchedCount: result.matched.length,
    matchedKzt: sum(result.matched.map((m) => m.row.amountKzt)),
    extraCount: result.extraInStatement.length,
    extraKzt: sum(result.extraInStatement.map((r) => r.amountKzt)),
    missingCount: result.missingInStatement.length,
    missingKzt: sum(result.missingInStatement.map((o) => o.amountKzt)),
    mismatchCount: result.amountMismatch.length,
  };
}
