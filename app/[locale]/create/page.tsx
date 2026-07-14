import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BuilderClient } from "@/components/builder-client";
import {
  getActiveDesigns,
  getActiveNominals,
  getActivePrograms,
  getActiveSalons,
  getCurrentLegalVersionIds,
  getCustomAmountBounds,
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
  return { title: t("title") };
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

  const [salons, programs, nominals, designs, bounds, versionIds] =
    await Promise.all([
      getActiveSalons(),
      getActivePrograms(),
      getActiveNominals(),
      getActiveDesigns(),
      getCustomAmountBounds(),
      getCurrentLegalVersionIds(),
    ]);

  const initialOptionId = Number(query.option) || undefined;
  const initialNominalId = Number(query.nominal) || undefined;

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
          salons={salons.map(toSalonDto)}
          programs={programs.map((p) => toProgramDto(p, locale))}
          nominals={nominals.map(toNominalDto)}
          designs={designs.map((d) => toDesignDto(d, locale))}
          bounds={bounds}
          consentHtml=""
          consentVersionsKey={JSON.stringify(versionIds)}
          initialOptionId={initialOptionId}
          initialNominalId={initialNominalId}
          initialType={query.type === "nominal" ? "nominal" : undefined}
        />
      </div>
    </main>
  );
}
