import createIntlMiddleware from "next-intl/middleware";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { buildCsp } from "./lib/security";
import { AB_COOKIE, pickVariant } from "./lib/ab";
import { almatyDayKey } from "./lib/admin/period";
import {
  SRC_COOKIE,
  detectTouch,
  formatSourceCookie,
  isBuilderPath,
  isCountableVisit,
  nextSource,
  parseSourceCookie,
  type SourceDecision,
} from "./lib/source";

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
 * Обёртка `auth()` из next-auth делает больше: заводит внутренний запрос к
 * своему эндпоинту сессии и переносит его Set-Cookie на наш ответ. Посреднику
 * это не нужно — ему достаточно знать, есть вход или нет, а лишние операции с
 * кукой на каждом запросе только добавляют способов сломаться.
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

  // Откуда пришёл посетитель. Решение принимается здесь, а страница узнаёт
  // его из заголовка и засчитывает в дневной счётчик (см. lib/visits.ts).
  //
  // Удалить перед установкой обязательно: заголовки склонированы из входящего
  // запроса, и без этого клиент прислал бы свой x-imbir-visit и накрутил
  // счётчик заходов.
  requestHeaders.delete("x-imbir-visit");
  requestHeaders.delete("x-imbir-builder");
  const source = resolveSource(request, pathname);
  if (source.countVisit) requestHeaders.set("x-imbir-visit", source.next.last);
  if (source.countBuilder) requestHeaders.set("x-imbir-builder", source.next.last);
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
  assignSource(response, pathname, source);
  return response;
}

/**
 * Решение о канале посетителя. Чистая логика живёт в lib/source.ts, здесь
 * только сбор входных данных: строка запроса, откуда пришёл, кука, заголовки.
 */
function resolveSource(request: NextRequest, pathname: string): SourceDecision {
  const prev = parseSourceCookie(request.cookies.get(SRC_COOKIE)?.value);
  return nextSource({
    prev,
    touch: detectTouch(request.nextUrl, request.headers.get("referer"), pathname),
    today: almatyDayKey(new Date()),
    countable: isCountableVisit(request.headers),
    isBuilderPath: isBuilderPath(pathname),
  });
}

/**
 * Липкая кука источника — по образцу A/B выше.
 *
 * Отличий два. Во-первых `httpOnly: true`: клиенту эта кука не нужна, читает
 * её только сервер при создании заказа. Во-вторых метки посчитанных дней
 * двигаются лишь на успешном ответе: заход на голый домен даёт редирект на
 * язык, рендера там нет — проштамповав день на редиректе, мы потеряли бы визит.
 */
function assignSource(
  response: NextResponse,
  pathname: string,
  decision: SourceDecision,
) {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
  if (!decision.changed) return;

  // На переадресации (заход на голый домен уводит на язык) рендера страницы
  // нет, а значит заход некому засчитать. Канал запоминаем сразу — иначе
  // рекламная метка держалась бы только на том, что переадресация сохраняет
  // строку запроса, — но метки дня не ставим: их проставит уже та страница,
  // которая действительно откроется.
  const value = formatSourceCookie(
    response.status >= 300 ? decision.nextUnstamped : decision.next,
  );

  response.cookies.set(SRC_COOKIE, value, {
    maxAge: 180 * 24 * 60 * 60,
    sameSite: "lax",
    path: "/",
    httpOnly: true,
  });
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
