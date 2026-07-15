import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { priceHref } from "@/lib/price-list";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Prices" });
  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: localeAlternates(locale, "/prices"),
  };
}

export default async function PricesPage({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Prices");
  const pdf = priceHref(locale);

  return (
    <main className="flex-1 py-14 sm:py-18">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="mb-3 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 text-brand-purple-950/65">{t("subtitle")}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href={pdf}
              target="_blank"
              rel="noopener"
              className="bg-gold-gradient rounded-full px-7 py-3.5 text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5"
            >
              {t("open")}
            </a>
            <a
              href={pdf}
              download
              className="rounded-full border-[1.5px] border-brand-purple px-7 py-3.5 text-sm font-bold text-brand-purple transition-colors hover:bg-brand-purple-50"
            >
              {t("download")}
            </a>
            <Link
              href="/create"
              className="rounded-full bg-brand-purple px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600"
            >
              {t("cta")}
            </Link>
          </div>
          <p className="mt-4 text-xs text-brand-purple-950/55">{t("note")}</p>
        </div>

        {/* Встроенный просмотр: на телефонах браузеры не рендерят PDF во
            фрейме — там прячем, работает кнопка «Открыть PDF» */}
        <iframe
          src={pdf}
          title={t("title")}
          className="hidden h-[80vh] w-full rounded-2xl border border-brand-purple-100 bg-white shadow-sm sm:block"
        />
      </div>
    </main>
  );
}
