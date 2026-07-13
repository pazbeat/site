"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import { normalizePromoCode, type PromoLimits } from "@/lib/promo";

const schema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    code: z.string().trim().min(1).max(40),
    kind: z.enum(["percent", "fixed"]),
    value: z.coerce.number().int().positive(),
    maxUses: z.coerce.number().int().min(0).optional(),
    validFrom: z.string().trim().optional(),
    validUntil: z.string().trim().optional(),
    minAmountKzt: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "percent" && data.value > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Процент не может быть больше 100.",
      });
    }
  });

/** date из <input type="date"> → ISO с началом/концом суток в Asia/Almaty. */
function almatyStart(date: string): string {
  return `${date}T00:00:00+05:00`;
}
function almatyEnd(date: string): string {
  return `${date}T23:59:59+05:00`;
}

function buildLimits(input: {
  maxUses?: number;
  validFrom?: string;
  validUntil?: string;
  minAmountKzt?: number;
}): PromoLimits {
  const limits: PromoLimits = {};
  if (typeof input.maxUses === "number" && input.maxUses > 0) {
    limits.maxUses = input.maxUses;
  }
  if (input.validFrom) limits.validFrom = almatyStart(input.validFrom);
  if (input.validUntil) limits.validUntil = almatyEnd(input.validUntil);
  if (typeof input.minAmountKzt === "number" && input.minAmountKzt > 0) {
    limits.minAmountKzt = input.minAmountKzt;
  }
  return limits;
}

export async function savePromoAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = schema.safeParse({
    id: formData.get("id") || undefined,
    code: formData.get("code"),
    kind: formData.get("kind"),
    value: formData.get("value"),
    maxUses: formData.get("maxUses") || undefined,
    validFrom: formData.get("validFrom") || undefined,
    validUntil: formData.get("validUntil") || undefined,
    minAmountKzt: formData.get("minAmountKzt") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля." };
  }
  const { id, kind, value } = parsed.data;
  const code = normalizePromoCode(parsed.data.code);
  const limits = buildLimits(parsed.data);

  try {
    if (id) {
      await prisma.promo.update({
        where: { id },
        data: { code, kind, value, limits },
      });
      await auditLog({
        actor: admin.email,
        action: "promo.update",
        entity: "promo",
        entityId: String(id),
        diff: { code, kind, value, limits },
      });
    } else {
      const created = await prisma.promo.create({
        data: { code, kind, value, limits },
      });
      await auditLog({
        actor: admin.email,
        action: "promo.create",
        entity: "promo",
        entityId: String(created.id),
        diff: { code, kind, value, limits },
      });
    }
  } catch (error) {
    // Уникальность кода (P2002)
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { error: "Промокод с таким кодом уже существует." };
    }
    throw error;
  }

  revalidatePath("/admin/promos");
  return { ok: true };
}

export async function togglePromoActiveAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const promo = await prisma.promo.findUnique({ where: { id } });
  if (!promo) return { error: "Промокод не найден." };
  await prisma.promo.update({
    where: { id },
    data: { active: !promo.active },
  });
  await auditLog({
    actor: admin.email,
    action: promo.active ? "promo.deactivate" : "promo.activate",
    entity: "promo",
    entityId: String(id),
  });
  revalidatePath("/admin/promos");
  return { ok: true };
}
