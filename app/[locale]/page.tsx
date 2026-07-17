import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale, getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { HeroShowcase, type HeroSlide } from "@/components/home/hero-showcase";
import {
  AtmosphereStrip,
  type AtmoClip,
} from "@/components/home/atmosphere-strip";
import { GuestInfoAccordion } from "@/components/home/guest-info-accordion";
import { RevealInit } from "@/components/home/reveal-init";
import { getActivePrograms, getActiveSalons } from "@/lib/data";
import { toProgramDto, toSalonDto } from "@/lib/dto";
import { getGuestInfo } from "@/lib/guest-info";
import { salonWhatsAppLink, gisLink } from "@/lib/salon-contacts";
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

export default async function HomePage({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tNav = await getTranslations("Nav");
  const tSalons = await getTranslations("Salons");
  const [programsRaw, salonsRaw] = await Promise.all([
    getActivePrograms(),
    getActiveSalons(),
  ]);
  const guest = getGuestInfo(locale);

  const programs = programsRaw.map((p) => toProgramDto(p, locale));
  const popular = programs.filter((p) => p.popular).slice(0, 8);
  const stripPrograms = (popular.length ? popular : programs).slice(0, 8);

  const salons = salonsRaw.map((s) => ({
    ...toSalonDto(s, locale),
    codePrefix: s.codePrefix,
  }));
  const cityCount = new Set(salons.map((s) => s.cityKey)).size;
  const salonCount = salons.length;
  const programCount = programs.length;

  const em = (chunks: React.ReactNode) => (
    <em className="text-brand-gold-300 italic">{chunks}</em>
  );
  const emDark = (chunks: React.ReactNode) => (
    <em className="text-brand-gold-700 italic">{chunks}</em>
  );

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
  ].map(([file, caption]) => ({
    src: `/videos/${file}.mp4`,
    poster: `/videos/posters/${file}.webp`,
    caption,
  }));

  // Бегущая строка цен (дублируем список для бесшовной прокрутки)
  const ticker = stripPrograms.map((p) => ({
    name: p.name,
    price: formatKzt(Math.min(...p.options.map((o) => o.priceKzt))),
  }));

  return (
    <main className="flex-1">
      {/* HERO */}
      <HeroShowcase slides={slides} soundOnLabel={t("soundOn")} soundOffLabel={t("soundOff")}>
        <p className="reveal in mb-5 text-xs font-semibold tracking-[0.28em] text-brand-gold-300 uppercase">
          {t("heroEyebrow")}
        </p>
        <h1 className="font-display text-5xl leading-[1.05] font-medium sm:text-6xl">
          {t.rich("heroTitle", { em })}
        </h1>
        <p className="mt-6 max-w-md text-base text-white/80">{t("heroLead")}</p>
        <div className="mt-9 flex flex-wrap gap-4">
          <Link
            href="/create"
            className="bg-gold-gradient rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            {tNav("giftCta")}
          </Link>
          <Link
            href="/programs"
            className="rounded-full border border-white/40 px-8 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            {t("heroCtaPrograms")}
          </Link>
        </div>
        <dl className="mt-12 flex flex-wrap gap-10">
          {(
            [
              [salonCount, t("statSalons")],
              [cityCount, t("statCitiesShort")],
              [programCount, t("statProgramsShort")],
            ] as const
          ).map(([value, label]) => (
            <div key={label}>
              <dt className="font-display text-3xl text-brand-gold-300">{value}</dt>
              <dd className="text-xs text-white/60">{label}</dd>
            </div>
          ))}
        </dl>
      </HeroShowcase>

      {/* ТИКЕР ЦЕН */}
      <div className="ticker-mask overflow-hidden border-y border-brand-purple-100 bg-brand-purple-50 py-4">
        <div className="ticker-track flex w-max gap-10">
          {[...ticker, ...ticker].map((item, i) => (
            <span key={i} className="flex shrink-0 items-center gap-3 text-sm">
              <span className="font-display text-lg text-brand-purple">{item.name}</span>
              <b className="font-semibold text-brand-gold-700">
                {t("tickerFrom")} {item.price}
              </b>
            </span>
          ))}
        </div>
      </div>

      {/* О САЛОНЕ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1.35fr_0.85fr]">
          <div className="reveal">
            <p className="mb-4 text-xs font-semibold tracking-[0.28em] text-brand-gold uppercase">
              <span className="mr-3 inline-block h-px w-10 -translate-y-1 bg-brand-gold align-middle" />
              {t("aboutEyebrow")}
            </p>
            <p className="font-display text-3xl leading-snug text-brand-purple sm:text-[2.2rem]">
              {t.rich("aboutStatement", { em: emDark })}
            </p>
            <p className="mt-6 max-w-xl text-brand-purple-950/70">{t("aboutNote")}</p>
            <dl className="mt-9 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {(
                [
                  [salonCount, t("statSalons")],
                  [cityCount, t("statCitiesShort")],
                  [programCount, t("statProgramsShort")],
                  ["180", t("aboutStatMinutes")],
                ] as const
              ).map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-4xl text-brand-purple">{value}</dt>
                  <dd className="mt-1 text-xs text-brand-purple-950/60">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <figure className="reveal m-0 grid grid-cols-2 gap-4">
            <Image
              src="/programs/blazhenstvo.webp"
              alt=""
              width={420}
              height={520}
              className="col-span-2 h-64 w-full rounded-2xl object-cover"
            />
            <Image
              src="/programs/probuzhdenie.webp"
              alt=""
              width={260}
              height={260}
              className="h-32 w-full rounded-2xl object-cover"
            />
            <Image
              src="/programs/sabai-sabai.webp"
              alt=""
              width={260}
              height={260}
              className="h-32 w-full rounded-2xl object-cover"
            />
          </figure>
        </div>
      </section>

      {/* АТМОСФЕРА */}
      <section className="pb-20 sm:pb-28">
        <div className="reveal mx-auto max-w-6xl px-5">
          <AtmosphereStrip
            eyebrow={t("atmoEyebrow")}
            title={t.rich("atmoTitle", { em: emDark })}
            clips={atmoClips}
          />
        </div>
      </section>

      {/* ПРОГРАММЫ */}
      <section className="bg-brand-purple-50 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="reveal mb-12 max-w-xl">
            <p className="mb-3 text-xs font-semibold tracking-[0.28em] text-brand-gold uppercase">
              <span className="mr-3 inline-block h-px w-10 -translate-y-1 bg-brand-gold align-middle" />
              {t("popEyebrow")}
            </p>
            <h2 className="font-display text-3xl font-medium text-brand-purple sm:text-4xl">
              {t("popTitle")}
            </h2>
          </div>
          <div className="no-scrollbar grid snap-x snap-mandatory auto-cols-[minmax(280px,340px)] grid-flow-col gap-6 overflow-x-auto pb-2">
            {stripPrograms.map((p) => {
              const minPrice = Math.min(...p.options.map((o) => o.priceKzt));
              const firstOption = p.options[0]?.id;
              return (
                <Link
                  key={p.id}
                  href={firstOption ? `/create?option=${firstOption}` : "/programs"}
                  className="group relative aspect-[4/5] snap-start overflow-hidden rounded-lg border border-transparent transition-all hover:border-brand-gold/60 hover:shadow-2xl"
                >
                  {p.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- фото программ могут быть внешними (imbir.kz)
                    <img
                      src={p.photoUrl}
                      alt={p.name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a0d20]/85 via-[#1a0d20]/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <h3 className="font-display text-2xl">{p.name}</h3>
                    <p className="mt-1 max-h-0 overflow-hidden text-sm text-white/75 opacity-0 transition-all duration-500 group-hover:max-h-24 group-hover:opacity-100">
                      {p.description}
                    </p>
                    <span className="mt-2 inline-block font-semibold text-brand-gold-300">
                      {t("tickerFrom")} {formatKzt(minPrice)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/programs"
              className="inline-block rounded-full border-[1.5px] border-brand-purple px-8 py-3.5 text-sm font-bold text-brand-purple transition-colors hover:bg-brand-purple hover:text-white"
            >
              {t("popAll")}
            </Link>
          </div>
        </div>
      </section>

      {/* ПОДАРОЧНЫЕ СЕРТИФИКАТЫ */}
      <section className="bg-plum-deep py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="reveal">
            <p className="mb-4 text-xs font-semibold tracking-[0.28em] text-brand-gold-300 uppercase">
              {t("giftEyebrow")}
            </p>
            <h2 className="font-display text-4xl font-medium sm:text-5xl">
              {t.rich("giftTitle", { em })}
            </h2>
            <p className="mt-5 max-w-lg text-white/75">{t("giftLead")}</p>
            <ul className="mt-7 space-y-3">
              {[t("giftBenefit1"), t("giftBenefit2"), t("giftBenefit3")].map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-white/85">
                  <span className="mt-0.5 text-brand-gold-300">◆</span>
                  {b}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-brand-gold-300">{t("giftNominals")}</p>
            <div className="mt-8">
              <Link
                href="/create"
                className="bg-gold-gradient inline-block rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              >
                {tNav("giftCta")}
              </Link>
            </div>
          </div>
          <div className="reveal">
            <Image
              src="/programs/ty-i-ya.webp"
              alt=""
              width={520}
              height={620}
              className="h-full max-h-[460px] w-full rounded-2xl border border-brand-gold/30 object-cover"
            />
          </div>
        </div>
      </section>

      {/* ГДЕ НАС НАЙТИ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="reveal mb-12 max-w-xl">
            <p className="mb-3 text-xs font-semibold tracking-[0.28em] text-brand-gold uppercase">
              <span className="mr-3 inline-block h-px w-10 -translate-y-1 bg-brand-gold align-middle" />
              {t("salonsEyebrow")}
            </p>
            <h2 className="font-display text-3xl font-medium text-brand-purple sm:text-4xl">
              {t("salonsTitle")}
            </h2>
            <p className="mt-3 text-brand-purple-950/65">{t("salonsLead")}</p>
          </div>
          <div className="reveal grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {salons.map((s) => (
              <article
                key={s.id}
                className="flex flex-col rounded-2xl border border-brand-purple-100 bg-white p-5 transition-shadow hover:shadow-lg"
              >
                <p className="text-xs font-semibold tracking-wider text-brand-gold-700 uppercase">
                  {s.city}
                </p>
                <h3 className="mt-1 font-display text-lg text-brand-purple">{s.name}</h3>
                <p className="mt-1 flex-1 text-sm text-brand-purple-950/70">{s.address}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={salonWhatsAppLink(s.codePrefix, tNav("waGreeting"))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-purple-50 px-3.5 py-2 text-xs font-semibold text-brand-purple transition-colors hover:bg-brand-purple hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-[#25b24a]" aria-hidden>
                      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.5 3.9 1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
                    </svg>
                    WhatsApp
                  </a>
                  <a
                    href={gisLink(s.city, s.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-brand-purple-100 px-3.5 py-2 text-xs font-semibold text-brand-gold-700 transition-colors hover:border-brand-gold"
                  >
                    {tSalons("map")} ↗
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ИНФОРМАЦИЯ ДЛЯ ГОСТЕЙ */}
      <section className="border-t border-brand-purple-100 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-[0.85fr_1.35fr]">
          <div className="reveal lg:sticky lg:top-28 lg:self-start">
            <p className="mb-4 text-xs font-semibold tracking-[0.28em] text-brand-gold uppercase">
              <span className="mr-3 inline-block h-px w-10 -translate-y-1 bg-brand-gold align-middle" />
              {t("aboutEyebrow")}
            </p>
            <h2 className="font-display text-3xl font-medium text-brand-purple sm:text-4xl">
              {guest.heading}
            </h2>
            <p className="mt-5 max-w-sm text-sm text-brand-purple-950/65">{guest.sub}</p>
          </div>
          <div className="reveal">
            <GuestInfoAccordion sections={guest.sections} />
          </div>
        </div>
      </section>

      {/* ФИНАЛЬНЫЙ БАННЕР */}
      <section className="bg-plum-deep relative overflow-hidden py-24 text-center text-white">
        <Image
          src="/brand/icon-gold.png"
          alt=""
          width={343}
          height={408}
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 h-64 w-auto -translate-x-1/2 opacity-[0.06]"
        />
        <div className="relative mx-auto max-w-3xl px-5">
          <p className="mb-4 text-xs font-semibold tracking-[0.28em] text-brand-gold-300 uppercase">
            {t("ctaFinalEyebrow")}
          </p>
          <h2 className="font-display text-4xl font-medium sm:text-5xl">
            {t.rich("ctaFinalTitle", { em })}
          </h2>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <Link
              href="/create"
              className="bg-gold-gradient rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            >
              {tNav("giftCta")}
            </Link>
            <Link
              href="/programs"
              className="rounded-full border border-white/40 px-8 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              {t("heroCtaPrograms")}
            </Link>
          </div>
        </div>
      </section>

      <RevealInit />
    </main>
  );
}
