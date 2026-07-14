import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ForteBankProvider } from "@/lib/payments/forte";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Создание заказа ForteBank и получение hosted-URL для редиректа покупателя.
 * Идемпотентно на уровне провайдера — при повторе создаётся новый заказ Forte,
 * но исполнение заказа (fulfillOrder) идемпотентно по нашему orderId.
 */
export async function POST(request: Request) {
  const limited = rateLimit(`forte-invoice:${clientIp(request)}`, 10);
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

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "not_payable" }, { status: 409 });
  }

  const forte = new ForteBankProvider();
  const origin = new URL(request.url).origin;
  const locale =
    (order.item as { locale?: string } | null)?.locale ?? "ru";
  const returnUrl = `${origin}/${locale}/pay/forte?order=${order.id}&ret=1`;

  try {
    const created = await forte.createOrder({
      amountKzt: order.amountKzt,
      description: "Подарочный сертификат Imbir Thai Spa",
      returnUrl,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentId: created.forteOrderId, paymentProvider: "forte" },
    });
    return NextResponse.json({ redirectUrl: created.redirectUrl });
  } catch (error) {
    console.error("forte invoice failed", {
      orderId: order.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "invoice_failed" }, { status: 502 });
  }
}
