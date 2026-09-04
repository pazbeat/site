import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from "./types";

/**
 * ForteBank — эквайринг на hosted-странице банка. Вебхуков нет, схема такая
 * же, как на боевом сайте заказчика (Node-RED: узлы `CreateOrder`, `forte`,
 * `format`, `prepForte`; фронтовый `api.js` → `byCard`):
 *
 *  1) createOrder → `POST /order` с Basic-авторизацией. Тело обязательно
 *     обёрнуто в объект `order` и несёт `typeRid: "Order_RID"` — плоское тело
 *     банк не принимает. В ответ `{order: {id, hppUrl, password, status}}`.
 *  2) покупателя уводим на `${hppUrl}?password=…&id=…` — страницу банка.
 *  3) банк возвращает его на `hppRedirectUrl`, дальше опрашиваем
 *     `GET /order/{id}?tranDetailLevel=1` до финального статуса.
 *
 * createPayment уводит на нашу страницу `/{locale}/pay/forte?order=…`, она и
 * создаёт заказ в банке. Креды — Basic из env (FORTE_USERNAME/FORTE_PASSWORD).
 */

import {
  checkLegacyForteStatus,
  createLegacyForteOrder,
  forteLegacyAvailable,
} from "./forte-legacy";

const BASE_URL = process.env.FORTE_API_URL ?? "https://api.fortebank.com";

/**
 * Ограничение ожидания шлюза. Без него зависший шлюз держит запрос
 * покупателя бесконечно: страница оплаты просто не отвечает, и человек
 * не понимает, оплатил он или нет. Поймано живьём — payqr.kz отвечал на
 * корень за 0.4 с, а его API молчал десятками секунд.
 */
const GATEWAY_TIMEOUT_MS = 20_000;

/**
 * Статус опрашивается раз в несколько секунд — ждать дольше бессмысленно.
 */
const STATUS_TIMEOUT_MS = 10_000;

type Config = { username: string; password: string };

