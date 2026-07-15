/**
 * Разовое приведение живой БД к официальному прайсу Imbir Thai Spa Classic
 * (price/Price rus.pdf, июль 2026) и новым бизнес-правилам:
 *  - срок действия сертификата: 3 месяца;
 *  - своя сумма: от 18 000 ₸;
 *  - номинал 15 000 → 18 000;
 *  - Foot релакс: варианты 60/18 000 и 90/22 000 (было 90/18 000 и 120/22 000);
 *  - Энергия Таиланда: описание «стоун-терапия»;
 *  - сеты Sabai Sabai / Karuna / Sanuk: цена на 2 персоны из прайса;
 *  - программы, отсутствующие в прайсе, деактивируются (обратимо, admin/programs).
 * Идемпотентно. Запуск: npx tsx scripts/apply-price-2026-07.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function setSetting(key: string, value: number) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  console.log(`настройка ${key} = ${value}`);
}

/** Программа по русскому названию (names — Json {ru,kk,en}). */
async function findProgram(ru: string) {
  const all = await prisma.program.findMany({ include: { options: true } });
  return all.find(
    (p) => (p.names as { ru?: string }).ru?.toLowerCase() === ru.toLowerCase(),
  );
}

async function main() {
  await setSetting("certificate_validity_months", 3);
  await setSetting("custom_amount_min_kzt", 18000);

  // Номинал 15 000 → 18 000 (метки/сортировка сохраняются)
  const nominal15 = await prisma.nominal.findFirst({
    where: { amountKzt: 15000 },
  });
  if (nominal15) {
    await prisma.nominal.update({
      where: { id: nominal15.id },
      data: { amountKzt: 18000 },
    });
    console.log("номинал 15 000 → 18 000");
  } else {
    console.log("номинала 15 000 нет — пропуск");
  }

  // Foot релакс: 90→60 мин / 18 000 и 120→90 мин / 22 000
  const foot = await findProgram("Foot релакс");
  if (foot) {
    for (const [from, to, price] of [
      [90, 60, 18000],
      [120, 90, 22000],
    ] as const) {
      const opt = foot.options.find(
        (o) => o.durationMin === from && o.priceKzt === price,
      );
      if (opt) {
        await prisma.programOption.update({
          where: { id: opt.id },
          data: { durationMin: to },
        });
        console.log(`Foot релакс: ${from} мин → ${to} мин (${price} ₸)`);
      }
    }
  }

  // Энергия Таиланда: описание по прайсу (стоун-терапия)
  const stone = await findProgram("Энергия Таиланда");
  if (stone) {
    await prisma.program.update({
      where: { id: stone.id },
      data: {
        descriptions: {
          ru: "Стоун-терапия — массаж горячими камнями",
          kk: "Стоун-терапия — ыстық тастармен массаж",
          en: "Stone therapy — hot stone massage",
        },
      },
    });
    console.log("Энергия Таиланда: описание обновлено (стоун-терапия)");
  }

  // Сеты: добавить вариант «2 персоны» из прайса
  for (const [ru, price] of [
    ["Sabai Sabai", 72000],
    ["Karuna", 68000],
    ["Sanuk", 52000],
  ] as const) {
    const set = await findProgram(ru);
    if (!set) {
      console.log(`${ru}: программы нет — пропуск`);
      continue;
    }
    if (set.options.some((o) => o.persons === 2)) {
      console.log(`${ru}: вариант на 2 персоны уже есть`);
      continue;
    }
    await prisma.programOption.create({
      data: { programId: set.id, persons: 2, priceKzt: price },
    });
    console.log(`${ru}: добавлен вариант 2 персоны — ${price} ₸`);
  }

  // Деактивация программ, отсутствующих в прайсе Classic
  const notInPrice = [
    "Нежность и спокойствие",
    "Пробуждение",
    "Блаженство",
    "Вулкан жизни",
    "Анти-усталость",
    "Энергия морской воды",
    "Морское утончение",
  ];
  for (const ru of notInPrice) {
    const program = await findProgram(ru);
    if (!program) {
      console.log(`${ru}: программы нет — пропуск`);
      continue;
    }
    if (!program.active) {
      console.log(`${ru}: уже деактивирована`);
      continue;
    }
    await prisma.program.update({
      where: { id: program.id },
      data: { active: false },
    });
    console.log(`${ru}: деактивирована (нет в прайсе)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
