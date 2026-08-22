import type { PassFields } from "./pass";

/**
 * Провайдер пропусков — тем же манером, что PaymentProvider и Mailer:
 * настоящий работает при наличии ключей, иначе автоматически встаёт мок,
 * и разработка не требует ни сертификата Apple, ни доступа к Google.
 */

export type IssueContext = {
  /** Серийник карты; НЕ код сертификата (см. модель WalletPass) */
  serialNumber: string;
  /**
   * Токен веб-сервиса обновлений. Задан — карта будет обновляться, нет —
   * останется статичной. Это отдельный случайный секрет, а не код
   * сертификата: он уезжает на устройство и ходит в каждом запросе.
   */
  authToken?: string;
};

export type IssuedPass = {
  filename: string;
  contentType: string;
  body: Buffer;
  /** Неподписанный архив структурно верен, но телефон его не установит */
  signed: boolean;
};

export interface WalletPassProvider {
  readonly id: string;
  /** Есть ли ключи. Нет — значит в дело идёт мок */
  isConfigured(): boolean;
  issue(fields: PassFields, ctx: IssueContext): Promise<IssuedPass>;
}
