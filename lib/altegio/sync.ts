import "server-only";
import { prisma } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { hashCode, maskCode } from "../certificate-code";
import { nextSalonSerial } from "../certificates";
import { isAltegioConfigured } from "./client";
import { resolveProgramTitle } from "./catalog";
import { issueCertificateOperation, type IssueResult } from "./operations";

/**
 * Сколько номеров подряд пробуем, наткнувшись на чужой. Нумерация филиала в
 * Altegio общая с действующим сайтом, и занятые номера попадаются вразнобой,
 * а не сплошным куском — десяти попыток с запасом хватает, чтобы перешагнуть
 * занятый. Упёрлись в предел — значит дело не в отдельном номере, и лучше
 * пометить синк провалившимся, чем молотить по чужому диапазону.
 */
const MAX_NUMBER_ATTEMPTS = 10;

/**
 * Синхронизация выпущенного сертификата в Altegio (Фаза 3). Наша БД — источник
 * истины по выпуску; в Altegio уходит наш публичный код IMB-… номером
 * сертификата, чтобы кассир мог погасить. Ошибка синка НЕ блокирует доставку.
 *
 * TEST-режим (ALTEGIO_TEST!=0): в комментарий/название добавляется «[ТЕСТ]»,
 * чтобы записи в Altegio были явно помечены.
 *
 * Боевая запись включается флагом ALTEGIO_SYNC=1. Пока флаг выключен —
 * конвейер только ЛОГИРУЕТ payload (dry-run), реальный HTTP-вызов не делается.
 * Точный эндпоинт выпуска в Altegio (POST …) ещё уточняется — см.
 * issueCertificate ниже.
 */

export type AltegioCertPayload = {
  companyId: number;
  /** Наш публичный код IMB-XXXX-XXXX — становится номером сертификата. */
  number: string;
  /** Внутренний серийник (WM001…), для сверки в CRM. */
  serial: string | null;
  balanceKzt: number;
  comment: string;
};

export function isAltegioTest(): boolean {
  return process.env.ALTEGIO_TEST !== "0";
}

export function isAltegioSyncEnabled(): boolean {
  return process.env.ALTEGIO_SYNC === "1";
}

/** Комментарий к сертификату в Altegio. В TEST-режиме — с пометкой «[ТЕСТ]». */
export function buildCertComment(input: {
  test: boolean;
  serial: string | null;
  orderId: string;
}): string {
  const prefix = input.test ? "[ТЕСТ] " : "";
  const serial = input.serial ? `${input.serial} · ` : "";
  return `${prefix}Сайт Imbir · ${serial}заказ ${input.orderId}`;
}

/**
 * Синхронизирует один сертификат в Altegio (выпуск через storage-операцию,
 * см. lib/altegio/operations.ts). При ALTEGIO_SYNC=1 — реальная запись;
 * иначе dry-run-лог. Идемпотентность — по уникальному номеру сертификата
 * (повторный выпуск → already_exists). В TEST-режиме уходит товар
 * «Тестовый 1тенге» на филиал 225022 (запись явно помечена как тест).
 */
