import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { OCCASIONS } from "@/lib/occasions";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

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
      url: `${SITE}/${locale}${path}`,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.7,
    })),
  );
}
