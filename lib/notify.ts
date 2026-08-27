import "server-only";
import { prisma } from "./db";

/**
 * Уведомления администратору о продажах — Telegram (бот). Включаются в
 * админке (/admin/settings), настройка хранится в Setting
 * `sale_notifications`. Токен Telegram-бота — секрет, только env.
 * Вызывается из fulfillOrder best-effort: сбой уведомления не влияет на заказ.
 *
 * Канал WhatsApp убран вместе с ChatApp — он больше не оплачивается.
 * Поле whatsapp в настройках может остаться от прежних сохранений и
 * намеренно игнорируется.
 */

export type SaleNotifySettings = {
  enabled?: boolean;
  telegramChatId?: string;
  /**
   * Тема (topic) в группе с включёнными темами. Без неё сообщение падает
   * в General, а не в отдельную ветку, ради которой всё и затевалось.
   */
  telegramThreadId?: string;
  /** Куда слать письмо о продаже; несколько адресов — через запятую. */
  email?: string;
};

/** Адреса из настройки; пусто — берём MANAGER_EMAIL из env. */
export function notifyEmails(cfg: SaleNotifySettings): string[] {
  const raw = cfg.email?.trim() || process.env.MANAGER_EMAIL || "";
  return raw
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter((a) => a.includes("@"));
}

export async function getSaleNotifySettings(): Promise<SaleNotifySettings> {
  const row = await prisma.setting.findUnique({
    where: { key: "sale_notifications" },
  });
  return (row?.value ?? {}) as SaleNotifySettings;
}

type SaleFacts = {
  amountKzt: number;
  itemLabel: string;
  salonLine: string;
  toName: string;
  deliveryLine: string;
  serial: string | null;
  orderId: string;
  manual?: boolean;
};

/** Текст уведомления (чистая функция — тестируется). */
export function buildSaleMessage(f: SaleFacts): string {
  const lines = [
    `🎁 Новая продажа: ${f.amountKzt.toLocaleString("ru-RU")} ₸`,
    f.itemLabel,
    `Филиал: ${f.salonLine}`,
    `Кому: ${f.toName}`,
    `Доставка: ${f.deliveryLine}`,
    `${f.serial ? `Серийник: ${f.serial} · ` : ""}Заказ ${f.orderId}`,
  ];
  if (f.manual) lines.push("⚠ Выпущен вручную из админки");
  return lines.join("\n");
}

async function sendTelegram(
  chatId: string,
  text: string,
  threadId?: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("notify: telegramChatId задан, но TELEGRAM_BOT_TOKEN нет в env");
    return;
  }
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(threadId ? { message_thread_id: Number(threadId) } : {}),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`telegram ${response.status}: ${await response.text()}`);
  }
}

/** Разослать текст по настроенным каналам. Возвращает список ошибок. */
export async function sendToChannels(
  cfg: SaleNotifySettings,
  text: string,
): Promise<string[]> {
  const errors: string[] = [];
  if (cfg.telegramChatId) {
    try {
      await sendTelegram(cfg.telegramChatId, text, cfg.telegramThreadId);
    } catch (error) {
      errors.push(`telegram: ${error instanceof Error ? error.message : error}`);
    }
  }

  const emails = notifyEmails(cfg);
  if (emails.length > 0) {
    try {
      const { getMailer } = await import("./mail");
      const [first] = text.split(/\r?\n/);
      await getMailer().send({
        to: emails.join(", "),
        subject: first,
        // Письмо служебное: тот же текст, что уходит в Telegram, только
        // переносы строк превращены в разметку. Разводить два текста для
        // одного события — верный способ развести их со временем.
        html: `<pre style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif">${escapeHtml(text)}</pre>`,
      });
    } catch (error) {
      errors.push(`email: ${error instanceof Error ? error.message : error}`);
    }
  }
  return errors;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function notifySale(
  certificateId: string,
  opts: { manual?: boolean } = {},
): Promise<void> {
  const cfg = await getSaleNotifySettings();
  // Раньше выходили, если не задан Telegram, — и почта молчала заодно.
  // Каналы независимы: достаточно любого настроенного.
  if (!cfg.enabled) return;
  if (!cfg.telegramChatId && notifyEmails(cfg).length === 0) return;

  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      salon: true,
      order: true,
      programOption: { include: { program: true } },
    },
  });
  if (!cert) return;

  const programName = cert.programOption
    ? ((cert.programOption.program.names as { ru?: string }).ru ?? "Программа")
    : null;
  const text = buildSaleMessage({
    amountKzt: cert.order.amountKzt,
    itemLabel: programName
      ? `Программа «${programName}»`
      : `Сертификат на сумму ${(cert.amountKzt ?? cert.order.amountKzt).toLocaleString("ru-RU")} ₸`,
    salonLine: `${cert.salon.city}, ${cert.salon.address}`,
    toName: cert.toName,
    deliveryLine: `Email ${cert.deliveryContact}`,
    serial: cert.serial,
    orderId: cert.orderId,
    manual: opts.manual,
  });

  const errors = await sendToChannels(cfg, text);
  for (const err of errors) console.error(`notify sale failed: ${err}`);
}
