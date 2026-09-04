import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fulfillOrder } from "@/lib/certificates";
import { KaspiPayProvider } from "@/lib/payments/kaspi";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Опрос статуса Kaspi-оплаты (PayQR не шлёт вебхуков). Клиент периодически
 * дёргает этот роут; сервер опрашивает pay_status и при оплате исполняет
 * заказ (fulfillOrder — идемпотентно) и отдаёт successToken для редиректа.
 */
export async function POST(request: Request) {
  // Поллинг раз в ~3с — щедрый лимит на IP
  const limited = rateLimit(`kaspi-status:${clientIp(request)}`, 40);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { orderId?: string };
  try {
    body = (await request.json()) as { orderId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const orderId = body.orderId?.trim();
  if (!orderId) {
    return NextResponse.json({ error: "order_required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paymentId: true,
      successToken: true,
      kaspiRef: true,
      amountKzt: true,
      createdAt: true,
    },
  });
  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  // Уже оплачен ранее
  if (order.status === "paid") {
    return NextResponse.json({ paid: true, successToken: order.successToken });
  }
  // Протухший заказ спрашиваем у провайдера так же, как ожидающий: человек
  // мог оплатить на 31-й минуте и сидеть на этой странице. Раньше здесь был
  // ранний выход, и такой покупатель видел вечное «проверяем оплату», пока
  // через минуту его не подберёт фоновый добор. Старше суток не спрашиваем —
  // там уже работают ступени поллера, а страницу давно закрыли.
  const stale =
    order.status === "expired" &&
    order.createdAt.getTime() < Date.now() - 24 * 60 * 60_000;
  if ((order.status !== "pending" && order.status !== "expired") || stale) {
    return NextResponse.json({ paid: false, status: order.status });
  }
  if (!order.paymentId) {
    return NextResponse.json({ paid: false, status: order.status });
  }

  const kaspi = new KaspiPayProvider();
  let paid = false;
  try {
    // Спрашиваем по короткому номеру: под ним заказ заведён у действующего
    // сайта. Сумму передаём, чтобы неполная оплата не выпустила сертификат.
    const ref = order.kaspiRef ?? order.paymentId;
    paid = (await kaspi.checkStatus(ref, order.amountKzt)) === "paid";
  } catch (error) {
    void import("@/lib/alerts").then(({ reportFailure }) =>
      reportFailure("Kaspi: не удалось узнать статус оплаты", error, {
        заказ: order.id,
      }),
    );
    void import("@/lib/payment-events").then(({ recordPaymentEvent }) =>
      recordPaymentEvent({
        orderId: order.id,
        provider: "kaspi",
        source: "page",
        kind: "error",
        externalRef: order.paymentId,
        note: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json({ paid: false, error: "status_unavailable" });
  }

  if (!paid) return NextResponse.json({ paid: false });

  // Оплачено — исполняем заказ (идемпотентно)
  const result = await fulfillOrder(order.id, order.paymentId, "page");
  if (result.status === "not_found" || result.status === "not_payable") {
    return NextResponse.json({ paid: false, error: result.status });
  }
  return NextResponse.json({ paid: true, successToken: order.successToken });
}
