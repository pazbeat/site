import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicOrigin } from "@/lib/site-url";
import {
  buildGoogleSaveUrl,
  googleObjectIdFor,
  isGoogleWalletConfigured,
} from "@/lib/wallet/google";
import { buildPassFields } from "@/lib/wallet/pass";
import { ensurePass, markShown, toPassSource } from "@/lib/wallet/service";

/**
 * Кнопка «Сохранить в Google Кошелёк» со страницы успеха. Авторизация —
 * successToken заказа, ровно как у PDF и у карты Apple.
 *
 * Отвечаем редиректом на pay.google.com: ссылка одноразово собирается здесь,
 * а не печатается в разметку. Так подписанный токен с картой не оседает в
 * истории браузера и в логах прокси.
 */
export async function GET(request: Request) {
  const limited = rateLimit(`gwallet:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (token.length < 10 || token.length > 64) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!isGoogleWalletConfigured()) {
    return NextResponse.json({ error: "wallet_not_configured" }, { status: 503 });
  }

  const order = await prisma.order.findUnique({
    where: { successToken: token },
    select: { status: true, certificates: { select: { id: true } } },
  });
  if (!order || order.status !== "paid" || order.certificates.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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

  // Серийник выдаётся один раз на платформу: иначе у покупателя в кошельке
  // плодились бы копии одной карты.
  const pass = await ensurePass(certificateId, "google");
  const fields = buildPassFields(source);
  const saveUrl = buildGoogleSaveUrl({
    serialNumber: pass.serialNumber,
    fields,
    origin: publicOrigin(request),
  });
  if (!saveUrl) {
    return NextResponse.json({ error: "wallet_not_configured" }, { status: 503 });
  }
  await markShown(pass.id, fields);
  // Идентификатор карты выводится из серийника, но записываем его явно:
  // по нему потом видно в базе, что именно лежит на стороне Google.
  if (!pass.googleObjectId) {
    await prisma.walletPass.update({
      where: { id: pass.id },
      data: { googleObjectId: googleObjectIdFor(pass.serialNumber) },
    });
  }

  return NextResponse.redirect(saveUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
