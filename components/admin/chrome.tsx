import Link from "next/link";
import { signOut } from "@/lib/auth";
import type { AdminRole } from "@/lib/admin/guard";

const NAV: Array<{ href: string; label: string; roles: AdminRole[] }> = [
  { href: "/admin", label: "Дашборд", roles: ["superadmin", "manager"] },
  { href: "/admin/orders", label: "Заказы", roles: ["superadmin", "manager"] },
  { href: "/admin/scheduled", label: "Отложенные отправки", roles: ["superadmin", "manager"] },
  { href: "/admin/corporate", label: "Корп. заявки", roles: ["superadmin", "manager"] },
  { href: "/admin/programs", label: "Программы", roles: ["superadmin"] },
  { href: "/admin/nominals", label: "Номиналы", roles: ["superadmin"] },
  { href: "/admin/designs", label: "Дизайны", roles: ["superadmin"] },
  { href: "/admin/promos", label: "Промокоды", roles: ["superadmin"] },
  { href: "/admin/legal", label: "Правовые тексты", roles: ["superadmin"] },
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
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col bg-brand-purple px-4 py-6 text-white sm:flex">
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
          <div className="mb-2 px-2 text-xs break-all text-white/60">{email}</div>
          <button
            type="submit"
            className="w-full rounded-lg border border-white/25 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            Выйти
          </button>
        </form>
      </aside>
      <main className="flex-1 px-5 py-8 sm:px-8">
        <h1 className="mb-6 font-display text-2xl font-semibold text-brand-purple">
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
