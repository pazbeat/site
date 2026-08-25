import { NextResponse } from "next/server";
import { buildConsentRecord } from "@/lib/consent";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { corporateSchema } from "@/lib/validation";

/** Корпоративная заявка (PRD §5.1.7): запись в БД; письмо менеджеру — на этапе email-доставки. */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`corporate:${ip}`);
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

  const parsed = corporateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Согласие фиксируется тем же составом, что и у заказа, и записывается
  // одной строкой вместе с заявкой — подделать из браузера нельзя.
  const { consentAccepted: _accepted, locale, ...fields } = parsed.data;
  const consent = await buildConsentRecord({
    ip,
    ua: request.headers.get("user-agent") ?? "",
    locale,
  });

  const created = await prisma.corporateRequest.create({
    data: { ...fields, consent },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
