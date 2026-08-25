/**
 * Откуда пришёл посетитель (PRD §10, аналитика источников).
 *
 * Задача заказчика — не «сколько зашло», а «кто из них купил». Поэтому канал
 * снимается один раз в `proxy.ts`, живёт в липкой куке и переносится в сам
 * заказ: выручка по каналам считается в нашей админке и сходится с деньгами
 * до тенге, а не зависит от модели атрибуции чужого счётчика.
 *
 * Модуль чистый — только строки и даты, никакой БД и `server-only`. Поэтому
 * один и тот же код работает и в proxy, и в серверном компоненте, и в тестах.
 * Тот же приём, что у A/B-теста в `lib/ab.ts`.
 */

export const SRC_COOKIE = "imbir_src";

/**
 * Закрытый словарь каналов. Новый канал — одна строка здесь.
 *
 * Закрытый он намеренно: если писать в отчёт всё, что пришло в `utm_source`,
 * таблица через месяц превратится в свалку из опечаток и мусора ботов, а
 * `Instagram`, `instagram` и `insta` разъедутся по трём строкам.
 */
export const CHANNELS = [
  "direct",
  "google",
  "google-ads",
  "yandex",
  "yandex-ads",
  "instagram",
  "instagram-ads",
  "facebook",
  "tiktok",
  "telegram",
  "whatsapp",
  "2gis",
  "email",
  "referral",
  "other",
] as const;

export type Channel = (typeof CHANNELS)[number];

/** Человеческие названия для отчёта. */
export const CHANNEL_LABELS: Record<Channel, string> = {
  direct: "Прямые заходы",
  google: "Google, поиск",
  "google-ads": "Google, реклама",
  yandex: "Яндекс, поиск",
  "yandex-ads": "Яндекс, реклама",
  instagram: "Instagram",
  "instagram-ads": "Instagram, реклама",
  facebook: "Facebook",
  tiktok: "TikTok",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  "2gis": "2ГИС",
  email: "Письма",
  referral: "Ссылки с других сайтов",
  other: "Прочее",
};

export function isChannel(value: unknown): value is Channel {
  return typeof value === "string" && (CHANNELS as readonly string[]).includes(value);
}

export type ClickIdType = "" | "gclid" | "yclid" | "fbclid";

export type SourceCookie = {
  /** Кто привёл — первое касание, больше не меняется */
  first: Channel;
  /** Кто закрыл — последнее касание перед покупкой, им атрибутируем продажу */
  last: Channel;
  /** utm_campaign, пусто если не было */
  campaign: string;
  clickIdType: ClickIdType;
  clickId: string;
  /** День (Алматы), в который посетителя уже посчитали как заход */
  dayVisit: string;
  /** То же для стадии «открыл конструктор» */
  dayBuilder: string;
};

const COOKIE_VERSION = "1";

export const EMPTY_SOURCE: SourceCookie = {
  first: "direct",
  last: "direct",
  campaign: "",
  clickIdType: "",
  clickId: "",
  dayVisit: "",
  dayBuilder: "",
};

/**
 * Разбор куки. Версия в начале обязательна: сменим формат — старые куки
 * молча отбросятся, а не разъедутся по полям.
 */
export function parseSourceCookie(raw: string | undefined | null): SourceCookie | null {
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length !== 8 || parts[0] !== COOKIE_VERSION) return null;
  const [, first, last, campaign, clickIdType, clickId, dayVisit, dayBuilder] = parts;
  if (!isChannel(first) || !isChannel(last)) return null;
  const okClick =
    clickIdType === "" ||
    clickIdType === "gclid" ||
    clickIdType === "yclid" ||
    clickIdType === "fbclid";
  if (!okClick) return null;
  return { first, last, campaign, clickIdType, clickId, dayVisit, dayBuilder };
}

export function formatSourceCookie(c: SourceCookie): string {
  return [
    COOKIE_VERSION,
    c.first,
    c.last,
    c.campaign,
    c.clickIdType,
    c.clickId,
    c.dayVisit,
    c.dayBuilder,
  ].join("|");
}

/**
 * Метка кампании — название акции, которое владелец придумывает сам.
 *
 * Кириллицу оставляем: писать «8марта» естественнее, чем «8marta», а раньше
 * такая метка превращалась в один символ «8» и в отчёте выглядела поломкой.
 * Опасности в этом нет — значение только показывается в админке, где React
 * экранирует текст сам, а длина ограничена шириной колонки в базе.
 * Пробелы становятся дефисами, чтобы метка осталась одним словом.
 */
