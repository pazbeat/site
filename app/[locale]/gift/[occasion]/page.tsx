import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { ProgramCard } from "@/components/program-card";
import { getActivePrograms } from "@/lib/data";
import { toProgramDto } from "@/lib/dto";
import { OCCASIONS, getOccasion, pickOccasionPrograms } from "@/lib/occasions";

export function generateStaticParams() {
  return OCCASIONS.map((o) => ({ occasion: o.slug }));
}

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: Locale; occasion: string }>;
}>): Promise<Metadata> {
  const { locale, occasion: slug } = await params;
  const occasion = getOccasion(slug);
  if (!occasion) return {};
  return {
    title: occasion.names[locale],
    description: occasion.subtitle[locale],
    alternates: localeAlternates(locale, `/gift/${slug}`),
    openGraph: {
      title: `${occasion.emoji} ${occasion.names[locale]}`,
      description: occasion.subtitle[locale],
    },
  };
}

export default async function OccasionPage({
  params,
}: Readonly<{
  params: Promise<{ locale: Locale; occasion: string }>;
}>) {
  const { locale, occasion: slug } = await params;
  setRequestLocale(locale);
  const occasion = getOccasion(slug);
  if (!occasion) notFound();

  const t = await getTranslations("Occasion");
  const tNav = await getTranslations("Nav");

  const programs = (await getActivePrograms()).map((p) => toProgramDto(p, locale));
  const picks = pickOccasionPrograms(occasion, programs);

  return (
    <main className="flex-1">
      {/* Тематический hero под повод */}
      <section
        className="relative overflow-hidden px-5 pt-16 pb-20 text-center text-white sm:pt-20 sm:pb-24"
        style={{
          backgroundImage: `radial-gradient(1100px 600px at 80% -10%, ${occasion.accentTo}, transparent 60%), linear-gradient(150deg, ${occasion.accentFrom}, ${occasion.accentTo})`,
        }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="mb-5 text-5xl sm:text-6xl" aria-hidden>
            {occasion.emoji}
          </div>
          <p className="text-xs font-semibold tracking-[0.24em] text-brand-gold-300 uppercase">
            {occasion.names[locale]}
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">
            {occasion.headline[locale]}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-white/80">
            {occasion.lead[locale]}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/create"
              className="bg-gold-gradient rounded-full px-8 py-3.5 text-sm font-bold text-brand-purple-950 shadow-md transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
            >
              {tNav("giftCta")}
            </Link>
            <Link
              href="/programs"
              className="rounded-full border-[1.5px] border-white/40 px-8 py-3.5 text-sm font-bold text-white transition-colors hover:border-brand-gold-300 hover:text-brand-gold-300"
            >
              {t("allPrograms")}
            </Link>
          </div>
        </div>
      </section>

      {/* Подобранные под повод программы */}
      <section className="py-14 sm:py-18">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto mb-9 max-w-xl text-center">
            <h2 className="font-display text-2xl font-semibold text-brand-purple sm:text-3xl">
              {t("pickTitle")}
            </h2>
            <p className="mt-2 text-sm text-brand-purple-950/65">{t("pickSub")}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map((program) => (
              <ProgramCard key={program.id} program={program} />
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-brand-purple-950/60">
            {t("orAmount")}{" "}
            <Link
              href="/create?type=nominal"
              className="font-semibold text-brand-gold-700 underline underline-offset-4 hover:text-brand-gold"
            >
              {t("orAmountLink")}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
