import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupRateLimits,
  rateLimit,
  resetRateLimits,
} from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimits();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("пропускает первые 5 запросов и блокирует шестой (PRD §5.1.4)", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("ip1").ok).toBe(true);
    }
    const blocked = rateLimit("ip1");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
      expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  it("окна независимы для разных ключей", () => {
    for (let i = 0; i < 5; i++) rateLimit("ip1");
    expect(rateLimit("ip1").ok).toBe(false);
    expect(rateLimit("ip2").ok).toBe(true);
  });

  it("после истечения окна счётчик сбрасывается", () => {
    for (let i = 0; i < 6; i++) rateLimit("ip1");
    expect(rateLimit("ip1").ok).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(rateLimit("ip1").ok).toBe(true);
  });

  it("cleanup удаляет истёкшие окна", () => {
    rateLimit("ip1");
    vi.advanceTimersByTime(61_000);
    cleanupRateLimits();
    // после очистки лимит снова доступен
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("ip1").ok).toBe(true);
    }
  });
});
