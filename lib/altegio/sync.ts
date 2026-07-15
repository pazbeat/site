import "server-only";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import { isAltegioConfigured } from "./client";
import { issueCertificateOperation } from "./operations";

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
    include: { salon: true, order: true },
  });
  if (!cert) throw new Error(`altegio sync: certificate ${certificateId} not found`);

  const companyId = cert.salon.altegioLocationId;
  if (!companyId) {
    console.log(
      `[altegio] у салона ${cert.salonId} нет altegioLocationId — пропуск`,
    );
    return;
  }

  const code = cert.codeEncrypted ? decryptSecret(cert.codeEncrypted) : null;
  if (!code) throw new Error("altegio sync: certificate code unavailable");

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

  let result;
  try {
    result = await issueCertificateOperation({
      code,
      amountKzt: payload.balanceKzt,
      companyId,
      programTitle: null,
      buyerName: cert.fromName,
      buyerEmail: cert.order.buyerEmail,
      buyerPhone:
        cert.deliveryMethod === "whatsapp" ? cert.deliveryContact : undefined,
      orderId: cert.orderId,
      comment: payload.comment,
    });
  } catch (error) {
    // Помечаем провал синка, чтобы он был виден в админке.
    await prisma.certificate
      .update({
        where: { id: certificateId },
        data: { altegioSyncStatus: "failed" },
      })
      .catch(() => {});
    throw error;
  }

  // Филиал и телефон клиента — ключ, по которому потом читаем состояние
  // обратно (Altegio отдаёт сертификаты только списком по клиенту).
  await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      altegioSyncStatus: "synced",
      altegioSyncedAt: new Date(),
      altegioCompanyId: result.companyId,
      altegioClientPhone:
        result.status === "issued" ? result.clientPhone : undefined,
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
    console.log(`[altegio] сертификат ${code} уже существует — идемпотентно ок`);
  } else {
    console.log(
      `[altegio] выпущен сертификат ${code} → document ${result.documentId} ` +
        `(филиал ${result.companyId}, клиент ${result.clientId}, ` +
        `оплачен=${result.paid}, фолбэк=${result.fallback}; ` +
        `выбранный салон company ${companyId})`,
    );
  }
}
