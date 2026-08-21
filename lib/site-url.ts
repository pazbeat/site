import "server-only";

/**
 * Публичный адрес сайта. Берём из SITE_URL, а НЕ из адреса входящего
 * запроса: приложение работает в контейнере за обратным прокси, и
 * `new URL(request.url).origin` внутри контейнера даёт localhost:3000 —
 * с таким адресом ссылка на оплату и на страницу успеха уводила
 * покупателя в никуда (поймано на боевом сервере).
 *
 * Запасной вариант — origin запроса, чтобы локальная разработка работала
 * без обязательного SITE_URL.
 */
export function publicOrigin(request?: Request): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      /* пустой адрес — падать нельзя, отдадим локальный */
    }
  }
  return "http://localhost:3000";
}
