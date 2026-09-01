import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Страница /admin/backup показывает две разные вещи из одного каталога:
 * копии, снятые кнопкой (.dump), и ночные копии по расписанию (.sql.gz).
 * Раньше видны были только первые, а каталог был прибит к папке приложения —
 * в контейнере она принадлежит root, и страница падала на EACCES.
 */

let dir: string;
let backup: typeof import("@/lib/backup");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "imbir-backup-"));
  // Каталог читается на импорте модуля — подменяем до него.
  process.env.BACKUP_DIR = dir;
  await writeFile(path.join(dir, "imbir-20260901-120000.dump"), "dump");
  await writeFile(path.join(dir, "imbir-20260901-120000-uploads.tar"), "tar");
  await writeFile(path.join(dir, "imbir-20260830-094500.sql.gz"), "gz");
  await writeFile(path.join(dir, "мусор.txt"), "x");
  await writeFile(path.join(dir, "imbir-bad.dump"), "x");
  // Порядок в списке — по времени файла, а не по имени: ночные копии
  // называются по времени сервера, ручные — по времени Алматы, и сортировка
  // по строке перемешала бы их со сдвигом в пять часов.
  const t1 = new Date("2026-08-30T09:45:00Z");
  const t2 = new Date("2026-09-01T12:00:00Z");
  await utimes(path.join(dir, "imbir-20260830-094500.sql.gz"), t1, t1);
  await utimes(path.join(dir, "imbir-20260901-120000.dump"), t2, t2);
  backup = await import("@/lib/backup");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("listBackups", () => {
  it("показывает и ручные копии, и ночные, свежие сверху", async () => {
    const rows = await backup.listBackups();
    expect(rows.map((r) => `${r.name}:${r.kind}`)).toEqual([
      "imbir-20260901-120000:panel",
      "imbir-20260830-094500:nightly",
    ]);
    expect(rows[0].hasUploads).toBe(true);
    expect(rows[1].hasUploads).toBe(false);
  });
});

describe("resolveBackupFile", () => {
  it("находит файл независимо от формата", async () => {
    const panel = await backup.resolveBackupFile("imbir-20260901-120000");
    expect(panel?.filename).toBe("imbir-20260901-120000.dump");
    const nightly = await backup.resolveBackupFile("imbir-20260830-094500");
    expect(nightly?.filename).toBe("imbir-20260830-094500.sql.gz");
  });

  it("не отдаёт ничего по кривому имени и по отсутствующей копии", async () => {
    expect(await backup.resolveBackupFile("../../etc/passwd")).toBeNull();
    expect(await backup.resolveBackupFile("imbir-20200101-000000")).toBeNull();
  });
});

describe("restoreBackup", () => {
  it("про ночную копию объясняет, а не врёт «файл не найден»", async () => {
    await expect(
      backup.restoreBackup("imbir-20260830-094500"),
    ).rejects.toThrow(/ночная копия/i);
  });
});

describe("deleteBackup", () => {
  it("удаляет ночную копию тоже", async () => {
    await backup.deleteBackup("imbir-20260830-094500");
    expect(await readdir(dir)).not.toContain("imbir-20260830-094500.sql.gz");
  });
});
