"use client";

import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const LABELS: Record<string, string> = { ru: "RU", kk: "KK", en: "EN" };

export function LocaleSwitcher({
  current,
  locales,
}: Readonly<{ current: Locale; locales: readonly Locale[] }>) {
  const pathname = usePathname();

  return (
    <div className="flex gap-0.5 rounded-full border border-brand-purple-100 bg-white p-1">
      {locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
            locale === current
              ? "bg-brand-gold text-white"
              : "text-brand-purple-600 hover:bg-brand-purple-50"
          }`}
        >
          {LABELS[locale]}
        </Link>
      ))}
    </div>
  );
}
