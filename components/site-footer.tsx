import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getActiveSalons, getSetting } from "@/lib/data";
import { pickL10n } from "@/lib/l10n";

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

  const byCity = new Map<string, number>();
  for (const salon of salons) {
    const city = pickL10n(salon.cityNames, locale) || salon.city;
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
  }

  return (
    <footer className="mt-auto bg-brand-purple pt-14 pb-8 text-white/80">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-10 grid gap-9 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h4 className="mb-3.5 font-display text-lg text-white">
              IMBIR · Thai Spa
            </h4>
            <p className="max-w-xs text-sm">{t("about")}</p>
          </div>
          <div>
            <h4 className="mb-3.5 font-display text-lg text-white">
              {t("cities")}
            </h4>
            <ul className="space-y-2 text-sm">
              {[...byCity.entries()].map(([city, count]) => (
                <li key={city}>
                  {city}
                  {count > 1 ? ` · ${t("salonsCount", { count })}` : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-3.5 font-display text-lg text-white">
              {t("sections")}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/programs" className="hover:text-brand-gold-300">
                  {tNav("catalog")}
                </Link>
              </li>
              <li>
                <Link href="/create" className="hover:text-brand-gold-300">
                  {tNav("create")}
                </Link>
              </li>
              <li>
                <Link href="/check" className="hover:text-brand-gold-300">
                  {tNav("check")}
                </Link>
              </li>
              <li>
                <Link href="/corporate" className="hover:text-brand-gold-300">
                  {t("corporate")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3.5 font-display text-lg text-white">
              {t("contacts")}
            </h4>
            <ul className="space-y-2 text-sm">
              {contacts?.phone && (
                <li>
                  <a
                    href={`tel:${contacts.phone.replace(/\s/g, "")}`}
                    className="hover:text-brand-gold-300"
                  >
                    {contacts.phone}
                  </a>
                </li>
              )}
              {contacts?.email && (
                <li>
                  <a
                    href={`mailto:${contacts.email}`}
                    className="hover:text-brand-gold-300"
                  >
                    {contacts.email}
                  </a>
                </li>
              )}
              <li>
                <a
                  href="https://www.imbir.kz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand-gold-300"
                >
                  imbir.kz
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-white/50">
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
