/**
 * Просил ли человек в системе убрать анимацию.
 *
 * В CSS это закрыто глобальным блоком в globals.css, но видео запускаются из
 * скрипта — их правило `prefers-reduced-motion` не касается, и они играли
 * вопреки настройке. А это прямое требование ТЗ (PRD §3), и для людей с
 * вестибулярными расстройствами движущийся фон — не мелочь.
 *
 * Живёт отдельным модулем: и слайдер на главной, и лента «Атмосферы» должны
 * спрашивать одно и то же одинаково.
 */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Текущее значение. На сервере — false: там движения всё равно нет. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Подписка на изменение настройки: её меняют на ходу, и страница не должна
 * ждать перезагрузки. Возвращает функцию отписки.
 */
export function onReducedMotionChange(
  handler: (reduced: boolean) => void,
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  const listener = (e: MediaQueryListEvent) => handler(e.matches);
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

/**
 * Подписка в форме, которую ждёт useSyncExternalStore: без аргумента.
 * Через него компонент читает настройку правильно — без setState в эффекте
 * и без лишнего перерисовывания.
 */
export function subscribeReducedMotion(onChange: () => void): () => void {
  return onReducedMotionChange(() => onChange());
}

/** Значение для серверной отрисовки: там движения нет. */
export function reducedMotionServerSnapshot(): boolean {
  return false;
}
