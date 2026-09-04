import Link from "next/link";
import { formatKzt } from "@/lib/format";
import type { Discrepancies } from "@/lib/admin/statement";

/**
 * Расхождения с банковской выпиской — общий блок для отчёта и для страницы
 * сверки.
 *
 * Показывается прямо под таблицей отчёта, а не на отдельной странице: вопрос
 * «сходится ли» возникает ровно в тот момент, когда человек смотрит на суммы,
 * и уводить его за ответом в другой раздел значит, что туда он не пойдёт.
 *
 * Порядок блоков — по опасности, а не по алфавиту: возвраты и лишние платежи
 * стоят выше, потому что за ними стоят деньги без сертификата или сертификат
 * без денег.
 */

const SOURCE_LABEL: Record<string, string> = {
  kaspi: "Kaspi",
  forte: "ForteBank",
};

function ruDate(at: Date): string {
  // Дни считаем по Алматы: полночь по UTC — это ещё вчерашний вечер в салоне.
  return new Date(at.getTime() + 5 * 3_600_000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ")
    .split(" ")
    .map((part, index) =>
      index === 0 ? part.split("-").reverse().join(".") : part,
    )
    .join(" ");
}

function Section({
  title,
  count,
  tone,
  hint,
  empty,
  children,
}: Readonly<{
  title: string;
  count: number;
  tone: "red" | "gold";
  hint: string;
  empty: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="overflow-hidden rounded-2xl border border-brand-purple-100 bg-white">
      <header className="border-b border-brand-purple-100 px-5 py-4">
        <h3 className="text-base font-bold text-brand-purple">
          {title}
          <span
            className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              tone === "red"
                ? "bg-brand-red/10 text-brand-red"
                : "bg-brand-gold/15 text-brand-gold"
            }`}
          >
            {count}
          </span>
        </h3>
        <p className="mt-1.5 text-xs text-brand-purple-950/60">{hint}</p>
      </header>
      {count === 0 ? (
        <p className="px-5 py-4 text-sm text-brand-purple-950/55">{empty}</p>
      ) : (
        <ul className="divide-y divide-brand-purple-100/60 text-sm">
          {children}
        </ul>
      )}
    </section>
  );
}

export function StatementDiscrepancies({
  diff,
  periodLabel,
  uploadHref,
}: Readonly<{
  diff: Discrepancies;
  periodLabel: string;
  uploadHref: string;
}>) {
  if (diff.loaded.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-purple-100 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-brand-purple">
          Выписка за {periodLabel} не загружена
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-brand-purple-950/55">
          Пока её нет, отчёт показывает только наши данные — сверить их с тем,
          что реально пришло в банк, нечем.
        </p>
        <Link
          href={uploadHref}
          className="mt-3 inline-block rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600"
        >
          Загрузить выписку
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-brand-purple-100 bg-white px-5 py-4">
        <h3 className="mb-1.5 text-sm font-bold text-brand-purple">
          Сверено с выпиской
        </h3>
        <ul className="text-sm text-brand-purple-950/70">
          {diff.loaded.map((l) => (
            <li key={l.source}>
              {SOURCE_LABEL[l.source] ?? l.source}: {l.count} операций, с{" "}
              {ruDate(l.from)} по {ruDate(l.to)}
            </li>
          ))}
        </ul>
      </div>

      <Section
        title="В выписке есть, у нас нет"
        count={diff.extra.length}
        tone="red"
        hint="Деньги пришли, а сертификата за ними нет. Найдите платёж в кабинете банка и выпустите сертификат вручную, указав номер операции основанием."
        empty="Таких платежей нет."
      >
        {diff.extra.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3"
          >
            <span>
              {ruDate(e.operatedAt)} · {SOURCE_LABEL[e.source] ?? e.source}
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
      </Section>

      <Section
        title="Возвраты"
        count={diff.refunds.length}
        tone="red"
        hint="Деньги ушли покупателю назад. Проверьте, погашен ли сертификат: по Kaspi отмену платежа больше узнать неоткуда — в ответе их бэкенда есть только признак «оплачено»."
        empty="Возвратов за период нет."
      >
        {diff.refunds.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3"
          >
            <span>
              {ruDate(r.operatedAt)} · {SOURCE_LABEL[r.source] ?? r.source} ·{" "}
              {r.orderId ? (
                <Link
                  href={`/admin/orders/${r.orderId}`}
                  className="font-medium text-brand-purple hover:text-brand-gold"
                >
                  {r.serial ?? "заказ"}
                </Link>
              ) : (
                <span className="text-brand-purple-950/55">
                  заказ не определён
                </span>
              )}
            </span>
            <span className="font-semibold tabular-nums text-brand-red">
              −{formatKzt(r.amountKzt)}
            </span>
          </li>
        ))}
      </Section>

      <Section
        title="У нас есть, в выписке нет"
        count={diff.missing.length}
        tone="gold"
        hint="Сертификат выпущен, а платежа в выписке нет. Обычно это возврат, оплата другим способом или выписка за неполный период. Подтверждённые вручную сюда не попадают."
        empty="Все наши продажи подтверждены выпиской."
      >
        {diff.missing.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3"
          >
            <Link
              href={`/admin/orders/${o.id}`}
              className="font-medium text-brand-purple hover:text-brand-gold"
            >
              {ruDate(o.paidAt)} · {o.serial ?? o.id} · {o.salonLabel}
            </Link>
            <span className="font-semibold tabular-nums">
              {formatKzt(o.amountKzt)}
            </span>
          </li>
        ))}
      </Section>
    </div>
  );
}
