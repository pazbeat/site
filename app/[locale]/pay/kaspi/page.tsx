import { notFound, redirect } from "next/navigation";
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
  if (!order) notFound();
  // Уже оплачен — ведём к сертификату, а не в 404. Так бывает у каждого, кто
  // вернулся назад или обновил страницу после оплаты: заказ уже не pending,
  // и страница показывала «не найдено» вместо купленного сертификата.
  if (order.status === "paid") {
    redirect(`/${locale}/success?token=${order.successToken}`);
  }
  if (order.status !== "pending") notFound();

  const t = await getTranslations("KaspiPay");

  return (
    <main className="ui-bg flex-1 py-16">
      <div className="mx-auto max-w-md px-5">
        <div className="ui-card p-8 text-center">
          <p className="ui-eyebrow mb-2">
            Kaspi.kz
          </p>
          <h1 className="mb-1 font-display text-2xl font-semibold text-brand-purple">
            {t("title")}
          </h1>
          <p className="ui-sum mb-6 text-4xl">
            {formatKzt(order.amountKzt)}
          </p>
          <KaspiPay orderId={order.id} />
        </div>
      </div>
    </main>
  );
}
