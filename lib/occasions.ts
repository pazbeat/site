import type { Locale } from "@/i18n/routing";
import type { ProgramDto } from "./types";

/**
 * Сезонные кампании: лендинги под повод (Новый год, 8 марта, 14 февраля,
 * Наурыз, день рождения, «спасибо»). Статичный конфиг — как guest-info/tips.
 * Каждый повод отбирает подходящие программы и красит hero своим акцентом.
 */

type MonthDay = { m: number; d: number };

export type Occasion = {
  slug: string;
  emoji: string;
  /** Окно активности (для баннера/сезонности); нет — evergreen (круглый год) */
  window?: { from: MonthDay; to: MonthDay };
  /** Акцентный градиент hero (в рамках фирменной палитры) */
  accentFrom: string;
  accentTo: string;
  names: Record<Locale, string>;
  /** Короткое название для баннера («8 марта»); нет — берём names */
  short?: Record<Locale, string>;
  headline: Record<Locale, string>;
  subtitle: Record<Locale, string>;
  lead: Record<Locale, string>;
  /** Отбор программ под повод (по метке/категории/на двоих) */
  filter: (p: ProgramDto) => boolean;
};

const couples = (p: ProgramDto) => p.options.some((o) => (o.persons ?? 0) >= 2);

export const OCCASIONS: Occasion[] = [
  {
    slug: "birthday",
    emoji: "🎂",
    accentFrom: "#4D295D",
    accentTo: "#8a4a6f",
    names: {
      ru: "Подарок на день рождения",
      kk: "Туған күнге сыйлық",
      en: "Birthday gift",
    },
    headline: {
      ru: "Подарите не вещь, а впечатление",
      kk: "Затты емес, әсерді сыйлаңыз",
      en: "Give an experience, not a thing",
    },
    subtitle: {
      ru: "Сертификаты на массаж и SPA — подарок, который запомнится",
      kk: "Массаж бен SPA сертификаттары — есте қаларлық сыйлық",
      en: "Massage & SPA certificates — a gift they'll remember",
    },
    lead: {
      ru: "Выберите программу или номинал, добавьте тёплое поздравление — и подарок мгновенно уйдёт имениннику на email или в WhatsApp.",
      kk: "Бағдарламаны немесе номиналды таңдаңыз, жылы құттықтау қосыңыз — сыйлық сол сәтте email не WhatsApp арқылы жетеді.",
      en: "Pick a programme or an amount, add a warm note — the gift is delivered to email or WhatsApp instantly.",
    },
    filter: (p) => p.highlight === "hit" || p.highlight === "trend",
  },
  {
    slug: "new-year",
    emoji: "❄️",
    window: { from: { m: 12, d: 1 }, to: { m: 1, d: 10 } },
    accentFrom: "#1a0d20",
    accentTo: "#4D295D",
    names: {
      ru: "Подарок на Новый год",
      kk: "Жаңа жылға сыйлық",
      en: "New Year gift",
    },
    short: { ru: "Новый год", kk: "Жаңа жыл", en: "New Year" },
    headline: {
      ru: "Тёплый подарок к самому холодному празднику",
      kk: "Ең суық мерекеге жылы сыйлық",
      en: "A warm gift for the coldest holiday",
    },
    subtitle: {
      ru: "Порадуйте близких тайским теплом под Новый год",
      kk: "Жаңа жылда жақындарыңызды тай жылуымен қуантыңыз",
      en: "Treat your loved ones to Thai warmth this New Year",
    },
    lead: {
      ru: "Успейте подарить расслабление до праздников — сертификат действует 3 месяца, а доставку можно назначить на нужную дату.",
      kk: "Мерекеге дейін демалыс сыйлауға үлгеріңіз — сертификат 3 ай жарамды, жеткізуді қажет күнге белгілеуге болады.",
      en: "Gift relaxation before the holidays — the certificate is valid for 3 months and delivery can be scheduled for any date.",
    },
    filter: (p) => p.category === "set" || p.category === "spa",
  },
  {
    slug: "valentine",
    emoji: "❤️",
    window: { from: { m: 2, d: 1 }, to: { m: 2, d: 15 } },
    accentFrom: "#4D295D",
    accentTo: "#a33b5c",
    names: {
      ru: "Подарок на 14 февраля",
      kk: "14 ақпанға сыйлық",
      en: "Valentine's gift",
    },
    short: { ru: "14 февраля", kk: "14 ақпан", en: "Valentine's Day" },
    headline: {
      ru: "SPA для двоих — язык любви без слов",
      kk: "Екеуге арналған SPA — сөзсіз махаббат тілі",
      en: "SPA for two — love without words",
    },
    subtitle: {
      ru: "Парные программы ко Дню всех влюблённых",
      kk: "Ғашықтар күніне арналған жұптық бағдарламалар",
      en: "Couples' programmes for Valentine's Day",
    },
    lead: {
      ru: "Подарите вечер вдвоём — программы на двух гостей, где процедуры проходят рядом.",
      kk: "Екеуге кешті сыйлаңыз — екі қонаққа арналған бағдарламалар, рәсімдер қатар өтеді.",
      en: "Gift an evening together — programmes for two guests, side by side.",
    },
    filter: couples,
  },
  {
    slug: "march-8",
    emoji: "🌷",
    window: { from: { m: 2, d: 20 }, to: { m: 3, d: 9 } },
    accentFrom: "#4D295D",
    accentTo: "#9a4a86",
    names: {
      ru: "Подарок на 8 марта",
      kk: "8 наурызға сыйлық",
      en: "March 8 gift",
    },
    short: { ru: "8 марта", kk: "8 наурыз", en: "March 8" },
    headline: {
      ru: "Ей — заботу, а не очередной букет",
      kk: "Оған — кезекті гүл емес, қамқорлық",
      en: "Give her care, not another bouquet",
    },
    subtitle: {
      ru: "Сертификаты Imbir Thai Spa к Женскому дню",
      kk: "Халықаралық әйелдер күніне Imbir Thai Spa сертификаттары",
      en: "Imbir Thai Spa certificates for Women's Day",
    },
    lead: {
      ru: "Подарок, который говорит «ты важна»: массаж, SPA-ритуал или свобода выбора с сертификатом на сумму.",
      kk: "«Сен маңыздысың» дейтін сыйлық: массаж, SPA-рәсім немесе сомаға сертификатпен таңдау еркіндігі.",
      en: "A gift that says “you matter”: a massage, a SPA ritual, or freedom to choose with an amount.",
    },
    filter: (p) => p.highlight != null || p.category === "spa",
  },
  {
    slug: "nauryz",
    emoji: "🌿",
    window: { from: { m: 3, d: 14 }, to: { m: 3, d: 23 } },
    accentFrom: "#3d5230",
    accentTo: "#4D295D",
    names: {
      ru: "Подарок на Наурыз",
      kk: "Наурызға сыйлық",
      en: "Nauryz gift",
    },
    short: { ru: "Наурыз", kk: "Наурыз", en: "Nauryz" },
    headline: {
      ru: "Обновление и покой к Наурызу",
      kk: "Наурызға жаңару мен тыныштық",
      en: "Renewal and calm for Nauryz",
    },
    subtitle: {
      ru: "Встречайте весну с подарком заботы о себе",
      kk: "Көктемді өзіңізге қамқорлық сыйлығымен қарсы алыңыз",
      en: "Welcome spring with the gift of self-care",
    },
    lead: {
      ru: "Наурыз — время начинать с чистого листа. Подарите близким день восстановления и тайского тепла.",
      kk: "Наурыз — таза беттен бастау уақыты. Жақындарыңызға қалпына келу мен тай жылуының күнін сыйлаңыз.",
      en: "Nauryz is a fresh start. Gift your loved ones a day of restoration and Thai warmth.",
    },
    filter: (p) => p.highlight === "hit" || p.category === "spa",
  },
  {
    slug: "thank-you",
    emoji: "🙏",
    accentFrom: "#4D295D",
    accentTo: "#6e5334",
    names: {
      ru: "Подарок «спасибо»",
      kk: "«Рақмет» сыйлығы",
      en: "Thank-you gift",
    },
    headline: {
      ru: "Скажите спасибо так, чтобы почувствовали",
      kk: "Сезілетіндей етіп рақмет айтыңыз",
      en: "Say thank you in a way they'll feel",
    },
    subtitle: {
      ru: "Благодарность коллеге, учителю, врачу или другу",
      kk: "Әріптеске, ұстазға, дәрігерге не досқа алғыс",
      en: "Gratitude for a colleague, teacher, doctor or friend",
    },
    lead: {
      ru: "Сертификат на массаж — тёплый и уместный способ поблагодарить. Не знаете, что выберут — подарите номинал.",
      kk: "Массаж сертификаты — алғыс айтудың жылы әрі орынды тәсілі. Нені таңдарын білмесеңіз — номинал сыйлаңыз.",
      en: "A massage certificate is a warm, fitting way to say thanks. Not sure what they'd pick? Gift an amount.",
    },
    filter: (p) => p.highlight === "hit",
  },
];

