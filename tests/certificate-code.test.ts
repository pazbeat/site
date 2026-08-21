import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_REGEX,
  formatSalonCode,
  generateCertificateCode,
  hashCode,
  isValidCodeFormat,
  maskCode,
  normalizeCode,
} from "@/lib/certificate-code";
import { checkSchema } from "@/lib/validation";

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

describe("салонный номер сертификата", () => {
  it("собирается как на действующем сайте: префикс и четыре цифры", () => {
    expect(formatSalonCode("WM", 1)).toBe("WM0001");
    expect(formatSalonCode("WR", 42)).toBe("WR0042");
    // счётчик перерос четыре знака — номер просто длиннее, не обрезаем
    expect(formatSalonCode("WM", 12345)).toBe("WM12345");
  });

  it("принимается на проверке в любом написании", () => {
    expect(isValidCodeFormat("WM0001")).toBe(true);
    expect(isValidCodeFormat("wm0001")).toBe(true);
    expect(isValidCodeFormat(" WM-0001 ")).toBe(true);
    expect(normalizeCode("wm 0001")).toBe("WM0001");
  });

  it("не принимает мусор, похожий на номер", () => {
    expect(isValidCodeFormat("W0001")).toBe(false);
    expect(isValidCodeFormat("WMM0001")).toBe(false);
    expect(isValidCodeFormat("WM01")).toBe(false);
  });

  it("старый случайный код продолжает работать", () => {
    expect(isValidCodeFormat("IMB-2ES9-CQQD")).toBe(true);
    expect(normalizeCode("imb2es9cqqd")).toBe("IMB-2ES9-CQQD");
  });

  it("салонный номер в админке показывается целиком, случайный — прячется", () => {
    expect(maskCode("WM0001")).toBe("WM0001");
    expect(maskCode("IMB-2ES9-CQQD")).toBe("IMB-••••-••QD");
  });
});

describe("схема проверки сертификата принимает салонный номер", () => {
  it("не отвергает номер за краткость", () => {
    // Ловушка, на которую уже наступили: минимум в 8 знаков отсекал WM0001
    expect(checkSchema.safeParse({ code: "WM0001" }).success).toBe(true);
    expect(checkSchema.safeParse({ code: "WM001" }).success).toBe(true);
    expect(checkSchema.safeParse({ code: "IMB-2ES9-CQQD" }).success).toBe(true);
  });
});
