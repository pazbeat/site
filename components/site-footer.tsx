import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getActiveSalons, getSetting } from "@/lib/data";
import { pickL10n } from "@/lib/l10n";

const WA_DISPLAY = "+7 708 111 8098";
const MAJOR_CITIES = ["Астана", "Алматы"]; // остальные города — в колонке «Регионы»

export async function SiteFooter() {
  const locale = await getLocale();
  const t = await getTranslations("Footer");
  const tNav = await getTranslations("Nav");
  const tLegal = await getTranslations("Legal");
  const salons = await getActiveSalons();
  const contacts = (await getSetting("contacts")) as {
    phone?: string;
    email?: string;
  } | null;

  const waHref = `https://wa.me/77081118098?text=${encodeURIComponent(tNav("waGreeting"))}`;

  // Группируем салоны по городу (канонический ключ), витрина — локализованное имя
  const byCity = new Map<string, { name: string; salons: typeof salons }>();
  for (const salon of salons) {
    const key = salon.city;
    if (!byCity.has(key)) {
      byCity.set(key, { name: pickL10n(salon.cityNames, locale) || salon.city, salons: [] });
    }
    byCity.get(key)!.salons.push(salon);
  }

  const majorColumns = MAJOR_CITIES.filter((c) => byCity.has(c)).map((c) => ({
    city: c,
    ...byCity.get(c)!,
  }));
  const regionCities = [...byCity.entries()]
    .filter(([c]) => !MAJOR_CITIES.includes(c))
    .map(([, v]) => v);

  return (
    <footer className="bg-plum-deep mt-auto pt-16 pb-8 text-white/70">
      <div className="mx-auto max-w-6xl px-5">
        {/* Верх: логотип + WhatsApp */}
        <div className="flex flex-col items-start justify-between gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-center">
          <Link href="/" aria-label="Imbir Thai Spa Classic">
            <Image
              src="/brand/logo-white.png"
              alt="imbir — Thai Spa Classic"
              width={2231}
              height={649}
              className="h-12 w-auto"
            />
          </Link>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 text-lg font-bold text-white tabular-nums transition-colors hover:text-[#4fce5d]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-[#4fce5d]" aria-hidden>
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.5 3.9 1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
            </svg>
            {WA_DISPLAY}
          </a>
        </div>

        {/* Колонки: города + связаться */}
        <div className="grid gap-9 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {majorColumns.map((col) => (
            <div key={col.city}>
              <h4 className="mb-3.5 font-display text-lg text-white">{col.name}</h4>
              <ul className="space-y-2 text-sm">
                {col.salons.map((s) => (
                  <li key={s.id}>
                    <Link href="/salons" className="transition-colors hover:text-brand-gold-300">
                      {pickL10n(s.addressNames, locale) || s.address}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {regionCities.length > 0 && (
            <div>
              <h4 className="mb-3.5 font-display text-lg text-white">{t("regions")}</h4>
              <ul className="space-y-2 text-sm">
                {regionCities.map((c) => (
                  <li key={c.name}>
                    <Link href="/salons" className="transition-colors hover:text-brand-gold-300">
                      {c.name}
                      {c.salons.length > 1 ? ` · ${t("salonsCount", { count: c.salons.length })}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="mb-3.5 font-display text-lg text-white">{t("contacts")}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/programs" className="transition-colors hover:text-brand-gold-300">
                  {tNav("catalog")}
                </Link>
              </li>
              <li>
                <Link href="/create" className="transition-colors hover:text-brand-gold-300">
                  {tNav("giftCta")}
                </Link>
              </li>
              <li>
                <Link href="/prices" className="transition-colors hover:text-brand-gold-300">
                  {tNav("prices")}
                </Link>
              </li>
              <li>
                <Link href="/corporate" className="transition-colors hover:text-brand-gold-300">
                  {t("corporate")}
                </Link>
              </li>
              {contacts?.email && (
                <li>
                  <a href={`mailto:${contacts.email}`} className="transition-colors hover:text-brand-gold-300">
                    {contacts.email}
                  </a>
                </li>
              )}
              <li>
                <a
                  href="https://www.imbir.kz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-brand-gold-300"
                >
                  imbir.kz
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Низ: копирайт + правовые ссылки */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/45">
          <span>{t("copyright", { year: new Date().getFullYear() })}</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/legal/offer" className="hover:text-brand-gold-300">
              {tLegal("offer")}
            </Link>
            <Link href="/legal/privacy" className="hover:text-brand-gold-300">
              {tLegal("privacy")}
            </Link>
            <Link href="/legal/rules" className="hover:text-brand-gold-300">
              {tLegal("rules")}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
