import { describe, expect, it } from "vitest";
import {
  buyerEmail,
  managerEmail,
  recipientEmail,
  recoveryEmail,
  whatsappRecipientText,
} from "../lib/mail/templates";

/**
 * «От кого» в конструкторе необязательно (решение заказчика 2026-09-11).
 * Без подписи письмо получателю не должно начинаться с пустого имени —
 * « дарит вам сертификат» читается как ошибка.
 */
const base = { toName: "Айгерим", validUntil: "2026-12-11" };

describe("письмо получателю: подпись «от кого»", () => {
  it("с подписью называет дарителя", () => {
    const { html } = recipientEmail({ ...base, locale: "ru", fromName: "Алия" });
    expect(html).toContain("Алия дарит вам сертификат");
  });

  it("без подписи — «Вам подарили», без пустого имени", () => {
    for (const locale of ["ru", "kk", "en"]) {
      const { html } = recipientEmail({ ...base, locale, fromName: "" });
      expect(html, locale).not.toMatch(/>\s*(дарит|сізге Imbir|is gifting)/);
    }
    expect(recipientEmail({ ...base, locale: "ru", fromName: "" }).html).toContain(
      "Вам подарили сертификат Imbir Thai Spa",
    );
    expect(recipientEmail({ ...base, locale: "en", fromName: "" }).html).toContain(
      "You've been gifted an Imbir Thai Spa certificate",
    );
  });

  it("то же в тексте для мессенджера", () => {
    const text = whatsappRecipientText({
      ...base,
      locale: "ru",
      fromName: "",
      link: "https://example.kz/s",
    });
    expect(text).toContain("Вам подарили сертификат");
    expect(text).not.toMatch(/\n\s+дарит/);
  });
});

describe("письма: имена из формы не становятся разметкой", () => {
  const evil = '<a href="https://evil.example">Нажмите</a><img src=x onerror=alert(1)>';

  it("«от кого» в письме получателю экранируется", () => {
    const { html } = recipientEmail({ ...base, locale: "ru", fromName: evil });
    expect(html).not.toContain('<a href="https://evil.example"');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });

  it("«кому» в письме покупателю и в дожиме экранируется", () => {
    const buyer = buyerEmail({ ...base, locale: "ru", toName: evil, fromName: "Алия" });
    expect(buyer.html).not.toContain("<img");
    expect(buyer.html).toContain("&lt;img");
    const rec = recoveryEmail({ locale: "ru", toName: evil, resumeUrl: "https://new.imbir.kz/ru/create?resume=a&b=1" });
    expect(rec.html).not.toContain("<img");
    // В ссылке «&» экранирован — так и положено внутри атрибута
    expect(rec.html).toContain('href="https://new.imbir.kz/ru/create?resume=a&amp;b=1"');
  });

  it("почта покупателя в уведомлении менеджеру экранируется", () => {
    const { html } = managerEmail({
      orderId: "o1",
      certDisplay: "WM9001",
      amountKzt: 50000,
      salon: "Астана",
      buyerEmail: "x<script>@mail.kz",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("x&lt;script&gt;@mail.kz");
  });

  it("текст для мессенджера остаётся как есть — там разметки нет", () => {
    const text = whatsappRecipientText({ locale: "ru", fromName: "Том & Джерри", validUntil: "2026-12-11", link: "https://x.kz" });
    expect(text).toContain("Том & Джерри дарит вам");
  });
});
