import type { Metadata } from "next";
import { routing, type Locale } from "@/i18n/routing";

export const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * canonical + hreflang для публичной страницы: Google/Yandex видят все три
 * языковые версии и не считают их дублями. `path` — без локали ("/programs").
 */
export function localeAlternates(
  locale: Locale,
  path: string,
): NonNullable<Metadata["alternates"]> {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`]),
  );
  return {
    canonical: `${SITE_URL}/${locale}${path}`,
    languages: { ...languages, "x-default": `${SITE_URL}/ru${path}` },
  };
}
