import type { DesignDto } from "./types";

/**
 * Раскладка открыток по поводам — для дуги на шаге выбора дизайна.
 *
 * Почему по названию, а не по полю в базе. Поля «повод» у дизайна нет, и
 * заводить его сейчас значит миграцию плюс правку админки ради экрана,
 * который ещё согласуется. Названия у всех тридцати одной открытки заданы
 * осмысленно («С днём рождения (торты)», «Асыл әжеме»), и по ним повод
 * читается однозначно. Когда поле появится — эта функция станет обёрткой
 * над ним, а разметка не изменится.
 *
 * Порядок правил важен: сначала узкие, потом широкие. «Наурыз мейрамы»
 * должен попасть в Наурыз, а не в «просто так».
 */

export type OccasionKey =
  | "birthday"
  | "march8"
  | "nauryz"
  | "newyear"
  | "grandma"
  | "any";

export type DesignGroup = {
  key: OccasionKey;
  designs: DesignDto[];
};

/** Ключевые слова повода. Сравнение по нижнему регистру, и ru, и kk. */
const RULES: { key: OccasionKey; words: string[] }[] = [
  { key: "grandma", words: ["бабушк", "әже", "аже"] },
  { key: "nauryz", words: ["наурыз", "науырз"] },
  { key: "march8", words: ["8 марта", "8 наурыз", "восьмое марта", "март"] },
  {
    key: "newyear",
    words: ["новым годом", "новый год", "новом году", "ёлочк", "елочк", "жаңа жыл"],
  },
  {
    key: "birthday",
    words: ["день рождения", "днём рождения", "днем рождения", "с твоим днём",
      "с твоим днем", "туған күн", "туган кун"],
  },
];

/**
 * Порядок поводов на дуге. Сначала то, что дарят чаще всего; «просто так» —
 * последним, это корзина для всего, что не привязано к дате.
 */
export const OCCASION_ORDER: OccasionKey[] = [
  "birthday",
  "march8",
  "nauryz",
  "newyear",
  "grandma",
  "any",
];

export function occasionOf(name: string): OccasionKey {
  const lower = name.toLowerCase();
  for (const rule of RULES) {
    if (rule.words.some((w) => lower.includes(w))) return rule.key;
  }
  return "any";
}

/**
 * Группирует открытки по поводам, сохраняя порядок внутри группы.
 * Пустые группы не возвращаются: повод без единой открытки на дуге не нужен.
 */
export function groupDesigns(designs: DesignDto[]): DesignGroup[] {
  const buckets = new Map<OccasionKey, DesignDto[]>();
  for (const design of designs) {
    const key = occasionOf(design.name);
    const list = buckets.get(key);
    if (list) list.push(design);
    else buckets.set(key, [design]);
  }
  return OCCASION_ORDER.filter((key) => buckets.get(key)?.length).map((key) => ({
    key,
    designs: buckets.get(key)!,
  }));
}

/** Находит повод и позицию открытки — чтобы восстановить состояние карусели. */
export function locateDesign(
  groups: DesignGroup[],
  designId: number,
): { groupIndex: number; cardIndex: number } {
  for (let g = 0; g < groups.length; g += 1) {
    const c = groups[g].designs.findIndex((d) => d.id === designId);
    if (c >= 0) return { groupIndex: g, cardIndex: c };
  }
  return { groupIndex: 0, cardIndex: 0 };
}

/**
 * Лёгкое превью открытки (public/designs/thumbs, ~8 КБ против ~60 КБ).
 * Используется для боковых карточек карусели: они мелкие и размытые, полный
 * файл там не нужен, а на телефоне это разница в вес страницы.
 */
export function designThumb(url: string): string {
  return url.startsWith("/designs/")
    ? url.replace("/designs/", "/designs/thumbs/")
    : url;
}
