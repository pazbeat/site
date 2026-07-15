import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadActiveAdmin } from "@/lib/admin/guard";
import { is2faDisabled } from "@/lib/admin/verify";
import { LoginForm } from "@/components/admin/login-form";

export default async function AdminLoginPage() {
  const session = await auth();
  // Проверяем пользователя в БД, а не только наличие токена: у отключённого
  // админа кука ещё жива, и без этого его крутило бы между /admin и логином
  if (await loadActiveAdmin(session?.user?.id)) redirect("/admin");
  const show2fa = !is2faDisabled();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-purple-100 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center font-display text-xl text-brand-purple">
          IMBIR <span className="text-brand-gold">·</span> Admin
        </div>
        <LoginForm show2fa={show2fa} />
      </div>
    </div>
  );
}
