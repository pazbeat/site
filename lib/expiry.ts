import "server-only";
import { prisma } from "./db";

/**
 * Переводит сертификаты с вышедшим сроком в expired. Без этого статус врал бы:
 * сертификат оставался «активным» навсегда, хотя погасить его уже нельзя
 * (redeemCertificate пускает только active/partially_used), а в «активных
 * обязательствах» на дашборде висел бы его баланс.
 *
 * Неиспользованный остаток частично погашенного тоже сгорает — статус
 * partially_used так же уходит в expired.
 *
 * Идемпотентно: повторный прогон ничего не находит. Продление срока в админке
 * возвращает сертификат в active (см. extendAction).
 */
export async function expireCertificates(now: Date = new Date()): Promise<number> {
  const result = await prisma.certificate.updateMany({
    where: {
      status: { in: ["active", "partially_used"] },
      validUntil: { lt: now },
    },
    data: { status: "expired" },
  });
  if (result.count > 0) {
    console.log(`expire-certificates: expired ${result.count} certificate(s)`);
  }
  return result.count;
}
