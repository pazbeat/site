"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, auditLog } from "@/lib/admin/guard";

/**
 * Управление отложенными доставками (Фаза 2). Перенос — правка scheduledAt
 * (sweeper развезёт по наступлении). Отправка сейчас — немедленная очередь.
 */

export async function sendNowAction(formData: FormData) {
  const admin = await requireAdmin();
  const certificateId = String(formData.get("certificateId") ?? "");
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
  });
  if (!cert) return { error: "Сертификат не найден." };
  if (cert.sentAt) return { error: "Уже отправлен." };

  try {
    const { enqueueDelivery } = await import("@/lib/queue");
    await enqueueDelivery(cert.id, null);
  } catch {
    const { deliverCertificate } = await import("@/lib/delivery");
    await deliverCertificate(cert.id);
  }
  await auditLog({
    actor: admin.email,
    action: "certificate.send_now",
    entity: "certificate",
    entityId: cert.id,
  });
  revalidatePath("/admin/scheduled");
  return { ok: true };
}

const rescheduleSchema = z.object({
  certificateId: z.string().min(1),
  // datetime-local: YYYY-MM-DDTHH:mm
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});

export async function rescheduleAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = rescheduleSchema.safeParse({
    certificateId: formData.get("certificateId"),
    scheduledAt: formData.get("scheduledAt"),
  });
  if (!parsed.success) return { error: "Проверьте дату." };

  const cert = await prisma.certificate.findUnique({
    where: { id: parsed.data.certificateId },
  });
  if (!cert) return { error: "Сертификат не найден." };
  if (cert.sentAt) return { error: "Уже отправлен." };

  // datetime-local → момент в Asia/Almaty (UTC+5)
  const scheduledAt = new Date(`${parsed.data.scheduledAt}:00+05:00`);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { error: "Некорректная дата." };
  }

  await prisma.certificate.update({
    where: { id: cert.id },
    data: { scheduledAt },
  });
  await auditLog({
    actor: admin.email,
    action: "certificate.reschedule",
    entity: "certificate",
    entityId: cert.id,
    diff: { scheduledAt: scheduledAt.toISOString() },
  });
  revalidatePath("/admin/scheduled");
  return { ok: true };
}
