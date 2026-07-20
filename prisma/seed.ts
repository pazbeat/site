/**
 * Сид по PRD Приложение А (прайс imbir.kz, июль 2026).
 * Переводы KK/EN — из утверждённого прототипа docs/prototype.html.
 * Запуск: npx prisma db seed (нужен DATABASE_URL).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ProgramCategory } from "../lib/generated/prisma/client";
import { DESIGN_SEED, PANEL_BG, PANEL_TEXT } from "./designs-data";
import { SALON_SEED } from "./salons-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type L10n = { ru: string; kk: string; en: string };
type Opt = { m?: number; pers?: number; p: number };

type SeedProgram = {
  cat: ProgramCategory;
  pop?: boolean;
  n: L10n;
  d: L10n;
  cities?: string[];
  opts: Opt[];
  /// Локальное фото (public/programs, WebP); заменяется загрузкой из админки
  photo?: string;
};

// Программы строго по официальному прайсу Imbir Thai Spa Classic
// (price/Price rus.pdf, июль 2026)
const PROGRAMS: SeedProgram[] = [
  { cat: "massage", pop: true, photo: "/programs/garmoniya-tela.webp", n: { ru: "Гармония тела", kk: "Дене үйлесімі", en: "Body Harmony" }, d: { ru: "Расслабляющий Oil массаж", kk: "Босаңсытатын Oil массажы", en: "Relaxing oil massage" }, opts: [{ m: 60, p: 22000 }, { m: 90, p: 29000 }, { m: 120, p: 38000 }] },
  { cat: "massage", pop: true, photo: "/programs/taiskoe-chudo.webp", n: { ru: "Тайское чудо", kk: "Тай кереметі", en: "Thai Miracle" }, d: { ru: "Тайский традиционный массаж", kk: "Дәстүрлі тай массажы", en: "Traditional Thai massage" }, opts: [{ m: 60, p: 19000 }, { m: 90, p: 27000 }, { m: 120, p: 35000 }] },
  { cat: "massage", pop: true, photo: "/programs/suay.webp", n: { ru: "Suay", kk: "Suay", en: "Suay" }, d: { ru: "Oil массаж с горячими мешочками", kk: "Ыстық шөп қапшықтарымен Oil массажы", en: "Oil massage with hot herbal pouches" }, opts: [{ m: 90, p: 38000 }, { m: 120, p: 40000 }] },
  { cat: "massage", photo: "/programs/sakda.webp", n: { ru: "Sakda", kk: "Sakda", en: "Sakda" }, d: { ru: "Тайский массаж с горячими мешочками", kk: "Ыстық қапшықтармен тай массажы", en: "Thai massage with hot pouches" }, opts: [{ m: 90, p: 35000 }, { m: 120, p: 38000 }] },
  { cat: "massage", photo: "/programs/energiya-tailanda.webp", n: { ru: "Энергия Таиланда", kk: "Таиланд энергиясы", en: "Energy of Thailand" }, d: { ru: "Стоун-терапия — массаж горячими камнями", kk: "Стоун-терапия — ыстық тастармен массаж", en: "Stone therapy — hot stone massage" }, opts: [{ m: 90, p: 36000 }, { m: 120, p: 39000 }] },
  { cat: "massage", photo: "/programs/graciya.webp", n: { ru: "Грация", kk: "Сымбат", en: "Grace" }, d: { ru: "Тайский массаж спины с травяным бальзамом", kk: "Шөп бальзамымен арқа массажы", en: "Thai back massage with herbal balm" }, opts: [{ m: 60, p: 18000 }] },
  { cat: "massage", photo: "/programs/foot-relaks.webp", n: { ru: "Foot релакс", kk: "Foot релакс", en: "Foot Relax" }, d: { ru: "Тайский массаж стоп", kk: "Тай табан массажы", en: "Thai foot massage" }, opts: [{ m: 60, p: 18000 }, { m: 90, p: 22000 }] },
  { cat: "massage", photo: "/programs/yasnye-mysli.webp", n: { ru: "Ясные мысли", kk: "Ашық ойлар", en: "Clear Mind" }, d: { ru: "Массаж шейно-воротниковой зоны и массаж стоп", kk: "Мойын аймағы мен табан массажы", en: "Neck & shoulder massage plus foot massage" }, opts: [{ m: 60, p: 18000 }] },
  { cat: "massage", n: { ru: "Массаж головы и шеи", kk: "Бас пен мойын массажы", en: "Head & Neck Massage" }, d: { ru: "Расслабляющий Oil массаж", kk: "Босаңсытатын Oil массажы", en: "Relaxing oil massage" }, opts: [{ m: 60, p: 18000 }] },
  { cat: "massage", n: { ru: "Чудесное ожидание", kk: "Ғажайып күту", en: "Wonderful Expectation" }, d: { ru: "Расслабляющий массаж для беременных", kk: "Жүкті әйелдерге арналған массаж", en: "Relaxing prenatal massage" }, opts: [{ m: 60, p: 24000 }, { m: 90, p: 30000 }] },
  { cat: "massage", photo: "/programs/malenkii-budda.webp", n: { ru: "Маленький Будда", kk: "Кішкентай Будда", en: "Little Buddha" }, d: { ru: "Оздоровительный массаж для детей 6–12 лет", kk: "6–12 жас балаларға арналған массаж", en: "Wellness massage for kids aged 6–12" }, opts: [{ m: 60, p: 16000 }] },
  { cat: "spa", pop: true, photo: "/programs/strana-ulybok.webp", n: { ru: "Страна улыбок", kk: "Күлкі елі", en: "Land of Smiles" }, d: { ru: "SPA-программа для подруг, 3 часа", kk: "Құрбыларға арналған SPA, 3 сағат", en: "Spa program for friends, 3 hours" }, opts: [{ pers: 2, p: 90000 }, { pers: 3, p: 132000 }] },
  { cat: "spa", pop: true, photo: "/programs/ty-i-ya.webp", n: { ru: "Ты и Я", kk: "Сен және Мен", en: "You & Me" }, d: { ru: "SPA-программа для пар, 2,5 часа", kk: "Жұптарға арналған SPA, 2,5 сағат", en: "Couples spa program, 2.5 hours" }, opts: [{ pers: 2, p: 70000 }] },
  { cat: "spa", n: { ru: "Антистресс", kk: "Антистресс", en: "Anti-Stress" }, d: { ru: "SPA-программа на двоих, 3 часа", kk: "Екі адамға SPA, 3 сағат", en: "Spa program for two, 3 hours" }, opts: [{ pers: 2, p: 88000 }] },
  { cat: "spa", n: { ru: "Энергия Сиама", kk: "Сиам энергиясы", en: "Energy of Siam" }, d: { ru: "SPA-программа, 2 часа", kk: "SPA бағдарламасы, 2 сағат", en: "Spa program, 2 hours" }, opts: [{ m: 120, p: 35000 }] },
  { cat: "spa", n: { ru: "Перезагрузка", kk: "Қайта жүктелу", en: "Reboot" }, d: { ru: "SPA-программа, 3 часа", kk: "SPA бағдарламасы, 3 сағат", en: "Spa program, 3 hours" }, opts: [{ m: 180, p: 55000 }] },
  { cat: "spa", n: { ru: "Спа Релакс", kk: "Спа Релакс", en: "Spa Relax" }, d: { ru: "SPA-программа, 1 час", kk: "SPA бағдарламасы, 1 сағат", en: "Spa program, 1 hour" }, opts: [{ m: 60, p: 20000 }] },
  { cat: "set", pop: true, photo: "/programs/sabai-sabai.webp", n: { ru: "Sabai Sabai", kk: "Sabai Sabai", en: "Sabai Sabai" }, d: { ru: "Сет процедур, 2 часа", kk: "Ем-шаралар сеті, 2 сағат", en: "Treatment set, 2 hours" }, opts: [{ m: 120, p: 38000 }, { pers: 2, p: 72000 }] },
  { cat: "set", photo: "/programs/karuna.webp", n: { ru: "Karuna", kk: "Karuna", en: "Karuna" }, d: { ru: "Сет процедур, 2 часа", kk: "Ем-шаралар сеті, 2 сағат", en: "Treatment set, 2 hours" }, opts: [{ m: 120, p: 36000 }, { pers: 2, p: 68000 }] },
  { cat: "set", photo: "/programs/sanuk.webp", n: { ru: "Sanuk", kk: "Sanuk", en: "Sanuk" }, d: { ru: "Сет процедур, 1,5 часа", kk: "Ем-шаралар сеті, 1,5 сағат", en: "Treatment set, 1.5 hours" }, opts: [{ m: 90, p: 28000 }, { pers: 2, p: 52000 }] },
];

const SALONS = SALON_SEED;

const NOMINALS = [
  { amountKzt: 18000, label: null as string | null },
  { amountKzt: 30000, label: null },
  { amountKzt: 50000, label: "Хит" },
  { amountKzt: 100000, label: null },
];

// Дизайны — художественные открытки бренда (public/designs/…webp).
// Каталог в prisma/designs-data.ts; персонализация/код рисуются в панели снизу.
const DESIGNS = DESIGN_SEED.map((d) => ({
  names: d.names,
  imageUrl: d.file,
  bgStyle: PANEL_BG,
  textColor: PANEL_TEXT,
}));

// Реальные правовые тексты (санитизированный HTML в prisma/legal/*.{lang}.html;
// RU импортирован из docx заказчика, KK/EN — переводы; scripts/import-legal.ts).
function legalHtml(type: string, lang: string): string | null {
  const file = path.join(process.cwd(), "prisma", "legal", `${type}.${lang}.html`);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

const LEGAL_PLACEHOLDERS: Array<{
  type: "offer" | "privacy" | "rules" | "consent_modal";
  html: string;
}> = [
  { type: "consent_modal", html: "<p>Привет, ты точно хочешь купить?</p>" },
  { type: "offer", html: legalHtml("offer", "ru") ?? "" },
  { type: "privacy", html: legalHtml("privacy", "ru") ?? "" },
  { type: "rules", html: legalHtml("rules", "ru") ?? "" },
];

async function main() {
  // Идемпотентность: сид справочников выполняется только в пустую БД
  if ((await prisma.program.count()) > 0) {
    console.log("Программы уже есть — сид пропущен.");
    return;
  }

  for (const [i, s] of SALONS.entries()) {
    await prisma.salon.create({
      data: { ...s, phone: "+7 708 111 8098", sort: i },
    });
  }

  for (const [i, p] of PROGRAMS.entries()) {
    await prisma.program.create({
      data: {
        category: p.cat,
        names: p.n,
        descriptions: p.d,
        photoUrl: p.photo ?? null,
        highlight: p.pop ? "hit" : null,
        cities: p.cities ?? [],
        sort: i,
        options: {
          create: p.opts.map((o) => ({
            durationMin: o.m ?? null,
            persons: o.pers ?? null,
            priceKzt: o.p,
          })),
        },
      },
    });
  }

  for (const [i, n] of NOMINALS.entries()) {
    await prisma.nominal.create({ data: { ...n, sort: i } });
  }

  for (const [i, d] of DESIGNS.entries()) {
    await prisma.design.create({ data: { ...d, sort: i } });
  }

  for (const doc of LEGAL_PLACEHOLDERS) {
    const document = await prisma.legalDocument.create({
      data: { type: doc.type },
    });
    // RU — актуальная версия; KK/EN — переводы (если есть файлы)
    const ruVersion = await prisma.legalVersion.create({
      data: { documentId: document.id, contentHtmlSanitized: doc.html, lang: "ru" },
    });
    await prisma.legalDocument.update({
      where: { id: document.id },
      data: { currentVersionId: ruVersion.id },
    });
    for (const lang of ["kk", "en"] as const) {
      const html = legalHtml(doc.type, lang);
      if (!html) continue;
      await prisma.legalVersion.create({
        data: { documentId: document.id, contentHtmlSanitized: html, lang },
      });
    }
  }

  await prisma.setting.createMany({
    data: [
      { key: "certificate_validity_months", value: 3 },
      { key: "custom_amount_min_kzt", value: 18000 },
      { key: "custom_amount_max_kzt", value: 500000 },
      {
        key: "contacts",
        value: { phone: "+7 708 111 8098", email: "spa@imbir.kz" },
      },
    ],
  });

  console.log(`Сид завершён: ${SALONS.length} филиалов, ${PROGRAMS.length} программ (по прайсу Classic), ${NOMINALS.length} номинала, ${DESIGNS.length} дизайна, правовые тексты.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
