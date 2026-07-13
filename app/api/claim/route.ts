import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const claimSchema = z.object({ token: z.string().min(10).max(64) });

/**
 * Одноразовый показ кода на странице успеха: авторизация — successToken
 * заказа (попал к покупателю через redirect провайдера). После первого
 * показа шифртекст затирается — код остаётся только в PDF/email (PRD §8).
 */
export async function POST(request: Request) {
  const limited = rateLimit(`claim:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { successToken: parsed.data.token },
    include: {
      certificates: {
        select: { id: true, codeEncrypted: true, claimedAt: true },
      },
    },
  });
  if (!order || order.status !== "paid" || order.certificates.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const certificate = order.certificates[0];
  if (certificate.claimedAt || !certificate.codeEncrypted) {
    return NextResponse.json({ code: null, claimed: true });
  }

  // Атомарная отметка показа — параллельный второй запрос кода не получит.
  // Шифртекст сохраняется: он нужен доставке (PDF) и повторной отправке.
  const marked = await prisma.certificate.updateMany({
    where: { id: certificate.id, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  if (marked.count === 0) {
    return NextResponse.json({ code: null, claimed: true });
  }

  const code = decryptSecret(certificate.codeEncrypted);
  return NextResponse.json({ code, claimed: false });
}
