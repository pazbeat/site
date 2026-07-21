/**
 * Локализованные шаблоны писем (RU/KK/EN). Работают вне request-контекста
 * (воркер очереди), поэтому словари здесь, а не в messages/*.json.
 * Код сертификата в тело письма не пишем — он только в PDF (PRD §8).
 */

type Locale = "ru" | "kk" | "en";

const STRINGS = {
  ru: {
    recipientSubject: "Вам подарок — сертификат Imbir Thai Spa 🌿",
    recipientTitle: "Вам подарили сертификат!",
    recipientBody: (from: string) =>
      `${from} дарит вам сертификат Imbir Thai Spa. Сертификат с кодом — в приложенном PDF. Предъявите его администратору салона при записи.`,
    buyerSubject: "Ваш сертификат Imbir Thai Spa оплачен",
    buyerTitle: "Спасибо за покупку!",
    buyerBody: (to: string) =>
      `Оплата прошла успешно. Копия сертификата для «${to}» — в приложенном PDF.`,
    reminderSubject: (days: number) =>
      `Ваш сертификат Imbir Thai Spa истекает через ${days} дн.`,
    reminderTitle: "Не забудьте про подарок 🌿",
    reminderBody: (days: number) =>
      `Ваш подарочный сертификат Imbir Thai Spa действует ещё ${days} дн. Успейте записаться и порадовать себя тайским расслаблением — код сертификата в ранее отправленном PDF.`,
    recoverySubject: "Вы почти оформили подарок 🌿",
    recoveryTitle: "Продолжите оформление",
    recoveryBody: (to: string) =>
      `Вы начали оформлять подарочный сертификат Imbir Thai Spa для «${to}», но не завершили оплату. Мы сохранили ваш выбор — продолжите с того же места одним нажатием.`,
    recoveryCta: "Продолжить оформление",
    validUntil: "Действует до",
    footer:
      "Imbir Thai Spa · сеть салонов тайского массажа и SPA · +7 708 111 8098 · spa@imbir.kz",
  },
  kk: {
    recipientSubject: "Сізге сыйлық — Imbir Thai Spa сертификаты 🌿",
    recipientTitle: "Сізге сертификат сыйлады!",
    recipientBody: (from: string) =>
      `${from} сізге Imbir Thai Spa сертификатын сыйлайды. Коды бар сертификат — тіркелген PDF-те. Жазылу кезінде оны салон әкімшісіне көрсетіңіз.`,
    buyerSubject: "Сіздің Imbir Thai Spa сертификатыңыз төленді",
    buyerTitle: "Сатып алғаныңызға рахмет!",
    buyerBody: (to: string) =>
      `Төлем сәтті өтті. «${to}» үшін сертификат көшірмесі — тіркелген PDF-те.`,
    reminderSubject: (days: number) =>
      `Сіздің Imbir Thai Spa сертификатыңыз ${days} күннен кейін бітеді`,
    reminderTitle: "Сыйлықты ұмытпаңыз 🌿",
    reminderBody: (days: number) =>
      `Сіздің Imbir Thai Spa сыйлық сертификатыңыз тағы ${days} күн жарамды. Жазылып, тай демалысымен ләззат алуға үлгеріңіз — сертификат коды бұрын жіберілген PDF-те.`,
    recoverySubject: "Сіз сыйлықты ресімдеп бітірмедіңіз 🌿",
    recoveryTitle: "Ресімдеуді жалғастырыңыз",
    recoveryBody: (to: string) =>
      `Сіз «${to}» үшін Imbir Thai Spa сыйлық сертификатын ресімдей бастадыңыз, бірақ төлемді аяқтамадыңыз. Таңдауыңызды сақтадық — бір басумен тоқтаған жеріңізден жалғастырыңыз.`,
    recoveryCta: "Ресімдеуді жалғастыру",
    validUntil: "Жарамдылық мерзімі",
    footer:
      "Imbir Thai Spa · тай массажы мен SPA салондарының желісі · +7 708 111 8098 · spa@imbir.kz",
  },
  en: {
    recipientSubject: "A gift for you — Imbir Thai Spa certificate 🌿",
    recipientTitle: "You've received a certificate!",
    recipientBody: (from: string) =>
      `${from} is gifting you an Imbir Thai Spa certificate. The certificate with its code is in the attached PDF. Show it to the salon administrator when booking.`,
    buyerSubject: "Your Imbir Thai Spa certificate is paid",
    buyerTitle: "Thank you for your purchase!",
    buyerBody: (to: string) =>
      `Payment was successful. A copy of the certificate for “${to}” is in the attached PDF.`,
    reminderSubject: (days: number) =>
      `Your Imbir Thai Spa certificate expires in ${days} days`,
    reminderTitle: "Don't forget your gift 🌿",
    reminderBody: (days: number) =>
      `Your Imbir Thai Spa gift certificate is valid for ${days} more days. Book your visit and treat yourself to Thai relaxation — the certificate code is in the PDF sent earlier.`,
    recoverySubject: "You almost finished your gift 🌿",
    recoveryTitle: "Finish your order",
    recoveryBody: (to: string) =>
      `You started creating an Imbir Thai Spa gift certificate for “${to}” but didn't complete the payment. We saved your choices — pick up right where you left off in one tap.`,
    recoveryCta: "Continue my order",
    validUntil: "Valid until",
    footer:
      "Imbir Thai Spa · Thai massage & SPA salons · +7 708 111 8098 · spa@imbir.kz",
  },
} as const;

