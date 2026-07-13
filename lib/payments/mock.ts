import { hmacSign, hmacVerify } from "../crypto";
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from "./types";

/**
 * Демо-провайдер для разработки и e2e-тестов (PAYMENT_MOCK=1):
 * редирект на локальную страницу /pay/mock, которая шлёт подписанный вебхук.
 * В production не включать.
 */

function mockSecret(): string {
  return process.env.AUTH_SECRET ?? "imbir-dev-mock-secret";
}

export function mockSignature(orderId: string, amountKzt: number): string {
  return hmacSign(`${orderId}:${amountKzt}`, mockSecret());
}

export class MockPayProvider implements PaymentProvider {
  readonly id = "mock" as const;

  isConfigured(): boolean {
    return process.env.PAYMENT_MOCK === "1";
  }

  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    return {
      redirectUrl: `/${params.locale}/pay/mock?order=${encodeURIComponent(params.orderId)}`,
    };
  }

  async verifyWebhook(rawBody: string): Promise<WebhookVerification> {
    let payload: { orderId?: string; amountKzt?: number; sig?: string };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
    const { orderId, amountKzt, sig } = payload;
    if (!orderId || typeof amountKzt !== "number" || !sig) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (!hmacVerify(`${orderId}:${amountKzt}`, sig, mockSecret())) {
      return { ok: false, reason: "bad_signature" };
    }
    return { ok: true, orderId, amountKzt, externalId: `mock-${orderId}` };
  }

  webhookResponse(): { body: string; contentType: string } {
    return { body: JSON.stringify({ status: "ok" }), contentType: "application/json" };
  }
}
