import { beforeAll, describe, expect, it } from "vitest";
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
