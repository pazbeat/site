/**
 * Content-Security-Policy с per-request nonce (PRD §9.2): без unsafe-inline
 * для скриптов. В dev Turbopack HMR требует 'unsafe-eval' и inline —
 * послабления только для разработки, в production строгая политика.
 */
/** Ingest-домен Sentry для connect-src (клиентские репорты ошибок). */
function sentryConnectSrc(): string {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return "";
  try {
    return ` ${new URL(dsn).origin}`;
  } catch {
    return "";
  }
}

export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `'self' 'unsafe-eval' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Стили: unsafe-inline допустим (PRD запрещает inline только для скриптов);
    // Tailwind/Next инжектят inline-стили
    `style-src 'self' 'unsafe-inline'`,
    // Фото программ (imbir.kz), data:-URI (QR-превью), blob: (предпросмотр
    // загружаемой открытки в админке)
    `img-src 'self' data: blob: https://www.imbir.kz`,
    `font-src 'self'`,
    `connect-src 'self'` + (isDev ? " ws:" : "") + sentryConnectSrc(),
    // 'self' — PDF-вьюер Chrome в iframe работает как plugin-document и
    // подпадает под object-src; 'none' блокировал просмотр прайса на /prices
    `object-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // 'self' — встроенный просмотр собственного PDF-прайса на /prices
    `frame-src 'self'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ];
  return directives.join("; ");
}
