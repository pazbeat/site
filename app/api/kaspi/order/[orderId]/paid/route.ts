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
  if (claimedKzt !== null && claimedKzt !== order.amountKzt) {
    console.error("kaspi bridge amount mismatch", {
      orderId,
      expected: order.amountKzt,
      claimed: claimedKzt,
    });
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
