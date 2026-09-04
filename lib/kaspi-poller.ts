import { prisma } from "./db";
import { fulfillOrder } from "./certificates";
import { KaspiPayProvider } from "./payments/kaspi";
import { ForteBankProvider } from "./payments/forte";
import { reportFailure } from "./alerts";

/**
 * Фоновый добор безвебхучных оплат (Kaspi и ForteBank).
 *
 * Страница оплаты опрашивает статус, только пока открыта. Покупатель,
 * закрывший вкладку сразу после оплаты, без этого поллера остаётся без
 * сертификата навсегда: заказ протухает через 30 минут, а деньги списаны.
 * Это **единственный** механизм, который такие оплаты добирает, — поэтому он
 * не должен выключаться ничем, кроме отсутствия источника статуса.
 *
 * Раньше здесь стояла проверка `PAYMENT_MOCK === "1"`, и флаг, забытый на
 * боевом сервере, тихо выключал добор целиком (снято 2026-09-04). Демо-режим
 * теперь определяется в одном месте — `lib/payments/mode.ts` — и в production
 * не действует; поллеру же достаточно спросить провайдера, есть ли ему куда
 * ходить за статусом.
 *
 * Опрашиваются и протухшие (expired) заказы: оплата могла пройти, пока API
 * провайдера или наш сервер были недоступны, либо покупатель оплатил счёт
 * позже 30 минут. `fulfillOrder` такие заказы воскрешает — деньги первичны.
 */

/** Ступени опроса: чем старше заказ, тем реже его спрашивают. */
export type PollTier = "fresh" | "recent" | "tail";

/**
 * Границы ступеней. Смысл ступеней — в цене: свежих заказов единицы, их можно
 * спрашивать каждую минуту; хвост за две недели — это уже сотни запросов к
 * чужому API, и раз в час по нему более чем достаточно. Раньше окно было
 * одно — сутки, и оплата, пришедшая позже, не подхватывалась ничем, кроме рук.
 */
const TIERS: Record<PollTier, { fromMs: number; toMs: number }> = {
  fresh: { fromMs: 0, toMs: 2 * 60 * 60_000 },
  recent: { fromMs: 2 * 60 * 60_000, toMs: 24 * 60 * 60_000 },
  tail: { fromMs: 24 * 60 * 60_000, toMs: 14 * 24 * 60 * 60_000 },
};

/** Сколько заказов берём за проход. Сортировка — от новых к старым. */
const BATCH = 200;

export function tierWindow(
  tier: PollTier,
  now: Date = new Date(),
): { gte: Date; lte: Date } {
  const { fromMs, toMs } = TIERS[tier];
  return {
    gte: new Date(now.getTime() - toMs),
    lte: new Date(now.getTime() - fromMs),
  };
}

type Provider = {
  id: "kaspi" | "forte";
  available: () => boolean;
  /** Чем спрашиваем статус: у Kaspi — короткий номер заказа их формата */
  ref: (order: { paymentId: string | null; kaspiRef: string | null }) => string;
  check: (ref: string, amountKzt: number) => Promise<string>;
};

function providers(): Provider[] {
  const kaspi = new KaspiPayProvider();
  const forte = new ForteBankProvider();
  return [
    {
      id: "kaspi",
      // Ссылка на оплату настроена почти всегда, а вот источника статуса
      // может не быть — тогда опрашивать нечего.
      available: () => kaspi.hasAutomaticConfirmation(),
      ref: (order) => order.kaspiRef ?? order.paymentId ?? "",
      check: (ref, amount) => kaspi.checkStatus(ref, amount),
    },
    {
      id: "forte",
      available: () => forte.isConfigured(),
      ref: (order) => order.paymentId ?? "",
      check: (ref, amount) => forte.checkStatus(ref, amount),
    },
  ];
}

async function pollProvider(
  provider: Provider,
  tier: PollTier,
  now: Date,
): Promise<{ checked: number; fulfilled: number }> {
  if (!provider.available()) return { checked: 0, fulfilled: 0 };
  const window = tierWindow(tier, now);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["pending", "expired"] },
      paymentProvider: provider.id,
      paymentId: { not: null },
      createdAt: { gte: window.gte, lte: window.lte },
    },
    select: { id: true, paymentId: true, kaspiRef: true, amountKzt: true },
    // Порядок обязателен: без него при выборке больше BATCH часть заказов
    // могла не опрашиваться вовсе — база вправе отдавать строки как угодно.
    orderBy: { createdAt: "desc" },
    take: BATCH,
  });

  let fulfilled = 0;
  for (const order of orders) {
    if (!order.paymentId) continue;
    try {
      const paid =
        (await provider.check(provider.ref(order), order.amountKzt)) === "paid";
      if (!paid) continue;
      const result = await fulfillOrder(order.id, order.paymentId);
      if (result.status === "fulfilled" || result.status === "repaired") {
        fulfilled++;
        console.log(
          `poll-${provider.id}: заказ ${order.id} оплачен и исполнен (${tier})`,
        );
      }
    } catch (error) {
      // Один сбойный заказ не должен ронять весь проход. Но и молчать нельзя:
      // раньше это был console.error в логе контейнера, который никто не
      // читает, — а за ним могла стоять неработающая оплата у всех подряд.
      void reportFailure(`опрос оплаты ${provider.id}`, error, {
        заказ: order.id,
        ступень: tier,
      });
    }
  }

  return { checked: orders.length, fulfilled };
}

/**
 * Один проход по обоим провайдерам на заданной ступени.
 * `fresh` — каждую минуту, `recent` — каждые 10 минут, `tail` — раз в час
 * (расписание см. lib/queue.ts).
 */
export async function pollPendingPayments(
  tier: PollTier = "fresh",
  now: Date = new Date(),
): Promise<{ checked: number; fulfilled: number }> {
  let checked = 0;
  let fulfilled = 0;
  for (const provider of providers()) {
    const result = await pollProvider(provider, tier, now);
    checked += result.checked;
    fulfilled += result.fulfilled;
  }
  return { checked, fulfilled };
}
