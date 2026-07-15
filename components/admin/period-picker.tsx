import Link from "next/link";
import {
  almatyMonthKey,
  monthLabel,
  recentMonths,
  shiftMonth,
  type Period,
} from "@/lib/admin/period";

const inputCls =
  "rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-1.5 text-sm outline-none focus:border-brand-gold";
const btnCls =
  "rounded-full bg-brand-purple px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-purple-600";
const arrowCls =
  "rounded-full border border-brand-purple-100 px-2.5 py-1.5 text-sm text-brand-purple-950/70 hover:bg-brand-purple-50";

/**
 * Выбор периода: месяц или произвольный диапазон. Две отдельные GET-формы —
 * каждая шлёт только своё поле, поэтому выбор месяца сбрасывает свои даты и
 * наоборот; без JS.
 */
export function PeriodPicker({
  basePath,
  period,
  now = new Date(),
}: Readonly<{ basePath: string; period: Period; now?: Date }>) {
  const months = recentMonths(24, now);
  const current = almatyMonthKey(now);
  const selected = period.kind === "month" ? period.key : period.key;
  // Ссылки-стрелки только для месяца; вперёд — не дальше текущего
  const prev = period.kind === "month" ? shiftMonth(period.key, -1) : null;
  const next =
    period.kind === "month" && period.key < current
      ? shiftMonth(period.key, 1)
      : null;

  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
      <form method="get" action={basePath} className="flex items-center gap-2">
        {prev && (
          <Link
            href={`${basePath}?month=${prev}`}
            className={arrowCls}
            title={monthLabel(prev)}
          >
            ←
          </Link>
        )}
        <select name="month" defaultValue={selected} className={inputCls}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
              {m === current ? " (текущий)" : ""}
            </option>
          ))}
          <option value="all">Всё время</option>
          {period.kind === "custom" && (
            <option value="custom" disabled>
              Свой период
            </option>
          )}
        </select>
        {next ? (
          <Link
            href={`${basePath}?month=${next}`}
            className={arrowCls}
            title={monthLabel(next)}
          >
            →
          </Link>
        ) : (
          period.kind === "month" && (
            <span className={`${arrowCls} opacity-30`} aria-hidden>
              →
            </span>
          )
        )}
        <button type="submit" className={btnCls}>
          Показать
        </button>
      </form>

      <form method="get" action={basePath} className="flex items-end gap-2">
        <div>
          <label
            htmlFor="period-from"
            className="mb-1 block text-[11px] font-semibold text-brand-purple-950/55"
          >
            Свой период: с
          </label>
          <input
            id="period-from"
            type="date"
            name="from"
            defaultValue={period.fromInput}
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="period-to"
            className="mb-1 block text-[11px] font-semibold text-brand-purple-950/55"
          >
            по
          </label>
          <input
            id="period-to"
            type="date"
            name="to"
            defaultValue={period.toInput}
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          className="rounded-full border-[1.5px] border-brand-purple px-4 py-1.5 text-sm font-semibold text-brand-purple hover:bg-brand-purple-50"
        >
          Показать
        </button>
      </form>
    </div>
  );
}
