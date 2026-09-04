"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, auditLog } from "@/lib/admin/guard";
import { runReconcile } from "@/lib/reconcile";

/**
 * Прогнать сверку прямо сейчас, не дожидаясь расписания.
 *
 * Кнопка нужна не для красоты: расхождение обычно замечают в момент разговора
 * с покупателем («мне не пришёл сертификат»), и ждать десять минут до
 * очередного прохода в этот момент невыносимо.
 */
export async function runReconcileAction() {
  const admin = await requireAdmin();
  try {
    const result = await runReconcile();
    await auditLog({
      actor: admin.email,
      action: "reconcile.run",
      entity: "reconcile",
      entityId: new Date().toISOString().slice(0, 19),
      diff: {
        repairedCertificates: result.repairedCertificates,
        syncedToAltegio: result.syncedToAltegio,
        delivered: result.delivered,
        remaining: result.remaining.length,
      },
    });
    revalidatePath("/admin/reconcile");

    const done = [
      result.repairedCertificates > 0
        ? `выпущено сертификатов: ${result.repairedCertificates}`
        : null,
      result.syncedToAltegio > 0
        ? `записано в Altegio: ${result.syncedToAltegio}`
        : null,
      result.delivered > 0 ? `доставлено: ${result.delivered}` : null,
    ].filter(Boolean);

    return {
      ok: true,
      message:
        done.length > 0
          ? `Сверка прошла — ${done.join(", ")}. Осталось расхождений: ${result.remaining.length}.`
          : result.remaining.length === 0
            ? "Сверка прошла: расхождений нет."
            : `Сверка прошла, автоматически починить не удалось. Осталось расхождений: ${result.remaining.length}.`,
    };
  } catch (error) {
    return {
      error: `Сверка не отработала: ${error instanceof Error ? error.message : error}`,
    };
  }
}
