import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findPassBySerial, passAuthorized, registerDevice, unregisterDevice } from "@/lib/wallet/service";

/**
 * Регистрация и отписка устройства (веб-сервис Apple Wallet).
 *
 * Телефон приходит сюда сам, когда карту добавили в кошелёк или удалили из
 * него, и приносит свой push-токен. Без этой пары карта остаётся статичной:
 * разбудить её позже будет нечем.
 *
 * Адреса и коды ответов задаёт Apple, менять их нельзя:
 *   201 — зарегистрировали впервые, 200 — уже были зарегистрированы,
 *   401 — не тот токен пропуска, 404 — такого пропуска нет.
 */

type Params = {
  params: Promise<{
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
    serialNumber: string;
  }>;
};

async function authorize(request: Request, serialNumber: string) {
  const pass = await findPassBySerial(serialNumber);
  if (!pass) return { error: NextResponse.json({}, { status: 404 }) } as const;
  if (!passAuthorized(pass.authTokenEnc, request)) {
    return { error: NextResponse.json({}, { status: 401 }) } as const;
  }
  return { pass } as const;
}

export async function POST(request: Request, { params }: Params) {
  const { deviceLibraryIdentifier, serialNumber } = await params;
  const limited = rateLimit(`wallet-register:${clientIp(request)}`, 60);
  if (!limited.ok) return NextResponse.json({}, { status: 429 });

  const result = await authorize(request, serialNumber);
  if ("error" in result) return result.error;

  const body = (await request.json().catch(() => ({}))) as { pushToken?: string };
  if (!body.pushToken) {
    return NextResponse.json({ error: "push_token_required" }, { status: 400 });
  }

  const { created } = await registerDevice(
    result.pass.id,
    deviceLibraryIdentifier,
    body.pushToken,
  );
  return NextResponse.json({}, { status: created ? 201 : 200 });
}

export async function DELETE(request: Request, { params }: Params) {
  const { deviceLibraryIdentifier, serialNumber } = await params;
  const limited = rateLimit(`wallet-unregister:${clientIp(request)}`, 60);
  if (!limited.ok) return NextResponse.json({}, { status: 429 });

  const result = await authorize(request, serialNumber);
  if ("error" in result) return result.error;

  await unregisterDevice(result.pass.id, deviceLibraryIdentifier);
  // Apple ждёт 200 и на повторную отписку — для него это не ошибка
  return NextResponse.json({}, { status: 200 });
}
