import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { priceHref } from "@/lib/price-list";
import { getActivePrograms } from "@/lib/data";
import { toProgramDto } from "@/lib/dto";
import { formatKzt } from "@/lib/format";

type Category = "massage" | "spa" | "set";

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

const CATEGORY_ORDER: Category[] = ["massage", "set", "spa"];
const CATEGORY_KEY = {
  massage: "filterMassage",
  spa: "filterSpa",
  set: "filterSet",
} as const;

export default async function PricesPage({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Prices");
  const tCat = await getTranslations("Catalog");
  const tCommon = await getTranslations("Common");
  const tNav = await getTranslations("Nav");
  const pdf = priceHref(locale);

  const programs = (await getActivePrograms()).map((p) => toProgramDto(p, locale));

  // Компактная подсказка длительности/персон для строки прайса
  const hint = (options: (typeof programs)[number]["options"]): string => {
    const durations = options.map((o) => o.durationMin).filter((d): d is number => !!d);
    const persons = options.map((o) => o.persons).filter((p): p is number => !!p);
    if (durations.length) {
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      const range = min === max ? `${min}` : `${min}–${max}`;
      return `${range} ${tCommon("min")}`;
    }
    if (persons.length) return tCommon("guests", { count: Math.max(...persons) });
    return "";
  };

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: tCat(CATEGORY_KEY[cat]),
    items: programs.filter((p) => p.category === cat),
  })).filter((g) => g.items.length);

  return (
    <main className="flex-1">
      {/* Тёмная полоса-заголовок */}
      <section className="bg-page-hero pt-14 pb-16 text-white sm:pt-16">
        <div className="mx-auto max-w-6xl px-5">
          <p className="mb-5 text-xs tracking-[0.14em] text-white/50 uppercase">
            <Link href="/" className="text-brand-gold-300 hover:underline">
              {tNav("home")}
            </Link>{" "}
            · {t("eyebrow")}
          </p>
          <h1 className="font-display text-5xl font-medium sm:text-6xl">{t("title")}</h1>
          <p className="mt-5 max-w-xl text-white/75">{t("subtitle")}</p>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-5">
          {groups.map((group) => (
            <div key={group.cat} className="mb-14 last:mb-0">
              <h2 className="mb-6 font-display text-3xl font-medium text-brand-purple">
                {group.label}
              </h2>
              <div>
                {group.items.map((p) => {
                  const minPrice = p.options.length
                    ? Math.min(...p.options.map((o) => o.priceKzt))
                    : 0;
                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-brand-purple-100 py-4"
                    >
                      <span className="font-semibold text-brand-purple-950">{p.name}</span>
                      <span className="text-xs text-brand-purple-950/60">{hint(p.options)}</span>
                      <span className="hidden flex-1 -translate-y-1 border-b border-dashed border-brand-purple-100 sm:block" />
                      <span className="ml-auto font-display text-2xl text-brand-gold-700 sm:ml-0">
                        {tCommon("from", { price: formatKzt(minPrice) })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/create"
              className="bg-gold-gradient rounded-full px-7 py-3.5 text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5"
            >
              {tNav("giftCta")}
            </Link>
            <a
              href={pdf}
              target="_blank"
              rel="noopener"
              className="rounded-full border-[1.5px] border-brand-purple px-7 py-3.5 text-sm font-bold text-brand-purple transition-colors hover:bg-brand-purple-50"
            >
              {t("open")}
            </a>
            <a
              href={pdf}
              download
              className="rounded-full px-7 py-3.5 text-sm font-bold text-brand-purple-950/70 transition-colors hover:text-brand-purple"
            >
              {t("download")}
            </a>
          </div>
          <p className="mt-5 text-xs text-brand-purple-950/55">{t("note")}</p>
        </div>
      </section>
    </main>
  );
}
