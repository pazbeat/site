import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// CSP с per-request nonce и security-заголовки навешиваются в proxy.ts
// (PRD §9.2) — там доступен nonce. Здесь только общие настройки.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Картинки контента: имена меняются вместе с файлом (загрузки — UUID,
        // дизайны/фото программ — новые файлы), можно кэшировать надолго
        source: "/:prefix(designs|programs|uploads)/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, immutable" },
        ],
      },
      {
        // PDF-прайс обновляется ПОД ТЕМ ЖЕ именем — кэш короткий
        source: "/price/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
