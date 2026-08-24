import { NextResponse } from "next/server";
import { isWalletConfigured } from "@/lib/wallet";
import { isGoogleWalletConfigured } from "@/lib/wallet/google";

/**
 * Одна кнопка «Добавить в кошелёк» на всех.
 *
 * Кошелёк у человека ровно один — тот, что стоит на его телефоне, и выбирать
 * его вручную незачем. Здесь смотрим, с какого устройства пришли, и уводим
 * на нужный маршрут: iPhone, iPad и Mac — в Apple Wallet, всё остальное —
 * в Google Кошелёк.
 *
 * Если настроена только одна платформа, отправляем в неё независимо от
 * устройства: пусть лучше владелец Android получит карту Apple файлом, чем
 * упрётся в отказ. Не настроено ничего — 503, и кнопки на сайте нет вовсе.
 */

/** Устройства Apple по строке браузера. */
export function prefersApple(userAgent: string): boolean {
  // iPad с iPadOS 13+ представляется Macintosh — сюда попадает и он
  return /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const apple = isWalletConfigured();
  const google = isGoogleWalletConfigured();

  if (!apple && !google) {
    return NextResponse.json({ error: "wallet_not_configured" }, { status: 503 });
  }

  const wantsApple = prefersApple(request.headers.get("user-agent") ?? "");
  const target =
    apple && (wantsApple || !google)
      ? "/api/certificates/pkpass"
      : "/api/certificates/google-wallet";

  return NextResponse.redirect(
    new URL(`${target}?token=${encodeURIComponent(token)}`, url.origin),
    { status: 302, headers: { "Cache-Control": "no-store" } },
  );
}
