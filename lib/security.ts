/**
 * Content-Security-Policy с per-request nonce (PRD §9.2): без unsafe-inline
 * для скриптов. В dev Turbopack HMR требует 'unsafe-eval' и inline —
 * послабления только для разработки, в production строгая политика.
 */
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
    // Фото программ (imbir.kz) и data:-URI (QR-превью в конструкторе)
    `img-src 'self' data: https://www.imbir.kz`,
    `font-src 'self'`,
    `connect-src 'self'` + (isDev ? " ws:" : ""),
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ];
  return directives.join("; ");
}