export function getOccasion(slug: string): Occasion | undefined {
  return OCCASIONS.find((o) => o.slug === slug);
}

/** Отбор программ под повод; фолбэк — хиты, затем все (не пустой список). */
export function pickOccasionPrograms(
  occasion: Occasion,
  programs: ProgramDto[],
  limit = 6,
): ProgramDto[] {
  const matched = programs.filter(occasion.filter);
  const source =
    matched.length > 0
      ? matched
      : programs.filter((p) => p.highlight === "hit");
  return (source.length > 0 ? source : programs).slice(0, limit);
}

function md(now: Date): number {
  // Месяц*100+день в таймзоне Almaty (для сравнения окон)
  const iso = now.toLocaleDateString("en-CA", { timeZone: "Asia/Almaty" });
  const [, m, d] = iso.split("-").map(Number);
  return m * 100 + d;
}

function inWindow(w: NonNullable<Occasion["window"]>, x: number): boolean {
  const from = w.from.m * 100 + w.from.d;
  const to = w.to.m * 100 + w.to.d;
  return from <= to ? x >= from && x <= to : x >= from || x <= to;
}

/** Активный сегодня сезонный повод (для баннера на главной); null — нет. */
export function activeOccasion(now: Date = new Date()): Occasion | null {
  const x = md(now);
  return OCCASIONS.find((o) => o.window && inWindow(o.window, x)) ?? null;
}
