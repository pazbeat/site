"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/** Кнопка демо-оплаты: шлёт подписанный вебхук и уводит на страницу успеха. */
export function MockPayButton({
  orderId,
  amountKzt,
  sig,
  successToken,
}: Readonly<{
  orderId: string;
  amountKzt: number;
  sig: string;
  successToken: string;
}>) {
  const t = useTranslations("MockPay");
  const router = useRouter();
  const [state, setState] = useState<"idle" | "paying" | "error">("idle");

  const pay = async () => {
    setState("paying");
    try {
      const response = await fetch("/api/payments/mock/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, amountKzt, sig }),
      });
      if (!response.ok) {
        setState("error");
        return;
      }
      router.push(`/success?token=${successToken}`);
    } catch {
      setState("error");
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={state === "paying"}
        onClick={pay}
        className="bg-gold-gradient w-full rounded-full px-7 py-4 text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-50"
      >
        {t("pay")}
      </button>
      {state === "error" && (
        <p className="mt-3 text-sm font-semibold text-brand-red">
          {t("error")}
        </p>
      )}
    </div>
  );
}
