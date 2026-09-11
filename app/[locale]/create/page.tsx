import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { BuilderClient } from "@/components/builder-client";
import { ForteBankProvider } from "@/lib/payments/forte";
import { currentAdmin } from "@/lib/admin/guard";
import { mockEnabled } from "@/lib/payments";
import { prisma } from "@/lib/db";
import { AB_COOKIE, filterByVariant, isAbVariant } from "@/lib/ab";
import { countVisit } from "@/lib/visits";
import type { BuilderResume, NominalDto, DesignDto } from "@/lib/types";
import {
  getActiveDesigns,
  getActiveNominals,
  getActiveSalons,
  getAvailableAmounts,
  getCustomAmountBounds,
  getLegalVersionForLocale,
  getSellablePrograms,
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

  // Вторая стадия воронки: канал привёл не просто зеваку, а человека, который
  // открыл конструктор. Разница между этими двумя числами и показывает,
  // приводит канал покупателей или случайных посетителей.
  const builderChannel = (await headers()).get("x-imbir-builder");
  if (builderChannel) void countVisit(builderChannel, "builder");

  const demoEnabled =
    mockEnabled() && (await currentAdmin()) !== null;

  const [salons, sellable, nominals, designs, bounds, consentDoc] =
    await Promise.all([
      getActiveSalons(),
      // Только варианты с товаром в Altegio — см. getSellablePrograms.
      getSellablePrograms(),
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

  // Суммы витрины по филиалам: в Altegio под каждую сумму нужен свой
  // товар-сертификат, свободного ввода там нет. Показываем ровно то, что
  // реально выпустится, — иначе покупатель заплатит за сертификат, которого
  // кассир в CRM не найдёт.
  const orderableSalons = salons.filter((s) => s.orderable);
  const amountsBySalon: Record<number, number[]> = Object.fromEntries(
    await Promise.all(
      orderableSalons.map(
        async (s) => [s.id, await getAvailableAmounts(s.id)] as const,
      ),
    ),
  );

  // Варианты без товара в Altegio ни в одном филиале (Suay 90 мин 38 000,
  // Sakda 120 мин 38 000, Foot релакс 90 мин 22 000 — сверено 2026-08-26)
  // раньше выбирались и падали только на «Оплатить»; теперь сняты с витрины
  // целиком, пока салон не заведёт товар и маппинг не пополнится.
  const { optionSalons } = sellable;
  const programDtos = sellable.programs.map((p) => toProgramDto(p, locale));

  // Дожим: ?resume=token → предзаполнение из ранее брошенного заказа
  const resume = query.resume
    ? await buildResume(
        query.resume,
        programDtos,
        nominalDtos,
        designDtos,
        amountsBySalon,
      )
    : null;

  // Полный список сумм — для шага «Подарок», где филиал ещё не выбран. Наборы
  // у продаваемых филиалов одинаковы (сверено выгрузкой каталога), но берём
  // объединение, а не первый попавшийся: если у какого-то филиала набор
  // разойдётся, шаг покажет сумму, а не промолчит, а продаваемость этой суммы
  // всё равно перепроверяется на шаге доставки, где филиал уже известен.
  const allAmounts = [
    ...new Set(Object.values(amountsBySalon).flat()),
  ].sort((a, b) => a - b);

  return (
    <main className="flex-1">
      <div className="bld">
        <div className="mx-auto max-w-[1680px] px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
        <BuilderClient
          salons={orderableSalons.map((s) => toSalonDto(s, locale))}
          programs={programDtos}
          nominals={nominalDtos}
          designs={designDtos}
          bounds={bounds}
          amountsBySalon={amountsBySalon}
          allAmounts={allAmounts}
          optionSalons={optionSalons}
          consentHtml={consentDoc?.contentHtmlSanitized ?? ""}
          initialOptionId={initialOptionId}
          initialNominalId={initialNominalId}
          initialType={query.type === "nominal" ? "nominal" : undefined}
          resume={resume}
          cardEnabled={new ForteBankProvider().isConfigured()}
          // Демо-оплата — только вошедшему администратору: сертификат
          // выпускается в Altegio по-настоящему, и бесплатная покупка не
          // должна быть доступна случайному посетителю стенда.
          demoEnabled={demoEnabled}
        />
        </div>
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
  amountsBySalon: Record<number, number[]>,
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
  let amountKzt: number | null = null;

  if (type === "program" && item.programOptionId) {
    // Вариант, снятый с витрины (нет товара в CRM), не восстанавливается —
    // конструктор откроется на шаге выбора, а не на оплате.
    const found = programs.find((p) =>
      p.options.some((o) => o.id === item.programOptionId),
    );
    if (found) {
      programId = found.id;
      optionId = item.programOptionId;
    }
  } else {
    // Сумма восстанавливается, только если её по-прежнему продаёт филиал
    // заказа; у филиала без привязки к CRM — только номинал из админки.
    // Закрытый или снятый с продажи филиал в amountsBySalon не попадает —
    // сумму тогда не восстанавливаем, конструктор спросит заново.
    const face = item.amountKzt ?? 0;
    const list = amountsBySalon[order.salonId];
    const sold =
      list !== undefined &&
      (list.length > 0
        ? list.includes(face)
        : nominals.some((n) => n.amountKzt === face));
    if (face > 0 && sold) amountKzt = face;
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
    amountKzt,
    designIdx,
    toName: item.toName ?? "",
    fromName: item.fromName ?? "",
    message: item.message ?? "",
    // Только почта. У брошенных заказов, созданных до отключения
    // WhatsApp, здесь мог быть телефон — контакт покупатель
    // перевведёт, иначе восстановление корзины упало бы.
    method: "email" as const,
    contact: (item.delivery?.contact ?? "").includes("@")
      ? (item.delivery?.contact ?? "")
      : "",
    buyerEmail: order.buyerEmail,
  };
}
