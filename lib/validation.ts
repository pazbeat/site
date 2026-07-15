import { z } from "zod";

/** Валидация всех API-входов на сервере — обязательна (PRD §9.1). */

const name = z.string().trim().min(1).max(80);
// Телефон Казахстана в свободном формате: +7 700 123 45 67 / 87001234567
const phone = z
  .string()
  .trim()
  .regex(/^\+?[78][\d\s()-]{9,14}$/, "invalid phone");

export const orderItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("program"),
    programOptionId: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("nominal"),
    nominalId: z.number().int().positive().optional(),
    customAmountKzt: z.number().int().positive().optional(),
  }),
]);

export const orderSchema = z
  .object({
    salonId: z.number().int().positive(),
    item: orderItemSchema,
    designId: z.number().int().positive(),
    toName: name,
    fromName: name,
    /// Поздравление ≤ 120 символов (PRD §5.1)
    message: z.string().trim().max(120).optional().default(""),
    delivery: z.object({
      method: z.enum(["email", "whatsapp"]),
      contact: z.string().trim().min(1).max(120),
      /// ISO-строка; интерпретируется в Asia/Almaty
      scheduledAt: z.iso.datetime({ offset: true }).optional(),
    }),
    buyerEmail: z.email(),
    buyerPhone: phone.optional(),
    /// Промокод (Фаза 2); скидка пересчитывается на сервере
    promoCode: z.string().trim().max(40).optional(),
    provider: z.enum(["kaspi", "freedom", "forte"]).optional(),
    locale: z.enum(["ru", "kk", "en"]).default("ru"),
    /// Без явного согласия заказ не создаётся (PRD §5.2)
    consentAccepted: z.literal(true),
  })
  .superRefine((data, ctx) => {
    if (data.item.type === "nominal") {
      const { nominalId, customAmountKzt } = data.item;
      if (!nominalId && !customAmountKzt) {
        ctx.addIssue({
          code: "custom",
          path: ["item"],
          message: "nominalId or customAmountKzt is required",
        });
      }
    }
    if (data.delivery.method === "email") {
      const email = z.email().safeParse(data.delivery.contact);
      if (!email.success) {
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "contact"],
          message: "invalid email",
        });
      }
    } else {
      const parsed = phone.safeParse(data.delivery.contact);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "contact"],
          message: "invalid phone",
        });
      }
    }
  });

export type OrderInput = z.infer<typeof orderSchema>;

/** Превью промокода в конструкторе: тот же выбор позиции + код. */
export const promoValidateSchema = z.object({
  salonId: z.number().int().positive(),
  item: orderItemSchema,
  promoCode: z.string().trim().min(1).max(40),
});

export const checkSchema = z.object({
  code: z.string().trim().min(8).max(20),
});

export const corporateSchema = z.object({
  company: z.string().trim().min(1).max(120),
  contact: z.string().trim().min(1).max(160),
  /// Корпоративные заказы — от 10 сертификатов
  qty: z.number().int().min(10).max(10_000),
  comment: z.string().trim().max(1000).optional().default(""),
});
