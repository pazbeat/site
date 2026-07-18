"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

const LEGAL_TYPES = ["offer", "privacy", "rules"] as const;

/**
 * Обязательная consent-модалка (PRD §5.2). Требует прокрутить текст до конца,
 * только тогда активируется чекбокс с полной формулировкой согласия; «Принимаю»
 * доступна лишь с отмеченным чекбоксом. Показывается и при создании сертификата,
 * и на шаге оплаты. HTML-уведомление приходит из БД санитизированным.
 */
export function ConsentModal({
  html,
  onAccept,
  onDecline,
}: Readonly<{
  html: string;
  onAccept: () => void;
  /** По умолчанию — уход на главную (жёсткий отказ на входе в конструктор). */
  onDecline?: () => void;
}>) {
  const t = useTranslations("Consent");
  const tLegal = useTranslations("Legal");
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Если контент помещается без прокрутки — сразу разрешаем чекбокс.
  // Проверяем и при ресайзе/повороте экрана: на мобиле высота вьюпорта
  // меняется (адресная строка), и то, что не влезало, может влезть.
  useEffect(() => {
    const check = () => {
      const el = scrollRef.current;
      if (el && el.scrollHeight <= el.clientHeight + 4) setScrolledToEnd(true);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Блокируем прокрутку фона, пока открыта модалка: на iOS Safari тач-скролл
  // вложенного блока внутри fixed-оверлея иначе «утекает» на страницу позади,
  // и текст согласия не прокручивается (чекбокс не разблокировать).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledToEnd(true);
    }
  };

  const decline = onDecline ?? (() => router.push("/"));

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-purple-950/70 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-2xl border border-brand-gold/40 bg-white p-6 shadow-2xl sm:p-8">
        <h2 className="mb-3 font-display text-2xl font-semibold text-brand-purple">
          {t("title")}
        </h2>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ WebkitOverflowScrolling: "touch" }}
          className="min-h-0 max-h-64 flex-1 touch-pan-y overflow-y-auto overscroll-contain rounded-xl border border-brand-purple-100 bg-brand-purple-50/30 p-4 text-sm text-brand-purple-950"
        >
          {html ? (
            <div
              className="prose prose-sm mb-4 max-w-none"
              // Санитизировано на сервере (sanitize-html, allowlist) — PRD §9.2
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="mb-4 whitespace-pre-line">{t("notice")}</p>
          )}
          <p className="mb-2 font-semibold">{t("readDocs")}</p>
          <ul className="mb-2 space-y-1.5">
            {LEGAL_TYPES.map((type) => (
              <li key={type}>
                <Link
                  href={`/legal/${type}`}
                  target="_blank"
                  className="font-semibold text-brand-purple underline underline-offset-2 hover:text-brand-gold"
                >
                  {tLegal(type)} ↗
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {!scrolledToEnd && (
          <p className="mt-3 text-center text-xs font-semibold text-brand-gold">
            {t("scrollHint")}
          </p>
        )}

        <label
          className={`mt-4 mb-5 flex items-start gap-3 text-sm ${
            scrolledToEnd
              ? "cursor-pointer"
              : "cursor-not-allowed opacity-50"
          }`}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={!scrolledToEnd}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-purple"
          />
          <span>{t("checkbox")}</span>
        </label>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={decline}
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
