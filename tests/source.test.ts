import { describe, expect, it } from "vitest";
import {
  detectTouch,
  formatSourceCookie,
  isBuilderPath,
  isCountableVisit,
  nextSource,
  parseSourceCookie,
  sanitizeCampaign,
  EMPTY_SOURCE,
  type SourceCookie,
} from "@/lib/source";

const u = (path: string, query = "") => new URL(`https://new.imbir.kz${path}${query}`);
const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

describe("определение канала", () => {
  it("метка utm_source узнаёт площадку", () => {
    expect(detectTouch(u("/ru", "?utm_source=instagram"), null, "/ru")?.channel).toBe(
      "instagram",
    );
    expect(detectTouch(u("/ru", "?utm_source=2gis"), null, "/ru")?.channel).toBe("2gis");
  });

  it("платный трафик отделяется от бесплатного", () => {
    expect(
      detectTouch(u("/ru", "?utm_source=google&utm_medium=cpc"), null, "/ru")?.channel,
    ).toBe("google-ads");
    expect(
      detectTouch(u("/ru", "?utm_source=google&utm_medium=organic"), null, "/ru")?.channel,
    ).toBe("google");
  });

  it("идентификатор клика сам по себе означает рекламу", () => {
    const t = detectTouch(u("/ru", "?gclid=EAIaIQobCh"), null, "/ru");
    expect(t?.channel).toBe("google-ads");
    expect(t?.clickIdType).toBe("gclid");
    expect(t?.clickId).toBe("EAIaIQobCh");
  });

  it("незнакомый источник попадает в «прочее», а не плодит строки в отчёте", () => {
    expect(detectTouch(u("/ru", "?utm_source=какой-то-мусор"), null, "/ru")?.channel).toBe(
      "other",
    );
  });

  it("переход с поисковика узнаётся по адресу страницы-источника", () => {
    expect(detectTouch(u("/ru"), "https://www.google.com/search?q=спа", "/ru")?.channel).toBe(
      "google",
    );
    expect(detectTouch(u("/ru"), "https://l.instagram.com/", "/ru")?.channel).toBe(
      "instagram",
    );
    expect(detectTouch(u("/ru"), "https://example.com/blog", "/ru")?.channel).toBe(
      "referral",
    );
  });

  // Иначе продажа запишется на Kaspi или на Gmail — они «привели» покупателя
  // ровно перед оплатой, украв заслугу у настоящей рекламы.
  it("возврат с оплаты и переход из почты не считаются каналом", () => {
    expect(detectTouch(u("/ru"), "https://kaspi.kz/pay/xxx", "/ru")).toBeNull();
    expect(detectTouch(u("/ru"), "https://mail.google.com/", "/ru")).toBeNull();
    expect(detectTouch(u("/ru"), "https://new.imbir.kz/ru/programs", "/ru")).toBeNull();
  });

  it("на странице успеха и оплаты не размечаем вовсе", () => {
    expect(detectTouch(u("/ru/success", "?utm_source=instagram"), null, "/ru/success")).toBeNull();
    expect(detectTouch(u("/ru/pay/kaspi", "?order=1"), "https://kaspi.kz/", "/ru/pay/kaspi")).toBeNull();
  });

  it("обычный переход без метки и без реферера — не касание", () => {
    expect(detectTouch(u("/ru/programs"), null, "/ru/programs")).toBeNull();
  });

  it("метка кампании чистится от опасных знаков", () => {
    // Кириллица, пробелы и угловые скобки выброшены; цифры и латиница — знаки
    // допустимые, они остаются
    expect(sanitizeCampaign("8 Марта <script>")).toBe("8script");
    expect(sanitizeCampaign("march8_2026")).toBe("march8_2026");
    expect(sanitizeCampaign(null)).toBe("");
  });
});

