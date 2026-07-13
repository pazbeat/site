import { describe, expect, it } from "vitest";
import { buildCertComment } from "../lib/altegio/sync";
import { SALON_PREFIX_TO_ALTEGIO } from "../lib/altegio/mapping";

describe("altegio buildCertComment", () => {
  it("помечает тестовые записи префиксом [ТЕСТ]", () => {
    const c = buildCertComment({ test: true, serial: "WM001", orderId: "abc" });
    expect(c).toContain("[ТЕСТ]");
    expect(c).toContain("WM001");
    expect(c).toContain("abc");
  });

  it("без теста — без пометки", () => {
    const c = buildCertComment({ test: false, serial: "WT007", orderId: "o1" });
    expect(c).not.toContain("[ТЕСТ]");
    expect(c).toContain("WT007");
  });

  it("работает без серийника", () => {
    const c = buildCertComment({ test: true, serial: null, orderId: "o2" });
    expect(c).toContain("[ТЕСТ]");
    expect(c).toContain("o2");
  });
});

describe("altegio salon mapping", () => {
  it("покрывает все 7 префиксов уникальными company_id", () => {
    const ids = Object.values(SALON_PREFIX_TO_ALTEGIO);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
  });
});
