import { describe, expect, it } from "vitest";
import {
  ORDER_REF_LENGTH,
  generateOrderRef,
  isOrderRef,
  normalizeOrderRef,
} from "@/lib/order-ref";

/** Настоящие номера действующего сайта — из квитанций Kaspi. */
const LEGACY = ["10512210190824140899", "10512210190825170883"];

describe("короткий номер заказа для Kaspi", () => {
  // Внутренний номер в 25 знаков приложение отбрасывало по маске, не дойдя до
  // проверки заказа: покупатель видел «проверьте правильность ввода данных».
  it("той же длины, что номера действующего сайта", () => {
    expect(ORDER_REF_LENGTH).toBe(LEGACY[0].length);
    for (let i = 0; i < 50; i += 1) {
      expect(generateOrderRef()).toHaveLength(ORDER_REF_LENGTH);
    }
  });

  it("только цифры — буквы маской не подтверждены", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOrderRef()).toMatch(/^\d+$/);
    }
  });

  // Kaspi спрашивает про номер СТАРЫЙ сайт: тот ищет у себя и только не найдя
  // обращается к нам. Совпади номера — покупатель оплатил бы чужой заказ и
  // ничего бы не заметил.
  it("не может совпасть с номером действующего сайта", () => {
    for (const legacy of LEGACY) {
      expect(isOrderRef(legacy)).toBe(false);
    }
    for (let i = 0; i < 200; i += 1) {
      expect(generateOrderRef().startsWith("9")).toBe(true);
    }
  });

  it("узнаётся и приводится к общему виду", () => {
    const ref = generateOrderRef();
    expect(isOrderRef(ref)).toBe(true);
    expect(normalizeOrderRef(`  ${ref} `)).toBe(ref);
  });

  it("чужое за номер не принимает", () => {
    expect(isOrderRef("cmt8o1zhw000227nj3dwz5me3")).toBe(false);
    expect(isOrderRef("9")).toBe(false);
    expect(isOrderRef("91234567890123456789012")).toBe(false);
    expect(isOrderRef("9123456789012345678A")).toBe(false);
  });

  it("не повторяется", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateOrderRef()));
    expect(seen.size).toBe(2000);
  });
});
