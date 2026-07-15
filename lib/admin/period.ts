/**
 * Периоды отчётов админки. Границы считаем по Asia/Almaty (UTC+5, без
 * переходов на летнее время) — иначе продажи первого/последнего дня месяца
 * уезжали бы в соседний по таймзоне сервера.
 *
 * Верхняя граница `to` — ИСКЛЮЧАЮЩАЯ (для фильтра `createdAt: { gte, lt }`).
 */
const ALMATY_OFFSET = "+05:00";
const ALMATY_MS = 5 * 60 * 60 * 1000;

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type Period = {
  kind: "month" | "custom" | "all";
  /** Значение для ссылок: ключ месяца, "all" или "custom" */
  key: string;
  label: string;
  from: Date | null;
  /** Исключающая верхняя граница */
  to: Date | null;
  /** Значения для <input type="date"> */
  fromInput: string;
  toInput: string;
};

/** Ключ месяца (YYYY-MM), в котором момент находится по алматинскому времени. */
export function almatyMonthKey(now: Date): string {
  return new Date(now.getTime() + ALMATY_MS).toISOString().slice(0, 7);
}

/** Ключ дня (YYYY-MM-DD) по алматинскому времени. */
export function almatyDayKey(now: Date): string {
  return new Date(now.getTime() + ALMATY_MS).toISOString().slice(0, 10);
}

/** Дни периода [from, to) как ключи YYYY-MM-DD по Алматы. */
export function eachDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (
    let t = from.getTime();
    t < to.getTime() && out.length < 400;
    t += 24 * 60 * 60 * 1000
  ) {
    out.push(almatyDayKey(new Date(t)));
  }
  return out;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Последние `count` месяцев начиная с текущего, новые первыми. */
export function recentMonths(count: number, now: Date): string[] {
  const [year, month] = almatyMonthKey(now).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = year * 12 + (month - 1) - i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

/** Начало суток по Алматы. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00${ALMATY_OFFSET}`);
}

function nextDay(date: string): Date {
  const d = dayStart(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Границы месяца: [1-е 00:00, 1-е следующего 00:00) по Алматы. */
export function monthRange(key: string): { from: Date; to: Date } {
  const [year, month] = key.split("-").map(Number);
  const from = dayStart(`${key}-01`);
  const nextKey =
    month === 12
      ? `${year + 1}-01`
      : `${year}-${String(month + 1).padStart(2, "0")}`;
  return { from, to: dayStart(`${nextKey}-01`) };
}

function ruDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Разбирает query-параметры в период. Свои даты имеют приоритет над месяцем:
 * формы месяца и произвольного диапазона отправляют только своё поле, поэтому
 * выбор одного всегда сбрасывает другой.
 */
export function resolvePeriod(
  params: { month?: string; from?: string; to?: string },
  now: Date = new Date(),
): Period {
  const from = params.from && DAY_KEY.test(params.from) ? params.from : "";
  const to = params.to && DAY_KEY.test(params.to) ? params.to : "";

  if (from || to) {
    const parts = [from && `с ${ruDate(from)}`, to && `по ${ruDate(to)}`];
    return {
      kind: "custom",
      key: "custom",
      label: parts.filter(Boolean).join(" "),
      from: from ? dayStart(from) : null,
      to: to ? nextDay(to) : null,
      fromInput: from,
      toInput: to,
    };
  }

  if (params.month === "all") {
    return {
      kind: "all",
      key: "all",
      label: "Всё время",
      from: null,
      to: null,
      fromInput: "",
      toInput: "",
    };
  }

  const key =
    params.month && MONTH_KEY.test(params.month)
      ? params.month
      : almatyMonthKey(now);
  const range = monthRange(key);
  return {
    kind: "month",
    key,
    label: monthLabel(key),
    from: range.from,
    to: range.to,
    fromInput: "",
    toInput: "",
  };
}

/** Фильтр Prisma по дате создания; для «всего времени» — undefined. */
export function periodFilter(period: Period) {
  if (!period.from && !period.to) return undefined;
  return {
    ...(period.from ? { gte: period.from } : {}),
    ...(period.to ? { lt: period.to } : {}),
  };
}

/** Соседний месяц (шаг ±1) — для стрелок «предыдущий/следующий». */
export function shiftMonth(key: string, step: number): string {
  const [year, month] = key.split("-").map(Number);
  const total = year * 12 + (month - 1) + step;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
