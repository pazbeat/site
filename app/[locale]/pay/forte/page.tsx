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
    <main className="flex-1 py-16">
      <div className="mx-auto max-w-md px-5">
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-8 text-center shadow-lg">
          <p className="mb-2 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
            ForteBank
          </p>
          <h1 className="mb-1 font-display text-2xl font-semibold text-brand-purple">
            Оплата картой
          </h1>
          <p className="mb-6 font-display text-4xl text-brand-purple">
            {formatKzt(order.amountKzt)}
          </p>
          <FortePay orderId={order.id} ret={ret === "1"} />
        </div>
      </div>
    </main>
  );
}
