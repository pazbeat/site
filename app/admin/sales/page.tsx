import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import { pickL10n } from "@/lib/l10n";
import type { Prisma } from "@/lib/generated/prisma/client";

const PERIODS: Array<{ value: string; label: string; days: number }> = [
  { value: "7", label: "7 дней", days: 7 },
  { value: "30", label: "30 дней", days: 30 },
  { value: "90", label: "90 дней", days: 90 },
  { value: "365", label: "Год", days: 365 },
  { value: "0", label: "Всё время", days: 0 },
];

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
}: Readonly<{ searchParams: Promise<{ days?: string }> }>) {
  const admin = await requireAdmin();
  const { days } = await searchParams;
  const period = PERIODS.find((p) => p.value === days) ?? PERIODS[1];

  const where: Prisma.OrderWhereInput = { status: "paid" };
  if (period.days > 0) {
    const since = new Date();
    since.setDate(since.getDate() - period.days);
    where.createdAt = { gte: since };
  }

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

  // Продажи по дням (последние 14 суток периода)
  const byDay = new Map<string, { count: number; sum: number }>();
  for (const o of orders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { count: 0, sum: 0 };
    cur.count++;
    cur.sum += o.amountKzt;
    byDay.set(day, cur);
  }
  const days14: Array<{ day: string; count: number; sum: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const v = byDay.get(key) ?? { count: 0, sum: 0 };
    days14.push({ day: key.slice(5), ...v });
  }
  const dayMax = Math.max(1, ...days14.map((d) => d.sum));

  const avgCheck = totalCount > 0 ? Math.round(totalSum / totalCount) : 0;

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Продажи">
      <div className="mb-5 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/admin/sales?days=${p.value}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              p.value === period.value
                ? "bg-brand-purple text-white"
                : "border border-brand-purple-100 text-brand-purple-950/70 hover:bg-brand-purple-50"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
            Выручка за период
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
            Динамика (14 дней)
          </h2>
          <div className="flex h-40 items-end gap-1">
            {days14.map((d) => (
              <div
                key={d.day}
                className="group flex flex-1 flex-col items-center justify-end"
                title={`${d.day}: ${formatKzt(d.sum)} · ${d.count}`}
              >
                <div
                  className="w-full rounded-t bg-gradient-to-t from-brand-purple to-brand-gold"
                  style={{
                    height: `${Math.round((d.sum / dayMax) * 100)}%`,
                    minHeight: d.sum > 0 ? "3px" : "0",
                  }}
                />
                <span className="mt-1 rotate-0 text-[9px] text-brand-purple-950/45">
                  {d.day}
                </span>
              </div>
            ))}
          </div>
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
