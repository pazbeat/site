/**
 * Записать уже выпущенный сертификат в Altegio и дождаться результата.
 *
 * В боевом пути `fulfillOrder` пускает синк без await (best-effort), поэтому
 * проверить его отдельно нечем. Скрипт делает ровно тот же вызов, но ждёт
 * ответ и печатает его.
 *
 * Запуск:
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/altegio-sync-cert.ts <serial>
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { syncCertificateToAltegio } from "../lib/altegio/sync";

async function main() {
  const serial = process.argv[2];
  const cert = await prisma.certificate.findFirst({ where: { serial } });
  if (!cert) {
    console.error(`Сертификат ${serial} не найден`);
    process.exitCode = 1;
    return;
  }
  const result = await syncCertificateToAltegio(cert.id);
  console.log("результат синка:", JSON.stringify(result, null, 1));
  const after = await prisma.certificate.findUnique({
    where: { id: cert.id },
    select: { serial: true, altegioCertId: true, altegioSyncedAt: true, altegioSyncStatus: true },
  });
  console.log("в базе:", JSON.stringify(after));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
