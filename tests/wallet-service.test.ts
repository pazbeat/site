import { describe, expect, it } from "vitest";

// Ключ шифрования нужен уже на сборе тестов: шифртекст готовится в describe,
// а beforeAll к тому моменту ещё не отработал.
process.env.AUTH_SECRET = "test-secret";

const { encryptSecret } = await import("@/lib/crypto");
const { passAuthorized, toPassSource } = await import("@/lib/wallet/service");

type Certificate = Parameters<typeof toPassSource>[0];

// Полный объект Prisma в фикстуре — десятки полей, которые к карте отношения
// не имеют. Собираем только нужное и приводим на выходе.
function certificate(over: Record<string, unknown> = {}): Certificate {
  return {
    codeEncrypted: encryptSecret("WM0042"),
    toName: "Айгерим",
    type: "nominal",
    amountKzt: 20000,
    balanceKzt: 20000,
    status: "active",
    validUntil: new Date("2026-11-18T00:00:00Z"),
    salon: { name: "Имбирь на Мәңгілік Ел" },
    programOption: null,
    ...over,
  } as unknown as Certificate;
}

function request(header?: string): Request {
  return new Request("https://new.imbir.kz/api/wallet/apple/v1/passes/x/y", {
    headers: header ? { authorization: header } : {},
  });
}

describe("passAuthorized", () => {
  // Токен именно такой формы, как его выдаёт generatePassAuthToken: заголовки
  // HTTP держат только Latin-1, кириллица в них не пролезает в принципе.
  const TOKEN = "9OuNn6q0LxpVUJRxG7bWc2dQ8sYfKmTz";
  const enc = encryptSecret(TOKEN);

  it("пропускает правильный токен", () => {
    expect(passAuthorized(enc, request(`ApplePass ${TOKEN}`))).toBe(true);
  });

  it("регистр схемы значения не имеет — Apple пишет по-разному", () => {
    expect(passAuthorized(enc, request(`applepass ${TOKEN}`))).toBe(true);
  });

  it("отвергает чужой токен той же длины", () => {
    expect(passAuthorized(enc, request("ApplePass 9OuNn6q0LxpVUJRxG7bWc2dQ8sYfKmTx"))).toBe(false);
  });

  it("отвергает токен другой длины", () => {
    expect(passAuthorized(enc, request("ApplePass 9OuNn6q0"))).toBe(false);
  });

  it("без заголовка — отказ", () => {
    expect(passAuthorized(enc, request())).toBe(false);
  });

  it("голый токен без схемы ApplePass не годится", () => {
    expect(passAuthorized(enc, request(TOKEN))).toBe(false);
  });

  it("Bearer вместо ApplePass не годится", () => {
    expect(passAuthorized(enc, request(`Bearer ${TOKEN}`))).toBe(false);
  });

  it("испорченный шифртекст — отказ, а не падение", () => {
    expect(passAuthorized("не-шифртекст", request("ApplePass anything"))).toBe(false);
  });
});

describe("toPassSource", () => {
  it("расшифровывает номер сертификата", () => {
    expect(toPassSource(certificate())?.code).toBe("WM0042");
  });

  it("номинальный сертификат несёт номинал", () => {
    const source = toPassSource(certificate());
    expect(source?.amountKzt).toBe(20000);
    expect(source?.programName).toBeNull();
  });

  it("сертификат на программу: номинала нет, есть название", () => {
    const source = toPassSource(
      certificate({
        type: "program",
        amountKzt: 35000,
        programOption: { program: { names: { ru: "Энергия Сиама" } } },
      }),
    );
    // Номинал у программного сертификата не показываем — на карте название
    expect(source?.amountKzt).toBeNull();
    expect(source?.programName).toBe("Энергия Сиама");
  });

  it("без шифртекста номера карту не собрать", () => {
    expect(toPassSource(certificate({ codeEncrypted: null }))).toBeNull();
  });

  it("нерасшифровываемый номер — тоже null, а не мусор на карте", () => {
    expect(toPassSource(certificate({ codeEncrypted: "битые-данные" }))).toBeNull();
  });
});
