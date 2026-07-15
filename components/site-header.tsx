"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { LocaleSwitcher } from "./locale-switcher";

const LINKS = [
  { href: "/", key: "home" },
  { href: "/programs", key: "catalog" },
  { href: "/prices", key: "prices" },
  { href: "/create", key: "create" },
  { href: "/check", key: "check" },
] as const;

export function SiteHeader() {
  const t = useTranslations("Nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-brand-purple-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-auto max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2.5 sm:h-16 sm:flex-nowrap sm:py-0">
        <Link
          href="/"
          className="font-display text-xl font-semibold tracking-wide text-brand-purple"
        >
          IMBIR <span className="text-brand-gold">·</span> Thai Spa
        </Link>
        <nav className="order-last flex w-full flex-wrap items-center gap-1 text-sm font-medium sm:order-none sm:ml-auto sm:w-auto">
          {LINKS.map(({ href, key }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-full px-3.5 py-2 transition-colors ${
                  active
                    ? "bg-brand-purple text-white"
                    : "text-brand-purple-800 hover:bg-brand-purple-50"
                }`}
              >
                {t(key)}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto sm:ml-0">
          <LocaleSwitcher current={locale} locales={routing.locales} />
        </div>
      </div>
    </header>
  );
}
