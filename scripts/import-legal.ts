/**
 * Импорт реальных правовых текстов из rules/*.docx (присланы заказчиком) →
 * санитизированный HTML в prisma/legal/*.ru.html (в гит, для сида) + новая
 * актуальная версия в БД (как ручное сохранение в /admin/legal).
 *
 * Запуск: npx tsx scripts/import-legal.ts
 * Требует локальную папку rules/ (в .gitignore) с исходными .docx.
 *
 * Санитизация зеркалит lib/admin/sanitize.ts (тот модуль server-only и не
 * импортируется в tsx-скрипт). При правках allowlist — синхронизировать оба.
 */
import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DOCS: Array<{ file: string; type: "offer" | "privacy" | "rules" }> = [
  { file: "oferta.docx", type: "offer" },
  { file: "privacy_policy.docx", type: "privacy" },
  { file: "rules.docx", type: "rules" },
];

// Зеркало lib/admin/sanitize.ts
function sanitizeLegalHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "h1", "h2", "h3", "h4",
      "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "b", "em", "i", "u",
      "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
          ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
        },
      }),
    },
    disallowedTagsMode: "discard",
  });
}

async function main() {
  const outDir = path.join(process.cwd(), "prisma", "legal");
  await mkdir(outDir, { recursive: true });

  for (const { file, type } of DOCS) {
    const src = path.join(process.cwd(), "rules", file);
    const buffer = await readFile(src);
    const { value: rawHtml } = await mammoth.convertToHtml({ buffer });
    // Ссылки http://…imbir.kz → https (иначе санитайзер выкинет href)
    const httpsHtml = rawHtml.replace(/http:\/\/(www\.)?imbir\.kz/gi, "https://$1imbir.kz");
    const clean = sanitizeLegalHtml(httpsHtml);

    await writeFile(path.join(outDir, `${type}.ru.html`), clean, "utf8");

    const document = await prisma.legalDocument.upsert({
      where: { type },
      create: { type },
      update: {},
    });
    const version = await prisma.legalVersion.create({
      data: { documentId: document.id, contentHtmlSanitized: clean, lang: "ru" },
    });
    await prisma.legalDocument.update({
      where: { id: document.id },
      data: { currentVersionId: version.id },
    });
    console.log(`${type}: ${clean.length} симв. → версия #${version.id} (актуальная)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
