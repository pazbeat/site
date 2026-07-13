import { describe, expect, it } from "vitest";
import { isLocked, nextLockState, MAX_FAILED_ATTEMPTS } from "@/lib/admin/lockout";
import { sanitizeLegalHtml } from "@/lib/admin/sanitize";

describe("lockout (PRD §9.3)", () => {
  it("блокирует после 5 неудачных попыток на 15 минут", () => {
    let attempts = 0;
    let state = nextLockState(attempts);
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      expect(state.lockedUntil).toBeNull();
      attempts = state.failedAttempts;
      state = nextLockState(attempts);
    }
    // 5-я попытка → блокировка
    expect(state.lockedUntil).not.toBeNull();
    expect(state.failedAttempts).toBe(0);
    const minutes =
      (state.lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it("isLocked учитывает срок блокировки", () => {
    expect(isLocked({ lockedUntil: null })).toBe(false);
    expect(
      isLocked({ lockedUntil: new Date(Date.now() + 60_000) }),
    ).toBe(true);
    expect(
      isLocked({ lockedUntil: new Date(Date.now() - 60_000) }),
    ).toBe(false);
  });
});

describe("sanitizeLegalHtml (PRD §9.2)", () => {
  it("вырезает скрипты и обработчики событий", () => {
    const dirty = `<p onclick="alert(1)">Текст</p><script>alert(2)</script>`;
    const clean = sanitizeLegalHtml(dirty);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).toContain("Текст");
  });

  it("оставляет разрешённые теги и добавляет rel к ссылкам", () => {
    const clean = sanitizeLegalHtml(
      '<h2>Оферта</h2><p>См. <a href="https://imbir.kz">сайт</a></p>',
    );
    expect(clean).toContain("<h2>");
    expect(clean).toContain('href="https://imbir.kz"');
    expect(clean).toContain("noopener");
  });

  it("отбрасывает javascript:-ссылки", () => {
    const clean = sanitizeLegalHtml('<a href="javascript:alert(1)">x</a>');
    expect(clean).not.toContain("javascript:");
  });
});
