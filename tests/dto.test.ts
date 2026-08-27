import { describe, expect, it, vi } from "vitest";
import { toSalonDto } from "@/lib/dto";
import type { Salon } from "@/lib/generated/prisma/client";

const base: Salon = {
  id: 1,
  city: "Караганда",
  cityNames: { ru: "Караганда", kk: "Қарағанды", en: "Karaganda" },
  name: "Имбирь в БЦ «Grey Plaza»",
  address: "ул. Гоголя 34А, БЦ «Grey Plaza»",
  addressNames: {
    ru: "ул. Гоголя 34А, БЦ «Grey Plaza»",
    kk: "Гоголь көш., 34А, «Grey Plaza» БО",
    en: "34A Gogol St, Grey Plaza business centre",
  },
  phone: "+7 708 111 8098",
  altegioLocationId: null,
  codePrefix: "WK",
  lastCertSerial: 0,
  active: true,
  orderable: true,
  sort: 0,
};

describe("toSalonDto", () => {
  it("отдаёт город и адрес на языке страницы", () => {
    const kk = toSalonDto(base, "kk");
    expect(kk.city).toBe("Қарағанды");
    expect(kk.address).toBe("Гоголь көш., 34А, «Grey Plaza» БО");

    const en = toSalonDto(base, "en");
    expect(en.city).toBe("Karaganda");
    expect(en.address).toBe("34A Gogol St, Grey Plaza business centre");
  });

  it("ключ города остаётся русским — по нему фильтруются программы", () => {
    for (const locale of ["ru", "kk", "en"]) {
      expect(toSalonDto(base, locale).cityKey).toBe("Караганда");
    }
  });

  it("без переводов откатывается на русские поля", () => {
    const bare = { ...base, cityNames: null, addressNames: null };
    const en = toSalonDto(bare, "en");
    expect(en.city).toBe("Караганда");
    expect(en.address).toBe("ул. Гоголя 34А, БЦ «Grey Plaza»");
  });
});

describe("версия сборки", () => {
  it("без аргументов сборки честно говорит dev", async () => {
    vi.stubEnv("BUILD_NUMBER", "");
    vi.stubEnv("BUILD_SHA", "");
    vi.stubEnv("BUILD_TIME", "");
    const { buildInfo } = await import("@/lib/version");
    expect(buildInfo().label).toBe("dev");
    vi.unstubAllEnvs();
  });

  it("показывает понятный номер, а не хэш коммита", async () => {
    // По двум хэшам не сказать, какой новее, — вопрос ровно в этом.
    vi.stubEnv("BUILD_NUMBER", "247");
    vi.stubEnv("BUILD_SHA", "601f96d");
    vi.stubEnv("BUILD_TIME", "2026-08-27T05:00:00Z");
    const { buildInfo } = await import("@/lib/version");
    const info = buildInfo();
    expect(info.label).toContain("Версия 247");
    expect(info.label).not.toContain("601f96d");
    // 05:00 UTC — это 10:00 в Алматы, а не 05:00.
    expect(info.label).toContain("10:00");
    // Коммит нужен разработчику — прячем в подсказку.
    expect(info.title).toContain("601f96d");
    vi.unstubAllEnvs();
  });

  it("мусор во времени сборки не ломает подвал", async () => {
    vi.stubEnv("BUILD_NUMBER", "247");
    vi.stubEnv("BUILD_SHA", "abc1234");
    vi.stubEnv("BUILD_TIME", "не-дата");
    const { buildInfo } = await import("@/lib/version");
    expect(buildInfo().label).toBe("Версия 247");
    vi.unstubAllEnvs();
  });

  it("без номера показывает хоть коммит — лучше, чем ничего", async () => {
    vi.stubEnv("BUILD_NUMBER", "");
    vi.stubEnv("BUILD_SHA", "abc1234");
    vi.stubEnv("BUILD_TIME", "");
    const { buildInfo } = await import("@/lib/version");
    expect(buildInfo().label).toBe("abc1234");
    vi.unstubAllEnvs();
  });
});
