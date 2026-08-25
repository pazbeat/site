/**
 * Короткий номер заказа для Kaspi.
 *
 * Приложение Kaspi проверяет номер по маске, заданной в кабинете мерчанта, и
 * отбрасывает всё, что в неё не влезло, — до того, как спросит бэкенд. Наш
 * внутренний номер (`cmt8o1zhw000227nj3dwz5me3`, 25 знаков) в неё не проходил:
 * покупатель видел «проверьте правильность ввода данных», а бэкенд об этом
 * заказе даже не спрашивали. Выяснено 2026-08-25: тестовый номер самого Kaspi
 * `001AA01` — семь знаков — проходит нормально.
 *
 * Поэтому у заказа есть второй, короткий номер: он идёт в ссылку и QR, его же
 * видит покупатель в чеке. Внутренний остаётся прежним.
 */

/**
 * Алфавит без похожих знаков: O и 0, I и 1 в чеке не различить, а номер
 * покупателю иногда приходится вводить руками.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Длина номера. Ровно как у тестовых номеров Kaspi — под их маску.
 * Если окажется, что маска другая, менять надо здесь.
 */
export const ORDER_REF_LENGTH = 7;

export const ORDER_REF_REGEX = new RegExp(`^[${ALPHABET}]{${ORDER_REF_LENGTH}}$`);

export function isOrderRef(value: string): boolean {
  return ORDER_REF_REGEX.test(value.trim().toUpperCase());
}

/** Приводит к каноническому виду: без пробелов, в верхнем регистре. */
export function normalizeOrderRef(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Случайный номер. Случайный, а не по счётчику: последовательные номера
 * позволяли бы перебором смотреть чужие суммы в приложении Kaspi.
 * 32 знака в семи позициях — больше тридцати миллиардов вариантов.
 */
export function generateOrderRef(
  random: () => number = Math.random,
): string {
  let out = "";
  for (let i = 0; i < ORDER_REF_LENGTH; i += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}
