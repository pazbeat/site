"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

/**
 * «Открытие подарка» на странице сертификата. Получатель видит закрытую
 * фирменную «упаковку» с именами → по нажатию она сменяется сертификатом с
 * мягкой анимацией раскрытия. Уважает prefers-reduced-motion (показывает сразу)
 * и не переигрывает при перезагрузке (флаг в sessionStorage по токену).
 *
 * Контент (сертификат) — children, рендерится сервером и раскрывается здесь.
 */
export function GiftReveal({
  toName,
  fromName,
  revealKey,
  children,
}: Readonly<{
  toName: string;
  fromName: string;
  revealKey: string;
  children: ReactNode;
}>) {
  const t = useTranslations("Gift");
  const [opened, setOpened] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const key = `imbir-gift-opened:${revealKey}`;
    let already = false;
    try {
      already = sessionStorage.getItem(key) === "1";
    } catch {
      // приватный режим — просто покажем анимацию
    }
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (already || reduced) setOpened(true);
  }, [revealKey]);

  const open = () => {
    setOpened(true);
    try {
      sessionStorage.setItem(`imbir-gift-opened:${revealKey}`, "1");
    } catch {
      // не критично
    }
  };

  // До гидрации и в открытом состоянии — показываем сертификат (краулеру и
  // при отключённом JS подарок сразу виден).
  if (!mounted || opened) {
    return <div className={mounted ? "gift-revealed" : undefined}>{children}</div>;
  }

  return (
    <div className="mx-auto max-w-md">
      <button
        type="button"
        onClick={open}
        aria-label={t("open")}
        className="gift-box group relative block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-purple to-brand-purple-950 px-8 py-14 text-center text-white shadow-2xl"
      >
        {/* Золотые ленты крест-накрест */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-1/2 w-9 -translate-x-1/2 bg-gradient-to-b from-brand-gold-300/70 via-brand-gold/50 to-brand-gold-300/70"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 bg-gradient-to-r from-brand-gold-300/70 via-brand-gold/50 to-brand-gold-300/70"
        />

        <div className="relative">
          <span className="bg-gold-gradient mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full shadow-lg">
            <Image
              src="/brand/icon-gold.png"
              alt=""
              width={64}
              height={64}
              className="h-9 w-9 object-contain brightness-0 invert"
            />
          </span>
          <p className="text-[11px] font-semibold tracking-[0.28em] text-brand-gold-300 uppercase">
            {t("eyebrow")}
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
            {t("forName", { name: toName })}
          </h2>
          {fromName && (
            <p className="mt-1.5 font-display text-lg text-white/80 italic">
              {t("fromName", { name: fromName })}
            </p>
          )}
          <span className="bg-gold-gradient gift-cta mt-8 inline-block rounded-full px-8 py-3.5 text-sm font-bold text-brand-purple-950 shadow-md">
            {t("open")}
          </span>
          <p className="mt-3 text-xs text-white/55">{t("openHint")}</p>
        </div>
      </button>
    </div>
  );
}
