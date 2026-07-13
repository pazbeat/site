import { NextResponse } from "next/server";
import { resolveOrderAmount } from "@/lib/pricing";
import { evaluatePromoCode } from "@/lib/promo";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { promoValidateSchema } from "@/lib/validation";

/**
 * Превью промокода для конструктора (Фаза 2). Сумма и скидка считаются
 * на сервере (клиент не источник истины). Rate limit — как для прочих
 * публичных POST (PRD §9.9). Реальное применение — в /api/orders.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`promo:${ip}`);
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

  const parsed = promoValidateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }
  const input = parsed.data;

  const pricing = await resolveOrderAmount(input.salonId, input.item);
  if (!pricing.ok) {
    return NextResponse.json({ error: pricing.error }, { status: 400 });
  }

  const promo = await evaluatePromoCode(input.promoCode, pricing.amountKzt);
  if (!promo.ok) {
    return NextResponse.json({ ok: false, reason: promo.error }, { status: 200 });
  }

  return NextResponse.json(
    {
      ok: true,
      code: promo.code,
      discountKzt: promo.discountKzt,
      payableKzt: promo.payableKzt,
    },
    { status: 200 },
  );
}
