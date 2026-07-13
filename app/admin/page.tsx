import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
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

export default async function AdminDashboard() {
  const admin = await requireAdmin();
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  const [
    paidAgg,
    revenue30,
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
      where: { status: "paid", createdAt: { gte: since30 } },
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
    { label: "Выручка за 30 дней", value: formatKzt(revenue30._sum.amountKzt ?? 0) },
    { label: "Продаж за 30 дней", value: String(revenue30._count) },
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
                <span className="text-brand-purple-950/70">{label}</span>
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
    </AdminChrome>
  );
}
