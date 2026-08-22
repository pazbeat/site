import "server-only";
import { spawn } from "node:child_process";
import type { ManifestSigner } from "./package";

/**
 * Подпись манифеста для Apple Wallet: detached PKCS#7 в DER.
 *
 * Считаем её через openssl, а не библиотекой. Библиотека заказчика
 * (`@walletpass/pass-js`) под AGPL — для коммерческого сайта это риск:
 * лицензия распространяется и на сетевое использование. MIT-альтернатива
 * (`passkit-generator`) тянет за собой генерацию всего пропуска целиком,
 * а нам нужны только эти шесть килобайт подписи. `openssl smime` делает ровно
 * то же самое и уже стоит в образе.
 *
 * Нужны три файла: сертификат Pass Type ID, приватный ключ к нему и
 * промежуточный сертификат Apple WWDR — без последнего цепочка не сходится
 * и телефон отвергает пропуск.
 *
 * ВНИМАНИЕ: сертификат из исходников заказчика истёк 23.02.2026 и оформлен на
 * подрядчика, а не на «Имбирь». Подписать им можно, установить на телефон —
 * нельзя. До перевыпуска в Apple Developer провайдер остаётся ненастроенным
 * и в дело идёт мок.
 */

export type SigningKeys = {
  certPath: string;
  keyPath: string;
  wwdrPath: string;
};

export function readSigningKeys(): SigningKeys | null {
  const certPath = process.env.APPLE_WALLET_CERT;
  const keyPath = process.env.APPLE_WALLET_KEY;
  const wwdrPath = process.env.APPLE_WALLET_WWDR;
  if (!certPath || !keyPath || !wwdrPath) return null;
  return { certPath, keyPath, wwdrPath };
}

export function createManifestSigner(keys: SigningKeys): ManifestSigner {
  return (manifest) =>
    new Promise<Buffer>((resolve, reject) => {
      const openssl = spawn("openssl", [
        "smime",
        "-sign",
        "-binary",
        // Без -noattr Apple не принимает подпись: лишние атрибуты ломают проверку
        "-noattr",
        "-outform",
        "DER",
        "-signer",
        keys.certPath,
        "-inkey",
        keys.keyPath,
        "-certfile",
        keys.wwdrPath,
      ]);

      const out: Buffer[] = [];
      const err: Buffer[] = [];
      openssl.stdout.on("data", (chunk) => out.push(chunk));
      openssl.stderr.on("data", (chunk) => err.push(chunk));
      openssl.on("error", (e) =>
        reject(new Error(`wallet: openssl не запустился — ${e.message}`)),
      );
      openssl.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`wallet: openssl вернул ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
          return;
        }
        resolve(Buffer.concat(out));
      });

      openssl.stdin.end(manifest);
    });
}
