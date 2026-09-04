import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import QRCode from "qrcode";
import { prisma } from "./db";
import { decryptSecret } from "./crypto";
import { pickL10n } from "./l10n";
import { formatDuration, formatKzt } from "./format";
import { getMailer } from "./mail";
import {
  buyerEmail,
  recipientEmail,
} from "./mail/templates";
import { renderCertificatePdf } from "./pdf/certificate";
import {
  renderReceiptPdf,
  type ReceiptLabels,
} from "./pdf/receipt";
import type { DesignBgStyle } from "./types";

const PDF_LABELS = {
  ru: {
    gift: "Подарочный сертификат",
    to: "Кому",
    from: "От кого",
    code: "Код сертификата",
    validUntil: "Действует до",
    hour: "ч",
    guests: (n: number) => `${n} гостя(ей)`,
    nominal: "Сертификат на сумму",
    filename: "Сертификат Imbir Thai Spa.pdf",
  },
  kk: {
    gift: "Сыйлық сертификаты",
    to: "Кімге",
    from: "Кімнен",
    code: "Сертификат коды",
    validUntil: "Жарамдылық мерзімі",
    hour: "сағ",
    guests: (n: number) => `${n} қонақ`,
    nominal: "Сомаға сертификат",
    filename: "Imbir Thai Spa sertifikaty.pdf",
  },
  en: {
    gift: "Gift certificate",
    to: "To",
    from: "From",
    code: "Certificate code",
    validUntil: "Valid until",
    hour: "h",
    guests: (n: number) => `${n} guests`,
    nominal: "Gift card",
    filename: "Imbir Thai Spa certificate.pdf",
  },
} as const;

type PdfLocale = keyof typeof PDF_LABELS;

/** Подписи товарного чека. Фискальным он не является — см. lib/pdf/receipt. */
const RECEIPT_LABELS: Record<PdfLocale, ReceiptLabels> = {
  ru: {
    title: "Товарный чек",
    seller: "Продавец",
    bin: "БИН",
    address: "Адрес",
    phone: "Телефон",
    orderNo: "Номер заказа",
    date: "Дата оплаты",
    method: "Способ оплаты",
    item: "Наименование",
    amount: "Сумма",
    discount: "Скидка по промокоду",
    total: "Итого оплачено",
    certificate: "Номер сертификата",
    validUntil: "Действует до",
    note: "Электронный подарочный сертификат. Погашается в салоне сети Imbir Thai Spa.",
    filename: "Чек Imbir Thai Spa.pdf",
  },
  kk: {
    title: "Тауар чегі",
    seller: "Сатушы",
    bin: "БСН",
    address: "Мекенжай",
    phone: "Телефон",
    orderNo: "Тапсырыс нөмірі",
    date: "Төлем күні",
    method: "Төлем тәсілі",
    item: "Атауы",
    amount: "Сомасы",
    discount: "Промокод бойынша жеңілдік",
    total: "Барлығы төленді",
    certificate: "Сертификат нөмірі",
    validUntil: "Жарамдылық мерзімі",
    note: "Электрондық сыйлық сертификаты. Imbir Thai Spa желісінің салонында өтеледі.",
    filename: "Imbir Thai Spa chek.pdf",
  },
  en: {
    title: "Sales receipt",
    seller: "Seller",
    bin: "BIN",
    address: "Address",
    phone: "Phone",
    orderNo: "Order number",
    date: "Payment date",
    method: "Payment method",
    item: "Item",
    amount: "Amount",
    discount: "Promo code discount",
    total: "Total paid",
    certificate: "Certificate number",
    validUntil: "Valid until",
    note: "Electronic gift certificate. Redeemed at any Imbir Thai Spa location.",
    filename: "Imbir Thai Spa receipt.pdf",
  },
};

const PAYMENT_LABELS: Record<string, Record<PdfLocale, string>> = {
  kaspi: { ru: "Kaspi", kk: "Kaspi", en: "Kaspi" },
  forte: {
    ru: "Банковская карта",
    kk: "Банк картасы",
    en: "Bank card",
  },
  freedom: { ru: "Freedom Pay", kk: "Freedom Pay", en: "Freedom Pay" },
};

