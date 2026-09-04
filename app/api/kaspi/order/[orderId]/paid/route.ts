import { NextResponse } from "next/server";
import { fulfillOrder } from "@/lib/certificates";
import { bridgeAuthorized, bridgeToken, describeOrder } from "@/lib/kaspi-bridge";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Уведомление об оплате заказа в Kaspi (через мост на бэкенде действующего
 * сайта). Переводит заказ в оплаченные и выпускает сертификат — `fulfillOrder`
 * идемпотентен, повторный вызов второй сертификат не создаёт.
 *
 * Тело необязательно: `{ "amountKzt": 20000, "txnId": "..." }`. Если сумма
 * передана и не совпадает с нашей — отказываем: заплатить меньше номинала и
 * получить полный сертификат не должно получаться.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  if (!bridgeToken()) {
    return NextResponse.json({ error: "bridge_disabled" }, { status: 503 });
  }
  const limited = rateLimit(`kaspi-bridge-paid:${clientIp(request)}`, 60);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!bridgeAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { orderId: raw } = await params;
  const orderId = raw.trim();

  const body = (await request.json().catch(() => ({}))) as {
    amountKzt?: number;
    amountTiyn?: number;
    txnId?: string | number;
  };

  const order = await describeOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  // Kaspi знает заказ под коротким номером, а выпуск сертификата идёт по
  // внутреннему — переключаемся на него сразу после поиска.
  const internalId = order.orderId;

  // Сверка суммы на сервере (PRD §9): клиентской сумме не верим
  const claimedKzt =
    typeof body.amountKzt === "number"
      ? body.amountKzt
      : typeof body.amountTiyn === "number"
        ? Math.round(body.amountTiyn / 100)
        : null;
  // Мост подтверждает только оплаты Kaspi. Заказ, оформленный на карту, он
  // подтверждать не должен вовсе: у карты свой путь статуса, и совпадение
  // номера ещё не значит, что деньги пришли этим способом.
  if (order.paymentProvider && order.paymentProvider !== "kaspi") {
    return NextResponse.json(
      { error: "wrong_provider", provider: order.paymentProvider },
      { status: 409 },
    );
  }

  // Сумма обязательна. Раньше её отсутствие означало «сверять нечего» — и
  // подтверждение оплаты принималось на слово. Для моста, который ходит по
  // общему секрету, этого мало: сумма — единственное, что связывает
  // подтверждение с конкретным заказом.
  if (claimedKzt === null) {
    return NextResponse.json(
      { error: "amount_required" },
      { status: 400 },
    );
  }
  if (claimedKzt !== order.amountKzt) {
    void import("@/lib/alerts").then(({ reportFailure }) =>
      reportFailure(
        "Мост Kaspi: сумма оплаты не совпала с заказом",
        new Error(`ожидали ${order.amountKzt} ₸, прислали ${claimedKzt} ₸`),
        { заказ: orderId },
      ),
    );
    return NextResponse.json(
      { error: "amount_mismatch", expected: order.amountKzt },
      { status: 409 },
    );
  }

  const paymentRef = body.txnId ? `kaspi:${body.txnId}` : `kaspi:bridge`;
  const result = await fulfillOrder(internalId, paymentRef);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (result.status === "not_payable") {
    // Отменён или возвращён — оплату принимать нельзя
    return NextResponse.json(
      { error: "not_payable", status: order.status },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, status: result.status });
}
