"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

const WA_PHONE = "77081118098";
const WA_DISPLAY = "+7 708 111 8098";
const LANG_LABELS: Record<string, string> = { ru: "RU", kk: "KK", en: "EN" };

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.5 3.9 1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
    </svg>
  );
}

export function SiteHeader() {
  const t = useTranslations("Nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const solid = !isHome || scrolled || open;
  const waHref = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(t("waGreeting"))}`;

  // Пункты меню: якоря ведут в разделы главной (работает и с других страниц —
  // тот же путь /locale + hash = плавный скролл; иной путь = переход + скролл).
  const home = `/${locale}`;
  const NAV: { href: string; label: string; anchor: boolean }[] = [
    { href: `${home}#about`, label: t("about"), anchor: true },
    { href: `${home}/programs`, label: t("catalog"), anchor: false },
    { href: `${home}#gift`, label: t("certificates"), anchor: true },
    { href: `${home}#salons`, label: t("salons"), anchor: true },
  ];

  const linkCls =
    "relative text-xs font-semibold tracking-[0.1em] whitespace-nowrap uppercase text-white/80 transition-colors hover:text-white after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-brand-gold-300 after:transition-transform hover:after:scale-x-100";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          solid ? "border-b border-brand-gold/20 bg-[#1a0d20]/95 backdrop-blur" : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-4 px-5 sm:h-[78px] sm:gap-6">
          <Link href="/" className="shrink-0" aria-label="Imbir Thai Spa Classic">
            <Image
              src="/brand/logo-white.png"
              alt="imbir — Thai Spa Classic"
              width={2231}
              height={649}
              priority
              className="h-8 w-auto sm:h-11"
            />
          </Link>

          <nav className="ml-auto hidden items-center gap-6 lg:flex">
            {NAV.map((item) =>
              item.anchor ? (
                <a key={item.href} href={item.href} className={linkCls}>
                  {item.label}
                </a>
              ) : (
                <Link key={item.href} href="/programs" className={linkCls}>
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <Link
            href="/create"
            className="bg-gold-gradient ml-auto hidden rounded-full px-5 py-2.5 text-[11px] font-bold whitespace-nowrap text-white shadow-md transition-transform hover:-translate-y-0.5 sm:inline-flex lg:ml-0"
          >
            {t("giftCta")}
          </Link>

          <nav className="flex shrink-0 gap-1.5" aria-label="Язык">
            {routing.locales.map((loc) => (
              <Link
                key={loc}
                href={pathname}
                locale={loc}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tracking-wider transition-colors ${
                  loc === locale
                    ? "bg-gold-gradient border-transparent text-[#1a0d20]"
                    : "border-white/30 text-white/80 hover:border-brand-gold-300 hover:text-white"
                }`}
              >
                {LANG_LABELS[loc]}
              </Link>
            ))}
          </nav>

          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden shrink-0 items-center gap-2 text-sm font-bold whitespace-nowrap text-white tabular-nums transition-colors hover:text-[#4fce5d] md:inline-flex"
          >
            <WhatsAppIcon className="h-5 w-5 text-[#4fce5d]" />
            {WA_DISPLAY}
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Меню"
            aria-expanded={open}
            className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/30 text-white lg:hidden"
          >
            <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
          </button>
        </div>

        {open && (
          <div className="border-t border-white/10 bg-[#1a0d20]/95 px-5 pt-2 pb-5 lg:hidden">
            <nav className="flex flex-col">
              {NAV.map((item) =>
                item.anchor ? (
                  <a
                    key={item.href}
                    href={item.href}
                    className="border-b border-white/10 py-3 text-sm font-semibold tracking-wide text-white/90"
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href="/programs"
                    className="border-b border-white/10 py-3 text-sm font-semibold tracking-wide text-white/90"
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                href="/create"
                className="bg-gold-gradient rounded-full px-5 py-3 text-center text-xs font-bold text-white"
              >
                {t("giftCta")}
              </Link>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 text-sm font-bold text-white"
              >
                <WhatsAppIcon className="h-5 w-5 text-[#4fce5d]" />
                {WA_DISPLAY}
              </a>
            </div>
          </div>
        )}
      </header>

      {!isHome && <div className="h-[68px] sm:h-[78px]" aria-hidden />}
    </>
  );
}
