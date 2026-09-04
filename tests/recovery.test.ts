import { describe, expect, it } from "vitest";
import { dueRecovery } from "@/lib/recovery";

const MIN = 60_000;
const now = new Date("2026-07-21T12:00:00+05:00");
const ago = (ms: number) => new Date(now.getTime() - ms);

const base = {
  status: "expired",
  buyerEmail: "buyer@mail.kz",
  recoveryEmailSentAt: null as Date | null,
  // Протух давно и уже вне окна возможной оплаты (см. MIN_AGE_MS: два часа)
  createdAt: ago(180 * MIN),
  certificatesCount: 0,
};

describe("dueRecovery", () => {
  it("протухший заказ вне окна оплаты, без письма — пора", () => {
    expect(dueRecovery(base, now)).toBe(true);
  });

  it("только что протух — молчим: оплата могла ещё не дойти", () => {
    // Заказ протухает через 30 минут, но фоновый добор оплат воскрешает его
    // и через час, и на следующий день. Письмо «вы не завершили покупку»
    // человеку, который заплатил, — худшее, что мы можем ему написать.
    expect(dueRecovery({ ...base, createdAt: ago(40 * MIN) }, now)).toBe(false);
    expect(dueRecovery({ ...base, createdAt: ago(119 * MIN) }, now)).toBe(false);
    expect(dueRecovery({ ...base, createdAt: ago(121 * MIN) }, now)).toBe(true);
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
