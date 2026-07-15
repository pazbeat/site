import type { Locale } from "@/i18n/routing";

/** Официальный PDF-прайс сети на языке страницы (public/price/…). */
export function priceHref(locale: Locale): string {
  return `/price/imbir-price-${locale}.pdf`;
}
