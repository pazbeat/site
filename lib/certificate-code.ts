import { createHash, randomBytes } from "node:crypto";

/**
 * Номер сертификата.
 *
 * Основной формат — салонный: префикс филиала плюс счётчик, `WM0001`. Ровно
 * так нумерует действующий сайт, и именно этот номер уходит в Altegio, в
 * письмо, в PDF и на страницу проверки — один номер везде, чтобы кассир
 * искал в CRM то же, что покупатель видит на сертификате.
 *
 * Формат `IMB-XXXX-XXXX` (криптослучайный, 40 бит энтропии) остаётся для
 * сертификатов, выпущенных раньше, и как запасной путь, если у салона почему-
 * то нет префикса. Разбор ввода понимает оба.
 *
 * В БД лежит SHA-256 хэш, поиск идёт по нему. Для салонного номера это уже не
 * секрет — он последователен и его можно подобрать. Поэтому страница проверки
 * ограничена по частоте (5 запросов в минуту на адрес), отдаёт только статус,
 * остаток и срок, а выдача кода на странице успеха авторизуется отдельным
 * токеном заказа, а не самим номером.
 */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const CODE_REGEX = /^IMB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/** Салонный номер: две буквы префикса и счётчик (WM0001). */
export const SALON_CODE_REGEX = /^[A-Z]{2}\d{3,6}$/;

/** Номер сертификата по префиксу салона и счётчику: WM + 0001. */
export function formatSalonCode(prefix: string, counter: number): string {
  return `${prefix}${String(counter).padStart(4, "0")}`;
}

export function isSalonCode(value: string): boolean {
  return SALON_CODE_REGEX.test(value);
}

export function generateCertificateCode(): string {
  // 256 % 32 === 0, поэтому byte % 32 не даёт modulo bias
  const bytes = randomBytes(8);
  let body = "";
  for (const byte of bytes) {
    body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return `IMB-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Приводит пользовательский ввод к каноническому виду IMB-XXXX-XXXX.
 * Ввод, не похожий на код (лишняя длина, чужой префикс), возвращается
 * как есть, чтобы isValidCodeFormat его отклонил.
 */
export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  // Салонный номер: пробелы и дефисы убраны, больше приводить нечего
  if (SALON_CODE_REGEX.test(raw)) return raw;
  const body = raw.startsWith("IMB") ? raw.slice(3) : raw;
  if (body.length !== 8) {
    return input.toUpperCase().trim();
  }
  return `IMB-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function isValidCodeFormat(input: string): boolean {
  const normalized = normalizeCode(input);
  return SALON_CODE_REGEX.test(normalized) || CODE_REGEX.test(normalized);
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

/**
 * Код для показа в админке. Салонный номер не прячем: он и так напечатан на
 * сертификате и записан в CRM, а администратору по нему искать. Случайный код
 * — секрет, от него видны только последние два символа.
 */
export function maskCode(code: string): string {
  const normalized = normalizeCode(code);
  if (SALON_CODE_REGEX.test(normalized)) return normalized;
  return `IMB-••••-••${normalized.slice(-2)}`;
}
