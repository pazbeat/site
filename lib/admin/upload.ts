import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Приём картинок от админов (PRD §9.7): тип определяем по магическим байтам,
 * а не по MIME из формы — его подделывает кто угодно. Всё пересобирается
 * в WebP через sharp (заодно срезает EXIF и любую нагрузку в оригинале),
 * имя файла случайное, чтобы нельзя было угадать чужие загрузки.
 */

const MAX_BYTES = 8 * 1024 * 1024; // 8 МБ
const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

export function sniffImage(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png";
  }
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Сохраняет картинку в public/uploads/{folder} и возвращает публичный путь.
 * `folder` задаёт раздел (designs, programs) — в url он же служит признаком
 * «это наш аплоад», по которому файл можно удалить вместе с записью.
 */
export async function saveImageUpload(
  file: unknown,
  opts: { folder: string; width: number },
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Выберите картинку." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "Файл больше 8 МБ." };

  const input = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(input)) {
    return { ok: false, error: "Только JPEG, PNG или WebP." };
  }

  let webp: Buffer;
  try {
    webp = await sharp(input)
      .rotate() // учесть EXIF-ориентацию
      .resize({ width: opts.width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, error: "Не удалось обработать изображение." };
  }

  const dir = path.join(UPLOADS_ROOT, opts.folder);
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.webp`;
  await writeFile(path.join(dir, fileName), webp);
  return { ok: true, url: `/uploads/${opts.folder}/${fileName}` };
}

/** Удаляет файл, только если это наш аплоад из нужной папки. */
export async function deleteUpload(
  url: string | null,
  folder: string,
): Promise<void> {
  if (!url?.startsWith(`/uploads/${folder}/`) || url.includes("..")) return;
  await unlink(path.join(process.cwd(), "public", url)).catch(() => {});
}
