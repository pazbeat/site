import "server-only";
import { prisma } from "./db";
import { getCustomAmountBounds } from "./data";
import { resolveGoodId, resolveProgramTitle } from "./altegio/catalog";

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
  | "amount_out_of_bounds"
  /** Сумма/вариант допустимы, но выпустить сертификат в CRM нечем. */
  | "amount_not_available";

export type PricingResult =
  | { ok: true; amountKzt: number; itemSnapshot: Record<string, unknown> }
  | { ok: false; error: PricingError };

/**
 * Определяет номинальную сумму сертификата и снапшот позиции по выбору
 * покупателя. Проверяет активность салона/программы/номинала и доступность
 * программы в городе филиала.
 */
/**
 * Можно ли вообще выпустить такой сертификат в Altegio.
 *
 * Баланс сертификата задаётся ТИПОМ товара, а не суммой, которую мы передаём,
 * поэтому под каждую сумму нужен свой товар — свободного ввода в Altegio нет.
 * Поле «своя сумма» принимает любое число в диапазоне, а товары заведены под
 * два десятка конкретных значений: заказ на 19 000 ₸ оплачивался бы, письмо
 * уходило бы, а в CRM сертификата не появлялось — кассиру нечего погашать.
 * Поймано сверкой каталога 2026-08-26.
 *
 * Пропускаем только то, что реально выпускается. Салон без привязки к Altegio
 * не проверяем: там выпуск и так идёт запасным путём.
 */
function issuable(
  altegioLocationId: number | null,
  nominalKzt: number,
  programTitle: string | null,
): boolean {
  if (!altegioLocationId) return true;
  return resolveGoodId(altegioLocationId, { nominalKzt, programTitle }) !== null;
}

export async function resolveOrderAmount(
  salonId: number,
  item: PricingItem,
  options: {
    /**
     * Требовать, чтобы такой номинал/вариант можно было выпустить в CRM.
     *
     * Для покупателя — обязательно: иначе он заплатит за сертификат, которого
     * в кассе не появится. Для ручного выпуска из админки — нет: там бывает
     * противоположная задача, завести у себя сертификат, который в Altegio
     * уже существует (продан старым сайтом), и второй раз его туда не пишут.
     */
    requireIssuable?: boolean;
    /** Разрешить нерасторгуемые филиалы (не продаются на витрине). */
    allowNonOrderable?: boolean;
  } = {},
): Promise<PricingResult> {
  const requireIssuable = options.requireIssuable ?? true;
  // orderable обязателен наравне с active: филиалы вроде Экибастуза и
  // Жезказгана показываются на витрине, но НЕ заведены в Altegio — заказ
  // на них создавал бы сертификат, который негде погасить. Конструктор их
  // и так не предлагает, но проверка интерфейса обходится запросом напрямую.
  const salon = await prisma.salon.findFirst({
    where: {
      id: salonId,
      active: true,
      ...(options.allowNonOrderable ? {} : { orderable: true }),
    },
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
    const nameRu = (option.program.names as { ru?: string }).ru ?? "";
    const programTitle = nameRu
      ? resolveProgramTitle(nameRu, option.priceKzt)
      : null;
    if (requireIssuable && !issuable(salon.altegioLocationId, option.priceKzt, programTitle)) {
      return { ok: false, error: "amount_not_available" };
    }
    return {
      ok: true,
      amountKzt: option.priceKzt,
      itemSnapshot: {
        type: "program",
        programOptionId: option.id,
        programId: option.programId,
        // Товар фиксируем в момент заказа: цена варианта в админке может
        // измениться, а выпустить надо ровно то, что купили.
        altegioProgramTitle: programTitle,
      },
    };
  }

  if (item.nominalId) {
    const nominal = await prisma.nominal.findFirst({
      where: { id: item.nominalId, active: true },
    });
    if (!nominal) return { ok: false, error: "nominal_not_found" };
    if (requireIssuable && !issuable(salon.altegioLocationId, nominal.amountKzt, null)) {
      return { ok: false, error: "amount_not_available" };
    }
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
  if (requireIssuable && !issuable(salon.altegioLocationId, custom, null)) {
    return { ok: false, error: "amount_not_available" };
  }
  return { ok: true, amountKzt: custom, itemSnapshot: { type: "nominal" } };
}
