import "server-only";
import { verify as argon2Verify } from "@node-rs/argon2";
import { verifySync as totpVerify } from "otplib";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import { isLocked, nextLockState } from "./lockout";

export type AdminIdentity = {
  id: string;
  email: string;
  role: "superadmin" | "manager";
};

/**
 * 2FA обязательна по PRD §9.3. Флаг ADMIN_2FA_DISABLED=1 отключает
 * проверку TOTP — ТОЛЬКО для локальной разработки. В production НЕ ставить
 * (проверяется в lib/env-check при старте). Код 2FA остаётся полностью
 * рабочим — при снятии флага всё возвращается без изменений.
 */
export function is2faDisabled(): boolean {
  // Явный флаг демо-сервера: отключает 2FA даже в production.
  // ТОЛЬКО для временного превью — на боевом НЕ ставить.
  if (process.env.PREVIEW_NO_2FA === "1") return true;
  return (
    process.env.ADMIN_2FA_DISABLED === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

/**
 * Проверка учётных данных админа (PRD §9.3): argon2id-пароль +
 * ОБЯЗАТЕЛЬНЫЙ TOTP + lockout. Возвращает null при любой ошибке,
 * не раскрывая, что именно не совпало.
 */
export async function verifyAdminCredentials(
  email: string,
  password: string,
  totp: string,
): Promise<AdminIdentity | null> {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user || !user.active) return null;
  if (isLocked(user)) return null;

  let ok = false;
  try {
    ok = await argon2Verify(user.passwordHash, password);
  } catch {
    ok = false;
  }

  // TOTP обязателен: пользователь без секрета войти не может.
  // При ADMIN_2FA_DISABLED (только dev) шаг TOTP пропускается.
  if (ok && !is2faDisabled()) {
    const secret = user.totpSecret ? decryptSecret(user.totpSecret) : null;
    ok = Boolean(
      secret && totpVerify({ token: totp.trim(), secret }).valid,
    );
  }

  if (!ok) {
    const next = nextLockState(user.failedAttempts);
    await prisma.adminUser.update({
      where: { id: user.id },
      data: next,
    });
    return null;
  }

  if (user.failedAttempts > 0 || user.lockedUntil) {
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  return { id: String(user.id), email: user.email, role: user.role };
}
