/**
 * Импорт правовых текстов в БД + синхронизация HTML-файлов.
 *  - RU: из rules/*.docx (присланы заказчиком) через mammoth.
 *  - KK/EN: из prisma/legal/{type}.{lang}.html (переводы, в гите).
 * Каждый язык → отдельная неизменяемая LegalVersion; RU — актуальная
 * (currentVersion). Отдача по локали — lib/data.ts getLegalVersionForLocale.
 *
 * Запуск: npx tsx scripts/import-legal.ts
 * Для RU требуется локальная папка rules/ (в .gitignore) с .docx.
 * Санитизация зеркалит lib/admin/sanitize.ts (server-only, в tsx не грузится).
 */
import "dotenv/config";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DOCS: Array<{ docx: string; type: "offer" | "privacy" | "rules" }> = [
  { docx: "oferta.docx", type: "offer" },
  { docx: "privacy_policy.docx", type: "privacy" },
  { docx: "rules.docx", type: "rules" },
];
const LANGS = ["ru", "kk", "en"] as const;

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

const outDir = path.join(process.cwd(), "prisma", "legal");

async function exists(p: string) {
  return access(p).then(() => true).catch(() => false);
}

/** RU-контент из docx, KK/EN — из html-файла перевода. */
async function loadHtml(
  type: string,
  lang: string,
  docx: string,
): Promise<string | null> {
  if (lang === "ru") {
    const src = path.join(process.cwd(), "rules", docx);
    if (!(await exists(src))) return null;
    const { value } = await mammoth.convertToHtml({ buffer: await readFile(src) });
    return value.replace(/http:\/\/(www\.)?imbir\.kz/gi, "https://$1imbir.kz");
  }
  const file = path.join(outDir, `${type}.${lang}.html`);
  if (!(await exists(file))) return null;
  return readFile(file, "utf8");
}

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const { docx, type } of DOCS) {
    const document = await prisma.legalDocument.upsert({
      where: { type },
      create: { type },
      update: {},
    });

    for (const lang of LANGS) {
      const raw = await loadHtml(type, lang, docx);
      if (raw === null) {
        console.log(`${type}/${lang}: пропуск (нет источника)`);
        continue;
      }
      const clean = sanitizeLegalHtml(raw);
      await writeFile(path.join(outDir, `${type}.${lang}.html`), clean, "utf8");

      const version = await prisma.legalVersion.create({
        data: { documentId: document.id, contentHtmlSanitized: clean, lang },
      });
      if (lang === "ru") {
        await prisma.legalDocument.update({
          where: { id: document.id },
          data: { currentVersionId: version.id },
        });
      }
      console.log(
        `${type}/${lang}: ${clean.length} симв. → версия #${version.id}${lang === "ru" ? " (актуальная)" : ""}`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
