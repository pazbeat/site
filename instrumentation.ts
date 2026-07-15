import * as Sentry from "@sentry/nextjs";

/**
 * Запуск фоновых очередей вместе с сервером Next (nodejs runtime) +
 * мониторинг ошибок Sentry (включается переменной SENTRY_DSN; без неё — no-op).
 */
export async function register() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      // ПД не отправляем: тела запросов и куки не прикладываются
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startQueue } = await import("./lib/queue");
    await startQueue().catch((error) =>
      console.error("queue start failed", error),
    );
  }
}

/** Серверные ошибки рендера/роутов → Sentry (no-op без DSN). */
export const onRequestError = Sentry.captureRequestError;
