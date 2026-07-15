"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import {
  buildSaleMessage,
  getSaleNotifySettings,
  sendToChannels,
} from "@/lib/notify";

const phone = z
  .string()
  .trim()
  .regex(/^\+?[78][\d\s()-]{9,14}$/, "invalid phone")
  .or(z.literal(""));

const settingsSchema = z.object({
  enabled: z.boolean(),
  whatsapp: phone,
  /// Числовой ID чата/группы Telegram (бот должен состоять в чате)
  telegramChatId: z
    .string()
    .trim()
    .regex(/^-?\d*$/, "invalid chat id")
    .max(20),
});

export async function saveNotifySettingsAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    whatsapp: formData.get("whatsapp") ?? "",
    telegramChatId: formData.get("telegramChatId") ?? "",
  });
  if (!parsed.success) {
    return {
      error:
        "Проверьте поля: WhatsApp — казахстанский номер (+7…), Telegram — числовой ID чата.",
    };
  }
  if (
    parsed.data.enabled &&
    !parsed.data.whatsapp &&
    !parsed.data.telegramChatId
  ) {
    return { error: "Укажите хотя бы один канал — WhatsApp или Telegram." };
  }

  const value = {
    enabled: parsed.data.enabled,
    whatsapp: parsed.data.whatsapp || undefined,
    telegramChatId: parsed.data.telegramChatId || undefined,
  };
  await prisma.setting.upsert({
    where: { key: "sale_notifications" },
    update: { value },
    create: { key: "sale_notifications", value },
  });
  await auditLog({
    actor: admin.email,
    action: "settings.sale_notifications",
    entity: "setting",
    entityId: "sale_notifications",
    diff: value,
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Настройки уведомлений сохранены." };
}

/** Тестовое уведомление по текущим сохранённым настройкам. */
export async function testNotifyAction() {
  const admin = await requireSuperadmin();
  const cfg = await getSaleNotifySettings();
  if (!cfg.whatsapp && !cfg.telegramChatId) {
    return { error: "Сначала сохраните хотя бы один канал." };
  }
  const text = buildSaleMessage({
    amountKzt: 18000,
    itemLabel: "ТЕСТОВОЕ УВЕДОМЛЕНИЕ — продажи не было",
    salonLine: "Проверка каналов из админки",
    toName: admin.email,
    deliveryLine: "—",
    serial: null,
    orderId: "test",
  });
  const errors = await sendToChannels(cfg, text);
  if (errors.length > 0) {
    return { error: `Не доставлено: ${errors.join("; ")}` };
  }
  return { ok: true, message: "Тестовое уведомление отправлено." };
}
