/**
 * Создаёт (или показывает) оформление карт в Google Wallet тем же кодом, что
 * работает на сайте. Запуск: npx tsx scripts/google-wallet-class.ts [--apply]
 *
 * Без --apply только печатает, что отправит. Класс нужен один раз на эмитента;
 * повторный запуск ничего не ломает — Google ответит, что он уже есть.
 */
import "dotenv/config";
import { createSign } from "node:crypto";
import { buildGiftCardClass, giftCardClassId } from "../lib/wallet/google-pass";
import { normalizePrivateKey } from "../lib/wallet/google-jwt";

const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!;
const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL!;
const privateKey = normalizePrivateKey(process.env.GOOGLE_WALLET_PRIVATE_KEY ?? "");
const classSuffix = process.env.GOOGLE_WALLET_CLASS_SUFFIX || "imbir-gift";

if (!issuerId || !clientEmail || !privateKey) {
  console.error("Не заданы GOOGLE_WALLET_* — нечего делать");
  process.exit(1);
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

async function token(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64(JSON.stringify(claim));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).end().sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${body}.${b64(sig)}`,
    }),
  });
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("токен не выдан: " + JSON.stringify(data));
  return data.access_token;
}

async function main() {
  const ids = { issuerId, classSuffix };
  const origin = process.env.SITE_URL?.trim() || "https://new.imbir.kz";
  const payload = buildGiftCardClass(ids, origin);
  console.log("класс:", giftCardClassId(ids));
  if (process.argv[2] !== "--apply") {
    console.log(JSON.stringify(payload, null, 2));
    console.log("\n(запуск без --apply — ничего не отправлено)");
    return;
  }
  const access = await token();
  const base = "https://walletobjects.googleapis.com/walletobjects/v1/giftCardClass";
  // PUT, а не POST: класс уже может существовать, и тогда его надо обновить —
  // иначе правки оформления не доедут до карт, сохранённых покупателями.
  const response = await fetch(`${base}/${giftCardClassId(ids)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (response.ok) {
    console.log("✓ оформление отправлено в Google");
    return;
  }
  console.error("не удалось:", response.status, text.slice(0, 400));
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
