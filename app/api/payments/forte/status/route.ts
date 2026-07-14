import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fulfillOrder } from "@/lib/certificates";
import { ForteBankProvider } from "@/lib/payments/forte";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Опрос статуса оплаты ForteBank (вебхуков нет). Клиент после возврата с
 * hosted-страницы опрашивает этот роут; при оплате исполняем заказ
 * (fulfillOrder идемпотентен) и отдаём successToken для редиректа.
 */
export async function POST(request: Request) {
  const limited = rateLimit(`forte-status:${clientIp(request)}`, 40);
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
  if (order.status === "paid") {
    return NextResponse.json({ paid: true, successToken: order.successToken });
  }
  if (order.status !== "pending" || !order.paymentId) {
    return NextResponse.json({ paid: false, status: order.status });
  }

  const forte = new ForteBankProvider();
  let status: "paid" | "pending" | "failed";
  try {
    status = await forte.checkStatus(order.paymentId);
  } catch (error) {
    console.error("forte status check failed", {
      orderId: order.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ paid: false, error: "status_unavailable" });
  }

  if (status === "failed") {
    return NextResponse.json({ paid: false, failed: true });
  }
  if (status !== "paid") return NextResponse.json({ paid: false });

  const result = await fulfillOrder(order.id, order.paymentId);
  if (result.status === "not_found" || result.status === "not_payable") {
    return NextResponse.json({ paid: false, error: result.status });
  }
  return NextResponse.json({ paid: true, successToken: order.successToken });
}
