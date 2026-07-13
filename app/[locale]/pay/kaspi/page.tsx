import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { KaspiPay } from "@/components/kaspi-pay";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";

/** Страница оплаты через Kaspi QR (PayQR). Показывает QR/кнопку и опрос статуса. */
export default async function KaspiPayPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ order?: string }>;
}>) {
  const { locale } = await params;
  const { order: orderId } = await searchParams;
  setRequestLocale(locale);
  if (!orderId) notFound();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "pending") notFound();

  const t = await getTranslations("KaspiPay");

  return (
    <main className="flex-1 py-16">
      <div className="mx-auto max-w-md px-5">
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-8 text-center shadow-lg">
          <p className="mb-2 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
            Kaspi.kz
          </p>
          <h1 className="mb-1 font-display text-2xl font-semibold text-brand-purple">
            {t("title")}
          </h1>
          <p className="mb-6 font-display text-4xl text-brand-purple">
            {formatKzt(order.amountKzt)}
          </p>
          <KaspiPay orderId={order.id} />
        </div>
      </div>
    </main>
  );
}
