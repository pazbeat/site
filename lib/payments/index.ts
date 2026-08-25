import { ForteBankProvider } from "./forte";
import { KaspiPayProvider } from "./kaspi";
import { MockPayProvider } from "./mock";
import type { PaymentProvider, PaymentProviderId } from "./types";

const providers: Record<PaymentProviderId, PaymentProvider> = {
  kaspi: new KaspiPayProvider(),
  forte: new ForteBankProvider(),
  mock: new MockPayProvider(),
};

/**
 * Возвращает провайдера по id.
 *
 * Демо-провайдер отдаётся только по явному выбору `mock` и только при
 * `PAYMENT_MOCK=1`. Раньше этот флаг подменял ЛЮБОЙ выбор покупателя на мок —
 * удобно в разработке, но на доступном извне стенде означало бы бесплатные
 * сертификаты для всех, кто нашёл адрес. Кто вправе выбрать `mock`, решает
 * вызывающая сторона: `app/api/orders/route.ts` пускает туда только
 * администратора.
 */
export function getProvider(id: string): PaymentProvider | null {
  if (id === "mock") {
    return process.env.PAYMENT_MOCK === "1" ? providers.mock : null;
  }
  if (id === "kaspi" || id === "forte") return providers[id];
  return null;
}

/** Для вебхуков mock доступен только при включённом PAYMENT_MOCK. */
export function getWebhookProvider(id: string): PaymentProvider | null {
  if (id === "mock") {
    return process.env.PAYMENT_MOCK === "1" ? providers.mock : null;
  }
  // У Kaspi (PayQR) и Forte вебхуков нет — оплата подтверждается опросом.
  if (id === "kaspi") return providers[id];
  return null;
}
