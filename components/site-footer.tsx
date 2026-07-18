import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getActiveSalons, getSetting } from "@/lib/data";
import { pickL10n } from "@/lib/l10n";

const WA_DISPLAY = "+7 708 111 8098";
const MAJOR_CITIES = ["Астана", "Алматы"];

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden style={{ color: "#4fce5d" }}>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.5 3.9 1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
    </svg>
  );
}

export async function SiteFooter() {
  const locale = await getLocale();
  const t = await getTranslations("Footer");
  const tNav = await getTranslations("Nav");
  const tLegal = await getTranslations("Legal");
  const salons = await getActiveSalons();
  const contacts = (await getSetting("contacts")) as { phone?: string; email?: string } | null;

  const waHref = `https://wa.me/77081118098?text=${encodeURIComponent(tNav("waGreeting"))}`;
  const home = `/${locale}`;

  const byCity = new Map<string, { name: string; salons: typeof salons }>();
  const order: string[] = [];
  for (const s of salons) {
    if (!byCity.has(s.city)) {
      byCity.set(s.city, { name: pickL10n(s.cityNames, locale) || s.city, salons: [] });
      order.push(s.city);
    }
    byCity.get(s.city)!.salons.push(s);
  }
  const majorCols = MAJOR_CITIES.filter((c) => byCity.has(c)).map((c) => byCity.get(c)!);
  const regionCities = order.filter((c) => !MAJOR_CITIES.includes(c)).map((c) => byCity.get(c)!);

  return (
    <footer className="rd-foot mt-auto">
      <div className="wrap">
        <div className="foot-top">
          <Link href="/" aria-label="Imbir Thai Spa Classic">
            <Image src="/brand/logo-white.png" alt="imbir — Thai Spa Classic" width={2231} height={649} />
          </Link>
          <a className="foot-wa" href={waHref} target="_blank" rel="noopener noreferrer">
            <WaIcon />
            {WA_DISPLAY}
          </a>
        </div>

        <div className="foot-cols">
          {majorCols.map((col) => (
            <div className="foot-col" key={col.name}>
              <b>{col.name}</b>
              {col.salons.map((s) => (
                <a key={s.id} href={`${home}#salons`}>
                  {pickL10n(s.addressNames, locale) || s.address}
                </a>
              ))}
            </div>
          ))}

          {regionCities.length > 0 && (
            <div className="foot-col">
              <b>{t("regions")}</b>
              {regionCities.flatMap((c) =>
                c.salons.map((s) => (
                  <a key={s.id} href={`${home}#salons`}>
                    {c.name}, {pickL10n(s.addressNames, locale) || s.address}
                  </a>
                )),
              )}
            </div>
          )}

          <div className="foot-col">
            <b>{t("contacts")}</b>
            <Link href="/programs">{tNav("catalog")}</Link>
            <Link href="/create">{tNav("giftCta")}</Link>
            <Link href="/check">{tNav("check")}</Link>
            <Link href="/corporate">{t("corporate")}</Link>
            {contacts?.email && <a href={`mailto:${contacts.email}`}>{contacts.email}</a>}
            <a href="https://www.imbir.kz" target="_blank" rel="noopener noreferrer">
              imbir.kz
            </a>
          </div>
        </div>

        <div className="foot-note">
          <span>{t("copyright", { year: new Date().getFullYear() })}</span>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: "18px" }}>
            <Link href="/legal/offer">{tLegal("offer")}</Link>
            <Link href="/legal/privacy">{tLegal("privacy")}</Link>
            <Link href="/legal/rules">{tLegal("rules")}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
