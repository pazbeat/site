import "server-only";
import { prisma } from "./db";

/**
 * Уведомления администратору о продажах — WhatsApp (через ChatApp) и/или
 * Telegram (бот). Включаются в админке (/admin/settings), настройка хранится
 * в Setting `sale_notifications`. Токен Telegram-бота — секрет, только env.
 * Вызывается из fulfillOrder best-effort: сбой уведомления не влияет на заказ.
 */

export type SaleNotifySettings = {
  enabled?: boolean;
  whatsapp?: string;
  telegramChatId?: string;
};

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

async function sendTelegram(chatId: string, text: string): Promise<void> {
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
      body: JSON.stringify({ chat_id: chatId, text }),
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
  if (cfg.whatsapp) {
    try {
      const { getMessenger } = await import("./messaging");
      await getMessenger().sendText(cfg.whatsapp, text);
    } catch (error) {
      errors.push(`whatsapp: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (cfg.telegramChatId) {
    try {
      await sendTelegram(cfg.telegramChatId, text);
    } catch (error) {
      errors.push(`telegram: ${error instanceof Error ? error.message : error}`);
    }
  }
  return errors;
}

export async function notifySale(
  certificateId: string,
  opts: { manual?: boolean } = {},
): Promise<void> {
  const cfg = await getSaleNotifySettings();
  if (!cfg.enabled || (!cfg.whatsapp && !cfg.telegramChatId)) return;

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
    deliveryLine: `${cert.deliveryMethod === "whatsapp" ? "WhatsApp" : "Email"} ${cert.deliveryContact}`,
    serial: cert.serial,
    orderId: cert.orderId,
    manual: opts.manual,
  });

  const errors = await sendToChannels(cfg, text);
  for (const err of errors) console.error(`notify sale failed: ${err}`);
}
