/**
 * Проверка обновления карты в кошельке: «как будто в салоне списали часть».
 *
 * Меняет остаток сертификата и будит карты ровно тем же кодом, которым это
 * делает сверка с Altegio (`refreshPassesForCertificate`). Нужен, чтобы
 * увидеть обновление на телефоне, не дожидаясь настоящего погашения в салоне.
 *
 * Запуск (условие react-server обязательно — модули помечены `server-only`):
 *   NODE_OPTIONS=--conditions=react-server npx tsx \
 *     scripts/wallet-simulate-redemption.ts WM0001 50
 *
 * Первый аргумент — номер сертификата, второй — новый остаток в тенге.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { buildPassFields } from "../lib/wallet/pass";
import { toPassSource } from "../lib/wallet/service";
import { refreshPassesForCertificate } from "../lib/wallet/notify";

async function main() {
  const serial = process.argv[2];
  const balance = Number(process.argv[3]);
  if (!serial || !Number.isFinite(balance) || balance < 0) {
    console.error("Нужно: <номер сертификата> <новый остаток в тенге>");
    process.exitCode = 1;
    return;
  }

  const certificate = await prisma.certificate.findFirst({
    where: { serial },
    include: { salon: true, programOption: { include: { program: true } } },
  });
  if (!certificate) {
    console.error(`Сертификат ${serial} не найден`);
    process.exitCode = 1;
    return;
  }

  console.log(`сертификат ${serial}: было ${certificate.balanceKzt} ₸`);

  await prisma.certificate.update({
    where: { id: certificate.id },
    // Статус трогаем только на нуле — так же поступает сверка с Altegio
    data: {
      balanceKzt: balance,
      status: balance <= 0 ? "used" : certificate.status,
    },
  });
  console.log(`стало ${balance} ₸`);

  const passes = await prisma.walletPass.findMany({
    where: { certificateId: certificate.id },
    select: { platform: true, serialNumber: true, shownBalanceKzt: true },
  });
  if (passes.length === 0) {
    console.log("карт в кошельках нет — обновлять нечего");
  } else {
    for (const pass of passes) {
      console.log(
        `  карта ${pass.platform}: показано ${pass.shownBalanceKzt ?? "—"} ₸`,
      );
    }
  }

  await refreshPassesForCertificate(certificate.id);

  const after = await prisma.walletPass.findMany({
    where: { certificateId: certificate.id },
    select: { platform: true, shownBalanceKzt: true },
  });
  for (const pass of after) {
    console.log(`  карта ${pass.platform}: теперь показано ${pass.shownBalanceKzt} ₸`);
  }

  // Для наглядности: что реально лежит у сертификата после правки
  const source = toPassSource({
    ...certificate,
    balanceKzt: balance,
    status: balance <= 0 ? "used" : certificate.status,
  });
  if (source) {
    const fields = buildPassFields(source);
    console.log(
      `на карте: ${fields.balanceLabel}` +
        (fields.voidReason ? ` · ${fields.voidReason}` : " · действует"),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