export function sanitizeCampaign(value: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[\s+]+/g, "-")
    .replace(/[^a-zа-яё0-9_-]/gi, "")
    .slice(0, 32);
}

/** Идентификатор клика обрезать коротко нельзя — длинный gclid станет мусором. */
function sanitizeClickId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 512);
}

/** Пути, на которых размечать нельзя: покупатель возвращается извне платежа. */
function isReturnPath(pathname: string): boolean {
  return /^\/(ru|kk|en)\/(success|pay)(\/|$)/.test(pathname);
}

/**
 * Хосты, переход с которых НЕ считается новым каналом.
 *
 * Здесь два разных случая, и оба важны. Первый — наши же адреса: переход
 * внутри сайта не должен перекрашивать канал. Второй — платёжные страницы и
 * веб-почта: покупатель возвращается оттуда прямо перед покупкой, и наивный
 * последний источник записал бы продажу на Kaspi или на Gmail, украв её у
 * настоящей рекламы.
 */
const NEUTRAL_HOSTS = [
  "imbir.kz",
  "kaspi.kz",
  "fortebank.com",
  "mail.google.com",
  "mail.yandex.ru",
  "mail.yandex.kz",
  "mail.yandex.com",
  "web.whatsapp.com",
  "payqr.kz",
];

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/** Канал по хосту перехода. `null` — хост нейтральный, касания нет. */
function channelFromHost(host: string): Channel | null {
  if (NEUTRAL_HOSTS.some((h) => hostMatches(host, h))) return null;
  if (/(^|\.)google\./.test(host)) return "google";
  if (/(^|\.)yandex\./.test(host)) return "yandex";
  if (hostMatches(host, "instagram.com") || host === "l.instagram.com") return "instagram";
  if (hostMatches(host, "facebook.com") || host === "l.facebook.com") return "facebook";
  if (hostMatches(host, "tiktok.com")) return "tiktok";
  if (hostMatches(host, "t.me") || hostMatches(host, "telegram.org")) return "telegram";
  if (hostMatches(host, "2gis.kz") || hostMatches(host, "2gis.com")) return "2gis";
  return "referral";
}

/** Канал по метке utm_source с учётом того, платный это трафик или нет. */
function channelFromUtm(source: string, medium: string, hasClickId: boolean): Channel {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();
  const paid = hasClickId || m === "cpc" || m === "ppc" || m === "paid" || m === "ads";
  if (m === "email") return "email";
  if (s.includes("google")) return paid ? "google-ads" : "google";
  if (s.includes("yandex") || s.includes("direct")) return paid ? "yandex-ads" : "yandex";
  if (s.includes("instagram") || s === "ig") return paid ? "instagram-ads" : "instagram";
  if (s.includes("facebook") || s === "fb" || s === "meta") return "facebook";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("telegram") || s === "tg") return "telegram";
  if (s.includes("whatsapp") || s === "wa") return "whatsapp";
  if (s.includes("2gis")) return "2gis";
  return "other";
}

export type Touch = {
  channel: Channel;
  campaign: string;
  clickIdType: ClickIdType;
  clickId: string;
};

/**
 * Определить касание. `null` — источника нет, канал в куке НЕ трогаем.
 *
 * Последнее важно: переключатель языка переносит всю строку запроса на новый
 * адрес, а карточки программ дописывают свои параметры — если считать любое
 * появление query за касание, внутренние переходы перекрасят канал.
 */
export function detectTouch(
  url: URL,
  referer: string | null,
  pathname: string,
): Touch | null {
  if (isReturnPath(pathname)) return null;

  const q = url.searchParams;
  const clickPairs: Array<[ClickIdType, string]> = [
    ["gclid", q.get("gclid") ?? ""],
    ["yclid", q.get("yclid") ?? ""],
    ["fbclid", q.get("fbclid") ?? ""],
  ];
  const click = clickPairs.find(([, v]) => v !== "");
  const utmSource = q.get("utm_source") ?? "";
  const utmMedium = q.get("utm_medium") ?? "";
  const campaign = sanitizeCampaign(q.get("utm_campaign"));

  const clickPart = click
    ? { clickIdType: click[0], clickId: sanitizeClickId(click[1]) }
    : { clickIdType: "" as ClickIdType, clickId: "" };

  if (utmSource || utmMedium) {
    return {
      channel: channelFromUtm(utmSource, utmMedium, Boolean(click)),
      campaign,
      ...clickPart,
    };
  }

  // Идентификатор клика без меток. Google и Яндекс подставляют свои только
  // на рекламные переходы — им можно верить. А `fbclid` Meta дописывает к
  // ЛЮБОЙ исходящей ссылке, включая обычный пост: приняв его за рекламу, мы
  // записали бы органику из Instagram в платный канал и завысили отдачу
  // рекламы. Поэтому по нему канал не определяем — идентификатор сохраняем
  // (он нужен для отчёта в рекламный кабинет), а канал ищем дальше по
  // адресу страницы-источника.
  if (click && (click[0] === "gclid" || click[0] === "yclid")) {
    return {
      channel: click[0] === "gclid" ? "google-ads" : "yandex-ads",
      campaign,
      ...clickPart,
    };
  }

  if (referer) {
    try {
      const host = new URL(referer).hostname.toLowerCase();
      const channel = channelFromHost(host);
      if (channel) return { channel, campaign, ...clickPart };
    } catch {
      // мусор в заголовке — просто нет касания
    }
  }

  return null;
}

