"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

/**
 * «Открытие подарка» на странице сертификата. Получатель видит закрытую
 * фирменную коробку с лентами и именами → по нажатию крышка слетает, из
 * коробки бьёт золотое свечение с искрами, и снизу поднимается сертификат.
 *
 * Уважает prefers-reduced-motion (раскрывает мгновенно, без хореографии),
 * не переигрывает при перезагрузке (флаг в sessionStorage по токену).
 * Контент (сертификат) — children, рендерится сервером.
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
  const [phase, setPhase] = useState<"closed" | "opening" | "open">("closed");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (sessionStorage.getItem(`imbir-gift-opened:${revealKey}`) === "1") {
        setPhase("open");
      }
    } catch {
      // приватный режим — просто покажем упаковку
    }
  }, [revealKey]);

  const open = () => {
    if (phase !== "closed") return;
    try {
      sessionStorage.setItem(`imbir-gift-opened:${revealKey}`, "1");
    } catch {
      // не критично
    }
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      setPhase("open");
      return;
    }
    setPhase("opening");
    // Длительность хореографии крышки/искр до появления сертификата
    window.setTimeout(() => setPhase("open"), 640);
  };

  // До гидрации (SSR/no-JS) — сразу сертификат, чтобы контент был доступен.
  if (!mounted) return <div>{children}</div>;
  if (phase === "open") return <div className="gift-cert-in">{children}</div>;

  return (
    <div className="gift-stage">
      <button
        type="button"
        onClick={open}
        aria-label={t("open")}
        className={`gift-open-btn${phase === "opening" ? " is-opening" : ""}`}
      >
        <span className="gift-eyebrow">{t("eyebrow")}</span>

        <div className="gift3d" aria-hidden>
          <span className="gift-glow" />
          <span className="spark s1" />
          <span className="spark s2" />
          <span className="spark s3" />
          <span className="spark s4" />
          <span className="spark s5" />
          <span className="spark s6" />

          <div className="gift3d-body">
            <span className="gift-rib-v" />
            <span className="gift-rib-h" />
            <span className="gift-seal">
              <Image
                src="/brand/icon-gold.png"
                alt=""
                width={40}
                height={40}
                className="h-6 w-6 object-contain brightness-0 invert"
              />
            </span>
            <span className="gift-shine" />
          </div>

          <div className="gift3d-lid">
            <span className="gift-lid-rib" />
          </div>
        </div>

        <div className="gift-names">
          <span className="gift-for">{t("forName", { name: toName })}</span>
          {fromName && (
            <span className="gift-from">{t("fromName", { name: fromName })}</span>
          )}
        </div>

        <span className="gift-cta-pill">{t("open")}</span>
        <span className="gift-hint">{t("openHint")}</span>
      </button>
    </div>
  );
}
