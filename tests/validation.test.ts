import { describe, expect, it } from "vitest";
import { checkSchema, corporateSchema, orderSchema } from "@/lib/validation";

const baseOrder = {
  salonId: 1,
  item: { type: "program", programOptionId: 10 },
  designId: 1,
  toName: "Айгерим",
  fromName: "Арман",
  message: "С днём рождения!",
  delivery: { method: "email", contact: "aigerim@mail.kz" },
  buyerEmail: "arman@mail.kz",
  consentAccepted: true,
};

describe("orderSchema", () => {
  it("принимает валидный программный заказ", () => {
    expect(orderSchema.safeParse(baseOrder).success).toBe(true);
  });

  it("принимает номинал с nominalId и с customAmountKzt", () => {
    expect(
      orderSchema.safeParse({
        ...baseOrder,
        item: { type: "nominal", nominalId: 2 },
      }).success,
    ).toBe(true);
    expect(
      orderSchema.safeParse({
        ...baseOrder,
        item: { type: "nominal", customAmountKzt: 25_000 },
      }).success,
    ).toBe(true);
  });

  it("отклоняет номинал без суммы и без id", () => {
    expect(
      orderSchema.safeParse({ ...baseOrder, item: { type: "nominal" } })
        .success,
    ).toBe(false);
  });

  it("без consentAccepted=true заказ не проходит (PRD §5.2)", () => {
    expect(
      orderSchema.safeParse({ ...baseOrder, consentAccepted: false }).success,
    ).toBe(false);
    const withoutConsent: Record<string, unknown> = { ...baseOrder };
    delete withoutConsent.consentAccepted;
    expect(orderSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it("поздравление длиннее 120 символов отклоняется (PRD §5.1)", () => {
    expect(
      orderSchema.safeParse({ ...baseOrder, message: "х".repeat(121) })
        .success,
    ).toBe(false);
  });

  it("для email-доставки контакт должен быть email", () => {
    expect(
      orderSchema.safeParse({
        ...baseOrder,
        delivery: { method: "email", contact: "не-email" },
      }).success,
    ).toBe(false);
  });

  it("доставка в WhatsApp больше не принимается", () => {
    // Канал отключён вместе с ChatApp: заказ с method=whatsapp должен
    // отвергаться, иначе покупатель выбрал бы способ, который не работает.
    expect(
      orderSchema.safeParse({
        ...baseOrder,
        delivery: { method: "whatsapp", contact: "+7 708 111 80 98" },
      }).success,
    ).toBe(false);
  });

  it("отложенная доставка требует ISO-дату со смещением", () => {
    expect(
      orderSchema.safeParse({
        ...baseOrder,
        delivery: {
          method: "email",
          contact: "a@b.kz",
          scheduledAt: "2026-03-08T09:00:00+05:00",
        },
      }).success,
    ).toBe(true);
    expect(
      orderSchema.safeParse({
        ...baseOrder,
        delivery: { method: "email", contact: "a@b.kz", scheduledAt: "завтра" },
      }).success,
    ).toBe(false);
  });
});

describe("checkSchema", () => {
  it("принимает код и отклоняет мусор", () => {
    expect(checkSchema.safeParse({ code: "IMB-A9F3-K2M4" }).success).toBe(true);
    expect(checkSchema.safeParse({ code: "" }).success).toBe(false);
    expect(checkSchema.safeParse({}).success).toBe(false);
  });
});

describe("corporateSchema", () => {
  const base = {
    company: "ТОО «Ромашка»",
    contact: "hr@romashka.kz",
    qty: 25,
    consentAccepted: true as const,
  };

  it("принимает валидную заявку", () => {
    expect(corporateSchema.safeParse(base).success).toBe(true);
  });

  it("отклоняет нулевое количество и пустую компанию", () => {
    expect(corporateSchema.safeParse({ ...base, company: "" }).success).toBe(false);
    expect(corporateSchema.safeParse({ ...base, qty: 0 }).success).toBe(false);
  });

  it("корпоративный минимум — 10 сертификатов", () => {
    expect(corporateSchema.safeParse({ ...base, qty: 9 }).success).toBe(false);
    expect(corporateSchema.safeParse({ ...base, qty: 10 }).success).toBe(true);
  });

  // Форма собирает контакт живого человека — это персональные данные, и
  // принимать их без записанного согласия нельзя, как и в заказе.
  it("без согласия заявка не принимается", () => {
    const { consentAccepted: _omit, ...withoutConsent } = base;
    expect(corporateSchema.safeParse(withoutConsent).success).toBe(false);
    expect(
      corporateSchema.safeParse({ ...base, consentAccepted: false }).success,
    ).toBe(false);
  });

  it("язык по умолчанию русский", () => {
    const parsed = corporateSchema.safeParse(base);
    expect(parsed.success && parsed.data.locale).toBe("ru");
  });
});
