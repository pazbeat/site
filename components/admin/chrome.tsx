import Link from "next/link";
import { signOut } from "@/lib/auth";
import { NavShell } from "./nav-shell";
import { Toaster } from "./toast";
import type { AdminRole } from "@/lib/admin/guard";

const NAV: Array<{ href: string; label: string; roles: AdminRole[] }> = [
  { href: "/admin", label: "Дашборд", roles: ["superadmin", "manager"] },
  { href: "/admin/sales", label: "Продажи", roles: ["superadmin", "manager"] },
  { href: "/admin/orders", label: "Заказы", roles: ["superadmin", "manager"] },
  {
    href: "/admin/certificates",
    label: "Сертификаты",
    roles: ["superadmin", "manager"],
  },
  {
    href: "/admin/scheduled",
    label: "Отложенные отправки",
    roles: ["superadmin", "manager"],
  },
  {
    href: "/admin/corporate",
    label: "Корп. заявки",
    roles: ["superadmin", "manager"],
  },
  { href: "/admin/salons", label: "Города и филиалы", roles: ["superadmin"] },
  { href: "/admin/programs", label: "Программы", roles: ["superadmin"] },
  { href: "/admin/nominals", label: "Номиналы", roles: ["superadmin"] },
  { href: "/admin/designs", label: "Дизайны", roles: ["superadmin"] },
  { href: "/admin/promos", label: "Промокоды", roles: ["superadmin"] },
  { href: "/admin/experiments", label: "A/B-тест цен", roles: ["superadmin"] },
  { href: "/admin/legal", label: "Правовые тексты", roles: ["superadmin"] },
  { href: "/admin/users", label: "Пользователи", roles: ["superadmin"] },
  { href: "/admin/audit", label: "Аудит-лог", roles: ["superadmin"] },
];

export function AdminChrome({
  email,
  role,
  title,
  children,
}: Readonly<{
  email: string;
  role: AdminRole;
  title: string;
  children: React.ReactNode;
}>) {
  const nav = NAV.filter((item) => item.roles.includes(role));

  return (
    <NavShell
      title={title}
      sidebar={
        <>
          <div className="mb-8 px-2 font-display text-lg">
            IMBIR <span className="text-brand-gold">·</span> Admin
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/login" });
            }}
            className="mt-4"
          >
            <div className="mb-2 px-2 text-xs break-all text-white/60">
              {email}
            </div>
            <button
              type="submit"
              className="w-full rounded-lg border border-white/25 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
            >
              Выйти
            </button>
          </form>
        </>
      }
    >
      {children}
      <Toaster />
    </NavShell>
  );
}
