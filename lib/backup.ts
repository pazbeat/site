import "server-only";
import { spawn } from "node:child_process";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, readdir, stat, unlink, access } from "node:fs/promises";
import path from "node:path";

/**
 * Бэкапы БД + загруженных картинок из админки (/admin/backup).
 *
 * Дамп: pg_dump --format=custom (сжатый, восстанавливается pg_restore).
 * Если бинарника pg_dump нет (dev на Windows) — фолбэк на
 * `docker exec <PG_CONTAINER>` (по умолчанию imbir-pg).
 * Схема pgboss исключается: восстановление старой очереди повторно
 * разослало бы старые сертификаты.
 *
 * Файлы лежат в ./backups (в .gitignore). Восстановление затирает текущие
 * данные — подтверждение в UI обязательно.
 */

/**
 * Куда складывать копии. В контейнере это подключённый том (BACKUP_DIR=
 * /backups), иначе ./backups рядом с проектом. Раньше путь был жёстко
 * прибит к каталогу приложения — а он принадлежит root, приложение работает
 * под другим пользователем, и вся страница падала на попытке создать папку
 * (EACCES /app/backups, поймано 2026-09-01).
 */
const BACKUP_DIR =
  process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), "backups");
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const NAME_RE = /^imbir-\d{8}-\d{6}$/;

export type BackupInfo = {
  name: string;
  sizeBytes: number;
  createdAt: Date;
  hasUploads: boolean;
  /**
   * panel — снят из админки, лежит форматом pg_dump и восстанавливается
   * отсюда же. nightly — ночная копия по расписанию (`scripts/backup-db.sh`),
   * обычный SQL в gzip. Панель их только показывает: восстановление такого
   * файла идёт через psql, и делать это вслепую из браузера не стоит.
   */
  kind: "panel" | "nightly";
};

let busy = false;

function dbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  return url;
}

/** user/db для docker-фолбэка — из DATABASE_URL. */
function parseDb(): { user: string; db: string } {
  const u = new URL(dbUrl());
  return { user: u.username || "postgres", db: u.pathname.slice(1) || "postgres" };
}

