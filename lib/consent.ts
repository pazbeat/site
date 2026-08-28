import "server-only";
import { createHash } from "node:crypto";
import { getLegalVersionsForLocale, LEGAL_DOC_TYPES } from "./data";

/**
 * Запись согласия покупателя — доказательство того, что он принял условия.
 *
 * Собирается ТОЛЬКО на сервере и кладётся в одну строку вместе с заказом
 * (`Order.consent`), поэтому подделать её из браузера нельзя. Состав полей
 * продиктован тем, что придётся показывать в споре: когда, кто, откуда и —
 * главное — С ЧЕМ ИМЕННО согласился.
 *
 * `versions` отвечает на вопрос «какая редакция», `hashes` — «точно ли тот
 * самый текст»: отпечаток считается от содержимого редакции в момент клика,
 * так что позднейшая правка строки в базе перестанет сходиться с записью.
 *
 * Честная граница этой защиты: отпечаток лежит в той же базе, что и текст.
 * Против оператора, у которого есть доступ к Postgres, он не доказывает
 * ничего — переписать можно и то и другое разом. Он ловит случайную правку и
 * привязывает согласие к конкретным байтам; настоящая неотказуемость
 * появляется, только когда отпечаток уходит наружу — например, в письмо
 * покупателю.
 */
export type ConsentRecord = {
  /** Момент создания заказа на сервере, ISO с миллисекундами */
  ts: string;
  ip: string;
  ua: string;
  /** Язык, на котором покупатель читал документы */
  locale: string;
  /** Тип документа → id редакции, которую ему показывали */
  versions: Record<string, number | null>;
  /** Тип документа → SHA-256 её текста на момент согласия */
  hashes: Record<string, string | null>;
  /**
   * Два момента, когда покупатель соглашался: окно перед конструктором и
   * галочка перед оплатой. Время — ПО ЧАСАМ БРАУЗЕРА, их можно подкрутить,
   * поэтому доказательное время это `ts` выше, снятое на сервере. Здесь важно
   * не время, а сам факт: подтверждений было два, и второе — перед деньгами.
   */
  steps?: {
    /** Окно согласия перед входом в конструктор */
    builder?: string;
    /** Галочка на шаге оплаты */
    payment?: string;
  };
};

/** Отпечаток правового текста. Тот же алгоритм, что у кода сертификата. */
export function hashLegalContent(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex");
}

/** Редакция документа в том виде, в каком её видел покупатель. */
export type ShownVersion = { id: number; contentHtmlSanitized: string } | null;

/**
 * Чистая сборка записи: та же логика, но без похода в базу и без часов —
 * чтобы её можно было проверить тестом. Всё, что зависит от окружения,
 * приходит параметрами.
 */
export function composeConsent(
  input: {
    ip: string;
    ua: string;
    locale: string;
    now: Date;
    steps?: { builder?: string; payment?: string };
  },
  shown: Partial<Record<string, ShownVersion>>,
): ConsentRecord {
  const versions: Record<string, number | null> = {};
  const hashes: Record<string, string | null> = {};
  for (const type of LEGAL_DOC_TYPES) {
    const version = shown[type] ?? null;
    versions[type] = version?.id ?? null;
    hashes[type] = version ? hashLegalContent(version.contentHtmlSanitized) : null;
  }
  const steps = {
    ...(input.steps?.builder ? { builder: input.steps.builder } : {}),
    ...(input.steps?.payment ? { payment: input.steps.payment } : {}),
  };
  return {
    ts: input.now.toISOString(),
    ip: input.ip,
    ua: input.ua,
    locale: input.locale,
    versions,
    hashes,
    ...(Object.keys(steps).length > 0 ? { steps } : {}),
  };
}

export async function buildConsentRecord(input: {
  ip: string;
  ua: string;
  locale: string;
  steps?: { builder?: string; payment?: string };
}): Promise<ConsentRecord> {
  const shown = await getLegalVersionsForLocale(input.locale);
  return composeConsent({ ...input, now: new Date() }, shown);
}
