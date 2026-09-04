import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadActiveAdmin, auditLog } from "@/lib/admin/guard";
import { resolvePeriod } from "@/lib/admin/period";
import {
  buildCertificateReport,
  reportRange,
  reportToCsv,
} from "@/lib/admin/certificate-report";
import { buildCertificateXlsx } from "@/lib/admin/certificate-xlsx";

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
  // Excel по умолчанию: в нём дата стоит НАД парой колонок, как в таблице
  // бухгалтера, а в CSV объединённых ячеек нет и файл открывается съехавшим.
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const report = await buildCertificateReport(period.from, period.to);

  await auditLog({
    actor: admin.email,
    action: "export.certificates",
    entity: "export",
    entityId: period.key,
    diff: { период: period.label, показатель: measure },
  });

  const stamp = `${period.key}-${measure}`;
  if (format === "csv") {
    const csv = reportToCsv(report, measure);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="imbir-certificates-${stamp}.csv"`,
        "Content-Length": String(Buffer.byteLength(csv, "utf8")),
        "Cache-Control": "no-store",
      },
    });
  }

  const range = reportRange(period.from, period.to);
  const xlsx = await buildCertificateXlsx({
    report,
    measure,
    periodLabel: period.label,
    from: range.from,
    to: range.to,
  });
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="imbir-certificates-${stamp}.xlsx"`,
      "Content-Length": String(xlsx.length),
      "Cache-Control": "no-store",
    },
  });
}