describe("кто человек, а кто робот", () => {
  it("обычный браузер считается", () => {
    expect(
      isCountableVisit(
        headers({ "user-agent": "Mozilla/5.0 (iPhone)", "sec-fetch-mode": "navigate" }),
      ),
    ).toBe(true);
  });

  it("поисковые роботы не считаются", () => {
    for (const ua of ["Googlebot/2.1", "YandexBot/3.0", "curl/8.7", "ClaudeBot"]) {
      expect(isCountableVisit(headers({ "user-agent": ua }))).toBe(false);
    }
  });

  // Next заранее подгружает страницы под курсором — это не визит человека
  it("предзагрузка ссылок не считается", () => {
    expect(
      isCountableVisit(headers({ "user-agent": "Mozilla/5.0", "next-router-prefetch": "1" })),
    ).toBe(false);
    expect(
      isCountableVisit(headers({ "user-agent": "Mozilla/5.0", rsc: "1" })),
    ).toBe(false);
  });

  it("запрос картинки или скрипта не считается", () => {
    expect(
      isCountableVisit(headers({ "user-agent": "Mozilla/5.0", "sec-fetch-mode": "no-cors" })),
    ).toBe(false);
  });
});

describe("кука источника", () => {
  const cookie: SourceCookie = {
    first: "instagram-ads",
    last: "google",
    campaign: "march8",
    clickIdType: "fbclid",
    clickId: "IwAR123",
    dayVisit: "2026-08-25",
    dayBuilder: "",
  };

  it("складывается и разбирается обратно без потерь", () => {
    expect(parseSourceCookie(formatSourceCookie(cookie))).toEqual(cookie);
  });

  it("чужое и битое значение отбрасывается", () => {
    expect(parseSourceCookie("")).toBeNull();
    expect(parseSourceCookie("мусор")).toBeNull();
    expect(parseSourceCookie("9|instagram|google|||||")).toBeNull();
    expect(parseSourceCookie("1|выдумка|google|||||")).toBeNull();
  });
});

describe("пересчёт при заходе", () => {
  const today = "2026-08-25";

  it("новый посетитель без метки — прямой заход, считается", () => {
    const r = nextSource({ prev: null, touch: null, today, countable: true, isBuilderPath: false });
    expect(r.next.first).toBe("direct");
    expect(r.countVisit).toBe(true);
    expect(r.changed).toBe(true);
  });

  it("«кто привёл» больше не меняется, «кто закрыл» — меняется", () => {
    const prev = { ...EMPTY_SOURCE, first: "instagram" as const, last: "instagram" as const, dayVisit: today };
    const r = nextSource({
      prev,
      touch: { channel: "google-ads", campaign: "sale", clickIdType: "gclid", clickId: "X1" },
      today,
      countable: true,
      isBuilderPath: false,
    });
    expect(r.next.first).toBe("instagram");
    expect(r.next.last).toBe("google-ads");
    expect(r.next.campaign).toBe("sale");
  });

  it("в один день посетитель считается один раз", () => {
    const prev = { ...EMPTY_SOURCE, dayVisit: today };
    expect(
      nextSource({ prev, touch: null, today, countable: true, isBuilderPath: false }).countVisit,
    ).toBe(false);
    expect(
      nextSource({ prev, touch: null, today: "2026-08-26", countable: true, isBuilderPath: false })
        .countVisit,
    ).toBe(true);
  });

  it("робот не считается и куку не меняет", () => {
    const prev = { ...EMPTY_SOURCE, dayVisit: today };
    const r = nextSource({ prev, touch: null, today, countable: false, isBuilderPath: true });
    expect(r.countVisit).toBe(false);
    expect(r.countBuilder).toBe(false);
    expect(r.changed).toBe(false);
  });

  it("открытие конструктора считается отдельной стадией", () => {
    const prev = { ...EMPTY_SOURCE, dayVisit: today };
    const r = nextSource({ prev, touch: null, today, countable: true, isBuilderPath: true });
    expect(r.countBuilder).toBe(true);
    expect(r.next.dayBuilder).toBe(today);
  });

  it("внутренний переход не трогает канал", () => {
    const prev = { ...EMPTY_SOURCE, first: "yandex" as const, last: "yandex" as const, dayVisit: today };
    const r = nextSource({ prev, touch: null, today, countable: true, isBuilderPath: false });
    expect(r.next.last).toBe("yandex");
    expect(r.changed).toBe(false);
  });
});

describe("путь конструктора", () => {
  it("узнаётся на всех языках и только он", () => {
    expect(isBuilderPath("/ru/create")).toBe(true);
    expect(isBuilderPath("/kk/create/")).toBe(true);
    expect(isBuilderPath("/en/create")).toBe(true);
    expect(isBuilderPath("/ru/programs")).toBe(false);
    expect(isBuilderPath("/ru")).toBe(false);
  });
});
