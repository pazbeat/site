"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";

type Phase = "loading" | "redirecting" | "waiting" | "paid" | "failed" | "error";

/**
 * Клиент оплаты ForteBank. Без `ret` — создаёт заказ Forte и уводит на его
 * hosted-страницу. С `ret` (возврат после оплаты) — опрашивает статус и уводит
 * на страницу успеха либо показывает отказ.
 */
export function FortePay({
  orderId,
  ret,
}: Readonly<{ orderId: string; ret: boolean }>) {
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("loading");
  const started = useRef(false);

  // Ветка «создать заказ и уйти на Forte»
  useEffect(() => {
    if (ret || started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/payments/forte/invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const data = (await res.json()) as { redirectUrl?: string };
        if (!res.ok || !data.redirectUrl) throw new Error("invoice");
        setPhase("redirecting");
        window.location.assign(data.redirectUrl);
      } catch {
        setPhase("error");
      }
    })();
  }, [orderId, ret]);

  // Ветка «вернулись с Forte — опрашиваем статус»
  useEffect(() => {
    if (!ret || started.current) return;
    started.current = true;
    setPhase("waiting");
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/payments/forte/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const data = (await res.json()) as {
          paid?: boolean;
          failed?: boolean;
          successToken?: string;
        };
        if (data.paid && data.successToken) {
          clearInterval(timer);
          setPhase("paid");
          window.location.assign(`/${locale}/success?token=${data.successToken}`);
        } else if (data.failed) {
          clearInterval(timer);
          setPhase("failed");
        }
      } catch {
        // временная сетевая ошибка — продолжаем опрос
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [orderId, ret, locale]);

  if (phase === "error") {
    return (
      <div className="text-center">
        <p className="text-sm font-semibold text-brand-red">
          Не удалось создать оплату. Попробуйте ещё раз.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-full border-[1.5px] border-brand-purple px-6 py-2.5 text-sm font-bold text-brand-purple hover:bg-brand-purple-50"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <p className="py-6 text-center text-sm font-semibold text-brand-red">
        Оплата не прошла. Попробуйте другой способ или повторите позже.
      </p>
    );
  }

  const text =
    phase === "waiting"
      ? "Проверяем оплату…"
      : phase === "paid"
        ? "Оплата получена, переходим к сертификату…"
        : "Готовим безопасную страницу оплаты…";

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-brand-purple-950/70">
      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-brand-gold" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
