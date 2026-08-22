import "server-only";
import { timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { pickL10n } from "@/lib/l10n";
import { buildPassFields, generatePassAuthToken, generatePassSerial, shouldPushUpdate, type PassFields, type PassSource } from "./pass";
import type { WalletPlatform } from "@/lib/generated/prisma/client";

/**
 * Работа с пропусками в базе: выпуск, поиск по серийнику, регистрация
 * устройств. Вся политика «что на карте» живёт в `pass.ts` и сюда не лезет —
 * здесь только хранение.
 *
 * Серийник и токен веб-сервиса создаются один раз при первом добавлении карты
 * и дальше не меняются: Apple адресует пропуск серийником, а токен обязан
 * совпадать в каждом обновлении, иначе устройство отвалится и потребует
 * добавить карту заново.
 */

function loadCertificate(id: string) {
  return prisma.certificate.findUnique({
    where: { id },
    include: { salon: true, programOption: { include: { program: true } } },
  });
}

type LoadedCertificate = NonNullable<Awaited<ReturnType<typeof loadCertificate>>>;

/** Данные сертификата для карты; null — если номер недоступен. */
export function toPassSource(certificate: LoadedCertificate): PassSource | null {
  if (!certificate.codeEncrypted) return null;
  const code = decryptSecret(certificate.codeEncrypted);
  if (!code) return null;

  return {
    code,
    holder: certificate.toName,
    amountKzt: certificate.type === "program" ? null : certificate.amountKzt,
    balanceKzt: certificate.balanceKzt,
    status: certificate.status,
    validUntil: certificate.validUntil,
    salonName: certificate.salon.name,
    programName:
      certificate.type === "program" && certificate.programOption
        ? pickL10n(certificate.programOption.program.names, "ru")
        : null,
  };
}

export async function passFieldsFor(certificateId: string): Promise<PassFields | null> {
  const certificate = await loadCertificate(certificateId);
  if (!certificate) return null;
  const source = toPassSource(certificate);
  return source ? buildPassFields(source) : null;
}

/**
 * Пропуск для сертификата: существующий или новый. Повторный вызов возвращает
 * тот же серийник — иначе у покупателя в кошельке плодились бы дубликаты
 * одной и той же карты.
 */
export async function ensurePass(certificateId: string, platform: WalletPlatform) {
  const existing = await prisma.walletPass.findUnique({
    where: { certificateId_platform: { certificateId, platform } },
  });
  if (existing) return existing;

  return prisma.walletPass.create({
    data: {
      certificateId,
      platform,
      serialNumber: generatePassSerial(),
      authTokenEnc: encryptSecret(generatePassAuthToken()),
    },
  });
}

export function findPassBySerial(serialNumber: string) {
  return prisma.walletPass.findUnique({
    where: { serialNumber },
    include: {
      certificate: {
        include: { salon: true, programOption: { include: { program: true } } },
      },
    },
  });
}

/**
 * Проверяет заголовок `Authorization: ApplePass <token>`.
 * Сравнение постоянного времени — как в мосте Kaspi: обычное сравнение строк
 * по времени ответа позволяет подбирать секрет посимвольно.
 */
export function passAuthorized(authTokenEnc: string, request: Request): boolean {
  const expected = decryptSecret(authTokenEnc);
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const match = /^ApplePass\s+(.+)$/i.exec(header.trim());
  if (!match) return false;

  const a = Buffer.from(match[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Регистрация устройства на обновления. Повторная — не ошибка, а смена токена. */
export async function registerDevice(
  passId: string,
  deviceLibraryId: string,
  pushToken: string,
): Promise<{ created: boolean }> {
  const existing = await prisma.walletDevice.findUnique({
    where: { passId_deviceLibraryId: { passId, deviceLibraryId } },
  });
  if (existing) {
    // Токен APNs у устройства меняется — иначе пуш уйдёт в никуда
    if (existing.pushToken !== pushToken) {
      await prisma.walletDevice.update({
        where: { id: existing.id },
        data: { pushToken },
      });
    }
    return { created: false };
  }
  await prisma.walletDevice.create({ data: { passId, deviceLibraryId, pushToken } });
  return { created: true };
}

export async function unregisterDevice(
  passId: string,
  deviceLibraryId: string,
): Promise<boolean> {
  const { count } = await prisma.walletDevice.deleteMany({
    where: { passId, deviceLibraryId },
  });
  return count > 0;
}

/**
 * Серийники карт устройства, изменившихся с прошлого раза.
 *
 * `passesUpdatedSince` — метка, которую мы же и выдали в прошлый раз. Отдаём
 * время последнего изменения: Apple вернёт его следующим запросом, и мы
 * пришлём только то, что новее.
 */
export async function serialsForDevice(
  deviceLibraryId: string,
  updatedSince?: string,
): Promise<{ serialNumbers: string[]; lastUpdated: string } | null> {
  const since = updatedSince ? new Date(updatedSince) : null;
  const devices = await prisma.walletDevice.findMany({
    where: { deviceLibraryId },
    include: { pass: true },
  });
  if (devices.length === 0) return null;

  const passes = devices
    .map((device) => device.pass)
    .filter((pass) =>
      since && !Number.isNaN(since.getTime()) ? pass.updatedAt > since : true,
    );
  if (passes.length === 0) return null;

  const lastUpdated = passes.reduce(
    (max, pass) => (pass.updatedAt > max ? pass.updatedAt : max),
    passes[0].updatedAt,
  );
  return {
    serialNumbers: passes.map((pass) => pass.serialNumber),
    lastUpdated: lastUpdated.toISOString(),
  };
}

/**
 * Запоминает, что сейчас показано на карте. Пока не позовут пуш, это же
 * значение отвечает на вопрос «изменилось ли что-нибудь».
 */
export async function markShown(passId: string, fields: PassFields): Promise<void> {
  await prisma.walletPass.update({
    where: { id: passId },
    data: { shownBalanceKzt: fields.balanceKzt, shownVoided: fields.voided },
  });
}

/** Нужен ли пуш этому пропуску по свежим данным сертификата. */
export function passNeedsPush(
  pass: { shownBalanceKzt: number | null; shownVoided: boolean },
  fields: PassFields,
): boolean {
  return shouldPushUpdate(
    { balanceKzt: pass.shownBalanceKzt, voided: pass.shownVoided },
    fields,
  );
}
