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

/** Последняя редакция на данном языке — так же её выбирает и публичная часть. */
function latestByLang(
  versions: Array<{ lang: string; contentHtmlSanitized: string }> | undefined,
  lang: string,
): string {
  return versions?.find((v) => v.lang === lang)?.contentHtmlSanitized ?? "";
}

export default async function AdminLegalPage() {
  const admin = await requireSuperadmin();

  const documents = await prisma.legalDocument.findMany({
    include: {
      currentVersion: true,
      // Без обрезки: согласие трёхмесячной давности может ссылаться на
      // редакцию, которая в пятёрку последних уже не попадает, — а именно её
      // и потребуется открыть в споре.
      versions: { orderBy: { createdAt: "desc" } },
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
              // Текст КАЖДОГО языка: переключатель раньше менял только метку
              // формы, а в поле оставался русский текст. Сохранение в таком
              // виде записывало русское содержимое как казахскую редакцию —
              // ту самую, которую видят и принимают казахские покупатели.
              // RU берём из опубликованной редакции, остальные — из последней
              // на этом языке, ровно как их отдаёт сайт.
              byLang={{
                ru: doc?.currentVersion?.contentHtmlSanitized ?? "",
                kk: latestByLang(doc?.versions, "kk"),
                en: latestByLang(doc?.versions, "en"),
              }}
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
