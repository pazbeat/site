import "server-only";
import { prisma } from "./db";
import {
  generateCertificateCode,
  hashCode,
  maskCode,
} from "./certificate-code";
import { encryptSecret } from "./crypto";
import { getSetting } from "./data";

/**
 * Следующий серийный номер салона: WM001, WM002… Атомарно инкрементит
 * счётчик салона (single UPDATE … RETURNING — без гонок). Если у салона
 * не задан codePrefix, серийник не присваивается (null).
 */
async function nextSalonSerial(salonId: number): Promise<string | null> {
  const salon = await prisma.salon.update({
    where: { id: salonId },
    data: { lastCertSerial: { increment: 1 } },
    select: { codePrefix: true, lastCertSerial: true },
  });
  if (!salon.codePrefix) return null;
  return `${salon.codePrefix}${String(salon.lastCertSerial).padStart(3, "0")}`;
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
    method: "email" | "whatsapp";
    contact: string;
    scheduledAt?: string;
  };
};

/**
 * Подтверждение оплаты (PRD §5.3): идемпотентный переход pending→paid
 * + генерация сертификата. Повторный вебхук не создаёт второй сертификат:
 * атомарный updateMany со статусом-guard'ом.
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
    where: { id: orderId, status: "pending" },
    data: { status: "paid", paymentId: externalPaymentId },
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

  const code = generateCertificateCode();

  // Внутренний серийный номер по салону (WM001…): атомарный инкремент
  // счётчика салона. Не публичный — только для админки и Altegio.
  const serial = await nextSalonSerial(order.salonId);

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
    console.error("enqueue delivery failed, delivering inline", error);
    void import("./delivery")
      .then(({ deliverCertificate }) => deliverCertificate(certificate.id))
      .catch((deliveryError) =>
        console.error("inline delivery failed", deliveryError),
      );
  }

  // Синк в Altegio (Фаза 3) — best-effort, не блокирует оплату/доставку.
  // Сейчас dry-run-лог; боевая запись за флагом ALTEGIO_SYNC.
  void import("./altegio/sync")
    .then(({ syncCertificateToAltegio }) =>
      syncCertificateToAltegio(certificate.id),
    )
    .catch((error) => console.error("altegio sync failed (non-fatal)", error));

  return { status: "fulfilled", certificateId: certificate.id };
}
