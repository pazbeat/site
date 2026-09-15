/**
 * Цвета коробки на экране «Вам подарок» (`/success`, components/gift-reveal.tsx).
 *
 * Файл без серверных зависимостей: его читают и страница, и компонент, и
 * тесты. Случайный выбор при выпуске (node:crypto) живёт там, где сертификат
 * создаётся, — в lib/certificates.ts и lib/admin/manual-issue.ts.
 *
 * Все 16 палитр нарисованы в app/globals.css (блок `.gr[data-palette=…]`),
 * прототипы и история выбора — docs/design/gift-reveal/README.md.
 */

/** Все палитры, заведённые в CSS. Удалять ключ нельзя, пока в базе есть сертификаты этого цвета. */
export const GIFT_PALETTES = [
  { key: "brand", name: "Фирменный" },
  { key: "lilac", name: "Светлая сирень" },
  { key: "plum", name: "Слива" },
  { key: "powder", name: "Пудровая роза" },
  { key: "dustyrose", name: "Пыльная роза" },
  { key: "peach", name: "Нежный персик" },
  { key: "champagne", name: "Шампань" },
  { key: "caramel", name: "Карамель" },
  { key: "chocolate", name: "Молочный шоколад" },
  { key: "sage", name: "Шалфей" },
  { key: "mint", name: "Мятный" },
  { key: "olive", name: "Оливковый" },
  { key: "sky", name: "Небесный" },
  { key: "teal", name: "Бирюзовый" },
  { key: "ivory", name: "Слоновая кость" },
  { key: "pearl", name: "Светло-серый жемчуг" },
] as const;

export type GiftPaletteKey = (typeof GIFT_PALETTES)[number]["key"];

/**
 * Какие цвета выпадают новым сертификатам (решение заказчика 2026-09-15).
 *
 * Список можно менять как угодно — дописывать, убирать, переставлять: уже
 * выпущенные сертификаты хранят свой цвет в базе, а запасной выбор для
 * сертификатов без записи идёт по отдельному неизменяемому списку
 * `GIFT_PALETTE_FALLBACK`.
 */
export const GIFT_PALETTE_ROTATION = [
  "brand",
  "champagne",
  "mint",
  "sky",
  "pearl",
] as const satisfies readonly GiftPaletteKey[];

/**
 * Запасной выбор цвета для сертификата без записанной палитры
 * (`resolveGiftPalette`). НЕ МЕНЯТЬ — ни состав, ни порядок, ни длину: индекс
 * считается как хэш id по модулю длины списка, и любая правка, даже
 * дописывание в конец, перекрасила бы большинство таких коробок у тех, кто
 * подарок уже открывал. Совпадает с ротацией на момент её введения намеренно,
 * но от неё не зависит.
 */
export const GIFT_PALETTE_FALLBACK = [
  "brand",
  "champagne",
  "mint",
  "sky",
  "pearl",
] as const satisfies readonly GiftPaletteKey[];

const KNOWN: ReadonlySet<string> = new Set(GIFT_PALETTES.map((p) => p.key));

export function isGiftPaletteKey(value: unknown): value is GiftPaletteKey {
  return typeof value === "string" && KNOWN.has(value);
}

/** FNV-1a, 32 бита. Стабилен между сервером и браузером, без зависимостей. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Палитра, которой рисуется коробка сертификата.
 *
 * Записанный при выпуске ключ — он и есть, если он из 16 известных. Пусто
 * (сертификат старше колонки) или неизвестный ключ (палитру убрали из кода) —
 * стабильный выбор из `GIFT_PALETTE_FALLBACK` по id сертификата: одна и та же
 * коробка при каждом открытии страницы, без записи в базу из GET-запроса.
 */
export function resolveGiftPalette(
  stored: string | null | undefined,
  certificateId: string,
): GiftPaletteKey {
  if (isGiftPaletteKey(stored)) return stored;
  const index = fnv1a(certificateId) % GIFT_PALETTE_FALLBACK.length;
  return GIFT_PALETTE_FALLBACK[index];
}
