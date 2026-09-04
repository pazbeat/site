import "server-only";
import { prisma } from "../db";
import {
  formatSalonCode,
  generateCertificateCode,
  hashCode,
  isValidCodeFormat,
  maskCode,
  normalizeCode,
} from "../certificate-code";
import { encryptSecret } from "../crypto";
import { getSetting } from "../data";
import { nextSalonSerial } from "../certificates";
import { resolveOrderAmount, type PricingItem } from "../pricing";
import { generateOrderRef } from "../order-ref";
import { reportFailure } from "../alerts";
import { recordPaymentEvent } from "../payment-events";

/**
 * Полный ручной выпуск сертификата из админки.
 *
 * Зачем отдельно от кнопки «довыпустить» в карточке заказа. Та чинит заказ,
 * который у нас ЕСТЬ: деньги пришли, сертификат не создался. Здесь другое —
 * заказа у нас нет вовсе. Так бывает, когда человек купил на действующем
 * сайте и потерял письмо, оплатил переводом на счёт, получил сертификат в
 * подарок от салона или пришёл с номером на руках, которого нет в нашей базе.
 *
 * Поэтому здесь можно задать всё: филиал, программу или сумму, дизайн, имена,
 * пожелание, срок и даже сам номер сертификата. Номер — главное отличие: если
 * у клиента на руках WM1234, сертификат в нашей базе должен получить ровно
 * этот номер, иначе на `/check` и в кошельке он увидит «не найден».
 *
 * Запись создаётся полноценная: заказ + сертификат, как у обычной покупки, —
 * чтобы работали и страница успеха, и чек, и повторная отправка, и сверка.
 * Отличает её `paymentId` вида `manual:…` и запись в журнале платежа.
 */

export type ManualIssueInput = {
  salonId: number;
  item: PricingItem;
  designId: number;
  toName: string;
  fromName: string;
  message?: string;
  /** Кому уходит сертификат. Пусто — почта покупателя. */
  recipientEmail?: string;
  buyerEmail: string;
  /** Номер сертификата, если задан вручную. Пусто — берём следующий по салону. */
  serial?: string;
  /** Сколько реально получено. 0 — подарок салона, в выручку не идёт. */
  paidKzt: number;
  /** Основание: номер чека, платёжки или причина. Обязательно. */
  reference: string;
  /** Срок действия в месяцах; пусто — как в настройках сайта. */
  validMonths?: number;
  /** Записать продажу в Altegio. Выключать, если она там уже есть. */
  syncToAltegio: boolean;
  /** Отправить письмо получателю и покупателю. */
  sendEmail: boolean;
  actor: string;
};

export type ManualIssueResult =
  | {
      ok: true;
      certificateId: string;
      orderId: string;
      serial: string | null;
      successToken: string;
      /** Что сказал Altegio. null — синк не запрашивали. */
      altegio: "synced" | "failed" | "skipped" | null;
    }
  | { ok: false; error: string };

/**
 * Приводит введённый номер к каноническому виду и проверяет, что он наш.
 *
 * Принимаем два формата, ровно как `/check`: салонный (WM9001) и старый
 * случайный (IMB-XXXX-XXXX). Пробелы и регистр менеджеру прощаем — номер он
 * переписывает с чужого экрана или с бумаги.
 */
export function normalizeManualSerial(raw: string): string | null {
  const value = normalizeCode(raw);
  if (!value) return null;
  return isValidCodeFormat(value) ? value : null;
}

