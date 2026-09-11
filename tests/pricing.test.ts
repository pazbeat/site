import { describe, expect, it, vi } from "vitest";

/**
 * Серверная цена заказа (lib/pricing.ts). Своей суммы на витрине больше нет
 * (решение заказчика 2026-09-11): покупатель выбирает только из списка
 * витрины филиала, и сервер обязан принимать ТОЛЬКО его — проверка
 * интерфейса обходится запросом напрямую. Ручной выпуск из админки — на
 * любую сумму: там заводят сертификаты, купленные мимо сайта.
 */

type SalonRow = {
  id: number;
  active: boolean;
  orderable: boolean;
  city: string;
  altegioLocationId: number | null;
};

const salons: SalonRow[] = [
  { id: 1, active: true, orderable: true, city: "Астана", altegioLocationId: 225022 },
  // Филиал без привязки к CRM (как новый филиал, заведённый в админке).
  { id: 2, active: true, orderable: true, city: "Астана", altegioLocationId: null },
  // Показан на витрине, но не продаётся (Жезказган, Экибастуз).
  { id: 3, active: true, orderable: false, city: "Жезказган", altegioLocationId: null },
];

vi.mock("../lib/db", () => ({
  prisma: {
    salon: {
      findFirst: async ({ where }: { where: { id: number; active: boolean; orderable?: boolean } }) =>
        salons.find(
          (s) =>
            s.id === where.id &&
            s.active === where.active &&
            (where.orderable === undefined || s.orderable === where.orderable),
        ) ?? null,
    },
    nominal: {
      findFirst: async ({ where }: { where: { id: number } }) =>
        where.id === 10 ? { id: 10, amountKzt: 50000, active: true } : null,
    },
    programOption: { findUnique: async () => null },
  },
}));
vi.mock("../lib/data", () => ({
  getCustomAmountBounds: async () => ({ min: 18000, max: 500000 }),
}));

const { resolveOrderAmount } = await import("../lib/pricing");

const amount = (customAmountKzt: number) =>
  ({ type: "nominal", customAmountKzt }) as const;

describe("resolveOrderAmount: покупатель выбирает только из списка витрины", () => {
  it("сумма из списка витрины филиала принимается", async () => {
    const r = await resolveOrderAmount(1, amount(25000));
    expect(r).toMatchObject({ ok: true, amountKzt: 25000 });
  });

  it("сумма с товаром в CRM, но вне списка витрины — отказ", async () => {
    // 39 000 есть в каталоге (выпускает программу), но витрина её не предлагает.
    expect(await resolveOrderAmount(1, amount(39000))).toEqual({
      ok: false,
      error: "amount_not_available",
    });
  });

  it("произвольная сумма — отказ", async () => {
    expect(await resolveOrderAmount(1, amount(19000))).toEqual({
      ok: false,
      error: "amount_not_available",
    });
  });

  it("филиал без привязки к CRM суммой по списку не продаёт", async () => {
    // Раньше issuable() пропускал такой филиал, и заказ на любую сумму в
    // границах оплачивался мимо CRM — кассиру нечего было погасить.
    expect(await resolveOrderAmount(2, amount(25000))).toEqual({
      ok: false,
      error: "amount_not_available",
    });
  });

  it("номинал из админки на таком филиале по-прежнему покупается", async () => {
    const r = await resolveOrderAmount(2, { type: "nominal", nominalId: 10 });
    expect(r).toMatchObject({ ok: true, amountKzt: 50000 });
  });

  it("сумма вне границ — своя ошибка", async () => {
    expect(await resolveOrderAmount(1, amount(10000))).toEqual({
      ok: false,
      error: "amount_out_of_bounds",
    });
  });

  it("непродаваемый филиал покупателю недоступен", async () => {
    expect(await resolveOrderAmount(3, amount(25000))).toEqual({
      ok: false,
      error: "salon_not_found",
    });
  });
});

describe("resolveOrderAmount: ручной выпуск из админки", () => {
  it("принимает любую сумму в границах, если продажу в CRM не пишут", async () => {
    const r = await resolveOrderAmount(1, amount(19000), {
      requireIssuable: false,
      allowNonOrderable: true,
      allowAnyAmount: true,
    });
    expect(r).toMatchObject({ ok: true, amountKzt: 19000 });
  });

  it("с записью в CRM требует товар под сумму", async () => {
    expect(
      await resolveOrderAmount(1, amount(19000), {
        requireIssuable: true,
        allowNonOrderable: true,
        allowAnyAmount: true,
      }),
    ).toEqual({ ok: false, error: "amount_not_available" });
    const r = await resolveOrderAmount(1, amount(39000), {
      requireIssuable: true,
      allowNonOrderable: true,
      allowAnyAmount: true,
    });
    expect(r).toMatchObject({ ok: true, amountKzt: 39000 });
  });

  it("выпускает на непродаваемый филиал без привязки к CRM", async () => {
    const r = await resolveOrderAmount(3, amount(19000), {
      requireIssuable: false,
      allowNonOrderable: true,
      allowAnyAmount: true,
    });
    expect(r).toMatchObject({ ok: true, amountKzt: 19000 });
  });
});