function layout(title: string, body: string, footer: string): string {
  // Инлайн-стили — почтовые клиенты не грузят внешний CSS
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f3f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
<tr><td style="background:#4D295D;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center">
<div style="color:#ffffff;font-size:22px;letter-spacing:2px">IMBIR <span style="color:#B69244">·</span> THAI SPA</div>
</td></tr>
<tr><td style="background:#ffffff;padding:32px;border:1px solid #ece4f0;border-top:none">
<h1 style="margin:0 0 14px;color:#4D295D;font-size:22px">${title}</h1>
<p style="margin:0;color:#2c1736;font-size:15px;line-height:1.6">${body}</p>
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;border:1px solid #ece4f0;border-top:1px solid #B69244;padding:18px 32px">
<p style="margin:0;color:#8f7335;font-size:12px;line-height:1.5">${footer}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

export type CertificateMailData = {
  locale: string;
  toName: string;
  fromName: string;
  validUntil: string;
};

function pick(locale: string) {
  return STRINGS[(locale as Locale) in STRINGS ? (locale as Locale) : "ru"];
}

export function recipientEmail(data: CertificateMailData): {
  subject: string;
  html: string;
} {
  const s = pick(data.locale);
  return {
    subject: s.recipientSubject,
    html: layout(
      s.recipientTitle,
      `${s.recipientBody(data.fromName)}<br/><br/><b>${s.validUntil}: ${data.validUntil}</b>`,
      s.footer,
    ),
  };
}

export function buyerEmail(data: CertificateMailData): {
  subject: string;
  html: string;
} {
  const s = pick(data.locale);
  return {
    subject: s.buyerSubject,
    html: layout(
      s.buyerTitle,
      `${s.buyerBody(data.toName)}<br/><br/><b>${s.validUntil}: ${data.validUntil}</b>`,
      s.footer,
    ),
  };
}

export function reminderEmail(data: {
  locale: string;
  daysLeft: number;
  validUntil: string;
}): { subject: string; html: string } {
  const s = pick(data.locale);
  return {
    subject: s.reminderSubject(data.daysLeft),
    html: layout(
      s.reminderTitle,
      `${s.reminderBody(data.daysLeft)}<br/><br/><b>${s.validUntil}: ${data.validUntil}</b>`,
      s.footer,
    ),
  };
}

/**
 * Письмо-дожим брошенного заказа (Фаза 2): покупатель не завершил оплату.
 * Ведёт на конструктор с предзаполнением из сохранённого заказа.
 */
export function recoveryEmail(data: {
  locale: string;
  toName: string;
  resumeUrl: string;
}): { subject: string; html: string } {
  const s = pick(data.locale);
  const button = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="border-radius:999px;background:#4D295D"><a href="${data.resumeUrl}" style="display:inline-block;padding:13px 30px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px">${s.recoveryCta} →</a></td></tr></table>`;
  return {
    subject: s.recoverySubject,
    html: layout(s.recoveryTitle, `${s.recoveryBody(data.toName)}${button}`, s.footer),
  };
}

/**
 * Текст WhatsApp-сообщения получателю (Фаза 2). Код в текст не пишем —
 * он в PDF и на защищённой странице по ссылке. Ссылка ведёт на страницу
 * сертификата (просмотр + скачивание PDF).
 */
export function whatsappRecipientText(data: {
  locale: string;
  fromName: string;
  validUntil: string;
  link: string;
}): string {
  const s = pick(data.locale);
  return `${s.recipientTitle}\n\n${s.recipientBody(data.fromName)}\n\n${s.validUntil}: ${data.validUntil}\n${data.link}`;
}

/** Служебное уведомление менеджеру — всегда на русском. */
export function managerEmail(data: {
  orderId: string;
  certDisplay: string;
  amountKzt: number;
  salon: string;
  buyerEmail: string;
}): { subject: string; html: string } {
  return {
    subject: `Новая продажа сертификата ${data.certDisplay} — ${data.amountKzt.toLocaleString("ru-RU")} ₸`,
    html: layout(
      "Продан сертификат",
      `Заказ: ${data.orderId}<br/>Сертификат: ${data.certDisplay}<br/>Сумма: ${data.amountKzt.toLocaleString("ru-RU")} ₸<br/>Филиал: ${data.salon}<br/>Покупатель: ${data.buyerEmail}`,
      STRINGS.ru.footer,
    ),
  };
}
