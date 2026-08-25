import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { PeriodPicker } from "@/components/admin/period-picker";
import { dayRangeFilter, periodFilter, resolvePeriod } from "@/lib/admin/period";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import {
  buildChannelReport,
  channelLabel,
  summarize,
  totals,
  type ChannelInput,
} from "@/lib/sources";

/**
 * Отчёт «Источники»: откуда приходят люди и кто из них покупает.
 *
 * Главный вопрос заказчика — не «сколько зашло», а «куда вкладывать деньги».
 * Поэтому таблица отсортирована по выручке на сотню заходов: эта цифра
 * учитывает сразу и конверсию, и размер чека, а «много заходов» само по себе
 * ничего не стоит.
 *
 * Заказы считаем по дате создания — как в «Продажах», чтобы два отчёта
 * сходились между собой.
 */

const VIEWS = {
  last: { param: "last", label: "Кто закрыл", column: "srcLast" as const },
  first: { param: "first", label: "Кто привёл", column: "srcFirst" as const },
};

export default async function AdminSourcesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string; from?: string; to?: string; view?: string }>;
}>) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const view = sp.view === "first" ? VIEWS.first : VIEWS.last;

  const dayRange = dayRangeFilter(period);
  const range = periodFilter(period);

  const [visitRows, orderRows, firstDay] = await Promise.all([
    prisma.visitStat.groupBy({
      by: ["source", "stage"],
      where: dayRange ? { day: dayRange } : undefined,
      _sum: { visits: true },
    }),
    prisma.order.groupBy({
      by: [view.column],
      where: { status: "paid", ...(range ? { createdAt: range } : {}) },
      _sum: { amountKzt: true },
      _count: { _all: true },
    }),
    prisma.visitStat.aggregate({ _min: { day: true } }),
  ]);

  // Счётчик заходов включён позже, чем начали приниматься заказы. Если период
  // захватывает время до его запуска, конверсия будет заниженной — об этом
  // надо предупредить, иначе владелец решит, что отчёт врёт.
  const countingSince = firstDay._min.day;
  const periodStartsEarlier =
    countingSince !== null && period.from !== null && period.from < countingSince;

  const byChannel = new Map<string, ChannelInput>();
  const pick = (channel: string) => {
    const existing = byChannel.get(channel);
    if (existing) return existing;
    const fresh: ChannelInput = { channel, visits: 0, builders: 0, orders: 0, revenueKzt: 0 };
    byChannel.set(channel, fresh);
    return fresh;
  };

  for (const v of visitRows) {
    const row = pick(v.source);
    if (v.stage === "builder") row.builders += v._sum.visits ?? 0;
    else row.visits += v._sum.visits ?? 0;
  }
  for (const o of orderRows) {
    const channel = (o[view.column] as string | null) ?? "unknown";
    const row = pick(channel);
    row.orders += o._count._all;
    row.revenueKzt += o._sum.amountKzt ?? 0;
  }

  const rows = buildChannelReport([...byChannel.values()]);
  const sum = totals(rows);
  const headline = periodStartsEarlier ? null : summarize(rows);
  const unknown = rows.find((r) => r.channel === "unknown");

  const link = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (sp.month) params.set("month", sp.month);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return `/admin/sources?${params.toString()}`;
  };

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Источники">
      <PeriodPicker basePath="/admin/sources" period={period} />

      {countingSince === null ? (
        <p className="mb-5 rounded-2xl border border-brand-gold/50 bg-brand-gold-100/40 p-4 text-sm">
          Счётчик заходов ещё не собрал ни одной записи. Заходы появятся, как
          только на сайт зайдёт первый посетитель; покупки видны уже сейчас.
        </p>
      ) : periodStartsEarlier ? (
        <p className="mb-5 rounded-2xl border border-brand-gold/50 bg-brand-gold-100/40 p-4 text-sm">
          Счётчик заходов работает с{" "}
          <b>{countingSince.toISOString().slice(0, 10)}</b>. За более ранние даты
          заходов нет, поэтому конверсия за этот период занижена и не показана.
        </p>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Заходов · ${period.label}`} value={String(sum.visits)} />
        <Kpi label="Покупок" value={String(sum.orders)} />
        <Kpi
          label="Конверсия"
          value={periodStartsEarlier ? "—" : `${sum.conversionPct.toFixed(1)} %`}
        />
        <Kpi label="Выручка" value={formatKzt(sum.revenueKzt)} />
      </div>

      {unknown && unknown.orders > 0 && (
        <p className="mb-4 text-xs text-brand-purple-950/60">
          Источник не определён у {unknown.orders} покупок на{" "}
          {formatKzt(unknown.revenueKzt)} — это заказы, оформленные до запуска
          учёта источников либо с отключёнными куками.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-brand-purple-950/60">Считать покупку за каналом:</span>
        {[VIEWS.last, VIEWS.first].map((v) => (
          <Link
            key={v.param}
            href={link({ view: v.param })}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
              v.param === view.param
                ? "border-transparent bg-brand-purple text-white"
                : "border-brand-purple-100 text-brand-purple hover:border-brand-gold"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <section className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/60 uppercase">
            <tr>
              <th className="px-4 py-3">Канал</th>
              <th className="px-4 py-3 text-right">Заходов</th>
              <th className="px-4 py-3 text-right">Открыли конструктор</th>
              <th className="px-4 py-3 text-right">Покупок</th>
              <th className="px-4 py-3 text-right">Конверсия</th>
              <th className="px-4 py-3 text-right">Выручка</th>
              <th className="px-4 py-3 text-right">Средний чек</th>
              <th className="px-4 py-3 text-right">На 100 заходов</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-brand-purple-950/60">
                  За этот период данных нет.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.channel} className="border-b border-brand-purple-100/60 last:border-0">
                <td className="px-4 py-3 font-semibold">
                  {r.channel === "unknown" ? (
                    <span className="text-brand-purple-950/60">Без метки</span>
                  ) : (
                    <Link
                      href={`/admin/orders?source=${r.channel}&status=paid`}
                      className="text-brand-purple underline"
                    >
                      {channelLabel(r.channel)}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.visits || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.builders || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.orders || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.conversionPct === null ? (
                    <span title="Заходов слишком мало, цифра была бы случайной">—</span>
                  ) : (
                    `${r.conversionOverflow ? ">" : ""}${r.conversionPct.toFixed(1)} %`
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.revenueKzt ? formatKzt(r.revenueKzt) : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.avgCheckKzt ? formatKzt(r.avgCheckKzt) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">
                  {r.revenuePer100Kzt === null ? "—" : formatKzt(r.revenuePer100Kzt)}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-brand-purple-100 bg-brand-purple-50/40 font-bold">
              <tr>
                <td className="px-4 py-3">Итого</td>
                <td className="px-4 py-3 text-right tabular-nums">{sum.visits}</td>
                <td className="px-4 py-3 text-right tabular-nums">{sum.builders}</td>
                <td className="px-4 py-3 text-right tabular-nums">{sum.orders}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {periodStartsEarlier ? "—" : `${sum.conversionPct.toFixed(1)} %`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatKzt(sum.revenueKzt)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {headline && (
        <p className="mt-5 rounded-2xl border border-brand-gold/50 bg-brand-gold-100/40 p-4 text-sm font-semibold text-brand-purple">
          {headline}
        </p>
      )}

      <div className="mt-5 space-y-1 text-xs text-brand-purple-950/55">
        <p>
          Один посетитель считается один раз в сутки. Заказ учитывается в месяце
          создания — так же, как в «Продажах», чтобы отчёты сходились.
        </p>
        <p>
          Конверсия и «на 100 заходов» не показываются, пока по каналу меньше 30
          заходов: на малых числах эти цифры случайны.
        </p>
        <p>
          Чтобы канал был виден отдельной строкой, ссылки в рекламе и рассылках
          нужно размечать метками вида{" "}
          <code>?utm_source=instagram&amp;utm_medium=cpc&amp;utm_campaign=8marta</code>.
        </p>
      </div>
    </AdminChrome>
  );
}

function Kpi({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
      <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
        {label}
      </div>
      <div className="mt-2 font-display text-3xl text-brand-purple">{value}</div>
    </div>
  );
}
