"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, auditLog } from "@/lib/admin/guard";
import { redeemCertificate } from "@/lib/admin/redemption";

const redeemSchema = z.object({
  certificateId: z.string().min(1),
  amountKzt: z.coerce.number().int().positive(),
  salonId: z.coerce.number().int().positive().optional(),
  comment: z.string().trim().max(500).optional(),
});

export async function redeemAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = redeemSchema.safeParse({
    certificateId: formData.get("certificateId"),
    amountKzt: formData.get("amountKzt"),
    salonId: formData.get("salonId") || undefined,
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) return { error: "Проверьте сумму погашения." };

  const result = await redeemCertificate({
    certificateId: parsed.data.certificateId,
    amountKzt: parsed.data.amountKzt,
    salonId: parsed.data.salonId ?? null,
    actor: admin.email,
    comment: parsed.data.comment,
  });
  if (!result.ok) return { error: `Не удалось погасить: ${result.error}` };

  await auditLog({
    actor: admin.email,
    action: "certificate.redeem",
    entity: "certificate",
    entityId: parsed.data.certificateId,
    diff: { amountKzt: parsed.data.amountKzt, balanceAfter: result.balanceKzt },
  });
  revalidatePath(`/admin/orders`);
  return { ok: true };
}

const extendSchema = z.object({
  certificateId: z.string().min(1),
  months: z.coerce.number().int().min(1).max(60),
});

export async function extendAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = extendSchema.safeParse({
    certificateId: formData.get("certificateId"),
    months: formData.get("months"),
  });
  if (!parsed.success) return { error: "Проверьте срок продления." };

  const cert = await prisma.certificate.findUnique({
    where: { id: parsed.data.certificateId },
  });
  if (!cert) return { error: "Сертификат не найден." };

  const base = cert.validUntil > new Date() ? cert.validUntil : new Date();
  const validUntil = new Date(base);
  validUntil.setMonth(validUntil.getMonth() + parsed.data.months);
  const status = cert.status === "expired" ? "active" : cert.status;

  await prisma.certificate.update({
    where: { id: cert.id },
    data: { validUntil, status },
  });
  await auditLog({
    actor: admin.email,
    action: "certificate.extend",
    entity: "certificate",
    entityId: cert.id,
    diff: { months: parsed.data.months, validUntil: validUntil.toISOString() },
  });
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function blockAction(formData: FormData) {
  const admin = await requireAdmin();
  const certificateId = String(formData.get("certificateId") ?? "");
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
  });
  if (!cert) return { error: "Сертификат не найден." };

  const nextBlocked = cert.status !== "blocked";
  await prisma.certificate.update({
    where: { id: cert.id },
    data: {
      status: nextBlocked
        ? "blocked"
        : cert.balanceKzt === cert.amountKzt
          ? "active"
          : "partially_used",
    },
  });
  await auditLog({
    actor: admin.email,
    action: nextBlocked ? "certificate.block" : "certificate.unblock",
    entity: "certificate",
    entityId: cert.id,
  });
  revalidatePath("/admin/orders");
  return { ok: true };
}

/**
 * Возврат: сертификат гасится в ноль со статусом refunded, заказ уходит из
 * оплаченных — значит и из выручки в отчётах. Деньги возвращает менеджер
 * на стороне банка/Kaspi, здесь фиксируем факт.
 */
export async function refundAction(formData: FormData) {
  const admin = await requireAdmin();
  const certificateId = String(formData.get("certificateId") ?? "");
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
  });
  if (!cert) return { error: "Сертификат не найден." };
  if (cert.status === "refunded") return { error: "Возврат уже оформлен." };
  if (cert.status === "used") {
    return { error: "Сертификат уже погашен — возврат невозможен." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.certificate.update({
      where: { id: cert.id },
      data: { status: "refunded", balanceKzt: 0 },
    });
    // Заказ может нести несколько сертификатов — снимаем с оплаты только
    // когда возвращены все
    const left = await tx.certificate.count({
      where: { orderId: cert.orderId, status: { not: "refunded" } },
    });
    if (left === 0) {
      await tx.order.update({
        where: { id: cert.orderId },
        data: { status: "refunded" },
      });
    }
  });

  await auditLog({
    actor: admin.email,
    action: "certificate.refund",
    entity: "certificate",
    entityId: cert.id,
    diff: { balanceBefore: cert.balanceKzt, statusBefore: cert.status },
  });
  revalidatePath("/admin/orders");
  return { ok: true };
}

const ACTION_LABEL: Record<string, string> = {
  noop: "Совпадает с Altegio — изменений нет.",
  missing: "Сертификата нет в Altegio! Проверьте CRM: возможно, продажа удалена.",
};

