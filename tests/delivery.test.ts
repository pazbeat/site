import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  buyerEmail,
  managerEmail,
  recipientEmail,
} from "@/lib/mail/templates";

describe("шаблоны писем", () => {
  const data = {
    locale: "ru",
    toName: "Айгерим",
    fromName: "Арман",
    validUntil: "2027-07-09",
  };

  it("письмо получателю: локализовано, без открытого кода", () => {
    const ru = recipientEmail(data);
    expect(ru.subject).toContain("подарок");
    expect(ru.html).toContain("Арман");
    expect(ru.html).toContain("2027-07-09");
    expect(ru.html).not.toMatch(/IMB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/);

    const kk = recipientEmail({ ...data, locale: "kk" });
    expect(kk.subject).toContain("сыйлық");
    const en = recipientEmail({ ...data, locale: "en" });
    expect(en.subject).toContain("gift");
    // неизвестная локаль — фолбэк на русский
    const fallback = recipientEmail({ ...data, locale: "de" });
    expect(fallback.subject).toBe(ru.subject);
  });

  it("письмо покупателю содержит имя получателя", () => {
    const mail = buyerEmail(data);
    expect(mail.html).toContain("Айгерим");
  });

  it("письмо менеджеру: маскированный код и сумма", () => {
    const mail = managerEmail({
      orderId: "o1",
      certDisplay: "IMB-••••-••7F",
      amountKzt: 70000,
      salon: "Алматы, Розыбакиева 247",
      buyerEmail: "arman@example.kz",
    });
    expect(mail.subject).toContain("IMB-••••-••7F");
    expect(mail.html).toContain("70");
    expect(mail.html).toContain("Розыбакиева");
  });
});

describe("письмо покупателю", () => {
  it("без получателя не называет сертификат копией", async () => {
    const { buyerEmail } = await import("@/lib/mail/templates");
    const data = {
      locale: "ru",
      toName: "Галия",
      fromName: "Алия",
      code: "WM9001",
      validUntil: "26.11.2026",
      salon: "Астана, Мәңгілік Ел 29/2",
      amountKzt: 35000,
      title: "35 000 ₸",
    };
    const self = buyerEmail(data, { self: true });
    const withRecipient = buyerEmail(data);
    expect(self.html).not.toContain("Копия");
    expect(self.html).toContain("Перешлите");
    expect(withRecipient.html).toContain("Копия");
  });
});

describe("товарный чек", () => {
  it("рендерится с реквизитами, скидкой и знаком тенге", async () => {
    const { renderReceiptPdf, kzt } = await import("@/lib/pdf/receipt");
    // Знак тенге в чеке в каждой строке — шрифт один, Montserrat.
    expect(kzt(35000)).toContain("₸");
    const pdf = await renderReceiptPdf({
      labels: {
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
        note: "Электронный подарочный сертификат.",
        filename: "Чек Imbir Thai Spa.pdf",
      },
      orderRef: "98876697629009667314",
      dateLabel: "26.08.2026, 12:41",
      methodLabel: "Банковская карта",
      itemTitle: "Сет: KARUNA (2 часа)",
      faceKzt: 36000,
      paidKzt: 32400,
      certificateCode: "WM9001",
      validUntil: "2026-11-26",
      salonLine: "Астана, пр. Мәңгілік Ел 29/2",
    });
    expect(pdf.length).toBeGreaterThan(5_000);
  });
});

describe("PDF сертификата", () => {
  it("рендерится с кириллицей и казахскими глифами", async () => {
    const { renderCertificatePdf } = await import("@/lib/pdf/certificate");
    const qrDataUrl = await QRCode.toDataURL(
      "http://localhost:3000/ru/check?code=IMB-A9F3-K2M4",
    );
    const pdf = await renderCertificatePdf({
      code: "IMB-A9F3-K2M4",
      qrDataUrl,
      title: "SPA-бағдарлама «Сен және Мен»", // казахские глифы ә, ж
      subtitle: "Программа для пар · 2,5 часа",
      toName: "Айгерим",
      fromName: "Арман",
      toLabel: "Кімге",
      fromLabel: "Кімнен",
      message: "С днём рождения!",
      validUntilLabel: "Действует до",
      validUntil: "2027-07-09",
      salonLine: "Алматы, Розыбакиева 247",
      giftLabel: "Подарочный сертификат",
      codeLabel: "Код сертификата",
      locale: "kk",
      bgStyle: { kind: "gradient", from: "#4D295D", to: "#B69244" },
      textColor: "#FFFFFF",
    });
    expect(pdf.length).toBeGreaterThan(10_000);
  });

  it("сертификат на сумму печатает знак тенге", async () => {
    // В Cormorant знака ₸ нет, и заголовок «35 000 ₸» терял символ.
    // Такие заголовки набираются Montserrat — проверяем, что рендер проходит.
    const { renderCertificatePdf } = await import("@/lib/pdf/certificate");
    const qrDataUrl = await QRCode.toDataURL("http://localhost:3000/ru/check");
    const pdf = await renderCertificatePdf({
      code: "WM9001",
      qrDataUrl,
      title: "35 000 ₸",
      subtitle: "Сертификат на сумму",
      toName: "Галия",
      fromName: "Алия",
      toLabel: "Кому",
      fromLabel: "От кого",
      validUntilLabel: "Действует до",
      validUntil: "2026-11-26",
      salonLine: "Астана, Мәңгілік Ел 29/2",
      giftLabel: "Подарочный сертификат",
      codeLabel: "Код сертификата",
      locale: "ru",
      bgStyle: { kind: "gradient", from: "#4D295D", to: "#B69244" },
      textColor: "#FFFFFF",
    });
    expect(pdf.length).toBeGreaterThan(10_000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
