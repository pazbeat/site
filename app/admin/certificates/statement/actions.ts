"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, auditLog } from "@/lib/admin/guard";
import { resolvePeriod } from "@/lib/admin/period";
import { reportRange } from "@/lib/admin/certificate-report";
import { uploadStatement } from "@/lib/admin/statement";

/** Больше этого выписка за месяц не весит — защита от случайного файла. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadStatementAction(formData: FormData) {
  const admin = await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Выберите файл выписки." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Файл больше 8 МБ — похоже, это не выписка." };
  }
  const source = String(formData.get("source") ?? "");
  if (source !== "kaspi" && source !== "forte") {
    return { error: "Выберите, чья это выписка." };
  }

  const period = resolvePeriod({
    month: String(formData.get("month") ?? "") || undefined,
    from: String(formData.get("from") ?? "") || undefined,
    to: String(formData.get("to") ?? "") || undefined,
  });
  const range = reportRange(period.from, period.to);

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadStatement({
    source,
    fileName: file.name,
    buffer,
    from: range.from,
    to: range.to,
    actor: admin.email,
  });

  if (!result.ok) {
    return {
      error:
        result.error +
        (result.columns?.length
          ? ` Нашлись колонки: ${result.columns.join(", ")}.`
          : ""),
    };
  }

  await auditLog({
    actor: admin.email,
    action: "statement.upload",
    entity: "statement",
    entityId: result.batchId,
    diff: {
      источник: source,
      период: period.label,
      файл: file.name,
      сошлось: result.summary.matchedCount,
      "лишних в выписке": result.summary.extraCount,
      "нет в выписке": result.summary.missingCount,
    },
  });
  revalidatePath("/admin/certificates/statement");
  revalidatePath("/admin/certificates/report");

  const s = result.summary;
  const money = (v: number) => `${v.toLocaleString("ru-RU")} ₸`;
  const problems = [
    s.extraCount > 0
      ? `в выписке есть, у нас нет: ${s.extraCount} на ${money(s.extraKzt)}`
      : null,
    s.missingCount > 0
      ? `у нас есть, в выписке нет: ${s.missingCount} на ${money(s.missingKzt)}`
      : null,
    s.mismatchCount > 0 ? `сумма разошлась: ${s.mismatchCount}` : null,
  ].filter(Boolean);

  return {
    ok: true,
    message:
      `Сверено: сошлось ${s.matchedCount} на ${money(s.matchedKzt)}.` +
      (problems.length > 0
        ? ` Расхождения — ${problems.join("; ")}.`
        : " Расхождений нет.") +
      (result.skipped > 0 ? ` Пропущено строк без даты или суммы: ${result.skipped}.` : ""),
  };
}
