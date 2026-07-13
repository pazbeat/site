"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";

// Только фирменная палитра/производные (PRD §3.1)
const HEX = /^#[0-9a-fA-F]{6}$/;

const schema = z.object({
  id: z.coerce.number().int().positive().optional(),
  nameRu: z.string().trim().min(1).max(80),
  nameKk: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  kind: z.enum(["solid", "gradient"]),
  color: z.string().regex(HEX).optional(),
  from: z.string().regex(HEX).optional(),
  to: z.string().regex(HEX).optional(),
  textColor: z.string().regex(HEX),
});

export async function saveDesignAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = schema.safeParse({
    id: formData.get("id") || undefined,
    nameRu: formData.get("nameRu"),
    nameKk: formData.get("nameKk"),
    nameEn: formData.get("nameEn"),
    kind: formData.get("kind"),
    color: formData.get("color") || undefined,
    from: formData.get("from") || undefined,
    to: formData.get("to") || undefined,
    textColor: formData.get("textColor"),
  });
  if (!parsed.success) return { error: "Проверьте поля (цвета в формате #RRGGBB)." };
  const d = parsed.data;

  const bgStyle =
    d.kind === "gradient"
      ? { kind: "gradient", from: d.from ?? "#4D295D", to: d.to ?? "#B69244", angle: 135 }
      : { kind: "solid", color: d.color ?? "#4D295D" };

  const data = {
    names: { ru: d.nameRu, kk: d.nameKk, en: d.nameEn },
    bgStyle,
    textColor: d.textColor,
  };

  if (d.id) {
    await prisma.design.update({ where: { id: d.id }, data });
    await auditLog({
      actor: admin.email,
      action: "design.update",
      entity: "design",
      entityId: String(d.id),
      diff: data,
    });
  } else {
    const count = await prisma.design.count();
    const created = await prisma.design.create({ data: { ...data, sort: count } });
    await auditLog({
      actor: admin.email,
      action: "design.create",
      entity: "design",
      entityId: String(created.id),
      diff: data,
    });
  }
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
