/**
 * Подтвердить оплату заказа вручную — тот же путь, которым это делает
 * админка («отметить оплаченным»). Нужен для проверки всей цепочки
 * выпуска без работающего платёжного шлюза.
 *
 * Запуск (условие react-server обязательно — модули помечены `server-only`):
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/fulfill-order.ts <orderId>
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { fulfillOrder } from "../lib/certificates";

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Нужен id заказа");
    process.exitCode = 1;
    return;
  }
  const result = await fulfillOrder(orderId, `manual-${orderId}`);
  console.log("fulfillOrder:", JSON.stringify(result));

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { certificates: { include: { salon: true } } },
  });
  if (!order) return;
  console.log("заказ:", order.status, order.amountKzt, "₸");
  for (const c of order.certificates) {
    console.log(
      `сертификат: serial=${c.serial} code=${c.codeDisplay} баланс=${c.balanceKzt} статус=${c.status} филиал=${c.salon?.name} до=${c.validUntil?.toISOString().slice(0, 10)}`,
    );
  }
  console.log("successToken:", order.successToken);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
