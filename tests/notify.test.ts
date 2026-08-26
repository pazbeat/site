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
      deliveryLine: "Email a@b.kz",
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
      deliveryLine: "WhatsApp +77001234567",
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
