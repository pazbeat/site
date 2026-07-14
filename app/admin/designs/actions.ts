"use server";

import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import { PANEL_BG, PANEL_TEXT } from "@/prisma/designs-data";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "designs");
const MAX_BYTES = 8 * 1024 * 1024; // 8 МБ

const names = z.object({
  nameRu: z.string().trim().min(1).max(80),
  nameKk: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
});

/** Проверка магических байт: JPEG / PNG / WebP (PRD §9 — не доверять MIME). */
function sniffImage(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "png";
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  return null;
}

/** Загрузка новой открытки-дизайна: файл → WebP со случайным именем. */
export async function uploadDesignAction(formData: FormData) {
  const admin = await requireSuperadmin();

  const parsedNames = names.safeParse({
    nameRu: formData.get("nameRu"),
    nameKk: formData.get("nameKk"),
    nameEn: formData.get("nameEn"),
  });
  if (!parsedNames.success) return { error: "Заполните названия (RU/KK/EN)." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Выберите картинку." };
  }
  if (file.size > MAX_BYTES) return { error: "Файл больше 8 МБ." };

  const input = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(input)) {
    return { error: "Только JPEG, PNG или WebP." };
  }

  let webp: Buffer;
  try {
    webp = await sharp(input)
      .rotate() // учесть EXIF-ориентацию
      .resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { error: "Не удалось обработать изображение." };
  }

  const fileName = `${randomUUID()}.webp`;
  const { mkdir } = await import("node:fs/promises");
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, fileName), webp);
  const imageUrl = `/uploads/designs/${fileName}`;

  const count = await prisma.design.count();
  const d = parsedNames.data;
  const created = await prisma.design.create({
    data: {
      names: { ru: d.nameRu, kk: d.nameKk, en: d.nameEn },
      imageUrl,
      bgStyle: PANEL_BG,
      textColor: PANEL_TEXT,
      sort: count,
    },
  });
  await auditLog({
    actor: admin.email,
    action: "design.create",
    entity: "design",
    entityId: String(created.id),
    diff: { imageUrl, names: created.names },
  });
  revalidatePath("/admin/designs");
  return { ok: true };
}

/** Переименование дизайна (RU/KK/EN). */
export async function renameDesignAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const parsed = names.safeParse({
    nameRu: formData.get("nameRu"),
    nameKk: formData.get("nameKk"),
    nameEn: formData.get("nameEn"),
  });
  if (!Number.isFinite(id) || !parsed.success) {
    return { error: "Проверьте названия." };
  }
  const d = parsed.data;
  await prisma.design.update({
    where: { id },
    data: { names: { ru: d.nameRu, kk: d.nameKk, en: d.nameEn } },
  });
  await auditLog({
    actor: admin.email,
    action: "design.rename",
    entity: "design",
    entityId: String(id),
    diff: { names: d },
  });
  revalidatePath("/admin/designs");
  return { ok: true };
}

export async function toggleDesignActiveAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const design = await prisma.design.findUnique({ where: { id } });
  if (!design) return { error: "Дизайн не найден." };
  await prisma.design.update({
    where: { id },
    data: { active: !design.active },
  });
  await auditLog({
    actor: admin.email,
    action: design.active ? "design.deactivate" : "design.activate",
    entity: "design",
    entityId: String(id),
  });
  revalidatePath("/admin/designs");
  return { ok: true };
}

/** Удаление дизайна — только если на него не ссылаются сертификаты. */
export async function deleteDesignAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const design = await prisma.design.findUnique({ where: { id } });
  if (!design) return { error: "Дизайн не найден." };

  const used = await prisma.certificate.count({ where: { designId: id } });
  if (used > 0) {
    return {
      error: `Нельзя удалить: есть ${used} сертификат(ов) с этим дизайном. Скройте его вместо удаления.`,
    };
  }

  await prisma.design.delete({ where: { id } });

  // Удаляем файл только если это загруженный пользователем аплоад
  if (design.imageUrl?.startsWith("/uploads/designs/")) {
    const abs = path.join(process.cwd(), "public", design.imageUrl);
    await unlink(abs).catch(() => {});
  }
  await auditLog({
    actor: admin.email,
    action: "design.delete",
    entity: "design",
    entityId: String(id),
  });
  revalidatePath("/admin/designs");
  return { ok: true };
}

/** Перемещение в порядке отображения (обмен sort с соседом). */
export async function moveDesignAction(formData: FormData) {
  await requireSuperadmin();
  const id = Number(formData.get("id"));
  const dir = formData.get("dir") === "up" ? "up" : "down";
  const current = await prisma.design.findUnique({ where: { id } });
  if (!current) return { error: "Дизайн не найден." };

  const neighbor = await prisma.design.findFirst({
    where:
      dir === "up"
        ? { sort: { lt: current.sort } }
        : { sort: { gt: current.sort } },
    orderBy: { sort: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return { ok: true }; // край списка

  await prisma.$transaction([
    prisma.design.update({
      where: { id: current.id },
      data: { sort: neighbor.sort },
    }),
    prisma.design.update({
      where: { id: neighbor.id },
      data: { sort: current.sort },
    }),
  ]);
  revalidatePath("/admin/designs");
  return { ok: true };
}
