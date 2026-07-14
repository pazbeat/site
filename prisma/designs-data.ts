// Каталог художественных открыток-сертификатов (реальные макеты бренда).
// Картинки лежат в public/designs/design-NN.webp. Персонализация (кому/от/
// сообщение) и код+QR рисуются НЕ поверх картинки, а в фирменной панели под ней
// (bgStyle/textColor — цвет этой панели). Используется и сидом, и скриптом
// замены дизайнов (scripts/apply-designs.ts), и админ-загрузкой как эталон.

export type DesignSeed = {
  file: string; // публичный путь /designs/…
  names: { ru: string; kk: string; en: string };
};

// Панель под картинкой — всегда фирменный фиолетовый с белым текстом.
export const PANEL_BG = { kind: "solid" as const, color: "#4D295D" };
export const PANEL_TEXT = "#FFFFFF";

export const DESIGN_SEED: DesignSeed[] = [
  { file: "/designs/design-01.webp", names: { ru: "Улыбок и радости", kk: "Күлкі мен қуаныш", en: "Smiles & joy" } },
  { file: "/designs/design-02.webp", names: { ru: "Ярких событий", kk: "Жарқын оқиғалар", en: "Bright moments" } },
  { file: "/designs/design-03.webp", names: { ru: "С днём рождения (KK)", kk: "Туған күнің құтты болсын", en: "Happy birthday (KK)" } },
  { file: "/designs/design-04.webp", names: { ru: "Любимой маме", kk: "Сүйікті анама", en: "For beloved mom" } },
  { file: "/designs/design-05.webp", names: { ru: "Весенней радости", kk: "Көктемгі қуаныш", en: "Spring joy" } },
  { file: "/designs/design-06.webp", names: { ru: "С 8 Марта", kk: "8 Наурызбен", en: "Women's Day" } },
  { file: "/designs/design-07.webp", names: { ru: "С Наурызом (юрта)", kk: "Наурыз мейрамы құтты болсын", en: "Nauryz (yurt)" } },
  { file: "/designs/design-08.webp", names: { ru: "Любимой бабушке", kk: "Сүйікті әжеме", en: "For beloved grandma" } },
  { file: "/designs/design-09.webp", names: { ru: "С твоим днём (спа)", kk: "Мерекеңмен (спа)", en: "Your day (spa)" } },
  { file: "/designs/design-10.webp", names: { ru: "С праздником Наурыз", kk: "Наурыз мерекесімен", en: "Happy Nauryz" } },
  { file: "/designs/design-11.webp", names: { ru: "С днём рождения (подарок)", kk: "Туған күнмен (сыйлық)", en: "Happy birthday (gift)" } },
  { file: "/designs/design-12.webp", names: { ru: "Счастья и гармонии", kk: "Бақыт пен үйлесім", en: "Happiness & harmony" } },
  { file: "/designs/design-13.webp", names: { ru: "Радости в жизни", kk: "Өмірге қуаныш", en: "Joy in life" } },
  { file: "/designs/design-14.webp", names: { ru: "С днём рождения (бирюза)", kk: "Туған күнмен", en: "Happy birthday (teal)" } },
  { file: "/designs/design-15.webp", names: { ru: "С Новым годом", kk: "Жаңа жылмен", en: "Happy New Year" } },
  { file: "/designs/design-16.webp", names: { ru: "С твоим днём (леденцы)", kk: "Мерекеңмен", en: "Your day (candy)" } },
  { file: "/designs/design-17.webp", names: { ru: "Радости в новом году", kk: "Жаңа жылдағы қуаныш", en: "Joy in the new year" } },
  { file: "/designs/design-18.webp", names: { ru: "Тебе под ёлочку", kk: "Шырша астына сыйлық", en: "Under the tree" } },
  { file: "/designs/design-19.webp", names: { ru: "Пусть сбудутся мечты", kk: "Армандарың орындалсын", en: "May dreams come true" } },
  { file: "/designs/design-20.webp", names: { ru: "С любовью, в сердце", kk: "Жүректен, сүйіспеншілікпен", en: "With love" } },
  { file: "/designs/design-21.webp", names: { ru: "С днём рождения (торты)", kk: "Туған күнмен (торт)", en: "Happy birthday (cakes)" } },
  { file: "/designs/design-22.webp", names: { ru: "Любимой бабушке (арт)", kk: "Асыл әжеме", en: "For grandma (art)" } },
  { file: "/designs/design-23.webp", names: { ru: "С 8 Марта (шары)", kk: "8 Наурызбен", en: "Women's Day (balloons)" } },
  { file: "/designs/design-24.webp", names: { ru: "Любимой", kk: "Сүйіктіме", en: "For beloved" } },
  { file: "/designs/design-25.webp", names: { ru: "8 Марта (мама и дочь)", kk: "Халықаралық әйелдер мейрамы", en: "Women's Day (mom & daughter)" } },
  { file: "/designs/design-26.webp", names: { ru: "С праздником Наурыз (тюльпаны)", kk: "Наурыз мерекесімен", en: "Nauryz (tulips)" } },
  { file: "/designs/design-27.webp", names: { ru: "Счастья и вдохновения", kk: "Бақыт пен шабыт", en: "Happiness & inspiration" } },
  { file: "/designs/design-28.webp", names: { ru: "С днём рождения (KK, арт)", kk: "Туған күн құтты болсын", en: "Happy birthday (KK, art)" } },
  { file: "/designs/design-29.webp", names: { ru: "Побалуй себя", kk: "Өзіңді еркелет", en: "Treat yourself" } },
  { file: "/designs/design-30.webp", names: { ru: "Наурыз мейрамы", kk: "Наурыз мейрамы құтты болсын", en: "Nauryz celebration" } },
  { file: "/designs/design-31.webp", names: { ru: "Асыл әжеме", kk: "Асыл әжеме", en: "For dear grandma" } },
];