export async function syncCertificateToAltegio(
  certificateId: string,
): Promise<void> {
  if (!isAltegioConfigured()) {
    console.log("[altegio] не сконфигурирован — пропуск синка");
    return;
  }

  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      salon: true,
      order: true,
      programOption: { include: { program: true } },
    },
  });
  if (!cert) throw new Error(`altegio sync: certificate ${certificateId} not found`);

  const companyId = cert.salon.altegioLocationId;
  if (!companyId) {
    console.log(
      `[altegio] у салона ${cert.salonId} нет altegioLocationId — пропуск`,
    );
    return;
  }

  // Номер сертификата: салонный (WM0001) лежит открыто в serial, и брать его
  // оттуда надёжнее — шифртекст затирается после первого показа кода
  // покупателю, и повторный синк по нему уже не собрался бы.
  const code =
    cert.serial ??
    (cert.codeEncrypted ? decryptSecret(cert.codeEncrypted) : null);
  if (!code) throw new Error("altegio sync: certificate code unavailable");

  // Программный сертификат → точное название товара Altegio (иначе продажа
  // ушла бы номинальным «Новый Электронный», которого под цену программы
  // чаще всего нет). Номинальный сертификат — по сумме.
  const programNameRu = cert.programOption
    ? ((cert.programOption.program.names as { ru?: string }).ru ?? null)
    : null;
  const programTitle = programNameRu
    ? resolveProgramTitle(programNameRu, cert.programOption!.priceKzt)
    : null;
  if (programNameRu && !programTitle) {
    console.warn(
      `[altegio] программа «${programNameRu}» (${cert.programOption!.priceKzt}₸) ` +
        `не смапплена на товар Altegio — попробуем номинал по сумме`,
    );
  }

  const payload: AltegioCertPayload = {
    companyId,
    number: code,
    serial: cert.serial,
    balanceKzt: cert.amountKzt ?? cert.balanceKzt,
    comment: buildCertComment({
      test: isAltegioTest(),
      serial: cert.serial,
      orderId: cert.orderId,
    }),
  };

  if (!isAltegioSyncEnabled()) {
    console.log(
      `[altegio] DRY-RUN (ALTEGIO_SYNC выкл) → company ${payload.companyId}, ` +
        `№ ${payload.number}, ${payload.balanceKzt}₸, "${payload.comment}"`,
    );
    return;
  }

  const markFailed = () =>
    prisma.certificate
      .update({
        where: { id: certificateId },
        data: { altegioSyncStatus: "failed" },
      })
      .catch(() => {});

  // Номер может оказаться занятым чужим сертификатом: в Altegio нумерация
  // филиала общая с действующим сайтом. Продажа тогда НЕ создаётся вовсе —
  // раньше мы принимали такой отказ за идемпотентный повтор и записывали
  // «синхронизировано», хотя в CRM не появлялось ничего, а по этому номеру
  // кассир нашёл бы чужой сертификат. Поэтому: занят — берём следующий номер.
  let result: IssueResult | null = null;
  let number = code;
  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt++) {
    let outcome: IssueResult;
    try {
      outcome = await issueCertificateOperation({
        code: number,
        amountKzt: payload.balanceKzt,
        companyId,
        programTitle,
        buyerName: cert.fromName,
        buyerEmail: cert.order.buyerEmail,
        buyerPhone:
          // Доставка теперь только на почту, телефон берём у покупателя
          cert.order.buyerPhone ?? undefined,
        orderId: cert.orderId,
        comment: payload.comment,
      });
    } catch (error) {
      // Помечаем провал синка, чтобы он был виден в админке.
      await markFailed();
      throw error;
    }

    if (outcome.status !== "already_exists") {
      result = outcome;
      break;
    }

    // Наш собственный повтор: документ продажи уже записан за этим
    // сертификатом — значит номер занят нами же, это идемпотентный успех.
    if (cert.altegioCertId) {
      result = outcome;
      break;
    }

    // Чужой номер. Салонного счётчика нет (случайный код IMB-…) — повторять
    // нечем: такой код уникален по построению, и «уже существует» означало бы
    // что-то другое, чего мы не понимаем.
    const next = cert.serial ? await nextSalonSerial(cert.salonId) : null;
    if (!next) {
      await markFailed();
      throw new Error(
        `altegio: номер ${number} занят («${outcome.message}»), ` +
          `заменить нечем — у салона ${cert.salonId} нет счётчика номеров`,
      );
    }
    console.warn(
      `[altegio] номер ${number} занят чужим сертификатом — ` +
        `сертификат ${certificateId} получает ${next} (попытка ${attempt})`,
    );
    await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        serial: next,
        codeHash: hashCode(next),
        codeDisplay: maskCode(next),
        codeEncrypted: encryptSecret(next),
      },
    });
    number = next;
  }

  if (!result) {
    await markFailed();
    throw new Error(
      `altegio: не удалось подобрать свободный номер за ${MAX_NUMBER_ATTEMPTS} ` +
        `попыток (последний — ${number}, салон ${cert.salonId})`,
    );
  }

  // Филиал и телефон клиента — ключ, по которому потом читаем состояние
  // обратно (Altegio отдаёт сертификаты только списком по клиенту).
  await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      altegioSyncStatus: "synced",
      altegioSyncedAt: new Date(),
      altegioCompanyId: result.companyId,
      // Пустой телефон не пишем: сверка остатков ищет клиента по номеру, и
      // пустая строка отправляла бы её в заведомо провальный запрос.
      altegioClientPhone:
        result.status === "issued" && result.clientPhone
          ? result.clientPhone
          : undefined,
      altegioCertId:
        result.status === "issued" ? String(result.documentId) : undefined,
    },
  });

  // Сразу подтягиваем состояние из CRM: заодно проверяем, что сертификат там
  // действительно виден, и запоминаем его id.
  try {
    const { syncOneCertificate } = await import("./redemptions");
    await syncOneCertificate(certificateId);
  } catch (error) {
    console.error("[altegio] первичная сверка не удалась", error);
  }

  if (result.status === "already_exists") {
    console.log(
      `[altegio] сертификат ${number} уже записан нами — идемпотентно ок`,
    );
  } else {
    console.log(
      `[altegio] выпущен сертификат ${number} → document ${result.documentId} ` +
        `(филиал ${result.companyId}, клиент ${result.clientId}, ` +
        `оплачен=${result.paid}, фолбэк=${result.fallback}; ` +
        `выбранный салон company ${companyId})`,
    );
    if (!result.paid && !isAltegioTest()) {
      console.warn(
        `[altegio] продажа ${result.documentId} осталась неоплаченной — ` +
          `в кассу она не попадёт, нужно провести вручную`,
      );
    }
  }
}
