import type { Metadata } from "next";
import { cookies } from "next/headers";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { BuilderClient } from "@/components/builder-client";
import { AB_COOKIE, filterByVariant, isAbVariant } from "@/lib/ab";
import {
  getActiveDesigns,
  getActiveNominals,
  getActivePrograms,
  getActiveSalons,
  getCurrentLegalVersionIds,
  getCustomAmountBounds,
  getLegalVersionForLocale,
} from "@/lib/data";
import {
  toDesignDto,
  toNominalDto,
  toProgramDto,
  toSalonDto,
} from "@/lib/dto";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Builder" });
  return { title: t("title"), alternates: localeAlternates(locale, "/create") };
}

export default async function CreatePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ option?: string; nominal?: string; type?: string }>;
}>) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Builder");

  const [salons, programs, nominals, designs, bounds, versionIds, consentDoc] =
    await Promise.all([
      getActiveSalons(),
      getActivePrograms(),
      getActiveNominals(),
      getActiveDesigns(),
      getCustomAmountBounds(),
      getCurrentLegalVersionIds(),
      // Текст consent-модалки из админки (PRD §5.2), на языке посетителя;
      // санитизирован при сохранении. Пусто → встроенный текст из переводов.
      getLegalVersionForLocale("consent_modal", locale),
    ]);

  const initialOptionId = Number(query.option) || undefined;
  const initialNominalId = Number(query.nominal) || undefined;

  // A/B цен: показываем номиналы своей группы (PRD §10). Куку ставит proxy.
  const abRaw = (await cookies()).get(AB_COOKIE)?.value;
  const abVariant = isAbVariant(abRaw) ? abRaw : null;
  const visibleNominals = filterByVariant(nominals, abVariant);

  return (
    <main className="flex-1 py-14 sm:py-18">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto mb-9 max-w-xl text-center">
          <p className="mb-3 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
            {t("title")}
          </h1>
        </div>
        <BuilderClient
          salons={salons.map((s) => toSalonDto(s, locale))}
          programs={programs.map((p) => toProgramDto(p, locale))}
          nominals={visibleNominals.map(toNominalDto)}
          designs={designs.map((d) => toDesignDto(d, locale))}
          bounds={bounds}
          consentHtml={consentDoc?.contentHtmlSanitized ?? ""}
          consentVersionsKey={JSON.stringify(versionIds)}
          initialOptionId={initialOptionId}
          initialNominalId={initialNominalId}
          initialType={query.type === "nominal" ? "nominal" : undefined}
        />
      </div>
    </main>
  );
}
