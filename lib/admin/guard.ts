import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { auth } from "../auth";

export type AdminRole = "superadmin" | "manager";

export type AdminSession = {
  id: string;
  email: string;
  role: AdminRole;
};

/** Требует любую админ-сессию; иначе — на логин (дублирует proxy на уровне страницы). */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    role: session.user.role,
  };
}

/** Требует роль superadmin (контент, пользователи, правовые тексты). */
export async function requireSuperadmin(): Promise<AdminSession> {
  const admin = await requireAdmin();
  if (admin.role !== "superadmin") redirect("/admin");
  return admin;
}

/**
 * Аудит-лог (PRD §6.8, §9.10): все мутации в админке. ПД и коды в diff
 * не пишем — только идентификаторы и изменённые бизнес-поля.
 */
export async function auditLog(params: {
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  diff?: unknown;
  ip?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor: params.actor,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      diff: (params.diff as object) ?? undefined,
      ip: params.ip ?? null,
    },
  });
}
