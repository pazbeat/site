import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadActiveAdmin } from "@/lib/admin/guard";
import { backupFilePath, isValidBackupName } from "@/lib/backup";

/**
 * Скачивание файла бэкапа (для хранения копии вне сервера).
 * Proxy уже требует сессию на /api/admin/*; здесь дополнительно — superadmin.
 */
export async function GET(request: Request) {
  const session = await auth();
  const admin = await loadActiveAdmin(session?.user?.id);
  if (!admin || admin.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!isValidBackupName(name)) {
    return NextResponse.json({ error: "bad_name" }, { status: 400 });
  }

  const file = backupFilePath(name, "db");
  try {
    const s = await stat(file);
    const stream = Readable.toWeb(
      createReadStream(file),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(s.size),
        "Content-Disposition": `attachment; filename="${name}.dump"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