export async function issueCertificateManually(
  input: ManualIssueInput,
): Promise<ManualIssueResult> {
  if (!input.reference.trim()) {
    return { ok: false, error: "Укажите основание: номер чека, платёжки или причину." };
  }

  // Филиал без привязки к Altegio (Жезказган, Экибастуз) для ручного выпуска
  // допустим: там сертификат живёт только у нас, и это осознанный выбор
  // менеджера. Проверку выпускаемости номинала снимаем по той же причине,
  // если продажу в CRM не пишем.
  const pricing = await resolveOrderAmount(input.salonId, input.item, {
    requireIssuable: input.syncToAltegio,
    allowNonOrderable: true,
  });
  if (!pricing.ok) {
    const human: Record<string, string> = {
      salon_not_found: "Филиал не найден или отключён.",
      option_not_found: "Программа или вариант не найдены.",
      program_unavailable_in_city: "Эта программа не проводится в городе филиала.",
      nominal_not_found: "Номинал не найден.",
      amount_out_of_bounds: "Сумма вне допустимых границ.",
      amount_not_available:
        "Под такую сумму нет товара в Altegio — снимите галочку записи в CRM или выберите другой номинал.",
    };
    return { ok: false, error: human[pricing.error] ?? pricing.error };
  }

  const design = await prisma.design.findUnique({
    where: { id: input.designId },
  });
  if (!design) return { ok: false, error: "Дизайн не найден." };

  // Номер: заданный вручную или следующий по счётчику филиала.
  let serial: string | null = null;
  let manualSerial = false;
  if (input.serial?.trim()) {
    const normalized = normalizeManualSerial(input.serial);
    if (!normalized) {
      return {
        ok: false,
        error:
          "Номер не похож на наш: ожидается салонный (например, WM9001) или старый IMB-XXXX-XXXX.",
      };
    }
    const taken = await prisma.certificate.findFirst({
      where: { OR: [{ serial: normalized }, { codeHash: hashCode(normalized) }] },
      select: { id: true },
    });
    if (taken) {
      return { ok: false, error: `Номер ${normalized} уже занят у нас в базе.` };
    }
    serial = normalized;
    manualSerial = true;
  }

  const validityRaw = await getSetting("certificate_validity_months");
  const months =
    input.validMonths ??
    (typeof validityRaw === "number" ? validityRaw : 3);
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + months);

  const faceKzt = pricing.amountKzt;
  const recipient = input.recipientEmail?.trim() || input.buyerEmail.trim();

  // Короткий номер для Kaspi заводим и здесь: колонка уникальна, а карточка
  // заказа и мост ожидают его у любого заказа.
  let kaspiRef = generateOrderRef();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await prisma.order.findUnique({ where: { kaspiRef } });
    if (!clash) break;
    kaspiRef = generateOrderRef();
  }

  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        kaspiRef,
        salonId: input.salonId,
        buyerEmail: input.buyerEmail.trim(),
        amountKzt: Math.max(0, Math.round(input.paidKzt)),
        status: "paid",
        paidAt: new Date(),
        paymentId: `manual:${input.reference.trim()}`,
        // Согласия покупателя здесь нет и быть не может: заказ оформляет
        // сотрудник. Пишем это прямо, а не подставляем чужую запись —
        // согласие вообще существует ради того, чтобы отвечать на вопрос
        // «кто и когда согласился», и подделывать ответ нельзя.
        consent: {
          manual: true,
          actor: input.actor,
          reference: input.reference.trim(),
          ts: new Date().toISOString(),
          note: "Выпущено вручную из админки, согласия покупателя на сайте нет",
        },
        item: {
          ...pricing.itemSnapshot,
          amountKzt: faceKzt,
          designId: design.id,
          toName: input.toName.trim(),
          fromName: input.fromName.trim(),
          message: input.message?.trim() || undefined,
          delivery: { method: "email", contact: recipient },
          locale: "ru",
        },
      },
    });

    const number = serial ?? (await nextSalonSerial(input.salonId, tx));
    const code = number ?? generateCertificateCode();
    const snapshot = pricing.itemSnapshot as { programOptionId?: number };

    const certificate = await tx.certificate.create({
      data: {
        orderId: order.id,
        salonId: input.salonId,
        codeHash: hashCode(code),
        codeDisplay: maskCode(code),
        codeEncrypted: encryptSecret(code),
        serial: number,
        type: input.item.type,
        programOptionId:
          input.item.type === "program" ? (snapshot.programOptionId ?? null) : null,
        amountKzt: faceKzt,
        balanceKzt: faceKzt,
        designId: design.id,
        toName: input.toName.trim(),
        fromName: input.fromName.trim(),
        message: input.message?.trim() || null,
        deliveryMethod: "email",
        deliveryContact: recipient,
        validUntil,
        // Продажу в CRM не пишем — статус должен это говорить, а не молчать
        // словом «pending», за которым сверка будет гоняться вечно.
        altegioSyncStatus: input.syncToAltegio ? "pending" : "skipped",
      },
    });

    return { order, certificate, number };
  });

  void recordPaymentEvent({
    orderId: created.order.id,
    provider: null,
    source: "manual",
    kind: "paid",
    externalRef: input.reference.trim(),
    amountKzt: created.order.amountKzt,
    note: `ручной выпуск, ${input.actor}`,
  });

  // Запись в CRM. Ждём её, как и при обычном выпуске: менеджер должен увидеть
  // результат сразу, а не гадать, дошло ли.
  let altegio: "synced" | "failed" | "skipped" | null = null;
  if (input.syncToAltegio) {
    try {
      const { syncCertificateToAltegio } = await import("../altegio/sync");
      await syncCertificateToAltegio(created.certificate.id, {
        // Номер, заданный менеджером, подменять нельзя — см. комментарий там.
        allowRenumber: !manualSerial,
      });
      const after = await prisma.certificate.findUnique({
        where: { id: created.certificate.id },
        select: { altegioSyncStatus: true },
      });
      altegio = after?.altegioSyncStatus === "synced" ? "synced" : "failed";
    } catch (error) {
      altegio = "failed";
      void reportFailure("Ручной выпуск: не записан в Altegio", error, {
        сертификат: created.certificate.id,
        серийник: created.number,
      });
    }
  } else {
    altegio = "skipped";
  }

  if (input.sendEmail) {
    try {
      const { enqueueDelivery } = await import("../queue");
      await enqueueDelivery(created.certificate.id, null);
    } catch {
      const { deliverCertificate } = await import("../delivery");
      void deliverCertificate(created.certificate.id).catch((error) =>
        reportFailure("Ручной выпуск: письмо не ушло", error, {
          сертификат: created.certificate.id,
        }),
      );
    }
  }

  // Уведомление о продаже — как у обычной, с пометкой ручного выпуска.
  void import("../notify")
    .then(({ notifySale }) => notifySale(created.certificate.id, { manual: true }))
    .catch(() => {});

  return {
    ok: true,
    certificateId: created.certificate.id,
    orderId: created.order.id,
    serial: created.number,
    successToken: created.order.successToken,
    altegio,
  };
}

/** Подсказка «какой номер получит сертификат, если не задавать вручную». */
export async function nextSerialPreview(salonId: number): Promise<string | null> {
  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: { codePrefix: true, lastCertSerial: true },
  });
  if (!salon?.codePrefix) return null;
  return formatSalonCode(salon.codePrefix, salon.lastCertSerial + 1);
}
