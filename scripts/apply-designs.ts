/**
 * Заменяет дизайны открыток в существующей БД на художественные (public/designs).
 * Сид идемпотентно-пропускается на непустой базе, поэтому применяем отдельно.
 *
 * - Старые CSS-дизайны (imageUrl = null) деактивируются (не удаляем — на них
 *   могут ссылаться проданные сертификаты).
 * - Картиночные дизайны из designs-data.ts апсертятся по imageUrl (идемпотентно),
 *   выставляется active=true и порядок sort.
 *
 * Запуск: npx tsx scripts/apply-designs.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { DESIGN_SEED, PANEL_BG, PANEL_TEXT } from "../prisma/designs-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Спрятать старые CSS-дизайны из выбора
  const hidden = await prisma.design.updateMany({
    where: { imageUrl: null, active: true },
    data: { active: false },
  });
  console.log(`Скрыто старых CSS-дизайнов: ${hidden.count}`);

  // 2. Апсерт картиночных дизайнов
  let created = 0;
  let updated = 0;
  for (const [i, d] of DESIGN_SEED.entries()) {
    const existing = await prisma.design.findFirst({
      where: { imageUrl: d.file },
    });
    const data = {
      names: d.names,
      imageUrl: d.file,
      bgStyle: PANEL_BG,
      textColor: PANEL_TEXT,
      active: true,
      sort: i,
    };
    if (existing) {
      await prisma.design.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.design.create({ data });
      created++;
    }
  }
  console.log(`Картиночных дизайнов: создано ${created}, обновлено ${updated}`);

  const total = await prisma.design.count({ where: { active: true } });
  console.log(`Активных дизайнов теперь: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
