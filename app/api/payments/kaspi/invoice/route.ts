import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { KaspiPayProvider } from "@/lib/payments/kaspi";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { reportFailure } from "@/lib/alerts";

/**
 * Платёжная ссылка Kaspi для заказа + готовый QR-код к ней.
 *
 * Номер заказа для Kaspi — это наш собственный `order.id`. Так номер в чеке
 * покупателя совпадает с номером в админке, и оплату можно сверить глазами;
 * отдельный случайный идентификатор такую сверку ломал.
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

  const payRef = order.paymentId ?? order.id;
  if (!order.paymentId) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentId: payRef, paymentProvider: "kaspi" },
    });
  }

  const kaspi = new KaspiPayProvider();
  try {
    const invoice = await kaspi.createInvoice({
      payqrOrderId: payRef,
      amountKzt: order.amountKzt,
      name: "Подарочный сертификат Imbir Thai Spa",
    });
    const qrDataUrl = await QRCode.toDataURL(invoice.payUrl, {
      margin: 1,
      width: 320,
      color: { dark: "#4D295D", light: "#FFFFFF" },
    });
    return NextResponse.json({
      payUrl: invoice.payUrl,
      qrDataUrl,
      // Страница по-разному объясняет ожидание: сама подтвердится оплата
      // или её подтвердит администратор.
      autoConfirm: kaspi.hasAutomaticConfirmation(),
    });
  } catch (error) {
    void reportFailure("Kaspi: не выдана ссылка на оплату", error, {
      заказ: order.id,
      сумма: order.amountKzt,
    });
    return NextResponse.json({ error: "invoice_failed" }, { status: 502 });
  }
}
