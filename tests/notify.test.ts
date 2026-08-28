import { describe, expect, it, vi } from "vitest";
import { buildSaleMessage } from "@/lib/notify";
import { isValidBackupName } from "@/lib/backup";

describe("buildSaleMessage", () => {
  it("собирает уведомление о продаже номинала", () => {
    const text = buildSaleMessage({
      amountKzt: 18000,
      itemLabel: "Сертификат на сумму 18 000 ₸",
      salonLine: "Алматы, ул. Розыбакиева 247",
      toName: "Айгерим",
        serial: "WR005",
      orderId: "abc123",
    });
    expect(text).toContain("Новая продажа");
    expect(text).toContain("18");
    expect(text).toContain("Айгерим");
    expect(text).toContain("WR005");
    expect(text).not.toContain("вручную");
  });

  it("помечает ручной выпуск", () => {
    const text = buildSaleMessage({
      amountKzt: 30000,
      itemLabel: "Программа «Sanuk»",
      salonLine: "Астана",
      toName: "Тест",
      serial: null,
      orderId: "x",
      manual: true,
    });
    expect(text).toContain("вручную");
    expect(text).not.toContain("Серийник");
  });
});

describe("isValidBackupName", () => {
  it("принимает штатные имена и режет всё остальное", () => {
    expect(isValidBackupName("imbir-20260715-183000")).toBe(true);
    expect(isValidBackupName("imbir-20260715-183000.dump")).toBe(false);
    expect(isValidBackupName("../../etc/passwd")).toBe(false);
    expect(isValidBackupName("imbir-2026-bad")).toBe(false);
    expect(isValidBackupName("")).toBe(false);
  });
});

describe("адреса для уведомления о продаже", () => {
  it("разбирает несколько адресов и отбрасывает мусор", async () => {
    const { notifyEmails } = await import("@/lib/notify");
    expect(notifyEmails({ email: "a@b.kz, c@d.kz" })).toEqual([
      "a@b.kz",
      "c@d.kz",
    ]);
    expect(notifyEmails({ email: "a@b.kz; c@d.kz  e@f.kz" })).toEqual([
      "a@b.kz",
      "c@d.kz",
      "e@f.kz",
    ]);
    expect(notifyEmails({ email: "не-адрес" })).toEqual([]);
  });

  it("без настройки берёт адрес менеджера из окружения", async () => {
    const { notifyEmails } = await import("@/lib/notify");
    vi.stubEnv("MANAGER_EMAIL", "manager@imbir.kz");
    expect(notifyEmails({})).toEqual(["manager@imbir.kz"]);
    expect(notifyEmails({ email: "  " })).toEqual(["manager@imbir.kz"]);
    vi.unstubAllEnvs();
  });
});

describe("карточка продажи для менеджера", () => {
  const base = {
    amountKzt: 36000,
    itemLabel: "Программа «Karuna»",
    salonLine: "Астана, Мәңгілік Ел 29/2",
    toName: "Галия",
    serial: "WM9006",
    orderId: "cmt9abc",
  };

  it("несёт всё, что нужно менеджеру", () => {
    const text = buildSaleMessage({
      ...base,
      designName: "Улыбок",
      fromName: "Алия",
      message: "С днём рождения!",
      buyerEmail: "aliya@mail.kz",
      recipientEmail: "galiya@mail.kz",
      paid: true,
      paidLabel: "27.08.2026, 10:54",
      paymentLabel: "Kaspi",
      certUrl: "https://new.imbir.kz/ru/success?token=abc",
      adminUrl: "https://new.imbir.kz/admin/orders/cmt9abc",
    });
    for (const part of [
      "36 000 ₸",
      "✅ Оплачено",
      "Kaspi",
      "27.08.2026, 10:54",
      "WM9006",
      "Karuna",
      "Мәңгілік Ел",
      "Улыбок",
      "Алия",
      "Галия",
      "С днём рождения!",
      "aliya@mail.kz",
      "galiya@mail.kz",
      "cmt9abc",
      "success?token=abc",
      "admin/orders",
    ]) {
      expect(text, part).toContain(part);
    }
  });

  it("отмечает, что получателя не указывали", () => {
    const text = buildSaleMessage({ ...base, buyerEmail: "a@b.kz" });
    expect(text).toContain("дарит сам");
  });

  it("показывает номинал отдельно, когда была скидка", () => {
    const withPromo = buildSaleMessage({ ...base, amountKzt: 30600, faceKzt: 36000 });
    expect(withPromo).toContain("30 600 ₸");
    expect(withPromo).toContain("Номинал сертификата: 36 000 ₸");
    // Без скидки лишней строки быть не должно.
    const plain = buildSaleMessage({ ...base, faceKzt: 36000 });
    expect(plain).not.toContain("Номинал сертификата");
  });

  it("влезает в подпись Telegram — иначе файл уйдёт без карточки", () => {
    const text = buildSaleMessage({
      ...base,
      designName: "Улыбок",
      fromName: "Алия",
      message: "x".repeat(120),
      buyerEmail: "aliya@mail.kz",
      recipientEmail: "galiya@mail.kz",
      paid: true,
      paidLabel: "27.08.2026, 10:54",
      paymentLabel: "Банковская карта",
      certUrl: "https://new.imbir.kz/ru/success?token=cmt9qzilo000027pdf0opbgvc",
      adminUrl: "https://new.imbir.kz/admin/orders/cmt9qzilo000027pdf0opbgvc",
    });
    expect(text.length).toBeLessThanOrEqual(1024);
  });
});

describe("скидка в уведомлении о продаже", () => {
  const base = {
    itemLabel: "Сертификат на сумму 100 ₸",
    salonLine: "Астана, Мәңгілік Ел 29/2",
    toName: "Тест",
    serial: "WM9007",
    orderId: "cmt9abc",
  };

  it("называет промокод и его размер, а не просто «со скидкой»", () => {
    const text = buildSaleMessage({
      ...base,
      amountKzt: 70,
      faceKzt: 100,
      promo: { code: "ZHADINA", kind: "percent", value: 30 },
    });
    expect(text).toContain("Номинал сертификата: 100 ₸");
    expect(text).toContain("Скидка: промокод ZHADINA (30%) — −30 ₸");
    // Прежняя формулировка не отвечала на вопрос «по какому коду».
    expect(text).not.toContain("(со скидкой)");
  });

  it("для скидки фиксированной суммой показывает сумму", () => {
    const text = buildSaleMessage({
      ...base,
      amountKzt: 31000,
      faceKzt: 36000,
      promo: { code: "VESNA", kind: "fixed", value: 5000 },
    });
    expect(text).toContain("Скидка: промокод VESNA (5 000 ₸) — −5 000 ₸");
  });

  it("скидка без промокода не выдумывает код", () => {
    const text = buildSaleMessage({ ...base, amountKzt: 70, faceKzt: 100 });
    expect(text).toContain("Скидка: −30 ₸");
    expect(text).not.toContain("промокод");
  });

  it("без скидки строки о ней нет вовсе", () => {
    const text = buildSaleMessage({ ...base, amountKzt: 100, faceKzt: 100 });
    expect(text).not.toContain("Скидка");
    expect(text).not.toContain("Номинал сертификата");
  });
});
