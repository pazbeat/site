import { NextResponse, type NextRequest } from "next/server";
import { AB_COOKIE, isAbVariant } from "@/lib/ab";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Засчитывает показ конструктора для группы A/B — знаменатель конверсии
 * в отчёте (PRD §10). Клиент зовёт один раз за сессию.
 *
 * Считаем через кроновый апсерт по дню, а не по каждому визиту отдельной
 * строкой: нам нужна только агрегированная статистика, хранить след каждого
 * посетителя ради этого незачем.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!rateLimit(`ab-view:${ip}`).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const variant = request.cookies.get(AB_COOKIE)?.value;
  if (!isAbVariant(variant)) {
    return NextResponse.json({ ok: true, counted: false });
  }

  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);

  await prisma.abStat.upsert({
    where: { day_variant: { day, variant } },
    create: { day, variant, views: 1 },
    update: { views: { increment: 1 } },
  });

  return NextResponse.json({ ok: true, counted: true });
}
