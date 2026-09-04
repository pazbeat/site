import "server-only";
import * as Sentry from "@sentry/nextjs";
import { getMailer } from "./mail";

/**
 * Оповещение о сбое, который сам себя не показывает.
 *
 * Много где ошибка намеренно гасится, чтобы не рушить покупку: не записался
 * сертификат в CRM, не подтвердился платёж, не ушло письмо. Правильно, что
 * покупатель этого не видит, — но и мы не видели тоже: запись уходила в лог
 * контейнера, который никто не читает. Отсюда простое правило: всё, что мы
 * проглотили, отправляем сюда.
 *
 * Два адресата, оба необязательные:
 *  · Sentry — если задан SENTRY_DSN (иначе вызов ничего не делает);
 *  · письмо на MANAGER_EMAIL — работает сразу, отдельный сервис не нужен.
 *
 * Письма throttle'ятся по ключу: сотня одинаковых сбоев подряд (упал шлюз,
 * легла CRM) не должна превратиться в сотню писем.
 */

const EMAIL_COOLDOWN_MS = 15 * 60_000;
const lastSent = new Map<string, number>();

/** Ошибка → короткий текст без стека (стек уходит в Sentry и в лог). */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Прошло ли достаточно времени, чтобы снова писать по этому ключу. */
export function shouldEmail(
  key: string,
  now: number,
  cooldownMs: number = EMAIL_COOLDOWN_MS,
): boolean {
  const previous = lastSent.get(key);
  if (previous !== undefined && now - previous < cooldownMs) return false;
  lastSent.set(key, now);
  return true;
}

export type FailureContext = Record<string, string | number | null | undefined>;

/**
 * Сообщает о проглоченном сбое. Сама никогда не бросает: оповещение не должно
 * ломать то, ради чего оно вызвано.
 */
export async function reportFailure(
  where: string,
  error: unknown,
  context: FailureContext = {},
): Promise<void> {
  const summary = describe(error);
  const details = Object.entries(context)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.error(`[сбой] ${where}: ${summary}${details ? ` (${details})` : ""}`);

  try {
    Sentry.captureException(error, { tags: { where }, extra: context });
  } catch {
    // Sentry не настроен или недоступен — не наша забота в этот момент
  }

  const to = process.env.MANAGER_EMAIL?.trim();
  if (!to) return;
  // Ключ throttle включает объект сбоя, а не только его вид. Иначе десять
  // разных заказов с одной и той же бедой («сумма не сошлась») схлопывались
  // в одно письмо, и девять оставались невидимыми — а именно множественность
  // и отличает случайность от поломки, которую надо чинить немедленно.
  const subject = context["заказ"] ?? context["сертификат"] ?? "";
  const throttleKey = subject ? `${where}:${subject}` : where;
  if (!shouldEmail(throttleKey, Date.now())) return;

  try {
    const rows = Object.entries(context)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(k)}</td>` +
          `<td style="padding:4px 0"><code>${escapeHtml(String(v))}</code></td></tr>`,
      )
      .join("");
    await getMailer().send({
      to,
      subject: `Сайт сертификатов: сбой — ${where}`,
      html:
        `<p>На сайте произошёл сбой, который покупателю не показывается.</p>` +
        `<p><b>Где:</b> ${escapeHtml(where)}<br><b>Что:</b> ${escapeHtml(summary)}</p>` +
        (rows ? `<table>${rows}</table>` : "") +
        `<p style="color:#888;font-size:13px">Повторные сообщения об этом же ` +
        `сбое не приходят ещё 15 минут.</p>`,
    });
  } catch (mailError) {
    console.error("[сбой] не удалось отправить письмо о сбое:", mailError);
  }
}
