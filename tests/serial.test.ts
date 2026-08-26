import { describe, expect, it } from "vitest";
import { formatSalonCode, isSalonCode } from "../lib/certificate-code";

/**
 * Салонный номер сертификата (WM9001…). Он же публичный код: один номер в
 * письме, в PDF, на странице проверки и в Altegio.
 */
describe("серийный номер сертификата по салону", () => {
  it("паддинг до 4 цифр, префикс салона", () => {
    expect(formatSalonCode("WM", 1)).toBe("WM0001");
    expect(formatSalonCode("WR", 47)).toBe("WR0047");
    expect(formatSalonCode("WK", 100)).toBe("WK0100");
  });

  it("рабочий диапазон начинается с 9001", () => {
    // База счётчика — 9000 (миграция 20260826080000_serial_base_9001):
    // низкие номера в Altegio местами заняты историей действующего сайта.
    expect(formatSalonCode("WM", 9001)).toBe("WM9001");
    expect(isSalonCode(formatSalonCode("WM", 9001))).toBe(true);
  });

  it("после 9999 не обрезается и остаётся салонным номером", () => {
    expect(formatSalonCode("WP", 10000)).toBe("WP10000");
    expect(isSalonCode("WP10000")).toBe(true);
  });

  it("не пересекается с публичным кодом IMB-… (разные пространства)", () => {
    expect(formatSalonCode("WM", 9001)).not.toMatch(/^IMB-/);
  });
});
