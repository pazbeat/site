import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApplePassJson, buildPassStrings, PASS_LOCALES } from "@/lib/wallet/apple-pass";
import { buildManifest, buildPassContents } from "@/lib/wallet/package";
import { buildPassFields, type PassSource } from "@/lib/wallet/pass";
import { buildZip } from "@/lib/wallet/zip";

const NOW = new Date("2026-08-22T06:00:00Z");

function cert(over: Partial<PassSource> = {}): PassSource {
  return {
    code: "WM0042",
    holder: "Айгерим",
    fromName: "Мадина",
    amountKzt: 20000,
    balanceKzt: 20000,
    status: "active",
    validUntil: new Date("2026-11-18T00:00:00Z"),
    salonName: "Имбирь на Мәңгілік Ел",
    programName: null,
    ...over,
  };
}

const config = {
  passTypeIdentifier: "pass.kz.imbir.sert",
  teamIdentifier: "8P2AARWSYR",
  organizationName: "Imbir Thai Spa",
  serialNumber: "0123456789abcdef0123456789abcdef",
};

describe("buildApplePassJson", () => {
  const pass = buildApplePassJson(buildPassFields(cert(), NOW), config);

  it("серийник карты не равен коду сертификата", () => {
    expect(pass.serialNumber).toBe(config.serialNumber);
    expect(pass.serialNumber).not.toBe("WM0042");
  });

  it("тип карты — storeCard: только у него есть полоса вверху", () => {
    // Полоса (strip.png) — единственное место, куда помещается оформление;
    // у прежнего generic такого слота нет вовсе.
    expect(pass.storeCard).toBeDefined();
    expect((pass as unknown as Record<string, unknown>).generic).toBeUndefined();
  });

  it("рядом с «Кому» стоит «От кого», когда даритель назвался", () => {
    const keys = pass.storeCard.secondaryFields.map((f) => f.key);
    expect(keys).toEqual(["holder", "fromName"]);
  });

  it("даритель не назвался — пустой подписи на карте нет", () => {
    const anon = buildApplePassJson(
      buildPassFields(cert({ fromName: null }), NOW),
      config,
    );
    expect(anon.storeCard.secondaryFields.map((f) => f.key)).toEqual(["holder"]);
  });

  it("остаток уходит числом с валютой — Apple форматирует сам", () => {
    const primary = pass.storeCard.primaryFields[0];
    expect(primary.value).toBe(20000);
    expect(primary.currencyCode).toBe("KZT");
  });

  it("штрихкод PDF417 несёт номер сертификата", () => {
    expect(pass.barcodes[0]).toMatchObject({
      message: "WM0042",
      format: "PKBarcodeFormatPDF417",
    });
    // старым iOS нужен одиночный barcode
    expect(pass.barcode.message).toBe("WM0042");
  });

  it("цвета из брендбука, а не сиреневый действующего сайта", () => {
    expect(pass.backgroundColor).toBe("rgb(77, 41, 93)");
    expect(pass.labelColor).toBe("rgb(182, 146, 68)");
  });

  it("без адреса веб-сервиса пропуск не обещает обновлений", () => {
    expect(pass.webServiceURL).toBeUndefined();
    expect(pass.authenticationToken).toBeUndefined();
  });

  it("адрес и токен ставятся только парой", () => {
    const withService = buildApplePassJson(buildPassFields(cert(), NOW), {
      ...config,
      webServiceUrl: "https://new.imbir.kz/api/wallet/apple",
      authenticationToken: "секрет",
    });
    expect(withService.webServiceURL).toBe("https://new.imbir.kz/api/wallet/apple");
    expect(withService.authenticationToken).toBe("секрет");
  });

  it("токен веб-сервиса не равен коду сертификата", () => {
    // код секретный и хранится хэшем; на устройство он уезжать не должен
    const withService = buildApplePassJson(buildPassFields(cert(), NOW), {
      ...config,
      webServiceUrl: "https://new.imbir.kz/api/wallet/apple",
      authenticationToken: "случайный-токен",
    });
    expect(withService.authenticationToken).not.toBe("WM0042");
  });

  it("погашенная карта помечена voided и объясняет причину", () => {
    const voided = buildApplePassJson(buildPassFields(cert({ status: "used" }), NOW), config);
    expect(voided.voided).toBe(true);
    const back = voided.storeCard.backFields;
    expect(back[0]).toMatchObject({ key: "status", value: "Погашен" });
  });

  it("у действующей карты причины нет", () => {
    expect(pass.voided).toBe(false);
    const back = pass.storeCard.backFields;
    expect(back.some((f) => f.key === "status")).toBe(false);
  });
});

describe("buildPassStrings", () => {
  it("подписи есть на всех трёх языках сайта", () => {
    expect(PASS_LOCALES.sort()).toEqual(["en", "kk", "ru"]);
    for (const locale of PASS_LOCALES) {
      expect(buildPassStrings(locale)).toContain('"balance" = ');
    }
  });

  it("русские подписи — русские", () => {
    expect(buildPassStrings("ru")).toContain('"balance" = "Остаток";');
  });

  it("неизвестный язык — ошибка, а не молчаливая пустая карта", () => {
    expect(() => buildPassStrings("de")).toThrow(/de/);
  });
});

describe("buildManifest", () => {
  const contents = buildPassContents({
    fields: buildPassFields(cert(), NOW),
    config,
    images: [{ name: "icon.png", data: Buffer.from("картинка") }],
  });

  it("считает SHA-1 каждого файла", () => {
    const manifest = JSON.parse(buildManifest(contents).toString());
    expect(manifest["icon.png"]).toBe(
      createHash("sha1").update(Buffer.from("картинка")).digest("hex"),
    );
    expect(Object.keys(manifest)).toContain("pass.json");
  });

  it("описывает все файлы пропуска и ничего сверх них", () => {
    const manifest = JSON.parse(buildManifest(contents).toString());
    expect(Object.keys(manifest).sort()).toEqual(contents.map((c) => c.name).sort());
    expect(manifest["manifest.json"]).toBeUndefined();
    expect(manifest.signature).toBeUndefined();
  });

  it("правка любого байта меняет хэш", () => {
    const tampered = contents.map((c) =>
      c.name === "icon.png" ? { ...c, data: Buffer.from("картинкa") } : c,
    );
    expect(buildManifest(tampered).toString()).not.toBe(buildManifest(contents).toString());
  });
});

describe("buildZip", () => {
  const entries = [
    { name: "pass.json", data: Buffer.from('{"a":1}') },
    { name: "ru.lproj/pass.strings", data: Buffer.from('"balance" = "Остаток";') },
  ];
  const zip = buildZip(entries);

  it("начинается локальным заголовком и кончается концом каталога", () => {
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });

  it("в каталоге столько записей, сколько файлов", () => {
    expect(zip.readUInt16LE(zip.length - 22 + 8)).toBe(2);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);
  });

  it("смещение каталога указывает на первую запись каталога", () => {
    const offset = zip.readUInt32LE(zip.length - 22 + 16);
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
  });

  it("данные лежат внутри как есть", () => {
    expect(zip.includes(Buffer.from('{"a":1}'))).toBe(true);
  });

  it("одни и те же файлы дают побайтово одинаковый архив", () => {
    expect(buildZip(entries).equals(zip)).toBe(true);
  });

  it("пустой список — валидный пустой архив", () => {
    const empty = buildZip([]);
    expect(empty.length).toBe(22);
    expect(empty.readUInt16LE(8)).toBe(0);
  });
});
