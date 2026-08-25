import { NextResponse, type NextRequest } from "next/server";
import { buildConsentRecord } from "@/lib/consent";
import { SRC_COOKIE, parseSourceCookie } from "@/lib/source";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { corporateSchema } from "@/lib/validation";

/** Корпоративная заявка (PRD §5.1.7): запись в БД; письмо менеджеру — на этапе email-доставки. */
export async function POST(request: NextRequest) {
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

  // Откуда пришла заявка — тем же способом, что и у заказа
  const src = parseSourceCookie(request.cookies.get(SRC_COOKIE)?.value);

  const created = await prisma.corporateRequest.create({
    data: {
      ...fields,
      consent,
      srcLast: src?.last ?? null,
      srcCampaign: src?.campaign || null,
    },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
