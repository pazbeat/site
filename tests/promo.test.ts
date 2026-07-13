import { describe, expect, it } from "vitest";
import {
  checkPromoLimits,
  computeDiscount,
  normalizePromoCode,
  type PromoLimits,
} from "@/lib/promo";

describe("normalizePromoCode", () => {
  it("обрезает пробелы и приводит к верхнему регистру", () => {
    expect(normalizePromoCode("  leto2026 ")).toBe("LETO2026");
  });
});

describe("computeDiscount", () => {
  it("процент округляется математически", () => {
    expect(computeDiscount("percent", 10, 20_000)).toBe(2_000);
    expect(computeDiscount("percent", 15, 19_990)).toBe(2_999); // 2998.5 → 2999
  });

  it("фиксированная скидка в тенге", () => {
    expect(computeDiscount("fixed", 3_000, 20_000)).toBe(3_000);
  });

  it("скидка не превышает сумму заказа", () => {
    expect(computeDiscount("fixed", 30_000, 20_000)).toBe(20_000);
    expect(computeDiscount("percent", 200, 20_000)).toBe(20_000);
  });

  it("скидка не отрицательна", () => {
    expect(computeDiscount("fixed", -500, 20_000)).toBe(0);
  });
});

describe("checkPromoLimits", () => {
  const now = new Date("2026-07-13T12:00:00+05:00");

  it("без ограничений — применяется", () => {
    expect(checkPromoLimits({}, { amountKzt: 20_000, now, usedCount: 0 })).toBeNull();
  });

  it("не начавшийся период", () => {
    const limits: PromoLimits = { validFrom: "2026-08-01T00:00:00+05:00" };
    expect(checkPromoLimits(limits, { amountKzt: 20_000, now, usedCount: 0 })).toBe(
      "not_started",
    );
  });

  it("истёкший период", () => {
    const limits: PromoLimits = { validUntil: "2026-07-01T00:00:00+05:00" };
    expect(checkPromoLimits(limits, { amountKzt: 20_000, now, usedCount: 0 })).toBe(
      "expired",
    );
  });

  it("сумма ниже минимальной", () => {
    const limits: PromoLimits = { minAmountKzt: 30_000 };
    expect(checkPromoLimits(limits, { amountKzt: 20_000, now, usedCount: 0 })).toBe(
      "min_amount",
    );
    expect(
      checkPromoLimits(limits, { amountKzt: 30_000, now, usedCount: 0 }),
    ).toBeNull();
  });

  it("исчерпан лимит применений", () => {
    const limits: PromoLimits = { maxUses: 100 };
    expect(
      checkPromoLimits(limits, { amountKzt: 20_000, now, usedCount: 100 }),
    ).toBe("max_uses");
    expect(
      checkPromoLimits(limits, { amountKzt: 20_000, now, usedCount: 99 }),
    ).toBeNull();
  });

  it("maxUses=0 трактуется как без лимита", () => {
    const limits: PromoLimits = { maxUses: 0 };
    expect(
      checkPromoLimits(limits, { amountKzt: 20_000, now, usedCount: 5 }),
    ).toBeNull();
  });
});
