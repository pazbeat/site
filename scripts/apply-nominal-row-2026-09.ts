/**
 * Ряд номиналов витрины в таблице `nominals` — как на действующем сайте
 * sert.imbir.kz (снимок заказчика 2026-09-14): 20 000 … 200 000.
 *
 * С 2026-09-14 круг конструктора строится ИЗ ЭТОЙ ТАБЛИЦЫ (пересечённой с
 * товарами Altegio по филиалу), поэтому в ней должен лежать весь ряд: раньше
 * там было пять номиналов, а на витрине — восемнадцать сумм из кода, и
 * админка на витрину не влияла.
 *
 * Что делает:
 *  - заводит недостающие суммы ряда (метки и сортировку существующих не трогает);
 *  - включает выключенные суммы ряда;
 *  - выключает активные суммы ВНЕ ряда (например тестовый 100 ₸) — на витрине
 *    их быть не должно; вернуть можно кнопкой «Показать» в админке;
 *  - сортировку выставляет по возрастанию суммы.
 *
 * Идемпотентно. Каталог помечен `server-only`, поэтому запуск как у сверки:
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
    const before = await prisma.nominal.findMany({ orderBy: { amountKzt: "asc" } });
    console.log(
      "было:",
      before.map((n) => `${n.amountKzt}${n.active ? "" : " (выкл)"}`).join(", "),
    );

    const row = [...SITE_NOMINALS].sort((a, b) => a - b);
    const byAmount = new Map(before.map((n) => [n.amountKzt, n]));

    for (const [i, amountKzt] of row.entries()) {
      const found = byAmount.get(amountKzt);
      if (!found) {
        console.log(`${dry ? "~" : "+"} добавить ${amountKzt} ₸`);
        if (!dry) {
          await prisma.nominal.create({ data: { amountKzt, sort: i, active: true } });
        }
        continue;
      }
      const needs = !found.active || found.sort !== i;
      if (needs) {
        console.log(
          `${dry ? "~" : "✓"} ${amountKzt} ₸: ${found.active ? "" : "включить, "}порядок ${found.sort} → ${i}`,
        );
        if (!dry) {
          await prisma.nominal.update({
            where: { id: found.id },
            data: { active: true, sort: i },
          });
        }
      }
    }

    const strays = before.filter((n) => n.active && !row.includes(n.amountKzt));
    for (const n of strays) {
      console.log(`${dry ? "~" : "−"} скрыть ${n.amountKzt} ₸ (вне ряда витрины${n.label ? `, метка «${n.label}»` : ""})`);
      if (!dry) {
        await prisma.nominal.update({ where: { id: n.id }, data: { active: false } });
      }
    }

    const after = await prisma.nominal.findMany({
      where: { active: true },
      orderBy: { sort: "asc" },
    });
    console.log("стало на витрине:", after.map((n) => n.amountKzt).join(", "));
    console.log(dry ? "проверка без записи" : "готово");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
