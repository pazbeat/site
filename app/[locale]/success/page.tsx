import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AutoRefresh } from "@/components/auto-refresh";
import { publicOrigin } from "@/lib/site-url";
import { GiftReveal } from "@/components/gift-reveal";
import { prisma } from "@/lib/db";
import { isWalletConfigured } from "@/lib/wallet";
import { isGoogleWalletConfigured } from "@/lib/wallet/google";
import { pickL10n } from "@/lib/l10n";
import { formatDuration, formatKzt } from "@/lib/format";
import { resolveGiftPalette } from "@/lib/gift-palettes";
import { giftOpenedCookieName } from "@/lib/gift-opened";

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
  // Срок печатаем по времени салона, а не браузера (как на карте и в PDF).
  // Цифрами, а не «24 ноября 2026 г.»: словесный формат в русском уже
  // заканчивается точкой, и во фразе получалось две подряд.
  const validUntilLabel = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(certificate.validUntil);
  const title =
    certificate.type === "program" && option
      ? pickL10n(option.program.names, locale)
      : formatKzt(certificate.amountKzt ?? 0);
  // Подарок самому себе: почта получателя не указана или совпала с почтой
  // покупателя. Письмо тогда уходит ОДНО (lib/delivery.ts, giftingSelf), и
  // фраза «и копию вам» на этом экране была бы неправдой — человек получил не
  // копию, а сам сертификат. Условие повторяет delivery.ts дословно.
  const deliveredTo =
    certificate.deliveryMethod === "email"
      ? certificate.deliveryContact
      : order.buyerEmail;
  const giftingSelf =
    deliveredTo.trim().toLowerCase() === order.buyerEmail.trim().toLowerCase();

  const subtitle =
    certificate.type === "program" && option
      ? option.persons
        ? tCommon("guests", { count: option.persons })
        : option.durationMin
          ? formatDuration(option.durationMin, tCommon("hour"))
          : undefined
      : tBuilder("sumTypeNominal");

  const pdfUrl = `/api/certificates/pdf?token=${encodeURIComponent(token)}`;
  // Подарок в этом браузере уже открывали — сервер сразу отдаёт открытый
  // экран, без коробки до гидрации (lib/gift-opened.ts)
  const openedOnServer = (await cookies()).has(giftOpenedCookieName(token));

  return (
    <main className="flex flex-1 flex-col">
      <GiftReveal
        // Цвет коробки закреплён за сертификатом при выпуске; у выпущенных до
        // этого — стабильный по id (lib/gift-palettes.ts)
        palette={resolveGiftPalette(certificate.giftPalette, certificate.id)}
        revealKey={token}
        openedOnServer={openedOnServer}
        toName={certificate.toName}
        fromName={certificate.fromName}
        card={{
          imageUrl: certificate.design.imageUrl,
          label: tCommon("certificate"),
          title,
          subtitle,
          isProgram: certificate.type === "program" && Boolean(option),
          // Блока «показать код» больше нет: номер сертификата — салонный
          // (WM0001) и напечатан прямо на карточке. Прятать его не от кого.
          code: certificate.codeDisplay,
          message: certificate.message ?? undefined,
        }}
        links={{
          pdf: pdfUrl,
          receipt: `/api/certificates/receipt?token=${encodeURIComponent(token)}`,
          // Одна кнопка на обе платформы: маршрут сам смотрит на устройство и
          // уводит в Apple Wallet или в Google Кошелёк. Показываем её, только
          // если хотя бы одна платформа настроена — иначе телефон упрётся в
          // отказ.
          wallet:
            isWalletConfigured() || isGoogleWalletConfigured()
              ? `/api/certificates/wallet?token=${encodeURIComponent(token)}`
              : null,
        }}
        share={{
          pageUrl: `${publicOrigin()}/${locale}/success?token=${encodeURIComponent(token)}`,
          message: t("waMessage", {
            code: certificate.codeDisplay,
            date: validUntilLabel,
          }),
          fileName: t("pdfFileName", { code: certificate.codeDisplay }),
        }}
        validUntil={validUntilLabel}
        deliveryNote={t(giftingSelf ? "subtitleSelf" : "subtitle")}
      />
    </main>
  );
}
