import "server-only";
import QRCode from "qrcode";
import { prisma } from "./db";
import { decryptSecret } from "./crypto";
import { pickL10n } from "./l10n";
import { formatDuration, formatKzt } from "./format";
import { getMailer } from "./mail";
import {
  buyerEmail,
  managerEmail,
  recipientEmail,
  whatsappRecipientText,
} from "./mail/templates";
import { renderCertificatePdf } from "./pdf/certificate";
import type { DesignBgStyle } from "./types";

const PDF_LABELS = {
  ru: {
    gift: "Подарочный сертификат",
    code: "Код сертификата",
    validUntil: "Действует до",
    hour: "ч",
    guests: (n: number) => `${n} гостя(ей)`,
    nominal: "Сертификат на сумму",
    filename: "Сертификат Imbir Thai Spa.pdf",
  },
  kk: {
    gift: "Сыйлық сертификаты",
    code: "Сертификат коды",
    validUntil: "Жарамдылық мерзімі",
    hour: "сағ",
    guests: (n: number) => `${n} қонақ`,
    nominal: "Сомаға сертификат",
    filename: "Imbir Thai Spa sertifikaty.pdf",
  },
  en: {
    gift: "Gift certificate",
    code: "Certificate code",
    validUntil: "Valid until",
    hour: "h",
    guests: (n: number) => `${n} guests`,
    nominal: "Gift card",
    filename: "Imbir Thai Spa certificate.pdf",
  },
} as const;

type PdfLocale = keyof typeof PDF_LABELS;

function siteUrl(): string {
  return process.env.SITE_URL ?? "http://localhost:3000";
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
    `${siteUrl()}/${locale}/check?code=${encodeURIComponent(code)}`,
    { margin: 1, width: 300, color: { dark: "#4D295D" } },
  );

  const pdf = await renderCertificatePdf({
    code,
    qrDataUrl,
    title,
    subtitle,
    toName: certificate.toName,
    fromName: certificate.fromName,
    message: certificate.message ?? undefined,
    validUntilLabel: labels.validUntil,
    validUntil: certificate.validUntil.toISOString().slice(0, 10),
    salonLine: `${certificate.salon.city}, ${certificate.salon.address}`,
    giftLabel: labels.gift,
    codeLabel: labels.code,
    locale,
    bgStyle: certificate.design.bgStyle as DesignBgStyle,
    textColor: certificate.design.textColor,
  });

  return { pdf, filename: labels.filename, certificate };
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
 * Доставка сертификата (PRD §5.3): получателю — PDF письмом (email) или
 * текст со ссылкой + PDF в WhatsApp (ChatApp); копия покупателю на email;
 * уведомление менеджеру. Идемпотентна по sentAt.
 */
export async function deliverCertificate(certificateId: string): Promise<void> {
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

  // Доставка получателю: email — PDF письмом; whatsapp — текст со ссылкой
  // на сертификат + PDF-файлом (best-effort) через ChatApp.
  if (certificate.deliveryMethod === "email") {
    const mail = recipientEmail(mailData);
    await mailer.send({
      to: certificate.deliveryContact,
      subject: mail.subject,
      html: mail.html,
      attachments: [attachment],
    });
  } else if (certificate.deliveryMethod === "whatsapp") {
    const { getMessenger } = await import("./messaging");
    const messenger = getMessenger();
    const link = `${siteUrl()}/${locale}/success?token=${certificate.order.successToken}`;
    console.log(
      `[delivery] WhatsApp → ${certificate.deliveryContact} (provider=${messenger.id})`,
    );
    await messenger.sendText(
      certificate.deliveryContact,
      whatsappRecipientText({
        locale,
        fromName: certificate.fromName,
        validUntil: mailData.validUntil,
        link,
      }),
    );
    console.log(`[delivery] WhatsApp text OK → ${certificate.deliveryContact}`);
    // PDF-файл: ChatApp качает вложение по публичному URL. На localhost URL
    // недоступен извне → упадёт; поэтому best-effort (текст со ссылкой выше
    // уже доставлен). На публичном хостинге доставит PDF.
    try {
      const pdfUrl = `${siteUrl()}/api/certificates/pdf?token=${certificate.order.successToken}`;
      await messenger.sendFile(certificate.deliveryContact, {
        filename,
        content: pdf,
        mimeType: "application/pdf",
        url: pdfUrl,
      });
    } catch (error) {
      console.error("whatsapp file send failed (non-fatal)", error);
    }
  }

  // Копия покупателю (PRD §5.3)
  const buyer = buyerEmail(mailData);
  await mailer.send({
    to: certificate.order.buyerEmail,
    subject: buyer.subject,
    html: buyer.html,
    attachments: [attachment],
  });

  // Уведомление менеджеру — без PDF и без открытого кода. Не критично:
  // сбой (напр. непроверенный домен отправителя) не должен ломать доставку
  // получателю/покупателю и вызывать ретраи джоба.
  const managerTo = process.env.MANAGER_EMAIL;
  if (managerTo) {
    const manager = managerEmail({
      orderId: certificate.orderId,
      certDisplay: certificate.codeDisplay,
      amountKzt: certificate.order.amountKzt,
      salon: `${certificate.salon.city}, ${certificate.salon.address}`,
      buyerEmail: certificate.order.buyerEmail,
    });
    try {
      await mailer.send({
        to: managerTo,
        subject: manager.subject,
        html: manager.html,
      });
    } catch (error) {
      console.error("manager notification failed (non-fatal)", error);
    }
  }

  await prisma.certificate.update({
    where: { id: certificateId },
    data: { sentAt: new Date() },
  });
}
