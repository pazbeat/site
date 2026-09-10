import { describe, expect, it } from "vitest";
import {
  groupDesigns,
  locateDesign,
  occasionOf,
  OCCASION_ORDER,
} from "@/lib/designs";
import type { DesignDto } from "@/lib/types";

/**
 * Повод открытки читается из её названия, а поле в базе появится позже.
 * Поэтому правила проверяются на НАСТОЯЩИХ названиях из каталога — иначе
 * первая же открытка вроде «Асыл әжеме» молча падает в «просто так», и
 * покупатель не находит её там, где ищет.
 */
function d(id: number, name: string): DesignDto {
  return { id, name, imageUrl: `/designs/design-${id}.webp` } as DesignDto;
}

describe("повод по названию", () => {
  it("узнаёт день рождения во всех написаниях каталога", () => {
    expect(occasionOf("С днём рождения (торты)")).toBe("birthday");
    expect(occasionOf("С днем рождения (бирюза)")).toBe("birthday");
    expect(occasionOf("С твоим днём (спа)")).toBe("birthday");
  });

  it("узнаёт казахские названия", () => {
    expect(occasionOf("Асыл әжеме")).toBe("grandma");
    expect(occasionOf("Наурыз мейрамы")).toBe("nauryz");
  });

  it("узкое правило важнее широкого: Наурыз не уходит в «просто так»", () => {
    expect(occasionOf("С праздником Наурыз (тюльпаны)")).toBe("nauryz");
    expect(occasionOf("Любимой бабушке (арт)")).toBe("grandma");
  });

  it("что не привязано к дате — «просто так», а не выдуманный повод", () => {
    expect(occasionOf("Побалуй себя")).toBe("any");
    expect(occasionOf("Счастья и гармонии")).toBe("any");
    expect(occasionOf("Пусть сбудутся мечты")).toBe("any");
  });
});

describe("группировка для дуги", () => {
  const catalog = [
    d(21, "С днём рождения (торты)"),
    d(29, "Побалуй себя"),
    d(31, "Асыл әжеме"),
    d(26, "С праздником Наурыз (тюльпаны)"),
    d(11, "С днём рождения (подарок)"),
    d(18, "Тебе под ёлочку"),
  ];

  it("порядок групп задан, а не случаен", () => {
    const keys = groupDesigns(catalog).map((g) => g.key);
    // «Просто так» всегда последний — это корзина, а не повод.
    expect(keys[keys.length - 1]).toBe("any");
    expect(keys).toEqual(
      OCCASION_ORDER.filter((k) => keys.includes(k)),
    );
  });

  it("пустых групп на дуге не бывает", () => {
    const groups = groupDesigns(catalog);
    expect(groups.every((g) => g.designs.length > 0)).toBe(true);
    // 8 Марта в этом наборе нет — значит и на дуге его быть не должно.
    expect(groups.some((g) => g.key === "march8")).toBe(false);
  });

  it("порядок внутри группы сохраняется", () => {
    const bd = groupDesigns(catalog).find((g) => g.key === "birthday")!;
    expect(bd.designs.map((x) => x.id)).toEqual([21, 11]);
  });

  it("находит открытку по номеру — карусель восстанавливается после возврата", () => {
    const groups = groupDesigns(catalog);
    const at = locateDesign(groups, 11);
    expect(groups[at.groupIndex].designs[at.cardIndex].id).toBe(11);
  });

  it("неизвестный номер не роняет экран, а открывает первую", () => {
    expect(locateDesign(groupDesigns(catalog), 9999)).toEqual({
      groupIndex: 0,
      cardIndex: 0,
    });
  });
});
