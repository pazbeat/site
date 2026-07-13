import "server-only";
import { prisma } from "./db";
import { getMailer } from "./mail";
import { reminderEmail } from "./mail/templates";

/**
 * Напоминания об истечении сертификата (Фаза 2, PRD §6.7): за 30 и за 7
 * дней. Каждая веха отправляется один раз (отметки reminder30/7SentAt).
 * Ежедневный cron; идемпотентно — повторный прогон не шлёт дубли.
 */

const DAY_MS = 24 * 60 * 60_000;

export type ReminderMilestone = "30" | "7";

/**
 * Какую веху напоминания пора отправить для сертификата (чистая функция).
 * 7-дневная приоритетнее 30-дневной; уже истёкшие и уже отправленные — null.
 */
export function dueReminderMilestone(
  cert: {
    validUntil: Date;
    reminder30SentAt: Date | null;
    reminder7SentAt: Date | null;
  },
  now: Date,
): ReminderMilestone | null {
  const msLeft = cert.validUntil.getTime() - now.getTime();
  if (msLeft <= 0) return null; // уже истёк — напоминать поздно
  if (msLeft <= 7 * DAY_MS && !cert.reminder7SentAt) return "7";
  if (msLeft <= 30 * DAY_MS && !cert.reminder30SentAt) return "30";
  return null;
}

export function daysLeft(validUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((validUntil.getTime() - now.getTime()) / DAY_MS));
}

/**
 * Отправляет напоминания по всем сертификатам, которым пора. Возвращает
 * число отправленных писем. Напоминаем держателю: при email-доставке —
 * на контакт получателя, иначе (WhatsApp) — покупателю на email.
 */
export async function sendExpiryReminders(
  now: Date = new Date(),
): Promise<number> {
  const horizon = new Date(now.getTime() + 30 * DAY_MS);
  // Кандидаты: доставленные, действующие, истекают в пределах 30 дней,
  // и есть неотправленная веха.
  const candidates = await prisma.certificate.findMany({
    where: {
      sentAt: { not: null },
      status: { in: ["active", "partially_used"] },
      validUntil: { gt: now, lte: horizon },
      OR: [{ reminder30SentAt: null }, { reminder7SentAt: null }],
    },
    include: { order: { select: { buyerEmail: true, item: true } } },
  });

  const mailer = getMailer();
  let sent = 0;

  for (const cert of candidates) {
    const milestone = dueReminderMilestone(cert, now);
    if (!milestone) continue;

    const item = cert.order.item as { locale?: string };
    const to =
      cert.deliveryMethod === "email"
        ? cert.deliveryContact
        : cert.order.buyerEmail;
    const mail = reminderEmail({
      locale: item.locale ?? "ru",
      daysLeft: daysLeft(cert.validUntil, now),
      validUntil: cert.validUntil.toISOString().slice(0, 10),
    });

    try {
      await mailer.send({ to, subject: mail.subject, html: mail.html });
      await prisma.certificate.update({
        where: { id: cert.id },
        data:
          milestone === "7"
            ? { reminder7SentAt: now }
            : { reminder30SentAt: now },
      });
      sent += 1;
    } catch (error) {
      console.error(`reminder failed for certificate ${cert.id}`, error);
    }
  }

  if (sent > 0) console.log(`expiry-reminders: sent ${sent} reminder(s)`);
  return sent;
}
