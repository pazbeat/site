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
    select: { id: true, status: true, paymentId: true, successToken: true },
  });
  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  // Уже оплачен ранее
  if (order.status === "paid") {
    return NextResponse.json({ paid: true, successToken: order.successToken });
  }
  if (order.status !== "pending" || !order.paymentId) {
    return NextResponse.json({ paid: false, status: order.status });
  }

  const kaspi = new KaspiPayProvider();
  let paid = false;
  try {
    paid = (await kaspi.checkStatus(order.paymentId)) === "paid";
  } catch (error) {
    console.error("kaspi status check failed", {
      orderId: order.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ paid: false, error: "status_unavailable" });
  }

  if (!paid) return NextResponse.json({ paid: false });

  // Оплачено — исполняем заказ (идемпотентно)
  const result = await fulfillOrder(order.id, order.paymentId);
  if (result.status === "not_found" || result.status === "not_payable") {
    return NextResponse.json({ paid: false, error: result.status });
  }
  return NextResponse.json({ paid: true, successToken: order.successToken });
}
