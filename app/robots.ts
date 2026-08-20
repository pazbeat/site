import type { MetadataRoute } from "next";

// Считаем адрес В МОМЕНТ ЗАПРОСА, а не при сборке образа: на этапе
// docker build переменной SITE_URL ещё нет, и в файл попадал
// запасной http://localhost:3000 — карта сайта уезжала в поисковики
// с нерабочими адресами.
export const dynamic = "force-dynamic";

function siteUrl(): string {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Служебные и одноразовые страницы не индексируем
        disallow: ["/admin", "/api", "/ru/success", "/kk/success", "/en/success", "/ru/pay", "/kk/pay", "/en/pay"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
