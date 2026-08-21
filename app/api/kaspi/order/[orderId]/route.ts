import { NextResponse } from "next/server";
import { bridgeAuthorized, bridgeToken, describeOrder } from "@/lib/kaspi-bridge";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Проверка заказа для Kaspi (через мост на бэкенде действующего сайта).
 * Отвечает видом услуги и суммой — тем, что приложение Kaspi показывает
 * покупателю до оплаты. Подробности схемы — в `lib/kaspi-bridge.ts`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  if (!bridgeToken()) {
    return NextResponse.json({ error: "bridge_disabled" }, { status: 503 });
  }
  const limited = rateLimit(`kaspi-bridge:${clientIp(request)}`, 120);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!bridgeAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const order = await describeOrder(orderId.trim());
  if (!order) {
    // Не 404: для Kaspi «заказа нет» — обычный ответ, а не сбой
    return NextResponse.json({ found: false });
  }
  return NextResponse.json({ found: true, ...order });
}
