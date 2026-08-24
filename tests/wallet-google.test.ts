import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildOauthAssertion,
  buildSaveJwtPayload,
  decodeJwtParts,
  normalizePrivateKey,
  signJwtRs256,
} from "@/lib/wallet/google-jwt";
import {
  buildGiftCardClass,
  buildGiftCardObject,
  buildGiftCardPatch,
  giftCardObjectId,
  giftCardState,
} from "@/lib/wallet/google-pass";
import { buildPassFields, type PassSource } from "@/lib/wallet/pass";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const IDS = { issuerId: "3388000000012345678", classSuffix: "imbir-gift" };
const NOW = new Date("2026-08-24T10:00:00.000Z");

function source(over: Partial<PassSource> = {}): PassSource {
  return {
    code: "WM0001",
    holder: "Айгуль",
    amountKzt: 20000,
    balanceKzt: 20000,
    status: "active",
    validUntil: new Date("2026-11-21T00:00:00.000Z"),
    salonName: "Имбирь на Мәңгілік Ел",
    programName: null,
    ...over,
  };
}

describe("подпись токенов Google", () => {
  it("собирает JWT из трёх частей с заголовком RS256", () => {
    const token = signJwtRs256({ hello: "мир" }, privateKey);
    const { header, payload } = decodeJwtParts(token);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(payload).toEqual({ hello: "мир" });
  });

  it("подпись сходится с открытым ключом", () => {
    const token = signJwtRs256({ a: 1 }, privateKey);
    const [h, p, sig] = token.split(".");
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${p}`)
      .end()
      .verify(publicKey, Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
  });

  it("подделанное тело подпись не проходит", () => {
    const token = signJwtRs256({ sum: 100 }, privateKey);
    const [h, , sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sum: 999999 })).toString("base64url");
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${forged}`)
      .end()
      .verify(publicKey, Buffer.from(sig, "base64url"));
    expect(ok).toBe(false);
  });

  it("разворачивает ключ, записанный одной строкой с \\n", () => {
    // Ровно в таком виде ключ лежит в JSON сервисного аккаунта
    const escaped = privateKey.replace(/\n/g, "\\n");
    expect(normalizePrivateKey(escaped).trim()).toBe(privateKey.trim());
  });

  it("готовый PEM не портит, лишние пробелы по краям убирает", () => {
    expect(normalizePrivateKey(privateKey).trim()).toBe(privateKey.trim());
    expect(normalizePrivateKey(`\n  ${privateKey}  \n`)).toBe(privateKey.trim());
  });

  it("токен не содержит символов, ломающих URL", () => {
    const token = signJwtRs256({ v: "значение" }, privateKey);
    expect(token).toBe(encodeURIComponent(token).replace(/%2E/gi, "."));
  });
});

describe("тело ссылки «Сохранить в Кошелёк»", () => {
  const payload = buildSaveJwtPayload({
    clientEmail: "wallet@imbir.iam.gserviceaccount.com",
    origin: "https://new.imbir.kz",
    giftCardClass: buildGiftCardClass(IDS, "https://new.imbir.kz"),
    giftCardObject: buildGiftCardObject({
      ids: IDS,
      serialNumber: "abc123",
      fields: buildPassFields(source(), NOW),
      now: NOW,
    }),
    now: NOW.getTime(),
  });

  it("адресовано Google и помечено как сохранение карты", () => {
    expect(payload.aud).toBe("google");
    expect(payload.typ).toBe("savetowallet");
    expect(payload.iss).toContain("gserviceaccount.com");
  });

  it("разрешает открывать ссылку только с нашего домена", () => {
    expect(payload.origins).toEqual(["https://new.imbir.kz"]);
  });

  it("несёт и оформление, и саму карту — иначе класс пришлось бы заводить заранее", () => {
    const inner = payload.payload as Record<string, unknown[]>;
    expect(inner.giftCardClasses).toHaveLength(1);
    expect(inner.giftCardObjects).toHaveLength(1);
  });
});

