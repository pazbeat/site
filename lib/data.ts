import "server-only";
import { cache } from "react";
import { prisma } from "./db";
import type { LegalDocType } from "./generated/prisma/client";

/** Программы с вариантами — для каталога/конструктора. */
export const getActivePrograms = cache(async () => {
  return prisma.program.findMany({
    where: { active: true },
    orderBy: { sort: "asc" },
    include: { options: { orderBy: { priceKzt: "asc" } } },
  });
});

/**
 * Программы витрины: только варианты, которые можно выпустить в Altegio хотя
 * бы в одном продаваемом филиале, и только программы, у которых такой вариант
 * остался. Решение заказчика: предлагать только то, что заведено в Altegio.
 *
 * Общий источник для главной, каталога с квизом, страниц поводов и
 * конструктора. Раньше фильтровал только конструктор, и остальные страницы
 * продавали вариант, которого там уже нет: карточка «Suay от 38 000 ₸» вела в
 * конструктор с вариантом, который он молча выбрасывал.
 *
 * `optionSalons` — вариант → филиалы, где под него есть товар: конструктор по
 * нему сужает выбор филиала на шаге доставки. Филиал без привязки к CRM
 * ограничений не имеет — там выпуск идёт без Altegio (так же решает сервер,
 * issuable() в lib/pricing.ts).
 */
export const getSellablePrograms = cache(async () => {
  const [programs, salons] = await Promise.all([
    getActivePrograms(),
    getActiveSalons(),
  ]);
  const orderable = salons.filter((s) => s.orderable);
  const { resolveGoodId, resolveProgramTitle } = await import("./altegio/catalog");
  const optionSalons: Record<number, number[]> = {};
  const sellable = programs
    .map((p) => {
      const nameRu = (p.names as { ru?: string }).ru ?? "";
      const options = p.options.filter((o) => {
        const programTitle = nameRu ? resolveProgramTitle(nameRu, o.priceKzt) : null;
        const ids = orderable
          .filter(
            (s) =>
              !s.altegioLocationId ||
              resolveGoodId(s.altegioLocationId, {
                nominalKzt: o.priceKzt,
                programTitle,
              }) !== null,
          )
          .map((s) => s.id);
        optionSalons[o.id] = ids;
        return ids.length > 0;
      });
      return { ...p, options };
    })
    .filter((p) => p.options.length > 0);
  return { programs: sellable, optionSalons };
});

export const getActiveSalons = cache(async () => {
  return prisma.salon.findMany({
    where: { active: true },
    orderBy: { sort: "asc" },
  });
});

export const getActiveNominals = cache(async () => {
  return prisma.nominal.findMany({
    where: { active: true },
    orderBy: { sort: "asc" },
  });
});

export const getActiveDesigns = cache(async () => {
  return prisma.design.findMany({
    where: { active: true },
    orderBy: { sort: "asc" },
  });
});

/** Актуальная версия правового документа (каноническая, RU). */
export const getLegalCurrentVersion = cache(async (type: LegalDocType) => {
  const doc = await prisma.legalDocument.findUnique({
    where: { type },
    include: { currentVersion: true },
  });
  return doc?.currentVersion ?? null;
});

/**
 * Версия правового документа для локали: последняя версия с нужным языком,
 * иначе — каноническая (RU). Возвращает контент + фактический язык (для
 * баннера «доступно только на русском», если случился фолбэк).
 */
export const getLegalVersionForLocale = cache(
  async (type: LegalDocType, locale: string) => {
    const doc = await prisma.legalDocument.findUnique({
      where: { type },
      include: { currentVersion: true },
    });
    if (!doc?.currentVersion) return null;
    if (locale === "ru") return doc.currentVersion;

    const localized = await prisma.legalVersion.findFirst({
      where: { documentId: doc.id, lang: locale },
      orderBy: { createdAt: "desc" },
    });
    return localized ?? doc.currentVersion;
  },
);

/** id актуальных версий всех правовых документов — для записи согласия. */
export const getCurrentLegalVersionIds = cache(async () => {
  const docs = await prisma.legalDocument.findMany({
    select: { type: true, currentVersionId: true },
  });
  return Object.fromEntries(
    docs.map((d) => [d.type, d.currentVersionId]),
  ) as Record<LegalDocType, number | null>;
});

/** Все правовые документы разом в редакции для нужной локали. */
export const LEGAL_DOC_TYPES = [
  "offer",
  "privacy",
  "rules",
  "consent_modal",
  "payment_info",
] as const satisfies readonly LegalDocType[];

/**
 * Версии всех документов, которые увидит посетитель на данном языке.
 *
 * Нужна для записи согласия: раньше туда клался `currentVersionId`, то есть
 * всегда РУССКАЯ редакция, даже когда покупатель читал казахскую. Запись
 * ссылалась на текст, которого он не видел, — в споре это обесценивает всю
 * доказательственную цепочку. Резолвим ровно тем же путём, каким документ
 * отдаётся на экран.
 */
export async function getLegalVersionsForLocale(locale: string) {
  const entries = await Promise.all(
    LEGAL_DOC_TYPES.map(async (type) => {
      const version = await getLegalVersionForLocale(type, locale);
      return [type, version] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<
    LegalDocType,
    Awaited<ReturnType<typeof getLegalVersionForLocale>>
  >;
}

export const getSetting = cache(async (key: string) => {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
});

/**
 * Суммы витрины, доступные покупателю на выбранном филиале: список сайта
 * (`SITE_NOMINALS`), под который в филиале есть товар в Altegio, в пределах
 * настроенного диапазона. Пустой список — филиал не привязан к CRM: суммой по
 * списку там не купить (сервер откажет), остаются только номиналы из админки.
 */
export async function getAvailableAmounts(salonId: number): Promise<number[]> {
  const [salon, bounds] = await Promise.all([
    prisma.salon.findUnique({
      where: { id: salonId },
      select: { altegioLocationId: true },
    }),
    getCustomAmountBounds(),
  ]);
  if (!salon?.altegioLocationId) return [];
  const { availableNominalAmounts } = await import("./altegio/catalog");
  return availableNominalAmounts(salon.altegioLocationId).filter(
    (a) => a >= bounds.min && a <= bounds.max,
  );
}

export async function getCustomAmountBounds() {
  const [min, max] = await Promise.all([
    getSetting("custom_amount_min_kzt"),
    getSetting("custom_amount_max_kzt"),
  ]);
  return {
    min: typeof min === "number" ? min : 18_000,
    max: typeof max === "number" ? max : 500_000,
  };
}
