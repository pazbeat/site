/** Достаёт локализованную строку из jsonb-поля вида {ru, kk, en}. */
export function pickL10n(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const candidate = rec[locale] ?? rec.ru;
    if (typeof candidate === "string") return candidate;
  }
  return "";
}
