import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { BackupPanel } from "@/components/admin/backup-panel";
import { listBackups } from "@/lib/backup";

export default async function AdminBackupPage() {
  const admin = await requireSuperadmin();
  const backups = (await listBackups()).map((b) => ({
    name: b.name,
    sizeMb: (b.sizeBytes / 1024 / 1024).toFixed(2),
    createdAt: b.createdAt.toISOString().slice(0, 16).replace("T", " "),
    hasUploads: b.hasUploads,
  }));

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Бэкапы">
      <BackupPanel backups={backups} />
    </AdminChrome>
  );
}
