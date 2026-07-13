"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type Phase = "loading" | "ready" | "paid" | "error";

/**
 * Клиент Kaspi-оплаты: создаёт инвойс, показывает QR (десктоп) и кнопку
 * «Открыть Kaspi» (мобайл), опрашивает статус и уводит на страницу успеха.
 */
export function KaspiPay({ orderId }: Readonly<{ orderId: string }>) {
  const t = useTranslations("KaspiPay");
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const startedPolling = useRef(false);

  // 1. Создаём инвойс
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/payments/kaspi/invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const data = (await res.json()) as {
          twocode?: string;
          qrDataUrl?: string;
        };
        if (!res.ok || !data.twocode) throw new Error("invoice");
        if (cancelled) return;
        setLink(data.twocode);
        setQr(data.qrDataUrl ?? null);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // 2. Опрашиваем статус, пока инвойс готов
  useEffect(() => {
    if (phase !== "ready" || startedPolling.current) return;
    startedPolling.current = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/payments/kaspi/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const data = (await res.json()) as {
          paid?: boolean;
          successToken?: string;
        };
        if (data.paid && data.successToken) {
          clearInterval(timer);
          setPhase("paid");
          window.location.assign(
            `/${locale}/success?token=${data.successToken}`,
          );
        }
      } catch {
        // временная сетевая ошибка — продолжаем опрос
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [phase, orderId, locale]);

  if (phase === "error") {
    return (
      <div className="text-center">
        <p className="text-sm font-semibold text-brand-red">{t("error")}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-full border-[1.5px] border-brand-purple px-6 py-2.5 text-sm font-bold text-brand-purple hover:bg-brand-purple-50"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    return <p className="py-8 text-center text-brand-purple-950/60">{t("loading")}</p>;
  }

  return (
    <div className="text-center">
      {qr && (
        // data-URL QR: next/image здесь не даёт выгоды
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt="Kaspi QR"
          width={240}
          height={240}
          className="mx-auto rounded-2xl border border-brand-purple-100 p-2"
        />
      )}
      <p className="mt-4 text-sm text-brand-purple-950/70">{t("scan")}</p>
      {link && (
        <a
          href={link}
          className="mt-5 inline-block rounded-full bg-brand-red px-7 py-3 text-sm font-extrabold text-white hover:opacity-90"
        >
          {t("openApp")}
        </a>
      )}
      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-brand-purple-950/55">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-gold" />
        {phase === "paid" ? t("paid") : t("waiting")}
      </div>
    </div>
  );
}
