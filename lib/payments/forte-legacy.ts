import "server-only";
import { legacyPayBase } from "./kaspi-legacy";

/**
 * Оплата картой через бэкенд действующего сайта.
 *
 * Прямой путь в ForteBank у нас закрыт: логин известен
 * (`TerminalSys/IMBIR03020581`), а пароля нет — Node-RED хранит его
 * зашифрованным и наружу не отдаёт. Но у действующего сайта доступ рабочий,
 * и он выставляет наружу свои точки входа — те же, что и для Kaspi:
 *
 *   POST /api/pay/{наш номер}/byCard  {amount, currency, description,
 *                                      hppRedirectUrl}
 *        → {id, hppUrl, password, href, status}
 *   GET  /api/pay/{номер банка}/byCard
 *        → {order: {id, status, amount, currency, …}}
 *
 * Тело POST подставляется поверх их значений по умолчанию, поэтому сумму и
 * адрес возврата задаём сами. Это важно: их код определяет «новый сайт» по
 * букве `N` в номере заказа, а наш номер состоит из одних цифр — иначе Kaspi
 * отбросит его по маске. Передавая `hppRedirectUrl` явно, мы от этой их
 * догадки не зависим.
 *
 * Проверено живьём 2026-08-26: банк вернул готовую ссылку на оплату.
 */

const TIMEOUT_MS = 20_000;

export type LegacyForteOrder = { redirectUrl: string; forteOrderId: string };

export function forteLegacyAvailable(): boolean {
  return legacyPayBase() !== null;
}

export async function createLegacyForteOrder(input: {
  orderRef: string;
  amountKzt: number;
  description: string;
  returnUrl: string;
}): Promise<LegacyForteOrder> {
  const base = legacyPayBase();
  if (!base) throw new Error("legacy_pay_not_configured");

  const response = await fetch(
    `${base}/pay/${encodeURIComponent(input.orderRef)}/byCard`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        // банк ждёт сумму строкой с двумя знаками после точки
        amount: input.amountKzt.toFixed(2),
        currency: "KZT",
        description: input.description,
        hppRedirectUrl: input.returnUrl,
      }),
    },
  );
  const data = (await response.json().catch(() => null)) as {
    id?: string | number;
    hppUrl?: string;
    password?: string;
    href?: string;
    errorCode?: string;
    errorDescription?: string;
  } | null;

  if (!response.ok || !data?.id) {
    throw new Error(
      `legacy_forte_failed: ${response.status} ${data?.errorCode ?? ""} ${
        data?.errorDescription ?? ""
      }`.trim(),
    );
  }

  const id = String(data.id);
  // Готовую ссылку банк отдаёт в `href`; собираем сами только если её нет
  const redirectUrl =
    data.href ??
    `${data.hppUrl}?password=${encodeURIComponent((data.password ?? "").trim())}&id=${encodeURIComponent(id)}`;
  return { redirectUrl, forteOrderId: id };
}

/**
 * Статусы банка — выверены по настоящему платежу 2026-08-26.
 *
 * Оплаченный заказ приходит как `FullyPaid` (до оплаты — `Preparing`).
 * Названия я сначала угадывал, и `FullyPaid` в список не попал: покупатель
 * заплатил, а страница осталась ждать. Предохранитель сработал верно —
 * сертификат на незнакомом статусе не выпустился, — но угадывать было
 * неправильно, здесь только проверенные значения плюс синонимы про запас.
 *
 * `PartiallyPaid` намеренно НЕ считаем оплатой: сертификат выдаётся за полную
 * сумму, частичный платёж этого не покрывает.
 */
const PAID = new Set([
  "fullypaid",
  "completed",
  "approved",
  "paid",
  "success",
  "successful",
]);

/**
 * Единственный статус, который мы видели живьём на успешной оплате.
 *
 * Остальные в PAID — синонимы про запас, и один из них тревожит: при
 * двухстадийной схеме эквайринга `Approved` означает «сумма заморожена», а не
 * «списана», и сертификат уйдёт за деньги, которые могут не прийти. Выяснить
 * это можно только у банка. До ответа выпускаем как раньше (отказать было бы
 * хуже: одностадийная схема — самая вероятная), но первый же такой платёж
 * сообщаем людям, чтобы у вопроса появился живой пример, а не гипотеза.
 */
const CONFIRMED_PAID = "fullypaid";
const FAILED = new Set([
  "declined",
  "cancelled",
  "canceled",
  "expired",
  "failed",
  "reversed",
  "refunded",
  "voided",
]);

export type LegacyForteStatus = {
  state: "paid" | "pending" | "failed";
  amountKzt: number | null;
  /** Статус банка как есть — по нему отличают отказ от ОТМЕНЫ уже прошедшей оплаты */
  statusRaw: string;
};

/**
 * Статусы, означающие именно ОТМЕНУ прошедшего платежа.
 *
 * Отделены от общего `FAILED` намеренно. Тот набор отвечает на вопрос «эта
 * оплата не состоялась» и уместен, пока мы ждём денег: `declined`, `expired`,
 * `cancelled` там нормальны. Но у заказа, который УЖЕ оплачен, «expired»
 * скорее означает, что запись протухла в чужом хранилище, а не что банк
 * вернул деньги. Гасить по такому сигналу живой сертификат нельзя.
 */
const REVERSED = new Set(["reversed", "refunded", "voided", "chargeback"]);

/** Означает ли статус банка отмену уже прошедшей оплаты. */
export function isReversalStatus(statusRaw: string): boolean {
  return REVERSED.has(statusRaw.trim().toLowerCase());
}

export async function checkLegacyForteStatus(
  forteOrderId: string,
): Promise<LegacyForteStatus> {
  const base = legacyPayBase();
  if (!base) throw new Error("legacy_pay_not_configured");

  const response = await fetch(
    `${base}/pay/${encodeURIComponent(forteOrderId)}/byCard`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  const data = (await response.json().catch(() => null)) as {
    order?: { status?: string; amount?: number | string };
    errorCode?: string;
  } | null;

  if (response.status === 404 || data?.errorCode) {
    return { state: "pending", amountKzt: null, statusRaw: "" };
  }
  if (!response.ok || !data?.order) {
    throw new Error(`legacy_forte_status_failed: ${response.status}`);
  }

  const status = String(data.order.status ?? "").toLowerCase();
  const amount = Number(data.order.amount);
  const amountKzt = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;

  if (PAID.has(status)) {
    if (status !== CONFIRMED_PAID) {
      void import("../alerts").then(({ reportFailure }) =>
        reportFailure(
          "ForteBank: оплата принята по непроверенному статусу",
          new Error(
            `банк ответил «${status}» вместо «FullyPaid» — если у мерчанта ` +
              `двухстадийная схема, деньги могли быть только заморожены`,
          ),
          { заказ: forteOrderId, статус: status },
        ),
      );
    }
    return { state: "paid", amountKzt, statusRaw: status };
  }
  if (FAILED.has(status)) return { state: "failed", amountKzt, statusRaw: status };
  if (status !== "preparing" && status !== "pending" && status !== "partiallypaid") {
    void import("../alerts").then(({ reportFailure }) =>
      reportFailure(
        "ForteBank: незнакомый статус платежа",
        new Error(status || "(пусто)"),
        { заказ: forteOrderId },
      ),
    );
  }
  return { state: "pending", amountKzt, statusRaw: status };
}
