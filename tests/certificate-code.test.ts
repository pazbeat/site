import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_REGEX,
  generateCertificateCode,
  hashCode,
  isValidCodeFormat,
  maskCode,
  normalizeCode,
} from "@/lib/certificate-code";

describe("generateCertificateCode", () => {
  it("выдаёт формат IMB-XXXX-XXXX", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateCertificateCode()).toMatch(CODE_REGEX);
    }
  });

  it("случайная часть не содержит похожих символов O/0/I/1 (PRD §5.3)", () => {
    expect(CODE_ALPHABET).not.toMatch(/[O0I1]/);
    for (let i = 0; i < 1000; i++) {
      const body = generateCertificateCode().slice(4); // без префикса IMB-
      expect(body).not.toMatch(/[O0I1]/);
    }
  });

  it("алфавит даёт ≥ 40 бит энтропии (PRD §9.6)", () => {
    // 8 символов × log2(32) = 40 бит
    expect(CODE_ALPHABET.length).toBe(32);
    expect(8 * Math.log2(CODE_ALPHABET.length)).toBeGreaterThanOrEqual(40);
  });

  it("коды не повторяются на выборке", () => {
    const codes = new Set(
      Array.from({ length: 10_000 }, () => generateCertificateCode()),
    );
    expect(codes.size).toBe(10_000);
  });
});

describe("normalizeCode", () => {
  it("приводит ввод пользователя к каноническому виду", () => {
    expect(normalizeCode("imb-a9f3-k2m4")).toBe("IMB-A9F3-K2M4");
    expect(normalizeCode("IMB A9F3 K2M4")).toBe("IMB-A9F3-K2M4");
    expect(normalizeCode("imbA9F3K2M4")).toBe("IMB-A9F3-K2M4");
    expect(normalizeCode("A9F3K2M4")).toBe("IMB-A9F3-K2M4");
  });
});

describe("isValidCodeFormat", () => {
  it("принимает валидные коды", () => {
    expect(isValidCodeFormat("IMB-A9F3-K2M4")).toBe(true);
    expect(isValidCodeFormat(generateCertificateCode())).toBe(true);
  });

  it("отклоняет невалидные коды", () => {
    expect(isValidCodeFormat("")).toBe(false);
    expect(isValidCodeFormat("IMB-0000-1111")).toBe(false); // запрещённые символы
    expect(isValidCodeFormat("IMB-A9F3")).toBe(false); // короткий
    expect(isValidCodeFormat("XYZ-A9F3-K2M4-EXTRA")).toBe(false);
  });
});

describe("hashCode", () => {
  it("стабилен и не зависит от форматирования ввода", () => {
    expect(hashCode("IMB-A9F3-K2M4")).toBe(hashCode("imb a9f3 k2m4"));
    expect(hashCode("IMB-A9F3-K2M4")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("разные коды дают разные хэши", () => {
    expect(hashCode("IMB-A9F3-K2M4")).not.toBe(hashCode("IMB-A9F3-K2M5"));
  });
});

describe("maskCode", () => {
  it("показывает только последние 2 символа", () => {
    expect(maskCode("IMB-A9F3-K2M4")).toBe("IMB-••••-••M4");
    expect(maskCode("IMB-A9F3-K2M4")).not.toContain("A9F3");
  });
});
