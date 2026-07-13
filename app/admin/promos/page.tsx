import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ToggleActiveButton } from "@/components/admin/toggle-active";
import { PromoForm, type PromoFormValues } from "@/components/admin/promo-form";
import { savePromoAction, togglePromoActiveAction } from "./actions";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import type { PromoLimits } from "@/lib/promo";

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
  const admin = await requireSuperadmin();

  const [promos, usage] = await Promise.all([
    prisma.promo.findMany({ orderBy: { id: "desc" } }),
    prisma.order.groupBy({
      by: ["promoId"],
      where: { status: "paid", promoId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const usedBy = new Map(
    usage.map((u) => [u.promoId, u._count._all] as const),
  );

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
                    {used}
                    {typeof limits.maxUses === "number"
                      ? ` / ${limits.maxUses}`
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    {p.active ? "Активен" : "Скрыт"}
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
