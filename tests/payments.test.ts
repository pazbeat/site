import { beforeAll, describe, expect, it } from "vitest";
import { payboxSignature } from "@/lib/payments/freedom";
import { MockPayProvider, mockSignature } from "@/lib/payments/mock";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

describe("payboxSignature (Freedom Pay)", () => {
  it("сортирует параметры по ключу и не включает pg_sig", () => {
    const params = {
      pg_order_id: "42",
      pg_amount: "1000",
      pg_merchant_id: "m1",
      pg_sig: "должен-игнорироваться",
    };
    const sig = payboxSignature("init_payment.php", params, "secret");
    // md5("init_payment.php;1000;m1;42;secret") — значения в порядке ключей
    expect(sig).toMatch(/^[a-f0-9]{32}$/);
    const sigWithoutSigField = payboxSignature(
      "init_payment.php",
      { pg_order_id: "42", pg_amount: "1000", pg_merchant_id: "m1" },
      "secret",
    );
    expect(sig).toBe(sigWithoutSigField);
  });

  it("подпись меняется от суммы, скрипта и секрета", () => {
    const base = { pg_order_id: "42", pg_amount: "1000" };
    const sig = payboxSignature("webhook", base, "secret");
    expect(payboxSignature("webhook", { ...base, pg_amount: "2000" }, "secret")).not.toBe(sig);
    expect(payboxSignature("other.php", base, "secret")).not.toBe(sig);
    expect(payboxSignature("webhook", base, "other")).not.toBe(sig);
  });
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
