import { describe, expect, it } from "vitest";
import {
  buildReport,
  filterByVariant,
  pickVariant,
  pickWinner,
  isAbVariant,
} from "@/lib/ab";

describe("назначение группы", () => {
  it("делит 50/50", () => {
    expect(pickVariant(0)).toBe("A");
    expect(pickVariant(0.49)).toBe("A");
    expect(pickVariant(0.5)).toBe("B");
    expect(pickVariant(0.99)).toBe("B");
  });

  it("узнаёт только валидные группы", () => {
    expect(isAbVariant("A")).toBe(true);
    expect(isAbVariant("B")).toBe(true);
    for (const bad of ["C", "", null, undefined, 1]) {
      expect(isAbVariant(bad)).toBe(false);
    }
  });
});

describe("какие номиналы видит посетитель", () => {
  const common = { id: 1, variant: null };
  const onlyA = { id: 2, variant: "A" };
  const onlyB = { id: 3, variant: "B" };

  it("без вариантов тест не идёт — видно всё", () => {
    const all = [common, { id: 4, variant: null }];
    expect(filterByVariant(all, "A")).toEqual(all);
    expect(filterByVariant(all, null)).toEqual(all);
  });

  it("группа видит свои номиналы и общие", () => {
    const all = [common, onlyA, onlyB];
    expect(filterByVariant(all, "A")).toEqual([common, onlyA]);
    expect(filterByVariant(all, "B")).toEqual([common, onlyB]);
  });

  it("без куки во время теста показываем только общие", () => {
    expect(filterByVariant([common, onlyA, onlyB], null)).toEqual([common]);
  });

  it("мусор в variant считается общим номиналом, а не скрытым", () => {
    const weird = { id: 5, variant: "X" };
    expect(filterByVariant([weird, onlyA], "B")).toEqual([weird]);
  });
});

describe("отчёт", () => {
  it("конверсия, средний чек и выручка на показ", () => {
    const [a] = buildReport([
      { variant: "A", views: 200, orders: 10, revenueKzt: 300_000 },
    ]);
    expect(a.conversion).toBe(5);
    expect(a.avgCheckKzt).toBe(30_000);
    expect(a.revenuePerViewKzt).toBe(1500);
  });

  it("нулевые показы не делят на ноль", () => {
    const [a] = buildReport([{ variant: "A", views: 0, orders: 0, revenueKzt: 0 }]);
    expect(a.conversion).toBe(0);
    expect(a.avgCheckKzt).toBe(0);
    expect(a.revenuePerViewKzt).toBe(0);
  });
});

describe("победитель", () => {
  const report = (aRev: number, bRev: number, views = 500) =>
    buildReport([
      { variant: "A", views, orders: 10, revenueKzt: aRev },
      { variant: "B", views, orders: 10, revenueKzt: bRev },
    ]);

  it("выигрывает выручка на показ", () => {
    expect(pickWinner(report(600_000, 400_000))?.variant).toBe("A");
    expect(pickWinner(report(400_000, 600_000))?.variant).toBe("B");
  });

  it("молчит, пока мало показов — не объявляем победу на шуме", () => {
    expect(pickWinner(report(600_000, 400_000, 50))).toBeNull();
  });

  it("молчит при разнице меньше 5%", () => {
    expect(pickWinner(report(510_000, 500_000))).toBeNull();
  });

  it("считает превосходство в процентах", () => {
    const winner = pickWinner(report(600_000, 400_000));
    expect(winner?.upliftPct).toBeCloseTo(50);
  });
});
