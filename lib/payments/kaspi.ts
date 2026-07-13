import { hmacVerify } from "../crypto";
import type {
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from "./types";

/**
 * Kaspi Pay. Точный протокол зависит от типа договора (Kaspi Pay online / QR)
 * — открытый вопрос №6 PRD §12: нет доступа к тестовой среде и спецификации.
 * Каркас: HMAC-SHA256 подпись вебхука; createPayment вернёт ошибку до
 * получения реквизитов — заказ при этом создаётся, оплата недоступна.
 */
export class KaspiPayProvider implements PaymentProvider {
  readonly id = "kaspi" as const;

  isConfigured(): boolean {
    return Boolean(
      process.env.KASPI_PAY_MERCHANT_ID && process.env.KASPI_PAY_SECRET,
    );
  }

  async createPayment(): Promise<CreatePaymentResult> {
    // TODO(kaspi): реализовать по спецификации после подписания договора
    throw new Error("kaspi_not_configured");
  }

  async verifyWebhook(
    rawBody: string,
    request: Request,
  ): Promise<WebhookVerification> {
    const secret = process.env.KASPI_PAY_SECRET;
    if (!secret) return { ok: false, reason: "not_configured" };
    const signature = request.headers.get("x-signature") ?? "";
    if (!hmacVerify(rawBody, signature, secret)) {
      return { ok: false, reason: "bad_signature" };
    }
    let payload: { orderId?: string; amount?: number; paymentId?: string };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
    if (!payload.orderId || typeof payload.amount !== "number") {
      return { ok: false, reason: "invalid_payload" };
    }
    return {
      ok: true,
      orderId: payload.orderId,
      amountKzt: Math.round(payload.amount),
      externalId: payload.paymentId ?? "",
    };
  }

  webhookResponse(): { body: string; contentType: string } {
    return { body: JSON.stringify({ status: "ok" }), contentType: "application/json" };
  }
}
