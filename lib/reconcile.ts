import "server-only";
import { prisma } from "./db";
import { reportFailure } from "./alerts";
import { recordPaymentEvent } from "./payment-events";

/**
 * Сверка контура «оплата → выпуск → CRM → доставка».
 *
 * Зачем она есть. Каждый шаг после подтверждения оплаты может упасть, и почти
 * везде мы это намеренно гасим, чтобы не рушить покупку: не записался
 * сертификат в Altegio — покупателю всё равно отдаём; не ушло письмо — оплата
 * всё равно принята. Правильно. Но до этой сверки никто не возвращался к
 * упавшему шагу, и «сертификат есть, а в кассе его нет» жило до жалобы
 * клиента.
 *
 * Здесь собраны четыре инварианта, каждый из которых должен выполняться
 * всегда. Нарушение либо чинится автоматически повтором, либо попадает в
 * сводку менеджеру. Молча не остаётся ничего.
 *
 *  1. Оплаченный заказ имеет сертификат.
 *  2. Сертификат принадлежит оплаченному заказу.
 *  3. Выпущенный сертификат записан в Altegio.
 *  4. Выпущенный сертификат доставлен получателю.
 *
 * Отсрочки (GRACE) — не перестраховка: выпуск, синк и доставка занимают
 * секунды, и без отсрочки сверка ловила бы нормальный ход дел.
 */

const GRACE = {
  /** Выпуск после оплаты занимает секунды; две минуты — с большим запасом. */
  certificate: 2 * 60_000,
  /** Синк с CRM идёт сразу после выпуска, вместе с подбором номера. */
  altegio: 10 * 60_000,
  /** Доставка ставится в очередь сразу; 15 минут — уже застряла. */
  delivery: 15 * 60_000,
};

/** Потолок автоповторов: дальше нужен человек, а не ещё один заход. */
const MAX_ATTEMPTS = { altegio: 5, delivery: 3 };

/** Сколько строк показываем в сводке по каждому пункту. */
const DIGEST_LIMIT = 20;

/**
 * Как долго переспрашиваем банк про уже оплаченные заказы.
 *
 * Месяц — компромисс: окно чарджбэка у карт куда длиннее (120 дней и
 * больше), но каждый заказ это один запрос к банку, и опрашивать полгода
 * истории ежедневно ради редкого события расточительно. Всё, что старше,
 * ловится сверкой выписки — для этого и сделана выгрузка платежей.
 */
const REVERSAL_WINDOW_MS = 30 * 24 * 60 * 60_000;

export type DiscrepancyKind =
  | "paid_without_certificate"
  | "certificate_without_payment"
  | "altegio_stuck"
  | "delivery_stuck";

export type Discrepancy = {
  kind: DiscrepancyKind;
  /** id заказа или сертификата — по нему открывается карточка в админке */
  id: string;
  label: string;
  since: Date;
  detail?: string | null;
};

/**
 * Инвариант 1: заказ оплачен — сертификат существует.
 * Это тот самый случай «деньги списаны, покупатель ничего не получил».
 */
export async function findPaidWithoutCertificate(
  now: Date = new Date(),
): Promise<Discrepancy[]> {
  const orders = await prisma.order.findMany({
    where: {
      status: "paid",
      certificates: { none: {} },
      paidAt: { lt: new Date(now.getTime() - GRACE.certificate) },
    },
    select: { id: true, paidAt: true, amountKzt: true, buyerEmail: true },
    orderBy: { paidAt: "desc" },
    take: 100,
  });
  return orders.map((order) => ({
    kind: "paid_without_certificate" as const,
    id: order.id,
    label: `Заказ ${order.id} · ${order.amountKzt} ₸ · ${order.buyerEmail}`,
    since: order.paidAt ?? now,
  }));
}

/**
 * Инвариант 2: у сертификата оплаченный заказ.
 *
 * `refunded` сюда не попадает намеренно: возврат — законный способ оказаться с
 * сертификатом при неоплаченном заказе, и он уже отражён статусом самого
 * сертификата.
 */
