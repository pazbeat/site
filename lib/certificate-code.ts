import { createHash, randomBytes } from "node:crypto";

/**
 * Код сертификата IMB-XXXX-XXXX (PRD §5.3, §9.6):
 * — криптослучайный (crypto.randomBytes);
 * — алфавит 32 символа без похожих O/0/I/1 → 8 × 5 бит = 40 бит энтропии;
 * — в БД хранится только SHA-256 хэш, поиск — по хэшу.
 */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const CODE_REGEX = /^IMB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

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
  const body = raw.startsWith("IMB") ? raw.slice(3) : raw;
  if (body.length !== 8) {
    return input.toUpperCase().trim();
  }
  return `IMB-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function isValidCodeFormat(input: string): boolean {
  return CODE_REGEX.test(normalizeCode(input));
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

/** Маскированный код для админки: видны только последние 2 символа. */
export function maskCode(code: string): string {
  const normalized = normalizeCode(code);
  return `IMB-••••-••${normalized.slice(-2)}`;
}
