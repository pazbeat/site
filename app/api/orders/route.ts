import { NextResponse, type NextRequest } from "next/server";
import { AB_COOKIE, isAbVariant } from "@/lib/ab";
import { prisma } from "@/lib/db";
import { getCurrentLegalVersionIds } from "@/lib/data";
import { resolveOrderAmount } from "@/lib/pricing";
import { evaluatePromoCode } from "@/lib/promo";
import { getProvider } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { orderSchema } from "@/lib/validation";

/**
 * Создание заказа (PRD §5.3): статус pending, цена — ТОЛЬКО из БД,
 * согласие с версиями документов записывается атомарно с заказом.
 * Сертификат создаётся позже — после подтверждения оплаты вебхуком.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limited = rateLimit(`orders:${ip}`);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Цена — источник истины только сервер/БД (PRD §5.3)
  const pricing = await resolveOrderAmount(input.salonId, input.item);
  if (!pricing.ok) {
    return NextResponse.json({ error: pricing.error }, { status: 400 });
  }
  // Номинал сертификата (баланс получателя) — без учёта промо-скидки
  const faceAmountKzt = pricing.amountKzt;
  const itemSnapshot = pricing.itemSnapshot;

  const design = await prisma.design.findFirst({
    where: { id: input.designId, active: true },
  });
  if (!design) {
    return NextResponse.json({ error: "design_not_found" }, { status: 400 });
  }

  // Промокод (Фаза 2): пересчёт скидки на сервере. Скидка уменьшает
  // сумму ОПЛАТЫ (order.amountKzt), номинал сертификата не меняется.
  // Невалидный промокод не блокирует заказ — просто без скидки.
  let payableKzt = faceAmountKzt;
  let promoId: number | null = null;
  if (input.promoCode) {
    const promo = await evaluatePromoCode(input.promoCode, faceAmountKzt);
    if (promo.ok) {
      payableKzt = promo.payableKzt;
      promoId = promo.promoId;
    }
  }

  // Согласие: версии актуальных правовых документов + IP/UA/ts (PRD §5.2)
  const versions = await getCurrentLegalVersionIds();
  const consent = {
    versions,
    ip,
    ua: request.headers.get("user-agent") ?? "",
    ts: new Date().toISOString(),
  };

  // Группа A/B-теста цен, в которой покупатель видел номиналы (PRD §10)
  const abRaw = request.cookies.get(AB_COOKIE)?.value;

  const order = await prisma.order.create({
    data: {
      salonId: input.salonId,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone ?? null,
      // Сумма к оплате — со скидкой промокода (если применён)
      amountKzt: payableKzt,
      promoId,
      paymentProvider: input.provider ?? null,
      abVariant: isAbVariant(abRaw) ? abRaw : null,
      consent,
      item: {
        ...itemSnapshot,
        // Номинал сертификата — полная стоимость (баланс получателя)
        amountKzt: faceAmountKzt,
        designId: design.id,
        toName: input.toName,
        fromName: input.fromName,
        message: input.message,
        delivery: input.delivery,
        locale: input.locale,
      },
    },
  });

  // Создание платежа у провайдера; недоступность оплаты не отменяет заказ
  let paymentUrl: string | null = null;
  const provider = getProvider(input.provider ?? "kaspi");
  if (provider?.isConfigured()) {
    const origin = new URL(request.url).origin;
    try {
      const payment = await provider.createPayment({
        orderId: order.id,
        amountKzt: payableKzt,
        description: `Imbir Thai Spa: подарочный сертификат (заказ ${order.id})`,
        successUrl: `${origin}/${input.locale}/success?token=${order.successToken}`,
        webhookUrl: `${origin}/api/payments/${provider.id}/webhook`,
        locale: input.locale,
      });
      paymentUrl = payment.redirectUrl;
    } catch (error) {
      console.error("payment_init_failed", {
        orderId: order.id,
        provider: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json(
    { orderId: order.id, amountKzt: payableKzt, status: order.status, paymentUrl },
    { status: 201 },
  );
}
