import "server-only";
import { readFileSync } from "node:fs";
import { connect } from "node:http2";
import { sign } from "node:crypto";

/**
 * Пуш в Apple Wallet: «сходи за обновлением».
 *
 * Полезной нагрузки нет — пустой `{}`. Мы не сообщаем телефону новый остаток,
 * мы только будим его, и он сам приходит на наш веб-сервис за свежей картой.
 * Так задумано у Apple: содержимое пропуска через пуш не передаётся никогда.
 *
 * Ключ — файл `.p8` из аккаунта Apple Developer (APNs Auth Key), он же
 * подписывает недолгий JWT, которым мы представляемся APNs. Apple требует
 * обновлять этот JWT не реже раза в час и не чаще раза в 20 минут, поэтому
 * держим его в памяти и пересоздаём раз в 50 минут.
 *
 * Библиотек не берём: HTTP/2 и подпись ES256 есть в самом Node.
 */

const APNS_HOST = "https://api.push.apple.com";
/** Apple: JWT живёт не больше часа, обновлять не чаще чем раз в 20 минут */
const JWT_TTL_MS = 50 * 60_000;

export type ApnsConfig = {
  /** Содержимое .p8 (PEM) */
  keyPem: string;
  keyId: string;
  teamId: string;
  /** Тема — идентификатор типа пропуска, pass.kz.imbir.sert */
  topic: string;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * JWT для APNs: ES256, в заголовке идентификатор ключа, в теле — команда и
 * время выпуска. Чистая — время приходит снаружи, чтобы её можно было
 * проверить тестом.
 */
export function buildApnsJwt(config: Omit<ApnsConfig, "topic">, nowMs: number): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(
    JSON.stringify({ iss: config.teamId, iat: Math.floor(nowMs / 1000) }),
  );
  // dsaEncoding ieee-p1363 — «сырая» подпись R||S, как требует JWT.
  // По умолчанию Node отдаёт DER, и APNs такую не принимает.
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: config.keyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${claims}.${base64url(signature)}`;
}

export function readApnsConfig(): ApnsConfig | null {
  const keyPath = process.env.APPLE_WALLET_APNS_KEY;
  const keyId = process.env.APPLE_WALLET_APNS_KEY_ID;
  const teamId = process.env.APPLE_WALLET_TEAM_ID;
  const topic = process.env.APPLE_WALLET_PASS_TYPE_ID ?? "pass.kz.imbir.sert";
  if (!keyPath || !keyId || !teamId) return null;
  try {
    return { keyPem: readFileSync(keyPath, "utf8"), keyId, teamId, topic };
  } catch (error) {
    console.error("wallet: не читается ключ APNs", error);
    return null;
  }
}

export function isApnsConfigured(): boolean {
  return readApnsConfig() !== null;
}

let cached: { token: string; issuedAt: number } | null = null;

function currentJwt(config: ApnsConfig, nowMs: number): string {
  if (cached && nowMs - cached.issuedAt < JWT_TTL_MS) return cached.token;
  cached = { token: buildApnsJwt(config, nowMs), issuedAt: nowMs };
  return cached.token;
}

export type PushResult = {
  sent: number;
  /** Токены, которые Apple больше не знает — устройство удалило карту */
  gone: string[];
  failed: number;
};

/**
 * Будит устройства. Ошибку не бросаем: пуш — вспомогательный механизм,
 * телефон всё равно приходит за обновлением сам, просто реже.
 *
 * 410 от Apple означает «такого устройства больше нет» — эти токены зовущий
 * должен удалить, иначе мы будем стучаться в пустоту вечно.
 */
export async function pushToDevices(pushTokens: string[]): Promise<PushResult> {
  const config = readApnsConfig();
  const result: PushResult = { sent: 0, gone: [], failed: 0 };
  if (!config || pushTokens.length === 0) return result;

  const jwt = currentJwt(config, Date.now());
  const client = connect(APNS_HOST);
  client.on("error", (error) => console.error("wallet: APNs", error));

  try {
    await Promise.all(
      pushTokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const request = client.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              authorization: `bearer ${jwt}`,
              "apns-topic": config.topic,
              "apns-priority": "10",
            });
            request.setEncoding("utf8");
            let status = 0;
            request.on("response", (headers) => {
              status = Number(headers[":status"] ?? 0);
            });
            request.on("error", () => {
              result.failed++;
              resolve();
            });
            request.on("end", () => {
              if (status === 200) result.sent++;
              else if (status === 410) result.gone.push(token);
              else result.failed++;
              resolve();
            });
            // Пустая нагрузка: содержимое карты через пуш не передаётся
            request.end("{}");
            request.resume();
          }),
      ),
    );
  } finally {
    client.close();
  }
  return result;
}
