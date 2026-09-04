"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, auditLog } from "@/lib/admin/guard";
import { issueCertificateManually } from "@/lib/admin/manual-issue";

/**
 * Ручной выпуск сертификата из админки — форма «Выпустить сертификат».
 *
 * Проверки те же, что у покупателя: филиал, программа/номинал, дизайн, суммы
 * из базы. Отличий два — можно задать свой номер сертификата и можно указать,
 * сколько реально получено (ноль для подарка салона).
 */

const schema = z
  .object({
    salonId: z.coerce.number().int().positive(),
    kind: z.enum(["program", "nominal", "custom"]),
    programOptionId: z.coerce.number().int().positive().optional(),
    nominalId: z.coerce.number().int().positive().optional(),
    customAmountKzt: z.coerce.number().int().positive().optional(),
    designId: z.coerce.number().int().positive(),
    toName: z.string().trim().min(1).max(80),
    fromName: z.string().trim().min(1).max(80),
    message: z.string().trim().max(120).optional(),
    buyerEmail: z.string().trim().email(),
    buyerPhone: z.string().trim().max(32).optional(),
    recipientEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
    serial: z.string().trim().max(32).optional(),
    paidKzt: z.coerce.number().int().min(0),
    reference: z.string().trim().min(3).max(64),
    validMonths: z.coerce.number().int().min(1).max(60).optional(),
    syncToAltegio: z.coerce.boolean(),
    sendEmail: z.coerce.boolean(),
  })
  .refine((v) => v.kind !== "program" || !!v.programOptionId, {
    message: "Выберите программу и вариант",
  })
  .refine((v) => v.kind !== "nominal" || !!v.nominalId, {
    message: "Выберите номинал",
  })
  .refine((v) => v.kind !== "custom" || !!v.customAmountKzt, {
    message: "Укажите сумму",
  });

export async function issueManualAction(formData: FormData) {
  const admin = await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse({
    ...raw,
    // Чекбоксы приходят строкой "on" или не приходят вовсе
    syncToAltegio: formData.get("syncToAltegio") === "on",
    sendEmail: formData.get("sendEmail") === "on",
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Проверьте заполнение формы: не все поля верны.",
    };
  }
  const v = parsed.data;

  const result = await issueCertificateManually({
    salonId: v.salonId,
    item:
      v.kind === "program"
        ? { type: "program", programOptionId: v.programOptionId! }
        : v.kind === "nominal"
          ? { type: "nominal", nominalId: v.nominalId }
          : { type: "nominal", customAmountKzt: v.customAmountKzt },
    designId: v.designId,
    toName: v.toName,
    fromName: v.fromName,
    message: v.message,
    buyerEmail: v.buyerEmail,
    buyerPhone: v.buyerPhone || undefined,
    recipientEmail: v.recipientEmail || undefined,
    serial: v.serial || undefined,
    paidKzt: v.paidKzt,
    reference: v.reference,
    validMonths: v.validMonths,
    syncToAltegio: v.syncToAltegio,
    sendEmail: v.sendEmail,
    actor: admin.email,
  });

  if (!result.ok) return { error: result.error };

  await auditLog({
    actor: admin.email,
    action: "certificate.manual_issue",
    entity: "certificate",
    entityId: result.certificateId,
    diff: {
      order: result.orderId,
      serial: result.serial,
      reference: v.reference,
      paidKzt: v.paidKzt,
      altegio: result.altegio,
      sendEmail: v.sendEmail,
    },
  });
  revalidatePath("/admin/orders");
  revalidatePath("/admin/certificates");

  // Про Altegio говорим прямо: «выпущено» без этого читается как «всё готово»,
  // а кассир такой сертификат не найдёт.
  const crm =
    result.altegio === "synced"
      ? "Записан в Altegio."
      : result.altegio === "failed"
        ? "⚠ В Altegio НЕ записан — откройте сертификат и посмотрите причину."
        : "В Altegio не писали (как и просили).";

  return {
    ok: true,
    message:
      `Сертификат ${result.serial ?? result.certificateId} выпущен. ${crm}` +
      (v.sendEmail ? " Письмо поставлено в отправку." : " Письмо не отправляли."),
  };
}
