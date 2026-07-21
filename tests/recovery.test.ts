import { describe, expect, it } from "vitest";
import { dueRecovery } from "@/lib/recovery";

const MIN = 60_000;
const now = new Date("2026-07-21T12:00:00+05:00");
const ago = (ms: number) => new Date(now.getTime() - ms);

const base = {
  status: "expired",
  buyerEmail: "buyer@mail.kz",
  recoveryEmailSentAt: null as Date | null,
  createdAt: ago(40 * MIN), // протух ~10 мин назад (TTL 30 мин)
  certificatesCount: 0,
};

describe("dueRecovery", () => {
  it("свежий протухший заказ без письма — пора", () => {
    expect(dueRecovery(base, now)).toBe(true);
  });

  it("ещё pending (не протух) — не шлём", () => {
    expect(dueRecovery({ ...base, status: "pending" }, now)).toBe(false);
  });

  it("оплачен — не шлём", () => {
    expect(dueRecovery({ ...base, status: "paid" }, now)).toBe(false);
  });

  it("письмо уже отправлено — не дублируем", () => {
    expect(dueRecovery({ ...base, recoveryEmailSentAt: ago(5 * MIN) }, now)).toBe(
      false,
    );
  });

  it("по заказу уже есть сертификат — не шлём", () => {
    expect(dueRecovery({ ...base, certificatesCount: 1 }, now)).toBe(false);
  });

  it("нет email покупателя — не шлём", () => {
    expect(dueRecovery({ ...base, buyerEmail: null }, now)).toBe(false);
  });

  it("старше 24 часов — не шлём (окно дожима)", () => {
    expect(dueRecovery({ ...base, createdAt: ago(25 * 60 * MIN) }, now)).toBe(
      false,
    );
  });

  it("в пределах 24 часов — пора", () => {
    expect(dueRecovery({ ...base, createdAt: ago(23 * 60 * MIN) }, now)).toBe(
      true,
    );
  });
});
