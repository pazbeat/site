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
      <p className="mb-5 max-w-3xl text-sm text-brand-purple-950/70">
        Страница отвечает на один вопрос: <b>откуда приходят люди, которые
        покупают</b>. Каждая строка — канал, по которому посетитель попал на
        сайт. Главная колонка — <b>«на 100 заходов»</b>: сколько денег приносит
        сотня посетителей из этого канала. По ней и отсортировано — канал сверху
        выгоднее остальных.
      </p>

      <PeriodPicker basePath="/admin/sources" period={period} />

      {countingSince === null ? (
        <div className="mb-5 rounded-2xl border border-brand-gold/50 bg-brand-gold-100/40 p-4 text-sm">
          <p className="mb-2 font-bold">Счёт заходов только начался</p>
          <p className="mb-2">
            Пока на сайт не зашёл ни один посетитель после запуска учёта, поэтому
            в колонке «заходов» пусто. Покупки в таблице видны — они берутся из
            заказов и были всегда.
          </p>
          <p>
            Цифры появятся сами, по мере того как люди будут заходить. Первые
            выводы можно делать через неделю-другую.
          </p>
        </div>
      ) : periodStartsEarlier ? (
        <div className="mb-5 rounded-2xl border border-brand-gold/50 bg-brand-gold-100/40 p-4 text-sm">
          <p className="mb-2 font-bold">Период шире, чем работает счётчик</p>
          <p>
            Заходы считаются с{" "}
            <b>{countingSince.toISOString().slice(0, 10)}</b>, а выбранный период
            начинается раньше. Поэтому конверсия за него была бы заниженной и не
            показана — покупки и выручка при этом верные.
          </p>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Заходов · ${period.label}`} value={String(sum.visits)} />
        <Kpi label="Покупок" value={String(sum.orders)} />
        {/* Конверсия без заходов — бессмыслица: делить не на что. Показывать
            «0,0 %» рядом с двумя покупками значило бы врать. */}
        <Kpi
          label="Конверсия"
          value={
            periodStartsEarlier || sum.visits === 0
              ? "—"
              : `${sum.conversionPct.toFixed(1)} %`
          }
          hint={
            sum.visits === 0 && sum.orders > 0
              ? "нечего делить: заходы за этот период не считались"
              : undefined
          }
        />
        <Kpi label="Выручка" value={formatKzt(sum.revenueKzt)} />
      </div>

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
                    <>
                      <span className="text-brand-purple-950/60">Без метки</span>
                      <span className="block text-[11px] font-normal text-brand-purple-950/45">
                        заказы до запуска учёта
                      </span>
                    </>
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

      <details className="mt-5 rounded-2xl border border-brand-purple-100 bg-white p-5 text-sm">
        <summary className="cursor-pointer font-bold text-brand-purple">
          Как читать этот отчёт и что нужно делать
        </summary>

        <div className="mt-4 space-y-4 text-brand-purple-950/75">
          <div>
            <p className="mb-1 font-bold text-brand-purple">Что означают колонки</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <b>Заходов</b> — сколько человек пришло. Один посетитель считается
                один раз в сутки, сколько бы страниц он ни открыл.
              </li>
              <li>
                <b>Открыли конструктор</b> — сколько из них дошло до выбора
                сертификата. Если заходов много, а здесь мало — канал приводит
                случайных людей.
              </li>
              <li>
                <b>На 100 заходов</b> — сколько денег приносит сотня посетителей.
                Главная колонка: канал может давать мало заходов, но дорогие
                покупки — и быть выгоднее шумного.
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-1 font-bold text-brand-purple">Почему бывают прочерки</p>
            <p>
              Пока по каналу меньше 30 заходов, конверсия и выручка на сотню не
              показываются. На малых числах они случайны: две случайные покупки
              при трёх заходах дали бы «конверсию 66 %» и увели бы бюджет не туда.
            </p>
          </div>

          <div>
            <p className="mb-1 font-bold text-brand-purple">
              Что нужно от вас, чтобы каналы разделились
            </p>
            <p className="mb-2">
              Google и Яндекс узнаются сами. А вот рекламу, Instagram и рассылки
              без пометки в ссылке различить нельзя — они сольются в «прочее».
              Поэтому в объявлениях и постах ставьте не просто адрес сайта, а с
              хвостом:
            </p>
            <code className="block overflow-x-auto rounded-lg bg-brand-purple-50 p-3 text-xs">
              https://new.imbir.kz/?utm_source=instagram&amp;utm_medium=cpc&amp;utm_campaign=8marta
            </code>
            <p className="mt-2">
              <b>utm_source</b> — где размещаете (instagram, google, 2gis),{" "}
              <b>utm_medium</b> — платно или нет (<code>cpc</code> для рекламы,{" "}
              <code>post</code> для обычного поста), <b>utm_campaign</b> —{" "}
              <b>название акции, которое вы придумываете сами</b>: «8марта»,
              «новыйгод», «блогер-айым». Нужно, чтобы в отчёте отличать одну
              рекламу от другой. Можно писать по-русски.
            </p>
          </div>

          <div>
            <p className="mb-1 font-bold text-brand-purple">
              «Кто закрыл» и «кто привёл»
            </p>
            <p>
              Человек может прийти из Instagram, уйти, а через неделю вернуться
              из поиска и купить. <b>Кто привёл</b> покажет Instagram — он
              познакомил с вами. <b>Кто закрыл</b> покажет поиск — на нём
              состоялась покупка. Обе цифры полезны, но по-разному: первая — про
              то, где искать новых людей, вторая — про то, что дожимает продажу.
            </p>
          </div>

          <div>
            <p className="mb-1 font-bold text-brand-purple">Про сходимость</p>
            <p>
              Заказ учитывается в месяце создания — так же, как в «Продажах»,
              поэтому выручка в двух отчётах совпадает до тенге.
            </p>
          </div>
        </div>
      </details>
    </AdminChrome>
  );
}

function Kpi({
  label,
  value,
  hint,
}: Readonly<{ label: string; value: string; hint?: string }>) {
  return (
    <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
      <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
        {label}
      </div>
      <div className="mt-2 font-display text-3xl text-brand-purple">{value}</div>
      {hint && <div className="mt-1 text-xs text-brand-purple-950/50">{hint}</div>}
    </div>
  );
}
