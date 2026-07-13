import { describe, expect, it } from "vitest";

/**
 * Формат внутреннего серийного номера салона (WM001…). Логика падинга
 * дублирует lib/certificates.nextSalonSerial — держим в синхроне.
 */
function formatSerial(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(3, "0")}`;
}

describe("серийный номер сертификата по салону", () => {
  it("паддинг до 3 цифр, префикс салона", () => {
    expect(formatSerial("WM", 1)).toBe("WM001");
    expect(formatSerial("WM", 2)).toBe("WM002");
    expect(formatSerial("WR", 47)).toBe("WR047");
    expect(formatSerial("WK", 100)).toBe("WK100");
  });

  it("после 999 не обрезается", () => {
    expect(formatSerial("WP", 1000)).toBe("WP1000");
  });

  it("не пересекается с публичным кодом IMB-… (разные пространства)", () => {
    expect(formatSerial("WM", 1)).not.toMatch(/^IMB-/);
  });
});
