import { describe, expect, it } from "vitest";
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
