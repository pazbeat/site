/**
 * Создание пользователя админки (Фаза 1; UI управления — Фаза 2):
 *   npx tsx scripts/create-admin.ts <email> <password> [superadmin|manager]
 * Печатает otpauth-URI и QR для приложения-аутентификатора (TOTP обязателен).
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { encryptSecret } from "../lib/crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [email, password, roleArg] = process.argv.slice(2);
  if (!email || !password) {
    console.error(
      "Использование: npx tsx scripts/create-admin.ts <email> <password> [superadmin|manager]",
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 12) {
    console.error("Пароль должен быть не короче 12 символов.");
    process.exitCode = 1;
    return;
  }
  const role = roleArg === "manager" ? "manager" : "superadmin";

  const totpSecret = generateSecret();
  const passwordHash = await hash(password); // argon2id по умолчанию

  await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role,
      totpSecret: encryptSecret(totpSecret),
    },
    update: {
      passwordHash,
      role,
      totpSecret: encryptSecret(totpSecret),
      active: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  const uri = generateURI({
    issuer: "Imbir Admin",
    label: email,
    secret: totpSecret,
  });
  console.log(`\nПользователь ${email} (${role}) создан/обновлён.`);
  console.log(`\nTOTP URI (добавьте в Google Authenticator/1Password):\n${uri}\n`);
  console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
}

main().finally(() => prisma.$disconnect());
