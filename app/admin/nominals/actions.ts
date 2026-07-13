"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";

const schema = z.object({
  id: z.coerce.number().int().positive().optional(),
  amountKzt: z.coerce.number().int().positive(),
  label: z.string().trim().max(40).optional(),
});

export async function saveNominalAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = schema.safeParse({
    id: formData.get("id") || undefined,
    amountKzt: formData.get("amountKzt"),
    label: formData.get("label") || undefined,
  });
  if (!parsed.success) return { error: "Проверьте сумму." };
  const { id, amountKzt, label } = parsed.data;

  if (id) {
    await prisma.nominal.update({
      where: { id },
      data: { amountKzt, label: label ?? null },
    });
    await auditLog({
      actor: admin.email,
      action: "nominal.update",
      entity: "nominal",
      entityId: String(id),
      diff: { amountKzt, label },
    });
  } else {
    const count = await prisma.nominal.count();
    const created = await prisma.nominal.create({
      data: { amountKzt, label: label ?? null, sort: count },
    });
    await auditLog({
      actor: admin.email,
      action: "nominal.create",
      entity: "nominal",
      entityId: String(created.id),
      diff: { amountKzt, label },
    });
  }
  revalidatePath("/admin/nominals");
  return { ok: true };
}

export async function toggleNominalActiveAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const nominal = await prisma.nominal.findUnique({ where: { id } });
  if (!nominal) return { error: "Номинал не найден." };
  await prisma.nominal.update({
    where: { id },
    data: { active: !nominal.active },
  });
  await auditLog({
    actor: admin.email,
    action: nominal.active ? "nominal.deactivate" : "nominal.activate",
    entity: "nominal",
    entityId: String(id),
  });
  revalidatePath("/admin/nominals");
  return { ok: true };
}
