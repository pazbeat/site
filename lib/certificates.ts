import "server-only";
import { prisma } from "./db";
import {
  formatSalonCode,
  generateCertificateCode,
  hashCode,
  maskCode,
} from "./certificate-code";
import { encryptSecret } from "./crypto";
import { getSetting } from "./data";
import { reportFailure } from "./alerts";

/**
 * Следующий номер сертификата по салону: WM0001, WM0002… Атомарно
 * инкрементит счётчик салона (single UPDATE … RETURNING — без гонок).
 * Если у салона не задан codePrefix, номер не присваивается (null) и код
 * выдаётся случайный.
 */
async function nextSalonSerial(salonId: number): Promise<string | null> {
  const salon = await prisma.salon.update({
    where: { id: salonId },
    data: { lastCertSerial: { increment: 1 } },
    select: { codePrefix: true, lastCertSerial: true },
  });
  if (!salon.codePrefix) return null;
  return formatSalonCode(salon.codePrefix, salon.lastCertSerial);
}

type OrderItem = {
  type: "program" | "nominal";
  programOptionId?: number;
  amountKzt: number;
  designId: number;
  toName: string;
  fromName: string;
  message?: string;
  delivery: {
    method: "email";
    contact: string;
    scheduledAt?: string;
  };
};

/**
 * Подтверждение оплаты (PRD §5.3): идемпотентный переход pending→paid
 * + генерация сертификата. Повторный вебхук не создаёт второй сертификат:
 * атомарный updateMany со статусом-guard'ом.
 *
 * Принимаем и expired: у Kaspi/Forte нет вебхуков, и оплата могла прийти
 * после нашего 30-минутного протухания (API провайдера лежал, сервер
 * рестартовал, покупатель оплатил старый счёт). Деньги первичны —
 * оплаченный заказ воскресает, сертификат выпускается.
 */
export async function fulfillOrder(
  orderId: string,
  externalPaymentId: string,
): Promise<
  | { status: "fulfilled"; certificateId: string }
  | { status: "already_fulfilled" }
  | { status: "not_found" }
  | { status: "not_payable" }
> {
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ["pending", "expired"] } },
    // paidAt отдельно от createdAt: вебхуков у Kaspi и Forte нет, статус
    // узнаём опросом или подтверждают руками — деньги приходят много позже
    // создания заказа, а иногда и после его протухания.
    data: { status: "paid", paymentId: externalPaymentId, paidAt: new Date() },
  });

  if (claimed.count === 0) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { status: "not_found" };
    // Уже оплачен (повторный вебхук) — идемпотентный успех
    if (order.status === "paid") return { status: "already_fulfilled" };
    return { status: "not_payable" }; // expired / cancelled / refunded
  }

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
  });
  const item = order.item as OrderItem;

  const validityMonthsRaw = await getSetting("certificate_validity_months");
  const validityMonths =
    typeof validityMonthsRaw === "number" ? validityMonthsRaw : 3;
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + validityMonths);

  // Номер сертификата по салону (WM0001…): атомарный инкремент счётчика.
  // Он же публичный код — один номер и в письме, и в PDF, и в Altegio, как
  // на действующем сайте: кассир ищет в CRM ровно то, что покупатель видит.
  const serial = await nextSalonSerial(order.salonId);
  // Запасной путь: у салона нет префикса — выдаём случайный код, иначе
  // сертификат остался бы вовсе без номера.
  const code = serial ?? generateCertificateCode();

  const certificate = await prisma.certificate.create({
    data: {
      orderId: order.id,
      salonId: order.salonId,
      codeHash: hashCode(code),
      codeDisplay: maskCode(code),
      codeEncrypted: encryptSecret(code),
      serial,
      type: item.type,
      programOptionId:
        item.type === "program" ? (item.programOptionId ?? null) : null,
      amountKzt: item.amountKzt,
      balanceKzt: item.amountKzt,
      designId: item.designId,
      toName: item.toName,
      fromName: item.fromName,
      message: item.message || null,
      deliveryMethod: item.delivery.method,
      deliveryContact: item.delivery.contact,
      scheduledAt: item.delivery.scheduledAt
        ? new Date(item.delivery.scheduledAt)
        : null,
      validUntil,
    },
  });

  // Доставка: сразу или к назначенной дате. Сбой постановки в очередь
  // не блокирует подтверждение оплаты (вебхук должен ответить 200) —
  // резервный путь: немедленная доставка в фоне.
  try {
    const { enqueueDelivery } = await import("./queue");
    await enqueueDelivery(certificate.id, certificate.scheduledAt);
  } catch (error) {
    void reportFailure("доставка: очередь недоступна", error, {
      сертификат: certificate.id,
      заказ: orderId,
    });
    void import("./delivery")
      .then(({ deliverCertificate }) => deliverCertificate(certificate.id))
      .catch((deliveryError) =>
        reportFailure("доставка: не ушло письмо", deliveryError, {
          сертификат: certificate.id,
          заказ: orderId,
        }),
      );
  }

  // Синк в Altegio (Фаза 3) — best-effort, не блокирует оплату/доставку.
  // Сейчас dry-run-лог; боевая запись за флагом ALTEGIO_SYNC.
  void import("./altegio/sync")
    .then(({ syncCertificateToAltegio }) =>
      syncCertificateToAltegio(certificate.id),
    )
    .catch((error) =>
      reportFailure("Altegio: сертификат не записан в CRM", error, {
        сертификат: certificate.id,
        заказ: orderId,
        серийник: certificate.serial,
      }),
    );

  // Уведомление админу о продаже (Telegram) — тоже best-effort.
  void import("./notify")
    .then(({ notifySale }) =>
      notifySale(certificate.id, {
        manual: externalPaymentId.startsWith("manual:"),
      }),
    )
    .catch((error) =>
      reportFailure("уведомление о продаже не отправлено", error, {
        сертификат: certificate.id,
      }),
    );

  return { status: "fulfilled", certificateId: certificate.id };
}
