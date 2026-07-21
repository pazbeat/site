import type { Metadata } from "next";
import { cookies } from "next/headers";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { BuilderClient } from "@/components/builder-client";
import { prisma } from "@/lib/db";
import { AB_COOKIE, filterByVariant, isAbVariant } from "@/lib/ab";
import type { BuilderResume, NominalDto, DesignDto } from "@/lib/types";
import {
  getActiveDesigns,
  getActiveNominals,
  getActivePrograms,
  getActiveSalons,
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
  searchParams: Promise<{
    option?: string;
    nominal?: string;
    type?: string;
    resume?: string;
  }>;
}>) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Builder");
  const tNav = await getTranslations("Nav");

  const [salons, programs, nominals, designs, bounds, consentDoc] =
    await Promise.all([
      getActiveSalons(),
      getActivePrograms(),
      getActiveNominals(),
      getActiveDesigns(),
      getCustomAmountBounds(),
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

  const nominalDtos = visibleNominals.map(toNominalDto);
  const designDtos = designs.map((d) => toDesignDto(d, locale));
  const programDtos = programs.map((p) => toProgramDto(p, locale));

  // Дожим: ?resume=token → предзаполнение из ранее брошенного заказа
  const resume = query.resume
    ? await buildResume(query.resume, programDtos, nominalDtos, designDtos)
    : null;

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
          <p className="mt-5 max-w-xl text-white/75">{t("lead")}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-16">
        <BuilderClient
          salons={salons
            .filter((s) => s.orderable)
            .map((s) => toSalonDto(s, locale))}
          programs={programDtos}
          nominals={nominalDtos}
          designs={designDtos}
          bounds={bounds}
          consentHtml={consentDoc?.contentHtmlSanitized ?? ""}
          initialOptionId={initialOptionId}
          initialNominalId={initialNominalId}
          initialType={query.type === "nominal" ? "nominal" : undefined}
          resume={resume}
        />
      </div>
    </main>
  );
}

/**
 * Собирает предзаполнение конструктора из брошенного заказа по successToken.
 * Возвращает null, если заказ уже оплачен/не найден/не восстановим.
 */
async function buildResume(
  token: string,
  programs: ReturnType<typeof toProgramDto>[],
  nominals: NominalDto[],
  designs: DesignDto[],
): Promise<BuilderResume | null> {
  const order = await prisma.order.findUnique({
    where: { successToken: token },
    include: { _count: { select: { certificates: true } } },
  });
  // Восстанавливаем только неоплаченные и без выпущенных сертификатов
  if (!order || order.status === "paid" || order._count.certificates > 0) {
    return null;
  }

  const item = order.item as {
    type?: "program" | "nominal";
    programOptionId?: number;
    amountKzt?: number;
    designId?: number;
    toName?: string;
    fromName?: string;
    message?: string;
    delivery?: { method?: "email" | "whatsapp"; contact?: string };
  };
  const type = item.type === "nominal" ? "nominal" : "program";

  let programId: number | null = null;
  let optionId: number | null = null;
  let nominalId: number | null = null;
  let customAmount = "";

  if (type === "program" && item.programOptionId) {
    optionId = item.programOptionId;
    programId =
      programs.find((p) => p.options.some((o) => o.id === optionId))?.id ?? null;
  } else {
    const face = item.amountKzt ?? 0;
    const preset = nominals.find((n) => n.amountKzt === face);
    if (preset) nominalId = preset.id;
    else if (face > 0) customAmount = String(face);
  }

  const designIdx = Math.max(
    0,
    designs.findIndex((d) => d.id === item.designId),
  );

  return {
    salonId: order.salonId,
    type,
    programId,
    optionId,
    nominalId,
    customAmount,
    designIdx,
    toName: item.toName ?? "",
    fromName: item.fromName ?? "",
    message: item.message ?? "",
    method: item.delivery?.method === "whatsapp" ? "whatsapp" : "email",
    contact: item.delivery?.contact ?? "",
    buyerEmail: order.buyerEmail,
  };
}
