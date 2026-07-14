import { prisma } from "./db";
import { fulfillOrder } from "./certificates";
import { KaspiPayProvider } from "./payments/kaspi";
import { ForteBankProvider } from "./payments/forte";

/**
 * Фоновый поллер безвебхучных оплат (Kaspi PayQR и ForteBank). Страница оплаты
 * опрашивает статус, только пока открыта; если покупатель закрыл вкладку сразу
 * после оплаты, заказ повиснет неоплаченным. Этот cron (см. lib/queue.ts)
 * добирает такие заказы: опрашивает провайдера по всем ожидающим заказам в
 * пределах TTL и исполняет оплаченные (fulfillOrder идемпотентен).
 *
 * Работает только с боевыми провайдерами (при PAYMENT_MOCK=1 — пропуск).
 */

// Окно опроса: заказы не старше 35 мин (TTL протухания — 30 мин + запас).
const POLL_WINDOW_MS = 35 * 60_000;

export async function pollPendingKaspiOrders(): Promise<{
  checked: number;
  fulfilled: number;
}> {
  if (process.env.PAYMENT_MOCK === "1") return { checked: 0, fulfilled: 0 };
  const kaspi = new KaspiPayProvider();
  if (!kaspi.isConfigured()) return { checked: 0, fulfilled: 0 };

  const orders = await prisma.order.findMany({
    where: {
      status: "pending",
      paymentProvider: "kaspi",
      paymentId: { not: null },
      createdAt: { gte: new Date(Date.now() - POLL_WINDOW_MS) },
    },
    select: { id: true, paymentId: true },
    take: 100,
  });

  let fulfilled = 0;
  for (const order of orders) {
    if (!order.paymentId) continue;
    try {
      const paid = (await kaspi.checkStatus(order.paymentId)) === "paid";
      if (!paid) continue;
      const result = await fulfillOrder(order.id, order.paymentId);
      if (result.status !== "not_found" && result.status !== "not_payable") {
        fulfilled++;
        console.log(`poll-kaspi: заказ ${order.id} оплачен и исполнен`);
      }
    } catch (error) {
      // Один сбойный заказ не должен ронять весь проход.
      console.error(
        `poll-kaspi: ошибка по заказу ${order.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return { checked: orders.length, fulfilled };
}

export async function pollPendingForteOrders(): Promise<{
  checked: number;
  fulfilled: number;
}> {
  if (process.env.PAYMENT_MOCK === "1") return { checked: 0, fulfilled: 0 };
  const forte = new ForteBankProvider();
  if (!forte.isConfigured()) return { checked: 0, fulfilled: 0 };

  const orders = await prisma.order.findMany({
    where: {
      status: "pending",
      paymentProvider: "forte",
      paymentId: { not: null },
      createdAt: { gte: new Date(Date.now() - POLL_WINDOW_MS) },
    },
    select: { id: true, paymentId: true },
    take: 100,
  });

  let fulfilled = 0;
  for (const order of orders) {
    if (!order.paymentId) continue;
    try {
      const paid = (await forte.checkStatus(order.paymentId)) === "paid";
      if (!paid) continue;
      const result = await fulfillOrder(order.id, order.paymentId);
      if (result.status !== "not_found" && result.status !== "not_payable") {
        fulfilled++;
        console.log(`poll-forte: заказ ${order.id} оплачен и исполнен`);
      }
    } catch (error) {
      console.error(
        `poll-forte: ошибка по заказу ${order.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return { checked: orders.length, fulfilled };
}

/** Один проход по всем безвебхучным провайдерам (Kaspi + Forte). */
export async function pollPendingPayments(): Promise<void> {
  await pollPendingKaspiOrders();
  await pollPendingForteOrders();
}
