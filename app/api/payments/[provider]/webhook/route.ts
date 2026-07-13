import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fulfillOrder } from "@/lib/certificates";
import { getWebhookProvider } from "@/lib/payments";

/**
 * Вебхук подтверждения оплаты (PRD §5.3, §9.7):
 * подпись → сверка суммы с заказом на сервере → идемпотентное исполнение.
 * Невалидная подпись → 400, сертификат не создаётся.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;
  const provider = getWebhookProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }

  const rawBody = await request.text();
  const verification = await provider.verifyWebhook(rawBody, request);
  if (!verification.ok) {
    // Не раскрываем деталей проверки подписи наружу
    return NextResponse.json({ error: "invalid_webhook" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: verification.orderId },
    select: { amountKzt: true },
  });
  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 400 });
  }
  // Сверка суммы: вебхук с неверной суммой не исполняет заказ (PRD §9.7)
  if (order.amountKzt !== verification.amountKzt) {
    return NextResponse.json({ error: "amount_mismatch" }, { status: 400 });
  }

  const result = await fulfillOrder(
    verification.orderId,
    verification.externalId,
  );
  if (result.status === "not_found" || result.status === "not_payable") {
    return NextResponse.json({ error: result.status }, { status: 400 });
  }

  const response = provider.webhookResponse();
  return new NextResponse(response.body, {
    status: 200,
    headers: { "Content-Type": response.contentType },
  });
}