describe("карта Google", () => {
  it("идентификатор строится от серийника, а не от кода сертификата", () => {
    const id = giftCardObjectId(IDS, "abc123");
    expect(id).toBe("3388000000012345678.abc123");
    expect(id).not.toContain("WM0001");
  });

  it("вычищает из идентификатора запрещённые символы", () => {
    expect(giftCardObjectId(IDS, "a b/c#1")).toBe("3388000000012345678.abc1");
  });

  it("остаток уходит в микроединицах тенге", () => {
    const card = buildGiftCardObject({
      ids: IDS,
      serialNumber: "s1",
      fields: buildPassFields(source({ balanceKzt: 20000 }), NOW),
      now: NOW,
    });
    expect(card.balance).toEqual({ micros: 20_000_000_000, currencyCode: "KZT" });
  });

  it("штрихкод несёт номер сертификата", () => {
    const card = buildGiftCardObject({
      ids: IDS,
      serialNumber: "s1",
      fields: buildPassFields(source(), NOW),
      now: NOW,
    });
    expect(card.barcode).toMatchObject({ type: "PDF_417", value: "WM0001" });
    expect(card.cardNumber).toBe("WM0001");
  });

  it("номинал показывает, только когда часть потрачена", () => {
    const whole = buildGiftCardObject({
      ids: IDS,
      serialNumber: "s1",
      fields: buildPassFields(source({ balanceKzt: 20000 }), NOW),
      now: NOW,
    }).textModulesData as Array<{ id: string }>;
    expect(whole.some((m) => m.id === "nominal")).toBe(false);

    const spent = buildGiftCardObject({
      ids: IDS,
      serialNumber: "s1",
      fields: buildPassFields(source({ balanceKzt: 5000 }), NOW),
      now: NOW,
    }).textModulesData as Array<{ id: string; body: string }>;
    expect(spent.find((m) => m.id === "nominal")?.body).toContain("20");
  });

  it("цвет из брендбука, а не сиреневый действующего сайта", () => {
    const card = buildGiftCardObject({
      ids: IDS,
      serialNumber: "s1",
      fields: buildPassFields(source(), NOW),
      now: NOW,
    });
    expect(card.hexBackgroundColor).toBe("#4D295D");
  });
});

describe("состояние карты", () => {
  const state = (over: Partial<PassSource>) =>
    giftCardState(buildPassFields(source(over), NOW));

  it("действующая карта активна", () => {
    expect(state({})).toBe("ACTIVE");
  });

  it("истёкший срок помечается отдельно от прочих причин", () => {
    expect(state({ status: "expired" })).toBe("EXPIRED");
  });

  it("блокировка и возврат закрывают карту", () => {
    expect(state({ status: "blocked" })).toBe("INACTIVE");
    expect(state({ status: "refunded" })).toBe("INACTIVE");
  });

  it("нулевой остаток закрывает карту, даже если статус ещё active", () => {
    // Сверка с Altegio обнуляет баланс раньше, чем сменится статус
    expect(state({ balanceKzt: 0 })).toBe("INACTIVE");
  });
});

