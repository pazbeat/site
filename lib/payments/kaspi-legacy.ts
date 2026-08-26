import "server-only";

/**
 * Оплата Kaspi через бэкенд действующего сайта (схема Тимура, 2026-08-26).
 *
 * Kaspi спрашивает про заказ у бэкенда мерчанта, а мерчант у него — старый
 * сайт. Наших заказов он не знал, поэтому покупатель упирался в «проверьте
 * правильность ввода данных».
 *
 * Решение оказалось проще, чем правка их кода: у старого сайта уже есть две
 * готовые точки входа, которыми пользуется он сам.
 *
 *   POST /api/pay/{номер}/kaspi   {name, price}  → регистрирует заказ у себя
 *                                                  и отдаёт ссылку для Kaspi
 *   GET  /api/pay/{номер}/kaspi                  → code «1» оплачен, «2» ждём
 *
 * Мы просто заводим свой заказ в их хранилище — дальше Kaspi находит его
 * обычным путём, и ни одной строки в их системе менять не требуется.
 *
 * Номер передаём короткий (`Order.kaspiRef`, двадцать цифр): длинный
 * внутренний приложение Kaspi отбрасывает по маске кабинета, не дойдя до
 * бэкенда. Из-за этого способ и казался нерабочим при первой проверке.
 */

const TIMEOUT_MS = 8000;

/** Адрес бэкенда действующего сайта; null — путь не настроен. */
export function legacyPayBase(): string | null {
  const base = process.env.LEGACY_PAY_BASE?.trim();
  return base ? base.replace(/\/+$/, "") : null;
}

export type LegacyInvoice = { orderRef: string; payUrl: string };

/**
 * Завести заказ у действующего сайта и получить ссылку для Kaspi.
 * `price` — целые тенге: их сторона сама приписывает копейки при сверке.
 */
export async function registerLegacyOrder(input: {
  orderRef: string;
  name: string;
  amountKzt: number;
}): Promise<LegacyInvoice> {
  const base = legacyPayBase();
  if (!base) throw new Error("legacy_pay_not_configured");

  const response = await fetch(
    `${base}/pay/${encodeURIComponent(input.orderRef)}/kaspi`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({ name: input.name, price: input.amountKzt }),
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    orderid?: string;
    qrcode?: string;
    error?: string;
  };
  if (!response.ok || !data.qrcode) {
    throw new Error(
      `legacy_invoice_failed: ${response.status} ${data.error ?? ""}`.trim(),
    );
  }
  return { orderRef: data.orderid ?? input.orderRef, payUrl: data.qrcode };
}

export type LegacyStatus = {
  paid: boolean;
  /** Сумма, которую по данным Kaspi реально заплатили; null — неизвестна */
  paidKzt: number | null;
  /** Номер операции Kaspi — уходит в paymentId заказа */
  txnId: string | null;
};

/**
 * Оплачен ли заказ. Их ответ несёт поля Kaspi как есть, поэтому сумму и номер
 * операции достаём мягко: состав может меняться, и падать из-за этого нельзя.
 */
export async function checkLegacyStatus(
  orderRef: string,
): Promise<LegacyStatus> {
  const base = legacyPayBase();
  if (!base) throw new Error("legacy_pay_not_configured");

  const response = await fetch(
    `${base}/pay/${encodeURIComponent(orderRef)}/kaspi`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  const data = (await response.json().catch(() => ({}))) as {
    code?: string;
    sum?: string | number;
    txn_id?: string | number;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(`legacy_status_failed: ${response.status}`);
  }
  // Заказа у них нет — значит и оплаты быть не могло
  if (data.error) return { paid: false, paidKzt: null, txnId: null };

  const sum = Number(data.sum);
  return {
    paid: data.code === "1",
    paidKzt: Number.isFinite(sum) && sum > 0 ? Math.round(sum) : null,
    txnId: data.txn_id != null ? String(data.txn_id) : null,
  };
}
