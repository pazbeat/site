/** Блокировка перебора паролей админки (PRD §9.3): 5 попыток → 15 минут. */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export function isLocked(
  user: { lockedUntil: Date | null },
  now: Date = new Date(),
): boolean {
  return user.lockedUntil !== null && user.lockedUntil > now;
}

/** Состояние счётчиков после очередной неудачной попытки. */
export function nextLockState(
  failedAttempts: number,
  now: Date = new Date(),
): { failedAttempts: number; lockedUntil: Date | null } {
  const attempts = failedAttempts + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedAttempts: 0, // после разблокировки счёт заново
      lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
    };
  }
  return { failedAttempts: attempts, lockedUntil: null };
}
