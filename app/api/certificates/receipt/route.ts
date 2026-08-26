import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildReceiptPdf } from "@/lib/delivery";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Товарный чек к заказу со страницы успеха. Авторизация — successToken
 * заказа, как у скачивания сертификата: чек содержит сумму и номер заказа,
 * отдавать его по номеру сертификата нельзя.
 */
export async function GET(request: Request) {
  const limited = rateLimit(`receipt:${clientIp(request)}`);
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

  const built = await buildReceiptPdf(order.certificates[0].id);
  if (!built) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(built.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(built.filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
