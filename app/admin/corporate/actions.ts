"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, auditLog } from "@/lib/admin/guard";

const schema = z.object({
  id: z.string().min(1),
  status: z.enum(["new", "in_progress", "closed"]),
});

/** Смена статуса корпоративной заявки (Фаза 2, PRD §6.6). */
export async function setCorporateStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Некорректный статус." };

  const existing = await prisma.corporateRequest.findUnique({
    where: { id: parsed.data.id },
  });
  if (!existing) return { error: "Заявка не найдена." };

  await prisma.corporateRequest.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });
  await auditLog({
    actor: admin.email,
    action: "corporate.status",
    entity: "corporate_request",
    entityId: parsed.data.id,
    diff: { from: existing.status, to: parsed.data.status },
  });
  revalidatePath("/admin/corporate");
  return { ok: true };
}
