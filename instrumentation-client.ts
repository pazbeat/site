import * as Sentry from "@sentry/nextjs";

/**
 * Sentry в браузере — ошибки у реальных посетителей (включается
 * NEXT_PUBLIC_SENTRY_DSN; без неё — no-op). ПД не собираем: только стеки.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