function readConfig(): Config | null {
  const username = process.env.FORTE_USERNAME;
  const password = process.env.FORTE_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

function authHeader(cfg: Config): string {
  const raw = `${cfg.username}:${cfg.password}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

/**
 * Статусы заказа Forte. Названия — из ответа банка на боевом сайте
 * заказчика (там в комментарии зафиксирован `"status": "Preparing"`), плюс
 * обычные для этого API финальные состояния. Сверяем в нижнем регистре,
 * неизвестное трактуем как «ещё не финал» и пишем в лог — первая же боевая
 * оплата покажет реальный набор.
 */
const PAID_STATUSES = new Set([
  "paid",
  "charged",
  "completed",
  "approved",
  "success",
  "successful",
  "settled",
]);
const FAILED_STATUSES = new Set([
  "declined",
  "failed",
  "cancelled",
  "canceled",
  "rejected",
  "reversed",
  "refunded",
  "error",
  "expired",
  "timeout",
]);
/** Промежуточные — молча ждём дальше, в лог не пишем. */
const PENDING_STATUSES = new Set([
  "preparing",
  "prepared",
  "paying",
  "pending",
  "created",
  "new",
  "inprogress",
  "in_progress",
]);

export type ForteOrder = { redirectUrl: string; forteOrderId: string };
export type ForteStatus = "paid" | "pending" | "failed";

export class ForteBankProvider implements PaymentProvider {
  readonly id = "forte" as const;

  isConfigured(): boolean {
    // Путь через бэкенд действующего сайта не требует наших кредов банка:
    // пароль Forte у нас так и не появился, а у них доступ рабочий.
    return forteLegacyAvailable() || readConfig() !== null;
  }

  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    const origin = new URL(params.successUrl).origin;
    return {
      redirectUrl: `${origin}/${params.locale}/pay/forte?order=${params.orderId}`,
    };
  }

  /** Создаёт заказ Forte и возвращает hosted-URL для редиректа покупателя. */
  async createOrder(input: {
    amountKzt: number;
    description: string;
    returnUrl: string;
    /** Наш короткий номер — под ним заказ заводится у действующего сайта */
    orderRef?: string;
  }): Promise<ForteOrder> {
    if (forteLegacyAvailable() && input.orderRef) {
      return createLegacyForteOrder({
        orderRef: input.orderRef,
        amountKzt: input.amountKzt,
        description: input.description,
        returnUrl: input.returnUrl,
      });
    }

    const cfg = readConfig();
    if (!cfg) throw new Error("forte_not_configured");

    const response = await fetch(`${BASE_URL}/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(cfg),
      },
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      body: JSON.stringify({
        order: {
          typeRid: "Order_RID",
          language: "ru",
          currency: "KZT",
          hppRedirectUrl: input.returnUrl,
          description: input.description,
          // банк ждёт сумму строкой с двумя знаками после точки
          amount: input.amountKzt.toFixed(2),
        },
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      order?: { id?: string | number; hppUrl?: string; password?: string };
      errorCode?: string;
      errorDescription?: string;
    } | null;
    const order = data?.order;
    if (!response.ok || !order?.id || !order.hppUrl) {
      throw new Error(
        `forte_order_failed: ${response.status} ${data?.errorCode ?? ""} ${
          data?.errorDescription ?? ""
        }`.trim(),
      );
    }
    const id = String(order.id);
    // hppUrl приходит без пути — пароль и номер заказа уходят в query,
    // ровно как это делает боевой сайт заказчика.
    const pw = encodeURIComponent((order.password ?? "").trim());
    return {
      redirectUrl: `${order.hppUrl}?password=${pw}&id=${encodeURIComponent(id)}`,
      forteOrderId: id,
    };
  }

  /** Опрос статуса заказа Forte. */
  async checkStatus(
    forteOrderId: string,
    expectedKzt?: number,
  ): Promise<ForteStatus> {
    if (forteLegacyAvailable()) {
      const status = await checkLegacyForteStatus(forteOrderId);
      if (status.state !== "paid") return status.state;
      // Сверка суммы: заплатить меньше номинала и получить полный сертификат
      // не должно получаться.
      if (
        expectedKzt != null &&
        status.amountKzt != null &&
        status.amountKzt !== expectedKzt
      ) {
        void import("../alerts").then(({ reportFailure }) =>
          reportFailure(
            "ForteBank: сумма оплаты не совпала с заказом",
            new Error(
              `ожидали ${expectedKzt} ₸, заплачено ${status.amountKzt} ₸`,
            ),
            { заказ: forteOrderId },
          ),
        );
        return "pending";
      }
      return "paid";
    }

    const cfg = readConfig();
    if (!cfg) throw new Error("forte_not_configured");

    const url = new URL(
      `${BASE_URL}/order/${encodeURIComponent(forteOrderId)}`,
    );
    // Без уровня детализации банк отдаёт заказ без транзакций
    url.searchParams.set("tranDetailLevel", "1");

    const response = await fetch(url, {
      headers: { Authorization: authHeader(cfg) },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => null)) as {
      order?: { status?: string };
    } | null;
    const status = (data?.order?.status ?? "").toLowerCase();
    if (PAID_STATUSES.has(status)) {
      console.log("forte status PAID:", status);
      return "paid";
    }
    if (FAILED_STATUSES.has(status)) return "failed";
    if (!PENDING_STATUSES.has(status)) {
      // Незнакомое состояние банка. Раньше это был console.warn, и ровно так
      // мы полгода не знали, что боевой статус называется FullyPaid: оплаты
      // висели неподтверждёнными, а строка лежала в логе контейнера.
      void import("../alerts").then(({ reportFailure }) =>
        reportFailure(
          "ForteBank: незнакомый статус платежа",
          new Error(status || "(пусто)"),
          { заказ: forteOrderId },
        ),
      );
    }
    return "pending";
  }

  // Вебхуков у Forte нет — методы интерфейса не используются.
  async verifyWebhook(): Promise<WebhookVerification> {
    return { ok: false, reason: "forte_no_webhook" };
  }

  webhookResponse(): { body: string; contentType: string } {
    return {
      body: JSON.stringify({ status: "ok" }),
      contentType: "application/json",
    };
  }
}