function run(
  cmd: string,
  args: string[],
  io: { stdoutTo?: string; stdinFrom?: string } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: [
        io.stdinFrom ? "pipe" : "ignore",
        io.stdoutTo ? "pipe" : "ignore",
        "pipe",
      ],
    });
    let stderr = "";
    child.stderr!.on("data", (d) => (stderr += d));
    if (io.stdoutTo) child.stdout!.pipe(createWriteStream(io.stdoutTo));
    if (io.stdinFrom) createReadStream(io.stdinFrom).pipe(child.stdin!);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 400)}`)),
    );
  });
}

/** Есть ли pg_dump/pg_restore локально; иначе — docker exec. */
async function hasLocalPgTools(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("pg_dump", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function pgContainer(): string {
  return process.env.PG_CONTAINER ?? "imbir-pg";
}

async function dumpDb(file: string): Promise<void> {
  if (await hasLocalPgTools()) {
    await run("pg_dump", [
      `--dbname=${dbUrl()}`,
      "--format=custom",
      "--exclude-schema=pgboss",
      `--file=${file}`,
    ]);
    return;
  }
  const { user, db } = parseDb();
  await run(
    "docker",
    ["exec", pgContainer(), "pg_dump", "-U", user, "-d", db, "--format=custom", "--exclude-schema=pgboss"],
    { stdoutTo: file },
  );
}

async function restoreDb(file: string): Promise<void> {
  const args = ["--clean", "--if-exists", "--no-owner"];
  if (await hasLocalPgTools()) {
    await run("pg_restore", [...args, `--dbname=${dbUrl()}`, file]);
    return;
  }
  const { user, db } = parseDb();
  await run(
    "docker",
    ["exec", "-i", pgContainer(), "pg_restore", ...args, "-U", user, "-d", db],
    { stdinFrom: file },
  );
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

export function isValidBackupName(name: string): boolean {
  return NAME_RE.test(name);
}

export function backupFilePath(
  name: string,
  kind: "db" | "uploads" | "nightly",
): string {
  if (!isValidBackupName(name)) throw new Error("bad backup name");
  const file =
    kind === "db"
      ? `${name}.dump`
      : kind === "uploads"
        ? `${name}-uploads.tar`
        : `${name}.sql.gz`;
  return path.join(BACKUP_DIR, file);
}

/**
 * Какой файл лежит под этим именем. Копии из админки и ночные копии по
 * расписанию лежат в одном каталоге, но в разных форматах — скачивание и
 * удаление должны работать с обоими, иначе половина списка нерабочая.
 */
export async function resolveBackupFile(
  name: string,
): Promise<{ file: string; filename: string; kind: "panel" | "nightly" } | null> {
  if (!isValidBackupName(name)) return null;
  const dump = backupFilePath(name, "db");
  if (await exists(dump)) {
    return { file: dump, filename: `${name}.dump`, kind: "panel" };
  }
  const nightly = backupFilePath(name, "nightly");
  if (await exists(nightly)) {
    return { file: nightly, filename: `${name}.sql.gz`, kind: "nightly" };
  }
  return null;
}

export async function listBackups(): Promise<BackupInfo[]> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const files = await readdir(BACKUP_DIR);
  const result: BackupInfo[] = [];

  for (const f of files) {
    // Копия из админки: imbir-20260901-183000.dump
    if (f.endsWith(".dump")) {
      const name = f.slice(0, -".dump".length);
      if (!isValidBackupName(name)) continue;
      const s = await stat(path.join(BACKUP_DIR, f));
      result.push({
        name,
        sizeBytes: s.size,
        createdAt: s.mtime,
        hasUploads: files.includes(`${name}-uploads.tar`),
        kind: "panel",
      });
      continue;
    }
    // Ночная копия по расписанию: imbir-20260901-094845.sql.gz.
    // Показать её обязательно: без этого страница уверяет «копий нет», хотя
    // за девяносто дней их лежит девяносто — и это единственная защита данных.
    if (f.endsWith(".sql.gz")) {
      const name = f.slice(0, -".sql.gz".length);
      if (!isValidBackupName(name)) continue;
      const s = await stat(path.join(BACKUP_DIR, f));
      result.push({
        name,
        sizeBytes: s.size,
        createdAt: s.mtime,
        hasUploads: false,
        kind: "nightly",
      });
    }
  }
  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Имя из даты Алматы: imbir-20260715-183000. */
function newBackupName(now = new Date()): string {
  const almaty = new Date(now.getTime() + 5 * 3600_000);
  const s = almaty.toISOString();
  return `imbir-${s.slice(0, 10).replaceAll("-", "")}-${s.slice(11, 19).replaceAll(":", "")}`;
}

export async function createBackup(): Promise<BackupInfo> {
  if (busy) throw new Error("Бэкап уже выполняется — подождите.");
  busy = true;
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const name = newBackupName();
    const dbFile = backupFilePath(name, "db");
    await dumpDb(dbFile);

    let hasUploads = false;
    if (await exists(UPLOADS_DIR)) {
      await run("tar", [
        "-cf",
        backupFilePath(name, "uploads"),
        "-C",
        path.join(process.cwd(), "public"),
        "uploads",
      ]);
      hasUploads = true;
    }

    const s = await stat(dbFile);
    return { name, sizeBytes: s.size, createdAt: s.mtime, hasUploads, kind: "panel" };
  } finally {
    busy = false;
  }
}

export async function restoreBackup(name: string): Promise<void> {
  if (!isValidBackupName(name)) throw new Error("bad backup name");
  if (busy) throw new Error("Идёт другая операция с бэкапами — подождите.");
  busy = true;
  try {
    const dbFile = backupFilePath(name, "db");
    if (!(await exists(dbFile))) {
      // Ночная копия — обычный SQL в gzip, pg_restore его не читает.
      // Разворачивать её вслепую из браузера нельзя: в ней нет DROP-команд,
      // и накат поверх живой базы кончится ошибками на каждой таблице.
      if (await exists(backupFilePath(name, "nightly"))) {
        throw new Error(
          "Это ночная копия (.sql.gz) — она разворачивается на сервере командой из docs/REFERENCE.md, а не из админки.",
        );
      }
      throw new Error("Файл бэкапа не найден.");
    }
    await restoreDb(dbFile);

    const uploadsTar = backupFilePath(name, "uploads");
    if (await exists(uploadsTar)) {
      await run("tar", ["-xf", uploadsTar, "-C", path.join(process.cwd(), "public")]);
    }
  } finally {
    busy = false;
  }
}

export async function deleteBackup(name: string): Promise<void> {
  const found = await resolveBackupFile(name);
  if (!found) throw new Error("Файл бэкапа не найден.");
  await unlink(found.file);
  const uploadsTar = backupFilePath(name, "uploads");
  if (await exists(uploadsTar)) await unlink(uploadsTar);
}
