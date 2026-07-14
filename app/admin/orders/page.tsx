import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { prisma } from "@/lib/db";
import { hashCode, isValidCodeFormat } from "@/lib/certificate-code";
import { formatKzt } from "@/lib/format";
import type { Prisma } from "@/lib/generated/prisma/client";

const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  expired: "Протух",
  cancelled: "Отменён",
  refunded: "Возврат",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  expired: "bg-brand-purple-50 text-brand-purple-950/50",
  cancelled: "bg-brand-purple-50 text-brand-purple-950/50",
  refunded: "bg-red-50 text-brand-red",
};

const PROVIDER_LABEL: Record<string, string> = {
  kaspi: "Kaspi",
  freedom: "Freedom",
  forte: "Forte",
  mock: "Демо",
};

const SYNC_MARK: Record<string, string> = {
  pending: "⏳",
  synced: "✓",
  failed: "✕",
};

export default async function AdminOrdersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    q?: string;
    status?: string;
    salon?: string;
    from?: string;
    to?: string;
  }>;
}>) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";

  const where: Prisma.OrderWhereInput = {};
  if (sp.status && STATUS_LABEL[sp.status]) {
    where.status = sp.status as Prisma.OrderWhereInput["status"];
  }
  const salonId = sp.salon ? Number(sp.salon) : NaN;
  if (Number.isFinite(salonId)) where.salonId = salonId;

  if (sp.from || sp.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (sp.from) createdAt.gte = new Date(sp.from);
    if (sp.to) {
      const to = new Date(sp.to);
      to.setHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
    where.createdAt = createdAt;
  }

  if (query) {
    const or: Prisma.OrderWhereInput[] = [
      { buyerEmail: { contains: query, mode: "insensitive" } },
      { buyerPhone: { contains: query } },
    ];
    if (isValidCodeFormat(query)) {
      or.push({ certificates: { some: { codeHash: hashCode(query) } } });
    }
    where.OR = or;
  }

  const [salons, orders] = await Promise.all([
    prisma.salon.findMany({ orderBy: { sort: "asc" } }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        salon: true,
        certificates: {
          select: {
            codeDisplay: true,
            serial: true,
            status: true,
            altegioSyncStatus: true,
          },
        },
      },
    }),
  ]);

  const inputCls =
    "rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-gold";

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Заказы">
      <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
        <input
          name="q"
          defaultValue={query}
          placeholder="Код IMB-…, email или телефон"
          className={`min-w-[200px] flex-1 ${inputCls}`}
        />
        <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="salon" defaultValue={sp.salon ?? ""} className={inputCls}>
          <option value="">Все филиалы</option>
          {salons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.city} · {s.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-brand-purple-950/55">
          с
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={inputCls} />
        </label>
        <label className="flex items-center gap-1 text-xs text-brand-purple-950/55">
          по
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={inputCls} />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-brand-purple px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-purple-600"
        >
          Фильтр
        </button>
        <Link
          href="/admin/orders"
          className="rounded-xl border border-brand-purple-100 px-4 py-2.5 text-sm text-brand-purple-950/60 hover:bg-brand-purple-50"
        >
          Сброс
        </Link>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Дата</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3 font-semibold">Сумма</th>
              <th className="px-4 py-3 font-semibold">Оплата</th>
              <th className="px-4 py-3 font-semibold">Филиал</th>
              <th className="px-4 py-3 font-semibold">Покупатель</th>
              <th className="px-4 py-3 font-semibold">Сертификат</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const cert = order.certificates[0];
              return (
                <tr
                  key={order.id}
                  className="border-b border-brand-purple-100/60 last:border-0 hover:bg-brand-purple-50/40"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium text-brand-purple hover:underline"
                    >
                      {order.createdAt
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[order.status] ?? ""}`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatKzt(order.amountKzt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-brand-purple-950/70">
                    {order.paymentProvider
                      ? (PROVIDER_LABEL[order.paymentProvider] ??
                        order.paymentProvider)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{order.salon.city}</td>
                  <td className="px-4 py-3">{order.buyerEmail}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {cert ? (
                      <>
                        {cert.serial ? `${cert.serial} · ` : ""}
                        {cert.codeDisplay}
                        <span
                          className="ml-1 text-brand-purple-950/45"
                          title={`Altegio: ${cert.altegioSyncStatus}`}
                        >
                          {SYNC_MARK[cert.altegioSyncStatus] ?? ""}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-brand-purple-950/50"
                >
                  Ничего не найдено.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminChrome>
  );
}
