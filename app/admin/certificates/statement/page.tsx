import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { PeriodPicker } from "@/components/admin/period-picker";
import { StatementUpload } from "@/components/admin/statement-upload";
import { StatementDiscrepancies } from "@/components/admin/statement-discrepancies";
import { resolvePeriod } from "@/lib/admin/period";
import { reportRange } from "@/lib/admin/certificate-report";
import { findStatementDiscrepancies } from "@/lib/admin/statement";

/**
 * Сверка с банковской выпиской.
 *
 * Отвечает не на вопрос «сходятся ли суммы за день» — они могут сойтись при
 * двух ошибках в разные стороны, — а называет расхождения поимённо: какой
 * платёж банка не наш и по какому нашему заказу денег нет.
 */

export default async function StatementPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}>) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const range = reportRange(period.from, period.to);
  const diff = await findStatementDiscrepancies(range.from, range.to);

  return (
    <AdminChrome
      email={admin.email}
      role={admin.role}
      title="Сверка с выпиской"
    >
      <p className="mb-4 max-w-3xl text-sm text-brand-purple-950/60">
        Загрузите выписку за период — сверим построчно с нашими продажами и
        покажем, что не сошлось. Совпадение сумм за день ничего не доказывает:
        две ошибки в разные стороны гасят друг друга, поэтому сверка идёт по
        каждой операции.
      </p>

      <PeriodPicker basePath="/admin/certificates/statement" period={period} />
      <div className="mb-6">
        <StatementUpload
          month={period.kind === "month" ? period.key : undefined}
          from={period.fromInput || undefined}
          to={period.toInput || undefined}
        />
      </div>

      <StatementDiscrepancies
        diff={diff}
        periodLabel={period.label}
        uploadHref="/admin/certificates/statement"
      />
    </AdminChrome>
  );
}
