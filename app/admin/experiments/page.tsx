import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { PeriodPicker } from "@/components/admin/period-picker";
import { periodFilter, resolvePeriod } from "@/lib/admin/period";
import { AB_VARIANTS, buildReport, isAbVariant, pickWinner } from "@/lib/ab";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";

export default async function AdminExperimentsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}>) {
  const admin = await requireSuperadmin();
  const period = resolvePeriod(await searchParams);
  const range = periodFilter(period);

  const [nominals, views, orders] = await Promise.all([
    prisma.nominal.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.abStat.groupBy({
      by: ["variant"],
      where: range ? { day: range } : undefined,
      _sum: { views: true },
    }),
    prisma.order.groupBy({
      by: ["abVariant"],
      where: { status: "paid", ...(range ? { createdAt: range } : {}) },
      _sum: { amountKzt: true },
      _count: { _all: true },
    }),
  ]);

  const experimentOn = nominals.some((n) => isAbVariant(n.variant));
  const viewsBy = new Map(views.map((v) => [v.variant, v._sum.views ?? 0]));
  const ordersBy = new Map(
    orders.map((o) => [o.abVariant, { count: o._count._all, sum: o._sum.amountKzt ?? 0 }]),
  );

  const report = buildReport(
    AB_VARIANTS.map((variant) => ({
      variant,
      views: viewsBy.get(variant) ?? 0,
      orders: ordersBy.get(variant)?.count ?? 0,
      revenueKzt: ordersBy.get(variant)?.sum ?? 0,
    })),
  );
  const winner = pickWinner(report);
  const best = Math.max(1, ...report.map((r) => r.revenuePerViewKzt));

  return (
    <AdminChrome email={admin.email} role={admin.role} title="A/B-тест цен">
      <p className="mb-5 max-w-3xl text-sm text-brand-purple-950/60">
        Половина посетителей видит набор номиналов группы A, половина — группы B
        (плюс номиналы без группы — их видят все). Группа закрепляется за
        посетителем на полгода и запоминается в заказе. Настройка — в{" "}
        <Link href="/admin/nominals" className="font-semibold text-brand-gold hover:underline">
          разделе «Номиналы»
        </Link>
        .
      </p>

      <PeriodPicker basePath="/admin/experiments" period={period} />

      {!experimentOn && (
        <p className="mb-5 rounded-xl border border-brand-gold/50 bg-brand-gold-100/40 px-4 py-3 text-sm">
          Тест сейчас не идёт: ни одному номиналу не назначена группа, все видят
          одно и то же. Цифры ниже — история прошлых тестов, если они были.
        </p>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        {report.map((r) => {
          const group = nominals.filter((n) => n.variant === r.variant);
          const common = nominals.filter((n) => !isAbVariant(n.variant));
          return (
            <section
              key={r.variant}
              className={`rounded-2xl border bg-white p-5 ${
                winner?.variant === r.variant
                  ? "border-brand-gold shadow-md"
                  : "border-brand-purple-100"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-brand-purple">
                  Группа {r.variant}
                </h2>
                {winner?.variant === r.variant && (
                  <span className="rounded-full bg-brand-gold-100 px-2.5 py-0.5 text-xs font-bold text-brand-gold-700">
                    Лидирует
                  </span>
                )}
              </div>

              <dl className="space-y-1.5 text-sm">
                <Row label="Показов конструктора" value={String(r.views)} />
                <Row label="Оплаченных заказов" value={String(r.orders)} />
                <Row label="Конверсия" value={`${r.conversion.toFixed(2)} %`} />
                <Row label="Выручка" value={formatKzt(r.revenueKzt)} />
                <Row label="Средний чек" value={formatKzt(r.avgCheckKzt)} />
                <Row
                  label="Выручка на показ"
                  value={formatKzt(r.revenuePerViewKzt)}
                  strong
                />
              </dl>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-brand-purple-50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-gold"
                  style={{ width: `${Math.round((r.revenuePerViewKzt / best) * 100)}%` }}
                />
              </div>

              <div className="mt-3 text-xs text-brand-purple-950/50">
                Номиналы:{" "}
                {group.length
                  ? group.map((n) => formatKzt(n.amountKzt)).join(", ")
                  : "—"}
                {common.length > 0 && (
                  <> · общие: {common.map((n) => formatKzt(n.amountKzt)).join(", ")}</>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
        <h2 className="mb-2 text-sm font-bold text-brand-purple">Вывод</h2>
        {winner ? (
          <p className="text-sm text-brand-purple-950/75">
            Группа <b>{winner.variant}</b> приносит на{" "}
            <b>{winner.upliftPct.toFixed(0)}%</b> больше выручки на показ. Можно
            оставить её номиналы и снять группы с остальных — тогда победивший
            набор увидят все.
          </p>
        ) : (
          <p className="text-sm text-brand-purple-950/60">
            Победителя пока нет: нужно не меньше 100 показов на группу и разрыв
            больше 5%. Пока разница в пределах случайной — решение принимать
            рано.
          </p>
        )}
      </section>
    </AdminChrome>
  );
}

function Row({
  label,
  value,
  strong,
}: Readonly<{ label: string; value: string; strong?: boolean }>) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brand-purple-950/60">{label}</dt>
      <dd className={strong ? "font-bold text-brand-purple" : "font-semibold"}>
        {value}
      </dd>
    </div>
  );
}
