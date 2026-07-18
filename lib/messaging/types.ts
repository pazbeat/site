/**
 * Абстракция мессенджер-провайдера (PRD §2, открытый вопрос №5 — выбран
 * ChatApp). Доставка сертификатов в WhatsApp за единым интерфейсом, чтобы
 * провайдера можно было заменить.
 */

export type MessengerFile = {
  filename: string;
  content: Buffer;
  mimeType?: string;
  /**
   * Публичный URL файла. ChatApp скачивает вложение по ссылке (бинарная
   * загрузка не поддерживается), поэтому для реальной доставки нужен URL,
   * доступный из интернета. На localhost недоступен → доставка файла
   * best-effort. Мок сохраняет `content`.
   */
  url?: string;
};

export interface MessagingProvider {
  readonly id: string;
  /** Готов ли слать реально (есть все секреты). Иначе — мок. */
  isConfigured(): boolean;
  sendText(toPhone: string, text: string): Promise<void>;
  sendFile(toPhone: string, file: MessengerFile, caption?: string): Promise<void>;
}

/**
 * Телефон → chatId WhatsApp (`{digits}@c.us`). Приводит казахстанские
 * номера к международному виду: ведущая 8 → 7. Оставляет только цифры.
 * Чистая функция — тестируется.
 */
export function normalizeWhatsAppChatId(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  // 8XXXXXXXXXX (KZ/RU внутренний формат) → 7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  }
  // 10 цифр — национальный номер без кода страны (напр. 7712448800):
  // добавляем код Казахстана «7» → 77712448800
  else if (digits.length === 10) {
    digits = `7${digits}`;
  }
  return `${digits}@c.us`;
}
