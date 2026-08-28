import { describe, expect, it } from "vitest";
import {
  checkPromoLimits,
  computeDiscount,
  promoState,
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

describe("состояние промокода в админке", () => {
  const now = new Date("2026-08-28T12:00:00Z");
  const state = (
    limits: Record<string, unknown>,
    used: number,
    active = true,
  ) => promoState({ active, limits }, used, now);

  it("исчерпанный не показывается активным — это и была жалоба", () => {
    // Лимит 1, покупка сделана: конструктор уже отказывает, значит и
    // админка обязана показывать «Исчерпан», а не «Активен».
    expect(state({ maxUses: 1 }, 1)).toBe("exhausted");
    expect(state({ maxUses: 1 }, 0)).toBe("active");
    expect(state({ maxUses: 3 }, 2)).toBe("active");
    expect(state({ maxUses: 3 }, 3)).toBe("exhausted");
  });

  it("различает срок действия", () => {
    expect(state({ validFrom: "2026-09-01T00:00:00Z" }, 0)).toBe("not_started");
    expect(state({ validUntil: "2026-08-01T00:00:00Z" }, 0)).toBe("expired");
    expect(state({ validUntil: "2026-12-31T00:00:00Z" }, 0)).toBe("active");
  });

  it("ручное выключение сильнее остального", () => {
    expect(state({ maxUses: 5 }, 0, false)).toBe("hidden");
  });

  it("минимальная сумма на статус не влияет — она про заказ, а не про код", () => {
    expect(state({ minAmountKzt: 50000 }, 0)).toBe("active");
  });

  it("без ограничений код активен всегда", () => {
    expect(state({}, 100)).toBe("active");
  });
});
