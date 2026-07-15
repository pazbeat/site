import { describe, expect, it } from "vitest";
import {
  almatyMonthKey,
  monthLabel,
  monthRange,
  periodFilter,
  recentMonths,
  resolvePeriod,
  shiftMonth,
} from "@/lib/admin/period";

describe("границы месяца по Алматы", () => {
  it("месяц начинается в полночь по Алматы, а не по UTC", () => {
    const { from, to } = monthRange("2026-07");
    expect(from.toISOString()).toBe("2026-06-30T19:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-31T19:00:00.000Z");
  });

  it("декабрь перекатывается в январь следующего года", () => {
    expect(monthRange("2026-12").to.toISOString()).toBe(
      "2026-12-31T19:00:00.000Z",
    );
  });

  it("месяц определяется по алматинскому времени момента", () => {
    // 31 июля 20:00 UTC — в Алматы уже 1 августа
    expect(almatyMonthKey(new Date("2026-07-31T20:00:00Z"))).toBe("2026-08");
    expect(almatyMonthKey(new Date("2026-07-31T18:00:00Z"))).toBe("2026-07");
  });
});

describe("resolvePeriod", () => {
  const now = new Date("2026-07-15T10:00:00Z");

  it("без параметров — текущий месяц", () => {
    const p = resolvePeriod({}, now);
    expect(p.kind).toBe("month");
    expect(p.key).toBe("2026-07");
    expect(p.label).toBe("Июль 2026");
  });

  it("месяц из query", () => {
    expect(resolvePeriod({ month: "2026-03" }, now).label).toBe("Март 2026");
  });

  it("мусор в month игнорируется — откат на текущий месяц", () => {
    for (const month of ["2026-13", "abc", "2026-1", ""]) {
      expect(resolvePeriod({ month }, now).key).toBe("2026-07");
    }
  });

  it("всё время — без границ", () => {
    const p = resolvePeriod({ month: "all" }, now);
    expect(p.from).toBeNull();
    expect(p.to).toBeNull();
    expect(periodFilter(p)).toBeUndefined();
  });

  it("свой диапазон: верхняя граница включает весь день «по»", () => {
    const p = resolvePeriod({ from: "2026-07-01", to: "2026-07-15" }, now);
    expect(p.kind).toBe("custom");
    expect(p.label).toBe("с 01.07.2026 по 15.07.2026");
    expect(p.from?.toISOString()).toBe("2026-06-30T19:00:00.000Z");
    // 16 июля 00:00 по Алматы — заказ 15-го в 23:59 попадёт в период
    expect(p.to?.toISOString()).toBe("2026-07-15T19:00:00.000Z");
  });

  it("свои даты перебивают месяц", () => {
    const p = resolvePeriod({ month: "2026-01", from: "2026-07-01" }, now);
    expect(p.kind).toBe("custom");
    expect(p.toInput).toBe("");
  });

  it("открытый диапазон — только одна граница", () => {
    const p = resolvePeriod({ to: "2026-07-15" }, now);
    expect(p.from).toBeNull();
    expect(p.label).toBe("по 15.07.2026");
    expect(periodFilter(p)).toEqual({ lt: p.to });
  });
});

describe("навигация по месяцам", () => {
  it("список последних месяцев, новые первыми", () => {
    const months = recentMonths(4, new Date("2026-02-10T00:00:00Z"));
    expect(months).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });

  it("сдвиг через границу года", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("подписи месяцев по-русски", () => {
    expect(monthLabel("2026-01")).toBe("Январь 2026");
    expect(monthLabel("2026-12")).toBe("Декабрь 2026");
  });
});
