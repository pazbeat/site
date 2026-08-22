import type { PassFields } from "./pass";

/**
 * Содержимое `pass.json` для Apple Wallet.
 *
 * Разметка полей списана с рабочего пропуска действующего сайта (шаблон
 * `generic`, штрихкод PDF417 с номером сертификата), но с тремя отличиями.
 *
 * 1. `webServiceURL` и `authenticationToken`. У заказчика их нет, и поэтому
 *    его карта не обновляется никогда: погасили сертификат, а карта до конца
 *    времён показывает полный номинал. Мы их проставляем — ради этого всё
 *    и затевалось.
 * 2. Цвета по брендбуку (AGENTS.md), а не сиреневый rgb(170,157,207),
 *    которого в палитре нет.
 * 3. `serialNumber` — не код сертификата. Он уезжает на устройство и светится
 *    в каждом запросе веб-сервиса, а код секретный (см. модель WalletPass).
 */

/** brand-purple #4D295D */
const BACKGROUND = "rgb(77, 41, 93)";
/** brand-gold #B69244 — подписи полей */
const LABEL = "rgb(182, 146, 68)";
const FOREGROUND = "rgb(255, 255, 255)";

export type PassField = {
  key: string;
  label: string;
  value: string | number;
  /** Apple сам форматирует сумму по языку телефона */
  currencyCode?: string;
  dateStyle?: string;
  textAlignment?: string;
};

export type PassBarcode = {
  message: string;
  format: string;
  messageEncoding: string;
  altText: string;
};

export type ApplePassJson = {
  formatVersion: number;
  passTypeIdentifier: string;
  teamIdentifier: string;
  organizationName: string;
  serialNumber: string;
  description: string;
  logoText: string;
  foregroundColor: string;
  backgroundColor: string;
  labelColor: string;
  voided: boolean;
  expirationDate: string;
  webServiceURL?: string;
  authenticationToken?: string;
  /** `barcodes` понимает современный iOS, `barcode` оставлен для старых */
  barcodes: PassBarcode[];
  barcode: PassBarcode;
  generic: {
    primaryFields: PassField[];
    secondaryFields: PassField[];
    auxiliaryFields: PassField[];
    backFields: PassField[];
  };
};

export type ApplePassConfig = {
  passTypeIdentifier: string;
  teamIdentifier: string;
  organizationName: string;
  /** Серийник карты; НЕ код сертификата */
  serialNumber: string;
  /**
   * Адрес веб-сервиса обновлений. Без него карта статична навсегда —
   * задавать только когда эндпоинты действительно подняты.
   */
  webServiceUrl?: string;
  /** Токен из заголовка `Authorization: ApplePass <token>` */
  authenticationToken?: string;
};

export function buildApplePassJson(
  fields: PassFields,
  config: ApplePassConfig,
): ApplePassJson {
  const barcode: PassBarcode = {
    message: fields.barcodeMessage,
    format: "PKBarcodeFormatPDF417",
    messageEncoding: "iso-8859-1",
    altText: fields.code,
  };

  const backFields: PassField[] = [
    { key: "codeBack", label: "code", value: fields.code },
    { key: "salon", label: "salon", value: fields.salonName },
    {
      key: "expiryBack",
      label: "expiryDate",
      value: fields.validUntil.toISOString(),
      dateStyle: "PKDateStyleFull",
    },
  ];
  // Причину показываем только на серой карте: у действующей её быть не должно
  if (fields.voidReason) {
    backFields.unshift({ key: "status", label: "status", value: fields.voidReason });
  }

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    organizationName: config.organizationName,
    serialNumber: config.serialNumber,
    description: "Подарочный сертификат Imbir Thai Spa",
    logoText: fields.salonName,
    foregroundColor: FOREGROUND,
    backgroundColor: BACKGROUND,
    labelColor: LABEL,
    // Карта сереет и перестаёт открываться кассиру. Удалить её из кошелька
    // программно нельзя — voided единственный способ закрыть.
    voided: fields.voided,
    expirationDate: fields.validUntil.toISOString(),
    ...(config.webServiceUrl && config.authenticationToken
      ? {
          webServiceURL: config.webServiceUrl,
          authenticationToken: config.authenticationToken,
        }
      : {}),
    barcodes: [barcode],
    barcode,
    generic: {
      primaryFields: [
        {
          key: "balance",
          label: "balance",
          value: fields.balanceKzt,
          currencyCode: "KZT",
        },
      ],
      secondaryFields: [{ key: "holder", label: "holder", value: fields.holder }],
      auxiliaryFields: [
        {
          key: "code",
          label: "code",
          value: fields.code,
          textAlignment: "PKTextAlignmentRight",
        },
        {
          key: "expiry",
          label: "expiryDate",
          value: fields.validUntil.toISOString(),
          dateStyle: "PKDateStyleShort",
        },
      ],
      backFields,
    },
  };
}

/**
 * Подписи полей на трёх языках сайта. Apple подставляет их по языку телефона,
 * поэтому в самих полях лежат ключи, а не готовый русский текст.
 */
const STRINGS: Record<string, Record<string, string>> = {
  ru: {
    balance: "Остаток",
    holder: "Держатель",
    code: "Номер",
    expiryDate: "Действителен до",
    salon: "Филиал",
    status: "Статус",
  },
  kk: {
    balance: "Қалдық",
    holder: "Иесі",
    code: "Нөмір",
    expiryDate: "Жарамдылық мерзімі",
    salon: "Филиал",
    status: "Күйі",
  },
  en: {
    balance: "Balance",
    holder: "Holder",
    code: "Number",
    expiryDate: "Valid until",
    salon: "Location",
    status: "Status",
  },
};

export const PASS_LOCALES = Object.keys(STRINGS);

/** Содержимое `<язык>.lproj/pass.strings`. */
export function buildPassStrings(locale: string): string {
  const table = STRINGS[locale];
  if (!table) throw new Error(`wallet: нет подписей для языка ${locale}`);
  return (
    Object.entries(table)
      .map(([key, value]) => `"${key}" = "${value}";`)
      .join("\n") + "\n"
  );
}
