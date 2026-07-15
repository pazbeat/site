import type { MetadataRoute } from "next";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

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
    sitemap: `${SITE}/sitemap.xml`,
  };
}
