import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { OCCASIONS } from "@/lib/occasions";

// Считаем адрес В МОМЕНТ ЗАПРОСА, а не при сборке образа: на этапе
// docker build переменной SITE_URL ещё нет, и в файл попадал
// запасной http://localhost:3000 — карта сайта уезжала в поисковики
// с нерабочими адресами.
export const dynamic = "force-dynamic";

function siteUrl(): string {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

/** Публичные страницы; /create и /check тоже индексируем — это входные точки. */
const PATHS = [
  "",
  "/programs",
  "/create",
  "/check",
  "/corporate",
  "/legal/offer",
  "/legal/privacy",
  "/legal/rules",
  // Сезонные лендинги — важны для SEO («подарок на 8 марта» и т.п.)
  ...OCCASIONS.map((o) => `/gift/${o.slug}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.flatMap((locale) =>
    PATHS.map((path) => ({
      url: `${siteUrl()}/${locale}${path}`,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.7,
    })),
  );
}
