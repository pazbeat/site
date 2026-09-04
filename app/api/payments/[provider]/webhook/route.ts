import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fulfillOrder } from "@/lib/certificates";
import { getWebhookProvider } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Вебхук подтверждения оплаты (PRD §5.3, §9.7):
 * подпись → сверка суммы с заказом на сервере → идемпотентное исполнение.
 * Невалидная подпись → 400, сертификат не создаётся.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  // Ограничение частоты. Подпись здесь и так обязательна, но эндпоинт открыт
  // наружу и принимает любой номер заказа: без лимита им можно перебирать
  // подписи сколько угодно, и это не будет стоить перебирающему ничего.
  const limited = rateLimit(`payment-webhook:${clientIp(request)}`, 60);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

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
    "webhook",
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
