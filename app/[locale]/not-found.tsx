"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Страница 404. Клиентский компонент — берёт переводы из
 * NextIntlClientProvider родительского [locale]/layout (not-found.tsx
 * не получает params, поэтому серверный getTranslations здесь не завести).
 */
export default function NotFound() {
  const t = useTranslations("NotFound");
  const tNav = useTranslations("Nav");

  return (
    <main className="bg-page-hero grid min-h-[100svh] place-items-center px-6 py-32 text-center text-white">
      <div>
        <Image
          src="/brand/icon-gold.png"
          alt=""
          width={343}
          height={408}
          aria-hidden
          className="mx-auto mb-2 h-16 w-auto opacity-90"
        />
        <div className="bg-gold-gradient bg-clip-text font-display text-[clamp(120px,24vw,240px)] leading-none text-transparent">
          404
        </div>
        <h1 className="mt-2 font-display text-3xl font-medium sm:text-4xl">{t("title")}</h1>
        <p className="mx-auto mt-4 max-w-md text-white/75">{t("text")}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/"
            className="bg-gold-gradient rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            {tNav("home")}
          </Link>
          <Link
            href="/create"
            className="rounded-full border border-white/40 px-8 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            {tNav("giftCta")}
          </Link>
        </div>
      </div>
    </main>
  );
}
