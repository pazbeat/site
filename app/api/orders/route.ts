import { NextResponse, type NextRequest } from "next/server";
import { AB_COOKIE, isAbVariant } from "@/lib/ab";
import { SRC_COOKIE, parseSourceCookie } from "@/lib/source";
import { currentAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/db";
import { buildConsentRecord } from "@/lib/consent";
import { resolveOrderAmount } from "@/lib/pricing";
import { evaluatePromoCode } from "@/lib/promo";
import { getProvider } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { generateOrderRef } from "@/lib/order-ref";
import { publicOrigin } from "@/lib/site-url";
import { orderSchema } from "@/lib/validation";
import { reportFailure } from "@/lib/alerts";

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

  // Демо-оплата — только администратору, и проверяем это ДО создания заказа,
  // чтобы не оставлять в базе мусор от чужой попытки. На отсутствие кнопки в
  // интерфейсе не полагаемся: запрос можно послать и мимо страницы.
  if (input.provider === "mock" && !(await currentAdmin())) {
    return NextResponse.json({ error: "forbidden_provider" }, { status: 403 });
  }

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

  // Согласие: редакции документов в языке покупателя + отпечатки + IP/UA/ts
  // (PRD §5.2). Собирается на сервере — см. lib/consent.ts.
  const consent = await buildConsentRecord({
    ip,
    ua: request.headers.get("user-agent") ?? "",
    locale: input.locale,
  });

  // Группа A/B-теста цен, в которой покупатель видел номиналы (PRD §10)
  const abRaw = request.cookies.get(AB_COOKIE)?.value;

  // Откуда пришёл покупатель — переносим из куки в сам заказ. С клиента эти
  // значения не приходят и в orderSchema их нет: подделать источник продажи
  // из браузера нельзя.
  const src = parseSourceCookie(request.cookies.get(SRC_COOKIE)?.value);

  // Короткий номер для Kaspi: длинный внутренний приложение отбрасывает по
  // маске, не дойдя до бэкенда. Совпадения практически невероятны, но проверку
  // делаем — колонка уникальна, и падать на ней при оформлении нельзя.
  let kaspiRef = generateOrderRef();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = await prisma.order.findUnique({ where: { kaspiRef } });
    if (!taken) break;
    kaspiRef = generateOrderRef();
  }

  const order = await prisma.order.create({
    data: {
      kaspiRef,
      salonId: input.salonId,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone ?? null,
      // Сумма к оплате — со скидкой промокода (если применён)
      amountKzt: payableKzt,
      promoId,
      // Демо-провайдера в перечислении БД нет — оставляем пустым
      paymentProvider: input.provider === "mock" ? null : (input.provider ?? null),
      abVariant: isAbVariant(abRaw) ? abRaw : null,
      srcFirst: src?.first ?? null,
      srcLast: src?.last ?? null,
      srcCampaign: src?.campaign || null,
      clickIdType: src?.clickIdType || null,
      clickId: src?.clickId || null,
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

  // Создание платежа у провайдера; недоступность оплаты не отменяет заказ.
  // Если выбранный способ не настроен (например, банк ещё не выдал креды для
  // оплаты картой), уводим на Kaspi, а не оставляем покупателя без ссылки.
  let paymentUrl: string | null = null;
  const requested = getProvider(input.provider ?? "kaspi");
  const provider =
    requested?.isConfigured() === true ? requested : getProvider("kaspi");
  if (provider?.isConfigured()) {
    const origin = publicOrigin(request);
    try {
      const payment = await provider.createPayment({
        orderId: order.id,
        // Kaspi показываем короткий номер — длинный он не принимает
        publicRef: order.kaspiRef ?? order.id,
        amountKzt: payableKzt,
        description: `Imbir Thai Spa: подарочный сертификат (заказ ${order.id})`,
        successUrl: `${origin}/${input.locale}/success?token=${order.successToken}`,
        webhookUrl: `${origin}/api/payments/${provider.id}/webhook`,
        locale: input.locale,
      });
      paymentUrl = payment.redirectUrl;
      // На заказе должен стоять тот способ, которым реально платят.
      // Демо-провайдера в перечислении БД нет — его не записываем.
      if (
        provider.id !== input.provider &&
        (provider.id === "kaspi" || provider.id === "forte")
      ) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentProvider: provider.id },
        });
      }
    } catch (error) {
      void reportFailure("оплата: не удалось создать платёж", error, {
        заказ: order.id,
        способ: provider.id,
        сумма: payableKzt,
      });
    }
  }

  return NextResponse.json(
    { orderId: order.id, amountKzt: payableKzt, status: order.status, paymentUrl },
    { status: 201 },
  );
}
