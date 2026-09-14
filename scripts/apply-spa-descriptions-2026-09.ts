/**
 * Описания SPA-пакетов и сетов — по составу из прайса Imbir Thai Spa Classic
 * (public/price/imbir-price-{ru,kk,en}.pdf). Было «SPA-программа, 2 часа»:
 * из такого не понять, что внутри. Теперь — длительность и главное из
 * состава, коротко, в одну-две строки под названием в конструкторе
 * (решение заказчика 2026-09-11: «чтоб не слишком длинное»).
 *
 * Хамам не упоминается намеренно: в прайсе он «Хамам/Душ» — что именно,
 * зависит от салона, и обещать хамам в описании нельзя. Чайная церемония
 * опущена ради длины.
 *
 * Идемпотентно. Прежние тексты печатаются — ими можно откатить.
 *   npx tsx scripts/apply-spa-descriptions-2026-09.ts          — применить
 *   npx tsx scripts/apply-spa-descriptions-2026-09.ts --dry    — только показать
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

type L10n = { ru: string; kk: string; en: string };

/** Ключ — русское название программы (names.ru). */
const SPA_DESCRIPTIONS: Record<string, L10n> = {
  "Страна улыбок": {
    ru: "SPA для подруг, 3 часа: скраб, обёртывание, маска для лица, Oil массаж",
    kk: "Құрбыларға арналған SPA, 3 сағат: скраб, орау, бет маскасы, Oil массажы",
    en: "Girls' spa, 3 hours: scrub, body wrap, facial mask, oil massage",
  },
  "Ты и Я": {
    ru: "SPA для пар, 2,5 часа: скраб, Oil массаж и массаж головы",
    kk: "Жұптарға арналған SPA, 2,5 сағат: скраб, Oil массажы және бас массажы",
    en: "Couples spa, 2.5 hours: scrub, oil massage and head massage",
  },
  Антистресс: {
    ru: "SPA для двоих, 3 часа: пенный массаж, скраб, Oil массаж и массаж стоп",
    kk: "Екі адамға SPA, 3 сағат: көбік массажы, скраб, Oil және табан массаждары",
    en: "Spa for two, 3 hours: foam massage, scrub, oil and foot massages",
  },
  "Энергия Сиама": {
    ru: "SPA на 2 часа: пенное очищение, скраб и Oil массаж",
    kk: "SPA, 2 сағат: көбікпен тазарту, скраб және Oil массажы",
    en: "Spa, 2 hours: foam cleansing, scrub and oil massage",
  },
  Перезагрузка: {
    ru: "SPA на 3 часа: пилинг, скраб и двухчасовой Oil массаж",
    kk: "SPA, 3 сағат: пилинг, скраб және 2 сағаттық Oil массажы",
    en: "Spa, 3 hours: peeling, scrub and 2 hours of oil massage",
  },
  "Спа Релакс": {
    ru: "SPA на 1 час: пилинг, скраб и мытьё головы",
    kk: "SPA, 1 сағат: пилинг, скраб және бас жуу",
    en: "Spa, 1 hour: peeling, scrub and hair wash",
  },
  "Sabai Sabai": {
    ru: "Сет на 2 часа: пилинг, скраб и Oil массаж",
    kk: "Ем-шаралар сеті, 2 сағат: пилинг, скраб және Oil массажы",
    en: "Treatment set, 2 hours: peeling, scrub and oil massage",
  },
  Karuna: {
    ru: "Сет на 2 часа: пилинг, скраб и тайский массаж",
    kk: "Ем-шаралар сеті, 2 сағат: пилинг, скраб және тай массажы",
    en: "Treatment set, 2 hours: peeling, scrub and Thai massage",
  },
  Sanuk: {
    ru: "Сет на 1,5 часа: пилинг, скраб и массаж спины",
    kk: "Ем-шаралар сеті, 1,5 сағат: пилинг, скраб және арқа массажы",
    en: "Treatment set, 1.5 hours: peeling, scrub and back massage",
  },
};

async function main() {
  const dry = process.argv.includes("--dry");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const programs = await prisma.program.findMany();
    const seen = new Set<string>();
    for (const p of programs) {
      const ru = (p.names as { ru?: string }).ru?.trim() ?? "";
      const next = SPA_DESCRIPTIONS[ru];
      if (!next) continue;
      seen.add(ru);
      const prev = p.descriptions as Partial<L10n>;
      if (prev.ru === next.ru && prev.kk === next.kk && prev.en === next.en) {
        console.log(`= ${ru}: уже актуально`);
        continue;
      }
      console.log(`${dry ? "~" : "✓"} ${ru} (id ${p.id})\n    было:  ${JSON.stringify(prev)}\n    стало: ${JSON.stringify(next)}`);
      if (!dry) {
        await prisma.program.update({
          where: { id: p.id },
          data: { descriptions: { ...prev, ...next } },
        });
      }
    }
    const missing = Object.keys(SPA_DESCRIPTIONS).filter((n) => !seen.has(n));
    if (missing.length) console.log(`! не найдены в базе: ${missing.join(", ")}`);
    console.log(dry ? "проверка без записи" : "готово");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
