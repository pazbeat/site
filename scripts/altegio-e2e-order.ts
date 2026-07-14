/**
 * Создаёт pending-заказ для e2e-проверки синка Altegio.
 * Запуск: npx tsx --env-file=.env scripts/altegio-e2e-order.ts
 */
import { prisma } from "../lib/db";

async function main() {
  const salon = await prisma.salon.findFirst({
    where: { active: true, altegioLocationId: 225022 },
    select: { id: true, name: true, altegioLocationId: true },
  });
  const design = await prisma.design.findFirst({ where: { active: true } });
  if (!salon || !design) throw new Error("нет салона/дизайна");

  const order = await prisma.order.create({
    data: {
      salonId: salon.id,
      buyerEmail: "izecreamchik@gmail.com",
      amountKzt: 20000,
      consent: { versions: [], ip: "127.0.0.1", ua: "e2e", ts: new Date().toISOString() },
      item: {
        type: "nominal",
        amountKzt: 20000,
        designId: design.id,
        toName: "Получатель Тест",
        fromName: "Покупатель Тест",
        delivery: { method: "whatsapp", contact: "77000000177" },
        locale: "ru",
      },
    },
  });
  console.log(
    JSON.stringify({
      orderId: order.id,
      amountKzt: order.amountKzt,
      salon: salon.name,
      company: salon.altegioLocationId,
    }),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
