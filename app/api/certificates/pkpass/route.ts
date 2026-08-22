import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getWalletProvider, isWalletConfigured } from "@/lib/wallet";
import { buildPassFields } from "@/lib/wallet/pass";
import { ensurePass, markShown, toPassSource } from "@/lib/wallet/service";

/**
 * Карта для Apple Wallet со страницы успеха. Авторизация — successToken
 * заказа, ровно как у скачивания PDF.
 *
 * Пропуск создаётся при первом скачивании и дальше не меняется: серийник и
 * токен веб-сервиса выдаются один раз, иначе у покупателя в кошельке
 * плодились бы копии одной карты.
 */
export async function GET(request: Request) {
  const limited = rateLimit(`pkpass:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (token.length < 10 || token.length > 64) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const order = await prisma.order.findUnique({
    where: { successToken: token },
    select: { status: true, certificates: { select: { id: true } } },
  });
  if (!order || order.status !== "paid" || order.certificates.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!isWalletConfigured()) {
    // Неподписанный пропуск телефон отвергнет — честный отказ понятнее
    return NextResponse.json({ error: "wallet_not_configured" }, { status: 503 });
  }

  const certificateId = order.certificates[0].id;
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { salon: true, programOption: { include: { program: true } } },
  });
  const source = certificate ? toPassSource(certificate) : null;
  if (!source) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const pass = await ensurePass(certificateId, "apple");
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
      "Cache-Control": "no-store",
    },
  });
}
