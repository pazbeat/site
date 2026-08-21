import createIntlMiddleware from "next-intl/middleware";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { buildCsp } from "./lib/security";
import { AB_COOKIE, pickVariant } from "./lib/ab";

const intl = createIntlMiddleware(routing);

const isDev = process.env.NODE_ENV !== "production";

/**
 * Имя куки сессии Auth.js. Оно же — соль шифрования токена, поэтому должно
 * совпадать в точности; префикс `__Secure-` библиотека ставит только на https.
 */
const SESSION_COOKIE = isDev
  ? "authjs.session-token"
  : "__Secure-authjs.session-token";

/**
 * Чтение сессии без побочных эффектов: getToken только расшифровывает куку.
 *
 * Обёртка `auth()` из next-auth здесь не годится — она попутно обновляет куку
 * сессии и переносит Set-Cookie на наш ответ. На обычных страницах это
 * незаметно, а на POST серверного действия ломало вход: посредник пропускал
 * запрос с живой сессией, действие не запускалось вовсе, и сразу после ответа
 * кука оказывалась стёртой. Снаружи выглядело так, будто в админке не
 * сохраняется ни одна форма (разобрано живьём 2026-08-21).
 */
async function readSession(request: NextRequest) {
  return getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    salt: SESSION_COOKIE,
    cookieName: SESSION_COOKIE,
    secureCookie: !isDev,
  });
}

/**
 * Обёртка `withAuth` обязательна: сессию отдаёт она через `request.auth`.
 * Вызов `auth()` без аргументов здесь читает контекст запроса Next и на
 * POST серверных действий его не находит — сессия оказывалась пустой, и
 * админка отправляла на логин, теряя вход. Снаружи это выглядело так, будто
 * в админке не сохраняется ни одна форма (поймано живьём 2026-08-21).
 *
 * Все /admin/* и /api/admin/* закрыты на сервере (PRD §9.3):
 * нет сессии → редирект на логин (страницы) или 401 (API).
 * Остальное — i18n-роутинг next-intl. На каждый ответ навешивается CSP
 * с per-request nonce (PRD §9.2) + прочие security-заголовки.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Per-request nonce; кладём в заголовки запроса, чтобы Next проставил его
  // своим скриптам (next-intl копирует request.headers в rewrite).
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce, isDev);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const patched = new NextRequest(request.nextUrl, {
    headers: requestHeaders,
  });

  // Сессию читаем только там, где она нужна, — на публичных страницах
  // расшифровывать куку незачем.
  const needsSession =
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const session = needsSession ? await readSession(request) : null;

  const response = await route(patched, request, pathname, session);
  response.headers.set("Content-Security-Policy", csp);
  applySecurityHeaders(response.headers);
  assignAbVariant(request, response, pathname);
  return response;
}

/**
 * Липкая группа A/B-теста цен (PRD §10). Назначаем здесь, потому что кука
 * должна проставиться до рендера конструктора, а серверные компоненты писать
 * куки не умеют. Аналитическая, не персональная: одна буква, без ПД.
 */
function assignAbVariant(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
) {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
  if (request.cookies.has(AB_COOKIE)) return;

  response.cookies.set(AB_COOKIE, pickVariant(), {
    maxAge: 180 * 24 * 60 * 60,
    sameSite: "lax",
    path: "/",
    httpOnly: false, // читаем и на клиенте, чтобы засчитать показ конструктора
  });
}

async function route(
  patched: NextRequest,
  original: NextRequest,
  pathname: string,
  session: { uid?: unknown } | null,
): Promise<NextResponse> {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next({ request: { headers: patched.headers } });
    }
    if (!session?.uid) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/login", original.url));
    }
    return NextResponse.next({ request: { headers: patched.headers } });
  }

  return intl(patched);
}

// Заголовки, дублирующие/усиливающие next.config (на случай ответов из proxy)
function applySecurityHeaders(headers: Headers) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (process.env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
}

export const config = {
  // Публичные страницы (i18n) + админка; API (кроме /api/admin), статика
  // и служебные пути Next не проксируются.
  matcher: [
    "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
    "/api/admin/:path*",
  ],
};
