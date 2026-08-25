import { beforeAll, describe, expect, it, afterEach } from "vitest";
import { buildKaspiPayLink } from "@/lib/payments/kaspi";
import { MockPayProvider, mockSignature } from "@/lib/payments/mock";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});


describe("MockPayProvider.verifyWebhook", () => {
  const provider = new MockPayProvider();

  it("принимает корректно подписанный вебхук", async () => {
    const body = JSON.stringify({
      orderId: "o1",
      amountKzt: 65000,
      sig: mockSignature("o1", 65000),
    });
    const result = await provider.verifyWebhook(body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.orderId).toBe("o1");
      expect(result.amountKzt).toBe(65000);
    }
  });

  it("отклоняет подмену суммы и битую подпись", async () => {
    const forged = JSON.stringify({
      orderId: "o1",
      amountKzt: 1,
      sig: mockSignature("o1", 65000),
    });
    expect((await provider.verifyWebhook(forged)).ok).toBe(false);
    expect((await provider.verifyWebhook("не json")).ok).toBe(false);
    expect(
      (
        await provider.verifyWebhook(
          JSON.stringify({ orderId: "o1", amountKzt: 65000, sig: "ff" }),
        )
      ).ok,
    ).toBe(false);
  });
});

describe("buildKaspiPayLink", () => {
  // Форма сервиса Kaspi: id сервиса и id поля «номер заказа» — как на
  // боевом сайте заказчика (service_id=11079, поле 15991).
  const cfg = {
    slug: "PodarochniisertifikatImbir",
    serviceId: "11079",
    orderFieldId: "15991",
  };

  it("собирает ссылку на форму сервиса с номером заказа", () => {
    expect(buildKaspiPayLink(cfg, "abc123")).toBe(
      "https://kaspi.kz/pay/PodarochniisertifikatImbir?service_id=11079&15991=abc123",
    );
  });

  it("экранирует номер заказа, а не подставляет его в URL как есть", () => {
    const link = buildKaspiPayLink(cfg, "a b&service_id=1");
    expect(link).toContain("15991=a+b%26service_id%3D1");
    // подменить сервис через номер заказа не выходит
    expect(link.match(/service_id=/g)).toHaveLength(1);
  });
});

describe("мост Kaspi: проверка секрета", () => {
  const req = (token?: string) =>
    new Request("https://x/", {
      // В заголовки HTTP помещается только ASCII — отсюда латиница
      headers: token ? { "x-bridge-token": token } : {},
    });

  it("выключен, пока секрет не задан в окружении", async () => {
    delete process.env.KASPI_BRIDGE_TOKEN;
    const { bridgeAuthorized, bridgeToken } = await import("@/lib/kaspi-bridge");
    expect(bridgeToken()).toBeNull();
    expect(bridgeAuthorized(req("anything"))).toBe(false);
  });

  it("пускает только с точным секретом", async () => {
    process.env.KASPI_BRIDGE_TOKEN = "s3cret-token-value";
    const { bridgeAuthorized } = await import("@/lib/kaspi-bridge");
    expect(bridgeAuthorized(req("s3cret-token-value"))).toBe(true);
    expect(bridgeAuthorized(req("s3cret-token-valuX"))).toBe(false);
    expect(bridgeAuthorized(req("s3cret"))).toBe(false);
    expect(bridgeAuthorized(req())).toBe(false);
    delete process.env.KASPI_BRIDGE_TOKEN;
  });

  it("принимает секрет и в виде Bearer", async () => {
    process.env.KASPI_BRIDGE_TOKEN = "s3cret-token-value";
    const { bridgeAuthorized } = await import("@/lib/kaspi-bridge");
    const r = new Request("https://x/", {
      headers: { authorization: "Bearer s3cret-token-value" },
    });
    expect(bridgeAuthorized(r)).toBe(true);
    delete process.env.KASPI_BRIDGE_TOKEN;
  });
});

describe("оповещение о сбоях", () => {
  // Таймаут поднят не ради логики — она мгновенная. Модуль тянет за собой
  // @sentry/nextjs, и на холодном прогоне один только импорт занимает больше
  // стандартных пяти секунд: тест падал через раз на чистой установке.
  it("не шлёт письмо повторно, пока не остынет", { timeout: 30_000 }, async () => {
    const { shouldEmail } = await import("@/lib/alerts");
    const t0 = 1_000_000;
    expect(shouldEmail("сбой-А", t0)).toBe(true);
    // тот же сбой минутой позже — письма быть не должно
    expect(shouldEmail("сбой-А", t0 + 60_000)).toBe(false);
    // другой сбой пишем сразу
    expect(shouldEmail("сбой-Б", t0 + 60_000)).toBe(true);
    // после остывания снова пишем
    expect(shouldEmail("сбой-А", t0 + 16 * 60_000)).toBe(true);
  });
});

describe("выбор платёжного провайдера", () => {
  const saved = process.env.PAYMENT_MOCK;
  afterEach(() => {
    if (saved === undefined) delete process.env.PAYMENT_MOCK;
    else process.env.PAYMENT_MOCK = saved;
  });

  // Раньше флаг подменял ЛЮБОЙ выбор покупателя на демо-оплату. Удобно в
  // разработке, но на доступном извне стенде это означало бы бесплатные
  // сертификаты каждому, кто нашёл адрес.
  it("демо-режим не подменяет собой обычный выбор", async () => {
    process.env.PAYMENT_MOCK = "1";
    const { getProvider } = await import("@/lib/payments");
    expect(getProvider("kaspi")?.id).toBe("kaspi");
    expect(getProvider("forte")?.id).toBe("forte");
  });

  it("демо-оплата доступна только по явному выбору и только при флаге", async () => {
    const { getProvider } = await import("@/lib/payments");
    process.env.PAYMENT_MOCK = "1";
    expect(getProvider("mock")?.id).toBe("mock");
    process.env.PAYMENT_MOCK = "0";
    expect(getProvider("mock")).toBeNull();
  });

  it("выдуманный способ не проходит", async () => {
    const { getProvider } = await import("@/lib/payments");
    expect(getProvider("halyk")).toBeNull();
  });
});
