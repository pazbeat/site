"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import { sanitizeLegalHtml } from "@/lib/admin/sanitize";

const schema = z.object({
  type: z.enum(["offer", "privacy", "rules", "consent_modal"]),
  lang: z.enum(["ru", "kk", "en"]),
  content: z.string().max(100_000),
});

/**
 * Сохранение правового текста (PRD §6.4): каждая правка — НОВАЯ неизменяемая
 * версия; старые версии не меняются (на них ссылаются согласия покупателей).
 * Публикуется всегда последняя.
 */
export async function saveLegalAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = schema.safeParse({
    type: formData.get("type"),
    lang: formData.get("lang"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: "Проверьте поля документа." };

  const clean = sanitizeLegalHtml(parsed.data.content);

  const document = await prisma.legalDocument.upsert({
    where: { type: parsed.data.type },
    create: { type: parsed.data.type },
    update: {},
  });

  const version = await prisma.legalVersion.create({
    data: {
      documentId: document.id,
      contentHtmlSanitized: clean,
      lang: parsed.data.lang,
      authorId: Number(admin.id),
    },
  });
  await prisma.legalDocument.update({
    where: { id: document.id },
    data: { currentVersionId: version.id },
  });

  await auditLog({
    actor: admin.email,
    action: "legal.new_version",
    entity: "legal_document",
    entityId: parsed.data.type,
    diff: { versionId: version.id, lang: parsed.data.lang },
  });
  revalidatePath("/admin/legal");
  return { ok: true, versionId: version.id };
}
