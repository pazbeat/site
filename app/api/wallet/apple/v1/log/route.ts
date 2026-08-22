import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Сюда телефон присылает, что у него не получилось: не сошлась подпись, не
 * ответил веб-сервис, не подошёл токен. Больше про эти сбои узнать неоткуда —
 * на самом устройстве их не видно, поэтому пишем в лог.
 */
export async function POST(request: Request) {
  const limited = rateLimit(`wallet-log:${clientIp(request)}`, 30);
  if (!limited.ok) return NextResponse.json({}, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { logs?: unknown[] };
  for (const line of body.logs ?? []) {
    console.error("apple wallet:", String(line).slice(0, 500));
  }
  return NextResponse.json({});
}
