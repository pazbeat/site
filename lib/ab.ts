/**
 * A/B-тест цен номиналов (PRD §10, Фаза 3).
 *
 * Как устроено: у номинала есть `variant` — "A", "B" или null. Посетителю
 * proxy выдаёт липкую куку с группой, и он видит номиналы своей группы плюс
 * все общие (variant=null). Заказ запоминает группу (Order.abVariant), показы
 * конструктора считаются в AbStat — из этих двух чисел и складывается
 * конверсия в отчёте.
 *
 * Отдельного выключателя нет намеренно: тест идёт ровно тогда, когда хотя бы
 * у одного номинала проставлен вариант. Убрали варианты — все снова видят всё.
 */

export const AB_COOKIE = "imbir_ab";
export const AB_VARIANTS = ["A", "B"] as const;
export type AbVariant = (typeof AB_VARIANTS)[number];

export function isAbVariant(value: unknown): value is AbVariant {
  return value === "A" || value === "B";
}

/** Случайная группа 50/50. */
export function pickVariant(random: number = Math.random()): AbVariant {
  return random < 0.5 ? "A" : "B";
}

/**
 * Номиналы, которые видит посетитель группы `variant`: свои + общие.
 * Пока вариантов ни у кого нет — тест не идёт, показываем всё.
 */
export function filterByVariant<T extends { variant?: string | null }>(
  nominals: T[],
  variant: AbVariant | null,
): T[] {
  const experimentOn = nominals.some((n) => isAbVariant(n.variant));
  if (!experimentOn) return nominals;
  return nominals.filter((n) => !isAbVariant(n.variant) || n.variant === variant);
}

export type VariantStats = {
  variant: string;
  views: number;
  orders: number;
  revenueKzt: number;
};

export type VariantReport = VariantStats & {
  /** Доля показов, дошедших до оплаченного заказа, % */
  conversion: number;
  avgCheckKzt: number;
  /** Выручка на показ — главная метрика: учитывает и конверсию, и чек */
  revenuePerViewKzt: number;
};

export function buildReport(stats: VariantStats[]): VariantReport[] {
  return stats.map((s) => ({
    ...s,
    conversion: s.views > 0 ? (s.orders / s.views) * 100 : 0,
    avgCheckKzt: s.orders > 0 ? Math.round(s.revenueKzt / s.orders) : 0,
    revenuePerViewKzt: s.views > 0 ? Math.round(s.revenueKzt / s.views) : 0,
  }));
}

/**
 * Победитель по выручке на показ. Возвращает null, пока данных мало или
 * разрыв в пределах 5% — чтобы не объявлять победу на шуме.
 */
export function pickWinner(
  report: VariantReport[],
  minViewsPerVariant = 100,
): { variant: string; upliftPct: number } | null {
  if (report.length < 2) return null;
  if (report.some((r) => r.views < minViewsPerVariant)) return null;

  const sorted = [...report].sort((a, b) => b.revenuePerViewKzt - a.revenuePerViewKzt);
  const [best, second] = sorted;
  if (second.revenuePerViewKzt === 0) return null;

  const upliftPct =
    ((best.revenuePerViewKzt - second.revenuePerViewKzt) / second.revenuePerViewKzt) *
    100;
  if (upliftPct < 5) return null;
  return { variant: best.variant, upliftPct };
}
