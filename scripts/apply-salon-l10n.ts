/**
 * Разовая заливка переводов городов/адресов филиалов в живую БД
 * (сид пропускается, если данные уже есть). Идемпотентно, ключ — codePrefix.
 * Запуск: npx tsx scripts/apply-salon-l10n.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SALON_SEED } from "../prisma/salons-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const s of SALON_SEED) {
    const salon = await prisma.salon.findUnique({
      where: { codePrefix: s.codePrefix },
    });
    if (!salon) {
      console.log(`${s.codePrefix}: филиала нет в БД — пропуск`);
      continue;
    }
    await prisma.salon.update({
      where: { id: salon.id },
      data: { cityNames: s.cityNames, addressNames: s.addressNames },
    });
    console.log(
      `${s.codePrefix}: ${s.cityNames.kk} / ${s.cityNames.en} · ${s.addressNames.en}`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
