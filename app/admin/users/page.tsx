import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { UsersAdmin, type AdminUserRow } from "@/components/admin/users-admin";
import { prisma } from "@/lib/db";

export default async function AdminUsersPage() {
  const admin = await requireSuperadmin();
  const users = await prisma.adminUser.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  // Пароли и TOTP-секреты на клиент не отдаём — только факт наличия 2FA
  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    active: u.active,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    hasTotp: Boolean(u.totpSecret),
    createdAt: u.createdAt.toISOString(),
    isSelf: String(u.id) === admin.id,
  }));

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Пользователи админки">
      <p className="mb-5 max-w-3xl text-sm text-brand-purple-950/60">
        Доступ в админку. Двухфакторная аутентификация обязательна: QR
        показывается один раз при создании — сохраните его сразу, иначе только
        перевыпуск. Удаления нет намеренно: на пользователей ссылаются версии
        правовых текстов и аудит-лог, поэтому вместо удаления — «Отключить».
      </p>
      <UsersAdmin users={rows} />
    </AdminChrome>
  );
}
