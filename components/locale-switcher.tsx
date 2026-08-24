"use client";

import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

const LABELS: Record<string, string> = { ru: "RU", kk: "KK", en: "EN" };

/**
 * Переключатель языка в шапке.
 *
 * Вынесен из шапки отдельным компонентом ради `useSearchParams`: этот хук
 * требует Suspense-границы, иначе сборка статических страниц падает. Строка
 * запроса нужна обязательно — `usePathname` её отбрасывает, а на страницах
 * оплаты и успеха весь адрес живёт именно в ней (`?order=`, `?token=`).
 * Без неё KK/EN уводили покупателя на /pay/kaspi и /success без параметра,
 * то есть в 404 с потерей оплаченного заказа.
 */
export function LocaleSwitcher({ current }: Readonly<{ current: Locale }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());

  return (
    <nav className="flex shrink-0 gap-1.5" aria-label="Язык">
      {routing.locales.map((loc) => (
        <Link
          key={loc}
          href={{ pathname, query }}
          locale={loc}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tracking-wider transition-colors ${
            loc === current
              ? "bg-gold-gradient border-transparent text-[#1c0726]"
              : "border-white/30 text-white/80 hover:border-brand-gold-300 hover:text-white"
          }`}
        >
          {LABELS[loc]}
        </Link>
      ))}
    </nav>
  );
}
