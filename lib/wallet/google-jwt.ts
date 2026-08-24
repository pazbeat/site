import { createSign } from "node:crypto";

/**
 * Подпись RS256 для Google Wallet — средствами самого Node, без библиотек.
 *
 * Нужна ровно в двух местах, и оба обходятся одной функцией:
 *  · ссылка «Сохранить в Google Кошелёк» — это JWT с картой внутри;
 *  · доступ к API обновлений — сервисный аккаунт меняет свой JWT на токен.
 *
 * Google подписывает служебным ключом RSA (в отличие от Apple, где APNs
 * требует ES256), поэтому здесь достаточно `createSign("RSA-SHA256")`.
 */

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Приватный ключ сервисного аккаунта в трёх видах, которые встречаются живьём:
 *
 *  · настоящий PEM с переносами — если задан через `environment:`;
 *  · PEM, где переносы записаны как `\n` — так он лежит в JSON от Google;
 *  · base64 от PEM — так его приходится хранить в env-файле.
 *
 * Третий случай не прихоть: docker-compose разворачивает `\n` в env-файле в
 * настоящий перенос и обрывает значение на первой же строке. Ключ доезжал до
 * контейнера огрызком в 27 символов — ровно заголовок `-----BEGIN…`, и
 * подпись падала. Поймано живьём 2026-08-24.
 */
export function normalizePrivateKey(raw: string): string {
  const value = raw.trim();
  if (value.includes("BEGIN")) {
    return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
  }
  // Не похоже на PEM — значит ключ передан в base64
  return Buffer.from(value, "base64").toString("utf8");
}

export function signJwtRs256(
  payload: Record<string, unknown>,
  privateKeyPem: string,
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .end()
    .sign(normalizePrivateKey(privateKeyPem));
  return `${signingInput}.${base64url(signature)}`;
}

/** Разбор JWT на части — для тестов и разбора ошибок, подпись не проверяет. */
export function decodeJwtParts(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: Buffer;
} {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("jwt: ожидались три части");
  const parse = (part: string) =>
    JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  return {
    header: parse(parts[0]),
    payload: parse(parts[1]),
    signature: Buffer.from(parts[2], "base64url"),
  };
}

/**
 * Утверждение для обмена на access-токен (OAuth2 JWT-bearer). Живёт час —
 * дольше Google не разрешает.
 */
export function buildOauthAssertion(input: {
  clientEmail: string;
  scope: string;
  now: number;
}): Record<string, unknown> {
  const issuedAt = Math.floor(input.now / 1000);
  return {
    iss: input.clientEmail,
    scope: input.scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
}

/**
 * Тело ссылки «Сохранить в Google Кошелёк». Класс кладём рядом с картой:
 * тогда при первом сохранении Google заведёт его сам, и оформление не нужно
 * создавать отдельным вызовом API до первой продажи.
 *
 * `origins` — домены, с которых разрешено открывать ссылку; без него Google
 * ругается на сохранение из браузера.
 */
export function buildSaveJwtPayload(input: {
  clientEmail: string;
  origin: string;
  giftCardClass: Record<string, unknown>;
  giftCardObject: Record<string, unknown>;
  now: number;
}): Record<string, unknown> {
  return {
    iss: input.clientEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(input.now / 1000),
    origins: [input.origin],
    payload: {
      giftCardClasses: [input.giftCardClass],
      giftCardObjects: [input.giftCardObject],
    },
  };
}
