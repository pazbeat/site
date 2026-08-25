import { CHANNEL_LABELS, type Channel } from "./source";

/**
 * Отчёт «Источники»: заходы → конструктор → покупки → выручка по каналам.
 *
 * Модуль чистый, без БД: страницы админки тестами не покрыты, поэтому вся
 * арифметика живёт здесь и проверяется отдельно.
 */

/**
 * Ниже этого числа заходов не показываем ни конверсию, ни выручку на сотню.
 *
 * Иначе канал с двумя заходами и одним чеком на 45 000 ₸ покажет «конверсия
 * 50 %, 2 250 000 ₸ на сотню заходов» и встанет первой строкой — владелец
 * решит вложить в него бюджет, а там просто зашли двое знакомых.
 */
export const MIN_VISITS_FOR_RATE = 30;

/** Порог, при котором вообще имеет смысл называть лидера. */
const MIN_VISITS_FOR_HEADLINE = 100;

export type ChannelInput = {
  channel: string;
  visits: number;
  builders: number;
  orders: number;
  revenueKzt: number;
};

export type ChannelRow = {
  channel: string;
  label: string;
  visits: number;
  builders: number;
  orders: number;
  revenueKzt: number;
  /** null — заходов слишком мало, цифра была бы шумом */
  conversionPct: number | null;
  /** Конверсия выше 100 % — не поломка, см. комментарий ниже */
  conversionOverflow: boolean;
  avgCheckKzt: number;
  /** Выручка на 100 заходов — главная колонка: учитывает и конверсию, и чек */
  revenuePer100Kzt: number | null;
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel as Channel] ?? channel;
}

export function buildChannelReport(rows: ChannelInput[]): ChannelRow[] {
  const out = rows.map((r) => {
    const enough = r.visits >= MIN_VISITS_FOR_RATE;
    // Заходы считаются раз в сутки на человека, а заказы — все подряд.
    // Постоянный покупатель даёт один заход и два заказа, поэтому больше
    // ста процентов здесь возможно и это не ошибка счётчика.
    const raw = r.visits > 0 ? (r.orders / r.visits) * 100 : 0;
    return {
      channel: r.channel,
      label: channelLabel(r.channel),
      visits: r.visits,
      builders: r.builders,
      orders: r.orders,
      revenueKzt: r.revenueKzt,
      conversionPct: enough ? Math.min(raw, 100) : null,
      conversionOverflow: enough && raw > 100,
      avgCheckKzt: r.orders > 0 ? Math.round(r.revenueKzt / r.orders) : 0,
      revenuePer100Kzt: enough ? Math.round((r.revenueKzt / r.visits) * 100) : null,
    };
  });

  // Сортировка по выручке на сотню заходов; строки без достоверной цифры —
  // в конец, чтобы шум не занимал первые места.
  return out.sort((a, b) => {
    if (a.revenuePer100Kzt === null && b.revenuePer100Kzt === null) {
      return b.revenueKzt - a.revenueKzt;
    }
    if (a.revenuePer100Kzt === null) return 1;
    if (b.revenuePer100Kzt === null) return -1;
    return b.revenuePer100Kzt - a.revenuePer100Kzt;
  });
}

export type Totals = {
  visits: number;
  builders: number;
  orders: number;
  revenueKzt: number;
  conversionPct: number;
};

export function totals(rows: ChannelRow[]): Totals {
  const visits = rows.reduce((s, r) => s + r.visits, 0);
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  return {
    visits,
    builders: rows.reduce((s, r) => s + r.builders, 0),
    orders,
    revenueKzt: rows.reduce((s, r) => s + r.revenueKzt, 0),
    conversionPct: visits > 0 ? Math.min((orders / visits) * 100, 100) : 0,
  };
}

/**
 * Вывод одной фразой. `null` — данных слишком мало, и лучше честно молчать,
 * чем назвать победителем канал с тремя заходами.
 */
export function summarize(rows: ChannelRow[]): string | null {
  const ranked = rows.filter(
    (r) => r.revenuePer100Kzt !== null && r.visits >= MIN_VISITS_FOR_HEADLINE,
  );
  if (ranked.length === 0) return null;

  const best = ranked[0];
  if (best.orders === 0) return null;

  const rest = ranked.slice(1);
  if (rest.length === 0) {
    return `${best.label} — пока единственный канал с достаточной статистикой: ${best.orders} покупок.`;
  }

  const second = rest[0];
  if (second.revenuePer100Kzt === null || second.revenuePer100Kzt === 0) {
    return `${best.label} приносит покупки, остальные каналы пока нет.`;
  }
  const times = best.revenuePer100Kzt! / second.revenuePer100Kzt;
  if (times < 1.2) {
    return `${best.label} и ${second.label} дают примерно одинаковую отдачу.`;
  }
  return `${best.label} приносит в ${times.toFixed(1)} раза больше денег на сотню заходов, чем ${second.label}.`;
}
