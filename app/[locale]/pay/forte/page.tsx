import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { FortePay } from "@/components/forte-pay";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";

/** Страница оплаты через ForteBank: создаёт заказ, редиректит на hosted-страницу. */
export default async function FortePayPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ order?: string; ret?: string }>;
}>) {
  const { locale } = await params;
  const { order: orderId, ret } = await searchParams;
  setRequestLocale(locale);
  if (!orderId) notFound();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  // На возврате заказ уже может быть оплачен — не 404-им.
  if (!order) notFound();

  return (
    <main className="ui-bg flex-1 py-16">
      <div className="mx-auto max-w-md px-5">
        <div className="ui-card p-8 text-center">
          <p className="ui-eyebrow mb-2">
            ForteBank
          </p>
          <h1 className="mb-1 font-display text-2xl font-semibold text-brand-purple">
            Оплата картой
          </h1>
          <p className="ui-sum mb-6 text-4xl">
            {formatKzt(order.amountKzt)}
          </p>
          <FortePay orderId={order.id} ret={ret === "1"} />
        </div>
      </div>
    </main>
  );
}
