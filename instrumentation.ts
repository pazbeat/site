/** Запуск фоновых очередей вместе с сервером Next (nodejs runtime). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startQueue } = await import("./lib/queue");
    await startQueue().catch((error) =>
      console.error("queue start failed", error),
    );
  }
}
