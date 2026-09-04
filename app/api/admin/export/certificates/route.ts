import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadActiveAdmin, auditLog } from "@/lib/admin/guard";
import { resolvePeriod } from "@/lib/admin/period";
import {
  buildCertificateReport,
  reportToCsv,
} from "@/lib/admin/certificate-report";

/**
 * Отчёт по сертификатам в раскладке бухгалтерской таблицы: филиалы строками,
 * на каждый день пара колонок «сумма / количество».
 *
 * Формат выбран не нами — так эту таблицу ведут с марта 2025 года, и её
 * сверяют с выпиской и с Altegio. Выгрузка должна вставляться в неё как есть,
 * иначе экономия времени превращается в новую ручную работу.
 */
export async function GET(request: Request) {
  const session = await auth();
  const admin = await loadActiveAdmin(session?.user?.id);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const period = resolvePeriod({
    month: url.searchParams.get("month") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const measure = url.searchParams.get("measure") === "face" ? "face" : "paid";

  const report = await buildCertificateReport(period.from, period.to);

  await auditLog({
    actor: admin.email,
    action: "export.certificates",
    entity: "export",
    entityId: period.key,
    diff: { период: period.label, показатель: measure },
  });

  const csv = reportToCsv(report, measure);
  const name = `imbir-certificates-${period.key}-${measure}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(Buffer.byteLength(csv, "utf8")),
      "Cache-Control": "no-store",
    },
  });
}
