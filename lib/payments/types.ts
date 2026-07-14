/** Общий интерфейс платёжных провайдеров (PRD §2): Kaspi Pay и Freedom Pay за ним. */

export type PaymentProviderId = "kaspi" | "freedom" | "forte" | "mock";

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
