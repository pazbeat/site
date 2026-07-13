import createIntlMiddleware from "next-intl/middleware";
import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authConfig } from "./lib/auth.config";
import { routing } from "./i18n/routing";
import { buildCsp } from "./lib/security";

const intl = createIntlMiddleware(routing);
// Edge-safe экземпляр: только чтение JWT-сессии, без БД/argon2
const { auth } = NextAuth(authConfig);

const isDev = process.env.NODE_ENV !== "production";

/**
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

  const response = await route(patched, request, pathname);
  response.headers.set("Content-Security-Policy", csp);
  applySecurityHeaders(response.headers);
  return response;
}

async function route(
  patched: NextRequest,
  original: NextRequest,
  pathname: string,
): Promise<NextResponse> {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next({ request: { headers: patched.headers } });
    }
    const session = await auth();
    if (!session?.user) {
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
