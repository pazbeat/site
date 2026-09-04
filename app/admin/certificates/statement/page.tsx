import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { PeriodPicker } from "@/components/admin/period-picker";
import { StatementUpload } from "@/components/admin/statement-upload";
import { resolvePeriod } from "@/lib/admin/period";
import { reportRange } from "@/lib/admin/certificate-report";
import { findStatementDiscrepancies } from "@/lib/admin/statement";
import { formatKzt } from "@/lib/format";

/**
 * Сверка с банковской выпиской.
 *
 * Отвечает не на вопрос «сходятся ли суммы за день» — они могут сойтись при
 * двух ошибках в разные стороны, — а называет расхождения поимённо: какой
 * платёж банка не наш и по какому нашему заказу денег нет.
 */

function ruDateTime(at: Date): string {
  return new Date(at.getTime() + 5 * 3_600_000)
    .toISOString()
    .slice(0, 10)
    .split("-")
    .reverse()
    .join(".");
}

const SOURCE_LABEL: Record<string, string> = {
  kaspi: "Kaspi",
  forte: "ForteBank",
};

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

      {diff.loaded.length === 0 ? (
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-brand-purple">
            За {period.label} выписка ещё не загружена
          </p>
          <p className="mt-2 text-sm text-brand-purple-950/55">
            Выгрузите её из кабинета Kaspi или ForteBank и загрузите сюда.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
            <h2 className="mb-2 text-sm font-bold text-brand-purple">
              Загружено
            </h2>
            <ul className="text-sm text-brand-purple-950/70">
              {diff.loaded.map((l) => (
                <li key={l.source}>
                  {SOURCE_LABEL[l.source] ?? l.source}: {l.count} операций,
                  с {ruDateTime(l.from)} по {ruDateTime(l.to)}
                </li>
              ))}
            </ul>
          </div>

          <section className="overflow-hidden rounded-2xl border border-brand-purple-100 bg-white">
            <header className="border-b border-brand-purple-100 px-5 py-4">
              <h2 className="text-base font-bold text-brand-purple">
                В выписке есть, у нас нет
                <span className="ml-2 rounded-full bg-brand-red/10 px-2.5 py-0.5 text-xs font-bold text-brand-red">
                  {diff.extra.length}
                </span>
              </h2>
              <p className="mt-1.5 text-xs text-brand-purple-950/60">
                Самое важное: деньги пришли, а сертификата за ними нет. Найдите
                платёж в кабинете банка и выпустите сертификат вручную, указав
                номер операции основанием.
              </p>
            </header>
            {diff.extra.length === 0 ? (
              <p className="px-5 py-4 text-sm text-brand-purple-950/55">
                Таких платежей нет.
              </p>
            ) : (
              <ul className="divide-y divide-brand-purple-100/60 text-sm">
                {diff.extra.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3"
                  >
                    <span>
                      {ruDateTime(e.operatedAt)} ·{" "}
                      {SOURCE_LABEL[e.source] ?? e.source}
                      {e.reference && (
                        <span className="ml-2 text-xs text-brand-purple-950/55">
                          {e.reference}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatKzt(e.amountKzt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-brand-purple-100 bg-white">
            <header className="border-b border-brand-purple-100 px-5 py-4">
              <h2 className="text-base font-bold text-brand-purple">
                У нас есть, в выписке нет
                <span className="ml-2 rounded-full bg-brand-gold/15 px-2.5 py-0.5 text-xs font-bold text-brand-gold">
                  {diff.missing.length}
                </span>
              </h2>
              <p className="mt-1.5 text-xs text-brand-purple-950/60">
                Сертификат выпущен, а платежа в выписке нет. Обычно это
                возврат, оплата другим способом или выписка за неполный период.
                Подтверждённые вручную сюда не попадают.
              </p>
            </header>
            {diff.missing.length === 0 ? (
              <p className="px-5 py-4 text-sm text-brand-purple-950/55">
                Все наши продажи подтверждены выпиской.
              </p>
            ) : (
              <ul className="divide-y divide-brand-purple-100/60 text-sm">
                {diff.missing.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3"
                  >
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-medium text-brand-purple hover:text-brand-gold"
                    >
                      {ruDateTime(o.paidAt)} · {o.serial ?? o.id} ·{" "}
                      {o.salonLabel}
                    </Link>
                    <span className="font-semibold tabular-nums">
                      {formatKzt(o.amountKzt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AdminChrome>
  );
}
