import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { PeriodPicker } from "@/components/admin/period-picker";
import { periodFilter, resolvePeriod } from "@/lib/admin/period";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import { pickL10n } from "@/lib/l10n";

const CERT_STATUS_LABEL: Record<string, string> = {
  active: "Активные",
  partially_used: "Частично использованы",
  used: "Использованы",
  expired: "Истекли",
  refunded: "Возвращены",
  blocked: "Заблокированы",
};

export default async function AdminDashboard({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}>) {
  const admin = await requireAdmin();
  const period = resolvePeriod(await searchParams);
  const createdAt = periodFilter(period);
  const periodWhere = createdAt ? { createdAt } : {};

  const [
    paidAgg,
    revenuePeriod,
    activeAgg,
    pending,
    scheduled,
    certByStatus,
    topOptions,
    newCorporate,
    activePromos,
    recentOrders,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { status: "paid" },
      _sum: { amountKzt: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { status: "paid", ...periodWhere },
      _sum: { amountKzt: true },
      _count: true,
    }),
    prisma.certificate.aggregate({
      where: { status: { in: ["active", "partially_used"] } },
      _sum: { balanceKzt: true },
      _count: true,
    }),
    prisma.order.count({ where: { status: "pending" } }),
    prisma.certificate.count({
      where: { sentAt: null, scheduledAt: { not: null } },
    }),
    prisma.certificate.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.certificate.groupBy({
      by: ["programOptionId"],
      where: { type: "program", programOptionId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { programOptionId: "desc" } },
      take: 5,
    }),
    prisma.corporateRequest.count({ where: { status: "new" } }),
    prisma.promo.count({ where: { active: true } }),
    prisma.order.findMany({
      where: { status: "paid" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { salon: { select: { city: true } } },
    }),
  ]);

  // Продажи по филиалам за выбранный период
  const branchAgg = await prisma.order.groupBy({
    by: ["salonId"],
    where: { status: "paid", ...periodWhere },
    _sum: { amountKzt: true },
    _count: { _all: true },
  });
  const branchSalons = await prisma.salon.findMany({
    where: { id: { in: branchAgg.map((b) => b.salonId) } },
    select: { id: true, city: true, name: true },
  });
  const branchNameById = new Map(
    branchSalons.map((s) => [s.id, `${s.city} · ${s.name}`] as const),
  );
  const branchRows = branchAgg
    .map((b) => ({
      id: b.salonId,
      name: branchNameById.get(b.salonId) ?? "—",
      count: b._count._all,
      sum: b._sum.amountKzt ?? 0,
    }))
    .sort((a, b) => b.sum - a.sum);
  const branchMax = Math.max(1, ...branchRows.map((b) => b.sum));

  // Топ-программы: разворачиваем programOptionId → название программы
  const optionIds = topOptions
    .map((t) => t.programOptionId)
    .filter((id): id is number => id !== null);
  const options = await prisma.programOption.findMany({
    where: { id: { in: optionIds } },
    include: { program: { select: { names: true } } },
  });
  const optionName = new Map(
    options.map((o) => [o.id, pickL10n(o.program.names, "ru")] as const),
  );
  const topPrograms = topOptions.map((t) => ({
    name: optionName.get(t.programOptionId!) ?? "—",
    count: t._count._all,
  }));

  const statusCounts = new Map<string, number>(
    certByStatus.map((c) => [c.status, c._count._all]),
  );

  const cards = [
    {
      label: `Выручка · ${period.label}`,
      value: formatKzt(revenuePeriod._sum.amountKzt ?? 0),
    },
    { label: `Продаж · ${period.label}`, value: String(revenuePeriod._count) },
    { label: "Выручка всего", value: formatKzt(paidAgg._sum.amountKzt ?? 0) },
    { label: "Оплаченных заказов", value: String(paidAgg._count) },
    {
      label: "Активные обязательства",
      value: formatKzt(activeAgg._sum.balanceKzt ?? 0),
    },
    { label: "Действующих сертификатов", value: String(activeAgg._count) },
    { label: "Заказов в ожидании оплаты", value: String(pending) },
    { label: "Отложенных отправок", value: String(scheduled) },
    { label: "Новых корп. заявок", value: String(newCorporate) },
    { label: "Активных промокодов", value: String(activePromos) },
  ];

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Дашборд">
      <PeriodPicker basePath="/admin" period={period} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-brand-purple-100 bg-white p-5"
          >
            <div className="text-xs font-semibold tracking-wide text-brand-purple-950/55 uppercase">
              {card.label}
            </div>
            <div className="mt-2 font-display text-2xl text-brand-purple">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-brand-purple">
            Сертификаты по статусам
          </h2>
          <ul className="text-sm">
            {Object.entries(CERT_STATUS_LABEL).map(([key, label]) => (
              <li
                key={key}
                className="flex justify-between border-b border-brand-purple-100/60 py-1.5 last:border-0"
              >
                <Link
                  href={`/admin/certificates?status=${key}`}
                  className="text-brand-purple-950/70 hover:underline"
                >
                  {label}
                </Link>
                <span className="font-semibold">{statusCounts.get(key) ?? 0}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-brand-purple">
            Топ-программы
          </h2>
          {topPrograms.length ? (
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
          ) : (
            <p className="text-sm text-brand-purple-950/50">Пока нет продаж.</p>
          )}
        </section>

        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-brand-purple">
            Последние продажи
          </h2>
          {recentOrders.length ? (
            <ul className="text-sm">
              {recentOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex justify-between gap-2 border-b border-brand-purple-100/60 py-1.5 last:border-0"
                >
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="truncate text-brand-purple hover:underline"
                  >
                    {o.createdAt.toISOString().slice(5, 10)} · {o.salon.city}
                  </Link>
                  <span className="font-semibold whitespace-nowrap">
                    {formatKzt(o.amountKzt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-purple-950/50">Пока нет продаж.</p>
          )}
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-brand-purple-100 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-brand-purple">
            Продажи по филиалам · {period.label}
          </h2>
          <Link
            href={`/admin/sales?${new URLSearchParams(
              period.kind === "custom"
                ? { from: period.fromInput, to: period.toInput }
                : { month: period.key },
            )}`}
            className="text-xs font-semibold text-brand-gold hover:underline"
          >
            Подробнее →
          </Link>
        </div>
        {branchRows.length ? (
          <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {branchRows.map((b) => (
              <li key={b.id} className="py-1">
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <Link
                    href={`/admin/orders?salon=${b.id}&status=paid`}
                    className="truncate text-brand-purple-950/80 hover:underline"
                  >
                    {b.name}
                  </Link>
                  <span className="whitespace-nowrap font-semibold text-brand-purple">
                    {formatKzt(b.sum)}{" "}
                    <span className="font-normal text-brand-purple-950/45">
                      · {b.count}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-purple-50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-gold"
                    style={{ width: `${Math.round((b.sum / branchMax) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-purple-950/50">
            Нет продаж за период.
          </p>
        )}
      </section>
    </AdminChrome>
  );
}
