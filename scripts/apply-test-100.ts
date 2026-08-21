/**
 * Тестовая покупка на 100 ₸ — номинал и программа.
 *   Включить:  npx tsx scripts/apply-test-100.ts
 *   Убрать:    npx tsx scripts/apply-test-100.ts off
 *
 * Нужны, чтобы проверить реальную оплату Kaspi/Forte, не тратя тысячи тенге.
 * Намеренно НЕ в сиде: перед боевым запуском их надо убрать, а сид на
 * непустой БД всё равно не выполняется (prisma/seed.ts:92).
 *
 * На текущем сайте заказчика такой номинал помечен «работает только на
 * Мангилик» — товар-сертификат на 100 ₸ заведён в Altegio лишь там.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_AMOUNT = 100;
const TEST_LABEL = "ТЕСТ";
const TEST_PROGRAM_RU = "Тестовая покупка 100 ₸";

async function enable() {
  // Номинал
  const nominal = await prisma.nominal.findFirst({ where: { amountKzt: TEST_AMOUNT } });
  if (nominal) {
    await prisma.nominal.update({
      where: { id: nominal.id },
      data: { active: true, label: TEST_LABEL, sort: -1 },
    });
    console.log(`  номинал 100 ₸: включён (id ${nominal.id})`);
  } else {
    const created = await prisma.nominal.create({
      data: { amountKzt: TEST_AMOUNT, label: TEST_LABEL, active: true, sort: -1 },
    });
    console.log(`  номинал 100 ₸: создан (id ${created.id})`);
  }

  // Программа
  const existing = await prisma.program.findFirst({
    where: { names: { path: ["ru"], equals: TEST_PROGRAM_RU } },
    include: { options: true },
  });
  if (existing) {
    await prisma.program.update({ where: { id: existing.id }, data: { active: true } });
    console.log(`  программа: включена (id ${existing.id})`);
    return;
  }
  const program = await prisma.program.create({
    data: {
      category: "massage",
      names: { ru: TEST_PROGRAM_RU, kk: "Сынақ сатып алу 100 ₸", en: "Test purchase 100 ₸" },
      descriptions: {
        ru: "Служебная позиция для проверки оплаты. Не продаётся клиентам.",
        kk: "Төлемді тексеруге арналған қызметтік позиция.",
        en: "Service item for payment testing. Not for customers.",
      },
      photoUrl: "/programs/spa-relaks.webp",
      active: true,
      sort: -1,
      options: { create: [{ durationMin: 60, priceKzt: TEST_AMOUNT }] },
    },
  });
  console.log(`  программа: создана (id ${program.id})`);
}

async function disable() {
  const n = await prisma.nominal.updateMany({
    where: { amountKzt: TEST_AMOUNT },
    data: { active: false },
  });
  console.log(`  номинал 100 ₸: отключён (${n.count})`);
  const p = await prisma.program.updateMany({
    where: { names: { path: ["ru"], equals: TEST_PROGRAM_RU } },
    data: { active: false },
  });
  console.log(`  программа: отключена (${p.count})`);
}

async function main() {
  const off = process.argv[2] === "off";
  console.log(off ? "Убираю тестовую покупку:" : "Включаю тестовую покупку:");
  await (off ? disable() : enable());
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
