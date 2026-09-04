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
const HOUR_MS = 60 * 60_000;
/**
 * Ключ → когда последний раз писали. Чистится при разрастании: ключей стало
 * больше (к виду сбоя добавился заказ), и без уборки карта росла бы всё время
 * жизни процесса.
 */
const lastSent = new Map<string, number>();
const MAX_KEYS = 5000;

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

/**
 * Прошло ли достаточно времени по этому ключу — БЕЗ отметки.
 *
 * Разделение проверки и отметки не формальность: ограничителей два (общий по
 * виду сбоя и частный по заказу), и если отмечать при первой же удачной
 * проверке, то письмо, которое не ушло из-за второго ограничителя, всё равно
 * съедало бы лимит первого — и следующий, уже другой, сбой промолчал бы.
 */
export function canEmail(
  key: string,
  now: number,
  cooldownMs: number = EMAIL_COOLDOWN_MS,
): boolean {
  const previous = lastSent.get(key);
  return previous === undefined || now - previous >= cooldownMs;
}

/** Отметить, что по этому ключу письмо ушло. */
export function markEmailed(key: string, now: number): void {
  if (lastSent.size >= MAX_KEYS) {
    // Выкидываем всё, что заведомо остыло; если и после этого тесно —
    // начинаем с чистого листа. Потеря истории здесь стоит лишнего письма,
    // а не пропущенного.
    for (const [k, at] of lastSent) {
      if (now - at >= HOUR_MS) lastSent.delete(k);
    }
    if (lastSent.size >= MAX_KEYS) lastSent.clear();
  }
  lastSent.set(key, now);
}

/**
 * Проверка с отметкой — прежнее поведение, одним вызовом.
 * Оставлено для простых мест, где ограничитель ровно один.
 */
export function shouldEmail(
  key: string,
  now: number,
  cooldownMs: number = EMAIL_COOLDOWN_MS,
): boolean {
  if (!canEmail(key, now, cooldownMs)) return false;
  markEmailed(key, now);
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
  // Два ограничителя сразу, и оба нужны.
  //
  // По виду сбоя — глобальный потолок: упал шлюз, и сотня заказов в одном
  // проходе не должна превратиться в сотню писем. Это и был исходный замысел.
  //
  // По конкретному заказу — чтобы один и тот же заказ, который сверка
  // безуспешно чинит каждые десять минут, не съедал этот потолок и не прятал
  // за собой другие беды. Первым проходит общий: если он не пропустил, письма
  // не будет в любом случае, а список пострадавших заказов всё равно виден на
  // экране сверки и в суточной сводке.
  const subject = context["заказ"] ?? context["сертификат"] ?? "";
  const subjectKey = subject ? `${where}:${subject}` : null;
  const at = Date.now();
  if (!canEmail(where, at)) return;
  if (subjectKey && !canEmail(subjectKey, at, HOUR_MS)) return;
  markEmailed(where, at);
  if (subjectKey) markEmailed(subjectKey, at);

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
