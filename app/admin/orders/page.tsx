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

export default async function AdminOrdersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; status?: string }> }>) {
  const admin = await requireAdmin();
  const { q, status } = await searchParams;
  const query = q?.trim() ?? "";

  const where: Prisma.OrderWhereInput = {};
  if (status && STATUS_LABEL[status]) {
    where.status = status as Prisma.OrderWhereInput["status"];
  }
  if (query) {
    const or: Prisma.OrderWhereInput[] = [
      { buyerEmail: { contains: query, mode: "insensitive" } },
      { buyerPhone: { contains: query } },
    ];
    // Поиск по коду сертификата — через хэш (открытый код не хранится)
    if (isValidCodeFormat(query)) {
      or.push({ certificates: { some: { codeHash: hashCode(query) } } });
    }
    where.OR = or;
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      salon: true,
      certificates: {
        select: { codeDisplay: true, serial: true, status: true },
      },
    },
  });

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Заказы">
      <form className="mb-5 flex flex-wrap gap-3" method="get">
        <input
          name="q"
          defaultValue={query}
          placeholder="Код IMB-…, email или телефон"
          className="min-w-[240px] flex-1 rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-gold"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-gold"
        >
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-brand-purple px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-purple-600"
        >
          Искать
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Дата</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3 font-semibold">Сумма</th>
              <th className="px-4 py-3 font-semibold">Филиал</th>
              <th className="px-4 py-3 font-semibold">Покупатель</th>
              <th className="px-4 py-3 font-semibold">Сертификат</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-brand-purple-100/60 last:border-0 hover:bg-brand-purple-50/40"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="font-medium text-brand-purple hover:underline"
                  >
                    {order.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </Link>
                </td>
                <td className="px-4 py-3">{STATUS_LABEL[order.status]}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatKzt(order.amountKzt)}
                </td>
                <td className="px-4 py-3">{order.salon.city}</td>
                <td className="px-4 py-3">{order.buyerEmail}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {order.certificates[0]
                    ? `${order.certificates[0].serial ? order.certificates[0].serial + " · " : ""}${order.certificates[0].codeDisplay}`
                    : "—"}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td
                  colSpan={6}
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
