import { FreedomPayProvider } from "./freedom";
import { KaspiPayProvider } from "./kaspi";
import { MockPayProvider } from "./mock";
import type { PaymentProvider, PaymentProviderId } from "./types";

const providers: Record<PaymentProviderId, PaymentProvider> = {
  kaspi: new KaspiPayProvider(),
  freedom: new FreedomPayProvider(),
  mock: new MockPayProvider(),
};

/**
 * Возвращает провайдера по id. При PAYMENT_MOCK=1 (dev/тесты) любой выбор
 * покупателя обслуживает мок — реальные ключи не нужны.
 */
export function getProvider(id: string): PaymentProvider | null {
  if (process.env.PAYMENT_MOCK === "1") return providers.mock;
  if (id === "kaspi" || id === "freedom") return providers[id];
  return null;
}

/** Для вебхуков mock доступен только при включённом PAYMENT_MOCK. */
export function getWebhookProvider(id: string): PaymentProvider | null {
  if (id === "mock") {
    return process.env.PAYMENT_MOCK === "1" ? providers.mock : null;
  }
  if (id === "kaspi" || id === "freedom") return providers[id];
  return null;
}
