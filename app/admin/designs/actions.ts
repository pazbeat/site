"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import { deleteUpload, saveImageUpload } from "@/lib/admin/upload";
import { PANEL_BG, PANEL_TEXT } from "@/prisma/designs-data";

const names = z.object({
  nameRu: z.string().trim().min(1).max(80),
  nameKk: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
});

/** Загрузка новой открытки-дизайна: файл → WebP со случайным именем. */
export async function uploadDesignAction(formData: FormData) {
  const admin = await requireSuperadmin();

  const parsedNames = names.safeParse({
    nameRu: formData.get("nameRu"),
    nameKk: formData.get("nameKk"),
    nameEn: formData.get("nameEn"),
  });
  if (!parsedNames.success) return { error: "Заполните названия (RU/KK/EN)." };

  const upload = await saveImageUpload(formData.get("image"), {
    folder: "designs",
    width: 1400,
  });
  if (!upload.ok) return { error: upload.error };
  const imageUrl = upload.url;

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
  await deleteUpload(design.imageUrl, "designs");
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
