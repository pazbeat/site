import { describe, expect, it } from "vitest";
import { dueReminderMilestone, daysLeft } from "@/lib/reminders";

const DAY = 24 * 60 * 60_000;
const now = new Date("2026-07-13T09:00:00+05:00");
const inDays = (n: number) => new Date(now.getTime() + n * DAY);

describe("dueReminderMilestone", () => {
  const fresh = { reminder30SentAt: null, reminder7SentAt: null };

  it("более 30 дней — не пора", () => {
    expect(
      dueReminderMilestone({ validUntil: inDays(45), ...fresh }, now),
    ).toBeNull();
  });

  it("в пределах 30 дней — веха 30", () => {
    expect(
      dueReminderMilestone({ validUntil: inDays(20), ...fresh }, now),
    ).toBe("30");
  });

  it("в пределах 7 дней — веха 7 приоритетна", () => {
    expect(
      dueReminderMilestone({ validUntil: inDays(5), ...fresh }, now),
    ).toBe("7");
  });

  it("30-дневное уже отправлено — не дублируем", () => {
    expect(
      dueReminderMilestone(
        { validUntil: inDays(20), reminder30SentAt: now, reminder7SentAt: null },
        now,
      ),
    ).toBeNull();
  });

  it("30 отправлено, но вошли в 7 дней — шлём веху 7", () => {
    expect(
      dueReminderMilestone(
        { validUntil: inDays(5), reminder30SentAt: inDays(-15), reminder7SentAt: null },
        now,
      ),
    ).toBe("7");
  });

  it("обе вехи отправлены — ничего", () => {
    expect(
      dueReminderMilestone(
        { validUntil: inDays(5), reminder30SentAt: now, reminder7SentAt: now },
        now,
      ),
    ).toBeNull();
  });

  it("уже истёк — напоминать поздно", () => {
    expect(
      dueReminderMilestone({ validUntil: inDays(-1), ...fresh }, now),
    ).toBeNull();
  });
});

describe("daysLeft", () => {
  it("округляет вверх, минимум 1", () => {
    expect(daysLeft(inDays(7), now)).toBe(7);
    expect(daysLeft(new Date(now.getTime() + 0.5 * DAY), now)).toBe(1);
    expect(daysLeft(new Date(now.getTime() + 6.2 * DAY), now)).toBe(7);
  });
});
