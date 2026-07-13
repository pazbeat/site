import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { KaspiPayProvider } from "@/lib/payments/kaspi";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Создание Kaspi QR-инвойса для заказа (PayQR). Возвращает ссылку Kaspi
 * (twocode) и готовый QR-код. Идемпотентно: повторный вызов переиспользует
 * ранее выданный orderid PayQR (хранится в order.paymentId).
 */
export async function POST(request: Request) {
  const limited = rateLimit(`kaspi-invoice:${clientIp(request)}`, 10);
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

  // Переиспользуем orderid PayQR, чтобы не плодить инвойсы при перезагрузке
  const payqrOrderId = order.paymentId ?? randomUUID();
  if (!order.paymentId) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentId: payqrOrderId, paymentProvider: "kaspi" },
    });
  }

  const kaspi = new KaspiPayProvider();
  try {
    const invoice = await kaspi.createInvoice({
      payqrOrderId,
      amountKzt: order.amountKzt,
      name: "Подарочный сертификат Imbir Thai Spa",
    });
    const qrDataUrl = await QRCode.toDataURL(invoice.twocode, {
      margin: 1,
      width: 320,
      color: { dark: "#4D295D", light: "#FFFFFF" },
    });
    return NextResponse.json({ twocode: invoice.twocode, qrDataUrl });
  } catch (error) {
    console.error("kaspi invoice failed", {
      orderId: order.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "invoice_failed" }, { status: 502 });
  }
}
