import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from "./types";

/**
 * Kaspi Pay через шлюз PayQR (payqr.kz). Модель без вебхуков:
 *  1) createInvoice → POST /v1/le/qr_invoice → ссылка Kaspi (twocode);
 *  2) страница показывает QR (десктоп) / кнопку (мобайл);
 *  3) checkStatus → POST /v1/le/pay_status, опрашивается до code=1 (оплачено).
 * Подписи/секрета нет — только machid+terNumber терминала (PRD §12 №6).
 */

const BASE_URL = process.env.KASPI_PAYQR_BASE_URL ?? "https://payqr.kz";

type Config = { machid: string; terNumber: string };

function readConfig(): Config | null {
  const machid = process.env.KASPI_PAY_MERCHANT_ID;
  const terNumber = process.env.KASPI_PAY_TERMINAL;
  if (!machid || !terNumber) return null;
  return { machid, terNumber };
}

export type KaspiInvoice = { twocode: string; payqrOrderId: string };
export type KaspiStatus = "paid" | "pending";

export class KaspiPayProvider implements PaymentProvider {
  readonly id = "kaspi" as const;

  isConfigured(): boolean {
    return readConfig() !== null;
  }

  /**
   * Оплата Kaspi идёт не редиректом на внешний сайт, а на нашу страницу
   * с QR/кнопкой. Сам инвойс создаётся уже на этой странице (invoice API).
   */
  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    const origin = new URL(params.successUrl).origin;
    return {
      redirectUrl: `${origin}/${params.locale}/pay/kaspi?order=${params.orderId}`,
    };
  }

  /** Создаёт Kaspi QR-инвойс. price — в тиынах строкой (₸×100). */
  async createInvoice(input: {
    payqrOrderId: string;
    amountKzt: number;
    name: string;
  }): Promise<KaspiInvoice> {
    const cfg = readConfig();
    if (!cfg) throw new Error("kaspi_not_configured");

    const response = await fetch(`${BASE_URL}/v1/le/qr_invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machid: cfg.machid,
        terNumber: cfg.terNumber,
        orderid: input.payqrOrderId,
        name: input.name,
        // строго в тиынах: к сумме приписываем '00'
        price: `${input.amountKzt}00`,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      code?: string;
      twocode?: string;
      msg?: string;
    };
    if (!response.ok || data.code !== "1" || !data.twocode) {
      throw new Error(
        `kaspi_invoice_failed: ${response.status} ${data.msg ?? ""} code=${data.code ?? "?"}`,
      );
    }
    return { twocode: data.twocode, payqrOrderId: input.payqrOrderId };
  }

  /** Опрос статуса оплаты. code/status.code === "1" — оплачено; "2" — ждём. */
  async checkStatus(payqrOrderId: string): Promise<KaspiStatus> {
    const cfg = readConfig();
    if (!cfg) throw new Error("kaspi_not_configured");

    const response = await fetch(`${BASE_URL}/v1/le/pay_status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderid: payqrOrderId, machid: cfg.machid }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      code?: string;
      status?: { code?: string };
    };
    const paid = data.code === "1" || data.status?.code === "1";
    if (paid) {
      // На первой боевой оплате поможет свериться с реальным форматом ответа
      console.log("kaspi pay_status PAID:", JSON.stringify(data).slice(0, 200));
      return "paid";
    }
    return "pending";
  }

  // Вебхуков у PayQR нет — методы интерфейса не используются.
  async verifyWebhook(): Promise<WebhookVerification> {
    return { ok: false, reason: "kaspi_no_webhook" };
  }

  webhookResponse(): { body: string; contentType: string } {
    return {
      body: JSON.stringify({ status: "ok" }),
      contentType: "application/json",
    };
  }
}
