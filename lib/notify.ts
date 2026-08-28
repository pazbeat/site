import "server-only";
import { prisma } from "./db";
import { publicOrigin } from "./site-url";

/** Как называть способ оплаты в уведомлении. */
const PAYMENT_LABEL: Record<string, string> = {
  kaspi: "Kaspi",
  forte: "Банковская карта",
  freedom: "Freedom Pay",
};

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

export type SaleFacts = {
  /** Сколько реально заплатили. */
  amountKzt: number;
  /** Номинал сертификата: при промокоде он больше уплаченного. */
  faceKzt?: number;
  /** Промокод, если применялся: код и размер скидки. */
  promo?: { code: string; kind: "percent" | "fixed"; value: number };
  itemLabel: string;
  salonLine: string;
  designName?: string;
  fromName?: string;
  toName: string;
  message?: string | null;
  buyerEmail?: string;
  /** Почта получателя; пусто — покупатель дарит сам. */
  recipientEmail?: string | null;
  paidLabel?: string;
  paymentLabel?: string;
  paid?: boolean;
  serial: string | null;
  orderId: string;
  certUrl?: string;
  adminUrl?: string;
  manual?: boolean;
};

/** Текст уведомления (чистая функция — тестируется). */
export function buildSaleMessage(f: SaleFacts): string {
  // Обычный пробел вместо неразрывного, который подставляет toLocaleString:
  // менеджер ищет в Telegram «36 000» с клавиатуры, и по неразрывному
  // пробелу поиск ничего не находит.
  const money = (v: number) =>
    `${v.toLocaleString("ru-RU").replace(/\s/g, " ")} ₸`;
  const lines = [`🎁 Новая продажа — ${money(f.amountKzt)}`];

  lines.push(
    [
      f.paid === false ? "⏳ Не оплачено" : "✅ Оплачено",
      f.paymentLabel,
      f.paidLabel,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  // Скидку видно только сопоставлением сумм — само по себе «(со скидкой)»
  // не отвечает на вопрос «по какому коду и на сколько».
  if (f.faceKzt && f.faceKzt !== f.amountKzt) {
    const off = f.faceKzt - f.amountKzt;
    lines.push(`Номинал сертификата: ${money(f.faceKzt)}`);
    const size = f.promo
      ? f.promo.kind === "percent"
        ? `${f.promo.value}%`
        : money(f.promo.value)
      : null;
    lines.push(
      f.promo
        ? `Скидка: промокод ${f.promo.code} (${size}) — −${money(off)}`
        : `Скидка: −${money(off)}`,
    );
  }
  lines.push("");

  if (f.serial) lines.push(`Код: ${f.serial}`);
  lines.push(`Что: ${f.itemLabel}`);
  lines.push(`Филиал: ${f.salonLine}`);
  if (f.designName) lines.push(`Дизайн: ${f.designName}`);
  lines.push("");

  if (f.fromName) lines.push(`От кого: ${f.fromName}`);
  lines.push(`Кому: ${f.toName}`);
  if (f.message) lines.push(`Пожелание: «${f.message}»`);
  lines.push("");

  if (f.buyerEmail) lines.push(`Почта покупателя: ${f.buyerEmail}`);
  lines.push(
    `Почта получателя: ${f.recipientEmail ? f.recipientEmail : "— (дарит сам)"}`,
  );
  lines.push("");

  lines.push(`Заказ: ${f.orderId}`);
  if (f.certUrl) lines.push(`Сертификат: ${f.certUrl}`);
  if (f.adminUrl) lines.push(`В админке: ${f.adminUrl}`);
  if (f.manual) lines.push("⚠ Выпущен вручную из админки");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

/**
 * Сертификат файлом. Подпись Telegram ограничивает 1024 знаками — если карточка
 * длиннее, шлём её отдельным сообщением, а к файлу оставляем короткую строку.
 */
async function sendTelegramDocument(
  chatId: string,
  file: { name: string; content: Buffer },
  caption: string,
  threadId?: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const form = new FormData();
  form.append("chat_id", chatId);
  if (threadId) form.append("message_thread_id", threadId);
  if (caption) form.append("caption", caption);
  form.append(
    "document",
    new Blob([new Uint8Array(file.content)], { type: "application/pdf" }),
    file.name,
  );
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendDocument`,
    { method: "POST", body: form },
  );
  if (!response.ok) {
    throw new Error(`telegram doc ${response.status}: ${await response.text()}`);
  }
}

const TELEGRAM_CAPTION_LIMIT = 1024;

/** Разослать текст по настроенным каналам. Возвращает список ошибок. */
export async function sendToChannels(
  cfg: SaleNotifySettings,
  text: string,
  file?: { name: string; content: Buffer },
): Promise<string[]> {
  const errors: string[] = [];
  if (cfg.telegramChatId) {
    try {
      const asCaption = !!file && text.length <= TELEGRAM_CAPTION_LIMIT;
      if (!asCaption) {
        await sendTelegram(cfg.telegramChatId, text, cfg.telegramThreadId);
      }
      if (file) {
        await sendTelegramDocument(
          cfg.telegramChatId,
          file,
          asCaption ? text : "",
          cfg.telegramThreadId,
        );
      }
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
        ...(file
          ? { attachments: [{ filename: file.name, content: file.content }] }
          : {}),
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
      order: { include: { promo: true } },
      design: true,
      programOption: { include: { program: true } },
    },
  });
  if (!cert) return;

  const programName = cert.programOption
    ? ((cert.programOption.program.names as { ru?: string }).ru ?? "Программа")
    : null;
  const faceKzt = cert.amountKzt ?? cert.balanceKzt;

  // Дата по времени салона: менеджер сверяет её с выпиской банка, а не с UTC.
  const paidAt = cert.order.paidAt ?? cert.order.createdAt;
  const paidLabel = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(paidAt);

  const origin = publicOrigin();
  const text = buildSaleMessage({
    amountKzt: cert.order.amountKzt,
    faceKzt,
    promo: cert.order.promo
      ? {
          code: cert.order.promo.code,
          kind: cert.order.promo.kind,
          value: cert.order.promo.value,
        }
      : undefined,
    itemLabel: programName
      ? `Программа «${programName}»`
      : `Сертификат на сумму ${faceKzt.toLocaleString("ru-RU")} ₸`,
    salonLine: `${cert.salon.city}, ${cert.salon.address}`,
    designName:
      (cert.design.names as { ru?: string } | null)?.ru ?? undefined,
    fromName: cert.fromName,
    toName: cert.toName,
    message: cert.message,
    buyerEmail: cert.order.buyerEmail,
    // Контакт равен почте покупателя — значит получателя не указывали.
    recipientEmail:
      cert.deliveryContact.trim().toLowerCase() ===
      cert.order.buyerEmail.trim().toLowerCase()
        ? null
        : cert.deliveryContact,
    paid: cert.order.status === "paid",
    paidLabel,
    paymentLabel: PAYMENT_LABEL[cert.order.paymentProvider ?? ""],
    serial: cert.serial,
    orderId: cert.orderId,
    certUrl: `${origin}/ru/success?token=${cert.order.successToken}`,
    adminUrl: `${origin}/admin/orders/${cert.orderId}`,
    manual: opts.manual,
  });

  // Сам сертификат файлом. Не собрался — уведомление всё равно уходит:
  // текст менеджеру нужнее, чем вложение.
  let file: { name: string; content: Buffer } | undefined;
  try {
    const { buildCertificatePdf } = await import("./delivery");
    const built = await buildCertificatePdf(certificateId);
    if (built) file = { name: built.filename, content: built.pdf };
  } catch (error) {
    console.error("notify sale: PDF не собрался", error);
  }

  const errors = await sendToChannels(cfg, text, file);
  for (const err of errors) console.error(`notify sale failed: ${err}`);
}
