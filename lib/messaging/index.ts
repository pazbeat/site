import "server-only";
import { ChatAppProvider } from "./chatapp";
import { MockMessagingProvider } from "./mock";
import type { MessagingProvider } from "./types";

export type { MessagingProvider, MessengerFile } from "./types";

let provider: MessagingProvider | null = null;

/**
 * Активный мессенджер-провайдер. Мок — если WHATSAPP_MOCK=1 или ChatApp не
 * сконфигурирован (нет секретов). Так dev/e2e не шлют реальные сообщения.
 */
export function getMessenger(): MessagingProvider {
  if (!provider) {
    const chatapp = new ChatAppProvider();
    provider =
      process.env.WHATSAPP_MOCK === "1" || !chatapp.isConfigured()
        ? new MockMessagingProvider()
        : chatapp;
  }
  return provider;
}
