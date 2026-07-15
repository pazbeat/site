import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getLegalVersionForLocale } from "@/lib/data";

const TYPES = ["offer", "privacy", "rules"] as const;
type LegalType = (typeof TYPES)[number];

function isLegalType(value: string): value is LegalType {
  return (TYPES as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: Locale; type: string }>;
}>): Promise<Metadata> {
  const { locale, type } = await params;
  if (!isLegalType(type)) return {};
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t(type) };
}

export default async function LegalPage({
  params,
}: Readonly<{ params: Promise<{ locale: Locale; type: string }> }>) {
  const { locale, type } = await params;
  if (!isLegalType(type)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  const version = await getLegalVersionForLocale(type, locale);
  if (!version) notFound();

  return (
    <main className="flex-1 py-14 sm:py-18">
      <div className="mx-auto max-w-3xl px-5">
        <h1 className="mb-6 font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
          {t(type)}
        </h1>
        {locale !== "ru" && version.lang === "ru" && (
          <p className="mb-5 rounded-xl border border-brand-gold/50 bg-brand-gold-100/40 px-4 py-3 text-sm">
            {t("onlyRu")}
          </p>
        )}
        <article
          className="legal-content max-w-none text-sm text-brand-purple-950"
          // Контент санитизирован на сервере при сохранении (PRD §6.4, §9.2)
          dangerouslySetInnerHTML={{ __html: version.contentHtmlSanitized }}
        />
      </div>
    </main>
  );
}
