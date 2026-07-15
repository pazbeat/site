import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { NotifySettings } from "@/components/admin/notify-settings";
import { getSaleNotifySettings } from "@/lib/notify";

export default async function AdminSettingsPage() {
  const admin = await requireSuperadmin();
  const cfg = await getSaleNotifySettings();

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Настройки">
      <NotifySettings
        enabled={cfg.enabled ?? false}
        whatsapp={cfg.whatsapp ?? ""}
        telegramChatId={cfg.telegramChatId ?? ""}
        telegramTokenSet={Boolean(process.env.TELEGRAM_BOT_TOKEN)}
      />
    </AdminChrome>
  );
}
