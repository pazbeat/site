import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { LegalEditor } from "@/components/admin/legal-editor";
import { prisma } from "@/lib/db";

const TYPE_LABEL: Record<string, string> = {
  consent_modal: "Текст consent-модалки",
  offer: "Публичная оферта",
  privacy: "Политика конфиденциальности",
  rules: "Правила использования",
};

export default async function AdminLegalPage() {
  const admin = await requireSuperadmin();

  const documents = await prisma.legalDocument.findMany({
    include: {
      currentVersion: true,
      versions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  const byType = new Map(documents.map((d) => [d.type, d]));

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Правовые тексты">
      <p className="mb-5 max-w-2xl text-sm text-brand-purple-950/60">
        Каждое сохранение создаёт новую неизменяемую версию. Старые версии
        сохраняются — на них ссылаются записи согласий покупателей. Публикуется
        последняя версия. HTML санитизируется на сервере.
      </p>
      <div className="space-y-4">
        {(["consent_modal", "offer", "privacy", "rules"] as const).map((type) => {
          const doc = byType.get(type);
          return (
            <LegalEditor
              key={type}
              type={type}
              label={TYPE_LABEL[type]}
              currentHtml={doc?.currentVersion?.contentHtmlSanitized ?? ""}
              currentLang={doc?.currentVersion?.lang ?? "ru"}
              history={
                doc?.versions.map((v) => ({
                  id: v.id,
                  lang: v.lang,
                  createdAt: v.createdAt.toISOString().slice(0, 16).replace("T", " "),
                  isCurrent: v.id === doc.currentVersionId,
                })) ?? []
              }
            />
          );
        })}
      </div>
    </AdminChrome>
  );
}