/**
 * Считать ли этот запрос заходом живого человека.
 *
 * Без отсечки ботов конверсия утонет: поисковый робот кук не хранит, и каждый
 * его запрос стал бы новым «прямым заходом» — 27 программ на трёх языках за
 * ночь дадут сотню фальшивых визитов.
 */
export function isCountableVisit(headers: {
  get(name: string): string | null;
}): boolean {
  // Префетч ссылки и запрос данных React — не визит
  if (headers.get("rsc") || headers.get("next-router-prefetch")) return false;
  const mode = headers.get("sec-fetch-mode");
  if (mode && mode !== "navigate") return false;

  const ua = headers.get("user-agent") ?? "";
  if (!ua) return false;
  return !/bot|crawl|spider|slurp|preview|headless|monitor|uptime|curl|wget|python-requests|node-fetch|go-http-client|facebookexternalhit|whatsapp|telegrambot|gptbot|claudebot|ccbot|bytespider|ahrefs|semrush|petalbot|yandeximages/i.test(
    ua,
  );
}

export type SourceDecision = {
  next: SourceCookie;
  /**
   * То же состояние, но БЕЗ проставленных сегодня меток дня.
   *
   * Нужно для переадресации: канал там запомнить надо, а заход засчитать
   * некому — страницы не будет. Просто обнулить метки нельзя, иначе
   * вернувшегося сегодня посетителя посчитали бы второй раз, поэтому здесь
   * лежат прежние значения.
   */
  nextUnstamped: SourceCookie;
  /** Кука изменилась — надо отдать Set-Cookie */
  changed: boolean;
  /** Засчитать заход в дневной счётчик */
  countVisit: boolean;
  /** Засчитать открытие конструктора */
  countBuilder: boolean;
};

/**
 * Новое состояние куки. Чистая функция: день и «человек ли это» приходят
 * параметрами, чтобы тест не зависел ни от часов, ни от заголовков.
 */
export function nextSource(input: {
  prev: SourceCookie | null;
  touch: Touch | null;
  today: string;
  countable: boolean;
  isBuilderPath: boolean;
}): SourceDecision {
  const { prev, touch, today, countable, isBuilderPath } = input;
  const base = prev ?? EMPTY_SOURCE;

  const next: SourceCookie = { ...base };
  if (touch) {
    // Первое касание фиксируем только у нового посетителя
    if (!prev) next.first = touch.channel;
    next.last = touch.channel;
    if (touch.campaign) next.campaign = touch.campaign;
    if (touch.clickId) {
      next.clickIdType = touch.clickIdType;
      next.clickId = touch.clickId;
    }
  } else if (!prev) {
    // Новый посетитель без метки и без реферера — прямой заход
    next.first = "direct";
    next.last = "direct";
  }

  const countVisit = countable && next.dayVisit !== today;
  const countBuilder = countable && isBuilderPath && next.dayBuilder !== today;
  // Состояние без сегодняшних меток — прежние значения сохраняем как есть
  const nextUnstamped: SourceCookie = { ...next };
  if (countVisit) next.dayVisit = today;
  if (countBuilder) next.dayBuilder = today;

  const changed = !prev || formatSourceCookie(next) !== formatSourceCookie(base);
  return { next, nextUnstamped, changed, countVisit, countBuilder };
}

/** Путь конструктора на любой из локалей. */
export function isBuilderPath(pathname: string): boolean {
  return /^\/(ru|kk|en)\/create\/?$/.test(pathname);
}
