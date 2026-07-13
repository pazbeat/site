/**
 * Проставляет Salon.altegioLocationId по префиксу серийника (см.
 * lib/altegio/mapping.ts). Запуск: npx tsx scripts/altegio-map-salons.ts
 */
import { prisma } from "../lib/db";
import { SALON_PREFIX_TO_ALTEGIO } from "../lib/altegio/mapping";

async function main() {
  const salons = await prisma.salon.findMany({
    select: { id: true, city: true, name: true, codePrefix: true },
  });
  for (const salon of salons) {
    const companyId = salon.codePrefix
      ? SALON_PREFIX_TO_ALTEGIO[salon.codePrefix]
      : undefined;
    if (!companyId) {
      console.log(`— ${salon.city} / ${salon.name}: нет company_id (пропуск)`);
      continue;
    }
    await prisma.salon.update({
      where: { id: salon.id },
      data: { altegioLocationId: companyId },
    });
    console.log(
      `✓ ${salon.codePrefix} ${salon.city} / ${salon.name} → company ${companyId}`,
    );
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
