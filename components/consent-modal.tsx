"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/**
 * Обязательная consent-модалка (PRD §5.2): нельзя закрыть кликом мимо,
 * «Принимаю» активна только с отмеченным чекбоксом, «Отказаться» — на главную.
 * HTML приходит из БД уже санитизированным на сервере.
 */
export function ConsentModal({
  html,
  onAccept,
}: Readonly<{ html: string; onAccept: () => void }>) {
  const t = useTranslations("Consent");
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-purple-950/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-2xl border border-brand-gold/40 bg-white p-6 shadow-2xl sm:p-8">
        <div
          className="prose prose-sm mb-5 max-w-none text-brand-purple-950"
          // Санитизировано на сервере (sanitize-html, allowlist) — PRD §9.2
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <label className="mb-6 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-purple"
          />
          <span>{t("checkbox")}</span>
        </label>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-full border-[1.5px] border-brand-purple-100 px-6 py-3 text-sm font-bold text-brand-purple-800 transition-colors hover:border-brand-red hover:text-brand-red"
          >
            {t("decline")}
          </button>
          <button
            type="button"
            disabled={!checked}
            onClick={onAccept}
            className="rounded-full bg-brand-purple px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
