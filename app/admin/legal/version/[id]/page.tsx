import { notFound } from "next/navigation";
import Link from "next/link";
import { createHash } from "node:crypto";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { prisma } from "@/lib/db";

const TYPE_LABEL: Record<string, string> = {
  consent_modal: "Текст consent-модалки",
  offer: "Публичная оферта",
  privacy: "Политика конфиденциальности",
  rules: "Правила использования",
};

const LANG_LABEL: Record<string, string> = {
  ru: "русская",
  kk: "казахская",
  en: "английская",
};

/**
 * Архивная редакция правового документа — только чтение.
 *
 * Ради неё всё версионирование и затевалось: согласие покупателя ссылается на
 * редакцию по номеру, и до появления этой страницы прочитать ТОТ САМЫЙ текст
 * было нельзя ниоткуда, кроме распаковки бэкапа. Запись «offer:13» без текста
 * в споре ничего не стоит.
 *
 * Доступна и менеджеру: смотреть — его работа, править правовые тексты
 * по-прежнему может только суперадмин.
 */
export default async function LegalVersionPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const admin = await requireAdmin();
  const { id } = await params;
  const versionId = Number(id);
  if (!Number.isInteger(versionId)) notFound();

  const version = await prisma.legalVersion.findUnique({
    where: { id: versionId },
    include: {
      document: { select: { type: true, currentVersionId: true } },
      author: { select: { email: true } },
    },
  });
  if (!version) notFound();

  // Пересчитываем отпечаток прямо сейчас и сверяем с записанным при создании.
  // Расхождение означает, что текст правили после того, как на редакцию
  // сослались согласия покупателей, — это надо видеть сразу и крупно.
  const actualHash = createHash("sha256")
    .update(version.contentHtmlSanitized, "utf8")
    .digest("hex");
  const stored = version.contentSha256;
  const tampered = stored !== null && stored !== actualHash;
  const isCurrent = version.document.currentVersionId === version.id;

  return (
    <AdminChrome
      email={admin.email}
      role={admin.role}
      title={`${TYPE_LABEL[version.document.type] ?? version.document.type} — редакция №${version.id}`}
    >
      <p className="mb-4 text-sm">
        <Link href="/admin/legal" className="text-brand-purple underline">
          ← Правовые тексты
        </Link>
      </p>

      <section className="mb-5 rounded-2xl border border-brand-purple-100 bg-white p-5">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-brand-purple-600">Документ</dt>
            <dd className="font-semibold">
              {TYPE_LABEL[version.document.type] ?? version.document.type}
            </dd>
          </div>
          <div>
            <dt className="text-brand-purple-600">Языковая редакция</dt>
            <dd className="font-semibold">
              {LANG_LABEL[version.lang] ?? version.lang}
              {isCurrent ? " · действующая" : " · архивная"}
            </dd>
          </div>
          <div>
            <dt className="text-brand-purple-600">Создана</dt>
            <dd className="font-mono">{version.createdAt.toISOString()}</dd>
          </div>
          <div>
            <dt className="text-brand-purple-600">Кем сохранена</dt>
            <dd>{version.author?.email ?? "импорт или сид (без автора)"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-brand-purple-600">Отпечаток текста (SHA-256)</dt>
            <dd className="font-mono text-xs break-all">
              {actualHash}
              {stored === null ? (
                <span className="ml-2 font-sans text-brand-purple-600">
                  (при создании не записывался — редакция старше этой возможности)
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        {tampered ? (
          <p className="mt-4 rounded-xl border border-brand-red bg-brand-red/5 p-3 text-sm font-bold text-brand-red">
            Отпечаток не сходится. При создании редакции был записан {stored}, а
            текст сейчас даёт {actualHash}. Значит содержимое правили после
            создания — предъявлять эту редакцию как доказательство нельзя, пока
            не разобрались.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
        <h2 className="mb-3 font-display text-lg text-brand-purple">Текст редакции</h2>
        <div
          className="legal-content max-w-none text-sm"
          // Содержимое санитизировано при сохранении (lib/admin/sanitize.ts)
          dangerouslySetInnerHTML={{ __html: version.contentHtmlSanitized }}
        />
      </section>
    </AdminChrome>
  );
}
