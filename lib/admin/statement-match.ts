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
};

/** Насколько далеко по времени готовы искать пару. */
const DAY = 24 * 3_600_000;
const WINDOW_MS = 3 * DAY;

/** Все номера, под которыми заказ мог попасть в выписку. */
function refsOf(order: MatchableOrder): string[] {
  return [order.kaspiRef, order.paymentId, order.id]
    .filter((v): v is string => !!v && v.length >= 4)
    .map((v) => v.replace(/^manual:/, ""));
}

/** Ищет любой из номеров заказа в тексте строки выписки. */
function referenceHit(row: StatementRow, order: MatchableOrder): boolean {
  const haystack = [row.reference ?? "", ...Object.values(row.raw)]
    .join(" ")
    .toLowerCase();
  return refsOf(order).some((ref) => haystack.includes(ref.toLowerCase()));
}

export function matchStatement(
  rows: StatementRow[],
  orders: MatchableOrder[],
): MatchResult {
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

  return {
    matched,
    extraInStatement,
    missingInStatement: [...free].map((id) => byId.get(id)!).filter(Boolean),
    amountMismatch,
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
} {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return {
    matchedCount: result.matched.length,
    matchedKzt: sum(result.matched.map((m) => m.row.amountKzt)),
    extraCount: result.extraInStatement.length,
    extraKzt: sum(result.extraInStatement.map((r) => r.amountKzt)),
    missingCount: result.missingInStatement.length,
    missingKzt: sum(result.missingInStatement.map((o) => o.amountKzt)),
    mismatchCount: result.amountMismatch.length,
  };
}
