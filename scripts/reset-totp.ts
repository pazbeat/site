/**
 * Перевыпуск второго фактора (TOTP) для существующего администратора:
 *   npx tsx scripts/reset-totp.ts <email>
 *
 * Зачем отдельный скрипт, если есть create-admin.ts: тот перезаписывает ещё и
 * пароль, а значит требует придумать новый и передать его человеку. Здесь
 * пароль не трогается вовсе — меняется только секрет аутентификатора.
 *
 * Когда это нужно. На боевом сервере стоял `PREVIEW_NO_2FA=1` — вход в админку
 * без второго фактора. Снимать его вслепую нельзя: секрет в базе есть, но если
 * приложение-аутентификатор им не заведено, владелец останется без доступа к
 * собственной админке. Правильный порядок: перевыпустить секрет этим скриптом,
 * дать отсканировать QR, и только потом снимать флаг.
 */
import "dotenv/config";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { encryptSecret } from "../lib/crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error("Использование: npx tsx scripts/reset-totp.ts <email>");
    process.exitCode = 1;
    return;
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) {
    console.error(`Пользователь ${email} не найден.`);
    process.exitCode = 1;
    return;
  }

  const totpSecret = generateSecret();
  await prisma.adminUser.update({
    where: { email },
    data: {
      totpSecret: encryptSecret(totpSecret),
      // Заодно снимаем блокировку по неудачным попыткам: человек и так уже
      // разбирается со входом, лишний барьер тут ни к чему.
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  const uri = generateURI({ issuer: "Imbir Admin", label: email, secret: totpSecret });
  console.log(`\nВторой фактор для ${email} перевыпущен.`);
  console.log(`\nСтарый код из приложения больше не подойдёт — отсканируйте новый QR:\n`);
  console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
  console.log(`\nЕсли QR не читается, добавьте вручную по ссылке:\n${uri}\n`);
}

main().finally(() => prisma.$disconnect());
