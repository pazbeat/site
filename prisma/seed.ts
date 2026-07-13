/**
 * Сид по PRD Приложение А (прайс imbir.kz, июль 2026).
 * Переводы KK/EN — из утверждённого прототипа docs/prototype.html.
 * Запуск: npx prisma db seed (нужен DATABASE_URL).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ProgramCategory } from "../lib/generated/prisma/client";

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
};

// Фото с действующего сайта imbir.kz (как в прототипе), ключ — индекс
// в массиве PROGRAMS; заменятся загрузками из админки
const IMG = "https://www.imbir.kz/wp-content/uploads/";
const PHOTOS: Record<number, string> = {
  0: "2015/02/m1-800x600.jpg",
  1: "2018/08/m26-800x600.jpg",
  2: "2018/01/m18-800x600.jpg",
  3: "2018/01/m19@2x-800x600.jpg",
  4: "2018/01/m6-800x600.jpg",
  5: "2018/01/m7-800x600.jpg",
  6: "2015/02/m5-800x1200.jpg",
  7: "2018/04/m9-800x600.jpg",
  8: "2018/01/m10-800x600.jpg",
  9: "2018/01/m12-800x600.jpg",
  11: "2018/01/m3-800x1200.jpg",
  12: "2018/04/m8-800x600.jpg",
  14: "2015/02/m4-800x600.jpg",
  15: "2018/04/m22-800x600.jpg",
  16: "2015/02/m23-800x1200.jpg",
  24: "2018/01/m24-800x600.jpg",
  25: "2018/04/m25-800x600.jpg",
  26: "2018/04/m26-1-800x600.jpg",
};

const ASTANA_ALMATY = ["Астана", "Алматы"];

const PROGRAMS: SeedProgram[] = [
  { cat: "massage", pop: true, n: { ru: "Гармония тела", kk: "Дене үйлесімі", en: "Body Harmony" }, d: { ru: "Расслабляющий Oil массаж", kk: "Босаңсытатын Oil массажы", en: "Relaxing oil massage" }, opts: [{ m: 60, p: 22000 }, { m: 90, p: 29000 }, { m: 120, p: 38000 }] },
  { cat: "massage", pop: true, n: { ru: "Тайское чудо", kk: "Тай кереметі", en: "Thai Miracle" }, d: { ru: "Тайский традиционный массаж", kk: "Дәстүрлі тай массажы", en: "Traditional Thai massage" }, opts: [{ m: 60, p: 19000 }, { m: 90, p: 27000 }, { m: 120, p: 35000 }] },
  { cat: "massage", pop: true, n: { ru: "Suay", kk: "Suay", en: "Suay" }, d: { ru: "Oil массаж с горячими мешочками", kk: "Ыстық шөп қапшықтарымен Oil массажы", en: "Oil massage with hot herbal pouches" }, opts: [{ m: 90, p: 38000 }, { m: 120, p: 40000 }] },
  { cat: "massage", n: { ru: "Sakda", kk: "Sakda", en: "Sakda" }, d: { ru: "Тайский массаж с горячими мешочками", kk: "Ыстық қапшықтармен тай массажы", en: "Thai massage with hot pouches" }, opts: [{ m: 90, p: 35000 }, { m: 120, p: 38000 }] },
  { cat: "massage", n: { ru: "Нежность и спокойствие", kk: "Нәзіктік пен тыныштық", en: "Tenderness & Calm" }, d: { ru: "Расслабляющий Oil массаж и массаж стоп", kk: "Oil массажы және табан массажы", en: "Relaxing oil massage & foot massage" }, opts: [{ m: 90, p: 28000 }, { m: 120, p: 38000 }] },
  { cat: "massage", pop: true, n: { ru: "Пробуждение", kk: "Ояну", en: "Awakening" }, d: { ru: "Тайский традиционный массаж и массаж стоп", kk: "Тай массажы және табан массажы", en: "Traditional Thai massage & foot massage" }, opts: [{ m: 90, p: 26000 }, { m: 120, p: 33000 }] },
  { cat: "massage", n: { ru: "Энергия Таиланда", kk: "Таиланд энергиясы", en: "Energy of Thailand" }, d: { ru: "Тайский массаж с горячими камнями", kk: "Ыстық тастармен тай массажы", en: "Thai massage with hot stones" }, opts: [{ m: 90, p: 36000 }, { m: 120, p: 39000 }] },
  { cat: "massage", n: { ru: "Грация", kk: "Сымбат", en: "Grace" }, d: { ru: "Тайский массаж спины с травяным бальзамом", kk: "Шөп бальзамымен арқа массажы", en: "Thai back massage with herbal balm" }, opts: [{ m: 60, p: 18000 }] },
  { cat: "massage", n: { ru: "Foot релакс", kk: "Foot релакс", en: "Foot Relax" }, d: { ru: "Тайский массаж стоп", kk: "Тай табан массажы", en: "Thai foot massage" }, opts: [{ m: 90, p: 18000 }, { m: 120, p: 22000 }] },
  { cat: "massage", n: { ru: "Ясные мысли", kk: "Ашық ойлар", en: "Clear Mind" }, d: { ru: "Массаж шейно-воротниковой зоны и массаж стоп", kk: "Мойын аймағы мен табан массажы", en: "Neck & shoulder massage plus foot massage" }, opts: [{ m: 60, p: 18000 }] },
  { cat: "massage", n: { ru: "Массаж головы и шеи", kk: "Бас пен мойын массажы", en: "Head & Neck Massage" }, d: { ru: "Расслабляющий Oil массаж", kk: "Босаңсытатын Oil массажы", en: "Relaxing oil massage" }, opts: [{ m: 60, p: 18000 }] },
  { cat: "massage", n: { ru: "Блаженство", kk: "Рахат", en: "Bliss" }, d: { ru: "Oil массаж в 4 руки — два мастера одновременно", kk: "4 қолмен Oil массажы — екі шебер бір мезгілде", en: "Four-hands oil massage by two therapists" }, opts: [{ m: 60, p: 50000 }, { m: 120, p: 70000 }] },
  { cat: "massage", n: { ru: "Вулкан жизни", kk: "Өмір жанартауы", en: "Volcano of Life" }, d: { ru: "Тайский традиционный массаж и Oil массаж", kk: "Тай массажы және Oil массажы", en: "Traditional Thai massage & oil massage" }, opts: [{ m: 120, p: 38000 }] },
  { cat: "massage", n: { ru: "Чудесное ожидание", kk: "Ғажайып күту", en: "Wonderful Expectation" }, d: { ru: "Расслабляющий массаж для беременных", kk: "Жүкті әйелдерге арналған массаж", en: "Relaxing prenatal massage" }, opts: [{ m: 60, p: 24000 }, { m: 90, p: 30000 }] },
  { cat: "massage", n: { ru: "Маленький Будда", kk: "Кішкентай Будда", en: "Little Buddha" }, d: { ru: "Оздоровительный массаж для детей 6–12 лет", kk: "6–12 жас балаларға арналған массаж", en: "Wellness massage for kids aged 6–12" }, opts: [{ m: 60, p: 16000 }] },
  { cat: "spa", pop: true, n: { ru: "Страна улыбок", kk: "Күлкі елі", en: "Land of Smiles" }, d: { ru: "SPA-программа для подруг, 3 часа", kk: "Құрбыларға арналған SPA, 3 сағат", en: "Spa program for friends, 3 hours" }, opts: [{ pers: 2, p: 90000 }, { pers: 3, p: 132000 }] },
  { cat: "spa", pop: true, n: { ru: "Ты и Я", kk: "Сен және Мен", en: "You & Me" }, d: { ru: "SPA-программа для пар, 2,5 часа", kk: "Жұптарға арналған SPA, 2,5 сағат", en: "Couples spa program, 2.5 hours" }, opts: [{ pers: 2, p: 70000 }] },
  { cat: "spa", n: { ru: "Антистресс", kk: "Антистресс", en: "Anti-Stress" }, d: { ru: "SPA-программа на двоих, 3 часа", kk: "Екі адамға SPA, 3 сағат", en: "Spa program for two, 3 hours" }, opts: [{ pers: 2, p: 88000 }] },
  { cat: "spa", n: { ru: "Энергия Сиама", kk: "Сиам энергиясы", en: "Energy of Siam" }, d: { ru: "SPA-программа, 2 часа", kk: "SPA бағдарламасы, 2 сағат", en: "Spa program, 2 hours" }, opts: [{ m: 120, p: 35000 }] },
  { cat: "spa", n: { ru: "Перезагрузка", kk: "Қайта жүктелу", en: "Reboot" }, d: { ru: "SPA-программа, 3 часа", kk: "SPA бағдарламасы, 3 сағат", en: "Spa program, 3 hours" }, opts: [{ m: 180, p: 55000 }] },
  { cat: "spa", cities: ASTANA_ALMATY, n: { ru: "Анти-усталость", kk: "Шаршауға қарсы", en: "Anti-Fatigue" }, d: { ru: "SPA-программа, 2,5 часа", kk: "SPA бағдарламасы, 2,5 сағат", en: "Spa program, 2.5 hours" }, opts: [{ m: 150, p: 65000 }] },
  { cat: "spa", cities: ASTANA_ALMATY, n: { ru: "Энергия морской воды", kk: "Теңіз суының энергиясы", en: "Sea Water Energy" }, d: { ru: "SPA-программа, 2,5 часа", kk: "SPA бағдарламасы, 2,5 сағат", en: "Spa program, 2.5 hours" }, opts: [{ m: 150, p: 47000 }] },
  { cat: "spa", cities: ASTANA_ALMATY, n: { ru: "Морское утончение", kk: "Теңіз нәзіктігі", en: "Marine Refinement" }, d: { ru: "SPA-программа, 2,5 часа", kk: "SPA бағдарламасы, 2,5 сағат", en: "Spa program, 2.5 hours" }, opts: [{ m: 150, p: 55000 }] },
  { cat: "spa", n: { ru: "Спа Релакс", kk: "Спа Релакс", en: "Spa Relax" }, d: { ru: "SPA-программа, 1 час", kk: "SPA бағдарламасы, 1 сағат", en: "Spa program, 1 hour" }, opts: [{ m: 60, p: 20000 }] },
  { cat: "set", pop: true, n: { ru: "Sabai Sabai", kk: "Sabai Sabai", en: "Sabai Sabai" }, d: { ru: "Сет процедур, 2 часа", kk: "Ем-шаралар сеті, 2 сағат", en: "Treatment set, 2 hours" }, opts: [{ m: 120, p: 38000 }] },
  { cat: "set", n: { ru: "Karuna", kk: "Karuna", en: "Karuna" }, d: { ru: "Сет процедур, 2 часа", kk: "Ем-шаралар сеті, 2 сағат", en: "Treatment set, 2 hours" }, opts: [{ m: 120, p: 36000 }] },
  { cat: "set", n: { ru: "Sanuk", kk: "Sanuk", en: "Sanuk" }, d: { ru: "Сет процедур, 1,5 часа", kk: "Ем-шаралар сеті, 1,5 сағат", en: "Treatment set, 1.5 hours" }, opts: [{ m: 90, p: 28000 }] },
];

// codePrefix — префикс серийного номера сертификата (WM001…) для салона
const SALONS: Array<{
  city: string;
  name: string;
  address: string;
  codePrefix: string;
}> = [
  { city: "Астана", name: "Имбирь на Мәңгілік Ел", address: "пр. Мәңгілік Ел 29/2", codePrefix: "WM" },
  { city: "Астана", name: "Имбирь на Тәуелсіздік", address: "пр. Тәуелсіздік 40/5 (по старому 46/6)", codePrefix: "WT" },
  { city: "Астана", name: "Имбирь в ЖК «Глория»", address: "пр. Әліхан Бөкейхан 24 (ЖК «Глория»)", codePrefix: "WB" },
  { city: "Алматы", name: "Имбирь в ЖК «Шанырак»", address: "ул. Наурызбай Батыра 99/1, ЖК «Шанырак»", codePrefix: "WN" },
  { city: "Алматы", name: "Имбирь в ЖК «Вавилон»", address: "ул. Розыбакиева 247, ЖК «Вавилон»", codePrefix: "WR" },
  { city: "Караганда", name: "Имбирь в БЦ «Grey Plaza»", address: "ул. Гоголя 34А, БЦ «Grey Plaza»", codePrefix: "WK" },
  { city: "Павлодар", name: "Имбирь в гостинице «Иртыш»", address: "ул. Ак. Бектурова 79, гостиница «Иртыш»", codePrefix: "WP" },
  // Семей (WS) — филиал будет добавлен после получения адреса
];

const NOMINALS = [
  { amountKzt: 15000, label: null as string | null },
  { amountKzt: 30000, label: null },
  { amountKzt: 50000, label: "Хит" },
  { amountKzt: 100000, label: null },
];

// Дизайны открыток — только фирменная палитра (PRD §3.1, §6.3)
const DESIGNS = [
  {
    names: { ru: "Фиолетовый", kk: "Күлгін", en: "Purple" },
    bgStyle: { kind: "solid", color: "#4D295D" },
    textColor: "#FFFFFF",
  },
  {
    names: { ru: "Золото", kk: "Алтын", en: "Gold" },
    bgStyle: { kind: "gradient", from: "#B69244", to: "#B59243", angle: 120 },
    textColor: "#FFFFFF",
  },
  {
    names: { ru: "Фиолетовый с золотом", kk: "Алтын жалатылған күлгін", en: "Purple & Gold" },
    bgStyle: { kind: "gradient", from: "#4D295D", to: "#B69244", angle: 135 },
    textColor: "#FFFFFF",
  },
  {
    names: { ru: "Белый с золотой рамкой", kk: "Алтын жиекті ақ", en: "White with gold frame" },
    bgStyle: { kind: "solid", color: "#FFFFFF", border: "#B69244" },
    textColor: "#4D295D",
  },
];

const LEGAL_PLACEHOLDERS: Array<{
  type: "offer" | "privacy" | "rules" | "consent_modal";
  html: string;
}> = [
  { type: "consent_modal", html: "<p>Привет, ты точно хочешь купить?</p>" },
  { type: "offer", html: "<p>Публичная оферта — текст в подготовке. Плейсхолдер до получения от бизнеса (PRD, открытый вопрос №4).</p>" },
  { type: "privacy", html: "<p>Политика конфиденциальности — текст в подготовке. Плейсхолдер до получения от бизнеса (PRD, открытый вопрос №4).</p>" },
  { type: "rules", html: "<p>Правила использования сертификатов — текст в подготовке. Плейсхолдер до получения от бизнеса (PRD, открытый вопрос №4).</p>" },
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
        photoUrl: PHOTOS[i] ? IMG + PHOTOS[i] : null,
        popular: p.pop ?? false,
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
    const version = await prisma.legalVersion.create({
      data: {
        documentId: document.id,
        contentHtmlSanitized: doc.html,
        lang: "ru",
      },
    });
    await prisma.legalDocument.update({
      where: { id: document.id },
      data: { currentVersionId: version.id },
    });
  }

  await prisma.setting.createMany({
    data: [
      { key: "certificate_validity_months", value: 12 },
      { key: "custom_amount_min_kzt", value: 5000 },
      { key: "custom_amount_max_kzt", value: 500000 },
      {
        key: "contacts",
        value: { phone: "+7 708 111 8098", email: "spa@imbir.kz" },
      },
    ],
  });

  console.log("Сид завершён: 7 филиалов, 27 программ, 4 номинала, 4 дизайна, правовые плейсхолдеры.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
