import { describe, expect, it } from "vitest";
import {
  MIN_VISITS_FOR_RATE,
  buildChannelReport,
  channelLabel,
  summarize,
  totals,
  type ChannelInput,
} from "@/lib/sources";

const row = (o: Partial<ChannelInput> & { channel: string }): ChannelInput => ({
  visits: 0,
  builders: 0,
  orders: 0,
  revenueKzt: 0,
  ...o,
});

describe("отчёт по каналам", () => {
  it("считает конверсию, средний чек и выручку на сотню заходов", () => {
    const [r] = buildChannelReport([
      row({ channel: "instagram", visits: 200, builders: 50, orders: 10, revenueKzt: 300_000 }),
    ]);
    expect(r.conversionPct).toBeCloseTo(5);
    expect(r.avgCheckKzt).toBe(30_000);
    expect(r.revenuePer100Kzt).toBe(150_000);
    expect(r.label).toBe("Instagram");
  });

  // Ради этого порог и заведён: иначе случайная покупка при двух заходах
  // выносит канал на первое место и владелец вложит туда бюджет.
  it("на малых числах не показывает конверсию — это был бы шум", () => {
    const [r] = buildChannelReport([
      row({ channel: "tiktok", visits: 2, orders: 1, revenueKzt: 45_000 }),
    ]);
    expect(r.conversionPct).toBeNull();
    expect(r.revenuePer100Kzt).toBeNull();
    expect(r.orders).toBe(1);
    expect(r.revenueKzt).toBe(45_000);
  });

  it("порог достоверности — ровно заявленный", () => {
    const below = buildChannelReport([
      row({ channel: "google", visits: MIN_VISITS_FOR_RATE - 1, orders: 1 }),
    ]);
    const at = buildChannelReport([
      row({ channel: "google", visits: MIN_VISITS_FOR_RATE, orders: 1 }),
    ]);
    expect(below[0].conversionPct).toBeNull();
    expect(at[0].conversionPct).not.toBeNull();
  });

  // Заходы дедуплицируются раз в сутки, заказы — нет: постоянный покупатель
  // даёт один заход и два заказа. Это не поломка счётчика.
  it("конверсия выше ста процентов зажимается и помечается", () => {
    const [r] = buildChannelReport([
      row({ channel: "email", visits: 40, orders: 60, revenueKzt: 100_000 }),
    ]);
    expect(r.conversionPct).toBe(100);
    expect(r.conversionOverflow).toBe(true);
  });

  it("шумные строки уходят в конец, достоверные — по отдаче", () => {
    const rows = buildChannelReport([
      row({ channel: "tiktok", visits: 3, orders: 1, revenueKzt: 90_000 }),
      row({ channel: "google", visits: 100, orders: 5, revenueKzt: 150_000 }),
      row({ channel: "instagram", visits: 100, orders: 10, revenueKzt: 400_000 }),
    ]);
    expect(rows.map((r) => r.channel)).toEqual(["instagram", "google", "tiktok"]);
  });

  it("канал без покупок остаётся в таблице — это тоже ответ", () => {
    const [r] = buildChannelReport([row({ channel: "yandex", visits: 500, builders: 20 })]);
    expect(r.orders).toBe(0);
    expect(r.conversionPct).toBe(0);
    expect(r.revenuePer100Kzt).toBe(0);
  });

  it("неизвестный канал не ломает подпись", () => {
    expect(channelLabel("выдумка")).toBe("выдумка");
  });
});

describe("итоги", () => {
  it("складывают все строки", () => {
    const t = totals(
      buildChannelReport([
        row({ channel: "google", visits: 100, builders: 30, orders: 5, revenueKzt: 150_000 }),
        row({ channel: "instagram", visits: 100, builders: 40, orders: 5, revenueKzt: 250_000 }),
      ]),
    );
    expect(t.visits).toBe(200);
    expect(t.builders).toBe(70);
    expect(t.orders).toBe(10);
    expect(t.revenueKzt).toBe(400_000);
    expect(t.conversionPct).toBeCloseTo(5);
  });
});

describe("вывод одной фразой", () => {
  it("молчит, пока данных мало — это честнее выдуманного победителя", () => {
    expect(
      summarize(buildChannelReport([row({ channel: "google", visits: 40, orders: 2, revenueKzt: 60_000 })])),
    ).toBeNull();
    expect(summarize([])).toBeNull();
  });

  it("называет лидера, когда разрыв заметный", () => {
    const text = summarize(
      buildChannelReport([
        row({ channel: "instagram", visits: 200, orders: 20, revenueKzt: 600_000 }),
        row({ channel: "google", visits: 200, orders: 4, revenueKzt: 120_000 }),
      ]),
    );
    expect(text).toContain("Instagram");
    expect(text).toContain("раза больше");
  });

  it("не объявляет победителя при близких цифрах", () => {
    const text = summarize(
      buildChannelReport([
        row({ channel: "instagram", visits: 200, orders: 10, revenueKzt: 300_000 }),
        row({ channel: "google", visits: 200, orders: 10, revenueKzt: 290_000 }),
      ]),
    );
    expect(text).toContain("примерно одинаков");
  });
});
