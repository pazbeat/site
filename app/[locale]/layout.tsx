import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE_URL } from "@/lib/seo";
import { countVisit } from "@/lib/visits";
import { JsonLd } from "@/components/json-ld";
import { organizationSchema, webSiteSchema } from "@/lib/schema-org";
import { publicOrigin } from "@/lib/site-url";
import "../globals.css";

// Контент управляется из админки — рендерим на каждый запрос,
// а build не требует подключения к БД. Оптимизация (ISR) — позже.
//
// ВНИМАНИЕ при такой оптимизации: снятие force-dynamic или включение кеша
// HTML на Cloudflare молча остановит счётчик заходов (он считается здесь, на
// рендере) и начнёт раздавать разным людям одну и ту же куку с источником.
export const dynamic = "force-dynamic";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Imbir Thai Spa — электронные подарочные сертификаты",
    template: "%s · Imbir Thai Spa",
  },
  description:
    "Подарочные сертификаты сети салонов тайского массажа и SPA «Имбирь» — онлайн за 2 минуты.",
  openGraph: {
    type: "website",
    siteName: "Imbir Thai Spa",
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // Заход в дневной счётчик по каналам. Канал определил proxy.ts и передал
  // заголовком; заголовок он же предварительно вычищает из входящего запроса,
  // так что подделать счётчик снаружи нельзя. Не ждём: страница не должна
  // задерживаться из-за аналитики.
  const visitChannel = (await headers()).get("x-imbir-visit");
  if (visitChannel) void countVisit(visitChannel, "visit");

  return (
    <html
      lang={locale}
      className={`${cormorant.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Микроразметка для поисковиков: кто мы и что это за сайт. Адрес
            берём в момент запроса — на этапе сборки образа SITE_URL ещё нет. */}
        <JsonLd data={organizationSchema(publicOrigin())} />
        <JsonLd data={webSiteSchema(publicOrigin(), locale)} />
        <NextIntlClientProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
