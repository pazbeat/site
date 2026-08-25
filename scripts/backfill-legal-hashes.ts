/**
 * Проставить отпечаток (SHA-256) редакциям правовых документов, заведённым до
 * появления колонки `content_sha256`.
 *
 * Запуск без аргументов — только показать, что будет сделано:
 *   npx tsx scripts/backfill-legal-hashes.ts
 * С `--apply` — записать:
 *   npx tsx scripts/backfill-legal-hashes.ts --apply
 *
 * У редакций с уже проставленным отпечатком он ПЕРЕСЧИТЫВАЕТСЯ и сверяется.
 * Расхождение означает, что текст правили после создания записи, — скрипт об
 * этом кричит и ничего не трогает: молча переписать отпечаток значило бы
 * замести следы правки.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function sha256(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const versions = await prisma.legalVersion.findMany({
    include: { document: { select: { type: true } } },
    orderBy: { id: "asc" },
  });

  let filled = 0;
  let ok = 0;
  const mismatched: string[] = [];

  for (const v of versions) {
    const actual = sha256(v.contentHtmlSanitized);
    const label = `#${v.id} ${v.document.type}/${v.lang}`;

    if (!v.contentSha256) {
      console.log(`${apply ? "проставлен" : "будет проставлен"}  ${label}  ${actual.slice(0, 16)}…`);
      if (apply) {
        await prisma.legalVersion.update({
          where: { id: v.id },
          data: { contentSha256: actual },
        });
      }
      filled += 1;
      continue;
    }

    if (v.contentSha256 === actual) {
      ok += 1;
    } else {
      mismatched.push(`${label}: записан ${v.contentSha256.slice(0, 16)}…, текст даёт ${actual.slice(0, 16)}…`);
    }
  }

  console.log(
    `\nвсего редакций ${versions.length}: без отпечатка ${filled}, сходятся ${ok}, РАСХОДЯТСЯ ${mismatched.length}`,
  );
  for (const m of mismatched) console.error(`  !! ${m}`);
  if (mismatched.length > 0) {
    console.error("\nРасхождение = текст редакции правили после её создания. Разбираться вручную.");
    process.exitCode = 1;
  }
  if (!apply && filled > 0) console.log("\nЭто был показ. Запустите с --apply, чтобы записать.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
