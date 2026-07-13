import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// CSP с per-request nonce и security-заголовки навешиваются в proxy.ts
// (PRD §9.2) — там доступен nonce. Здесь только общие настройки.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
