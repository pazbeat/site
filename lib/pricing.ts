import "server-only";
import { prisma } from "./db";
import { getCustomAmountBounds } from "./data";

/**
 * Серверное ценообразование заказа (PRD §5.3): цена — ТОЛЬКО из БД.
 * Общий источник для создания заказа и для превью промокода, чтобы
 * сумма считалась в одном месте.
 */

export type PricingItem =
  | { type: "program"; programOptionId: number }
  | { type: "nominal"; nominalId?: number; customAmountKzt?: number };

export type PricingError =
  | "salon_not_found"
  | "option_not_found"
  | "program_unavailable_in_city"
  | "nominal_not_found"
  | "amount_out_of_bounds";

export type PricingResult =
  | { ok: true; amountKzt: number; itemSnapshot: Record<string, unknown> }
  | { ok: false; error: PricingError };

/**
 * Определяет номинальную сумму сертификата и снапшот позиции по выбору
 * покупателя. Проверяет активность салона/программы/номинала и доступность
 * программы в городе филиала.
 */
export async function resolveOrderAmount(
  salonId: number,
  item: PricingItem,
): Promise<PricingResult> {
  const salon = await prisma.salon.findFirst({
    where: { id: salonId, active: true },
  });
  if (!salon) return { ok: false, error: "salon_not_found" };

  if (item.type === "program") {
    const option = await prisma.programOption.findUnique({
      where: { id: item.programOptionId },
      include: { program: true },
    });
    if (!option || !option.program.active) {
      return { ok: false, error: "option_not_found" };
    }
    if (
      option.program.cities.length > 0 &&
      !option.program.cities.includes(salon.city)
    ) {
      return { ok: false, error: "program_unavailable_in_city" };
    }
    return {
      ok: true,
      amountKzt: option.priceKzt,
      itemSnapshot: {
        type: "program",
        programOptionId: option.id,
        programId: option.programId,
      },
    };
  }

  if (item.nominalId) {
    const nominal = await prisma.nominal.findFirst({
      where: { id: item.nominalId, active: true },
    });
    if (!nominal) return { ok: false, error: "nominal_not_found" };
    return {
      ok: true,
      amountKzt: nominal.amountKzt,
      itemSnapshot: { type: "nominal" },
    };
  }

  const custom = item.customAmountKzt;
  if (typeof custom !== "number") {
    return { ok: false, error: "amount_out_of_bounds" };
  }
  const bounds = await getCustomAmountBounds();
  if (custom < bounds.min || custom > bounds.max) {
    return { ok: false, error: "amount_out_of_bounds" };
  }
  return { ok: true, amountKzt: custom, itemSnapshot: { type: "nominal" } };
}
