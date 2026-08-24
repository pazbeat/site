import "server-only";
import { prisma } from "@/lib/db";
import { pushToDevices } from "./apns";
import { updateGoogleCard } from "./google";
import { buildPassFields } from "./pass";
import { markShown, passNeedsPush, toPassSource } from "./service";

/**
 * «На сертификате изменился остаток — обнови карту в кошельке».
 *
 * Зовётся из сверки с Altegio: кассир погасил сертификат в салоне, у нас
 * поменялся баланс, и карта обязана это показать. Ради этого весь кошелёк
 * и делался — у действующего сайта карта замирает на сумме покупки навсегда.
 *
 * Платформы разбужены по-разному, потому что устроены по-разному: Apple
 * умеет только «сходи за новой картой» (push на устройства), а у Google карта
 * лежит на их стороне — ей меняем остаток прямо через API, и рассылку по
 * телефонам Google берёт на себя.
 *
 * Best-effort и молча: сверка погашений не должна падать из-за того, что
 * Apple или Google не ответили. Не разбудили сейчас — телефон придёт за
 * обновлением сам, просто позже.
 */
export async function refreshPassesForCertificate(certificateId: string): Promise<void> {
  try {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { salon: true, programOption: { include: { program: true } } },
    });
    if (!certificate) return;

    const source = toPassSource(certificate);
    if (!source) return;
    const fields = buildPassFields(source);

    const passes = await prisma.walletPass.findMany({
      where: { certificateId },
      include: { devices: true },
    });

    for (const pass of passes) {
      // Сверка могла ничего не изменить — тогда и будить незачем
      if (!passNeedsPush(pass, fields)) continue;

      if (pass.platform === "google") {
        try {
          await updateGoogleCard({ serialNumber: pass.serialNumber, fields });
        } catch (error) {
          console.error("wallet: карта Google не обновлена", {
            certificateId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Не помечаем показанным: следующая сверка попробует снова
          continue;
        }
        await markShown(pass.id, fields);
        continue;
      }

      const result = await pushToDevices(pass.devices.map((device) => device.pushToken));

      // 410 от Apple: карту с устройства удалили. Чистим, иначе будем
      // стучаться в несуществующий телефон при каждом погашении.
      if (result.gone.length > 0) {
        await prisma.walletDevice.deleteMany({
          where: { passId: pass.id, pushToken: { in: result.gone } },
        });
      }

      // Помечаем показанное независимо от судьбы пуша: телефон всё равно
      // придёт за свежей картой сам, а повторные пуши только шумят.
      await markShown(pass.id, fields);
      if (result.sent > 0 || result.failed > 0) {
        await prisma.walletPass.update({
          where: { id: pass.id },
          data: { lastPushedAt: new Date() },
        });
      }
    }
  } catch (error) {
    console.error("wallet: не удалось обновить карты", { certificateId, error });
  }
}
