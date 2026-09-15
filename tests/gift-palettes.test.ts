import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_PALETTES,
  GIFT_PALETTE_FALLBACK,
  GIFT_PALETTE_ROTATION,
  isGiftPaletteKey,
  resolveGiftPalette,
} from "../lib/gift-palettes";

/**
 * Цвет коробки на экране «Вам подарок». Записывается в сертификат при
 * выпуске; старым сертификатам без записи цвет выбирается стабильно по id —
 * коробка не должна перекрашиваться от открытия к открытию.
 */

/** Похожие на cuid id: детерминированный ГСЧ, чтобы тест не мигал. */
function cuidLike(count: number): string[] {
  let seed = 20260915;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let tail = "";
    while (tail.length < 22) tail += next().toString(36);
    ids.push(`cm${tail.slice(0, 22)}`);
  }
  return ids;
}

describe("палитры экрана подарка", () => {
  it("всего 16 уникальных ключей, у каждого русское название", () => {
    const keys = GIFT_PALETTES.map((p) => p.key);
    expect(keys).toHaveLength(16);
    expect(new Set(keys).size).toBe(16);
    for (const palette of GIFT_PALETTES) {
      expect(palette.name).toMatch(/^[А-ЯЁ][а-яё -]+$/);
    }
  });

  it("ротация — подмножество всех 16, без повторов", () => {
    expect(GIFT_PALETTE_ROTATION).toEqual(["brand", "champagne", "mint", "sky", "pearl"]);
    expect(new Set(GIFT_PALETTE_ROTATION).size).toBe(GIFT_PALETTE_ROTATION.length);
    for (const key of GIFT_PALETTE_ROTATION) {
      expect(isGiftPaletteKey(key)).toBe(true);
    }
  });

  it("запасной список заморожен: его правка перекрасила бы коробки без записи", () => {
    // Если этот тест упал — правили GIFT_PALETTE_FALLBACK. Верните как было:
    // менять набор цветов для новых сертификатов — это GIFT_PALETTE_ROTATION.
    expect(GIFT_PALETTE_FALLBACK).toEqual(["brand", "champagne", "mint", "sky", "pearl"]);
    // Закреплённые значения: тот же id → тот же цвет в любой версии кода
    const ids = ["cert-0", "cert-1", "cert-2", "cert-3", "cert-4", "cert-5", "cert-6", "cert-7"];
    expect(ids.map((id) => resolveGiftPalette(null, id))).toEqual([
      "sky", "mint", "brand", "pearl", "pearl", "sky", "champagne", "brand",
    ]);
  });

  it("каждая палитра нарисована в app/globals.css, и в CSS нет лишних", () => {
    const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
    const inCss = [...css.matchAll(/\.gr\[data-palette="([^"]+)"\]\s*\{([^}]*)\}/g)];
    const blocks = new Map(inCss.map((m) => [m[1], m[2]]));
    // «Фирменный» — базовый блок .gr, остальные переопределяют его значения
    const base = [...css.matchAll(/(?:^|\n)\.gr\s*\{([^}]*)\}/g)]
      .map((m) => m[1])
      .find((body) => body.includes("--box-lid-1"));
    expect(base, "базовый блок .gr с палитрой «Фирменный»").toBeDefined();
    for (const { key } of GIFT_PALETTES) {
      if (key === "brand") continue;
      const body = blocks.get(key);
      expect(body, `нет блока .gr[data-palette="${key}"]`).toBeDefined();
      // Коробка, фольга, пятно фона и конфетти — свои у каждой палитры
      for (const name of ["--box-lid-1", "--box-body-1", "--fo-1", "--sat-1", "--spot-1", "--fx-light-1", "--fx-petal-1"]) {
        expect(body, `${key}: нет ${name}`).toContain(`${name}:`);
      }
    }
    for (const key of blocks.keys()) {
      expect(isGiftPaletteKey(key), `палитра «${key}» есть в CSS, но не в GIFT_PALETTES`).toBe(true);
    }
  });

  it("записанный известный ключ сохраняется — в том числе не из ротации", () => {
    expect(resolveGiftPalette("mint", "cm1")).toBe("mint");
    expect(resolveGiftPalette("pearl", "cm2")).toBe("pearl");
    expect(resolveGiftPalette("chocolate", "cm3")).toBe("chocolate");
    expect(resolveGiftPalette("teal", "cm4")).toBe("teal");
  });

  it("пусто → ключ из ротации, одинаковый при каждом вызове", () => {
    for (const id of cuidLike(200)) {
      const fromNull = resolveGiftPalette(null, id);
      expect(GIFT_PALETTE_FALLBACK).toContain(fromNull);
      expect(resolveGiftPalette(undefined, id)).toBe(fromNull);
      expect(resolveGiftPalette("", id)).toBe(fromNull);
      expect(resolveGiftPalette(null, id)).toBe(fromNull);
    }
  });

  it("неизвестный ключ → из ротации, как будто записи нет", () => {
    for (const id of cuidLike(50)) {
      const fallback = resolveGiftPalette(null, id);
      expect(resolveGiftPalette("rainbow", id)).toBe(fallback);
      expect(resolveGiftPalette("Brand", id)).toBe(fallback);
      expect(resolveGiftPalette(" mint", id)).toBe(fallback);
    }
  });

  it("не опирается на свойства прототипа объекта", () => {
    expect(GIFT_PALETTE_FALLBACK).toContain(resolveGiftPalette("toString", "cm5"));
    expect(GIFT_PALETTE_FALLBACK).toContain(resolveGiftPalette("__proto__", "cm6"));
  });

  it("хэш раскладывает 10 000 id по запасному списку примерно поровну", () => {
    const check = (ids: string[]) => {
      const counts = new Map<string, number>();
      for (const id of ids) {
        const key = resolveGiftPalette(null, id);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const expected = ids.length / GIFT_PALETTE_FALLBACK.length;
      expect(counts.size).toBe(GIFT_PALETTE_FALLBACK.length);
      for (const key of GIFT_PALETTE_FALLBACK) {
        const share = (counts.get(key) ?? 0) / expected;
        // ±10% от равной доли: при 2000 на цвет случайный разброс ~2%
        expect(share).toBeGreaterThan(0.9);
        expect(share).toBeLessThan(1.1);
      }
    };
    check(cuidLike(10_000));
    // Подряд идущие id — худший случай для слабого хэша
    check(Array.from({ length: 10_000 }, (_, i) => `cert-${i}`));
  });
});
