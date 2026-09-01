import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadActiveAdmin } from "@/lib/admin/guard";
import { resolveBackupFile } from "@/lib/backup";

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
  // Формат зависит от того, чем копия снята: .dump из админки или .sql.gz
  // ночным расписанием. Раньше отдавался только .dump — «Скачать» у ночных
  // копий отвечало 404.
  const found = await resolveBackupFile(name);
  if (!found) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const s = await stat(found.file);
    const stream = Readable.toWeb(
      createReadStream(found.file),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(s.size),
        "Content-Disposition": `attachment; filename="${found.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
