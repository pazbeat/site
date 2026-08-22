import { randomBytes } from "node:crypto";
import { formatKzt } from "../format";
import type { CertificateStatus } from "../generated/prisma/client";

/**
 * Доменный слой пропуска в кошельке (PRD Фаза 3, docs/STATUS.md).
 *
 * Здесь только чистые функции: что написано на карте, сколько на ней денег и
 * должна ли она посереть. Ни подписи, ни APNs, ни базы — это дело провайдера.
 * Политика живёт тут, потому что она одна на Apple и Google, и только так её
 * можно проверить тестами, не имея ни сертификата Apple, ни доступа к Google.
 *
 * Главное про Apple: удалить карту из кошелька программно нельзя. Погашенный
 * или отозванный сертификат помечается voided — карта сереет и больше не
 * открывается кассиру, но остаётся у владельца. То есть voided не косметика,
 * а единственный доступный способ закрыть карту.
 */

/** Срок действия печатаем по времени салона, а не браузера (AGENTS.md). */
const TIMEZONE = "Asia/Almaty";

/** Данные сертификата, из которых собирается карта. */
export type PassSource = {
  /**
   * Номер, который видит кассир и покупатель: салонный WM0001 либо старый
   * IMB-XXXX-XXXX. Тот же номер уходит в штрихкод — кассир сканирует карту и
   * ищет в CRM ровно то, что напечатано.
   */
  code: string;
  /** Держатель — кому подарили, поле «to_name» сертификата */
  holder: string;
  /** Номинал; null — сертификат на программу, а не на сумму */
  amountKzt: number | null;
  balanceKzt: number;
  status: CertificateStatus;
  validUntil: Date;
  salonName: string;
  /** Название программы для сертификата на услугу, иначе null */
  programName: string | null;
};

/** Поля, которые видит владелец карты. */
export type PassFields = {
  /** Крупная строка карты: номинал или название программы */
  headline: string;
  holder: string;
  code: string;
  balanceKzt: number;
  balanceLabel: string;
  /** «из 20 000 ₸» — только когда часть уже потрачена, иначе шум */
  ofAmountLabel: string | null;
  salonName: string;
  validUntil: Date;
  validUntilLabel: string;
  /** Содержимое штрихкода: тот же номер, что и на сертификате */
  barcodeMessage: string;
  /** Карта недействительна — Apple рисует её серой */
  voided: boolean;
  /** Короткая причина прямо на карте, иначе владельцу непонятно, что случилось */
  voidReason: string | null;
};

/**
 * Почему карта недействительна, либо null, если ей ещё можно платить.
 *
 * Порядок проверок — не косметика. Наши осознанные решения (блокировка,
 * возврат) важнее и срока, и остатка: сертификат, который мы отозвали, обязан
 * назвать именно эту причину, даже если у него заодно вышел срок.
 *
 * Срок сверяем сами, а не полагаемся на статус: expireCertificates ходит раз в
 * сутки, и между прогонами статус ещё active, хотя платить уже нельзя. Карта
 * не должна врать эти несколько часов.
 */
export function passVoidReason(src: PassSource, now: Date = new Date()): string | null {
  if (src.status === "blocked") return "Заблокирован";
  if (src.status === "refunded") return "Возврат";
  if (src.status === "used") return "Погашен";
  if (src.status === "expired" || src.validUntil.getTime() <= now.getTime()) {
    return "Срок истёк";
  }
  // Остаток мог обнулиться сверкой с Altegio раньше, чем сменился статус
  if (src.balanceKzt <= 0) return "Погашен";
  return null;
}

/** Срок действия для печати на карте: 18.11.2026 по времени салона. */
export function formatValidUntil(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Собирает поля карты. Чистая: одни и те же данные дают одну и ту же карту. */
export function buildPassFields(src: PassSource, now: Date = new Date()): PassFields {
  const voidReason = passVoidReason(src, now);
  const balanceKzt = Math.max(0, src.balanceKzt);
  // Номинал показываем второй строкой, только если потрачена часть: на целом
  // сертификате «20 000 ₸ из 20 000 ₸» — лишний шум.
  const spent = src.amountKzt !== null && balanceKzt < src.amountKzt;

  return {
    headline: src.amountKzt !== null ? formatKzt(src.amountKzt) : (src.programName ?? "Сертификат"),
    holder: src.holder,
    code: src.code,
    balanceKzt,
    balanceLabel: formatKzt(balanceKzt),
    ofAmountLabel: spent ? `из ${formatKzt(src.amountKzt as number)}` : null,
    salonName: src.salonName,
    validUntil: src.validUntil,
    validUntilLabel: formatValidUntil(src.validUntil),
    barcodeMessage: src.code,
    voided: voidReason !== null,
    voidReason,
  };
}

/**
 * Что на карте показано прямо сейчас — то, с чем сравниваем свежие поля.
 *
 * ВНИМАНИЕ: в схеме (`WalletPass`) сейчас есть только `shownBalanceKzt`.
 * Признак voided нигде не запомнен, а значит переход «действителен →
 * погашен» с неизменным остатком (блокировка, возврат) пуш не разбудит.
 * Перед эндпоинтами Apple нужна миграция с колонкой `shown_voided`.
 */
export type ShownState = {
  /** null — карта ещё ни разу не обновлялась после выпуска */
  balanceKzt: number | null;
  voided: boolean;
};

/**
 * Будить ли устройство пушем. Каждый лишний пуш — поход APNs и запрос за
 * пропуском, поэтому молчим, когда сверка с Altegio ничего не изменила.
 */
export function shouldPushUpdate(shown: ShownState, fields: PassFields): boolean {
  if (shown.balanceKzt === null) return true;
  if (shown.voided !== fields.voided) return true;
  return shown.balanceKzt !== fields.balanceKzt;
}

/**
 * Серийный номер карты. Намеренно НЕ код сертификата: serial уезжает на
 * устройство и светится в каждом запросе веб-сервиса, а код — секрет и лежит
 * у нас только хэшем (см. комментарий к модели WalletPass).
 */
export function generatePassSerial(): string {
  return randomBytes(16).toString("hex");
}
