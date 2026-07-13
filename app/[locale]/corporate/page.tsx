import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { CorporateForm } from "@/components/corporate-form";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Corporate" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function CorporatePage({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Corporate");

  return (
    <main className="flex-1 py-14 sm:py-18">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <p className="mb-3 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 text-brand-purple-950/65">{t("subtitle")}</p>
        </div>
        <CorporateForm />
      </div>
    </main>
  );
}
