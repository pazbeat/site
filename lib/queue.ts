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
const RECOVER_ABANDONED = "recover-abandoned";
const POLL_FRESH = "poll-payments-fresh";
const POLL_RECENT = "poll-payments-recent";
const POLL_TAIL = "poll-payments-tail";
const RECONCILE = "reconcile";
const RECONCILE_DIGEST = "reconcile-digest";
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
  // Раз в минуту (а не в 5) — чтобы задержка после назначенного времени
  // была не более ~минуты.
  await boss.createQueue(DELIVER_SCHEDULED);
  await boss.schedule(DELIVER_SCHEDULED, "* * * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(DELIVER_SCHEDULED, async () => {
    const { deliverDueScheduled } = await import("./scheduled");
    await deliverDueScheduled();
  });

  // Снятые с работы расписания. pg-boss хранит их в своей таблице, и без
  // явной отмены они продолжают ставить задания в очередь, у которой больше
  // нет обработчика: задания копятся вечно и никем не разбираются. Поймано
  // сразу после разделения поллера на ступени (2026-09-04) — `poll-kaspi`
  // остался в расписании и продолжал плодить задачи каждую минуту.
  for (const stale of ["poll-kaspi"]) {
    await boss.unschedule(stale).catch(() => {});
    await boss.deleteQueue(stale).catch(() => {});
  }

  // Фоновый добор оплат тремя ступенями. Одно окно в сутки, как было раньше,
  // не годилось с обеих сторон: свежие заказы оно опрашивало достаточно часто,
  // а оплата, пришедшая на вторые сутки, не подхватывалась ничем, кроме рук.
  // Теперь свежие — каждую минуту, вчерашние — каждые десять, хвост до двух
  // недель — раз в час.
  for (const [queue, tier, cron] of [
    [POLL_FRESH, "fresh", "* * * * *"],
    [POLL_RECENT, "recent", "*/10 * * * *"],
    [POLL_TAIL, "tail", "7 * * * *"],
  ] as const) {
    await boss.createQueue(queue);
    await boss.schedule(queue, cron, undefined, { tz: "Asia/Almaty" });
    await boss.work(queue, async () => {
      const { pollPendingPayments } = await import("./kaspi-poller");
      await pollPendingPayments(tier);
    });
  }

  // Сверка контура «оплата → выпуск → CRM → доставка» — каждые 10 минут.
  // Чинит то, что чинится повтором (недовыпущенный сертификат, непрошедший
  // синк с Altegio, застрявшую доставку), остальное копит для сводки.
  await boss.createQueue(RECONCILE);
  await boss.schedule(RECONCILE, "*/10 * * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(RECONCILE, async () => {
    const { runReconcile } = await import("./reconcile");
    await runReconcile();
  });

  // Сводка расхождений менеджеру — раз в сутки, 09:30 Almaty. Молчит, когда
  // всё сходится: ежедневное «всё хорошо» перестают читать через неделю.
  await boss.createQueue(RECONCILE_DIGEST);
  await boss.schedule(RECONCILE_DIGEST, "30 9 * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(RECONCILE_DIGEST, async () => {
    const { sendReconcileDigest } = await import("./reconcile");
    await sendReconcileDigest();
  });

  // Сверка погашений с Altegio (CRM — источник истины по погашениям) —
  // каждые 5 минут. Основной путь — журнал лояльности сети: он видит
  // погашение любого нашего сертификата, даже проданного без клиента.
  // Следом идёт старая сверка по клиентам: она ловит то, чего в журнале нет
  // (ручную правку остатка в CRM), и стоит один запрос на клиента.
  await boss.createQueue(ALTEGIO_REDEMPTIONS);
  await boss.schedule(ALTEGIO_REDEMPTIONS, "*/5 * * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(ALTEGIO_REDEMPTIONS, async () => {
    const {
      syncRedemptionsFromFeed,
      syncRedemptionsFromAltegio,
      syncWithdrawnCertificates,
    } = await import("./altegio/redemptions");
    await syncRedemptionsFromFeed();
    await syncRedemptionsFromAltegio();
    // Возвраты: сертификат, убранный из CRM, должен погаснуть и у нас —
    // иначе покупатель видит живой сертификат, за который ему вернули деньги.
    await syncWithdrawnCertificates();
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

  // Дожим брошенных заказов — каждые 15 минут (заказы протухают через 30 мин,
  // так что письмо уходит вскоре после отказа от оплаты, но в окне 24 ч).
  await boss.createQueue(RECOVER_ABANDONED);
  await boss.schedule(RECOVER_ABANDONED, "*/15 * * * *", undefined, {
    tz: "Asia/Almaty",
  });
  await boss.work(RECOVER_ABANDONED, async () => {
    const { sendAbandonedRecovery } = await import("./recovery");
    await sendAbandonedRecovery();
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
