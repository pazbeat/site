import type { PassFields } from "./pass";

/**
 * Карта Google Wallet в виде объекта их API — чистые функции, без сети.
 *
 * Тип выбран `giftCard`: у него из коробки есть номер карты, остаток и его
 * дата обновления. На `generic` пришлось бы рисовать то же самое текстовыми
 * блоками и терять родное отображение баланса.
 *
 * Ключевое отличие от Apple: у Google карту можно закрыть по-настоящему.
 * Погашенный сертификат переводится в состояние, при котором карта уезжает в
 * «истёкшие» и больше не показывается кассиру, — там, где Apple может только
 * покрасить её серым.
 */

/** Цвета брендбука (AGENTS.md §3), а не сиреневый действующего сайта. */
const BRAND_PURPLE = "#4D295D";

/**
 * Версия картинок карты. Google забирает логотип и баннер по ссылке и держит
 * их у себя — по тому же адресу новую картинку он уже не заберёт. Меняете
 * изображение — увеличьте число, иначе у покупателей останется старое.
 * Заодно versioned-адрес обходит отрицательный кэш Cloudflare, если ссылку
 * успели запросить до выкладки файла.
 */
const IMAGE_VERSION = 1;

export type GoogleIds = {
  issuerId: string;
  /** Хвост идентификатора класса — одно оформление на все карты */
  classSuffix: string;
};

export function giftCardClassId(ids: GoogleIds): string {
  return `${ids.issuerId}.${ids.classSuffix}`;
}

/**
 * Идентификатор карты. Серийник, а не код сертификата: id уезжает на
 * устройство и светится в ссылке, а код секретный. Google разрешает в
 * идентификаторе только буквы, цифры, точку, дефис и подчёркивание.
 */
export function giftCardObjectId(ids: GoogleIds, serialNumber: string): string {
  const safe = serialNumber.replace(/[^A-Za-z0-9._-]/g, "");
  return `${ids.issuerId}.${safe}`;
}

/** Картинка для Google: он забирает её по ссылке и кэширует у себя. */
function image(uri: string, description: string): Record<string, unknown> {
  return {
    sourceUri: { uri },
    contentDescription: {
      defaultValue: { language: "ru", value: description },
    },
  };
}

/**
 * Оформление: одно на все карты сети.
 *
 * Логотип и баннер обязательны не по документации, а по виду: без них карта
 * выглядит пустым цветным прямоугольником с парой строк. Ссылки абсолютные —
 * картинки забирает сам Google, относительный путь ему некуда подставить.
 *
 * Класс общий, поэтому смена картинок меняет вид и у карт, уже сохранённых
 * покупателями: обновлять каждую по отдельности не нужно.
 */
export function buildGiftCardClass(
  ids: GoogleIds,
  origin: string,
): Record<string, unknown> {
  const base = origin.replace(/\/+$/, "");
  return {
    id: giftCardClassId(ids),
    issuerName: "Imbir Thai Spa",
    reviewStatus: "UNDER_REVIEW",
    countryCode: "KZ",
    hexBackgroundColor: BRAND_PURPLE,
    allowMultipleUsersPerObject: false,
    // Остаток и его дату Google рисует сам, если они есть у карты
    merchantName: "Imbir Thai Spa",
    localizedIssuerName: {
      defaultValue: { language: "ru", value: "Imbir Thai Spa" },
    },
    programLogo: image(
      `${base}/brand/wallet-logo.png?v=${IMAGE_VERSION}`,
      "Imbir Thai Spa",
    ),
    heroImage: image(
      `${base}/brand/wallet-hero.jpg?v=${IMAGE_VERSION}`,
      "Салон Imbir Thai Spa",
    ),
    homepageUri: {
      uri: `${base}/`,
      description: "Сайт сертификатов",
    },
  };
}

/**
 * Состояние карты. У Google это и есть способ закрыть карту: `EXPIRED`
 * убирает её из активных. Разделяем истёкший срок и всё остальное —
 * владельцу разница видна в интерфейсе кошелька.
 */
export function giftCardState(fields: PassFields): "ACTIVE" | "EXPIRED" | "INACTIVE" {
  if (!fields.voided) return "ACTIVE";
  return fields.voidReason === "Срок истёк" ? "EXPIRED" : "INACTIVE";
}

/** Сама карта. `now` параметром — чтобы тест не зависел от часов. */
export function buildGiftCardObject(input: {
  ids: GoogleIds;
  serialNumber: string;
  fields: PassFields;
  now?: Date;
}): Record<string, unknown> {
  const { ids, serialNumber, fields } = input;
  const now = input.now ?? new Date();

  const textModules: Array<Record<string, string>> = [
    { id: "holder", header: "Кому", body: fields.holder },
    { id: "salon", header: "Филиал", body: fields.salonName },
    { id: "valid", header: "Действует до", body: fields.validUntilLabel },
  ];
  // Номинал показываем, только когда часть уже потрачена, — как на Apple
  if (fields.ofAmountLabel) {
    textModules.push({
      id: "nominal",
      header: "Номинал",
      body: fields.ofAmountLabel.replace(/^из\s+/, ""),
    });
  }
  if (fields.voidReason) {
    textModules.push({ id: "state", header: "Статус", body: fields.voidReason });
  }

  return {
    id: giftCardObjectId(ids, serialNumber),
    classId: giftCardClassId(ids),
    state: giftCardState(fields),
    cardNumber: fields.code,
    // Деньги у Google в микроединицах валюты
    balance: {
      micros: Math.max(0, fields.balanceKzt) * 1_000_000,
      currencyCode: "KZT",
    },
    balanceUpdateTime: { date: now.toISOString() },
    barcode: {
      type: "PDF_417",
      value: fields.barcodeMessage,
      alternateText: fields.code,
    },
    validTimeInterval: { end: { date: fields.validUntil.toISOString() } },
    textModulesData: textModules,
    hexBackgroundColor: BRAND_PURPLE,
  };
}

/**
 * Что меняем у уже сохранённой карты при сверке остатка. Отправляем только
 * изменяемые поля: PATCH с полным объектом затёр бы то, что владелец или
 * Google успели поменять у себя.
 */
export function buildGiftCardPatch(
  fields: PassFields,
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    state: giftCardState(fields),
    balance: {
      micros: Math.max(0, fields.balanceKzt) * 1_000_000,
      currencyCode: "KZT",
    },
    balanceUpdateTime: { date: now.toISOString() },
  };
}
