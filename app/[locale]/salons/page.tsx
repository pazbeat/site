import type { Metadata } from "next";
import { headers } from "next/headers";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getActiveSalons } from "@/lib/data";
import { toSalonDto } from "@/lib/dto";
import { localeAlternates, SITE_URL } from "@/lib/seo";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Salons" });
  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: localeAlternates(locale, "/salons"),
  };
}

export default async function SalonsPage({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Salons");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const salons = (await getActiveSalons()).map((s) => ({
    ...toSalonDto(s, locale),
    phone: s.phone,
    name: s.name,
  }));
  const cities = [...new Map(salons.map((s) => [s.cityKey, s.city])).entries()];

  // LocalBusiness-разметка для локальной выдачи Google/Yandex
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: salons.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "DaySpa",
        name: `Imbir Thai Spa — ${s.name}`,
        address: { "@type": "PostalAddress", addressLocality: s.city, streetAddress: s.address },
        telephone: s.phone ?? undefined,
        url: `${SITE_URL}/${locale}/salons`,
      },
    })),
  };

  return (
    <main className="flex-1 py-14 sm:py-18">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 text-brand-purple-950/65">{t("subtitle")}</p>
        </div>

        <div className="space-y-10">
          {cities.map(([key, city]) => (
            <section key={key}>
              <h2 className="mb-4 font-display text-2xl font-semibold text-brand-purple">
                {city}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {salons
                  .filter((s) => s.cityKey === key)
                  .map((s) => (
                    <article
                      key={s.id}
                      className="flex flex-col rounded-2xl border border-brand-purple-100 bg-white p-5 transition-shadow hover:shadow-lg"
                    >
                      <h3 className="font-display text-lg font-semibold text-brand-purple">
                        {s.name}
                      </h3>
                      <p className="mt-1 flex-1 text-sm text-brand-purple-950/70">
                        {s.address}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        {s.phone && (
                          <a
                            href={`tel:${s.phone.replaceAll(/[^\d+]/g, "")}`}
                            className="font-semibold text-brand-purple hover:underline"
                          >
                            {s.phone}
                          </a>
                        )}
                        <a
                          href={`https://2gis.kz/search/${encodeURIComponent(`${s.city}, ${s.address}`)}`}
                          target="_blank"
                          rel="noopener"
                          className="text-brand-gold-700 hover:underline"
                        >
                          {t("map")} ↗
                        </a>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/create"
            className="bg-gold-gradient inline-block rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            {t("cta")}
          </Link>
        </div>
      </div>
    </main>
  );
}
