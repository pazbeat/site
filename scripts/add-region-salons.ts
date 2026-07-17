/**
 * Добавляет региональные филиалы (Семей, Экибастуз, Жезказган) в живую БД,
 * не трогая существующие данные. Идемпотентно (upsert по codePrefix).
 * Экибастуз/Жезказган — только витрина (orderable=false), Семей — доступен
 * в конструкторе. Телефон — общий номер сети (как у остальных филиалов).
 *
 *   npx tsx scripts/add-region-salons.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SALON_SEED } from "../prisma/salons-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const NEW_PREFIXES = ["WS", "WE", "WJ"];

async function main() {
  const maxSort = await prisma.salon.aggregate({ _max: { sort: true } });
  let sort = (maxSort._max.sort ?? 0) + 1;

  for (const s of SALON_SEED.filter((x) => NEW_PREFIXES.includes(x.codePrefix))) {
    const salon = await prisma.salon.upsert({
      where: { codePrefix: s.codePrefix },
      update: {
        active: true,
        orderable: s.orderable ?? true,
        cityNames: s.cityNames,
        addressNames: s.addressNames,
      },
      create: {
        city: s.city,
        cityNames: s.cityNames,
        name: s.name,
        address: s.address,
        addressNames: s.addressNames,
        codePrefix: s.codePrefix,
        orderable: s.orderable ?? true,
        phone: "+7 708 111 8098",
        sort: sort++,
      },
    });
    console.log(`✓ ${salon.city} (${salon.codePrefix}) — orderable=${salon.orderable}`);
  }

  const total = await prisma.salon.count({ where: { active: true } });
  const cities = new Set((await prisma.salon.findMany({ where: { active: true }, select: { city: true } })).map((x) => x.city));
  console.log(`Итого активных филиалов: ${total}, городов: ${cities.size}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