/** Ручная сверка с Altegio — не ждать крона (раз в 15 минут). */
export async function syncAltegioAction(formData: FormData) {
  const admin = await requireAdmin();
  const certificateId = String(formData.get("certificateId") ?? "");
  const { syncOneCertificate } = await import("@/lib/altegio/redemptions");
  const result = await syncOneCertificate(certificateId);

  if (!result.ok) {
    const human: Record<string, string> = {
      altegio_not_configured: "Altegio не настроен (нет токенов в env).",
      not_issued_in_altegio: "Сертификат не выпускался в Altegio — сверять нечего.",
      code_unavailable: "Код сертификата недоступен.",
      not_found: "Сертификат не найден.",
    };
    return { error: human[result.error] ?? `Altegio: ${result.error}` };
  }

  const { action, applied } = result;
  await auditLog({
    actor: admin.email,
    action: "certificate.altegio_sync",
    entity: "certificate",
    entityId: certificateId,
    diff: { action, applied },
  });
  revalidatePath("/admin/orders");

  if (action.kind === "sync") {
    const verb = action.redeemedKzt > 0 ? "погашено" : "возвращено на баланс";
    const body = `Из Altegio: ${verb} ${Math.abs(action.redeemedKzt)} ₸, остаток ${action.balanceKzt} ₸.`;
    return {
      ok: true,
      message: applied
        ? body
        : `${body} НЕ применено: тест-режим Altegio (ALTEGIO_TEST=1) — там у сертификата баланс фолбэк-товара, а не наш номинал.`,
    };
  }
  if (action.kind === "skip") {
    return { ok: true, message: `Статус «${action.reason}» выставлен вручную — CRM его не меняет.` };
  }
  return { ok: true, message: ACTION_LABEL[action.kind] };
}

/**
 * Ручной выпуск сертификата: покупатель оплатил (прислал чек), но заказ
 * повис pending/expired — вебхука у Kaspi нет, поллер мог не добрать.
 * Помечает заказ оплаченным и выпускает сертификат тем же путём, что и
 * автоматика (fulfillOrder идемпотентен, второй сертификат не появится).
 */
export async function manualFulfillAction(formData: FormData) {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Заказ не найден." };
  if (order.status === "paid") {
    return { error: "Заказ уже оплачен — сертификат выпущен автоматикой." };
  }
  if (order.status !== "pending" && order.status !== "expired") {
    return { error: `Заказ в статусе «${order.status}» — выпуск невозможен.` };
  }

  const { fulfillOrder } = await import("@/lib/certificates");
  const result = await fulfillOrder(order.id, `manual:${admin.email}`);
  if (result.status !== "fulfilled") {
    return { error: `Не получилось выпустить: ${result.status}.` };
  }

  await auditLog({
    actor: admin.email,
    action: "order.manual_fulfill",
    entity: "order",
    entityId: order.id,
    diff: { statusBefore: order.status, certificateId: result.certificateId },
  });
  revalidatePath("/admin/orders");
  return {
    ok: true,
    message: "Сертификат выпущен и поставлен в доставку получателю.",
  };
}

const editCertSchema = z.object({
  certificateId: z.string().min(1),
  toName: z.string().trim().min(1).max(80),
  fromName: z.string().trim().min(1).max(80),
  /// Лимит поздравления как в конструкторе (PRD §5.1)
  message: z.string().trim().max(120),
  deliveryContact: z.string().trim().min(1).max(120),
});

/**
 * Правка персонализации выпущенного сертификата (опечатка в имени, новый
 * текст поздравления, неверный контакт доставки). PDF собирается из БД при
 * каждой отправке/скачивании, поэтому после правки достаточно нажать
 * «Отправить повторно» — уйдёт уже исправленная версия.
 */
export async function editCertAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = editCertSchema.safeParse({
    certificateId: formData.get("certificateId"),
    toName: formData.get("toName"),
    fromName: formData.get("fromName"),
    message: formData.get("message") ?? "",
    deliveryContact: formData.get("deliveryContact"),
  });
  if (!parsed.success) {
    return { error: "Проверьте поля: имена до 80 символов, поздравление до 120." };
  }

  const cert = await prisma.certificate.findUnique({
    where: { id: parsed.data.certificateId },
  });
  if (!cert) return { error: "Сертификат не найден." };

  const data = {
    toName: parsed.data.toName,
    fromName: parsed.data.fromName,
    message: parsed.data.message || null,
    deliveryContact: parsed.data.deliveryContact,
  };
  await prisma.certificate.update({ where: { id: cert.id }, data });

  await auditLog({
    actor: admin.email,
    action: "certificate.edit",
    entity: "certificate",
    entityId: cert.id,
    diff: {
      before: {
        toName: cert.toName,
        fromName: cert.fromName,
        message: cert.message,
        deliveryContact: cert.deliveryContact,
      },
      after: data,
    },
  });
  revalidatePath("/admin/orders");
  return {
    ok: true,
    message:
      "Сохранено. Чтобы получатель увидел исправленный PDF — нажмите «Отправить повторно».",
  };
}

export async function resendAction(formData: FormData) {
  const admin = await requireAdmin();
  const certificateId = String(formData.get("certificateId") ?? "");
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
  });
  if (!cert) return { error: "Сертификат не найден." };

  // Сбрасываем sentAt и ставим доставку заново в очередь
  await prisma.certificate.update({
    where: { id: cert.id },
    data: { sentAt: null },
  });
  try {
    const { enqueueDelivery } = await import("@/lib/queue");
    await enqueueDelivery(cert.id, null);
  } catch {
    const { deliverCertificate } = await import("@/lib/delivery");
    await deliverCertificate(cert.id);
  }
  await auditLog({
    actor: admin.email,
    action: "certificate.resend",
    entity: "certificate",
    entityId: cert.id,
  });
  revalidatePath("/admin/orders");
  return { ok: true };
}
