/**
 * Разовый перенос фото программ со старого сайта (www.imbir.kz) к нам:
 * скачивание → sharp → WebP (800px, q80) → public/programs/*.webp → photoUrl.
 * Убирает зависимость скорости сайта от чужого хостинга.
 * Идемпотентно: локальные photoUrl не трогает. Запуск: npx tsx scripts/localize-photos.ts
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function slugify(ru: string): string {
  const map: Record<string, string> = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"i",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
  return ru.toLowerCase().split("").map((c) => map[c] ?? c).join("").replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "");
}

async function main() {
  const programs = await prisma.program.findMany();
  for (const p of programs) {
    if (!p.photoUrl?.startsWith("https://www.imbir.kz/")) continue;
    const name = (p.names as { ru: string }).ru;
    const slug = slugify(name) || `program-${p.id}`;
    try {
      const response = await fetch(p.photoUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buf = Buffer.from(await response.arrayBuffer());
      const webp = await sharp(buf).rotate().resize(800, undefined, { withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      const file = `${slug}.webp`;
      await writeFile(path.join(process.cwd(), "public", "programs", file), webp);
      await prisma.program.update({ where: { id: p.id }, data: { photoUrl: `/programs/${file}` } });
      console.log(`${name}: ${Math.round(buf.length/1024)} КБ jpg → ${Math.round(webp.length/1024)} КБ webp (/programs/${file})`);
    } catch (error) {
      console.error(`${name}: не удалось (${error instanceof Error ? error.message : error}) — оставлен внешний URL`);
    }
  }
}

main().then(() => prisma.$disconnect());
