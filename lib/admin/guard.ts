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

/**
 * Проверяет, что за сессией стоит живой активный пользователь.
 * Сессия — JWT на 12 часов и в БД не смотрит, поэтому без этой проверки
 * отключённый (или удалённый) админ сохранял бы доступ до истечения токена,
 * а смена роли применялась бы только после перелогина.
 */
export async function loadActiveAdmin(
  sessionUserId: string | undefined,
): Promise<AdminSession | null> {
  const id = Number(sessionUserId);
  if (!Number.isInteger(id)) return null;
  const user = await prisma.adminUser.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, active: true },
  });
  if (!user?.active) return null;
  return { id: String(user.id), email: user.email, role: user.role };
}

/** Требует любую админ-сессию; иначе — на логин (дублирует proxy на уровне страницы). */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await auth();
  const admin = await loadActiveAdmin(session?.user?.id);
  if (!admin) {
    // ВРЕМЕННАЯ МЕТКА
    console.error("[guard] нет админа", {
      сессия: session ? JSON.stringify(session.user) : "null",
    });
    redirect("/admin/login?src=guard");
  }
  return admin;
}

/**
 * Требует роль superadmin: пользователи, правовые тексты, настройки,
 * бэкапы, аудит-лог, A/B-тест. Это то, что менеджеру не доверяем —
 * оно меняет юридические обязательства, доступы и сохранность данных.
 */
export async function requireSuperadmin(): Promise<AdminSession> {
  const admin = await requireAdmin();
  if (admin.role !== "superadmin") redirect("/admin");
  return admin;
}

/**
 * Требует права на справочники магазина: программы и цены, номиналы,
 * дизайны, промокоды, города и филиалы. Доступно и менеджеру — это его
 * ежедневная работа, а не настройка системы. Отдельная функция, чтобы
 * расширение прав менеджера не задело разделы под requireSuperadmin.
 */
export async function requireCatalogEditor(): Promise<AdminSession> {
  return requireAdmin();
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
