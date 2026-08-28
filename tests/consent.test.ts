import { describe, expect, it } from "vitest";
import { composeConsent, hashLegalContent } from "@/lib/consent";

const NOW = new Date("2026-08-25T09:15:42.123Z");

const shown = {
  offer: { id: 14, contentHtmlSanitized: "<p>Оферта, казахская редакция</p>" },
  privacy: { id: 17, contentHtmlSanitized: "<p>Политика</p>" },
  rules: { id: 20, contentHtmlSanitized: "<p>Правила</p>" },
  consent_modal: { id: 23, contentHtmlSanitized: "<p>Условия покупки</p>" },
};

const base = { ip: "94.131.226.183", ua: "Mozilla/5.0", locale: "kk", now: NOW };

describe("отпечаток правового текста", () => {
  it("одинаковый текст даёт одинаковый отпечаток", () => {
    expect(hashLegalContent("<p>текст</p>")).toBe(hashLegalContent("<p>текст</p>"));
  });

  // Ради этого отпечаток и заводился: правка текста задним числом должна
  // перестать сходиться с тем, что записано в согласии покупателя.
  it("правка хотя бы одного знака меняет отпечаток", () => {
    const before = hashLegalContent("<p>сертификат действует 3 месяца</p>");
    const after = hashLegalContent("<p>сертификат действует 1 месяц</p>");
    expect(after).not.toBe(before);
  });

  it("это шестнадцатеричный sha256", () => {
    expect(hashLegalContent("что угодно")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("запись согласия", () => {
  it("несёт всё, что потребуется предъявить: время, IP, браузер, язык", () => {
    const record = composeConsent(base, shown);
    expect(record.ts).toBe("2026-08-25T09:15:42.123Z");
    expect(record.ip).toBe("94.131.226.183");
    expect(record.ua).toBe("Mozilla/5.0");
    expect(record.locale).toBe("kk");
  });

  // Главная поломка, ради которой всё переделывалось: казахскому покупателю
  // записывалась русская редакция — та, которую он никогда не видел.
  it("фиксирует ту редакцию, которую показали, а не каноническую", () => {
    const record = composeConsent(base, shown);
    expect(record.versions.offer).toBe(14);
    expect(record.versions.consent_modal).toBe(23);
  });

  it("на каждый документ — отпечаток его текста", () => {
    const record = composeConsent(base, shown);
    expect(record.hashes.offer).toBe(
      hashLegalContent(shown.offer.contentHtmlSanitized),
    );
    expect(record.hashes.privacy).toBe(
      hashLegalContent(shown.privacy.contentHtmlSanitized),
    );
  });

  it("перечисляет все документы, даже если какой-то не нашёлся", () => {
    const record = composeConsent(base, { ...shown, rules: null });
    expect(Object.keys(record.versions).sort()).toEqual([
      "consent_modal",
      "offer",
      "payment_info",
      "privacy",
      "rules",
    ]);
    expect(record.versions.rules).toBeNull();
    expect(record.hashes.rules).toBeNull();
  });

  it("для русской локали ведёт себя так же", () => {
    const record = composeConsent({ ...base, locale: "ru" }, shown);
    expect(record.locale).toBe("ru");
    expect(record.versions.offer).toBe(14);
  });
});

describe("два момента согласия", () => {
  const shown = {
    offer: { id: 1, contentHtmlSanitized: "<p>оферта</p>" },
    privacy: { id: 2, contentHtmlSanitized: "<p>политика</p>" },
    rules: { id: 3, contentHtmlSanitized: "<p>правила</p>" },
    consent_modal: { id: 4, contentHtmlSanitized: "<p>модалка</p>" },
    payment_info: { id: 5, contentHtmlSanitized: "<p>оплата</p>" },
  };
  const base = {
    ip: "1.2.3.4",
    ua: "Mozilla/5.0",
    locale: "ru",
    now: new Date("2026-08-28T10:00:00.000Z"),
  };

  it("записывает оба подтверждения — окно и галочку перед оплатой", () => {
    const rec = composeConsent(
      {
        ...base,
        steps: {
          builder: "2026-08-28T09:50:00.000Z",
          payment: "2026-08-28T09:58:00.000Z",
        },
      },
      shown,
    );
    expect(rec.steps?.builder).toBe("2026-08-28T09:50:00.000Z");
    expect(rec.steps?.payment).toBe("2026-08-28T09:58:00.000Z");
    // Доказательное время — серверное, а не браузерное.
    expect(rec.ts).toBe("2026-08-28T10:00:00.000Z");
  });

  it("новый документ об оплате попадает в согласие наравне с остальными", () => {
    const rec = composeConsent(base, shown);
    expect(rec.versions.payment_info).toBe(5);
    expect(rec.hashes.payment_info).toMatch(/^[0-9a-f]{64}$/);
  });

  it("без подтверждений поле steps не выдумывается", () => {
    const rec = composeConsent(base, shown);
    expect(rec.steps).toBeUndefined();
    const half = composeConsent({ ...base, steps: { payment: undefined } }, shown);
    expect(half.steps).toBeUndefined();
  });
});
