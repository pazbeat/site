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
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
