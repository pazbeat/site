"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import { createBackup, deleteBackup, restoreBackup } from "@/lib/backup";

export async function createBackupAction() {
  const admin = await requireSuperadmin();
  try {
    const info = await createBackup();
    await auditLog({
      actor: admin.email,
      action: "backup.create",
      entity: "backup",
      entityId: info.name,
      diff: { sizeBytes: info.sizeBytes, hasUploads: info.hasUploads },
    });
    revalidatePath("/admin/backup");
    return {
      ok: true,
      message: `Бэкап ${info.name} создан (${Math.round(info.sizeBytes / 1024)} КБ). Скачайте копию и храните вне сервера.`,
    };
  } catch (error) {
    return {
      error: `Не получилось создать бэкап: ${error instanceof Error ? error.message : error}`,
    };
  }
}

export async function restoreBackupAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const name = String(formData.get("name") ?? "");
  try {
    await restoreBackup(name);
    await auditLog({
      actor: admin.email,
      action: "backup.restore",
      entity: "backup",
      entityId: name,
    });
    revalidatePath("/admin/backup");
    return {
      ok: true,
      message: `База восстановлена из ${name}. Проверьте данные в разделах админки.`,
    };
  } catch (error) {
    return {
      error: `Восстановление не удалось: ${error instanceof Error ? error.message : error}`,
    };
  }
}

export async function deleteBackupAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const name = String(formData.get("name") ?? "");
  try {
    await deleteBackup(name);
    await auditLog({
      actor: admin.email,
      action: "backup.delete",
      entity: "backup",
      entityId: name,
    });
    revalidatePath("/admin/backup");
    return { ok: true, message: `Бэкап ${name} удалён.` };
  } catch (error) {
    return {
      error: `Не получилось удалить: ${error instanceof Error ? error.message : error}`,
    };
  }
}
