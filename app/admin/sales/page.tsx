import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { PeriodPicker } from "@/components/admin/period-picker";
import {
  almatyDayKey,
  eachDay,
  monthLabel,
  periodFilter,
  resolvePeriod,
} from "@/lib/admin/period";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import { pickL10n } from "@/lib/l10n";
import type { Prisma } from "@/lib/generated/prisma/client";

const PROVIDER_LABEL: Record<string, string> = {
  kaspi: "Kaspi",
  freedom: "Freedom Pay",
  forte: "ForteBank",
  mock: "Демо (mock)",
};

/** Горизонтальный бар для разбивок. */
function Bar({
  label,
  count,
  sum,
  max,
  href,
}: Readonly<{
  label: string;
  count: number;
  sum: number;
  max: number;
  href?: string;
}>) {
  const pct = max > 0 ? Math.round((sum / max) * 100) : 0;
  const title = href ? (
    <Link href={href} className="hover:underline">
      {label}
    </Link>
  ) : (
    label
  );
  return (
    <li className="py-1.5">
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span className="truncate text-brand-purple-950/80">{title}</span>
        <span className="whitespace-nowrap font-semibold text-brand-purple">
          {formatKzt(sum)}{" "}
          <span className="font-normal text-brand-purple-950/45">· {count}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-purple-50">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-gold"
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

export default async function AdminSalesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}>) {
  const admin = await requireAdmin();
  const period = resolvePeriod(await searchParams);

  const where: Prisma.OrderWhereInput = { status: "paid" };
  const createdAt = periodFilter(period);
  if (createdAt) where.createdAt = createdAt;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amountKzt: true,
      createdAt: true,
      salonId: true,
      paymentProvider: true,
      salon: { select: { city: true, name: true } },
      certificates: {
        select: {
          amountKzt: true,
          balanceKzt: true,
          type: true,
          programOptionId: true,
        },
      },
    },
  });

  const totalSum = orders.reduce((s, o) => s + o.amountKzt, 0);
  const totalCount = orders.length;

  // Разбивка по филиалам
  const byBranch = new Map<
    number,
    { label: string; count: number; sum: number }
  >();
  for (const o of orders) {
    const cur = byBranch.get(o.salonId) ?? {
      label: `${o.salon.city} · ${o.salon.name}`,
      count: 0,
      sum: 0,
    };
    cur.count++;
    cur.sum += o.amountKzt;
    byBranch.set(o.salonId, cur);
  }
  const branches = [...byBranch.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.sum - a.sum);
  const branchMax = Math.max(1, ...branches.map((b) => b.sum));

  // Разбивка по способу оплаты
  const byProvider = new Map<string, { count: number; sum: number }>();
  for (const o of orders) {
    const key = o.paymentProvider ?? "—";
    const cur = byProvider.get(key) ?? { count: 0, sum: 0 };
    cur.count++;
    cur.sum += o.amountKzt;
    byProvider.set(key, cur);
  }
  const providers = [...byProvider.entries()].sort((a, b) => b[1].sum - a[1].sum);

  // Разбивка по номиналам (из сертификатов)
  const byNominal = new Map<number, { count: number; sum: number }>();
  const programOptionCounts = new Map<number, number>();
  for (const o of orders) {
    for (const c of o.certificates) {
      const nominal = c.amountKzt ?? c.balanceKzt;
      const cur = byNominal.get(nominal) ?? { count: 0, sum: 0 };
      cur.count++;
      cur.sum += nominal;
      byNominal.set(nominal, cur);
      if (c.type === "program" && c.programOptionId) {
        programOptionCounts.set(
          c.programOptionId,
          (programOptionCounts.get(c.programOptionId) ?? 0) + 1,
        );
      }
    }
  }
  const nominals = [...byNominal.entries()]
    .map(([n, v]) => ({ nominal: n, ...v }))
    .sort((a, b) => b.count - a.count);
  const nominalMax = Math.max(1, ...nominals.map((n) => n.sum));

  // Топ-программы
  const optionIds = [...programOptionCounts.keys()];
  const options = optionIds.length
    ? await prisma.programOption.findMany({
        where: { id: { in: optionIds } },
        include: { program: { select: { names: true } } },
      })
    : [];
  const optionName = new Map(
    options.map((o) => [o.id, pickL10n(o.program.names, "ru")] as const),
  );
  const topPrograms = [...programOptionCounts.entries()]
    .map(([id, count]) => ({ name: optionName.get(id) ?? "—", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Динамика: по дням, если период укладывается в ~2 месяца, иначе по месяцам
  const DAY_MS = 24 * 60 * 60 * 1000;
  const span =
    period.from && period.to ? period.to.getTime() - period.from.getTime() : null;
  const daily = span !== null && span <= 62 * DAY_MS;

  const buckets = new Map<string, { count: number; sum: number }>();
  for (const o of orders) {
    const key = daily
      ? almatyDayKey(o.createdAt)
      : almatyDayKey(o.createdAt).slice(0, 7);
    const cur = buckets.get(key) ?? { count: 0, sum: 0 };
    cur.count++;
    cur.sum += o.amountKzt;
    buckets.set(key, cur);
  }

  // Пустые дни периода тоже показываем — иначе провалы в продажах не видны
  const chartKeys = daily
    ? eachDay(period.from!, period.to!)
    : [...buckets.keys()].sort();
  const chart = chartKeys.map((key) => ({
    key,
    label: daily ? key.slice(8) : `${key.slice(5)}.${key.slice(2, 4)}`,
    title: daily ? key : monthLabel(key),
    ...(buckets.get(key) ?? { count: 0, sum: 0 }),
  }));
  const chartMax = Math.max(1, ...chart.map((d) => d.sum));

  const avgCheck = totalCount > 0 ? Math.round(totalSum / totalCount) : 0;

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Продажи">
      <PeriodPicker basePath="/admin/sales" period={period} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
            Выручка · {period.label}
          </div>
          <div className="mt-2 font-display text-3xl text-brand-purple">
            {formatKzt(totalSum)}
          </div>
        </div>
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
            Продаж
          </div>
          <div className="mt-2 font-display text-3xl text-brand-purple">
            {totalCount}
          </div>
        </div>
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
            Средний чек
          </div>
          <div className="mt-2 font-display text-3xl text-brand-purple">
            {formatKzt(avgCheck)}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-brand-purple">
            Продажи по филиалам
          </h2>
          {branches.length ? (
            <ul>
              {branches.map((b) => (
                <Bar
                  key={b.id}
                  label={b.label}
                  count={b.count}
                  sum={b.sum}
                  max={branchMax}
                  href={`/admin/orders?salon=${b.id}&status=paid`}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-purple-950/50">Нет продаж за период.</p>
          )}
        </section>

        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-brand-purple">
            Продажи по номиналам
          </h2>
          {nominals.length ? (
            <ul>
              {nominals.map((n) => (
                <Bar
                  key={n.nominal}
                  label={formatKzt(n.nominal)}
                  count={n.count}
                  sum={n.sum}
                  max={nominalMax}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-purple-950/50">Нет продаж за период.</p>
          )}
        </section>

        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-brand-purple">
            Динамика · {daily ? "по дням" : "по месяцам"}
          </h2>
          {chart.length ? (
            <div className="flex h-40 items-end gap-1">
              {chart.map((d) => (
                <div
                  key={d.key}
                  className="group flex flex-1 flex-col items-center justify-end"
                  title={`${d.title}: ${formatKzt(d.sum)} · ${d.count}`}
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-brand-purple to-brand-gold"
                    style={{
                      height: `${Math.round((d.sum / chartMax) * 100)}%`,
                      minHeight: d.sum > 0 ? "3px" : "0",
                    }}
                  />
                  <span className="mt-1 text-[9px] text-brand-purple-950/45">
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-purple-950/50">Нет продаж за период.</p>
          )}
        </section>

        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-brand-purple">
            Способ оплаты
          </h2>
          {providers.length ? (
            <ul className="text-sm">
              {providers.map(([key, v]) => (
                <li
                  key={key}
                  className="flex justify-between border-b border-brand-purple-100/60 py-2 last:border-0"
                >
                  <span className="text-brand-purple-950/70">
                    {PROVIDER_LABEL[key] ?? key}
                  </span>
                  <span className="font-semibold">
                    {formatKzt(v.sum)}{" "}
                    <span className="font-normal text-brand-purple-950/45">
                      · {v.count}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-purple-950/50">Нет продаж за период.</p>
          )}

          {topPrograms.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-sm font-bold text-brand-purple">
                Топ-программы
              </h3>
              <ul className="text-sm">
                {topPrograms.map((p, i) => (
                  <li
                    key={i}
                    className="flex justify-between border-b border-brand-purple-100/60 py-1.5 last:border-0"
                  >
                    <span className="max-w-[75%] truncate text-brand-purple-950/70">
                      {p.name}
                    </span>
                    <span className="font-semibold">{p.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </AdminChrome>
  );
}
