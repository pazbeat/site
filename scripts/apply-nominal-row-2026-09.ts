/**
 * Ряд номиналов витрины — как на действующем сайте sert.imbir.kz
 * (снимок заказчика 2026-09-14): 20 000 … 200 000, суммы 18 000 в ряду нет.
 *
 * Сам ряд круга берётся из `SITE_NOMINALS` в коде; здесь правится таблица
 * `nominals` — это номиналы админки: они дают подписи («Хит»), короткий набор
 * кнопок для филиалов без привязки к CRM и ссылки вида `/create?nominal=…`.
 * Номинал 18 000 из этого набора переводится в 20 000, чтобы ни одна ссылка
 * и ни одна кнопка не вела на сумму, которой на витрине больше нет.
 *
 * Идемпотентно: если 20 000 уже есть, лишний 18 000 просто выключается.
 * Каталог помечен `server-only`, поэтому запуск как у сверки:
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/apply-nominal-row-2026-09.ts        — применить
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/apply-nominal-row-2026-09.ts --dry  — показать
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SITE_NOMINALS } from "../lib/altegio/catalog";

async function main() {
  const dry = process.argv.includes("--dry");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const all = await prisma.nominal.findMany({ orderBy: { amountKzt: "asc" } });
    console.log("было:", all.map((n) => `${n.amountKzt}${n.active ? "" : " (выкл)"}`).join(", "));

    const old = all.find((n) => n.amountKzt === 18000);
    const has20 = all.find((n) => n.amountKzt === 20000);
    if (!old) {
      console.log("= номинала 18 000 нет — правка не нужна");
    } else if (has20) {
      console.log(`${dry ? "~" : "✓"} 20 000 уже есть — выключаем 18 000 (id ${old.id})`);
      if (!dry) await prisma.nominal.update({ where: { id: old.id }, data: { active: false } });
    } else {
      console.log(`${dry ? "~" : "✓"} 18 000 → 20 000 (id ${old.id}, метка и сортировка сохраняются)`);
      if (!dry) await prisma.nominal.update({ where: { id: old.id }, data: { amountKzt: 20000 } });
    }

    // Проверка: каждая активная сумма админки должна быть на витрине или быть
    // служебной (тестовые 100 ₸). Иначе ссылка ведёт на сумму, которой нет.
    const after = await prisma.nominal.findMany({ where: { active: true }, orderBy: { amountKzt: "asc" } });
    const strays = after.filter((n) => n.amountKzt !== 100 && !SITE_NOMINALS.includes(n.amountKzt));
    console.log("стало:", after.map((n) => n.amountKzt).join(", "));
    if (strays.length) {
      console.log("! вне ряда витрины:", strays.map((n) => n.amountKzt).join(", "));
    } else {
      console.log("все активные номиналы админки есть на витрине");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
