/**
 * Версия развёрнутой сборки — чтобы по сайту было видно, свежий он или нет.
 *
 * Коммит и время сборки приходят аргументами Docker (`BUILD_SHA`,
 * `BUILD_TIME`): каталог `.git` в образ не попадает, спросить гит изнутри
 * нельзя. Не заданы — значит собирали вручную, так и пишем.
 *
 * Приложение одно: фронт и бэк деплоятся вместе, поэтому версия общая.
 */
export type BuildInfo = {
  /** Короткий хэш коммита или null, если сборка без него. */
  sha: string | null;
  /** ISO-время сборки или null. */
  builtAt: string | null;
  /** Готовая строка для подвала. */
  label: string;
};

/** Время сборки человеку: по Алматы, как и всё остальное на сайте. */
function formatBuiltAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function buildInfo(): BuildInfo {
  const sha = process.env.BUILD_SHA?.trim() || null;
  const builtAtRaw = process.env.BUILD_TIME?.trim() || null;
  const builtAt = builtAtRaw && formatBuiltAt(builtAtRaw) ? builtAtRaw : null;

  if (!sha && !builtAt) return { sha: null, builtAt: null, label: "dev" };
  const parts = [sha, builtAt ? formatBuiltAt(builtAt) : null].filter(Boolean);
  return { sha, builtAt, label: parts.join(" · ") };
}
