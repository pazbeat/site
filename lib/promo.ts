import "server-only";
import { prisma } from "./db";
import type { Promo, PromoKind } from "./generated/prisma/client";

/**
 * Промокоды (PRD §5.4, Фаза 2). Семантика: скидка покупателю на СУММУ
 * ОПЛАТЫ. Номинал сертификата (баланс получателя) не уменьшается —
 * получатель гасит полную стоимость. Цена и скидка считаются ТОЛЬКО
 * на сервере (клиент показывает превью, не источник истины).
 */

/** Форма поля Promo.limits (Json). Все поля необязательны. */
export type PromoLimits = {
  /** Максимум оплаченных применений; null/отсутствует — без лимита */
  maxUses?: number | null;
  /** ISO-дата начала действия */
  validFrom?: string | null;
  /** ISO-дата окончания действия (включительно по моменту) */
  validUntil?: string | null;
  /** Минимальная сумма заказа для применения, тенге */
  minAmountKzt?: number | null;
};

export type PromoError =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "min_amount"
  | "max_uses";

export type PromoEvaluation =
  | { ok: true; promoId: number; code: string; discountKzt: number; payableKzt: number }
  | { ok: false; error: PromoError };

/** Нормализация кода: без пробелов, верхний регистр. */
export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Скидка в целых тенге для суммы amountKzt. Процент округляется
 * математически; скидка не отрицательна и не больше самой суммы.
 */
export function computeDiscount(
  kind: PromoKind,
  value: number,
  amountKzt: number,
): number {
  const raw = kind === "percent" ? Math.round((amountKzt * value) / 100) : value;
  return Math.max(0, Math.min(raw, amountKzt));
}

/**
 * Проверка ограничений промокода (чистая функция — тестируется без БД).
 * Возвращает код ошибки или null, если применять можно.
 */
export function checkPromoLimits(
  limits: PromoLimits,
  ctx: { amountKzt: number; now: Date; usedCount: number },
): PromoError | null {
  if (limits.validFrom && ctx.now < new Date(limits.validFrom)) {
    return "not_started";
  }
  if (limits.validUntil && ctx.now > new Date(limits.validUntil)) {
    return "expired";
  }
  if (
    typeof limits.minAmountKzt === "number" &&
    ctx.amountKzt < limits.minAmountKzt
  ) {
    return "min_amount";
  }
  if (
    typeof limits.maxUses === "number" &&
    limits.maxUses > 0 &&
    ctx.usedCount >= limits.maxUses
  ) {
    return "max_uses";
  }
  return null;
}

/**
 * Полная серверная проверка промокода для суммы заказа. Считает уже
 * использованные применения как число ОПЛАЧЕННЫХ заказов с этим промо.
 */
export async function evaluatePromoCode(
  rawCode: string,
  amountKzt: number,
  now: Date = new Date(),
): Promise<PromoEvaluation> {
  const code = normalizePromoCode(rawCode);
  const promo: Promo | null = await prisma.promo.findUnique({ where: { code } });
  if (!promo) return { ok: false, error: "not_found" };
  if (!promo.active) return { ok: false, error: "inactive" };

  const limits = (promo.limits ?? {}) as PromoLimits;
  const usedCount =
    typeof limits.maxUses === "number" && limits.maxUses > 0
      ? await prisma.order.count({
          where: { promoId: promo.id, status: "paid" },
        })
      : 0;

  const error = checkPromoLimits(limits, { amountKzt, now, usedCount });
  if (error) return { ok: false, error };

  const discountKzt = computeDiscount(promo.kind, promo.value, amountKzt);
  return {
    ok: true,
    promoId: promo.id,
    code: promo.code,
    discountKzt,
    payableKzt: amountKzt - discountKzt,
  };
}
