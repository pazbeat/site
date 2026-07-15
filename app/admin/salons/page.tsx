import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { SalonsAdmin, type AdminSalon } from "@/components/admin/salons-admin";
import { prisma } from "@/lib/db";
import { pickL10n } from "@/lib/l10n";

export default async function AdminSalonsPage() {
  const admin = await requireSuperadmin();
  const salons = await prisma.salon.findMany({ orderBy: { sort: "asc" } });
  const [orderCounts, certCounts] = await Promise.all([
    prisma.order.groupBy({ by: ["salonId"], _count: { _all: true } }),
    prisma.certificate.groupBy({ by: ["salonId"], _count: { _all: true } }),
  ]);
  const ordersById = new Map(orderCounts.map((c) => [c.salonId, c._count._all]));
  const certsById = new Map(certCounts.map((c) => [c.salonId, c._count._all]));

  const items: AdminSalon[] = salons.map((s) => ({
    id: s.id,
    city: s.city,
    cityKk: pickL10n(s.cityNames, "kk") || s.city,
    cityEn: pickL10n(s.cityNames, "en") || s.city,
    name: s.name,
    address: s.address,
    addressKk: pickL10n(s.addressNames, "kk") || s.address,
    addressEn: pickL10n(s.addressNames, "en") || s.address,
    phone: s.phone,
    codePrefix: s.codePrefix,
    altegioLocationId: s.altegioLocationId,
    active: s.active,
    ordersCount: ordersById.get(s.id) ?? 0,
    certsCount: certsById.get(s.id) ?? 0,
  }));

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Города и филиалы">
      <p className="mb-5 max-w-3xl text-sm text-brand-purple-950/60">
        Города и адреса, которые покупатель выбирает на первом шаге конструктора.
        Русское название города — ключ: по нему программы понимают, где они
        доступны (раздел «Программы»), поэтому меняйте его через «Изменить город»
        — тогда программы обновятся заодно. Порядок здесь = порядок в
        конструкторе.
      </p>
      <SalonsAdmin salons={items} />
    </AdminChrome>
  );
}
