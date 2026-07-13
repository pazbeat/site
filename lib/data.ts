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

/** Актуальная версия правового документа. */
export const getLegalCurrentVersion = cache(async (type: LegalDocType) => {
  const doc = await prisma.legalDocument.findUnique({
    where: { type },
    include: { currentVersion: true },
  });
  return doc?.currentVersion ?? null;
});

/** id актуальных версий всех правовых документов — для записи согласия. */
export const getCurrentLegalVersionIds = cache(async () => {
  const docs = await prisma.legalDocument.findMany({
    select: { type: true, currentVersionId: true },
  });
  return Object.fromEntries(
    docs.map((d) => [d.type, d.currentVersionId]),
  ) as Record<LegalDocType, number | null>;
});

export const getSetting = cache(async (key: string) => {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
});

export async function getCustomAmountBounds() {
  const [min, max] = await Promise.all([
    getSetting("custom_amount_min_kzt"),
    getSetting("custom_amount_max_kzt"),
  ]);
  return {
    min: typeof min === "number" ? min : 5000,
    max: typeof max === "number" ? max : 500_000,
  };
}
