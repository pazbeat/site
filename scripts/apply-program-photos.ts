/**
 * Проставляет photoUrl программам, у которых картинки не было:
 *   npx tsx scripts/apply-program-photos.ts
 * Сид (prisma/seed.ts) на непустой БД — no-op, поэтому пути правим здесь.
 * Программы с уже проставленным photoUrl не трогаем: у них имя файла не
 * менялось, картинки перезаписаны на диске.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PHOTOS: Record<string, string> = {
  "Массаж головы и шеи": "/programs/massazh-golovy-i-shei.webp",
  "Чудесное ожидание": "/programs/chudesnoe-ozhidanie.webp",
  Антистресс: "/programs/antistress.webp",
  "Энергия Сиама": "/programs/energiya-siama.webp",
  Перезагрузка: "/programs/perezagruzka.webp",
  "Спа Релакс": "/programs/spa-relaks.webp",
  // Деактивированные программы: в каталоге не показываются, но при повторном
  // включении должны быть в той же серии, а не без картинки.
  "Анти-усталость": "/programs/anti-ustalost.webp",
  "Энергия морской воды": "/programs/energiya-morskoi-vody.webp",
  "Морское утончение": "/programs/morskoe-utonchenie.webp",
};

async function main() {
  const programs = await prisma.program.findMany({
    select: { id: true, names: true, photoUrl: true },
  });

  let changed = 0;
  for (const p of programs) {
    const ru = (p.names as Record<string, string>)?.ru;
    const photo = ru ? PHOTOS[ru] : undefined;
    if (!photo || p.photoUrl === photo) continue;
    await prisma.program.update({ where: { id: p.id }, data: { photoUrl: photo } });
    console.log(`  ${ru}: ${p.photoUrl ?? "(нет)"} -> ${photo}`);
    changed++;
  }
  console.log(`Обновлено: ${changed}`);

  const without = await prisma.program.findMany({
    where: { photoUrl: null },
    select: { names: true },
  });
  console.log(`Без картинки осталось: ${without.length}`);
  for (const w of without) {
    console.log("  !", (w.names as Record<string, string>)?.ru);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
