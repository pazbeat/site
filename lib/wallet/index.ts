import "server-only";
import { ApplePassProvider } from "./apple";
import { MockPassProvider } from "./mock";
import type { WalletPassProvider } from "./types";

export type { IssueContext, IssuedPass, WalletPassProvider } from "./types";
export { buildPassFields, generatePassAuthToken, generatePassSerial, passVoidReason, shouldPushUpdate } from "./pass";
export type { PassFields, PassSource, ShownState } from "./pass";

let provider: WalletPassProvider | null = null;

/**
 * Настоящий провайдер, если есть ключи подписи; иначе мок в `.wallet-outbox`.
 * Ровно как выбирается почтовый транспорт по наличию RESEND_API_KEY.
 */
export function getWalletProvider(): WalletPassProvider {
  if (!provider) {
    const apple = new ApplePassProvider();
    provider = apple.isConfigured() ? apple : new MockPassProvider();
  }
  return provider;
}

/**
 * Готовы ли мы отдавать пропуски наружу. Неподписанный пропуск телефон всё
 * равно отвергнет, поэтому лучше честный отказ, чем битый файл: по нему
 * хотя бы видно, что дело в отсутствующем сертификате Apple.
 */
export function isWalletConfigured(): boolean {
  return getWalletProvider().id === "apple";
}
