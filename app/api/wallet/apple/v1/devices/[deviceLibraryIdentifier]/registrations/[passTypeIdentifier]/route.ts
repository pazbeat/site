import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { serialsForDevice } from "@/lib/wallet/service";

/**
 * «Что у меня изменилось?» — телефон спрашивает список карт, которые стоит
 * перекачать. Приходит после пуша, а иногда и сам по себе.
 *
 * Токеном пропуска этот вызов НЕ закрыт — так задумано у Apple: карт у
 * устройства может быть много, общего токена у них нет. Секрет здесь —
 * сам `deviceLibraryIdentifier`, его знает только это устройство и мы.
 *
 * 204 без тела — «ничего нового», это нормальный ответ, а не ошибка.
 */

type Params = {
  params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { deviceLibraryIdentifier } = await params;
  const limited = rateLimit(`wallet-updates:${clientIp(request)}`, 120);
  if (!limited.ok) return NextResponse.json({}, { status: 429 });

  const since = new URL(request.url).searchParams.get("passesUpdatedSince");
  const result = await serialsForDevice(deviceLibraryIdentifier, since ?? undefined);
  if (!result) return new NextResponse(null, { status: 204 });

  return NextResponse.json(result);
}
