import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ entity?: string; actor?: string; page?: string }>;
}>) {
  const admin = await requireSuperadmin();
  const { entity, actor, page } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);

  const where: Prisma.AuditLogWhereInput = {};
  if (entity?.trim()) where.entity = entity.trim();
  if (actor?.trim()) {
    where.actor = { contains: actor.trim(), mode: "insensitive" };
  }

  const [logs, total, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (entity) params.set("entity", entity);
    if (actor) params.set("actor", actor);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Аудит-лог">
      <form className="mb-5 flex flex-wrap gap-3" method="get">
        <select
          name="entity"
          defaultValue={entity ?? ""}
          className="rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-gold"
        >
          <option value="">Все сущности</option>
          {entities.map((e) => (
            <option key={e.entity} value={e.entity}>
              {e.entity}
            </option>
          ))}
        </select>
        <input
          name="actor"
          defaultValue={actor ?? ""}
          placeholder="Автор (email)"
          className="min-w-[200px] flex-1 rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-gold"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand-purple px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-purple-600"
        >
          Фильтр
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Время</th>
              <th className="px-4 py-3 font-semibold">Автор</th>
              <th className="px-4 py-3 font-semibold">Действие</th>
              <th className="px-4 py-3 font-semibold">Сущность</th>
              <th className="px-4 py-3 font-semibold">Изменения</th>
              <th className="px-4 py-3 font-semibold">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-brand-purple-100/60 align-top last:border-0"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {log.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-4 py-3 break-all">{log.actor}</td>
                <td className="px-4 py-3 font-medium">{log.action}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {log.entity}
                  <span className="block text-xs text-brand-purple-950/50">
                    {log.entityId}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[280px]">
                  {log.diff ? (
                    <code className="block overflow-x-auto text-xs text-brand-purple-950/70">
                      {JSON.stringify(log.diff)}
                    </code>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{log.ip ?? "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-brand-purple-950/50"
                >
                  Записей нет.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-brand-purple-950/55">
            Стр. {pageNum} из {pages} · всего {total}
          </span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link
                href={qs(pageNum - 1)}
                className="rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-1.5 font-semibold hover:border-brand-gold"
              >
                ← Назад
              </Link>
            )}
            {pageNum < pages && (
              <Link
                href={qs(pageNum + 1)}
                className="rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-1.5 font-semibold hover:border-brand-gold"
              >
                Вперёд →
              </Link>
            )}
          </div>
        </div>
      )}
    </AdminChrome>
  );
}
