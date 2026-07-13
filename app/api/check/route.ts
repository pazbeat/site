import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashCode, isValidCodeFormat } from "@/lib/certificate-code";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { checkSchema } from "@/lib/validation";

/**
 * Проверка сертификата (PRD §5.1.4, §9.6): только полный код, поиск по
 * SHA-256 хэшу, rate limit 5/мин на IP, никаких подсказок частичных совпадений.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`check:${ip}`);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = checkSchema.safeParse(body);
  if (!parsed.success || !isValidCodeFormat(parsed.data.code)) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  const certificate = await prisma.certificate.findUnique({
    where: { codeHash: hashCode(parsed.data.code) },
    select: { status: true, balanceKzt: true, validUntil: true },
  });

  if (!certificate) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  return NextResponse.json({
    found: true,
    status: certificate.status,
    balanceKzt: certificate.balanceKzt,
    validUntil: certificate.validUntil.toISOString().slice(0, 10),
  });
}
