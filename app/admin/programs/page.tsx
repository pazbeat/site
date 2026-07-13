import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ToggleActiveButton } from "@/components/admin/toggle-active";
import { toggleProgramActiveAction } from "./actions";
import { prisma } from "@/lib/db";
import { pickL10n } from "@/lib/l10n";
import { formatKzt } from "@/lib/format";

export default async function AdminProgramsPage() {
  const admin = await requireSuperadmin();
  const programs = await prisma.program.findMany({
    orderBy: { sort: "asc" },
    include: { options: { orderBy: { priceKzt: "asc" } } },
  });

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Программы">
      <div className="mb-4">
        <Link
          href="/admin/programs/new"
          className="rounded-full bg-brand-purple px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-purple-600"
        >
          + Новая программа
        </Link>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Название</th>
              <th className="px-4 py-3 font-semibold">Категория</th>
              <th className="px-4 py-3 font-semibold">Цена от</th>
              <th className="px-4 py-3 font-semibold">Города</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {programs.map((p) => (
              <tr
                key={p.id}
                className="border-b border-brand-purple-100/60 last:border-0"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/programs/${p.id}`}
                    className="font-medium text-brand-purple hover:underline"
                  >
                    {pickL10n(p.names, "ru")}
                  </Link>
                  {p.popular && (
                    <span className="ml-2 text-xs text-brand-gold-700">★</span>
                  )}
                </td>
                <td className="px-4 py-3">{p.category}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.options.length
                    ? formatKzt(Math.min(...p.options.map((o) => o.priceKzt)))
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {p.cities.length ? p.cities.join(", ") : "вся сеть"}
                </td>
                <td className="px-4 py-3">
                  {p.active ? (
                    <span className="text-brand-purple">Активна</span>
                  ) : (
                    <span className="text-brand-purple-950/50">Скрыта</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <ToggleActiveButton
                    id={p.id}
                    active={p.active}
                    action={toggleProgramActiveAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminChrome>
  );
}
