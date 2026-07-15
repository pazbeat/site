import { PgBoss } from "pg-boss";
import { prisma } from "./db";

/**
 * Очереди pg-boss поверх Postgres (PRD §2): протухание неоплаченных заказов
 * через 30 минут (PRD §5.3) и доставка сертификатов (сразу или к дате,
 * таймзона Asia/Almaty) с ретраями.
 */

const EXPIRE_ORDERS = "expire-orders";
const EXPIRE_CERTS = "expire-certificates";
const ALTEGIO_REDEMPTIONS = "altegio-redemptions";
const DELIVER_CERT = "deliver-certificate";
const DELIVER_SCHEDULED = "deliver-scheduled";
const EXPIRY_REMINDERS = "expiry-reminders";
const POLL_KASPI = "poll-kaspi";
const ORDER_TTL_MS = 30 * 60_000;

type DeliverJob = { certificateId: string };

const globalForBoss = globalThis as unknown as {
  imbirBoss?: Promise<PgBoss>;
};

export async function expirePendingOrders(): Promise<number> {
  const result = await prisma.order.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: new Date(Date.now() - ORDER_TTL_MS) },
    },
    data: { status: "expired" },
  });
  if (result.count > 0) {
    console.log(`expire-orders: expired ${result.count} order(s)`);
  }
  return result.count;
}

async function createBoss(): Promise<PgBoss> {
  const boss = new PgBoss(process.env.DATABASE_URL!);
  boss.on("error", (error) => console.error("pg-boss error", error));
  await boss.start();

  await boss.createQueue(EXPIRE_ORDERS);
  await boss.schedule(EXPIRE_ORDERS, "*/5 * * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(EXPIRE_ORDERS, async () => {
    await expirePendingOrders();
  });

  // Сгорание сертификатов по сроку — раз в сутки, 00:10 Almaty.
  await boss.createQueue(EXPIRE_CERTS);
  await boss.schedule(EXPIRE_CERTS, "10 0 * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(EXPIRE_CERTS, async () => {
    const { expireCertificates } = await import("./expiry");
    await expireCertificates();
  });

  await boss.createQueue(DELIVER_CERT, {
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
  });
  await boss.work<DeliverJob>(DELIVER_CERT, async (jobs) => {
    const { deliverCertificate } = await import("./delivery");
    for (const job of jobs) {
      await deliverCertificate(job.data.certificateId);
    }
  });

  // Развозка отложенных доставок: наступившие scheduledAt → в очередь.
  await boss.createQueue(DELIVER_SCHEDULED);
  await boss.schedule(DELIVER_SCHEDULED, "*/5 * * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(DELIVER_SCHEDULED, async () => {
    const { deliverDueScheduled } = await import("./scheduled");
    await deliverDueScheduled();
  });

  // Фоновый добор Kaspi-оплат (страница могла закрыться) — каждую минуту.
  await boss.createQueue(POLL_KASPI);
  await boss.schedule(POLL_KASPI, "* * * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(POLL_KASPI, async () => {
    const { pollPendingPayments } = await import("./kaspi-poller");
    await pollPendingPayments();
  });

  // Сверка погашений с Altegio (CRM — источник истины по погашениям) — раз в
  // 15 минут: запросов немного, они сгруппированы по клиентам (лимит 200/мин).
  await boss.createQueue(ALTEGIO_REDEMPTIONS);
  await boss.schedule(ALTEGIO_REDEMPTIONS, "*/15 * * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(ALTEGIO_REDEMPTIONS, async () => {
    const { syncRedemptionsFromAltegio } = await import("./altegio/redemptions");
    await syncRedemptionsFromAltegio();
  });

  // Напоминания об истечении (за 30 и 7 дней) — раз в сутки, 09:00 Almaty.
  await boss.createQueue(EXPIRY_REMINDERS);
  await boss.schedule(EXPIRY_REMINDERS, "0 9 * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(EXPIRY_REMINDERS, async () => {
    const { sendExpiryReminders } = await import("./reminders");
    await sendExpiryReminders();
  });

  return boss;
}

export function getBoss(): Promise<PgBoss> | null {
  if (!process.env.DATABASE_URL) return null;
  if (!globalForBoss.imbirBoss) {
    globalForBoss.imbirBoss = createBoss().catch((error) => {
      globalForBoss.imbirBoss = undefined;
      throw error;
    });
  }
  return globalForBoss.imbirBoss;
}

export async function startQueue(): Promise<void> {
  await getBoss();
}

/**
 * Ставит доставку сертификата в очередь. Немедленная — уходит в очередь
 * сразу. Отложенная (scheduledAt в будущем) НЕ пред-планируется здесь:
 * её развозит sweeper deliver-scheduled по наступлении даты (см.
 * lib/scheduled.ts) — это позволяет переносить дату из админки и
 * переживать рестарты. Ошибка очереди не должна ломать вебхук оплаты.
 */
export async function enqueueDelivery(
  certificateId: string,
  scheduledAt?: Date | null,
): Promise<void> {
  if (scheduledAt && scheduledAt > new Date()) return; // sweeper развезёт
  const bossPromise = getBoss();
  if (!bossPromise) throw new Error("queue_unavailable");
  const boss = await bossPromise;
  await boss.send(DELIVER_CERT, { certificateId } satisfies DeliverJob, {});
}
