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


const settingsSchema = z.object({
  enabled: z.boolean(),
  /// Числовой ID чата/группы Telegram (бот должен состоять в чате)
  telegramChatId: z
    .string()
    .trim()
    .regex(/^-?\d*$/, "invalid chat id")
    .max(20),
  /// Тема в группе Telegram; пусто — сообщение уйдёт в General
  telegramThreadId: z.string().trim().regex(/^\d*$/, "invalid thread").max(20),
  /// Адреса через запятую; пусто — берём MANAGER_EMAIL из env
  email: z.string().trim().max(200),
});

export async function saveNotifySettingsAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    telegramChatId: formData.get("telegramChatId") ?? "",
    telegramThreadId: formData.get("telegramThreadId") ?? "",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) {
    return {
      error: "Проверьте поля: ID чата и ID темы — только цифры.",
    };
  }
  const emails = parsed.data.email
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter(Boolean);
  const badEmail = emails.find((a) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
  if (badEmail) {
    return { error: `Не похоже на адрес почты: ${badEmail}` };
  }
  if (parsed.data.enabled && !parsed.data.telegramChatId && emails.length === 0) {
    return {
      error:
        "Укажите ID чата Telegram или адрес почты — иначе уведомлению некуда идти.",
    };
  }

  const value = {
    enabled: parsed.data.enabled,
    telegramChatId: parsed.data.telegramChatId || undefined,
    telegramThreadId: parsed.data.telegramThreadId || undefined,
    email: emails.join(", ") || undefined,
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
  if (!cfg.telegramChatId) {
    return { error: "Сначала укажите Telegram — других каналов нет." };
  }
  const text = buildSaleMessage({
    amountKzt: 18000,
    itemLabel: "ТЕСТОВОЕ УВЕДОМЛЕНИЕ — продажи не было",
    salonLine: "Проверка каналов из админки",
    toName: admin.email,
    serial: null,
    orderId: "test",
  });
  const errors = await sendToChannels(cfg, text);
  if (errors.length > 0) {
    return { error: `Не доставлено: ${errors.join("; ")}` };
  }
  return { ok: true, message: "Тестовое уведомление отправлено." };
}
