/**
 * Общий интерфейс платёжных провайдеров: Kaspi QR и оплата картой.
 * Картой сейчас через ForteBank; когда выдадут доступы Halyk ePay,
 * он встанет сюда же новым провайдером, без правок вызывающего кода.
 */

export type PaymentProviderId = "kaspi" | "forte" | "mock";

export type CreatePaymentParams = {
  orderId: string;
  amountKzt: number;
  description: string;
  /** Куда провайдер вернёт покупателя после оплаты (страница успеха с токеном) */
  successUrl: string;
  /** Server-to-server подтверждение оплаты */
  webhookUrl: string;
  locale: string;
};

export type CreatePaymentResult = { redirectUrl: string };

export type WebhookVerification =
  | {
      ok: true;
      orderId: string;
      amountKzt: number;
      externalId: string;
    }
  | { ok: false; reason: string };

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Настроен ли провайдер (есть ли ключи в env) */
  isConfigured(): boolean;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  /**
   * Проверка вебхука: подпись обязательна (PRD §9.7).
   * rawBody — сырое тело запроса до парсинга.
   */
  verifyWebhook(rawBody: string, request: Request): Promise<WebhookVerification>;
  /** Тело ответа, которое провайдер ожидает на успешно принятый вебхук */
  webhookResponse(): { body: string; contentType: string };
}