function siteUrl(): string {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

/** «Город, адрес» филиала на языке заказа (фолбэк — русские поля). */
function salonLine(
  salon: { city: string; cityNames: unknown; address: string; addressNames: unknown },
  locale: string,
): string {
  const city = pickL10n(salon.cityNames, locale) || salon.city;
  const address = pickL10n(salon.addressNames, locale) || salon.address;
  return `${city}, ${address}`;
}

/** Собирает PDF сертификата по id; null — если код недоступен. */
export async function buildCertificatePdf(certificateId: string): Promise<{
  pdf: Buffer;
  filename: string;
  certificate: NonNullable<Awaited<ReturnType<typeof loadCertificate>>>;
} | null> {
  const certificate = await loadCertificate(certificateId);
  if (!certificate?.codeEncrypted) return null;
  const code = decryptSecret(certificate.codeEncrypted);
  if (!code) return null;

  const item = certificate.order.item as { locale?: string };
  const locale: PdfLocale =
    item.locale && item.locale in PDF_LABELS
      ? (item.locale as PdfLocale)
      : "ru";
  const labels = PDF_LABELS[locale];

  const option = certificate.programOption;
  const title =
    certificate.type === "program" && option
      ? pickL10n(option.program.names, locale)
      : formatKzt(certificate.amountKzt ?? 0);
  const subtitle =
    certificate.type === "program" && option
      ? option.persons
        ? labels.guests(option.persons)
        : option.durationMin
          ? formatDuration(option.durationMin, labels.hour)
          : undefined
      : labels.nominal;

  const qrDataUrl = await QRCode.toDataURL(
    `${siteUrl()}/${locale}/check?code=${encodeURIComponent(code)}&utm_source=imbir&utm_medium=email`,
    { margin: 1, width: 300, color: { dark: "#4D295D" } },
  );

  const pdf = await renderCertificatePdf({
    code,
    qrDataUrl,
    title,
    subtitle,
    toName: certificate.toName,
    fromName: certificate.fromName,
    toLabel: labels.to,
    fromLabel: labels.from,
    message: certificate.message ?? undefined,
    validUntilLabel: labels.validUntil,
    validUntil: certificate.validUntil.toISOString().slice(0, 10),
    salonLine: salonLine(certificate.salon, locale),
    giftLabel: labels.gift,
    codeLabel: labels.code,
    locale,
    bgStyle: certificate.design.bgStyle as DesignBgStyle,
    textColor: certificate.design.textColor,
    imageDataUrl: await designImageDataUrl(certificate.design.imageUrl),
  });

  return { pdf, filename: labels.filename, certificate };
}

/**
 * Художественная открытка (WebP из public/) → JPEG data-URL для PDF:
 * react-pdf не поддерживает WebP. Ошибка/пустой путь → undefined
 * (PDF откатывается на CSS-макет). Пути только внутри public/ (без ../).
 */
async function designImageDataUrl(
  imageUrl: string | null,
): Promise<string | undefined> {
  if (!imageUrl || !imageUrl.startsWith("/") || imageUrl.includes("..")) {
    return undefined;
  }
  try {
    const abs = path.join(process.cwd(), "public", imageUrl);
    const input = await readFile(abs);
    const jpeg = await sharp(input)
      .resize({ width: 1000, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function loadCertificate(id: string) {
  return prisma.certificate.findUnique({
    where: { id },
    include: {
      order: true,
      salon: true,
      design: true,
      programOption: { include: { program: true } },
    },
  });
}

/**
 * Товарный чек к оплаченному заказу. Возвращает null, если заказ не оплачен:
 * чек без пришедших денег — бумага ни о чём.
 */
export async function buildReceiptPdf(certificateId: string): Promise<{
  pdf: Buffer;
  filename: string;
} | null> {
  const certificate = await loadCertificate(certificateId);
  if (!certificate || certificate.order.status !== "paid") return null;

  const item = certificate.order.item as { locale?: string };
  const locale: PdfLocale =
    item.locale && item.locale in PDF_LABELS
      ? (item.locale as PdfLocale)
      : "ru";
  const labels = RECEIPT_LABELS[locale];

  const option = certificate.programOption;
  const itemTitle =
    certificate.type === "program" && option
      ? pickL10n(option.program.names, locale)
      : `${PDF_LABELS[locale].gift} · ${formatKzt(certificate.amountKzt ?? 0)}`;

  // Дата оплаты — по времени салона, а не сервера: покупатель сверяет её
  // с выпиской банка, и расхождение в пять часов выглядит ошибкой.
  const paidAt = certificate.order.paidAt ?? certificate.order.createdAt;
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(paidAt);

  const provider = certificate.order.paymentProvider ?? "";
  const methodLabel = PAYMENT_LABELS[provider]?.[locale] ?? "—";

  const pdf = await renderReceiptPdf({
    labels,
    // Покупателю показываем тот же номер, что он видел при оплате.
    orderRef: certificate.order.kaspiRef ?? certificate.order.id,
    dateLabel,
    methodLabel,
    itemTitle,
    faceKzt: certificate.amountKzt ?? certificate.balanceKzt,
    paidKzt: certificate.order.amountKzt,
    certificateCode: certificate.serial ?? certificate.codeDisplay,
    validUntil: certificate.validUntil.toISOString().slice(0, 10),
    salonLine: salonLine(certificate.salon, locale),
  });

  return { pdf, filename: labels.filename };
}

/**
 * Доставка сертификата (PRD §5.3): получателю — PDF письмом (email) или
 * текст со ссылкой + PDF в WhatsApp (ChatApp); копия покупателю на email;
 * уведомление менеджеру. Идемпотентна по sentAt.
 */
export async function deliverCertificate(certificateId: string): Promise<void> {
  try {
    await deliverCertificateOnce(certificateId);
  } catch (error) {
    // Причину неудачи храним в базе, а не только в очереди: у покупателя на
    // руках оплаченный сертификат, которого он не получил, и менеджеру нужно
    // видеть ПОЧЕМУ — отказ почтового сервиса, битый адрес или сбой PDF.
    // Счётчик нужен сверке (lib/reconcile.ts): она повторяет доставку, но не
    // бесконечно.
    await prisma.certificate
      .update({
        where: { id: certificateId },
        data: {
          deliveryAttempts: { increment: 1 },
          deliveryLastError: (error instanceof Error
            ? error.message
            : String(error)
          ).slice(0, 500),
        },
      })
      .catch(() => {});
    throw error;
  }
}

async function deliverCertificateOnce(certificateId: string): Promise<void> {
  const built = await buildCertificatePdf(certificateId);
  if (!built) {
    throw new Error(`delivery: certificate ${certificateId} has no code`);
  }
  const { pdf, filename, certificate } = built;
  if (certificate.sentAt) return; // уже доставлен (повторный запуск джоба)

  const item = certificate.order.item as { locale?: string };
  const locale = item.locale ?? "ru";
  const mailData = {
    locale,
    toName: certificate.toName,
    fromName: certificate.fromName,
    validUntil: certificate.validUntil.toISOString().slice(0, 10),
  };
  const attachment = { filename, content: pdf };
  const mailer = getMailer();

  // Доставка получателю — только письмом с PDF. Отправка в WhatsApp
  // убрана: ChatApp у заказчика отключён, канал не оплачивается.
  // В БД остаётся старое значение deliveryMethod=whatsapp у ранее
  // выпущенных сертификатов, поэтому шлём письмом в любом случае —
  // молча ничего не отправить было бы хуже.
  // У сертификатов, выпущенных до отключения WhatsApp, в контакте лежит
  // телефон — письмо туда не уйдёт. Для них адресат — почта покупателя.
  const recipient =
    certificate.deliveryMethod === "email"
      ? certificate.deliveryContact
      : certificate.order.buyerEmail;

  // Почту получателя покупатель указывает по желанию: часто он её не знает и
  // дарит сам. Тогда контакт равен его собственному адресу — и два письма
  // подряд на один ящик были бы мусором. Шлём одно, покупательское.
  const giftingSelf =
    recipient.trim().toLowerCase() ===
    certificate.order.buyerEmail.trim().toLowerCase();

  if (!giftingSelf) {
    const mail = recipientEmail(mailData);
    await mailer.send({
      to: recipient,
      subject: mail.subject,
      html: mail.html,
      attachments: [attachment],
    });
  }

  // Покупателю — сертификат и товарный чек. Чек best-effort: сбой его
  // сборки не должен лишать человека сертификата, за который он заплатил.
  const buyer = buyerEmail(mailData, { self: giftingSelf });
  const buyerAttachments = [attachment];
  try {
    const receipt = await buildReceiptPdf(certificateId);
    if (receipt) {
      buyerAttachments.push({
        filename: receipt.filename,
        content: receipt.pdf,
      });
    }
  } catch (error) {
    console.error("receipt build failed (non-fatal)", error);
  }
  await mailer.send({
    to: certificate.order.buyerEmail,
    subject: buyer.subject,
    html: buyer.html,
    attachments: buyerAttachments,
  });

  // Уведомление о продаже (почта и/или Telegram) шлёт lib/notify из
  // fulfillOrder: там оно привязано к моменту ОПЛАТЫ, а не доставки —
  // для отложенного подарка это разные дни. Здесь его больше нет, иначе
  // на одну продажу приходило бы по два письма.

  await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      sentAt: new Date(),
      deliveryAttempts: { increment: 1 },
      // Прошлая ошибка больше не актуальна: письмо ушло.
      deliveryLastError: null,
    },
  });
}
