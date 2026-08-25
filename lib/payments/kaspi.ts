import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from "./types";

/**
 * Kaspi. Два способа выдать покупателю платёжную ссылку:
 *
 * 1) **Ссылка на сервис Kaspi** (`kaspi.kz/pay/{slug}?service_id=…&{поле}=…`).
 *    Именно так работает боевой сайт заказчика — проверено живьём 2026-08-21:
 *    его `POST /pay/{id}/kaspi` отвечает за 0.3 с и отдаёт такую ссылку, то
 *    есть собирает её локально, никуда не ходя. Ссылка открывает в Kaspi
 *    форму сервиса с уже подставленным номером заказа.
 *
 * 2) **Шлюз PayQR** (`payqr.kz/v1/le/qr_invoice`) — прежняя схема с machid и
 *    terNumber. Оставлена как запасная: на 2026-08-21 API шлюза не отвечает
 *    (корень отдаёт 200 за 0.4 с, а POST на `/qr_invoice` и `/pay_status`
 *    висит без ответа минуту — и с нашего сервера в Казахстане, и с машины
 *    разработчика). GET по тем же путям отдаёт 404 мгновенно, значит маршрут
 *    есть, а зависает обработчик — это сторона PayQR, не наша.
 *
 * Вебхука о платеже нет ни там, ни там: оплата подтверждается опросом PayQR
 * (когда он жив) либо вручную из админки — «отметить оплаченным». Опрос со
 * страницы видит оба случая: он сначала смотрит статус заказа в нашей БД.
 */

const BASE_URL = process.env.KASPI_PAYQR_BASE_URL ?? "https://payqr.kz";
const KASPI_LINK_HOST = "https://kaspi.kz";

/**
 * Ограничение ожидания шлюза. Без него зависший шлюз держит запрос
 * покупателя бесконечно: страница оплаты просто не отвечает, и человек
 * не понимает, оплатил он или нет. Поймано живьём — payqr.kz отвечал на
 * корень за 0.4 с, а его API молчал десятками секунд.
 */
const GATEWAY_TIMEOUT_MS = 20_000;

/**
 * Статус опрашивается раз в 3 секунды, поэтому ждать ответа дольше
 * нескольких секунд бессмысленно: запросы копятся быстрее, чем завершаются.
 */
const STATUS_TIMEOUT_MS = 6_000;

/**
 * Предохранитель на зависший шлюз. Пока PayQR молчит, каждый опрос — это
 * ещё одно висящее соединение, и при опросе раз в 3 с их набирается вдвое
 * больше, чем завершается. После нескольких неудач подряд перестаём ходить
 * к шлюзу на минуту и сразу отвечаем «ждём».
 */
const BREAKER_FAILURES = 3;
const BREAKER_COOLDOWN_MS = 60_000;
const breaker = { failures: 0, openedAt: 0 };

function breakerIsOpen(): boolean {
  if (breaker.openedAt === 0) return false;
  if (Date.now() - breaker.openedAt < BREAKER_COOLDOWN_MS) return true;
  breaker.openedAt = 0;
  breaker.failures = 0;
  return false;
}

function noteFailure(): void {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_FAILURES) breaker.openedAt = Date.now();
}

function noteSuccess(): void {
  breaker.failures = 0;
  breaker.openedAt = 0;
}

/** Ссылка на сервис Kaspi: slug сервиса, его id и id поля «номер заказа». */
export type KaspiLinkConfig = {
  slug: string;
  serviceId: string;
  orderFieldId: string;
};

function readLinkConfig(): KaspiLinkConfig | null {
  const slug = process.env.KASPI_PAY_LINK_SLUG?.trim();
  const serviceId = process.env.KASPI_PAY_SERVICE_ID?.trim();
  const orderFieldId = process.env.KASPI_PAY_ORDER_FIELD_ID?.trim();
  if (!slug || !serviceId || !orderFieldId) return null;
  return { slug, serviceId, orderFieldId };
}

/** Терминал PayQR: пары machid + terNumber достаточно, секрета у шлюза нет. */
type TerminalConfig = { machid: string; terNumber: string };

function readTerminalConfig(): TerminalConfig | null {
  const machid = process.env.KASPI_PAY_MERCHANT_ID;
  const terNumber = process.env.KASPI_PAY_TERMINAL;
  if (!machid || !terNumber) return null;
  return { machid, terNumber };
}

