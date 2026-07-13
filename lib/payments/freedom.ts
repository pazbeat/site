import { createHash, randomBytes } from "node:crypto";
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from "./types";

/**
 * Freedom Pay (ex-Paybox): init_payment.php + result_url вебхук.
 * Подпись: md5("<script>;<значения параметров, отсортированных по ключу>;<secret>").
 * Документация: https://freedompay.kz/docs — параметры pg_*.
 */

export function payboxSignature(
  script: string,
  params: Record<string, string>,
  secret: string,
): string {
  const values = Object.keys(params)
    .filter((k) => k !== "pg_sig")
    .sort()
    .map((k) => params[k]);
  return createHash("md5")
    .update([script, ...values, secret].join(";"))
    .digest("hex");
}

function env(name: string): string {
  return process.env[name] ?? "";
}

export class FreedomPayProvider implements PaymentProvider {
  readonly id = "freedom" as const;

  isConfigured(): boolean {
    return Boolean(env("FREEDOM_PAY_MERCHANT_ID") && env("FREEDOM_PAY_SECRET"));
  }

  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    const apiUrl = env("FREEDOM_PAY_API_URL") || "https://api.freedompay.kz";
    const request: Record<string, string> = {
      pg_merchant_id: env("FREEDOM_PAY_MERCHANT_ID"),
      pg_order_id: params.orderId,
      pg_amount: String(params.amountKzt),
      pg_currency: "KZT",
      pg_description: params.description,
      pg_result_url: params.webhookUrl,
      pg_success_url: params.successUrl,
      pg_request_method: "POST",
      pg_salt: randomBytes(8).toString("hex"),
      pg_language: params.locale === "kk" ? "kz" : params.locale,
    };
    request.pg_sig = payboxSignature(
      "init_payment.php",
      request,
      env("FREEDOM_PAY_SECRET"),
    );

    const response = await fetch(`${apiUrl}/init_payment.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(request).toString(),
    });
    const xml = await response.text();
    const redirect = /<pg_redirect_url>([^<]+)<\/pg_redirect_url>/.exec(xml);
    if (!redirect) {
      throw new Error(`freedom_init_failed: ${xml.slice(0, 300)}`);
    }
    // XML-энтити в URL
    return { redirectUrl: redirect[1].replace(/&amp;/g, "&") };
  }

  async verifyWebhook(rawBody: string): Promise<WebhookVerification> {
    const params: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(rawBody)) {
      params[key] = value;
    }
    const given = params.pg_sig;
    if (!given) return { ok: false, reason: "missing_signature" };
    // script name = последний сегмент result_url: /api/payments/freedom/webhook
    const expected = payboxSignature(
      "webhook",
      params,
      env("FREEDOM_PAY_SECRET"),
    );
    if (expected !== given) return { ok: false, reason: "bad_signature" };
    if (params.pg_result !== "1") {
      return { ok: false, reason: `payment_failed:${params.pg_result}` };
    }
    return {
      ok: true,
      orderId: params.pg_order_id ?? "",
      amountKzt: Math.round(Number(params.pg_amount)),
      externalId: params.pg_payment_id ?? "",
    };
  }

  webhookResponse(): { body: string; contentType: string } {
    const salt = randomBytes(8).toString("hex");
    const params = { pg_status: "ok", pg_salt: salt };
    const sig = payboxSignature("webhook", params, env("FREEDOM_PAY_SECRET"));
    return {
      body: `<?xml version="1.0" encoding="utf-8"?><response><pg_status>ok</pg_status><pg_salt>${salt}</pg_salt><pg_sig>${sig}</pg_sig></response>`,
      contentType: "application/xml",
    };
  }
}
