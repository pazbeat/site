import createIntlMiddleware from "next-intl/middleware";
import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { authConfig } from "./lib/auth.config";
import { routing } from "./i18n/routing";
import { buildCsp } from "./lib/security";
import { AB_COOKIE, pickVariant } from "./lib/ab";

const intl = createIntlMiddleware(routing);
// Edge-safe экземпляр: только чтение JWT-сессии, без БД/argon2
const { auth: withAuth } = NextAuth(authConfig);

const isDev = process.env.NODE_ENV !== "production";

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
export default withAuth(async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin")) {
    console.error("[proxy] вход", {
      путь: pathname,
      метод: request.method,
      сессия: request.auth?.user ? "есть" : "нет",
    });
  }

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

  const response = await route(patched, request, pathname, request.auth);
  response.headers.set("Content-Security-Policy", csp);
  applySecurityHeaders(response.headers);
  assignAbVariant(request, response, pathname);
  return response;
});

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
  session: Session | null,
): Promise<NextResponse> {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next({ request: { headers: patched.headers } });
    }
    if (!session?.user) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      // ВРЕМЕННАЯ МЕТКА
      console.error("[proxy] нет сессии", {
        путь: pathname,
        метод: original.method,
        куки: (original.headers.get("cookie") ?? "").split(";").map((c) => c.trim().split("=")[0]).join(","),
      });
      return NextResponse.redirect(
        new URL("/admin/login?src=proxy", original.url),
      );
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
