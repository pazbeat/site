/**
 * Канон филиалов сети. `city` — русский ключ: по нему Program.cities фильтрует
 * программы, им же оперируют админка и маппинг Altegio. `cityNames`/`addressNames`
 * — только витрина (публичные страницы, PDF, письма).
 * codePrefix — префикс серийного номера сертификата (WM001…).
 */
export type L10n = { ru: string; kk: string; en: string };

export type SalonSeed = {
  city: string;
  cityNames: L10n;
  name: string;
  address: string;
  addressNames: L10n;
  codePrefix: string;
};

export const SALON_SEED: SalonSeed[] = [
  {
    city: "Астана",
    cityNames: { ru: "Астана", kk: "Астана", en: "Astana" },
    name: "Имбирь на Мәңгілік Ел",
    address: "пр. Мәңгілік Ел 29/2",
    addressNames: {
      ru: "пр. Мәңгілік Ел 29/2",
      kk: "Мәңгілік Ел даңғ., 29/2",
      en: "29/2 Mangilik El Ave",
    },
    codePrefix: "WM",
  },
  {
    city: "Астана",
    cityNames: { ru: "Астана", kk: "Астана", en: "Astana" },
    name: "Имбирь на Тәуелсіздік",
    address: "пр. Тәуелсіздік 40/5 (по старому 46/6)",
    addressNames: {
      ru: "пр. Тәуелсіздік 40/5 (по старому 46/6)",
      kk: "Тәуелсіздік даңғ., 40/5 (бұрынғы 46/6)",
      en: "40/5 Tauelsizdik Ave (formerly 46/6)",
    },
    codePrefix: "WT",
  },
  {
    city: "Астана",
    cityNames: { ru: "Астана", kk: "Астана", en: "Astana" },
    name: "Имбирь в ЖК «Глория»",
    address: "пр. Әліхан Бөкейхан 24 (ЖК «Глория»)",
    addressNames: {
      ru: "пр. Әліхан Бөкейхан 24 (ЖК «Глория»)",
      kk: "Әлихан Бөкейхан даңғ., 24 («Глория» ТК)",
      en: "24 Alikhan Bokeikhan Ave (Gloria residence)",
    },
    codePrefix: "WB",
  },
  {
    city: "Алматы",
    cityNames: { ru: "Алматы", kk: "Алматы", en: "Almaty" },
    name: "Имбирь в ЖК «Шанырак»",
    address: "ул. Наурызбай Батыра 99/1, ЖК «Шанырак»",
    addressNames: {
      ru: "ул. Наурызбай Батыра 99/1, ЖК «Шанырак»",
      kk: "Наурызбай батыр көш., 99/1, «Шаңырақ» ТК",
      en: "99/1 Nauryzbai Batyr St, Shanyrak residence",
    },
    codePrefix: "WN",
  },
  {
    city: "Алматы",
    cityNames: { ru: "Алматы", kk: "Алматы", en: "Almaty" },
    name: "Имбирь в ЖК «Вавилон»",
    address: "ул. Розыбакиева 247, ЖК «Вавилон»",
    addressNames: {
      ru: "ул. Розыбакиева 247, ЖК «Вавилон»",
      kk: "Розыбакиев көш., 247, «Вавилон» ТК",
      en: "247 Rozybakiev St, Vavilon residence",
    },
    codePrefix: "WR",
  },
  {
    city: "Караганда",
    cityNames: { ru: "Караганда", kk: "Қарағанды", en: "Karaganda" },
    name: "Имбирь в БЦ «Grey Plaza»",
    address: "ул. Гоголя 34А, БЦ «Grey Plaza»",
    addressNames: {
      ru: "ул. Гоголя 34А, БЦ «Grey Plaza»",
      kk: "Гоголь көш., 34А, «Grey Plaza» БО",
      en: "34A Gogol St, Grey Plaza business centre",
    },
    codePrefix: "WK",
  },
  {
    city: "Павлодар",
    cityNames: { ru: "Павлодар", kk: "Павлодар", en: "Pavlodar" },
    name: "Имбирь в гостинице «Иртыш»",
    address: "ул. Ак. Бектурова 79, гостиница «Иртыш»",
    addressNames: {
      ru: "ул. Ак. Бектурова 79, гостиница «Иртыш»",
      kk: "Акад. Бектұров көш., 79, «Ертіс» қонақүйі",
      en: "79 Akad. Bekturov St, Irtysh hotel",
    },
    codePrefix: "WP",
  },
  // Семей (WS) — филиал будет добавлен после получения адреса
];
