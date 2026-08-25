"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";
import { sanitizeLegalHtml } from "@/lib/admin/sanitize";
import { hashLegalContent } from "@/lib/consent";

const schema = z.object({
  type: z.enum(["offer", "privacy", "rules", "consent_modal"]),
  lang: z.enum(["ru", "kk", "en"]),
  content: z.string().max(100_000),
});

/**
 * Сохранение правового текста (PRD §6.4): каждая правка — НОВАЯ неизменяемая
 * версия; старые версии не меняются (на них ссылаются согласия покупателей).
 *
 * Указателем «действующая редакция» (`currentVersionId`) распоряжается ТОЛЬКО
 * русский текст — он канонический. Переводы живут рядом и выбираются по языку
 * (`getLegalVersionForLocale`). Раньше указатель переставляла любая правка:
 * суперадмин сохранял казахский перевод, и русский покупатель получал
 * казахскую оферту, а её номер уходил в его согласие. Эталон этого правила —
 * `scripts/import-legal.ts`, где условие по языку было с самого начала.
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
      contentSha256: hashLegalContent(clean),
      lang: parsed.data.lang,
      authorId: Number(admin.id),
    },
  });
  // Второе условие обязательно: `upsert` выше заводит документ с пустым
  // указателем, и если самой первой сохранят не русскую версию, страница
  // документа осталась бы без действующей редакции (`notFound`).
  if (parsed.data.lang === "ru" || document.currentVersionId === null) {
    await prisma.legalDocument.update({
      where: { id: document.id },
      data: { currentVersionId: version.id },
    });
  }

  await auditLog({
    actor: admin.email,
    action: "legal.new_version",
    entity: "legal_document",
    entityId: parsed.data.type,
    diff: {
      versionId: version.id,
      lang: parsed.data.lang,
      sha256: version.contentSha256,
      published: parsed.data.lang === "ru" || document.currentVersionId === null,
    },
  });
  revalidatePath("/admin/legal");
  return { ok: true, versionId: version.id };
}
