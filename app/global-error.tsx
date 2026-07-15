"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/** Фатальная ошибка рендера (упал layout) — репорт в Sentry + запасной экран. */
export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8fc",
          color: "#2b1236",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ marginBottom: 8 }}>Что-то пошло не так</h1>
          <p style={{ marginBottom: 20, opacity: 0.7 }}>
            Мы уже знаем об ошибке. Попробуйте обновить страницу.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: 999,
              border: "none",
              background: "#4d295d",
              color: "#fff",
              padding: "10px 24px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
