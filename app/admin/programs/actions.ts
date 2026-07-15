"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import { deleteUpload, saveImageUpload } from "@/lib/admin/upload";

const optionSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  durationMin: z.coerce.number().int().positive().optional(),
  persons: z.coerce.number().int().positive().optional(),
  priceKzt: z.coerce.number().int().positive(),
});

const programSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  category: z.enum(["massage", "spa", "set"]),
  nameRu: z.string().trim().min(1).max(120),
  nameKk: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  descRu: z.string().trim().max(400),
  descKk: z.string().trim().max(400),
  descEn: z.string().trim().max(400),
  popular: z.coerce.boolean(),
  active: z.coerce.boolean(),
  cities: z.string().trim(), // CSV городов доступности
  options: z.array(optionSchema).min(1),
});

function parseForm(formData: FormData) {
  const optionsRaw = formData.get("options");
  let options: unknown = [];
  try {
    options = JSON.parse(String(optionsRaw ?? "[]"));
  } catch {
    options = [];
  }
  return programSchema.safeParse({
    id: formData.get("id") || undefined,
    category: formData.get("category"),
    nameRu: formData.get("nameRu"),
    nameKk: formData.get("nameKk"),
    nameEn: formData.get("nameEn"),
    descRu: formData.get("descRu") ?? "",
    descKk: formData.get("descKk") ?? "",
    descEn: formData.get("descEn") ?? "",
    popular: formData.get("popular") === "on",
    active: formData.get("active") === "on",
    cities: formData.get("cities") ?? "",
    options,
  });
}

export async function saveProgramAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: "Проверьте поля программы." };
  const d = parsed.data;

  const cities = d.cities
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const current = d.id
    ? await prisma.program.findUnique({ where: { id: d.id } })
    : null;

  // Фото: новый файл заменяет прежний, галочка «удалить» — очищает.
  // Старый аплоад подчищаем, чтобы не копить мусор в public/uploads.
  let photoUrl = current?.photoUrl ?? null;
  const file = formData.get("photo");
  const removePhoto = formData.get("removePhoto") === "on";
  if (file instanceof File && file.size > 0) {
    const upload = await saveImageUpload(file, { folder: "programs", width: 1200 });
    if (!upload.ok) return { error: upload.error };
    await deleteUpload(photoUrl, "programs");
    photoUrl = upload.url;
  } else if (removePhoto && photoUrl) {
    await deleteUpload(photoUrl, "programs");
    photoUrl = null;
  }

  const data = {
    category: d.category,
    names: { ru: d.nameRu, kk: d.nameKk, en: d.nameEn },
    descriptions: { ru: d.descRu, kk: d.descKk, en: d.descEn },
    popular: d.popular,
    active: d.active,
    photoUrl,
    cities,
  };

  if (d.id) {
    const programId = d.id;
    // Варианты синхронизируем по id: существующие — обновляем на месте
    // (проданный сертификат хранит свою amountKzt отдельно, поэтому смена
    // цены безопасна), новые — создаём, пропавшие — удаляем, но только
    // если по ним нет проданных сертификатов (PRD §6.2).
    await prisma.$transaction(async (tx) => {
      await tx.program.update({ where: { id: programId }, data });

      const existing = await tx.programOption.findMany({
        where: { programId },
        select: { id: true, _count: { select: { certificates: true } } },
      });
      const keptIds = new Set(
        d.options.filter((o) => o.id).map((o) => o.id!),
      );

      // Удаляем убранные варианты без проданных сертификатов
      const removable = existing
        .filter((o) => !keptIds.has(o.id) && o._count.certificates === 0)
        .map((o) => o.id);
      if (removable.length) {
        await tx.programOption.deleteMany({ where: { id: { in: removable } } });
      }

      for (const opt of d.options) {
        if (opt.id) {
          await tx.programOption.update({
            where: { id: opt.id },
            data: {
              durationMin: opt.durationMin ?? null,
              persons: opt.persons ?? null,
              priceKzt: opt.priceKzt,
            },
          });
        } else {
          await tx.programOption.create({
            data: {
              programId,
              durationMin: opt.durationMin ?? null,
              persons: opt.persons ?? null,
              priceKzt: opt.priceKzt,
            },
          });
        }
      }
    });
    await auditLog({
      actor: admin.email,
      action: "program.update",
      entity: "program",
      entityId: String(d.id),
      diff: data,
    });
  } else {
    const count = await prisma.program.count();
    const created = await prisma.program.create({
      data: {
        ...data,
        sort: count,
        options: {
          create: d.options.map((opt) => ({
            durationMin: opt.durationMin ?? null,
            persons: opt.persons ?? null,
            priceKzt: opt.priceKzt,
          })),
        },
      },
    });
    await auditLog({
      actor: admin.email,
      action: "program.create",
      entity: "program",
      entityId: String(created.id),
      diff: data,
    });
  }

  revalidatePath("/admin/programs");
  return { ok: true };
}

/** Деактивация/активация. Удаление запрещено, если есть проданные сертификаты (PRD §6.2). */
export async function toggleProgramActiveAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { error: "Программа не найдена." };

  await prisma.program.update({
    where: { id },
    data: { active: !program.active },
  });
  await auditLog({
    actor: admin.email,
    action: program.active ? "program.deactivate" : "program.activate",
    entity: "program",
    entityId: String(id),
  });
  revalidatePath("/admin/programs");
  return { ok: true };
}
