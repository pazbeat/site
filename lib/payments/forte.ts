import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from "./types";

/**
 * ForteBank (эквайринг на hosted-странице). Модель без вебхуков — как на
 * рабочем сайте заказчика (Node-RED api.js `byCard` + flows):
 *  1) createOrder → POST /order (Basic auth) → {id, hppUrl, password};
 *  2) редирект покупателя на `${hppUrl}?password=…&id=…` (страница Forte);
 *  3) Forte возвращает на hppRedirectUrl → опрос checkStatus (GET /order/{id})
 *     до статуса «оплачено».
 *
 * createPayment уводит на нашу страницу `/{locale}/pay/forte?order=…`, которая
 * создаёт заказ Forte и редиректит на hpp; после возврата опрашивает статус.
 * Креды — Basic auth из env (FORTE_USERNAME/FORTE_PASSWORD).
 */

const BASE_URL = process.env.FORTE_API_URL ?? "https://api.fortebank.com";

type Config = { username: string; password: string };

function readConfig(): Config | null {
  const username = process.env.FORTE_USERNAME;
  const password = process.env.FORTE_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

function authHeader(cfg: Config): string {
  const raw = `${cfg.username}:${cfg.password}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

// Статусы Forte, означающие успешную оплату / окончательный отказ.
const PAID_STATUSES = new Set([
  "completed",
  "charged",
  "approved",
  "paid",
  "success",
  "successful",
]);
const FAILED_STATUSES = new Set([
  "declined",
  "failed",
  "cancelled",
  "canceled",
  "rejected",
  "error",
  "expired",
]);

export type ForteOrder = { redirectUrl: string; forteOrderId: string };
export type ForteStatus = "paid" | "pending" | "failed";

export class ForteBankProvider implements PaymentProvider {
  readonly id = "forte" as const;

  isConfigured(): boolean {
    return readConfig() !== null;
  }

  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    const origin = new URL(params.successUrl).origin;
    return {
      redirectUrl: `${origin}/${params.locale}/pay/forte?order=${params.orderId}`,
    };
  }

  /** Создаёт заказ Forte и возвращает hosted-URL для редиректа покупателя. */
  async createOrder(input: {
    amountKzt: number;
    description: string;
    returnUrl: string;
  }): Promise<ForteOrder> {
    const cfg = readConfig();
    if (!cfg) throw new Error("forte_not_configured");

    const response = await fetch(`${BASE_URL}/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(cfg),
      },
      body: JSON.stringify({
        language: "ru",
        currency: "KZT",
        hppRedirectUrl: input.returnUrl,
        description: input.description,
        amount: input.amountKzt.toFixed(2),
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      order?: { id?: string | number; hppUrl?: string; password?: string };
    } | null;
    const order = data?.order;
    if (!response.ok || !order?.id || !order.hppUrl) {
      throw new Error(`forte_order_failed: ${response.status}`);
    }
    const id = String(order.id);
    const pw = encodeURIComponent(order.password ?? "");
    return {
      redirectUrl: `${order.hppUrl}?password=${pw}&id=${encodeURIComponent(id)}`,
      forteOrderId: id,
    };
  }

  /** Опрос статуса заказа Forte. */
  async checkStatus(forteOrderId: string): Promise<ForteStatus> {
    const cfg = readConfig();
    if (!cfg) throw new Error("forte_not_configured");

    const response = await fetch(
      `${BASE_URL}/order/${encodeURIComponent(forteOrderId)}`,
      { headers: { Authorization: authHeader(cfg) } },
    );
    const data = (await response.json().catch(() => null)) as {
      order?: { status?: string };
    } | null;
    const status = (data?.order?.status ?? "").toLowerCase();
    if (PAID_STATUSES.has(status)) {
      console.log("forte status PAID:", status);
      return "paid";
    }
    if (FAILED_STATUSES.has(status)) return "failed";
    return "pending";
  }

  // Вебхуков у Forte нет — методы интерфейса не используются.
  async verifyWebhook(): Promise<WebhookVerification> {
    return { ok: false, reason: "forte_no_webhook" };
  }

  webhookResponse(): { body: string; contentType: string } {
    return {
      body: JSON.stringify({ status: "ok" }),
      contentType: "application/json",
    };
  }
}
