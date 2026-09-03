import { describe, expect, it } from "vitest";
import {
  buildPassFields,
  formatValidUntil,
  generatePassSerial,
  passVoidReason,
  shouldPushUpdate,
  type PassSource,
} from "@/lib/wallet/pass";

const NOW = new Date("2026-08-22T06:00:00Z");

function cert(over: Partial<PassSource> = {}): PassSource {
  return {
    code: "WM0042",
    holder: "Айгерим",
    fromName: "Мадина",
    amountKzt: 20000,
    balanceKzt: 20000,
    status: "active",
    validUntil: new Date("2026-11-18T00:00:00Z"),
    salonName: "Имбирь на Мәңгілік Ел",
    programName: null,
    ...over,
  };
}

describe("buildPassFields", () => {
  it("номинальный сертификат: заголовок — сумма, номинал второй строкой не дублируется", () => {
    const f = buildPassFields(cert(), NOW);
    expect(f.headline).toBe("20 000 ₸");
    expect(f.balanceLabel).toBe("20 000 ₸");
    expect(f.ofAmountLabel).toBeNull();
    expect(f.voided).toBe(false);
  });

  it("частично погашенный показывает и остаток, и номинал", () => {
    const f = buildPassFields(cert({ balanceKzt: 7000, status: "partially_used" }), NOW);
    expect(f.balanceLabel).toBe("7 000 ₸");
    expect(f.ofAmountLabel).toBe("из 20 000 ₸");
  });

  it("сертификат на программу озаглавлен программой", () => {
    const f = buildPassFields(
      cert({ amountKzt: null, balanceKzt: 35000, programName: "Энергия Сиама" }),
      NOW,
    );
    expect(f.headline).toBe("Энергия Сиама");
    expect(f.ofAmountLabel).toBeNull();
  });

  it("в штрихкод уходит тот же номер, что напечатан", () => {
    const f = buildPassFields(cert({ code: "IMB-F3GW-F3U8" }), NOW);
    expect(f.barcodeMessage).toBe("IMB-F3GW-F3U8");
    expect(f.code).toBe("IMB-F3GW-F3U8");
  });

  it("отрицательный остаток из CRM не протекает на карту", () => {
    const f = buildPassFields(cert({ balanceKzt: -500 }), NOW);
    expect(f.balanceKzt).toBe(0);
    expect(f.balanceLabel).toBe("0 ₸");
  });
});

describe("passVoidReason", () => {
  it("действующий сертификат не серый", () => {
    expect(passVoidReason(cert(), NOW)).toBeNull();
  });

  it.each([
    ["used", "Погашен"],
    ["expired", "Срок истёк"],
    ["refunded", "Возврат"],
    ["blocked", "Заблокирован"],
  ] as const)("статус %s → «%s»", (status, reason) => {
    expect(passVoidReason(cert({ status }), NOW)).toBe(reason);
  });

  it("срок вышел, а крон ещё не добежал — карта уже серая", () => {
    const src = cert({ status: "active", validUntil: new Date("2026-08-21T00:00:00Z") });
    expect(passVoidReason(src, NOW)).toBe("Срок истёк");
  });

  it("нулевой остаток при active — сверка опередила смену статуса", () => {
    expect(passVoidReason(cert({ balanceKzt: 0 }), NOW)).toBe("Погашен");
  });

  it("наше решение важнее истёкшего срока", () => {
    const src = cert({ status: "blocked", validUntil: new Date("2026-08-21T00:00:00Z") });
    expect(passVoidReason(src, NOW)).toBe("Заблокирован");
  });

  it("ровно в момент истечения карта уже недействительна", () => {
    const validUntil = new Date(NOW);
    expect(passVoidReason(cert({ validUntil }), NOW)).toBe("Срок истёк");
  });
});

describe("shouldPushUpdate", () => {
  const fields = buildPassFields(cert({ balanceKzt: 7000, status: "partially_used" }), NOW);

  it("первое обновление после выпуска шлём всегда", () => {
    expect(shouldPushUpdate({ balanceKzt: null, voided: false }, fields)).toBe(true);
  });

  it("остаток изменился — будим устройство", () => {
    expect(shouldPushUpdate({ balanceKzt: 20000, voided: false }, fields)).toBe(true);
  });

  it("сверка ничего не изменила — молчим", () => {
    expect(shouldPushUpdate({ balanceKzt: 7000, voided: false }, fields)).toBe(false);
  });

  it("карта посерела при том же остатке — всё равно будим", () => {
    const voided = buildPassFields(cert({ balanceKzt: 7000, status: "blocked" }), NOW);
    expect(shouldPushUpdate({ balanceKzt: 7000, voided: false }, voided)).toBe(true);
  });
});

describe("generatePassSerial", () => {
  it("не равен коду сертификата и не повторяется", () => {
    const serials = new Set(Array.from({ length: 10_000 }, generatePassSerial));
    expect(serials.size).toBe(10_000);
    for (const s of serials) expect(s).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("formatValidUntil", () => {
  it("печатает дату по времени салона, а не UTC", () => {
    // 23:00 UTC — это уже следующий день в Алматы (UTC+5)
    expect(formatValidUntil(new Date("2026-11-17T23:00:00Z"))).toBe("18.11.2026");
  });
});
