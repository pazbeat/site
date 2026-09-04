import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { PeriodPicker } from "@/components/admin/period-picker";
import { ReportPresets } from "@/components/admin/report-presets";
import { resolvePeriod } from "@/lib/admin/period";
import { buildCertificateReport, reportRange } from "@/lib/admin/certificate-report";
import { findStatementDiscrepancies } from "@/lib/admin/statement";
import { StatementDiscrepancies } from "@/components/admin/statement-discrepancies";
import { formatKzt } from "@/lib/format";

/**
 * Отчёт по проданным сертификатам — филиалы × дни.
 *
 * Повторяет раскладку таблицы, которую бухгалтер ведёт руками: строка на
 * филиал, пара колонок на день, итоги справа и снизу. Так цифры можно сверять
 * с выпиской и с Altegio, не перекладывая их глазами.
 */

function ruDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}.${m}`;
}

export default async function CertificateReportPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    month?: string;
    from?: string;
    to?: string;
    measure?: string;
  }>;
}>) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const measure: "paid" | "face" = sp.measure === "face" ? "face" : "paid";

  // Границы «всего времени» сводит к разумным сам отчёт: матрица по дням за
  // все годы была бы нечитаемой.
  const range = reportRange(period.from, period.to);
  const [report, diff] = await Promise.all([
    buildCertificateReport(period.from, period.to),
    findStatementDiscrepancies(range.from, range.to),
  ]);

  const pick = (cell?: { paidKzt: number; faceKzt: number }) =>
    cell ? (measure === "paid" ? cell.paidKzt : cell.faceKzt) : 0;

  const query = new URLSearchParams();
  if (period.kind === "custom") {
    query.set("from", period.fromInput);
    query.set("to", period.toInput);
  } else {
    query.set("month", period.key);
  }
  query.set("measure", measure);

  return (
    <AdminChrome
      email={admin.email}
      role={admin.role}
      title="Отчёт по сертификатам"
    >
      <ReportPresets
        basePath="/admin/certificates/report"
        active={`${period.fromInput}:${period.toInput}`}
      />
      <PeriodPicker basePath="/admin/certificates/report" period={period} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-brand-purple-100 p-1">
          {(
            [
              ["paid", "Сколько оплачено"],
              ["face", "Номинал сертификатов"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={`/admin/certificates/report?${new URLSearchParams({
                ...(period.kind === "custom"
                  ? { from: period.fromInput, to: period.toInput }
                  : { month: period.key }),
                measure: key,
              })}`}
              className={
                measure === key
                  ? "rounded-full bg-brand-purple px-3 py-1 text-xs font-bold text-white"
                  : "rounded-full px-3 py-1 text-xs font-semibold text-brand-purple-950/60"
              }
            >
              {label}
            </Link>
          ))}
        </div>
        <a
          href={`/api/admin/export/certificates?${query}`}
          className="rounded-full bg-brand-purple px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-purple-600"
        >
          Скачать Excel
        </a>
        <a
          href={`/api/admin/export/certificates?${query}&format=csv`}
          className="rounded-full border-[1.5px] border-brand-purple-100 px-4 py-2 text-xs font-bold text-brand-purple hover:border-brand-gold"
        >
          CSV
        </a>
        <span className="text-xs text-brand-purple-950/55">
          {measure === "paid"
            ? "Суммы — сколько реально пришло денег: с этим сверяется выписка банка."
            : "Суммы — номинал выпущенных сертификатов: с этим сверяется Altegio."}
        </span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
            Оплачено · {period.label}
          </div>
          <div className="mt-2 font-display text-3xl text-brand-purple">
            {formatKzt(report.total.paidKzt)}
          </div>
        </div>
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
            Номинал сертификатов
          </div>
          <div className="mt-2 font-display text-3xl text-brand-purple">
            {formatKzt(report.total.faceKzt)}
          </div>
        </div>
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
            Сертификатов
          </div>
          <div className="mt-2 font-display text-3xl text-brand-purple">
            {report.total.count}
          </div>
        </div>
      </div>

      {report.days.length > 62 ? (
        <p className="rounded-2xl border border-brand-purple-100 bg-white p-5 text-sm text-brand-purple-950/60">
          В периоде {report.days.length} дней — таблица по дням была бы
          нечитаемой. Выберите месяц или диапазон покороче, а для длинных
          периодов возьмите выгрузку CSV.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-purple-100 text-xs text-brand-purple-950/55 uppercase">
                <th className="sticky left-0 bg-white px-4 py-3 text-left font-semibold">
                  Филиал
                </th>
                {report.days.map((day) => (
                  <th key={day} className="px-3 py-3 text-right font-semibold">
                    {ruDay(day)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold">Итого</th>
              </tr>
            </thead>
            <tbody className="font-variant-numeric tabular-nums">
              {report.branches.map((branch) => {
                const totals = report.totalsByBranch[branch.id];
                return (
                  <tr
                    key={branch.id}
                    className="border-b border-brand-purple-100/60 last:border-0"
                  >
                    <td className="sticky left-0 bg-white px-4 py-2 whitespace-nowrap">
                      {branch.label}
                    </td>
                    {report.days.map((day) => {
                      const cell = report.cells[`${branch.id}:${day}`];
                      return (
                        <td
                          key={day}
                          className="px-3 py-2 text-right whitespace-nowrap"
                          title={cell ? `${cell.count} шт.` : undefined}
                        >
                          {cell ? (
                            <>
                              {pick(cell).toLocaleString("ru-RU")}
                              <span className="ml-1 text-xs text-brand-purple-950/45">
                                ×{cell.count}
                              </span>
                            </>
                          ) : (
                            <span className="text-brand-purple-950/25">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-semibold whitespace-nowrap">
                      {totals ? (
                        <>
                          {pick(totals).toLocaleString("ru-RU")}
                          <span className="ml-1 text-xs text-brand-purple-950/45">
                            ×{totals.count}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-brand-gold font-semibold">
                <td className="sticky left-0 bg-white px-4 py-3">Итог</td>
                {report.days.map((day) => {
                  const cell = report.totalsByDay[day];
                  return (
                    <td
                      key={day}
                      className="px-3 py-3 text-right whitespace-nowrap"
                    >
                      {cell ? (
                        <>
                          {pick(cell).toLocaleString("ru-RU")}
                          <span className="ml-1 text-xs text-brand-purple-950/45">
                            ×{cell.count}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {pick(report.total).toLocaleString("ru-RU")}
                  <span className="ml-1 text-xs text-brand-purple-950/45">
                    ×{report.total.count}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {report.byMethod.length > 0 && (
        <div className="mt-6 rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-brand-purple">
            Чем платили
          </h2>
          <ul className="text-sm">
            {report.byMethod.map((m) => (
              <li
                key={m.key}
                className="flex justify-between border-b border-brand-purple-100/60 py-2 last:border-0"
              >
                <span>{m.label}</span>
                <span className="tabular-nums">
                  {formatKzt(m.paidKzt)} · {m.count} шт.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-bold text-brand-purple">
          Сходится ли с банком
        </h2>
        <StatementDiscrepancies
          diff={diff}
          periodLabel={period.label}
          uploadHref={`/admin/certificates/statement?${query.toString()}`}
        />
      </div>
    </AdminChrome>
  );
}
