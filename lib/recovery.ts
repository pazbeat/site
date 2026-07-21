import "server-only";
import { prisma } from "./db";
import { getMailer } from "./mail";
import { recoveryEmail } from "./mail/templates";

/**
 * Дожим брошенных заказов (Фаза 2): покупатель дошёл до оплаты (создан заказ),
 * но не оплатил — заказ протух. Один раз шлём письмо со ссылкой на конструктор
 * с предзаполнением из этого заказа. Ежечасный/частый cron; идемпотентно по
 * recoveryEmailSentAt. Не трогаем совсем старые (окно 24 ч), чтобы не слать
 * дожим по историческим заказам при первом включении.
 */

const HOUR_MS = 60 * 60_000;
const WINDOW_MS = 24 * HOUR_MS;

function siteUrl(): string {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

/**
 * Пора ли слать дожим по заказу (чистая функция, тестируемая):
 * заказ протух, есть email покупателя, письмо ещё не слали, заказ свежий
 * (в окне 24 ч) и по нему нет выпущенных сертификатов.
 */
export function dueRecovery(
  order: {
    status: string;
    buyerEmail: string | null;
    recoveryEmailSentAt: Date | null;
    createdAt: Date;
    certificatesCount: number;
  },
  now: Date,
): boolean {
  if (order.status !== "expired") return false;
  if (order.recoveryEmailSentAt) return false;
  if (order.certificatesCount > 0) return false;
  if (!order.buyerEmail) return false;
  const age = now.getTime() - order.createdAt.getTime();
  return age >= 0 && age <= WINDOW_MS;
}

/**
 * Шлёт письма-дожимы по всем подходящим заказам. Возвращает число писем.
 * Ссылка ведёт на /{locale}/create?resume={successToken} — конструктор
 * подхватит сохранённый выбор.
 */
export async function sendAbandonedRecovery(
  now: Date = new Date(),
): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: {
      status: "expired",
      recoveryEmailSentAt: null,
      createdAt: { gte: new Date(now.getTime() - WINDOW_MS) },
    },
    include: { _count: { select: { certificates: true } } },
  });

  const mailer = getMailer();
  let sent = 0;

  for (const order of candidates) {
    const ready = dueRecovery(
      {
        status: order.status,
        buyerEmail: order.buyerEmail,
        recoveryEmailSentAt: order.recoveryEmailSentAt,
        createdAt: order.createdAt,
        certificatesCount: order._count.certificates,
      },
      now,
    );
    if (!ready) continue;

    const item = order.item as { locale?: string; toName?: string };
    const locale = item.locale ?? "ru";
    const mail = recoveryEmail({
      locale,
      toName: item.toName ?? "",
      resumeUrl: `${siteUrl()}/${locale}/create?resume=${order.successToken}`,
    });

    try {
      await mailer.send({ to: order.buyerEmail, subject: mail.subject, html: mail.html });
      await prisma.order.update({
        where: { id: order.id },
        data: { recoveryEmailSentAt: now },
      });
      sent += 1;
    } catch (error) {
      console.error(`recovery email failed for order ${order.id}`, error);
    }
  }

  if (sent > 0) console.log(`recover-abandoned: sent ${sent} recovery email(s)`);
  return sent;
}
