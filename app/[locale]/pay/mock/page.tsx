import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MockPayButton } from "@/components/mock-pay-button";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import { mockSignature } from "@/lib/payments/mock";

/** Демо-страница «оплаты» — существует только при PAYMENT_MOCK=1. */
export default async function MockPayPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ order?: string }>;
}>) {
  if (process.env.PAYMENT_MOCK !== "1") notFound();
  const { locale } = await params;
  const { order: orderId } = await searchParams;
  setRequestLocale(locale);
  if (!orderId) notFound();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "pending") notFound();

  const t = await getTranslations("MockPay");

  return (
    <main className="flex-1 py-20">
      <div className="mx-auto max-w-md px-5">
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-8 text-center shadow-lg">
          <p className="mb-2 text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
            {t("demo")}
          </p>
          <h1 className="mb-2 font-display text-2xl font-semibold text-brand-purple">
            {t("title")}
          </h1>
          <p className="mb-6 font-display text-4xl text-brand-purple">
            {formatKzt(order.amountKzt)}
          </p>
          <MockPayButton
            orderId={order.id}
            amountKzt={order.amountKzt}
            sig={mockSignature(order.id, order.amountKzt)}
            successToken={order.successToken}
          />
          <p className="mt-4 text-xs text-brand-purple-950/55">{t("note")}</p>
        </div>
      </div>
    </main>
  );
}
