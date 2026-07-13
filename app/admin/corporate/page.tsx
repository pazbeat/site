import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { StatusSelect } from "@/components/admin/status-select";
import { setCorporateStatusAction } from "./actions";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

const STATUS_OPTIONS = [
  { value: "new", label: "Новая" },
  { value: "in_progress", label: "В работе" },
  { value: "closed", label: "Закрыта" },
];

export default async function AdminCorporatePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ status?: string }> }>) {
  const admin = await requireAdmin();
  const { status } = await searchParams;

  const where: Prisma.CorporateRequestWhereInput = {};
  if (status && STATUS_OPTIONS.some((o) => o.value === status)) {
    where.status = status as Prisma.CorporateRequestWhereInput["status"];
  }

  const requests = await prisma.corporateRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminChrome
      email={admin.email}
      role={admin.role}
      title="Корпоративные заявки"
    >
      <form className="mb-5 flex flex-wrap gap-3" method="get">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-gold"
        >
          <option value="">Все статусы</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-brand-purple px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-purple-600"
        >
          Фильтр
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Дата</th>
              <th className="px-4 py-3 font-semibold">Компания</th>
              <th className="px-4 py-3 font-semibold">Контакт</th>
              <th className="px-4 py-3 font-semibold">Кол-во</th>
              <th className="px-4 py-3 font-semibold">Комментарий</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr
                key={r.id}
                className="border-b border-brand-purple-100/60 align-top last:border-0"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-3 font-medium">{r.company}</td>
                <td className="px-4 py-3">{r.contact}</td>
                <td className="px-4 py-3">{r.qty}</td>
                <td className="px-4 py-3 max-w-[280px] text-brand-purple-950/70">
                  {r.comment || "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusSelect
                    id={r.id}
                    value={r.status}
                    options={STATUS_OPTIONS}
                    action={setCorporateStatusAction}
                  />
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-brand-purple-950/50"
                >
                  Заявок нет.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminChrome>
  );
}
