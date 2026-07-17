/**
 * Публичные WhatsApp-номера филиалов (с сайта imbir.kz), привязанные к
 * префиксу серийного кода салона. В БД телефон общий (+7 708 111 8098),
 * а на витрине у каждого салона свой мессенджер — как на текущем сайте.
 * Ключ — Salon.codePrefix.
 */
const SALON_WHATSAPP: Record<string, string> = {
  WM: "77025386222", // Астана · Мәңгілік Ел 29/2
  WT: "77715362111", // Астана · Тәуелсіздік 40/5
  WB: "77780108588", // Астана · Бокейхана 24 (Глория)
  WN: "77015356111", // Алматы · Наурызбай батыра 99/1 (Шанырак)
  WR: "77780102555", // Алматы · Розыбакиева 247 (Вавилон)
  WK: "77775356333", // Караганда · Гоголя 34А (Grey Plaza)
  WP: "77010440601", // Павлодар · Бектурова 79 (Иртыш)
  WS: "77750502555", // Семей · Рымбека Ильяшева 45А
  WE: "77770646092", // Экибастуз · Энергетиков 15/9
  WJ: "77760771515", // Жезказган · Сейфуллина 15
};

const GENERAL_WA = "77081118098";

/** Ссылка на WhatsApp салона с приветствием (или общий номер сети). */
export function salonWhatsAppLink(
  codePrefix: string | null | undefined,
  greeting: string,
): string {
  const phone = (codePrefix && SALON_WHATSAPP[codePrefix]) || GENERAL_WA;
  return `https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`;
}

/** Открыть салон в 2ГИС поиском «город, адрес» (как на /salons). */
export function gisLink(city: string, address: string): string {
  return `https://2gis.kz/search/${encodeURIComponent(`${city}, ${address}`)}`;
}
