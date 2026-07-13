import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ToggleActiveButton } from "@/components/admin/toggle-active";
import { InlineCreateForm } from "@/components/admin/inline-create";
import { saveNominalAction, toggleNominalActiveAction } from "./actions";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";

export default async function AdminNominalsPage() {
  const admin = await requireSuperadmin();
  const nominals = await prisma.nominal.findMany({ orderBy: { sort: "asc" } });

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Номиналы">
      <InlineCreateForm
        action={saveNominalAction}
        fields={[
          { name: "amountKzt", type: "number", placeholder: "Сумма, ₸", required: true },
          { name: "label", type: "text", placeholder: "Метка (напр. Хит)" },
        ]}
        submitLabel="Добавить номинал"
      />

      <div className="mt-5 overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Сумма</th>
              <th className="px-4 py-3 font-semibold">Метка</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {nominals.map((n) => (
              <tr
                key={n.id}
                className="border-b border-brand-purple-100/60 last:border-0"
              >
                <td className="px-4 py-3 font-medium">{formatKzt(n.amountKzt)}</td>
                <td className="px-4 py-3">{n.label ?? "—"}</td>
                <td className="px-4 py-3">
                  {n.active ? "Активен" : "Скрыт"}
                </td>
                <td className="px-4 py-3 text-right">
                  <ToggleActiveButton
                    id={n.id}
                    active={n.active}
                    action={toggleNominalActiveAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminChrome>
  );
}
