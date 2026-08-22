import { decryptSecret } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getWalletProvider, isWalletConfigured } from "@/lib/wallet";
import { buildPassFields } from "@/lib/wallet/pass";
import { findPassBySerial, markShown, passAuthorized, toPassSource } from "@/lib/wallet/service";
import { NextResponse } from "next/server";

/**
 * Свежая карта по серийнику — то, ради чего затевался весь веб-сервис.
 * Телефон приходит сюда после пуша и получает пропуск с текущим остатком.
 *
 * Заголовок `If-Modified-Since` намеренно не поддерживаем. Содержимое карты
 * зависит от остатка сертификата, а он меняется сверкой с Altegio, не трогая
 * саму запись пропуска: ответили бы 304 и показали покупателю устаревшую
 * сумму. Пропуск весит десятки килобайт, а запрашивают его редко.
 */

type Params = {
  params: Promise<{ passTypeIdentifier: string; serialNumber: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { serialNumber } = await params;
  const limited = rateLimit(`wallet-pass:${clientIp(request)}`, 60);
  if (!limited.ok) return NextResponse.json({}, { status: 429 });

  const pass = await findPassBySerial(serialNumber);
  if (!pass) return NextResponse.json({}, { status: 404 });
  if (!passAuthorized(pass.authTokenEnc, request)) {
    return NextResponse.json({}, { status: 401 });
  }

  if (!isWalletConfigured()) {
    // Подписать нечем — сертификат Apple просрочен и не перевыпущен
    return NextResponse.json({ error: "wallet_not_configured" }, { status: 503 });
  }

  const source = toPassSource(pass.certificate);
  if (!source) return NextResponse.json({}, { status: 404 });

  const fields = buildPassFields(source);
  const issued = await getWalletProvider().issue(fields, {
    serialNumber: pass.serialNumber,
    authToken: decryptSecret(pass.authTokenEnc) ?? undefined,
  });
  await markShown(pass.id, fields);

  return new NextResponse(new Uint8Array(issued.body), {
    headers: {
      "Content-Type": issued.contentType,
      "Content-Disposition": `attachment; filename="${issued.filename}"`,
      "Last-Modified": new Date().toUTCString(),
    },
  });
}