export async function findCertificateWithoutPayment(): Promise<Discrepancy[]> {
  const certs = await prisma.certificate.findMany({
    where: { order: { status: { in: ["pending", "expired", "cancelled"] } } },
    select: {
      id: true,
      serial: true,
      createdAt: true,
      order: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return certs.map((cert) => ({
    kind: "certificate_without_payment" as const,
    id: cert.id,
    label: `Сертификат ${cert.serial ?? cert.id} · заказ ${cert.order.id}`,
    since: cert.createdAt,
    detail: `статус заказа: ${cert.order.status}`,
  }));
}

/**
 * Инвариант 3: выпущенный сертификат записан в Altegio.
 *
 * `pending` здесь наравне с `failed`: это значение по умолчанию, и сертификат,
 * до которого синк вообще не дошёл (упал процесс между выпуском и записью),
 * выглядит точно так же, как только что созданный. Отсрочка в десять минут их
 * и разделяет.
 */
export async function findAltegioStuck(
  now: Date = new Date(),
): Promise<Discrepancy[]> {
  // Запись в CRM выключена (стенд, локальная разработка) — тогда `pending` у
  // всех сертификатов означает не сбой, а «мы туда и не ходили». Показывать
  // это как расхождение — верный способ приучить не читать экран сверки.
  const { isAltegioSyncEnabled } = await import("./altegio/sync");
  if (!isAltegioSyncEnabled()) return [];

  const certs = await prisma.certificate.findMany({
    where: {
      altegioSyncStatus: { in: ["pending", "failed"] },
      createdAt: { lt: new Date(now.getTime() - GRACE.altegio) },
      order: { status: "paid" },
    },
    select: {
      id: true,
      serial: true,
      createdAt: true,
      altegioSyncStatus: true,
      altegioSyncAttempts: true,
      altegioLastError: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return certs.map((cert) => ({
    kind: "altegio_stuck" as const,
    id: cert.id,
    label:
      `Сертификат ${cert.serial ?? cert.id} · ${cert.altegioSyncStatus} · ` +
      `попыток ${cert.altegioSyncAttempts}`,
    since: cert.createdAt,
    detail: cert.altegioLastError,
  }));
}

/**
 * Инвариант 4: сертификат доставлен.
 * Отложенные (scheduledAt в будущем) не в счёт — их развозит свой sweeper.
 */
export async function findDeliveryStuck(
  now: Date = new Date(),
): Promise<Discrepancy[]> {
  const threshold = new Date(now.getTime() - GRACE.delivery);
  const certs = await prisma.certificate.findMany({
    where: {
      sentAt: null,
      createdAt: { lt: threshold },
      OR: [{ scheduledAt: null }, { scheduledAt: { lt: threshold } }],
      order: { status: "paid" },
    },
    select: {
      id: true,
      serial: true,
      createdAt: true,
      deliveryContact: true,
      deliveryAttempts: true,
      deliveryLastError: true,
      recipientSentAt: true,
      buyerSentAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return certs.map((cert) => {
    // Какое из двух писем не ушло — половина ответа на вопрос «что делать».
    // «Не доставлено» без уточнения заставляло бы каждый раз открывать
    // карточку, чтобы понять, знает ли получатель о подарке.
    const missing = !cert.recipientSentAt
      ? "получателю"
      : !cert.buyerSentAt
        ? "покупателю (чек)"
        : "не отмечено доставленным";
    return {
      kind: "delivery_stuck" as const,
      id: cert.id,
      label:
        `Сертификат ${cert.serial ?? cert.id} → ${cert.deliveryContact} · ` +
        `не ушло ${missing} · попыток ${cert.deliveryAttempts}`,
      since: cert.createdAt,
      detail: cert.deliveryLastError,
    };
  });
}

export async function findDiscrepancies(
  now: Date = new Date(),
): Promise<Discrepancy[]> {
  const [paid, orphan, altegio, delivery] = await Promise.all([
    findPaidWithoutCertificate(now),
    findCertificateWithoutPayment(),
    findAltegioStuck(now),
    findDeliveryStuck(now),
  ]);
  return [...paid, ...orphan, ...altegio, ...delivery];
}

/**
 * Чинит инвариант 1: доводит выпуск по оплаченным заказам без сертификата.
 * fulfillOrder в этом случае работает в режиме починки и идемпотентен.
 */
export async function repairPaidWithoutCertificate(
  now: Date = new Date(),
): Promise<number> {
  const broken = await findPaidWithoutCertificate(now);
  if (broken.length === 0) return 0;

  const { fulfillOrder } = await import("./certificates");
  let repaired = 0;
  for (const item of broken) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: item.id },
        select: { paymentId: true },
      });
      const result = await fulfillOrder(
        item.id,
        order?.paymentId ?? `reconcile:${item.id}`,
        "reconcile",
      );
      if (result.status === "repaired" || result.status === "fulfilled") {
        repaired++;
        void reportFailure(
          "сверка: заказ был оплачен без сертификата — выпущен",
          new Error(`order ${item.id}`),
          { заказ: item.id, сертификат: result.certificateId },
        );
      }
    } catch (error) {
      void reportFailure("сверка: не удалось довыпустить сертификат", error, {
        заказ: item.id,
      });
    }
  }
  return repaired;
}

/**
 * Чинит инвариант 3: повторяет запись в Altegio.
 *
 * Это и есть ответ на «сертификат выпустился, а в CRM не появился»: раньше
 * первая же неудача была последней, теперь попытка повторяется каждые десять
 * минут до пяти раз, а дальше зовут человека.
 */
export async function retryAltegioSync(
  now: Date = new Date(),
): Promise<number> {
  const { isAltegioSyncEnabled } = await import("./altegio/sync");
  if (!isAltegioSyncEnabled()) return 0;

  const stuck = await prisma.certificate.findMany({
    where: {
      altegioSyncStatus: { in: ["pending", "failed"] },
      altegioSyncAttempts: { lt: MAX_ATTEMPTS.altegio },
      createdAt: { lt: new Date(now.getTime() - GRACE.altegio) },
      order: { status: "paid" },
    },
    select: { id: true, serial: true, altegioSyncAttempts: true },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  let ok = 0;
  for (const cert of stuck) {
    try {
      const { syncCertificateToAltegio } = await import("./altegio/sync");
      await syncCertificateToAltegio(cert.id);
      const after = await prisma.certificate.findUnique({
        where: { id: cert.id },
        select: { altegioSyncStatus: true },
      });
      if (after?.altegioSyncStatus === "synced") ok++;
    } catch (error) {
      // Счётчик попыток растит сам syncCertificateToAltegio; здесь только
      // сообщаем, и только когда попытки кончились, — иначе почта менеджера
      // превратится в поток однотипных писем каждые десять минут.
      if (cert.altegioSyncAttempts + 1 >= MAX_ATTEMPTS.altegio) {
        void reportFailure("Altegio: сертификат так и не записан в CRM", error, {
          сертификат: cert.id,
          серийник: cert.serial,
        });
      }
    }
  }
  return ok;
}

/**
 * Чинит инвариант 4: повторяет доставку застрявших сертификатов.
 * Очередь pg-boss делает свои пять попыток; сюда попадает то, что и после них
 * осталось неотправленным (или чья задача потерялась при рестарте).
 */
export async function retryStuckDeliveries(
  now: Date = new Date(),
): Promise<number> {
  const threshold = new Date(now.getTime() - GRACE.delivery);
  const stuck = await prisma.certificate.findMany({
    where: {
      sentAt: null,
      createdAt: { lt: threshold },
      deliveryAttempts: { lt: MAX_ATTEMPTS.delivery },
      OR: [{ scheduledAt: null }, { scheduledAt: { lt: threshold } }],
      order: { status: "paid" },
    },
    select: { id: true, serial: true, deliveryAttempts: true },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  let sent = 0;
  for (const cert of stuck) {
    try {
      const { deliverCertificate } = await import("./delivery");
      await deliverCertificate(cert.id);
      const after = await prisma.certificate.findUnique({
        where: { id: cert.id },
        select: { sentAt: true },
      });
      if (after?.sentAt) sent++;
    } catch (error) {
      if (cert.deliveryAttempts + 1 >= MAX_ATTEMPTS.delivery) {
        void reportFailure("доставка: сертификат так и не ушёл", error, {
          сертификат: cert.id,
          серийник: cert.serial,
        });
      }
    }
  }
  return sent;
}

/**
 * Отмена платежа ПОСЛЕ выпуска сертификата.
 *
 * Оплаченный заказ никто не переспрашивал у провайдера ни разу: подтвердили —
 * и забыли. Между тем банк умеет отменить операцию (реверс, чарджбэк,
 * возврат через кабинет), и тогда у покупателя остаётся действующий
 * сертификат, за который денег нет. Здесь мы такие платежи находим сами.
 *
 * **Только карты.** Ответ Kaspi через бэкенд действующего сайта состоит из
 * одного признака «оплачено», состояния «отменено» в нём нет вовсе — реверс
 * по Kaspi мы увидеть не можем и ловим его только сверкой выписки руками.
 * Это ограничение чужого API, а не наша недоделка.
 *
 * Сертификат гасится в ноль и уходит в `refunded` — тем же путём, что и
 * ручной возврат из админки. Дальше обязательно зовём людей: если часть
 * суммы уже потрачена в салоне, услуга оказана, а денег за неё нет, и решать
 * это должен человек.
 */
export async function detectReversedPayments(
  now: Date = new Date(),
): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      status: "paid",
      paymentProvider: "forte",
      paymentId: { not: null },
      paidAt: { gte: new Date(now.getTime() - REVERSAL_WINDOW_MS) },
    },
    select: {
      id: true,
      paymentId: true,
      amountKzt: true,
      paidAt: true,
      certificates: { select: { id: true, status: true, balanceKzt: true } },
    },
    orderBy: { paidAt: "desc" },
    take: 50,
  });

  let found = 0;
  for (const order of orders) {
    if (!order.paymentId) continue;
    // Ручное подтверждение провайдер не знает — спрашивать про него нечего.
    if (order.paymentId.startsWith("manual:")) continue;
    let state: string;
    try {
      const { ForteBankProvider } = await import("./payments/forte");
      state = await new ForteBankProvider().checkStatus(
        order.paymentId,
        order.amountKzt,
      );
    } catch {
      // Недоступный банк — не повод объявлять платёж отменённым.
      continue;
    }
    if (state !== "failed") continue;

    found++;
    const spent = order.certificates.filter(
      (cert) => cert.status === "partially_used" || cert.status === "used",
    );
    await prisma.$transaction(async (tx) => {
      await tx.certificate.updateMany({
        where: { orderId: order.id, status: { not: "refunded" } },
        data: { status: "refunded", balanceKzt: 0 },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "refunded" },
      });
    });
    // Кошелёк держателя должен погаснуть вместе с сертификатом.
    try {
      const { refreshPassesForCertificate } = await import("./wallet/notify");
      for (const cert of order.certificates) {
        await refreshPassesForCertificate(cert.id);
      }
    } catch {
      // Карта обновится при следующей сверке остатков — не критично сейчас.
    }

    void recordPaymentEvent({
      orderId: order.id,
      provider: "forte",
      source: "reconcile",
      kind: "reversed",
      externalRef: order.paymentId,
      amountKzt: order.amountKzt,
      note: spent.length
        ? "часть суммы уже была потрачена в салоне"
        : "сертификат погашен в ноль",
    });
    void reportFailure(
      "Банк отменил платёж после выпуска сертификата",
      new Error(`заказ ${order.id}, ${order.amountKzt} ₸`),
      {
        заказ: order.id,
        оплачен: order.paidAt?.toISOString() ?? "",
        сертификаты: order.certificates.map((c) => c.id).join(", "),
        внимание: spent.length
          ? "часть суммы уже потрачена в салоне — нужен разбор"
          : undefined,
      },
    );
  }
  return found;
}

export type ReconcileResult = {
  repairedCertificates: number;
  syncedToAltegio: number;
  delivered: number;
  reversed: number;
  remaining: Discrepancy[];
};

/**
 * Полный проход сверки: сначала чиним, потом смотрим, что осталось.
 *
 * Проверка отмен по умолчанию выключена и живёт в отдельном суточном задании.
 * Она стоит по запросу к банку на каждый оплаченный заказ за месяц, и гонять
 * её каждые десять минут — это сотни обращений в час к чужому бэкенду ради
 * события, которое случается раз в месяцы. Отмену на сутки позже мы всё равно
 * заметим вовремя: сертификатом за это время едва ли успеют воспользоваться,
 * а деньги уже ушли — вопрос в том, чтобы узнать, а не чтобы узнать в минуту.
 */
export async function runReconcile(
  now: Date = new Date(),
  options: { checkReversals?: boolean } = {},
): Promise<ReconcileResult> {
  const repairedCertificates = await repairPaidWithoutCertificate(now);
  const syncedToAltegio = await retryAltegioSync(now);
  const delivered = await retryStuckDeliveries(now);
  const reversed = options.checkReversals
    ? await detectReversedPayments(now)
    : 0;
  const remaining = await findDiscrepancies(now);
  if (
    repairedCertificates > 0 ||
    syncedToAltegio > 0 ||
    delivered > 0 ||
    reversed > 0 ||
    remaining.length > 0
  ) {
    console.log(
      `reconcile: починено выпусков ${repairedCertificates}, ` +
        `записано в CRM ${syncedToAltegio}, доставлено ${delivered}, ` +
        `отменённых банком ${reversed}, ` +
        `осталось расхождений ${remaining.length}`,
    );
  }
  return {
    repairedCertificates,
    syncedToAltegio,
    delivered,
    reversed,
    remaining,
  };
}

export const DISCREPANCY_TITLES: Record<DiscrepancyKind, string> = {
  paid_without_certificate: "Оплачено, сертификата нет",
  certificate_without_payment: "Сертификат при неоплаченном заказе",
  altegio_stuck: "Не записано в Altegio",
  delivery_stuck: "Не доставлено получателю",
};

/** Текст ежедневной сводки; null — расхождений нет и писать не о чем. */
export function buildDigest(
  items: Discrepancy[],
  origin: string,
): string | null {
  if (items.length === 0) return null;
  const lines: string[] = ["⚠ Сверка платежей и выпуска: есть расхождения", ""];
  for (const kind of Object.keys(DISCREPANCY_TITLES) as DiscrepancyKind[]) {
    const group = items.filter((item) => item.kind === kind);
    if (group.length === 0) continue;
    lines.push(`${DISCREPANCY_TITLES[kind]} — ${group.length}`);
    for (const item of group.slice(0, DIGEST_LIMIT)) {
      const where =
        kind === "paid_without_certificate"
          ? `${origin}/admin/orders/${item.id}`
          : `${origin}/admin/reconcile`;
      lines.push(
        `  · ${item.label}${item.detail ? ` — ${item.detail}` : ""}`,
        `    ${where}`,
      );
    }
    if (group.length > DIGEST_LIMIT) {
      lines.push(`  … и ещё ${group.length - DIGEST_LIMIT}`);
    }
    lines.push("");
  }
  lines.push(`Полный список: ${origin}/admin/reconcile`);
  return lines.join("\n").trim();
}

/**
 * Ежедневная сводка расхождений менеджеру — теми же каналами, что и
 * уведомления о продажах (Telegram и почта).
 *
 * Отдельно от reportFailure: тот сообщает о единичном сбое в момент, когда он
 * случился, и throttle-ится. Сводка отвечает на другой вопрос — «что сейчас в
 * целом не сходится», и приходит раз в сутки, даже если каждый отдельный сбой
 * уже был проглочен.
 */
export async function sendReconcileDigest(
  now: Date = new Date(),
): Promise<boolean> {
  const items = await findDiscrepancies(now);
  const { publicOrigin } = await import("./site-url");
  const text = buildDigest(items, publicOrigin());
  if (!text) return false;

  const { getSaleNotifySettings, sendToChannels } = await import("./notify");
  const cfg = await getSaleNotifySettings();
  const errors = await sendToChannels(cfg, text);
  for (const error of errors) console.error(`reconcile digest: ${error}`);
  return true;
}
