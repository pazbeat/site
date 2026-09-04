import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ReconcileRun } from "@/components/admin/reconcile-run";
import {
  DISCREPANCY_TITLES,
  findDiscrepancies,
  type Discrepancy,
  type DiscrepancyKind,
} from "@/lib/reconcile";

/**
 * Расхождения контура «оплата → выпуск → CRM → доставка».
 *
 * Экран отвечает на один вопрос: где сейчас деньги и сертификат разошлись.
 * До него ответ на него можно было получить только запросом в базу — а значит
 * никогда: расхождения всплывали жалобой покупателя или разбором выписки
 * через месяц.
 */

/** Что делать менеджеру с каждым видом расхождения. */
const HINTS: Record<DiscrepancyKind, string> = {
  paid_without_certificate:
    "Деньги приняты, покупатель ничего не получил. Сверка сама повторяет выпуск каждые 10 минут; если строка держится дольше получаса — откройте заказ и выпустите сертификат вручную.",
  certificate_without_payment:
    "Сертификат выпущен по заказу, который не оплачен. Проверьте платёж в выписке: если оплаты не было, сертификат нужно заблокировать в карточке.",
  altegio_stuck:
    "Сертификат у покупателя есть, а в кассе его нет — кассир такой не найдёт. Повтор идёт автоматически до пяти раз; дальше смотрите причину и заводите вручную.",
  delivery_stuck:
    "Сертификат выпущен, но письмо не ушло. Повтор идёт автоматически; при постоянной ошибке проверьте адрес получателя в карточке сертификата.",
};

function formatWhen(value: Date): string {
  return new Date(value.getTime() + 5 * 3_600_000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

function href(item: Discrepancy): string {
  return item.kind === "paid_without_certificate"
    ? `/admin/orders/${item.id}`
    : `/admin/certificates?q=${encodeURIComponent(item.id)}`;
}

export default async function AdminReconcilePage() {
  const admin = await requireAdmin();
  const items = await findDiscrepancies();
  const kinds = Object.keys(DISCREPANCY_TITLES) as DiscrepancyKind[];

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Сверка">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-brand-purple-950/60">
          Расхождения между оплатой, выпуском, кассой и доставкой. Проверка
          идёт каждые 10 минут и сама повторяет то, что чинится повтором; сюда
          попадает всё, что после этого осталось. Отдельно, раз в сутки,
          карточные оплаты за последний месяц переспрашиваются у банка — не
          отменил ли он платёж после выпуска. Время — Asia/Almaty.
        </p>
        <ReconcileRun />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-brand-purple">
            Расхождений нет
          </p>
          <p className="mt-2 text-sm text-brand-purple-950/55">
            Каждый оплаченный заказ имеет сертификат, каждый сертификат —
            оплату, все выпущенные записаны в Altegio и отправлены получателям.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {kinds.map((kind) => {
            const group = items.filter((item) => item.kind === kind);
            if (group.length === 0) return null;
            return (
              <section
                key={kind}
                className="overflow-hidden rounded-2xl border border-brand-purple-100 bg-white"
              >
                <header className="border-b border-brand-purple-100 px-5 py-4">
                  <h2 className="text-base font-bold text-brand-purple">
                    {DISCREPANCY_TITLES[kind]}
                    <span className="ml-2 rounded-full bg-brand-red/10 px-2.5 py-0.5 text-xs font-bold text-brand-red">
                      {group.length}
                    </span>
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-brand-purple-950/60">
                    {HINTS[kind]}
                  </p>
                </header>
                <ul className="divide-y divide-brand-purple-100/60">
                  {group.map((item) => (
                    <li
                      key={`${item.kind}:${item.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm"
                    >
                      <Link
                        href={href(item)}
                        className="font-medium text-brand-purple hover:text-brand-gold"
                      >
                        {item.label}
                      </Link>
                      <span className="text-xs whitespace-nowrap text-brand-purple-950/55">
                        с {formatWhen(item.since)}
                      </span>
                      {item.detail && (
                        <p className="w-full text-xs text-brand-red">
                          {item.detail}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </AdminChrome>
  );
}
