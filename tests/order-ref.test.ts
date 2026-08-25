import { describe, expect, it } from "vitest";
import {
  ORDER_REF_LENGTH,
  generateOrderRef,
  isOrderRef,
  normalizeOrderRef,
} from "@/lib/order-ref";

describe("короткий номер заказа для Kaspi", () => {
  // Длинный внутренний номер приложение Kaspi отбрасывает по маске, не дойдя
  // до проверки заказа: покупатель видел «проверьте правильность ввода данных».
  it("ровно той длины, что принимает Kaspi", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOrderRef()).toHaveLength(ORDER_REF_LENGTH);
    }
  });

  it("без похожих знаков — номер приходится читать с чека", () => {
    const many = Array.from({ length: 300 }, () => generateOrderRef()).join("");
    for (const bad of ["O", "0", "I", "1"]) {
      expect(many).not.toContain(bad);
    }
  });

  it("узнаётся и приводится к общему виду", () => {
    const ref = generateOrderRef();
    expect(isOrderRef(ref)).toBe(true);
    expect(isOrderRef(ref.toLowerCase())).toBe(true);
    expect(normalizeOrderRef(`  ${ref.toLowerCase()} `)).toBe(ref);
  });

  it("чужое за номер не принимает", () => {
    expect(isOrderRef("cmt8o1zhw000227nj3dwz5me3")).toBe(false);
    expect(isOrderRef("ABC")).toBe(false);
    expect(isOrderRef("ABCDEF0")).toBe(false);
  });

  it("не повторяется", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateOrderRef()));
    expect(seen.size).toBeGreaterThan(1990);
  });
});
