import { describe, expect, it } from "vitest";
import { buildDigest, type Discrepancy } from "@/lib/reconcile";
import { tierWindow } from "@/lib/kaspi-poller";
import { describePaymentEvent } from "@/lib/payment-events";

const NOW = new Date("2026-09-04T12:00:00Z");
const ORIGIN = "https://new.imbir.kz";

function item(over: Partial<Discrepancy> = {}): Discrepancy {
  return {
    kind: "paid_without_certificate",
    id: "cmt9t7g75000128qz",
    label: "Заказ cmt9t7g75000128qz · 20000 ₸ · buyer@mail.kz",
    since: new Date("2026-09-04T09:00:00Z"),
    ...over,
  };
}

describe("buildDigest", () => {
  it("молчит, когда расхождений нет", () => {
    // Ежедневное «всё хорошо» перестают читать через неделю, и вместе с ним
    // перестают читать то письмо, где действительно что-то не так.
    expect(buildDigest([], ORIGIN)).toBeNull();
  });

  it("ведёт на карточку заказа, когда оплачено без сертификата", () => {
    const text = buildDigest([item()], ORIGIN) ?? "";
    expect(text).toContain("Оплачено, сертификата нет");
    expect(text).toContain(`${ORIGIN}/admin/orders/cmt9t7g75000128qz`);
  });

  it("группирует по видам и считает каждый", () => {
    const text =
      buildDigest(
        [
          item(),
          item({ id: "o2", label: "Заказ o2" }),
          item({
            kind: "altegio_stuck",
            id: "c1",
            label: "Сертификат WM9012 · failed · попыток 3",
            detail: "Gift card with such number already exists",
          }),
        ],
        ORIGIN,
      ) ?? "";
    expect(text).toContain("Оплачено, сертификата нет — 2");
    expect(text).toContain("Не записано в Altegio — 1");
    // Причина обязана быть в письме: без неё менеджер идёт смотреть логи
    expect(text).toContain("Gift card with such number already exists");
  });

  it("не вываливает сотню строк — обрезает и говорит, сколько скрыто", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      item({ id: `o${i}`, label: `Заказ o${i}` }),
    );
    const text = buildDigest(many, ORIGIN) ?? "";
    expect(text).toContain("Оплачено, сертификата нет — 25");
    expect(text).toContain("и ещё 5");
  });
});

describe("tierWindow", () => {
  it("свежая ступень — последние два часа", () => {
    const w = tierWindow("fresh", NOW);
    expect(w.gte.toISOString()).toBe("2026-09-04T10:00:00.000Z");
    expect(w.lte.toISOString()).toBe(NOW.toISOString());
  });

  it("ступени стыкуются без дыр: конец одной равен началу следующей", () => {
    // Дыра между окнами означала бы заказы, которые не опрашивает никто —
    // ровно тот случай, ради которого ступени и заведены.
    const fresh = tierWindow("fresh", NOW);
    const recent = tierWindow("recent", NOW);
    const tail = tierWindow("tail", NOW);
    expect(recent.lte.toISOString()).toBe(fresh.gte.toISOString());
    expect(tail.lte.toISOString()).toBe(recent.gte.toISOString());
  });

  it("хвост тянется на две недели — оплата на вторые сутки не теряется", () => {
    const tail = tierWindow("tail", NOW);
    expect(tail.gte.toISOString()).toBe("2026-08-21T12:00:00.000Z");
  });
});

describe("describePaymentEvent", () => {
  it("называет и что случилось, и кто это узнал", () => {
    // Менеджеру важнее второе: «оплата подтверждена вручную из админки» и
    // «оплата подтверждена фоновой проверкой» — это два разных разговора с
    // покупателем.
    expect(describePaymentEvent({ kind: "paid", source: "manual" })).toBe(
      "Оплата подтверждена · вручную из админки",
    );
    expect(describePaymentEvent({ kind: "reversed", source: "reconcile" })).toBe(
      "Платёж отменён банком · сверка",
    );
  });

  it("незнакомое значение показывает как есть, а не прячет", () => {
    // Журнал переживёт добавление нового вида события: пустая строка вместо
    // подписи была бы хуже сырого слова.
    expect(describePaymentEvent({ kind: "settled", source: "acquirer" })).toBe(
      "settled · acquirer",
    );
  });
});
