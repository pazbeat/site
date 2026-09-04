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
  /**
   * Скидка по промокоду, если была. Без неё в CRM необъяснимая картина:
   * в кассу пришло 70 ₸, а внутри документа товар за 100 ₸ — и понять,
   * почему суммы разошлись, не по чему.
   */
  promo?: {
    code: string;
    kind: "percent" | "fixed";
    value: number;
    faceKzt: number;
    paidKzt: number;
  } | null;
}): string {
  const prefix = input.test ? "[ТЕСТ] " : "";
  const serial = input.serial ? `${input.serial} · ` : "";
  const money = (v: number) =>
    `${v.toLocaleString("ru-RU").replace(/\s/g, " ")} ₸`;
  const parts = [`${prefix}Сайт Imbir · ${serial}заказ ${input.orderId}`];
  if (input.promo) {
    const size =
      input.promo.kind === "percent"
        ? `${input.promo.value}%`
        : money(input.promo.value);
    parts.push(
      `промокод ${input.promo.code} −${size}: оплачено ` +
        `${money(input.promo.paidKzt)} из ${money(input.promo.faceKzt)}`,
    );
  }
  return parts.join(" · ");
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
      order: { include: { promo: true } },
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
  // Товар берём из снапшота заказа, а не из живого варианта программы: цену
  // варианта в админке можно поменять после оплаты, и резолв по текущей цене
  // увёл бы выпуск на товар другого варианта — с другим балансом. Сумма и так
  // снята в момент покупки (cert.amountKzt), название должно быть оттуда же.
  const snapshotTitle =
    (cert.order.item as { altegioProgramTitle?: string | null } | null)
      ?.altegioProgramTitle ?? null;
  const faceKzt = cert.amountKzt ?? cert.balanceKzt;
  const programTitle =
    snapshotTitle ??
    (programNameRu ? resolveProgramTitle(programNameRu, faceKzt) : null);
  if (programNameRu && !programTitle) {
    console.warn(
      `[altegio] программа «${programNameRu}» (${faceKzt}₸) ` +
        `не смапплена на товар Altegio — попробуем номинал по сумме`,
    );
  }

  const payload: AltegioCertPayload = {
    companyId,
    number: code,
    serial: cert.serial,
    balanceKzt: faceKzt,
    comment: buildCertComment({
      test: isAltegioTest(),
      serial: cert.serial,
      orderId: cert.orderId,
      promo: cert.order.promo
        ? {
            code: cert.order.promo.code,
            kind: cert.order.promo.kind,
            value: cert.order.promo.value,
            faceKzt,
            paidKzt: cert.order.amountKzt,
          }
        : null,
    }),
  };

  if (!isAltegioSyncEnabled()) {
    console.log(
      `[altegio] DRY-RUN (ALTEGIO_SYNC выкл) → company ${payload.companyId}, ` +
        `№ ${payload.number}, ${payload.balanceKzt}₸, "${payload.comment}"`,
    );
    return;
  }

  /**
   * Помечает провал синка: статус, причина и счётчик попыток.
   *
   * Причину пишем в базу, а не только в лог: по одному слову «failed» в
   * админке нельзя понять, занят ли номер, лежит ли CRM или у филиала нет
   * товара под этот номинал — а решения это требует разных. Счётчик нужен
   * автоповтору (lib/reconcile.ts): у него должен быть потолок, иначе
   * сертификат, который Altegio отвергает по существу, повторялся бы вечно
   * и прятал настоящие сбои в шуме.
   */
  const markFailed = (reason: unknown) =>
    prisma.certificate
      .update({
        where: { id: certificateId },
        data: {
          altegioSyncStatus: "failed",
          altegioSyncAttempts: { increment: 1 },
          altegioLastError: (reason instanceof Error
            ? reason.message
            : String(reason)
          ).slice(0, 500),
        },
      })
      .catch(() => {});

  // Номер может оказаться занятым чужим сертификатом: в Altegio нумерация
  // филиала общая с действующим сайтом. Продажа тогда НЕ создаётся вовсе —
  // раньше мы принимали такой отказ за идемпотентный повтор и записывали
  // «синхронизировано», хотя в CRM не появлялось ничего, а по этому номеру
  // кассир нашёл бы чужой сертификат. Поэтому: занят — берём следующий номер.
  let result: IssueResult | null = null;
  let number = code;
  // Комментарий несёт номер сертификата, и при замене номера его надо
  // пересобирать: иначе в кассе документ подписан номером, которого у
  // сертификата уже нет, и найти его по подписи невозможно (поймано
  // 2026-08-26 — продажа WM9001 осталась подписана «WM0006»).
  let comment = payload.comment;
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
        comment,
        // В кассу проводим то, что покупатель реально заплатил: промокод
        // уменьшает оплату, номинал сертификата остаётся полным.
        paidKzt: cert.order.amountKzt,
      });
    } catch (error) {
      // Помечаем провал синка, чтобы он был виден в админке.
      await markFailed(error);
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
      const reason = new Error(
        `номер ${number} занят («${outcome.message}»), заменить нечем — ` +
          `у салона ${cert.salonId} нет счётчика номеров`,
      );
      await markFailed(reason);
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
    comment = buildCertComment({
      test: isAltegioTest(),
      serial: next,
      orderId: cert.orderId,
      promo: cert.order.promo
        ? {
            code: cert.order.promo.code,
            kind: cert.order.promo.kind,
            value: cert.order.promo.value,
            faceKzt,
            paidKzt: cert.order.amountKzt,
          }
        : null,
    });
  }

  if (!result) {
    await markFailed(
      new Error(
        `не удалось подобрать свободный номер за ${MAX_NUMBER_ATTEMPTS} попыток`,
      ),
    );
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
      altegioSyncAttempts: { increment: 1 },
      // Причина прошлой неудачи больше не актуальна — иначе в админке рядом
      // с «синхронизировано» висела бы старая ошибка.
      altegioLastError: null,
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
      // Не console.warn: сертификат в CRM есть, но продажа не проведена —
      // в кассовой смене её не будет, и бухгалтер этого не заметит, пока не
      // начнёт сводить деньги. Такое обязано доходить до людей.
      const { reportFailure } = await import("@/lib/alerts");
      void reportFailure(
        "Altegio: продажа не проведена в кассу",
        new Error(`документ ${result.documentId} остался неоплаченным`),
        {
          сертификат: certificateId,
          серийник: number,
          документ: String(result.documentId),
        },
      );
    }
  }
}
