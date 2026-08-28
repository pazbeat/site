import { requireCatalogEditor } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ToggleActiveButton } from "@/components/admin/toggle-active";
import { PromoForm, type PromoFormValues } from "@/components/admin/promo-form";
import { savePromoAction, togglePromoActiveAction } from "./actions";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import { promoState, type PromoLimits, type PromoState } from "@/lib/promo";
// Именно next/link, а не Link из @/i18n/navigation: админка живёт вне
// сегмента [locale], контекста локали там нет, и ссылка next-intl роняет
// страницу целиком (поймано на боевом сервере 2026-08-28).
import Link from "next/link";

const STATE_LABEL: Record<PromoState, string> = {
  active: "Активен",
  exhausted: "Исчерпан",
  expired: "Истёк",
  not_started: "Ещё не начался",
  hidden: "Скрыт",
};

const STATE_STYLE: Record<PromoState, string> = {
  active: "bg-green-50 text-green-800",
  exhausted: "bg-brand-purple-50 text-brand-purple-950",
  expired: "bg-brand-purple-50 text-brand-purple-950",
  not_started: "bg-brand-gold-100/60 text-brand-gold-700",
  hidden: "bg-brand-purple-50 text-brand-purple-950/60",
};

function limitsSummary(limits: PromoLimits): string {
  const parts: string[] = [];
  if (typeof limits.maxUses === "number") parts.push(`лимит ${limits.maxUses}`);
  if (typeof limits.minAmountKzt === "number") {
    parts.push(`от ${formatKzt(limits.minAmountKzt)}`);
  }
  if (limits.validFrom) parts.push(`с ${limits.validFrom.slice(0, 10)}`);
  if (limits.validUntil) parts.push(`по ${limits.validUntil.slice(0, 10)}`);
  return parts.length ? parts.join(" · ") : "—";
}

export default async function AdminPromosPage() {
  const admin = await requireCatalogEditor();

  const [promos, usage, orders] = await Promise.all([
    prisma.promo.findMany({ orderBy: { id: "desc" } }),
    prisma.order.groupBy({
      by: ["promoId"],
      where: { status: "paid", promoId: { not: null } },
      _count: { _all: true },
    }),
    // Заказы, где код применяли: менеджеру нужно видеть не только «сколько»,
    // но и «кто» — иначе спорную скидку не отследить. Берём и неоплаченные:
    // в лимит они не идут, но показывают, что кодом пытались воспользоваться.
    prisma.order.findMany({
      where: { promoId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        promoId: true,
        status: true,
        amountKzt: true,
        createdAt: true,
        buyerEmail: true,
        certificates: { select: { serial: true } },
      },
    }),
  ]);
  const usedBy = new Map(
    usage.map((u) => [u.promoId, u._count._all] as const),
  );
  const ordersBy = new Map<number, typeof orders>();
  for (const order of orders) {
    const list = ordersBy.get(order.promoId!) ?? [];
    list.push(order);
    ordersBy.set(order.promoId!, list);
  }
  const now = new Date();

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Промокоды">
      <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-brand-purple">
          Новый промокод
        </h2>
        <PromoForm action={savePromoAction} submitLabel="Создать промокод" />
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Код</th>
              <th className="px-4 py-3 font-semibold">Скидка</th>
              <th className="px-4 py-3 font-semibold">Ограничения</th>
              <th className="px-4 py-3 font-semibold">Использований</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => {
              const limits = (p.limits ?? {}) as PromoLimits;
              const used = usedBy.get(p.id) ?? 0;
              const state = promoState(
                { active: p.active, limits },
                used,
                now,
              );
              const promoOrders = ordersBy.get(p.id) ?? [];
              const initial: PromoFormValues = {
                id: p.id,
                code: p.code,
                kind: p.kind,
                value: p.value,
                maxUses: limits.maxUses ?? undefined,
                minAmountKzt: limits.minAmountKzt ?? undefined,
                validFrom: limits.validFrom?.slice(0, 10),
                validUntil: limits.validUntil?.slice(0, 10),
              };
              return (
                <tr
                  key={p.id}
                  className="border-b border-brand-purple-100/60 align-top last:border-0"
                >
                  <td className="px-4 py-3 font-bold text-brand-purple">
                    {p.code}
                  </td>
                  <td className="px-4 py-3">
                    {p.kind === "percent"
                      ? `${p.value}%`
                      : formatKzt(p.value)}
                  </td>
                  <td className="px-4 py-3 text-brand-purple-950/70">
                    {limitsSummary(limits)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold">
                      {used}
                      {typeof limits.maxUses === "number"
                        ? ` / ${limits.maxUses}`
                        : ""}
                    </span>
                    {promoOrders.length > 0 && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs font-semibold text-brand-purple hover:underline">
                          Заказы ({promoOrders.length})
                        </summary>
                        <ul className="mt-2 space-y-1.5 text-xs">
                          {promoOrders.map((o) => (
                            <li key={o.id}>
                              <Link
                                href={`/admin/orders/${o.id}`}
                                className="font-semibold text-brand-purple hover:underline"
                              >
                                {o.certificates[0]?.serial ?? o.id.slice(-8)}
                              </Link>{" "}
                              <span className="text-brand-purple-950/60">
                                {o.createdAt.toISOString().slice(0, 10)} ·{" "}
                                {formatKzt(o.amountKzt)} ·{" "}
                                {o.status === "paid" ? "оплачен" : o.status}
                              </span>
                              <br />
                              <span className="text-brand-purple-950/45">
                                {o.buyerEmail}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLE[state]}`}
                    >
                      {STATE_LABEL[state]}
                    </span>
                    {state === "exhausted" && (
                      <p className="mt-1.5 text-xs text-brand-purple-950/55">
                        Лимит выбран — покупателям больше не применяется.
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-2">
                      <ToggleActiveButton
                        id={p.id}
                        active={p.active}
                        action={togglePromoActiveAction}
                      />
                      <details className="w-full">
                        <summary className="cursor-pointer text-right text-xs font-semibold text-brand-purple hover:underline">
                          Изменить
                        </summary>
                        <div className="mt-3 rounded-xl border border-brand-purple-100 bg-brand-purple-50/40 p-4">
                          <PromoForm
                            action={savePromoAction}
                            initial={initial}
                            submitLabel="Сохранить"
                          />
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              );
            })}
            {promos.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-brand-purple-950/50"
                >
                  Промокодов пока нет.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminChrome>
  );
}
