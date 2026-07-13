import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM для одноразового показа кода сертификата на странице успеха.
 * Ключ — CODE_ENCRYPTION_KEY (64 hex-символа) или деривация из AUTH_SECRET.
 */
function getKey(): Buffer {
  const hex = process.env.CODE_ENCRYPTION_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  const secret = process.env.AUTH_SECRET;
  if (secret) return scryptSync(secret, "imbir-code-key", 32);
  throw new Error("CODE_ENCRYPTION_KEY or AUTH_SECRET must be set");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string | null {
  try {
    const raw = Buffer.from(payload, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

export function hmacSign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function hmacVerify(
  data: string,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(hmacSign(data, secret), "hex");
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}
