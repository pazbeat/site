"use server";

import { revalidatePath } from "next/cache";
import { hash } from "@node-rs/argon2";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import { encryptSecret } from "@/lib/crypto";

/**
 * Управление пользователями админки (PRD §6.6). Пароли — argon2id, TOTP-секрет
 * шифруется AES-GCM и показывается ОДИН раз QR-кодом: восстановить его потом
 * нельзя, только перевыпустить.
 *
 * Везде, где меняется роль/активность, стоит защита от самоблокировки: нельзя
 * разжаловать или отключить самого себя и нельзя убрать последнего
 * суперадмина — иначе в админку никто не войдёт.
 */

const MIN_PASSWORD = 12;

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Неверный email"),
  password: z
    .string()
    .min(MIN_PASSWORD, `Пароль не короче ${MIN_PASSWORD} символов`),
  role: z.enum(["superadmin", "manager"]),
});

/** otpauth-URI + QR (data URL) для приложения-аутентификатора. */
async function totpSetup(email: string, secret: string) {
  const uri = generateURI({ issuer: "Imbir Admin", label: email, secret });
  return { uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 260 }) };
}

export async function createAdminAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля." };
  }
  const { email, password, role } = parsed.data;

  const exists = await prisma.adminUser.findUnique({ where: { email } });
  if (exists) return { error: `Пользователь ${email} уже есть.` };

  const secret = generateSecret();
  const created = await prisma.adminUser.create({
    data: {
      email,
      passwordHash: await hash(password),
      role,
      totpSecret: encryptSecret(secret),
    },
  });
  await auditLog({
    actor: admin.email,
    action: "admin_user.create",
    entity: "admin_user",
    entityId: String(created.id),
    diff: { email, role },
  });
  revalidatePath("/admin/users");

  const { uri, qr } = await totpSetup(email, secret);
  return { ok: true, totp: { email, uri, qr } };
}

const idSchema = z.coerce.number().int().positive();

/** Смена пароля: TOTP не трогаем — приложение-аутентификатор продолжает работать. */
export async function resetPasswordAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = idSchema.safeParse(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!id.success) return { error: "Пользователь не найден." };
  if (password.length < MIN_PASSWORD) {
    return { error: `Пароль не короче ${MIN_PASSWORD} символов.` };
  }

  const user = await prisma.adminUser.findUnique({ where: { id: id.data } });
  if (!user) return { error: "Пользователь не найден." };

  await prisma.adminUser.update({
    where: { id: id.data },
    data: {
      passwordHash: await hash(password),
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
  await auditLog({
    actor: admin.email,
    action: "admin_user.reset_password",
    entity: "admin_user",
    entityId: String(id.data),
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `Пароль для ${user.email} изменён.` };
}

/** Перевыпуск TOTP: старый секрет становится недействительным. */
export async function resetTotpAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Пользователь не найден." };

  const user = await prisma.adminUser.findUnique({ where: { id: id.data } });
  if (!user) return { error: "Пользователь не найден." };

  const secret = generateSecret();
  await prisma.adminUser.update({
    where: { id: id.data },
    data: { totpSecret: encryptSecret(secret), failedAttempts: 0, lockedUntil: null },
  });
  await auditLog({
    actor: admin.email,
    action: "admin_user.reset_totp",
    entity: "admin_user",
    entityId: String(id.data),
  });
  revalidatePath("/admin/users");

  const { uri, qr } = await totpSetup(user.email, secret);
  return { ok: true, totp: { email: user.email, uri, qr } };
}

/** Сколько активных суперадминов останется, если тронуть этого. */
async function otherActiveSuperadmins(exceptId: number): Promise<number> {
  return prisma.adminUser.count({
    where: { role: "superadmin", active: true, id: { not: exceptId } },
  });
}

export async function changeRoleAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = idSchema.safeParse(formData.get("id"));
  const role = z.enum(["superadmin", "manager"]).safeParse(formData.get("role"));
  if (!id.success || !role.success) return { error: "Проверьте роль." };

  const user = await prisma.adminUser.findUnique({ where: { id: id.data } });
  if (!user) return { error: "Пользователь не найден." };
  if (user.role === role.data) return { ok: true, message: "Роль не изменилась." };

  if (String(user.id) === admin.id && role.data !== "superadmin") {
    return { error: "Нельзя понизить самого себя — попросите другого суперадмина." };
  }
  if (
    user.role === "superadmin" &&
    role.data === "manager" &&
    (await otherActiveSuperadmins(user.id)) === 0
  ) {
    return { error: "Это последний суперадмин — сначала назначьте другого." };
  }

  await prisma.adminUser.update({ where: { id: id.data }, data: { role: role.data } });
  await auditLog({
    actor: admin.email,
    action: "admin_user.change_role",
    entity: "admin_user",
    entityId: String(id.data),
    diff: { from: user.role, to: role.data },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `${user.email}: роль → ${role.data}.` };
}

export async function toggleAdminActiveAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Пользователь не найден." };

  const user = await prisma.adminUser.findUnique({ where: { id: id.data } });
  if (!user) return { error: "Пользователь не найден." };

  if (user.active) {
    if (String(user.id) === admin.id) {
      return { error: "Нельзя отключить самого себя." };
    }
    if (user.role === "superadmin" && (await otherActiveSuperadmins(user.id)) === 0) {
      return { error: "Это последний активный суперадмин — отключать нельзя." };
    }
  }

  await prisma.adminUser.update({
    where: { id: id.data },
    data: { active: !user.active, failedAttempts: 0, lockedUntil: null },
  });
  await auditLog({
    actor: admin.email,
    action: user.active ? "admin_user.deactivate" : "admin_user.activate",
    entity: "admin_user",
    entityId: String(id.data),
  });
  revalidatePath("/admin/users");
  return {
    ok: true,
    message: user.active ? `${user.email} отключён.` : `${user.email} включён.`,
  };
}

/** Снять блокировку после перебора пароля, не дожидаясь 15 минут. */
export async function unlockAdminAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Пользователь не найден." };

  await prisma.adminUser.update({
    where: { id: id.data },
    data: { failedAttempts: 0, lockedUntil: null },
  });
  await auditLog({
    actor: admin.email,
    action: "admin_user.unlock",
    entity: "admin_user",
    entityId: String(id.data),
  });
  revalidatePath("/admin/users");
  return { ok: true, message: "Блокировка снята." };
}