export type KaspiInvoice = { payUrl: string; source: "link" | "payqr" };
export type KaspiStatus = "paid" | "pending";

/**
 * Собирает ссылку на форму сервиса Kaspi с подставленным номером заказа.
 * Вынесена чистой функцией — её же проверяют тесты.
 */
export function buildKaspiPayLink(
  cfg: KaspiLinkConfig,
  orderRef: string,
): string {
  const url = new URL(`${KASPI_LINK_HOST}/pay/${encodeURIComponent(cfg.slug)}`);
  url.searchParams.set("service_id", cfg.serviceId);
  url.searchParams.set(cfg.orderFieldId, orderRef);
  return url.toString();
}

export class KaspiPayProvider implements PaymentProvider {
  readonly id = "kaspi" as const;

  isConfigured(): boolean {
    return readLinkConfig() !== null || readTerminalConfig() !== null;
  }

  /** Есть ли источник, подтверждающий оплату без участия человека. */
  hasAutomaticConfirmation(): boolean {
    return readTerminalConfig() !== null;
  }

  /**
   * Оплата Kaspi идёт не редиректом на внешний сайт, а на нашу страницу
   * с QR/кнопкой. Сама ссылка выдаётся уже на этой странице (invoice API).
   */
  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    const origin = new URL(params.successUrl).origin;
    return {
      redirectUrl: `${origin}/${params.locale}/pay/kaspi?order=${params.orderId}`,
    };
  }

  /**
   * Выдаёт платёжную ссылку Kaspi. Ссылка на сервис приоритетнее: она
   * собирается локально и не зависит от доступности шлюза.
   */
  async createInvoice(input: {
    payqrOrderId: string;
    /** Короткий номер для ссылки и QR; не задан — payqrOrderId */
    publicRef?: string;
    amountKzt: number;
    name: string;
  }): Promise<KaspiInvoice> {
    const link = readLinkConfig();
    if (link) {
      return {
        payUrl: buildKaspiPayLink(link, input.publicRef ?? input.payqrOrderId),
        source: "link",
      };
    }

    const cfg = readTerminalConfig();
    if (!cfg) throw new Error("kaspi_not_configured");

    const response = await fetch(`${BASE_URL}/v1/le/qr_invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      body: JSON.stringify({
        machid: cfg.machid,
        terNumber: cfg.terNumber,
        orderid: input.payqrOrderId,
        name: input.name,
        // строго в тиынах: к сумме приписываем '00'
        price: `${input.amountKzt}00`,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      code?: string;
      twocode?: string;
      msg?: string;
    };
    if (!response.ok || data.code !== "1" || !data.twocode) {
      throw new Error(
        `kaspi_invoice_failed: ${response.status} ${data.msg ?? ""} code=${data.code ?? "?"}`,
      );
    }
    return { payUrl: data.twocode, source: "payqr" };
  }

  /**
   * Опрос статуса оплаты через PayQR. code/status.code === "1" — оплачено,
   * "2" — ждём. Без терминала PayQR автоматического источника нет: отвечаем
   * «ждём», подтверждение придёт из админки.
   */
  async checkStatus(payqrOrderId: string): Promise<KaspiStatus> {
    const cfg = readTerminalConfig();
    if (!cfg) return "pending";
    if (breakerIsOpen()) return "pending";

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/v1/le/pay_status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
        body: JSON.stringify({ orderid: payqrOrderId, machid: cfg.machid }),
      });
    } catch (error) {
      noteFailure();
      throw error;
    }
    noteSuccess();

    const data = (await response.json().catch(() => ({}))) as {
      code?: string;
      status?: { code?: string };
    };
    const paid = data.code === "1" || data.status?.code === "1";
    if (paid) {
      // На первой боевой оплате поможет свериться с реальным форматом ответа
      console.log("kaspi pay_status PAID:", JSON.stringify(data).slice(0, 200));
      return "paid";
    }
    return "pending";
  }

  // Вебхуков у Kaspi/PayQR нет — методы интерфейса не используются.
  async verifyWebhook(): Promise<WebhookVerification> {
    return { ok: false, reason: "kaspi_no_webhook" };
  }

  webhookResponse(): { body: string; contentType: string } {
    return {
      body: JSON.stringify({ status: "ok" }),
      contentType: "application/json",
    };
  }
}
