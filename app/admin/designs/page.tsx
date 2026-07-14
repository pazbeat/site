import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { DesignsAdmin, type AdminDesign } from "@/components/admin/designs-admin";
import { prisma } from "@/lib/db";
import { pickL10n } from "@/lib/l10n";

export default async function AdminDesignsPage() {
  const admin = await requireSuperadmin();
  const designs = await prisma.design.findMany({ orderBy: { sort: "asc" } });
  const counts = await prisma.certificate.groupBy({
    by: ["designId"],
    _count: { _all: true },
  });
  const usedById = new Map(counts.map((c) => [c.designId, c._count._all]));

  const items: AdminDesign[] = designs.map((d) => ({
    id: d.id,
    nameRu: pickL10n(d.names, "ru"),
    nameKk: pickL10n(d.names, "kk"),
    nameEn: pickL10n(d.names, "en"),
    imageUrl: d.imageUrl,
    active: d.active,
    usedCount: usedById.get(d.id) ?? 0,
  }));

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Дизайны открыток">
      <p className="mb-5 max-w-2xl text-sm text-brand-purple-950/60">
        Художественные открытки, из которых покупатель выбирает оформление
        сертификата. Персонализация (кому/от/сообщение) и код с QR добавляются в
        фирменной панели под картинкой автоматически. Порядок здесь = порядок в
        конструкторе.
      </p>
      <DesignsAdmin designs={items} />
    </AdminChrome>
  );
}
