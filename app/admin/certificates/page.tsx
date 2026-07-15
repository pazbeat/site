import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { prisma } from "@/lib/db";
import { hashCode, isValidCodeFormat } from "@/lib/certificate-code";
import { formatKzt } from "@/lib/format";
import type { Prisma } from "@/lib/generated/prisma/client";

const CERT_STATUS: Record<string, string> = {
  active: "Активен",
  partially_used: "Частично использован",
  used: "Использован",
  expired: "Истёк",
  refunded: "Возвращён",
  blocked: "Заблокирован",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  partially_used: "bg-amber-50 text-amber-700",
  used: "bg-brand-purple-50 text-brand-purple-950/60",
  expired: "bg-brand-purple-50 text-brand-purple-950/50",
  refunded: "bg-brand-purple-50 text-brand-purple-950/60",
  blocked: "bg-red-50 text-brand-red",
};

const SYNC_LABEL: Record<string, string> = {
  pending: "⏳ Altegio",
  synced: "✓ Altegio",
  failed: "✕ Altegio",
  missing: "⚠ нет в Altegio",
};
const SYNC_BADGE: Record<string, string> = {
  pending: "text-amber-600",
  synced: "text-emerald-600",
  failed: "text-brand-red",
  missing: "text-brand-red",
};

export default async function AdminCertificatesPage({
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

  const where: Prisma.CertificateWhereInput = {};
  if (sp.status && CERT_STATUS[sp.status]) {
    where.status = sp.status as Prisma.CertificateWhereInput["status"];
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
    const or: Prisma.CertificateWhereInput[] = [
      { serial: { contains: query, mode: "insensitive" } },
      { order: { buyerEmail: { contains: query, mode: "insensitive" } } },
      { toName: { contains: query, mode: "insensitive" } },
      { fromName: { contains: query, mode: "insensitive" } },
    ];
    if (isValidCodeFormat(query)) or.push({ codeHash: hashCode(query) });
    where.OR = or;
  }

  const [salons, certificates] = await Promise.all([
    prisma.salon.findMany({ orderBy: { sort: "asc" } }),
    prisma.certificate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        salon: { select: { city: true, codePrefix: true } },
        order: { select: { id: true, buyerEmail: true } },
      },
    }),
  ]);

  const inputCls =
    "rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-gold";

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Сертификаты">
      <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
        <input
          name="q"
          defaultValue={query}
          placeholder="Код IMB-…, серийник, email, имя"
          className={`min-w-[220px] flex-1 ${inputCls}`}
        />
        <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
          <option value="">Все статусы</option>
          {Object.entries(CERT_STATUS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
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
          href="/admin/certificates"
          className="rounded-xl border border-brand-purple-100 px-4 py-2.5 text-sm text-brand-purple-950/60 hover:bg-brand-purple-50"
        >
          Сброс
        </Link>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Дата</th>
              <th className="px-4 py-3 font-semibold">Серийник / код</th>
              <th className="px-4 py-3 font-semibold">Баланс</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3 font-semibold">Филиал</th>
              <th className="px-4 py-3 font-semibold">Доставка</th>
              <th className="px-4 py-3 font-semibold">Altegio</th>
              <th className="px-4 py-3 font-semibold">Действует до</th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((c) => (
              <tr
                key={c.id}
                className="border-b border-brand-purple-100/60 last:border-0 hover:bg-brand-purple-50/40"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link
                    href={`/admin/orders/${c.order.id}`}
                    className="font-medium text-brand-purple hover:underline"
                  >
                    {c.createdAt.toISOString().slice(0, 10)}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.serial ? (
                    <span className="font-semibold">{c.serial}</span>
                  ) : null}
                  <span className="text-brand-purple-950/55">
                    {c.serial ? " · " : ""}
                    {c.codeDisplay}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-medium">
                  {formatKzt(c.balanceKzt)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[c.status] ?? ""}`}
                  >
                    {CERT_STATUS[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{c.salon.city}</td>
                <td className="px-4 py-3 whitespace-nowrap text-brand-purple-950/70">
                  {c.deliveryMethod === "whatsapp" ? "WhatsApp" : "Email"}
                  {c.sentAt ? " ✓" : c.scheduledAt ? " ⏱" : " …"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`text-xs font-semibold ${SYNC_BADGE[c.altegioSyncStatus] ?? ""}`}
                  >
                    {SYNC_LABEL[c.altegioSyncStatus] ?? c.altegioSyncStatus}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-brand-purple-950/70">
                  {c.validUntil.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
            {certificates.length === 0 && (
              <tr>
                <td
                  colSpan={8}
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
