import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AutoRefresh } from "@/components/auto-refresh";
import { CertPreview } from "@/components/cert-preview";
import { ClaimCode } from "@/components/claim-code";
import { GiftReveal } from "@/components/gift-reveal";
import { prisma } from "@/lib/db";
import { pickL10n } from "@/lib/l10n";
import { formatDuration, formatKzt } from "@/lib/format";
import type { DesignBgStyle } from "@/lib/types";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Success" });
  return { title: t("title"), robots: { index: false } };
}

export default async function SuccessPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string }>;
}>) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  if (!token) notFound();

  const t = await getTranslations("Success");
  const tCommon = await getTranslations("Common");
  const tBuilder = await getTranslations("Builder");

  const order = await prisma.order.findUnique({
    where: { successToken: token },
    include: {
      certificates: {
        include: {
          design: true,
          programOption: { include: { program: true } },
        },
      },
    },
  });
  if (!order || order.status === "expired" || order.status === "cancelled") {
    notFound();
  }

  // Оплата ещё не подтверждена вебхуком — ждём и обновляемся
  if (order.status === "pending" || order.certificates.length === 0) {
    return (
      <main className="flex-1 py-20">
        <AutoRefresh seconds={3} />
        <div className="mx-auto max-w-md px-5 text-center">
          <div className="bg-brand-gradient mx-auto mb-6 h-16 w-16 animate-pulse rounded-full" />
          <h1 className="mb-3 font-display text-3xl font-semibold text-brand-purple">
            {t("waitingTitle")}
          </h1>
          <p className="text-sm text-brand-purple-950/65">{t("waitingText")}</p>
        </div>
      </main>
    );
  }

  const certificate = order.certificates[0];
  const option = certificate.programOption;
  const title =
    certificate.type === "program" && option
      ? pickL10n(option.program.names, locale)
      : formatKzt(certificate.amountKzt ?? 0);
  const subtitle =
    certificate.type === "program" && option
      ? option.persons
        ? tCommon("guests", { count: option.persons })
        : option.durationMin
          ? formatDuration(option.durationMin, tCommon("hour"))
          : undefined
      : tBuilder("sumTypeNominal");

  return (
    <main className="flex-1 py-14 sm:py-18">
      <div className="mx-auto max-w-xl px-5 text-center">
        <GiftReveal
          toName={certificate.toName}
          fromName={certificate.fromName}
          revealKey={token}
        >
          <div className="bg-brand-gradient mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow-xl">
            ✓
          </div>
          <h1 className="mb-3 font-display text-3xl font-semibold text-brand-purple sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mb-8 text-sm text-brand-purple-950/65">{t("subtitle")}</p>

          <div className="mx-auto mb-8 max-w-md text-left">
            <CertPreview
              imageUrl={certificate.design.imageUrl}
              bgStyle={certificate.design.bgStyle as DesignBgStyle}
              textColor={certificate.design.textColor}
              giftLabel={tCommon("certificate")}
              title={title}
              subtitle={subtitle}
              forLabel={tBuilder("certFor", { name: certificate.toName })}
              message={certificate.message ?? undefined}
              code={certificate.codeDisplay}
            />
          </div>

          <ClaimCode token={token} />

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a
              href={`/api/certificates/pdf?token=${encodeURIComponent(token)}`}
              className="inline-block rounded-full bg-brand-purple px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600"
            >
              {t("downloadPdf")}
            </a>
            <Link
              href="/create"
              className="inline-block rounded-full border-[1.5px] border-brand-purple px-7 py-3 text-sm font-bold text-brand-purple transition-colors hover:bg-brand-purple hover:text-white"
            >
              {t("createMore")}
            </Link>
          </div>
        </GiftReveal>
      </div>
    </main>
  );
}
