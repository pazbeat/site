/**
 * Версия развёрнутой сборки — чтобы по сайту было видно, свежий он или нет.
 *
 * Показываем НОМЕР и дату, а не хэш коммита: `601f96d` уникален, но по двум
 * таким не скажешь, какой новее, а вопрос ровно в этом. Номер — количество
 * коммитов в ветке (`git rev-list --count`): растёт всегда и только вперёд,
 * поэтому «версия 248» заведомо свежее «версии 247». Хэш остаётся во
 * всплывающей подсказке и в /api/version — он нужен разработчику, чтобы
 * найти точное состояние кода.
 *
 * Значения приходят аргументами Docker: каталог `.git` в образ не попадает,
 * спросить гит изнутри нельзя. Не заданы — значит собирали вручную, так и
 * пишем, вместо выдуманного номера.
 *
 * Приложение одно: фронт и бэк деплоятся вместе, поэтому версия общая.
 */
export type BuildInfo = {
  /** Номер сборки: количество коммитов. null — не передали. */
  number: string | null;
  /** Короткий хэш коммита или null. */
  sha: string | null;
  /** ISO-время сборки или null. */
  builtAt: string | null;
  /** Строка для подвала: «Версия 247 · 27.08.26 11:32». */
  label: string;
  /** Подсказка при наведении — с точным коммитом. */
  title: string;
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
  const number = process.env.BUILD_NUMBER?.trim() || null;
  const sha = process.env.BUILD_SHA?.trim() || null;
  const builtAtRaw = process.env.BUILD_TIME?.trim() || null;
  const builtAtLabel = builtAtRaw ? formatBuiltAt(builtAtRaw) : null;
  const builtAt = builtAtLabel ? builtAtRaw : null;

  const parts = [
    number ? `Версия ${number}` : null,
    builtAtLabel,
    // Хэша в видимой строке нет — он ничего не говорит; но если ни номера,
    // ни времени не передали, лучше показать хоть что-то настоящее.
    !number && !builtAtLabel ? sha : null,
  ].filter(Boolean);

  const label = parts.length > 0 ? parts.join(" · ") : "dev";
  const title = [
    number ? `Сборка ${number}` : null,
    sha ? `коммит ${sha}` : null,
    builtAtLabel ? `собрано ${builtAtLabel}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    number,
    sha,
    builtAt,
    label,
    title: title || "Версия не передана при сборке",
  };
}
