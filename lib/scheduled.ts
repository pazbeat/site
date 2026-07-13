import "server-only";
import { prisma } from "./db";

/**
 * Развозка отложенных доставок (Фаза 2). Модель: заказ с будущей датой
 * НЕ пред-планируется в pg-boss — вместо этого периодический sweeper
 * находит наступившие и ставит немедленную доставку. Так перенос/отправка
 * сейчас из админки — это просто правка scheduledAt, и всё переживает
 * рестарты сервиса. Идемпотентность обеспечивает sentAt в deliverCertificate.
 */
export async function deliverDueScheduled(
  now: Date = new Date(),
): Promise<number> {
  const due = await prisma.certificate.findMany({
    where: {
      sentAt: null,
      scheduledAt: { not: null, lte: now },
      status: { in: ["active", "partially_used"] },
    },
    select: { id: true },
  });
  if (due.length === 0) return 0;

  const { enqueueDelivery } = await import("./queue");
  for (const cert of due) {
    try {
      await enqueueDelivery(cert.id, null);
    } catch (error) {
      console.error(`scheduled delivery enqueue failed for ${cert.id}`, error);
    }
  }
  console.log(`deliver-scheduled: enqueued ${due.length} delivery(ies)`);
  return due.length;
}
