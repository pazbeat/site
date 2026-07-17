import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { HeroShowcase, type HeroSlide } from "@/components/home/hero-showcase";
import { AtmosphereStrip, type AtmoClip } from "@/components/home/atmosphere-strip";
import { ProgramsStrip, type StripProgram } from "@/components/home/programs-strip";
import { GuestInfoAccordion } from "@/components/home/guest-info-accordion";
import { getActivePrograms, getActiveSalons } from "@/lib/data";
import { toProgramDto, toSalonDto } from "@/lib/dto";
import { getGuestInfo } from "@/lib/guest-info";
import { salonWhatsAppLink, salonWhatsAppDisplay, gisLink } from "@/lib/salon-contacts";
import { formatKzt } from "@/lib/format";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  return {
    title: { absolute: t("metaTitle") },
    description: t("heroLead"),
    alternates: localeAlternates(locale, ""),
  };
}

function WaIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.5 3.9 1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
    </svg>
  );
}

export default async function HomePage({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tNav = await getTranslations("Nav");
  const tCommon = await getTranslations("Common");
  const [programsRaw, salonsRaw] = await Promise.all([getActivePrograms(), getActiveSalons()]);
  const guest = getGuestInfo(locale);

  const programs = programsRaw.map((p) => toProgramDto(p, locale));
  const popular = programs.filter((p) => p.popular);
  const stripSource = (popular.length ? popular : programs).slice(0, 8);
  const salons = salonsRaw.map((s) => ({ ...toSalonDto(s, locale), codePrefix: s.codePrefix }));

  const cityCount = new Set(salons.map((s) => s.cityKey)).size;
  const salonCount = salons.length;
  const programCount = programs.length;

  const em = (chunks: React.ReactNode) => <em>{chunks}</em>;

  const durHint = (opts: (typeof programs)[number]["options"]): string => {
    const d = opts.map((o) => o.durationMin).filter((x): x is number => !!x);
    const p = opts.map((o) => o.persons).filter((x): x is number => !!x);
    if (d.length) {
      const lo = Math.min(...d);
      const hi = Math.max(...d);
      return `${lo === hi ? lo : `${lo}–${hi}`} ${tCommon("min")}`;
    }
    if (p.length) return tCommon("guests", { count: Math.max(...p) });
    return "";
  };

  const slides: HeroSlide[] = [
    { src: "/videos/welcome.mp4", poster: "/videos/posters/welcome.webp", label: t("slide1"), sound: true },
    { src: "/videos/garden.mp4", poster: "/videos/posters/garden.webp", label: t("slide2") },
    { src: "/videos/reception.mp4", poster: "/videos/posters/reception.webp", label: t("slide3") },
    { src: "/videos/petals.mp4", poster: "/videos/posters/petals.webp", label: t("slide4") },
    { src: "/videos/hammam.mp4", poster: "/videos/posters/hammam.webp", label: t("slide5"), objectPosition: "center 35%" },
    { src: "/videos/lounge.mp4", poster: "/videos/posters/lounge.webp", label: t("slide6"), objectPosition: "center 60%" },
  ];

  const atmoClips: AtmoClip[] = [
    ["atmo-massage", t("atmoCap1")],
    ["atmo-rooms", t("atmoCap2")],
    ["atmo-hammam", t("atmoCap3")],
    ["atmo-sauna", t("atmoCap4")],
    ["atmo-lounge", t("atmoCap5")],
    ["atmo-details", t("atmoCap6")],
    ["atmo-candle", t("atmoCap7")],
    ["atmo-tea", t("atmoCap8")],
    ["atmo-locker", t("atmoCap9")],
    ["atmo-towel", t("atmoCap10")],
  ].map(([file, caption]) => ({ src: `/videos/${file}.mp4`, poster: `/videos/posters/${file}.webp`, caption }));

  const stripPrograms: StripProgram[] = stripSource.map((p) => {
    const minPrice = p.options.length ? Math.min(...p.options.map((o) => o.priceKzt)) : 0;
    return {
      id: p.id,
      href: p.options[0] ? `/create?option=${p.options[0].id}` : "/programs",
      name: p.name,
      desc: p.description,
      dur: durHint(p.options),
      price: t("tickerFrom") + " " + formatKzt(minPrice),
      photoUrl: p.photoUrl,
    };
  });

  const ticker = stripSource.map((p) => ({
    name: p.name,
    price: formatKzt(Math.min(...p.options.map((o) => o.priceKzt))),
  }));

  // Салоны, сгруппированные по городу (порядок — по первому вхождению)
  const cityOrder: string[] = [];
  const byCity = new Map<string, { name: string; items: typeof salons }>();
  for (const s of salons) {
    if (!byCity.has(s.cityKey)) {
      byCity.set(s.cityKey, { name: s.city, items: [] });
      cityOrder.push(s.cityKey);
    }
    byCity.get(s.cityKey)!.items.push(s);
  }

  return (
    <main className="rd flex-1">
      {/* HERO */}
      <HeroShowcase slides={slides} soundOnLabel={t("soundOn")} soundOffLabel={t("soundOff")}>
        <p className="eyebrow">{t("heroEyebrow")}</p>
        <h1>{t.rich("heroTitle", { em })}</h1>
        <p className="lead">{t("heroLead")}</p>
        <div className="hero-cta">
          <Link className="btn btn-gold" href="/create">
            {tNav("giftCta")}
          </Link>
          <Link className="btn btn-line" href="/programs">
            {t("heroCtaPrograms")}
          </Link>
        </div>
        <div className="hero-stats">
          <div>
            <b>{salonCount}</b>
            {t("statSalons")}
          </div>
          <div>
            <b>{cityCount}</b>
            {t("statCitiesShort")}
          </div>
          <div>
            <b>{programCount}</b>
            {t("statProgramsShort")}
          </div>
        </div>
      </HeroShowcase>

      {/* ТИКЕР ЦЕН */}
      <div className="ticker-mask overflow-hidden border-y border-brand-purple-100 bg-brand-purple-50 py-4">
        <div className="ticker-track flex w-max gap-10">
          {[...ticker, ...ticker].map((item, i) => (
            <span key={i} className="flex shrink-0 items-center gap-3 text-sm whitespace-nowrap">
              <span className="font-display text-lg text-brand-purple">{item.name}</span>
              <b className="font-semibold text-brand-gold-700">
                {t("tickerFrom")} {item.price}
              </b>
            </span>
          ))}
        </div>
      </div>

      {/* О НАС */}
      <section className="section" id="about">
        <div className="wrap about-grid">
          <div className="about-text">
            <p className="eyebrow">{t("aboutEyebrow")}</p>
            <p className="statement">{t.rich("aboutStatement", { em })}</p>
            <p className="about-note">{t("aboutNote")}</p>
            <div className="stats">
              <div className="stat">
                <b>{salonCount}</b>
                <span>{t("statSalons")}</span>
              </div>
              <div className="stat">
                <b>{cityCount}</b>
                <span>{t("statCitiesShort")}</span>
              </div>
              <div className="stat">
                <b>{programCount}</b>
                <span>{t("statProgramsShort")}</span>
              </div>
              <div className="stat">
                <b>180</b>
                <span>{t("aboutStatMinutes")}</span>
              </div>
            </div>
          </div>
          <figure className="collage">
            {/* eslint-disable @next/next/no-img-element */}
            <div className="collage-main">
              <img src="/programs/blazhenstvo.webp" alt="" />
            </div>
            <div className="collage-small">
              <img src="/programs/probuzhdenie.webp" alt="" />
            </div>
            {/* eslint-enable @next/next/no-img-element */}
          </figure>
        </div>
      </section>

      {/* АТМОСФЕРА */}
      <section className="section atmo" id="atmo">
        <div className="wrap">
          <AtmosphereStrip eyebrow={t("atmoEyebrow")} title={t.rich("atmoTitle", { em })} clips={atmoClips} />
        </div>
      </section>

      {/* ПРОГРАММЫ */}
      <section className="section tint" id="programs">
        <div className="wrap">
          <ProgramsStrip
            eyebrow={t("popEyebrow")}
            title={t("popTitle")}
            allLabel={t("popAll")}
            programs={stripPrograms}
          />
        </div>
      </section>

      {/* СЕРТИФИКАТЫ */}
      <section className="section dark" id="gift">
        <div className="wrap gift-grid">
          <div>
            <p className="eyebrow">{t("giftEyebrow")}</p>
            <h2>{t.rich("giftTitle", { em })}</h2>
            <p style={{ marginTop: "20px", maxWidth: "46ch", color: "var(--paper)" }}>{t("giftLead")}</p>
            <ul className="gift-list">
              <li>{t("giftBenefit1")}</li>
              <li>{t("giftBenefit2")}</li>
              <li>{t("giftBenefit3")}</li>
            </ul>
            <p className="gift-nominals">{t("giftNominals")}</p>
            <div className="hero-cta" style={{ marginTop: "18px" }}>
              <Link className="btn btn-gold" href="/create">
                {tNav("giftCta")}
              </Link>
            </div>
          </div>
          <figure className="gift-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/programs/ty-i-ya.webp" alt="" />
          </figure>
        </div>
      </section>

      {/* ГДЕ НАС НАЙТИ */}
      <section className="section" id="salons">
        <div className="wrap">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t("salonsEyebrow")}</p>
              <h2>{t("salonsTitle")}</h2>
            </div>
          </div>
          <div className="salons-table">
            {cityOrder.map((key) => {
              const city = byCity.get(key)!;
              return (
                <div className="salon-row" key={key}>
                  <span className="salon-city">{city.name}</span>
                  <div className="salon-addr">
                    {city.items.map((s) => (
                      <span className="addr-line" key={s.id}>
                        {s.address}
                        <span className="addr-actions">
                          <a
                            className="salon-wa"
                            href={salonWhatsAppLink(s.codePrefix, tNav("waGreeting"))}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <WaIcon />
                            {salonWhatsAppDisplay(s.codePrefix)}
                          </a>
                          <a
                            className="gis-btn"
                            href={gisLink(s.city, s.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            2ГИС ↗
                          </a>
                        </span>
                      </span>
                    ))}
                  </div>
                  <span className="salon-count">
                    {city.items.length}{" "}
                    {locale === "en" ? "salon" : locale === "kk" ? "салон" : "салон"}
                    {locale === "ru" && city.items.length > 1 ? "а" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ПЕРЕД ВИЗИТОМ */}
      <section className="section" id="guests">
        <div className="wrap guest-grid">
          <div className="guest-side">
            <p className="eyebrow">{t("guestEyebrow")}</p>
            <h2>{guest.heading}</h2>
            <p className="note">{guest.sub}</p>
          </div>
          <GuestInfoAccordion sections={guest.sections} />
        </div>
      </section>

      {/* ФИНАЛЬНЫЙ БАННЕР */}
      <section className="dark cta-final">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="watermark" src="/brand/icon-gold.png" alt="" aria-hidden />
        <div className="wrap">
          <p className="eyebrow" style={{ justifyContent: "center" }}>
            {t("ctaFinalEyebrow")}
          </p>
          <h2>{t.rich("ctaFinalTitle", { em })}</h2>
          <div className="hero-cta">
            <Link className="btn btn-gold" href="/create">
              {tNav("giftCta")}
            </Link>
            <Link className="btn btn-line" href="/programs">
              {t("heroCtaPrograms")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
