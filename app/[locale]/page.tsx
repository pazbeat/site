import type { Metadata } from "next";
import { headers } from "next/headers";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { CertPreview } from "@/components/cert-preview";
import { ProgramCard } from "@/components/program-card";
import {
  getActiveNominals,
  getActivePrograms,
  getCustomAmountBounds,
} from "@/lib/data";
import { toProgramDto } from "@/lib/dto";
import { formatKzt } from "@/lib/format";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  return {
    title: { absolute: t("metaTitle") },
    description: t("subtitle"),
    alternates: localeAlternates(locale, ""),
  };
}

export default async function HomePage({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tCommon = await getTranslations("Common");
  const [programs, allNominals, bounds] = await Promise.all([
    getActivePrograms(),
    getActiveNominals(),
    getCustomAmountBounds(),
  ]);
  // Служебные мелкие номиналы (тестовый 100 ₸) на витрину не выносим —
  // в конструкторе они остаются доступны
  const nominals = allNominals.filter((n) => n.amountKzt >= bounds.min);
  const popular = programs
    .filter((p) => p.popular)
    .slice(0, 6)
    .map((p) => toProgramDto(p, locale));

  const steps = [1, 2, 3, 4].map((n) => ({
    title: t(`how${n}Title` as "how1Title"),
    text: t(`how${n}Text` as "how1Text"),
  }));
  const faq = [1, 2, 3, 4, 5].map((n) => ({
    q: t(`faqQ${n}` as "faqQ1"),
    a: t(`faqA${n}` as "faqA1"),
  }));

  // FAQPage-разметка — расширенный сниппет в выдаче Google/Yandex
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* HERO */}
      <section className="bg-brand-gradient text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-5 text-xs font-bold tracking-[0.25em] text-brand-gold-300 uppercase">
              {t("eyebrow")}
            </p>
            <h1 className="max-w-3xl font-display text-4xl leading-tight font-semibold sm:text-6xl">
              {t.rich("title", {
                em: (chunks) => (
                  <em className="text-brand-gold-300 italic">{chunks}</em>
                ),
              })}
            </h1>
            <p className="mt-6 max-w-xl text-white/85">{t("subtitle")}</p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/create"
                className="bg-gold-gradient rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              >
                {t("ctaCreate")}
              </Link>
              <Link
                href="/programs"
                className="rounded-full border border-white/40 bg-white/10 px-8 py-4 text-sm font-bold transition-colors hover:bg-white/20"
              >
                {t("ctaCatalog")}
              </Link>
            </div>
            <dl className="mt-12 flex flex-wrap gap-10">
              {(
                [
                  ["7", t("statSalons")],
                  ["4", t("statCities")],
                  ["10+", t("statYears")],
                  [t("statMinutesValue"), t("statMinutes")],
                ] as const
              ).map(([value, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd className="font-display text-3xl text-brand-gold-300">
                    {value}
                  </dd>
                  <dd className="text-xs text-white/65">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mx-auto w-full max-w-md -rotate-2">
            <CertPreview
              bgStyle={{
                kind: "gradient",
                from: "#3D2049",
                to: "#64367A",
                angle: 135,
              }}
              textColor="#FFFFFF"
              giftLabel={tCommon("certificate")}
              title={t("certSampleTitle")}
              subtitle={t("certSampleSub")}
              forLabel={t("certSampleFor")}
              code="IMB-2407-A9F3"
            />
          </div>
        </div>
      </section>

      {/* КАК ЭТО РАБОТАЕТ */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto mb-11 max-w-xl text-center">
            <p className="mb-3 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
              {t("howEyebrow")}
            </p>
            <h2 className="font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
              {t("howTitle")}
            </h2>
          </div>
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-2xl border border-brand-purple-100 bg-white p-6 text-center transition-shadow hover:shadow-lg"
              >
                <span className="bg-brand-gradient mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl font-display text-xl text-white">
                  {index + 1}
                </span>
                <b className="mb-1.5 block">{step.title}</b>
                <span className="text-sm text-brand-purple-950/65">
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* НОМИНАЛЫ */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto mb-11 max-w-xl text-center">
            <p className="mb-3 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
              {t("nomEyebrow")}
            </p>
            <h2 className="font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
              {t("nomTitle")}
            </h2>
            <p className="mt-3 text-brand-purple-950/65">{t("nomSubtitle")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {nominals.map((nominal) => (
              <Link
                key={nominal.id}
                href={`/create?nominal=${nominal.id}`}
                className="relative rounded-2xl border border-brand-purple-100 bg-white p-6 text-center transition-all hover:-translate-y-0.5 hover:border-brand-gold hover:shadow-lg"
              >
                {nominal.label && (
                  <span className="bg-gold-gradient absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-extrabold tracking-wider text-white uppercase">
                    {nominal.label}
                  </span>
                )}
                <span className="font-display text-2xl text-brand-purple">
                  {formatKzt(nominal.amountKzt)}
                </span>
                <span className="mt-1 block text-xs text-brand-purple-950/60">
                  {t("nomLabel")}
                </span>
              </Link>
            ))}
            <Link
              href="/create?type=nominal"
              className="rounded-2xl border border-brand-purple-100 bg-white p-5 text-center transition-all hover:-translate-y-0.5 hover:border-brand-gold hover:shadow-lg sm:col-span-2 lg:col-span-4"
            >
              <span className="font-display text-xl text-brand-purple">
                ✨ {t("nomCustom")}
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ПОПУЛЯРНЫЕ ПРОГРАММЫ */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto mb-11 max-w-xl text-center">
            <p className="mb-3 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
              {t("popEyebrow")}
            </p>
            <h2 className="font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
              {t("popTitle")}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((program) => (
              <ProgramCard key={program.id} program={program} />
            ))}
          </div>
          <div className="mt-9 text-center">
            <Link
              href="/programs"
              className="inline-block rounded-full border-[1.5px] border-brand-purple px-8 py-3.5 text-sm font-bold text-brand-purple transition-colors hover:bg-brand-purple hover:text-white"
            >
              {t("popAll")}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-3xl px-5">
          <div className="mx-auto mb-11 max-w-xl text-center">
            <p className="mb-3 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
              FAQ
            </p>
            <h2 className="font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
              {t("faqTitle")}
            </h2>
          </div>
          <div className="space-y-3">
            {faq.map(({ q, a }) => (
              <details
                key={q}
                className="group rounded-2xl border border-brand-purple-100 bg-white"
              >
                <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-bold marker:content-none">
                  {q}
                  <span
                    aria-hidden
                    className="text-xl text-brand-gold transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-4 text-sm text-brand-purple-950/70">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