describe("обновление сохранённой карты", () => {
  it("шлёт только своё: остаток, состояние и подписи", () => {
    const patch = buildGiftCardPatch(buildPassFields(source({ balanceKzt: 7000 }), NOW), NOW);
    expect(Object.keys(patch).sort()).toEqual([
      "balance",
      "balanceUpdateTime",
      "state",
      "textModulesData",
    ]);
    expect(patch.balance).toEqual({ micros: 7_000_000_000, currencyCode: "KZT" });
  });

  it("не трогает штрихкод и привязку — их хранит Google", () => {
    const patch = buildGiftCardPatch(buildPassFields(source(), NOW), NOW);
    expect(patch).not.toHaveProperty("barcode");
    expect(patch).not.toHaveProperty("id");
    expect(patch).not.toHaveProperty("classId");
  });

  it("на погашенной карте называет причину", () => {
    // Иначе владелец видит ноль и не понимает: потратил или сломалось
    const patch = buildGiftCardPatch(buildPassFields(source({ balanceKzt: 0 }), NOW), NOW);
    const modules = patch.textModulesData as Array<{ id: string; body: string }>;
    expect(modules.find((m) => m.id === "state")?.body).toBe("Погашен");
    expect(patch.state).toBe("INACTIVE");
  });

  it("на действующей карте строки статуса нет", () => {
    const patch = buildGiftCardPatch(buildPassFields(source(), NOW), NOW);
    const modules = patch.textModulesData as Array<{ id: string }>;
    expect(modules.some((m) => m.id === "state")).toBe(false);
  });
});

describe("утверждение для доступа к API", () => {
  it("живёт час и адресовано серверу токенов Google", () => {
    const a = buildOauthAssertion({
      clientEmail: "wallet@imbir.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/wallet_object.issuer",
      now: NOW.getTime(),
    });
    expect(a.aud).toBe("https://oauth2.googleapis.com/token");
    expect((a.exp as number) - (a.iat as number)).toBe(3600);
  });
});

describe("ключ переживает дорогу до контейнера", () => {
  it("принимает PEM, записанный в base64", () => {
    // Так ключ приходится хранить в env-файле: docker-compose разворачивает
    // \n в настоящий перенос и обрывает значение на первой строке
    const packed = Buffer.from(privateKey, "utf8").toString("base64");
    expect(normalizePrivateKey(packed)).toBe(privateKey);
  });

  it("подписывает ключом из base64 так же, как исходным", () => {
    const packed = Buffer.from(privateKey, "utf8").toString("base64");
    const token = signJwtRs256({ a: 1 }, packed);
    const [h, p, sig] = token.split(".");
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${p}`)
      .end()
      .verify(publicKey, Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
  });
});

describe("оформление карты", () => {
  const cls = buildGiftCardClass(IDS, "https://new.imbir.kz/");

  it("несёт логотип и баннер — без них карта пустой прямоугольник", () => {
    const logo = cls.programLogo as { sourceUri: { uri: string } };
    const hero = cls.heroImage as { sourceUri: { uri: string } };
    expect(logo.sourceUri.uri).toContain("/brand/wallet-logo.png");
    expect(hero.sourceUri.uri).toContain("/brand/wallet-hero.jpg");
  });

  it("ссылки на картинки абсолютные — Google забирает их сам", () => {
    const uris = JSON.stringify(cls).match(/https?:\/\/[^"]+/g) ?? [];
    expect(uris.length).toBeGreaterThan(0);
    for (const uri of uris) expect(uri.startsWith("https://")).toBe(true);
  });

  it("не сдваивает косую черту, если адрес пришёл со слэшем на конце", () => {
    expect(JSON.stringify(cls)).not.toContain("kz//");
  });

  it("картинки помечены версией — иначе Google не заберёт новую", () => {
    const logo = cls.programLogo as { sourceUri: { uri: string } };
    const hero = cls.heroImage as { sourceUri: { uri: string } };
    expect(logo.sourceUri.uri).toMatch(/\?v=\d+$/);
    expect(hero.sourceUri.uri).toMatch(/\?v=\d+$/);
  });
});

describe("выбор кошелька по устройству", () => {
  it("iPhone, iPad и Mac уходят в Apple", async () => {
    const { prefersApple } = await import("@/app/api/certificates/wallet/route");
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    ]) {
      expect(prefersApple(ua)).toBe(true);
    }
  });

  it("Android, Windows и пустая строка — в Google", async () => {
    const { prefersApple } = await import("@/app/api/certificates/wallet/route");
    for (const ua of [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "",
    ]) {
      expect(prefersApple(ua)).toBe(false);
    }
  });
});
